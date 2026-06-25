// Band group representative frequencies (MHz)
// Day uses the upper/primary band, night uses the lower/quieter band.
const BAND_GROUPS = {
  '80m-40m': { dayMHz: 7,  nightMHz: 3.5 },
  '30m-20m': { dayMHz: 14, nightMHz: 10  },
  '17m-15m': { dayMHz: 18, nightMHz: 18  },
  '12m-10m': { dayMHz: 28, nightMHz: 28  },
}

export function signalNoiseFromK(k) {
  const n = parseFloat(k) || 0
  if (n <= 1) return 'S0-S1'
  if (n <= 2) return 'S1-S2'
  if (n <= 3) return 'S2-S3'
  if (n <= 4) return 'S3-S4'
  if (n <= 5) return 'S4-S5'
  return 'S5+'
}

// MUF score: how well does the SFI-derived MUF cover the band frequency?
function mufScore(sfi, freqMHz, isDay) {
  const foF2 = Math.max(1, (sfi - 40) * 0.072 + 2.5)
  const mufd = foF2 * 3.0 * (isDay ? 1.0 : 0.60)
  return Math.max(0, Math.min(1, (mufd / freqMHz - 0.6) / 1.4))
}

// Ionization quality from SFI + sunspot number
function ionizScore(sfi, sunspots, isDay) {
  const sn = Math.max(0, Math.min(1, (sfi - 60) / 130))
  const ss = Math.max(0, Math.min(1, (sunspots || 0) / 120))
  return isDay ? sn * 0.6 + ss * 0.4 : sn * 0.5 + ss * 0.5
}

// D-layer absorption from X-ray flux class (day only)
function dLayerScore(xray) {
  if (!xray || xray === '---') return 0.85
  const c = xray.charAt(0).toUpperCase()
  const n = parseFloat(xray.slice(1)) || 1
  if (c === 'A') return Math.max(0, 0.95 - n * 0.005)
  if (c === 'B') return Math.max(0, 0.90 - n * 0.020)
  if (c === 'C') return Math.max(0, 0.75 - n * 0.050)
  if (c === 'M') return Math.max(0, 0.50 - n * 0.040)
  if (c === 'X') return Math.max(0, 0.20 - n * 0.020)
  return 0.85
}

// Geomagnetic stability multiplier — SMOOTH sigmoid curve, not a hard
// bracket. Centered on K=5 (NOAA's actual G1/"minor storm" threshold)
// so K=0-4 ("quiet" through "active") only mildly tapers the score,
// and real degradation only kicks in from K=5 upward. This replaces
// a previous version that had a hard cliff at K=4 forcing entire
// columns to Poor regardless of how good SFI/MUF were — a K of 3.33
// (merely "active," not a storm) was being treated the same as a
// genuine G1 storm, which produced exaggerated negative ratings.
function geoFactor(k) {
  const kn = Math.max(0, parseFloat(k) || 0)
  const center    = 5.0   // K=5 = NOAA G1 minor storm threshold
  const steepness = 1.1
  const sig = 1 / (1 + Math.exp(steepness * (kn - center)))
  return 0.15 + 0.85 * sig   // floor 0.15 (severe storm), ceiling 1.0 (calm)
}

function scoreToRating(score) {
  if (score >= 0.65) return 'Good'
  if (score >= 0.35) return 'Fair'
  return 'Poor'
}

function computeBandRating(band, sfi, sunspots, k, xray, isDay) {
  const freqMHz = isDay ? BAND_GROUPS[band].dayMHz : BAND_GROUPS[band].nightMHz
  const muf     = mufScore(sfi, freqMHz, isDay)
  const ioniz   = ionizScore(sfi, sunspots, isDay)
  let raw
  if (isDay) {
    const dlayer = dLayerScore(xray)
    // Weights: MUF 35%, Ionization 30%, D-layer 15% (geo applied separately)
    raw = (muf * 0.35 + ioniz * 0.30 + dlayer * 0.15) / 0.80
  } else {
    // Night: no D-layer. MUF 40%, Ionization 35%
    raw = (muf * 0.40 + ioniz * 0.35) / 0.75
  }
  return scoreToRating(raw * geoFactor(k))
}

export function computeRatings(sfi, sunspots, k, xray) {
  const ratings = {}
  for (const band of Object.keys(BAND_GROUPS)) {
    ratings[band] = {
      day:   computeBandRating(band, sfi, sunspots, k, xray, true),
      night: computeBandRating(band, sfi, sunspots, k, xray, false),
    }
  }
  return ratings
}

export function buildRatingResponse(propData) {
  if (!propData || propData.error) return null
  const sfi      = parseFloat(propData.sfi)                         || 70
  const sunspots = parseFloat(propData.sunspots)                    || 0
  const k        = parseFloat(propData.kp ?? propData.kindex)       || 0
  return {
    updated:       propData.updated || new Date().toISOString(),
    sfi,
    sunspotNumber: sunspots,
    kIndex:        k,
    aIndex:        propData.aindex ?? null,
    signalNoise:   signalNoiseFromK(k),
    ratings:       computeRatings(sfi, sunspots, k, propData.xray),
  }
}