import https from 'https'

let pollTimer = null
let spotsCallback = null
let lastSpots = []

// Approximate grid square lookup by callsign prefix — used for map plotting
// when exact grid is not available from the data source.
const PREFIX_GRID = {
  // North America
  W1: 'FN42', K1: 'FN42', N1: 'FN42', AA1: 'FN42',
  W2: 'FN20', K2: 'FN20', N2: 'FN20',
  W3: 'FM19', K3: 'FM19', N3: 'FM19',
  W4: 'EM63', K4: 'EM63', N4: 'EM63',
  W5: 'EM20', K5: 'EM20', N5: 'EM20',
  W6: 'DM04', K6: 'DM04', N6: 'DM04',
  W7: 'DN31', K7: 'DN31', N7: 'DN31',
  W8: 'EN82', K8: 'EN82', N8: 'EN82',
  W9: 'EN52', K9: 'EN52', N9: 'EN52',
  W0: 'DN70', K0: 'DN70', N0: 'DN70',
  // Canada
  VE1: 'FN74', VE2: 'FN35', VE3: 'FN03', VE4: 'EN19',
  VE5: 'DO33', VE6: 'DO33', VE7: 'CN89', VA: 'FN25',
  // Europe
  G:  'IO91', M:  'IO91', '2E': 'IO91',
  F:  'JN03',
  DL: 'JO31', DJ: 'JO31', DK: 'JO31', DA: 'JO31', DB: 'JO31', DC: 'JO31', DD: 'JO31',
  EA: 'IM68', EB: 'IM68', EC: 'IM68', ED: 'IM68',
  OH: 'KP20',
  SM: 'JP70', SA: 'JP70', SB: 'JP70', SC: 'JP70', SD: 'JP70', SE: 'JP70', SF: 'JP70',
  SP: 'KO02', SN: 'KO02', SO: 'KO02', SQ: 'KO02', SR: 'KO02',
  HA: 'JN97', HG: 'JN97',
  OK: 'JO70', OL: 'JO70',
  OE: 'JN77',
  HB: 'JN36', HB9: 'JN36',
  I:  'JN45', IK: 'JN45', IW: 'JN45', IZ: 'JN45', II: 'JN45',
  PA: 'JO22', PB: 'JO22', PC: 'JO22', PD: 'JO22', PE: 'JO22',
  ON: 'JO20',
  LZ: 'KN22',
  YO: 'KN46', YP: 'KN46', YQ: 'KN46', YR: 'KN46',
  LA: 'JP99', LB: 'JP99',
  OZ: 'JO55',
  EI: 'IO63',
  LY: 'KO24',
  YL: 'KO26',
  ES: 'KO29',
  OH2: 'KP20',
  UT: 'KO50', UR: 'KO50', US: 'KO50', UV: 'KO50', UW: 'KO50',
  RA: 'KO85', RN: 'KO85', RK: 'KO85', RU: 'KO85', RV: 'KO85',
  UA: 'KO85',
  // Asia/Pacific
  JA: 'PM86', JH: 'PM86', JK: 'PM86', JL: 'PM86',
  VK: 'QF22',
  ZL: 'RF70',
  // South America
  PY: 'GG87', PP: 'GG87', PQ: 'GG87',
  LU: 'GF05', LW: 'GF05',
}

function callsignToGrid(call) {
  if (!call) return null
  const c = call.toUpperCase().replace(/\/[A-Z0-9]+$/, '') // strip /P, /M etc
  // Try longest prefix first (3 chars), then 2, then 1
  for (let len = 3; len >= 1; len--) {
    const prefix = c.slice(0, len)
    if (PREFIX_GRID[prefix]) return PREFIX_GRID[prefix]
  }
  return null
}

export function startRbn(onSpots) {
  spotsCallback = onSpots
  fetchSpots()
  pollTimer = setInterval(fetchSpots, 120 * 1000)
}

export function stopRbn() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

export function getLastSpots() {
  return lastSpots
}

export async function fetchSpots() {
  try {
    console.log('[rbn] fetching spots for KJ5NUJ...')
    const { status, body } = await httpGet(
      'https://www.hamqth.com/rbn_data.php?data=1&band=160,80,40,30,20,17,15,12,10&mode=CW,RTTY&age=30&order=3'
    )

    if (status !== 200) {
      console.warn('[rbn] HTTP', status)
      spotsCallback?.(lastSpots)
      return lastSpots
    }

    const json = JSON.parse(body)
    const entry = json['KJ5NUJ']

    if (!entry) {
      console.log('[rbn] KJ5NUJ not spotted in last 30 minutes')
      lastSpots = []
      spotsCallback?.(lastSpots)
      return lastSpots
    }

    // Expand lsn (spotter → SNR) into individual spot records
    const freq = parseFloat(entry.freq?.replace(/\s/g, '')) || 0
    const now = Date.now()

    lastSpots = Object.entries(entry.lsn || {})
      .map(([spotter, snr]) => ({
        id:          `${spotter}-${now}`,
        spotter,
        spotted:     'KJ5NUJ',
        freq_mhz:    freq / 1000,  // HamQTH gives kHz
        freq_khz:    freq,
        snr_db:      snr,
        mode:        entry.mode || 'CW',
        band:        freqToBand(freq / 1000),
        age_min:     entry.age || 0,
        timestamp:   new Date(now - (entry.age || 0) * 60000).toISOString(),
        spotter_grid: callsignToGrid(spotter)
      }))
      .sort((a, b) => a.age_min - b.age_min)

    console.log(`[rbn] ${lastSpots.length} spotters for KJ5NUJ`)
    spotsCallback?.(lastSpots)
    return lastSpots
  } catch (e) {
    console.error('[rbn] fetch error:', e.message)
    spotsCallback?.(lastSpots)
    return lastSpots
  }
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 12000 }, (res) => {
      let body = ''
      res.on('data', c => (body += c))
      res.on('end', () => resolve({ status: res.statusCode, body }))
      res.on('error', reject)
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')))
  })
}

function freqToBand(mhz) {
  const f = parseFloat(mhz)
  if (isNaN(f)) return null
  if (f >= 1.8   && f <= 2.0)    return '160m'
  if (f >= 3.5   && f <= 4.0)    return '80m'
  if (f >= 7.0   && f <= 7.3)    return '40m'
  if (f >= 10.1  && f <= 10.15)  return '30m'
  if (f >= 14.0  && f <= 14.35)  return '20m'
  if (f >= 18.068 && f <= 18.168) return '17m'
  if (f >= 21.0  && f <= 21.45)  return '15m'
  if (f >= 24.89 && f <= 24.99)  return '12m'
  if (f >= 28.0  && f <= 29.7)   return '10m'
  return null
}
