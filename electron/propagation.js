import { XMLParser } from 'fast-xml-parser'
import https from 'https'

let timer = null
let kpTimer = null
let dataCallback = null
let realTimeKp = null

const NOAA_KP_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'

async function fetchNoaaKp() {
  try {
    const { body, status } = await httpGet(NOAA_KP_URL)
    if (status !== 200) return
    const rows = JSON.parse(body)
    // rows[0] is the header; scan from the end for the first numeric Kp
    for (let i = rows.length - 1; i >= 1; i--) {
      const kp = parseFloat(rows[i]?.[1])
      if (!isNaN(kp)) {
        realTimeKp = kp
        console.log('[propagation] NOAA Kp updated:', kp)
        return
      }
    }
  } catch (e) {
    console.error('[propagation] NOAA Kp fetch failed:', e.message)
  }
}

// HamQSL XML uses compound band names; normalize them to the keys the UI expects.
const BAND_NAME_MAP = {
  '80m-40m': ['80m', '40m'],
  '30m-20m': ['20m'],
  '17m-15m': ['17m', '15m'],
  '12m-10m': ['12m', '10m'],
}

export function startPropagationTimer(onData) {
  dataCallback = onData
  timer = setInterval(async () => {
    const result = await fetchPropagation()
    dataCallback?.(result)
  }, 60 * 60 * 1000)
  // Prime NOAA Kp immediately, then poll every 3 minutes
  fetchNoaaKp()
  kpTimer = setInterval(fetchNoaaKp, 3 * 60 * 1000)
}

export function stopPropagationTimer() {
  if (timer)   { clearInterval(timer);   timer   = null }
  if (kpTimer) { clearInterval(kpTimer); kpTimer = null }
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

  const sfi = solardata['solarflux']
  const kindex = solardata['kindex']
  const kpSource = realTimeKp !== null ? 'live' : '3h'
  const kpEffective = realTimeKp !== null ? realTimeKp : parseFloat(kindex)

  return {
    sfi,
    aindex: solardata['aindex'],
    kindex,
    kp: kpEffective,
    kpSource,
    xray: solardata['xray'],
    sunspots: solardata['sunspots'],
    bands: bandMap,
    muf: deriveMuf(sfi, kpEffective),
    updated: new Date().toISOString()
  }
}

const HOME_LON = -89.15

// ITU-R P.1239-based foF2 estimate from solar flux + K-index.
function deriveMuf(sfi, kindex) {
  const sfiNum = parseFloat(sfi)
  const kNum = parseFloat(kindex)
  if (isNaN(sfiNum) || isNaN(kNum)) return null

  const utcHour = new Date().getUTCHours()
  const utcMin  = new Date().getUTCMinutes()
  const decimalHour = utcHour + utcMin / 60

  const localSolarHour = ((decimalHour + HOME_LON / 15) + 24) % 24

  const dayFactor = Math.max(0.2,
    Math.cos((localSolarHour - 12) * Math.PI / 12))

  const geoFactor = Math.max(0.5, 1 - (kNum * 0.06))

  const month = new Date().getUTCMonth()
  const seasonFactor = 1 + 0.2 *
    Math.cos((month - 6) * Math.PI / 6)

  const foF2 = (0.0196 * sfiNum + 3.0)
    * dayFactor * geoFactor * seasonFactor

  const muf = foF2 * 3.8

  const foF2c = Math.round(Math.max(2, Math.min(foF2, 15)) * 10) / 10
  const mufc  = Math.round(Math.max(4, Math.min(muf, 55)) * 10) / 10

  console.log('[propagation] MUF calc inputs:',
    { sfi: sfiNum, kindex: kNum, localSolarHour, dayFactor, geoFactor, seasonFactor, foF2c, mufc })

  return {
    foF2: foF2c,
    muf: mufc,
    source: 'est.'
  }
}
