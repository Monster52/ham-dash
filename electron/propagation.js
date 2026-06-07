import { XMLParser } from 'fast-xml-parser'
import https from 'https'

let timer     = null
let ionoTimer = null
let dataCallback      = null
let cachedIonoStation = null  // null | { fof2, mufd, stationCode, stationName, distKm, ageMin, cs }

const KC2G_URL = 'https://prop.kc2g.com/api/stations.json'
const HOME_LAT =  30.35
const HOME_LON = -89.15

// HamQSL XML uses compound band names; normalize them to the keys the UI expects.
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

    // Filter: cs > 0 and time within 90 minutes
    const valid = stations.filter(s => {
      if (!s.cs || s.cs <= 0) return false
      if (!s.time) return false
      const ageMs = now - new Date(s.time).getTime()
      return ageMs >= 0 && ageMs <= 90 * 60 * 1000
    })

    if (valid.length === 0) {
      console.log('[propagation] KC2G: no valid stations — empirical fallback active')
      cachedIonoStation = null
      return
    }

    // Compute haversine distance; KC2G uses 0-360 longitude
    const withDist = valid.map(s => {
      const lonSigned = s.station.longitude > 180 ? s.station.longitude - 360 : s.station.longitude
      const distKm = haversineKm(HOME_LAT, HOME_LON, s.station.latitude, lonSigned)
      return { ...s, distKm }
    })

    // 3 nearest, then highest cs among them
    withDist.sort((a, b) => a.distKm - b.distKm)
    const nearest3 = withDist.slice(0, 3)
    const best = nearest3.reduce((a, b) => b.cs > a.cs ? b : a)

    const ageMin = Math.round((now - new Date(best.time).getTime()) / 60000)
    const stationCode = best.station.ursiCode
      || best.station.name?.split(/[\s,]/)[0]
      || 'IONO'

    cachedIonoStation = {
      fof2:        best.fof2,
      mufd:        best.mufd,
      stationCode,
      stationName: best.station.name || stationCode,
      distKm:      best.distKm,
      ageMin,
      cs:          best.cs,
    }

    console.log(`[propagation] MUF source: ${stationCode} (${best.station.name}, ${best.distKm}km, cs:${best.cs})`)
  } catch (e) {
    console.error('[propagation] KC2G fetch failed:', e.message)
  }
}

export function startPropagationTimer(onData) {
  dataCallback = onData
  timer = setInterval(async () => {
    const result = await fetchPropagation()
    dataCallback?.(result)
  }, 60 * 60 * 1000)
  // Prime ionosonde data immediately, then poll every 15 minutes
  fetchKC2GStations()
  ionoTimer = setInterval(fetchKC2GStations, 15 * 60 * 1000)
}

export function stopPropagationTimer() {
  if (timer)     { clearInterval(timer);     timer     = null }
  if (ionoTimer) { clearInterval(ionoTimer); ionoTimer = null }
}

export async function fetchPropagation() {
  try {
    console.log('[propagation] fetching HamQSL XML...')
    const { body: xml, status } = await httpGet('https://www.hamqsl.com/solarxml.php')
    console.log('[propagation] HTTP', status, '— raw response (first 500 chars):', xml.slice(0, 500))

    if (status !== 200) {
      const err = `HTTP ${status}`
      console.error('[propagation]', err)
      return { error: err, updated: new Date().toISOString() }
    }

    if (!xml.includes('<solar>')) {
      console.error('[propagation] response is not HamQSL XML — got HTML or empty body')
      return { error: 'Server returned non-XML response', updated: new Date().toISOString() }
    }

    const data = parseXml(xml)
    if (!data) {
      console.error('[propagation] parseXml returned null — unexpected XML structure')
      return { error: 'Parse failed — unexpected XML structure', updated: new Date().toISOString() }
    }
    console.log('[propagation] parsed OK — SFI:', data.sfi, 'K:', data.kindex, 'bands:', Object.keys(data.bands))
    return data
  } catch (e) {
    console.error('[propagation] fetch error:', e.message)
    return { error: e.message, updated: new Date().toISOString() }
  }
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
  const bandArray = Array.isArray(conditions) ? conditions : [conditions]

  // Build band map, normalizing compound XML names (e.g. "30m-20m") to UI keys ("20m")
  const bandMap = {}
  for (const band of bandArray) {
    if (!band || !band['@_name']) continue
    const xmlName = band['@_name']
    const time = band['@_time']
    const condition = band['#text']
    const uiKeys = BAND_NAME_MAP[xmlName] || [xmlName]
    for (const key of uiKeys) {
      if (!bandMap[key]) bandMap[key] = {}
      bandMap[key][time] = condition
    }
  }

  const sfi    = solardata['solarflux']
  const kindex = solardata['kindex']

  // Real ionosonde data takes priority; fall back to empirical formula
  let muf
  if (cachedIonoStation) {
    muf = {
      foF2:        Math.round(cachedIonoStation.fof2 * 10) / 10,
      muf:         Math.round(cachedIonoStation.mufd * 10) / 10,
      source:      cachedIonoStation.stationCode,
      stationName: cachedIonoStation.stationName,
      distKm:      cachedIonoStation.distKm,
      ageMin:      cachedIonoStation.ageMin,
    }
  } else {
    console.log('[propagation] MUF source: empirical fallback (no valid stations)')
    muf = deriveMuf(sfi, kindex)
  }

  return {
    sfi,
    aindex:   solardata['aindex'],
    kindex,
    kp:       parseFloat(kindex),
    kpSource: '3h',
    xray:     solardata['xray'],
    sunspots: solardata['sunspots'],
    bands:    bandMap,
    muf,
    updated:  new Date().toISOString()
  }
}

// ITU-R P.1239-based foF2 estimate — empirical fallback only.
function deriveMuf(sfi, kindex) {
  const sfiNum = parseFloat(sfi)
  const kNum   = parseFloat(kindex)
  if (isNaN(sfiNum) || isNaN(kNum)) return null

  const utcHour = new Date().getUTCHours()
  const utcMin  = new Date().getUTCMinutes()
  const decimalHour    = utcHour + utcMin / 60
  const localSolarHour = ((decimalHour + HOME_LON / 15) + 24) % 24

  const dayFactor    = Math.max(0.2, Math.cos((localSolarHour - 12) * Math.PI / 12))
  const geoFactor    = Math.max(0.5, 1 - (kNum * 0.06))
  const month        = new Date().getUTCMonth()
  const seasonFactor = 1 + 0.2 * Math.cos((month - 6) * Math.PI / 6)

  const foF2 = (0.0179 * sfiNum + 2.7) * dayFactor * geoFactor * seasonFactor
  const muf  = foF2 * 3.8

  const foF2c = Math.round(Math.max(2, Math.min(foF2, 15)) * 10) / 10
  const mufc  = Math.round(Math.max(4, Math.min(muf,  55)) * 10) / 10

  console.log('[propagation] MUF calc inputs:',
    { sfi: sfiNum, kindex: kNum, localSolarHour, dayFactor, geoFactor, seasonFactor, foF2c, mufc })

  return { foF2: foF2c, muf: mufc, source: 'est.' }
}
