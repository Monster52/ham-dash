import { dLayerScore }      from './band-conditions-rating.js'
import { getCachedSunData } from './propagation.js'

function deg2rad(d) { return d * Math.PI / 180 }

function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)) }

// Spencer/NOAA simplified solar elevation (sin of altitude, clamped ≥ 0).
// Used as fallback when sun-time data isn't available yet.
function solarElevationSin(lat, lon, utcMs) {
  const date = new Date(utcMs)
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1)
  const dayOfYear   = Math.floor((date.getTime() - startOfYear) / 86400000) + 1
  const B           = deg2rad(360 / 365 * (dayOfYear - 81))
  const decl        = deg2rad(23.45 * Math.sin(B))
  const EqT         = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B)
  const utcMin      = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60
  const lstMin      = utcMin + lon * 4 + EqT
  const hourAngle   = deg2rad((lstMin / 60 - 12) * 15)
  const sinAlt = Math.sin(deg2rad(lat)) * Math.sin(decl) +
                 Math.cos(deg2rad(lat)) * Math.cos(decl) * Math.cos(hourAngle)
  return Math.max(0, sinAlt)
}

// Piecewise F-layer ionization factor driven by real sunrise-sunset.org sun times.
//
//   civil dawn → sunrise   : 0.20 → 0.50  (steep — rapid dawn ionization)
//   sunrise    → solar noon : 0.50 → 1.00  (gradual daytime buildup)
//   solar noon → sunset    : 1.00 → 0.50  (symmetric afternoon decay)
//   sunset     → civil dusk : 0.50 → 0.20  (rapid dusk recombination)
//   night (outside above)  : 0.20          (residual F2 ionization floor)
//
// Falls back to solarElevationSin-based approximation when sun-time data is
// unavailable (early startup before sunrise-sunset.org fetch completes).
function computeDayFactor(lat, lon, nowMs = Date.now()) {
  const sun = getCachedSunData()

  if (sun?.civil_twilight_begin) {
    const dawn = new Date(sun.civil_twilight_begin).getTime()
    const rise = new Date(sun.sunrise).getTime()
    const noon = new Date(sun.solar_noon).getTime()
    const set  = new Date(sun.sunset).getTime()
    const dusk = new Date(sun.civil_twilight_end).getTime()

    if (nowMs < dawn) return 0.20
    if (nowMs < rise) return lerp(0.20, 0.50, (nowMs - dawn) / (rise - dawn))
    if (nowMs < noon) return lerp(0.50, 1.00, (nowMs - rise) / (noon - rise))
    if (nowMs < set)  return lerp(1.00, 0.50, (nowMs - noon) / (set  - noon))
    if (nowMs < dusk) return lerp(0.50, 0.20, (nowMs - set)  / (dusk - set))
    return 0.20
  }

  // Fallback: map solar elevation sin to the same 0.20–1.00 range
  return 0.20 + solarElevationSin(lat, lon, nowMs) * 0.80
}

// SFI-formula fallback MUF (MHz, 3000 km obliquity).
//
// Calibration anchor (hamdeck.com, daytime mid-latitude, solar noon):
//   SFI=157, Kp=0 → MUF ≈ 29.3 MHz
//   foF2 = (157-40)*0.072 + 2.5 = 10.924
//   Required multiplier at dayFactor=1.0: 29.3 / 10.924 ≈ 2.68
//
// Mild K-index discount: elevated geomagnetic activity depresses F2-MUF;
// K≤2 no penalty, caps at −15% at K=8.
function sfiMuf(sfi, k, dayFactor) {
  const foF2     = Math.max(1, (sfi - 40) * 0.072 + 2.5) * dayFactor
  const kPenalty = 1 - Math.min(0.15, Math.max(0, (k - 2) * 0.025))
  return Math.round(foF2 * 2.68 * kPenalty * 10) / 10
}

// LUF estimate from solar zenith, X-ray flux, and K-index.
//
// Calibration anchor: hamdeck.com reference shows ~4.3 MHz LUF at
// SFI=157, Kp=0.0, A=11, daytime mid-latitude (solar noon).
// At solar noon: zenithFactor ≈ 0.85 (sin of ~58° elevation, mid-lat summer).
// C-class X-ray (typical active day): dLayerScore ≈ 0.70 → xrayAbsorption = 0.30.
// Kp=0 → kFactor = 1.00.
//
// With multipliers below:
//   luf = 1.8 + (0.85 * 3.0) + (0.30 * 2.5) * 1.00
//       = 1.8 + 2.55 + 0.75 = 5.1 MHz  (slightly above anchor; reasonable)
// At B/A-class quiet sun: xrayAbsorption ≈ 0.05-0.10 → 1.8+2.55+0.25 ≈ 4.6 MHz
// At midnight: zenithFactor = 0 → 1.8 + 0 + small absorption term ≈ 2.0-2.5 MHz
function computeLuf(propData, lat, lon) {
  const k    = parseFloat(propData.kp ?? propData.kindex) || 0
  const xray = propData.xray || 'A1'

  const zenithFactor   = solarElevationSin(lat, lon, Date.now())
  const xrayAbsorption = 1 - dLayerScore(xray)
  const kFactor        = 1 + (k / 20)

  const lufRaw = 1.8 + (zenithFactor * 3.0) + (xrayAbsorption * 2.5) * kFactor
  return Math.round(Math.max(1.8, Math.min(12, lufRaw)) * 10) / 10
}

// Compute MUF and LUF.  ionoResult is getCachedIonoResult() from propagation.js
// (may be null if no valid station found).  Falls back to SFI formula when null.
export function computeMufLuf(propData, lat, lon, ionoResult) {
  const sfi = parseFloat(propData.sfi) || 70
  const k   = parseFloat(propData.kp ?? propData.kindex) || 0

  let mufMHz, mufSource, mufStationCode, mufStationDistKm, mufAgeMin

  if (ionoResult?.mufd != null) {
    mufMHz           = Math.round(ionoResult.mufd * 10) / 10
    mufSource        = 'measured'
    mufStationCode   = ionoResult.stationCode || null
    mufStationDistKm = ionoResult.distKm      ?? null
    mufAgeMin        = ionoResult.ageMin       ?? null
  } else {
    const dayFactor  = computeDayFactor(lat, lon)
    mufMHz           = sfiMuf(sfi, k, dayFactor)
    mufSource        = 'estimated'
    mufStationCode   = null
    mufStationDistKm = null
    mufAgeMin        = null
  }

  const lufMHz = computeLuf(propData, lat, lon)

  // Clamp LUF to MUF so the range bar never inverts (e.g. severe storm).
  const clampedLuf = Math.min(lufMHz, mufMHz)

  return {
    mufMHz,
    mufSource,
    mufStationCode,
    mufStationDistKm,
    mufAgeMin,
    lufMHz: clampedLuf,
    lufSource: 'estimated',
    usableWindowMHz: [clampedLuf, mufMHz],
  }
}
