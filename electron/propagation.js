import { XMLParser } from 'fast-xml-parser'
import https from 'https'

let timer = null
let dataCallback = null

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
    dataCallback?.(result)  // always emit — includes error field if failed
  }, 60 * 60 * 1000)
}

export function stopPropagationTimer() {
  if (timer) { clearInterval(timer); timer = null }
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

  return {
    sfi,
    aindex: solardata['aindex'],
    kindex,
    xray: solardata['xray'],
    sunspots: solardata['sunspots'],
    bands: bandMap,
    muf: deriveMuf(sfi, kindex),
    updated: new Date().toISOString()
  }
}

const HOME_LON = -89.15

// Time/season-aware foF2 estimate from solar flux + K-index.
function deriveMuf(sfi, kindex) {
  const sfiNum = parseFloat(sfi)
  const kNum = parseFloat(kindex)
  if (isNaN(sfiNum) || isNaN(kNum)) return null

  const utcHour = new Date().getUTCHours()
  const localSolarHour = ((utcHour + (HOME_LON / 15)) + 24) % 24

  const dayFactor = Math.max(0.15,
    Math.cos((localSolarHour - 12) * Math.PI / 12))

  const geoFactor = Math.max(0.4, 1 - (kNum * 0.08))

  const month = new Date().getUTCMonth()
  const seasonFactor = 1 + 0.15 *
    Math.cos((month - 6) * Math.PI / 6)

  const foF2 = (0.00867 * sfiNum + 2.1)
    * dayFactor * geoFactor * seasonFactor
  const muf = Math.round(foF2 * 3.8 * 10) / 10

  const foF2c = Math.max(2, Math.min(foF2, 15))
  const mufc  = Math.max(2, Math.min(muf, 50))

  return {
    foF2: Math.round(foF2c * 10) / 10,
    muf: mufc,
    source: 'est.'
  }
}
