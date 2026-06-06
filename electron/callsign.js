import https from 'https'
import { ipcMain } from 'electron'

const CALLOOK_BASE = 'https://callook.info'
const TTL_MS = 24 * 60 * 60 * 1000

const cache = new Map()

function toTitleCase(str) {
  if (!str) return ''
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function parseCityState(line2) {
  if (!line2) return { city: '', state: '' }
  const m = line2.match(/^(.+),\s+([A-Z]{2})/)
  if (!m) return { city: toTitleCase(line2.trim()), state: '' }
  return { city: toTitleCase(m[1].trim()), state: m[2] }
}

function fetchCallook(callsign) {
  return new Promise((resolve, reject) => {
    const req = https.get(`${CALLOOK_BASE}/${callsign}/json`, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch { reject(new Error('parse error')) }
      })
    })
    req.on('error', reject)
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function lookupCallsign(callsign) {
  const cached = cache.get(callsign)
  if (cached) {
    if (Date.now() - cached.ts < TTL_MS) return cached.data
    cache.delete(callsign)
  }

  try {
    const json = await fetchCallook(callsign)
    if (json.status !== 'VALID') {
      cache.set(callsign, { ts: Date.now(), data: null })
      return null
    }

    const { city, state } = parseCityState(json.address?.line2 || '')
    const result = {
      callsign,
      name: toTitleCase(json.name || ''),
      city,
      state,
      grid: (json.location?.gridsquare || '').toUpperCase(),
      lat: json.location?.latitude ? parseFloat(json.location.latitude) : null,
      lon: json.location?.longitude ? parseFloat(json.location.longitude) : null,
      class: json.current?.operClass || '',
      country: 'USA',
      source: 'callook',
    }

    cache.set(callsign, { ts: Date.now(), data: result })
    return result
  } catch (err) {
    console.error('[Callsign] lookup failed for', callsign, ':', err.message)
    return null
  }
}

function initCallsignLookup() {
  ipcMain.handle('callsign:lookup', async (_, call) => {
    return await lookupCallsign(call.toUpperCase().trim())
  })
}

export { initCallsignLookup }
