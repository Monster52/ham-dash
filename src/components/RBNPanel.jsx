import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useIPCEvent } from '../hooks/useIPC'
import { geoEquirectangular, geoPath, geoGraticule } from 'd3-geo'
import { feature } from 'topojson-client'
import worldData from 'world-atlas/countries-110m.json'

// EM50JI home position
const HOME = { lat: 30.35, lon: -89.15, grid: 'EM50JI', call: 'KJ5NUJ' }

const BAND_COLORS = {
  '160m': '#cc44ff', '80m': '#ff6600', '40m': '#ffb000',
  '30m': '#44ffaa', '20m': '#00ff41', '17m': '#00ddff',
  '15m': '#00aaff', '12m': '#ff44aa', '10m': '#ff2200'
}

function gridToLatLon(grid) {
  if (!grid || grid.length < 4) return null
  const g = grid.toUpperCase()
  const lon = (g.charCodeAt(0) - 65) * 20 - 180 + parseInt(g[2]) * 2 + 1
  const lat = (g.charCodeAt(1) - 65) * 10 - 90 + parseInt(g[3]) + 0.5
  if (isNaN(lon) || isNaN(lat)) return null
  return { lat, lon }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const toRad = x => x * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return Math.round(R * 2 * Math.asin(Math.sqrt(a)))
}

function snrColor(snr) {
  if (snr >= 10) return '#00ff41'
  if (snr >= 5)  return '#ffb000'
  return '#ff2200'
}

function ageLabel(minAgo) {
  if (minAgo < 1)  return '<1m ago'
  if (minAgo < 60) return `${Math.round(minAgo)}m ago`
  return `${Math.round(minAgo / 60)}h ago`
}

// ---- Map component ----
// Internal coordinate space — fitSize maps geographic bounds to this rectangle.
// SVG stretches to fill its container via preserveAspectRatio="none".
const VP_W = 1000
const VP_H = 500

// Geographic bounds to fit: lon -130..+60, lat -10..+75
const BOUNDS_GEOJSON = {
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [-130, -10], [60, -10], [60, 75], [-130, 75], [-130, -10]
    ]]
  },
  properties: {}
}

function RBNMap({ spots }) {
  const countries = useMemo(
    () => feature(worldData, worldData.objects.countries),
    []
  )
  const graticule = useMemo(() => geoGraticule()(), [])

  // rotate centers the Atlantic; fitSize eliminates dead space by computing
  // scale and translate automatically to fill [VP_W, VP_H] exactly.
  const projection = useMemo(() =>
    geoEquirectangular()
      .rotate([30, -20])
      .fitSize([VP_W, VP_H], BOUNDS_GEOJSON),
    []
  )

  const pathGen = useMemo(() => geoPath(projection), [projection])

  const homeXY = projection([HOME.lon, HOME.lat])

  const spotsWithPos = useMemo(() =>
    spots
      .map(s => {
        const pos = s.spotter_grid ? gridToLatLon(s.spotter_grid) : null
        const xy  = pos ? projection([pos.lon, pos.lat]) : null
        const km  = pos ? haversineKm(HOME.lat, HOME.lon, pos.lat, pos.lon) : null
        return { ...s, xy, km }
      })
      .filter(s => s.xy),
    [spots, projection]
  )

  return (
    <svg
      viewBox={`0 0 ${VP_W} ${VP_H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%', display: 'block', background: '#0a0f0a' }}
    >
      {/* Graticule (grid lines) */}
      <path d={pathGen(graticule)} fill="none" stroke="#0f1a0f" strokeWidth={0.5} />

      {/* Country outlines */}
      {countries.features.map((f, i) => (
        <path key={i} d={pathGen(f)} fill="#0c160c" stroke="#1a3a1a" strokeWidth={0.4} />
      ))}

      {/* Lines from home to each spotter */}
      {homeXY && spotsWithPos.map(s => (
        <line
          key={`line-${s.id}`}
          x1={homeXY[0]} y1={homeXY[1]}
          x2={s.xy[0]}   y2={s.xy[1]}
          stroke={(BAND_COLORS[s.band] || '#00ff41') + '55'}
          strokeWidth={1}
        />
      ))}

      {/* Spotter dots */}
      {spotsWithPos.map(s => (
        <g key={`dot-${s.id}`}>
          <title>{s.spotter} {s.spotter_grid} | {s.band} {s.freq_mhz?.toFixed(3)} MHz | SNR +{s.snr_db}dB | {ageLabel(s.age_min)}</title>
          <circle
            cx={s.xy[0]} cy={s.xy[1]} r={4}
            fill={BAND_COLORS[s.band] || '#00ff41'}
            stroke="#000" strokeWidth={0.5}
            opacity={s.age_min > 20 ? 0.4 : 1}
          />
          <text
            x={s.xy[0] + 5} y={s.xy[1] + 3}
            fontSize={7} fill="#00aa2b"
            style={{ pointerEvents: 'none' }}
          >
            {s.spotter}
          </text>
        </g>
      ))}

      {/* Home position */}
      {homeXY && (
        <g>
          <circle cx={homeXY[0]} cy={homeXY[1]} r={6}
            fill="#00ff41" stroke="#000" strokeWidth={1} />
          <text
            x={homeXY[0] + 8} y={homeXY[1] + 4}
            fontSize={8} fill="#00ff41" fontWeight="bold"
            style={{ pointerEvents: 'none' }}
          >
            KJ5NUJ
          </text>
        </g>
      )}
    </svg>
  )
}

// ---- Spot row ----
function SpotRow({ spot, idx }) {
  const [now, setNow] = useState(Date.now())
  const age = spot.age_min + (now - Date.parse(spot.timestamp)) / 60000 - spot.age_min
  const actualAge = (now - Date.parse(spot.timestamp)) / 60000
  const km = spot.spotter_grid
    ? (() => {
        const pos = gridToLatLon(spot.spotter_grid)
        return pos ? haversineKm(HOME.lat, HOME.lon, pos.lat, pos.lon) : null
      })()
    : null

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '52px 90px 52px 70px 44px 44px 44px 1fr',
      gap: '4px',
      padding: '2px 6px',
      fontSize: '0.72rem',
      fontFamily: '"Share Tech Mono", monospace',
      background: idx % 2 === 0 ? 'transparent' : 'rgba(0,255,65,0.02)',
      opacity: actualAge > 20 ? 0.45 : 1,
      borderBottom: '1px solid #0d1a0d'
    }}>
      <span style={{ color: '#00551a' }}>
        {new Date(spot.timestamp).toISOString().slice(11, 15)}Z
      </span>
      <span style={{ color: '#00ff41' }}>{spot.spotter}</span>
      <span style={{ color: '#00551a', fontSize: '0.58rem' }}>{spot.spotter_grid || '----'}</span>
      <span style={{ color: '#ffb000' }}>{spot.freq_mhz?.toFixed(3)}</span>
      <span style={{ color: BAND_COLORS[spot.band] || '#00ff41', fontSize: '0.6rem' }}>
        {spot.band || '---'}
      </span>
      <span style={{ color: snrColor(spot.snr_db) }}>+{spot.snr_db}</span>
      <span style={{ color: '#00551a' }}>{ageLabel(spot.age_min)}</span>
      <span style={{ color: '#335533' }}>{km ? `${km.toLocaleString()}km` : ''}</span>
    </div>
  )
}

// ---- Stats row ----
function StatsRow({ spots }) {
  if (!spots.length) return null

  const bestDx = spots.reduce((best, s) => {
    const pos = s.spotter_grid ? gridToLatLon(s.spotter_grid) : null
    if (!pos) return best
    const km = haversineKm(HOME.lat, HOME.lon, pos.lat, pos.lon)
    return (!best || km > best.km) ? { call: s.spotter, km, snr: s.snr_db } : best
  }, null)

  const bestSnr = spots.reduce((b, s) => s.snr_db > (b?.snr_db ?? -99) ? s : b, null)

  const bandCounts = {}
  for (const s of spots) {
    if (s.band) bandCounts[s.band] = (bandCounts[s.band] || 0) + 1
  }
  const bandStr = Object.entries(bandCounts).map(([b, c]) => `${b}(${c})`).join(' ')

  const avgSnr = Math.round(spots.reduce((sum, s) => sum + s.snr_db, 0) / spots.length)

  return (
    <div style={{
      fontSize: '0.58rem',
      color: '#00551a',
      padding: '3px 4px',
      borderTop: '1px solid #1a3a1a',
      borderBottom: '1px solid #1a3a1a',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }}>
      {bestSnr && (
        <span style={{ color: '#00aa2b' }}>Best: {bestSnr.spotter} +{bestSnr.snr_db}dB</span>
      )}
      {bandStr && <span> | Bands: {bandStr}</span>}
      <span> | Avg SNR: +{avgSnr}dB</span>
      {bestDx && <span> | DX: {bestDx.call} {bestDx.km.toLocaleString()}km</span>}
    </div>
  )
}

// ---- Main panel ----
export default function RBNPanel() {
  const pushed  = useIPCEvent(window.api?.rbn?.onSpots, null)
  const [spots, setSpots]       = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [tick, setTick]         = useState(0)

  // Pull on mount
  useEffect(() => {
    window.api?.rbn?.get().then(data => { if (data) setSpots(data) })
  }, [])

  // Push updates
  useEffect(() => {
    if (pushed !== null) setSpots(pushed)
  }, [pushed])

  // Live age update every 30s
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    const data = await window.api?.rbn?.refresh()
    if (data) setSpots(data)
    setRefreshing(false)
  }

  const recentSpots = spots.filter(s => s.age_min <= 30)
  const lastSpot    = spots[0]

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span>RBN — KJ5NUJ</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {recentSpots.length > 0 ? (
            <span style={{ fontSize: '0.58rem', color: '#00551a' }}>
              {recentSpots.length} skimmer{recentSpots.length !== 1 ? 's' : ''} (30m)
              {lastSpot && (
                <span style={{ color: '#ffb000', marginLeft: '6px' }}>
                  last: {lastSpot.freq_mhz?.toFixed(3)} {lastSpot.mode}
                </span>
              )}
            </span>
          ) : (
            <span style={{ fontSize: '0.58rem', color: '#ffb000' }}>NO RECENT SPOTS</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-green"
            style={{ fontSize: '0.55rem', padding: '2px 6px', opacity: refreshing ? 0.5 : 1 }}
          >
            {refreshing ? '…' : 'REFRESH'}
          </button>
        </div>
      </div>

      {/* Map — grows to fill available vertical space */}
      <div style={{ flex: '1 1 auto', minHeight: '350px', borderBottom: '1px solid #1a3a1a', overflow: 'hidden' }}>
        <RBNMap spots={spots} />
      </div>

      {/* Band color legend */}
      <div style={{
        display: 'flex', gap: '6px', padding: '2px 4px',
        fontSize: '0.52rem', flexShrink: 0, flexWrap: 'wrap',
        borderBottom: '1px solid #1a3a1a'
      }}>
        {Object.entries(BAND_COLORS).map(([band, color]) => (
          <span key={band}>
            <span style={{ color, marginRight: '2px' }}>●</span>
            <span style={{ color: '#00551a' }}>{band}</span>
          </span>
        ))}
      </div>

      {/* Stats */}
      {spots.length > 0 && <StatsRow spots={spots} />}

      {/* No spots message */}
      {spots.length === 0 && (
        <div style={{
          textAlign: 'center', color: '#335533', fontSize: '0.72rem',
          letterSpacing: '0.1em', padding: '12px', flexShrink: 0
        }}>
          NO SPOTS — RBN only logs KJ5NUJ when actively TX&apos;ing CW/RTTY
        </div>
      )}

      {/* Table header */}
      {spots.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '52px 90px 52px 70px 44px 44px 44px 1fr',
          gap: '4px', padding: '2px 4px', flexShrink: 0,
          borderBottom: '1px solid #1a3a1a'
        }}>
          {['TIME', 'SPOTTER', 'GRID', 'FREQ', 'BAND', 'SNR', 'AGE', 'DIST'].map(h => (
            <span key={h} style={{ fontSize: '0.5rem', color: '#00441a', letterSpacing: '0.08em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* Spot list — capped at 10 rows / 200px */}
      <div style={{ maxHeight: '200px', overflowY: 'auto', flexShrink: 0 }}>
        {spots.slice(0, 10).map((s, i) => (
          <SpotRow key={s.id} spot={s} idx={i} tick={tick} />
        ))}
      </div>
    </div>
  )
}
