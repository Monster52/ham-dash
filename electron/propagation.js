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

// URSI empirical MUF estimate from solar flux + K-index.
// foF2 clamped to minimum 2.0 MHz (ionosphere always present).
function deriveMuf(sfi, kindex) {
  const sfiNum = parseFloat(sfi)
  const kNum = parseFloat(kindex)
  if (isNaN(sfiNum) || isNaN(kNum)) return null
  const foF2 = Math.max(2.0, (0.00825 * sfiNum + 1.9) * (1 - 0.1 * kNum))
  return {
    foF2: Math.round(foF2 * 10) / 10,
    muf: Math.round(foF2 * 3.8 * 10) / 10,
    source: 'est.'
  }
}
