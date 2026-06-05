import { XMLParser } from 'fast-xml-parser'
import https from 'https'

let timer = null
let dataCallback = null

export function startPropagationTimer(onData) {
  dataCallback = onData
  // Fetch every 60 minutes
  timer = setInterval(async () => {
    const data = await fetchPropagation()
    if (data) dataCallback?.(data)
  }, 60 * 60 * 1000)
}

export function stopPropagationTimer() {
  if (timer) { clearInterval(timer); timer = null }
}

export async function fetchPropagation() {
  try {
    const xml = await httpGet('https://www.hamqsl.com/solar.xml')
    return parseXml(xml)
  } catch (e) {
    return null
  }
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve(data))
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

  const bands = {}
  for (const band of bandArray) {
    if (band && band['@_name']) {
      bands[band['@_name']] = {
        day: band['@_time'] === 'day' ? band['#text'] : bands[band['@_name']]?.day,
        night: band['@_time'] === 'night' ? band['#text'] : bands[band['@_name']]?.night
      }
    }
  }

  // Handle duplicate band entries (day/night separate)
  const bandMap = {}
  for (const band of bandArray) {
    if (!band || !band['@_name']) continue
    const name = band['@_name']
    const time = band['@_time']
    if (!bandMap[name]) bandMap[name] = {}
    bandMap[name][time] = band['#text']
  }

  return {
    sfi: solardata['solarflux'],
    aindex: solardata['aindex'],
    kindex: solardata['kindex'],
    xray: solardata['xray'],
    sunspots: solardata['sunspots'],
    bands: bandMap,
    updated: new Date().toISOString()
  }
}
