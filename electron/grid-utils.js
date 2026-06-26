// Maidenhead locator → center lat/lon (4- or 6-character)
export function gridToLatLon(grid) {
  if (!grid || grid.length < 4) return null
  const g = grid.toUpperCase().trim()
  if (!/^[A-R]{2}[0-9]{2}([A-X]{2})?$/.test(g)) return null

  // Field (A–R): 20° lon, 10° lat each
  const lon = (g.charCodeAt(0) - 65) * 20 - 180
  const lat = (g.charCodeAt(1) - 65) * 10 - 90

  // Square (0–9): 2° lon, 1° lat each
  const lonSq = parseInt(g[2], 10) * 2
  const latSq = parseInt(g[3], 10)

  if (g.length >= 6) {
    // Subsquare (a–x): 5' lon (2°/24), 2.5' lat (1°/24) each
    const lonSub = (g.charCodeAt(4) - 65) * (2 / 24)
    const latSub = (g.charCodeAt(5) - 65) * (1 / 24)
    return {
      lat: lat + latSq + latSub + (1 / 48),
      lon: lon + lonSq + lonSub + (1 / 24),
    }
  }

  return {
    lat: lat + latSq + 0.5,
    lon: lon + lonSq + 1.0,
  }
}
