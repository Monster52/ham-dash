import { dLayerScore } from './band-conditions-rating.js'

function deg2rad(d) { return d * Math.PI / 180 }

// Solar elevation sin (= cos of zenith angle), clamped to 0 below horizon.
// Uses Spencer/NOAA simplified solar position formulas — no external API needed.
function solarElevationSin(lat, lon, utcMs) {
  const date = new Date(utcMs)

  // Day of year (1-based)
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1)
  const dayOfYear   = Math.floor((date.getTime() - startOfYear) / 86400000) + 1

  // Spencer formula angle (radians)
  const B     = deg2rad(360 / 365 * (dayOfYear - 81))

  // Solar declination (degrees → radians)
  const decl  = deg2rad(23.45 * Math.sin(B))

  // Equation of time (minutes)
  const EqT   = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B)

  // UTC minutes since midnight
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60

  // Local solar time (minutes) then hour angle (degrees → radians)
  const lstMin    = utcMin + lon * 4 + EqT
  const hourAngle = deg2rad((lstMin / 60 - 12) * 15)

  const sinAlt = Math.sin(deg2rad(lat)) * Math.sin(decl) +
                 Math.cos(deg2rad(lat)) * Math.cos(decl) * Math.cos(hourAngle)

  return Math.max(0, sinAlt)
}

// Compute MUF and LUF from propagation data + resolved station coordinates.
// Returns { mufMHz, lufMHz, usableWindowMHz }.
export function computeMufLuf(propData, lat, lon) {
  const sfi  = parseFloat(propData.sfi)                      || 70
  const k    = parseFloat(propData.kp ?? propData.kindex)    || 0
  const xray = propData.xray || 'A1'

  // MUF: foF2 * 3 (vertical MUF estimate)
  const foF2   = Math.max(1, (sfi - 40) * 0.072 + 2.5)
  const mufMHz = Math.round(foF2 * 3.0 * 10) / 10

  // LUF: driven by D-layer absorption + solar zenith + geomagnetic activity
  const zenithFactor   = solarElevationSin(lat, lon, Date.now())
  const xrayAbsorption = 1 - dLayerScore(xray)
  const kFactor        = 1 + (k / 20)

  const lufRaw = 1.8 + (zenithFactor * 6) + (xrayAbsorption * 4) * kFactor
  const lufMHz = Math.round(Math.max(1.8, Math.min(12, lufRaw)) * 10) / 10

  return {
    mufMHz,
    lufMHz,
    usableWindowMHz: [lufMHz, mufMHz],
  }
}
