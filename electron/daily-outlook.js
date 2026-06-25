import https from 'https'

const FORECAST_URL = 'https://services.swpc.noaa.gov/text/3-day-forecast.txt'

let cachedOutlook = null
let outlookTimer  = null
let dataCallback  = null

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, (res) => {
      let body = ''
      res.on('data', chunk => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode, body }))
      res.on('error', reject)
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')))
  })
}

function parseIssuedTimestamp(text) {
  const m = text.match(/:Issued:\s+(\d{4})\s+(\w+)\s+(\d+)\s+(\d{4})\s+UTC/)
  if (!m) return null
  try {
    const [, year, mon, day, hhmm] = m
    return new Date(`${year} ${mon} ${day} ${hhmm.slice(0, 2)}:${hhmm.slice(2)} UTC`).toISOString()
  } catch {
    return null
  }
}

function parseKpMax(text) {
  const lines = text.split('\n')
  let inTable = false
  const day1Values = []

  for (const line of lines) {
    if (/NOAA Kp index breakdown/i.test(line)) { inTable = true; continue }
    if (!inTable) continue
    // Skip the date header row (contains month abbreviations)
    if (/^\s*[A-Z][a-z]{2}\s+\d{1,2}/i.test(line)) continue
    // Match "HH-HH UT   N   N   N"
    const m = line.match(/^\s*\d{2}-\d{2}\s+UT\s+(\S+)/)
    if (m) {
      const val = parseFloat(m[1])
      if (!isNaN(val) && val >= 0) day1Values.push(val)
    } else if (day1Values.length > 0 && line.trim() === '') {
      break
    }
  }

  return day1Values.length > 0 ? Math.max(...day1Values) : null
}

function extractSection(text, startRe, endRe) {
  const si = text.search(startRe)
  if (si < 0) return ''
  const slice = text.slice(si)
  if (!endRe) return slice
  const ei = slice.search(endRe)
  return ei > 0 ? slice.slice(0, ei) : slice
}

function parseDay1TwoCol(section) {
  const m = section.match(/Day\s*1\s+(\d+)%\s+(\d+)%/)
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)]
  return [null, null]
}

function parseDay1OneCol(section) {
  const m = section.match(/Day\s*1\s+(\d+)%/)
  if (m) return parseInt(m[1], 10)
  return null
}

// Simplified Kp integer → representative daily A-index
const KP_TO_A = [2, 4, 7, 15, 27, 48, 80, 132, 207]
function kpToA(kp) {
  return KP_TO_A[Math.min(Math.max(0, Math.floor(kp || 0)), 8)]
}

function buildSummary(maxKp, r12, r35) {
  const kp  = maxKp || 0
  const r12n = r12  || 0
  const r35n = r35  || 0
  if (kp >= 5 || r35n > 10) {
    return 'Geomagnetic storm conditions possible. HF blackouts and degraded propagation are likely on the sunlit side. Plan around potential disruptions.'
  }
  if (kp >= 4 || r12n >= 25) {
    return 'Active conditions possible. Expect some instability on lower bands, especially daytime hours.'
  }
  return 'Quiet conditions expected. HF should be stable with minimal disruption.'
}

async function fetchOutlook() {
  try {
    const { body, status } = await httpGet(FORECAST_URL)
    if (status !== 200) {
      console.error('[outlook] HTTP', status)
      return
    }

    const issued = parseIssuedTimestamp(body)
    const maxKp  = parseKpMax(body) ?? 2

    const radioSec = extractSection(body, /NOAA Radio Blackout Forecast/i, /NOAA Solar Radiation/i)
    const [r12, r35] = parseDay1TwoCol(radioSec)

    const solarSec = extractSection(body, /NOAA Solar Radiation Storm Forecast/i, /NOAA Geomagnetic Storm Forecast/i)
    const s1 = parseDay1OneCol(solarSec)

    cachedOutlook = {
      updated:              new Date().toISOString(),
      forecastIssued:       issued,
      maxKp,
      maxA:                 kpToA(maxKp),
      radioBlackoutR1R2Pct: r12 ?? 0,
      radioBlackoutR3R5Pct: r35 ?? 0,
      radiationStormPct:    s1  ?? 0,
      summary:              buildSummary(maxKp, r12, r35),
    }

    console.log('[outlook] fetched:', { maxKp, r12, r35, s1 })
  } catch (e) {
    console.error('[outlook] fetch failed:', e.message)
  }
}

function scheduleDaily() {
  if (outlookTimer) { clearTimeout(outlookTimer); outlookTimer = null }
  const now = new Date()
  const nextMidnight = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1
  ))
  const ms = nextMidnight.getTime() - now.getTime()
  outlookTimer = setTimeout(async () => {
    await fetchOutlook()
    if (cachedOutlook) dataCallback?.(cachedOutlook)
    outlookTimer = setInterval(async () => {
      await fetchOutlook()
      if (cachedOutlook) dataCallback?.(cachedOutlook)
    }, 24 * 60 * 60 * 1000)
  }, ms)
}

export async function initOutlook(onData) {
  dataCallback = onData
  await fetchOutlook()
  scheduleDaily()
  return cachedOutlook
}

export function stopOutlook() {
  if (outlookTimer) { clearTimeout(outlookTimer); outlookTimer = null }
}

export function getOutlookCache() {
  return cachedOutlook
}

export async function refreshOutlook() {
  await fetchOutlook()
  return cachedOutlook
}
