/**
 * Local HTTP API server — intended for LAN access only (no auth).
 * Exposes a single summary endpoint for constrained clients (ESP32, etc.).
 *
 * GET /api/station-summary
 *   curl http://<machine-ip>:2600/api/station-summary
 *
 * Response is cached for 5 minutes to avoid re-computing on every poll.
 * NOAA fetches inside are also bounded by the same cache window.
 */

import http  from 'http'
import https from 'https'
import { computeRatings } from './band-conditions-rating.js'
import { gridToLatLon }   from './grid-utils.js'

const CACHE_TTL_MS = 5 * 60 * 1000

// Representative short band name per group
const BAND_REP = {
  '30m-20m': '20m',
  '17m-15m': '17m',
  '80m-40m': '40m',
  '12m-10m': '10m',
}

// Preference order differs for day vs night
const DAY_PRIORITY   = ['30m-20m', '17m-15m', '80m-40m', '12m-10m']
const NIGHT_PRIORITY = ['80m-40m', '30m-20m', '17m-15m', '12m-10m']

let server        = null
let endpointCache = { json: null, builtAt: 0 }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function solarLocalHour(lonDeg) {
  const now     = new Date()
  const utcMin  = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60
  const localMin = ((utcMin + lonDeg * 4) % 1440 + 1440) % 1440
  return localMin / 60
}

function isDaytime(lonDeg) {
  const h = solarLocalHour(lonDeg)
  return h >= 6 && h < 19
}

function pickBestBand(ratings, isDay) {
  const period   = isDay ? 'day' : 'night'
  const priority = isDay ? DAY_PRIORITY : NIGHT_PRIORITY
  for (const score of ['Good', 'Fair', 'Poor']) {
    for (const group of priority) {
      if (ratings[group]?.[period] === score) return BAND_REP[group]
    }
  }
  return '20m'
}

function overallCondition(ratings, isDay) {
  const period = isDay ? 'day' : 'night'
  const counts = { Good: 0, Fair: 0, Poor: 0 }
  for (const group of DAY_PRIORITY) {
    const r = ratings[group]?.[period]
    if (r) counts[r]++
  }
  if (counts.Good >= 2) return 'GOOD'
  if (counts.Poor >= 3) return 'POOR'
  return 'FAIR'
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let body = ''
      res.on('data', c => (body += c))
      res.on('end', () => resolve({ status: res.statusCode, body }))
      res.on('error', reject)
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')))
  })
}

async function fetchNoaaSfi() {
  try {
    const { body, status } = await httpsGet(
      'https://services.swpc.noaa.gov/json/f107_cm_flux.json'
    )
    if (status !== 200) return null
    const arr = JSON.parse(body)
    for (let i = arr.length - 1; i >= 0; i--) {
      // Field may be 'flux' or 'observed_flux'
      const v = arr[i]?.flux ?? arr[i]?.observed_flux
      if (v != null) return Math.round(parseFloat(v))
    }
    return null
  } catch (e) {
    console.warn('[api-server] SFI fetch failed:', e.message)
    return null
  }
}

async function fetchNoaaKp() {
  try {
    const { body, status } = await httpsGet(
      'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json'
    )
    if (status !== 200) return null
    const arr = JSON.parse(body)
    for (let i = arr.length - 1; i >= 0; i--) {
      // Field may be 'kp_index', 'kp', or 'Kp'
      const v = arr[i]?.kp_index ?? arr[i]?.kp ?? arr[i]?.Kp
      if (v != null) return Math.round(parseFloat(v))
    }
    return null
  } catch (e) {
    console.warn('[api-server] Kp fetch failed:', e.message)
    return null
  }
}

// ---------------------------------------------------------------------------
// Response builder
// ---------------------------------------------------------------------------

async function buildSummary(getData) {
  const { propData, mufLufData, callsign, grid } = getData()

  // Parallel NOAA fetches — bounded by caller's 5-min cache
  const [sfiRes, kpRes] = await Promise.allSettled([fetchNoaaSfi(), fetchNoaaKp()])

  const sfi  = (sfiRes.status === 'fulfilled' ? sfiRes.value : null)
            ?? parseFloat(propData?.sfi) ?? 70
  const kidx = (kpRes.status  === 'fulfilled' ? kpRes.value  : null)
            ?? parseFloat(propData?.kp ?? propData?.kindex) ?? 0

  const sunspots = parseFloat(propData?.sunspots) || 0
  const xray     = propData?.xray || 'A1'

  const ratings = computeRatings(sfi, sunspots, kidx, xray)

  // Determine day/night from station longitude (derived from grid)
  const coords = gridToLatLon(grid || 'EM50JI') || { lat: 30.35, lon: -89.15 }
  const isDay  = isDaytime(coords.lon)

  return {
    ts:        new Date().toISOString(),
    band_cond: overallCondition(ratings, isDay),
    muf:       mufLufData?.mufMHz ?? null,
    luf:       mufLufData?.lufMHz ?? null,
    sfi,
    kidx,
    best_band: pickBestBand(ratings, isDay),
    grid:      grid      || 'EM50JI',
    callsign:  callsign  || 'KJ5NUJ',
  }
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

export function initApiServer(port, getData) {
  server = http.createServer(async (req, res) => {
    if (req.method !== 'GET' || req.url !== '/api/station-summary') {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
      return
    }

    // Serve from cache if fresh
    if (endpointCache.json && Date.now() - endpointCache.builtAt < CACHE_TTL_MS) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=300',
      })
      res.end(endpointCache.json)
      return
    }

    try {
      const data = await buildSummary(getData)
      const json = JSON.stringify(data)
      endpointCache = { json, builtAt: Date.now() }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=300',
      })
      res.end(json)
    } catch (e) {
      console.error('[api-server] build error:', e.message)
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unavailable' }))
    }
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`[api-server] http://0.0.0.0:${port}/api/station-summary  (LAN only — no auth)`)
  })

  server.on('error', (e) => console.error('[api-server]', e.message))
}

export function stopApiServer() {
  if (server) { server.close(); server = null }
}
