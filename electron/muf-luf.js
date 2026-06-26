import { dLayerScore } from './band-conditions-rating.js'

function deg2rad(d) { return d * Math.PI / 180 }

// Spencer/NOAA simplified solar elevation (sin of altitude, clamped ≥ 0).
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

// SFI-formula fallback MUF (vertical, MHz).
function sfiMuf(sfi) {
  const foF2 = Math.max(1, (sfi - 40) * 0.072 + 2.5)
  return Math.round(foF2 * 3.0 * 10) / 10
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

// Compute MUF and LUF.  ionoResult is the cachedIonoResult from propagation.js
// (may be null if no valid station).  Falls back to SFI formula when null.
export function computeMufLuf(propData, lat, lon, ionoResult) {
  const sfi = parseFloat(propData.sfi) || 70

  let mufMHz, mufSource, mufStationCode, mufStationDistKm, mufAgeMin

  if (ionoResult?.mufd != null) {
    mufMHz           = Math.round(ionoResult.mufd * 10) / 10
    mufSource        = 'measured'
    mufStationCode   = ionoResult.stationCode  || null
    mufStationDistKm = ionoResult.distKm       ?? null
    mufAgeMin        = ionoResult.ageMin        ?? null
  } else {
    mufMHz           = sfiMuf(sfi)
    mufSource        = 'estimated'
    mufStationCode   = null
    mufStationDistKm = null
    mufAgeMin        = null
  }

  const lufMHz = computeLuf(propData, lat, lon)

  // If LUF somehow exceeds MUF (e.g. severe storm + no usable ionosphere),
  // clamp LUF to MUF so the range bar doesn't invert.
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
