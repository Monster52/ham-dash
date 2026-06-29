import { XMLParser } from 'fast-xml-parser'
import https from 'https'

let hamqslTimer  = null
let ionoTimer    = null
let noaaTimer    = null
let sunTimer     = null
let dataCallback = null

let cachedIonoResult = null  // { fof2, mufd, stationCode, stationName, distKm, ageMin, cs, score, adjusted, fetchedAt }
let cachedNoaaResult = null  // { kp, sfi, fetchedAt }
let lastHamQSLData   = null  // { sfi, aindex, kindex, xray, sunspots, bands, updated }
let sunData          = null  // sunrise-sunset.org results object

const HOME_LAT    =  30.3958
const HOME_LON    = -89.1250
const KC2G_URL    = 'https://prop.kc2g.com/api/stations.json'
const NOAA_ALERT  = 'https://services.swpc.noaa.gov/products/noaa-geophysical-alert.json'
const NOAA_KP     = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'
const SUNRISE_URL = `https://api.sunrise-sunset.org/json?lat=${HOME_LAT}&lng=${HOME_LON}&formatted=0`

const BAND_NAME_MAP = {
  '80m-40m': ['80m', '40m'],
  '30m-20m': ['20m'],
  '17m-15m': ['17m', '15m'],
  '12m-10m': ['12m', '10m'],
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const toRad = x => x * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return Math.round(R * 2 * Math.asin(Math.sqrt(a)))
}

async function fetchKC2GStations() {
  try {
    const { body, status } = await httpGet(KC2G_URL)
    if (status !== 200) {
      console.error('[propagation] KC2G HTTP', status)
      return
    }

    const stations = JSON.parse(body)
    const now = Date.now()

    // Iterate every station — accept both latitude/longitude and lat/lon field names.
    // Filter first across the full list, then sort survivors by distance.
    const candidates = []
    for (const s of stations) {
      const rawLat = s.station?.latitude ?? s.station?.lat
      const rawLon = s.station?.longitude ?? s.station?.lon
      if (rawLat == null || rawLon == null) continue

      const lat    = parseFloat(rawLat)
      const lon    = parseFloat(rawLon) > 180 ? parseFloat(rawLon) - 360 : parseFloat(rawLon)
      if (isNaN(lat) || isNaN(lon)) continue

      const distKm = haversineKm(HOME_LAT, HOME_LON, lat, lon)
      const ageMin = s.time ? (now - new Date(s.time).getTime()) / 60000 : Infinity

      if (
        s.mufd != null &&
        s.fof2 != null &&
        s.cs != null && s.cs > 0 &&
        ageMin >= 0 && ageMin <= 90 &&
        distKm <= 3000
      ) {
        candidates.push({ s, lat, lon, distKm, ageMin })
      }
    }
    candidates.sort((a, b) => a.distKm - b.distKm)

    console.log(`[propagation] KC2G: ${candidates.length} candidate(s) passed filters (mufd≠null, cs>0, age≤90min, dist≤3000km)`)

    if (candidates.length > 0) {
      console.log('[propagation] KC2G top candidates (filtered, closest first):')
      for (const { s, distKm, ageMin } of candidates.slice(0, 8)) {
        const code = s.station.ursiCode || s.station.name?.split(/[\s,]/)[0] || '?'
        console.log(
          `  ${code.padEnd(6)} ${String(s.station.name || '').padEnd(24)}` +
          ` dist=${Math.round(distKm)}km` +
          ` age=${Math.round(ageMin)}min` +
          ` cs=${s.cs}` +
          ` fof2=${s.fof2}` +
          ` mufd=${s.mufd}`
        )
      }
    } else {
      console.log('[propagation] KC2G: no station passed filters')
      cachedIonoResult = null
      return
    }

    // Pick the closest passing candidate.
    const { s: best, distKm, ageMin } = candidates[0]
    const ageMinRounded = Math.round(ageMin)
    const stationCode   = best.station.ursiCode
      || best.station.name?.split(/[\s,]/)[0]
      || 'IONO'

    cachedIonoResult = {
      fof2:        best.fof2,
      mufd:        best.mufd,
      stationCode,
      stationName: best.station.name || stationCode,
      distKm:      Math.round(distKm),
      ageMin:      ageMinRounded,
      cs:          best.cs,
      fetchedAt:   now,
    }

    console.log(
      `[propagation] KC2G: selected ${stationCode}` +
      ` (${best.station.name}, ${Math.round(distKm)}km,` +
      ` age=${ageMinRounded}min, cs=${best.cs},` +
      ` fof2=${best.fof2}, mufd=${best.mufd})`
    )
  } catch (e) {
    console.error('[propagation] KC2G fetch failed:', e.message)
  }
}

async function fetchNoaaData() {
  try {
    const [alertRes, kpRes] = await Promise.allSettled([
      httpGet(NOAA_ALERT),
      httpGet(NOAA_KP),
    ])

    let sfi = null
    if (alertRes.status === 'fulfilled' && alertRes.value.status === 200) {
      const m = alertRes.value.body.match(/[Ss]olar\s+[Ff]lux\s+(\d+)/)
      if (m) sfi = parseInt(m[1], 10)
    }

    let kp = null
    if (kpRes.status === 'fulfilled' && kpRes.value.status === 200) {
      const arr = JSON.parse(kpRes.value.body)
      for (let i = arr.length - 1; i >= 0; i--) {
        const entry = arr[i]
        if (typeof entry === 'object' && entry !== null && typeof entry.Kp === 'number') {
          kp = entry.Kp
          break
        }
      }
    }

    if (sfi == null && lastHamQSLData?.sfi != null) {
      sfi = parseFloat(lastHamQSLData.sfi) || null
    }

    if (kp != null || sfi != null) {
      cachedNoaaResult = { kp, sfi, fetchedAt: Date.now() }
      console.log(`[propagation] NOAA: Kp=${kp}, SFI=${sfi}`)
    }
  } catch (e) {
    console.error('[propagation] NOAA fetch failed:', e.message)
  }
}

async function fetchSunriseSunset() {
  try {
    const { body, status } = await httpGet(SUNRISE_URL)
    if (status !== 200) {
      console.error('[propagation] sunrise-sunset HTTP', status)
      return
    }
    const json = JSON.parse(body)
    if (json.status !== 'OK' || !json.results) {
      console.error('[propagation] sunrise-sunset bad response:', json.status)
      return
    }
    sunData = json.results
    const r = sunData
    console.log('[propagation] sunrise data:', {
      civil_dawn: new Date(r.civil_twilight_begin).toISOString(),
      sunrise:    new Date(r.sunrise).toISOString(),
      solar_noon: new Date(r.solar_noon).toISOString(),
      sunset:     new Date(r.sunset).toISOString(),
      civil_dusk: new Date(r.civil_twilight_end).toISOString(),
    })
  } catch (e) {
    console.error('[propagation] sunrise-sunset fetch failed:', e.message)
  }
}

function scheduleSunriseFetch() {
  if (sunTimer) { clearTimeout(sunTimer); sunTimer = null }
  const now = new Date()
  const nextMidnight = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1
  ))
  const msUntilMidnight = nextMidnight.getTime() - now.getTime()
  sunTimer = setTimeout(async () => {
    await fetchSunriseSunset()
    sunTimer = setInterval(fetchSunriseSunset, 24 * 60 * 60 * 1000)
  }, msUntilMidnight)
}

function emitUpdate() {
  if (!lastHamQSLData) return null

  const { sfi, aindex, kindex, xray, sunspots, bands, updated } = lastHamQSLData

  const kp       = cachedNoaaResult?.kp ?? parseFloat(kindex)
  const kpSource = cachedNoaaResult?.kp != null ? 'live' : '3h'

  return {
    sfi, aindex, kindex,
    kp,
    kpSource,
    xray, sunspots, bands,
    sunTimes: sunData ? {
      sunrise:   sunData.sunrise,
      solarNoon: sunData.solar_noon,
      sunset:    sunData.sunset,
    } : null,
    updated,
  }
}

async function fetchHamQSL() {
  try {
    console.log('[propagation] fetching HamQSL XML...')
    const { body: xml, status } = await httpGet('https://www.hamqsl.com/solarxml.php')
    console.log('[propagation] HTTP', status, '— raw response (first 500 chars):', xml.slice(0, 500))

    if (status !== 200) {
      console.error('[propagation] HamQSL HTTP', status)
      return
    }
    if (!xml.includes('<solar>')) {
      console.error('[propagation] response is not HamQSL XML')
      return
    }

    const parsed = parseXml(xml)
    if (parsed) {
      lastHamQSLData = parsed
      console.log('[propagation] HamQSL OK — SFI:', parsed.sfi, 'K:', parsed.kindex)
    }
  } catch (e) {
    console.error('[propagation] HamQSL fetch error:', e.message)
  }
}

export function getCachedIonoResult() { return cachedIonoResult }
export function getCachedSunData()    { return sunData }

export function startPropagationTimer(onData) {
  dataCallback = onData
  scheduleSunriseFetch()

  hamqslTimer = setInterval(async () => {
    await fetchHamQSL()
    const result = emitUpdate()
    if (result) dataCallback?.(result)
  }, 60 * 60 * 1000)

  ionoTimer = setInterval(async () => {
    await fetchKC2GStations()
    const result = emitUpdate()
    if (result) dataCallback?.(result)
  }, 15 * 60 * 1000)

  noaaTimer = setInterval(async () => {
    await fetchNoaaData()
    const result = emitUpdate()
    if (result) dataCallback?.(result)
  }, 10 * 60 * 1000)
}

export function stopPropagationTimer() {
  if (hamqslTimer) { clearInterval(hamqslTimer); hamqslTimer = null }
  if (ionoTimer)   { clearInterval(ionoTimer);   ionoTimer   = null }
  if (noaaTimer)   { clearInterval(noaaTimer);   noaaTimer   = null }
  if (sunTimer)    { clearTimeout(sunTimer);      sunTimer    = null }
}

export async function fetchPropagation() {
  await Promise.allSettled([fetchHamQSL(), fetchKC2GStations(), fetchNoaaData(), fetchSunriseSunset()])
  console.log('[propagation] init complete:', {
    hamqsl:    lastHamQSLData ? 'ok' : 'failed',
    noaa:      cachedNoaaResult ? 'ok Kp=' + cachedNoaaResult.kp : 'failed',
    ionosonde: cachedIonoResult ? 'ok ' + cachedIonoResult.stationCode : 'no valid stations',
  })
  return emitUpdate() ?? { error: 'No data available', updated: new Date().toISOString() }
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode, body }))
      res.on('error', reject)
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')))
  })
}

function parseXml(xml) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const result = parser.parse(xml)

  const solardata = result?.['solar']?.['solardata']
  if (!solardata) return null

  const conditions = solardata['calculatedconditions']?.['band'] || []
  const bandArray  = Array.isArray(conditions) ? conditions : [conditions]

  const bandMap = {}
  for (const band of bandArray) {
    if (!band || !band['@_name']) continue
    const xmlName = band['@_name']
    const time    = band['@_time']
    const cond    = band['#text']
    const uiKeys  = BAND_NAME_MAP[xmlName] || [xmlName]
    for (const key of uiKeys) {
      if (!bandMap[key]) bandMap[key] = {}
      bandMap[key][time] = cond
    }
  }

  return {
    sfi:      solardata['solarflux'],
    aindex:   solardata['aindex'],
    kindex:   solardata['kindex'],
    xray:     solardata['xray'],
    sunspots: solardata['sunspots'],
    bands:    bandMap,
    updated:  new Date().toISOString(),
  }
}
