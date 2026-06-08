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

const HOME_LAT    =  30.35
const HOME_LON    = -89.15
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

function scoreStation(s, distKm, now) {
  if (!s.cs || s.cs <= 0) return -1
  if (!s.time) return -1
  const ageMs  = now - new Date(s.time).getTime()
  const ageMin = ageMs / 60000
  if (ageMin >= 720 || ageMin < 0) return -1

  const ageFactor  = 1 - (ageMin / 720)
  const distFactor = 1 - Math.min(distKm / 10000, 1)
  const latFactor  = 1 - Math.min(Math.abs(s.station.latitude - HOME_LAT) / 90, 1)
  const csFactor   = Math.min(s.cs / 100, 1)

  return 0.45 * ageFactor + 0.25 * distFactor + 0.20 * latFactor + 0.10 * csFactor
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
    const utcHour = new Date().getUTCHours()
    const daytime = utcHour >= 6 && utcHour <= 20

    const scored = []
    for (const s of stations) {
      if (!s.station?.latitude || !s.station?.longitude) continue
      const lonSigned = s.station.longitude > 180 ? s.station.longitude - 360 : s.station.longitude
      const distKm = haversineKm(HOME_LAT, HOME_LON, s.station.latitude, lonSigned)
      const score = scoreStation(s, distKm, now)
      if (score < 0) continue
      scored.push({ s, distKm, score })
    }

    if (scored.length === 0) {
      console.log('[propagation] KC2G: no valid stations')
      cachedIonoResult = null
      return
    }

    scored.sort((a, b) => b.score - a.score)
    const { s: best, distKm, score } = scored[0]

    if (score < 0.25) {
      console.log('[propagation] KC2G: best score too low:', score.toFixed(3))
      cachedIonoResult = null
      return
    }

    const ageMin = Math.round((now - new Date(best.time).getTime()) / 60000)
    const stationCode = best.station.ursiCode
      || best.station.name?.split(/[\s,]/)[0]
      || 'IONO'

    let fof2 = best.fof2
    let mufd = best.mufd
    let adjusted = false
    if (daytime && best.station.latitude > 40.35) {
      const latDiff = best.station.latitude - HOME_LAT
      const correction = 1 + (latDiff / 100)
      fof2 = fof2 / correction
      mufd = mufd / correction
      adjusted = true
    }

    cachedIonoResult = {
      fof2, mufd, stationCode,
      stationName: best.station.name || stationCode,
      distKm, ageMin, cs: best.cs, score, adjusted,
      fetchedAt: now,
    }

    console.log(`[propagation] KC2G: ${stationCode} (${best.station.name}, ${distKm}km, cs:${best.cs}, score:${score.toFixed(3)}${adjusted ? ', lat-adj' : ''})`)
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

    // Fall back to HamQSL SFI if alert parse came up empty — SFI changes slowly
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

function selectActiveSource() {
  if (cachedIonoResult && cachedIonoResult.score >= 0.25) return 'ionosonde'
  if (cachedNoaaResult) {
    const ageMin = (Date.now() - cachedNoaaResult.fetchedAt) / 60000
    if (ageMin <= 20) return 'noaa'
    // Cache stale — kick off a background refresh for next cycle
    fetchNoaaData()
  }
  return 'empirical'
}

function deriveBandStatus(fof2, muf) {
  const nvis = {}
  const dx   = {}

  for (const [band, open, marg] of [['80m', 3.5, 2.5], ['40m', 7.0, 5.5], ['20m', 14.0, 11.0], ['15m', 21.0, 17.0], ['10m', 28.0, 24.0]]) {
    nvis[band] = fof2 == null ? null : fof2 >= open ? 'OPEN' : fof2 >= marg ? 'MARG' : 'CLSD'
  }

  for (const [band, open, marg] of [['80m', 3.5, 2.5], ['40m', 7.0, 5.0], ['20m', 14.0, 12.0], ['15m', 21.0, 18.0], ['10m', 28.0, 24.0]]) {
    dx[band] = muf == null ? null : muf >= open ? 'OPEN' : muf >= marg ? 'MARG' : 'CLSD'
  }

  return { nvis, dx }
}

function calcDayFactor() {
  const now    = new Date()
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes()

  if (sunData) {
    const dawnMin   = new Date(sunData.civil_twilight_begin).getUTCHours() * 60 + new Date(sunData.civil_twilight_begin).getUTCMinutes()
    const noonMin   = new Date(sunData.solar_noon).getUTCHours() * 60            + new Date(sunData.solar_noon).getUTCMinutes()
    const sunsetMin = new Date(sunData.sunset).getUTCHours() * 60                + new Date(sunData.sunset).getUTCMinutes()
    const duskMin   = new Date(sunData.civil_twilight_end).getUTCHours() * 60    + new Date(sunData.civil_twilight_end).getUTCMinutes()

    let dayFactor
    if (nowMin < dawnMin) {
      dayFactor = 0.2 + 0.05 * (nowMin / Math.max(dawnMin, 1))
    } else if (nowMin < noonMin) {
      const progress = (nowMin - dawnMin) / Math.max(noonMin - dawnMin, 1)
      dayFactor = 0.2 + 0.8 * Math.pow(progress, 0.30)
    } else if (nowMin < sunsetMin + 60) {
      const progress = (nowMin - noonMin) / Math.max(sunsetMin + 60 - noonMin, 1)
      dayFactor = 1.0 - 0.65 * Math.pow(progress, 1.5)
    } else if (nowMin < duskMin + 60) {
      const progress = (nowMin - sunsetMin - 60) / 120
      dayFactor = 0.35 - 0.15 * Math.min(progress, 1.0)
    } else {
      dayFactor = 0.2
    }
    return Math.max(0.2, Math.min(1.0, dayFactor))
  }

  // Mathematical fallback — used when sunrise data unavailable
  const decimalHour    = now.getUTCHours() + now.getUTCMinutes() / 60
  const localSolarHour = ((decimalHour + HOME_LON / 15) + 24) % 24
  if (localSolarHour >= 6 && localSolarHour <= 20) {
    const peak   = 14.0
    const spread = localSolarHour < peak ? 8.0 : 12.0
    return Math.max(0.35, Math.exp(-0.5 * Math.pow((localSolarHour - peak) / spread, 2)))
  }
  const nightHour        = localSolarHour < 6 ? localSolarHour + 24 : localSolarHour
  const distFromMidnight = Math.abs(nightHour - 24)
  return 0.25 + (distFromMidnight / 18) * 0.10
}

function deriveMuf(sfi, kindex) {
  const sfiNum = parseFloat(sfi)
  const kNum   = parseFloat(kindex)
  if (isNaN(sfiNum) || isNaN(kNum)) return null

  const dayFactor    = calcDayFactor()
  const geoFactor    = Math.max(0.5, 1 - (kNum * 0.06))
  const month        = new Date().getUTCMonth()
  const seasonFactor = 1 + 0.2 * Math.cos((month - 6) * Math.PI / 6)

  const foF2 = (0.0245 * sfiNum + 3.8) * dayFactor * geoFactor * seasonFactor
  const muf  = foF2 * 4.5

  const foF2c = Math.round(Math.max(2, Math.min(foF2, 15)) * 10) / 10
  const mufc  = Math.round(Math.max(4, Math.min(muf,  55)) * 10) / 10

  return { foF2: foF2c, muf: mufc }
}

function emitUpdate() {
  if (!lastHamQSLData) return null

  const { sfi, aindex, kindex, xray, sunspots, bands, updated } = lastHamQSLData
  const source = selectActiveSource()

  let foF2val, mufVal, mufSource, mufLabel, mufDetail, mufAdjusted = false, mufAge = null
  let kp, kpSource

  if (source === 'ionosonde') {
    const r = cachedIonoResult
    foF2val     = Math.round(r.fof2 * 10) / 10
    mufVal      = Math.round(r.mufd * 10) / 10
    mufSource   = 'ionosonde'
    mufAdjusted = r.adjusted
    mufAge      = r.ageMin
    const adjTag = r.adjusted ? ' adj' : ''
    mufLabel    = `[${r.stationCode} ${r.ageMin}m${adjTag}]`
    mufDetail   = `${r.stationName} — ${r.distKm} km — ${r.ageMin} min ago — score: ${r.score.toFixed(2)}`
    kp          = cachedNoaaResult?.kp ?? parseFloat(kindex)
    kpSource    = cachedNoaaResult?.kp != null ? 'live' : '3h'
  } else if (source === 'noaa') {
    const noaaSfi = cachedNoaaResult.sfi ?? parseFloat(sfi)
    const noaaKp  = cachedNoaaResult.kp  ?? parseFloat(kindex)
    kp       = noaaKp
    kpSource = 'live'
    const derived = deriveMuf(noaaSfi, noaaKp)
    foF2val  = derived?.foF2 ?? null
    mufVal   = derived?.muf  ?? null
    mufSource = 'noaa'
    mufLabel  = `[NOAA Kp:${noaaKp}]`
    mufDetail = `Derived from NOAA real-time Kp:${noaaKp}, SFI:${noaaSfi}`
  } else {
    const derived = deriveMuf(sfi, kindex)
    foF2val  = derived?.foF2 ?? null
    mufVal   = derived?.muf  ?? null
    mufSource = 'empirical'
    mufLabel  = '[est.]'
    mufDetail = 'Estimated from HamQSL SFI + K-index (ITU-R P.1239, ±2–3 MHz)'
    kp       = parseFloat(kindex)
    kpSource = '3h'
  }

  const { nvis: nvisBands, dx: dxBands } = deriveBandStatus(foF2val, mufVal)

  return {
    sfi, aindex, kindex,
    kp: kp ?? parseFloat(kindex),
    kpSource,
    xray, sunspots, bands,
    muf: {
      foF2:        foF2val,
      muf:         mufVal,
      source:      mufSource,
      stationName: cachedIonoResult?.stationName,
      distKm:      cachedIonoResult?.distKm,
      ageMin:      mufAge,
    },
    mufSource, mufLabel, mufDetail, mufAdjusted, mufAge,
    nvisBands, dxBands,
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
    hamqsl:      lastHamQSLData ? 'ok' : 'failed',
    noaa:        cachedNoaaResult ? 'ok Kp=' + cachedNoaaResult.kp : 'failed',
    ionosonde:   cachedIonoResult ? 'ok ' + cachedIonoResult.stationCode : 'no valid stations',
    activeSource: selectActiveSource(),
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
