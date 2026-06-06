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

const POTA_FILTER_KEYS = ['40m CW', '15m CW', '10m CW', '10m SSB']
const POTA_COLS = '44px 80px 58px 34px 36px 52px 1fr 60px'

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

function formatTime(spotTime) {
  if (!spotTime) return '----z'
  try { return new Date(spotTime).toISOString().slice(11, 15) + 'z' } catch { return '----z' }
}

// ---- Map component ----
const VP_W = 1000
const VP_H = 500

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

function RBNMap({ mode, rbnSpots, potaSpots }) {
  const countries = useMemo(
    () => feature(worldData, worldData.objects.countries),
    []
  )
  const graticule = useMemo(() => geoGraticule()(), [])
  const projection = useMemo(() =>
    geoEquirectangular().fitSize([VP_W, VP_H], BOUNDS_GEOJSON),
    []
  )
  const pathGen = useMemo(() => geoPath(projection), [projection])
  const homeXY = projection([HOME.lon, HOME.lat])

  const rbnSpotsWithPos = useMemo(() =>
    rbnSpots
      .map(s => {
        const pos = s.spotter_grid ? gridToLatLon(s.spotter_grid) : null
        const xy  = pos ? projection([pos.lon, pos.lat]) : null
        const km  = pos ? haversineKm(HOME.lat, HOME.lon, pos.lat, pos.lon) : null
        return { ...s, xy, km }
      })
      .filter(s => s.xy),
    [rbnSpots, projection]
  )

  const potaSpotsWithPos = useMemo(() =>
    potaSpots
      .filter(s => s.park_lat != null && s.park_lon != null)
      .map(s => {
        const xy = projection([s.park_lon, s.park_lat])
        return { ...s, xy }
      })
      .filter(s => s.xy),
    [potaSpots, projection]
  )

  return (
    <svg
      viewBox={`0 0 ${VP_W} ${VP_H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%', display: 'block', background: '#0a0f0a', margin: 0, padding: 0 }}
    >
      <path d={pathGen(graticule)} fill="none" stroke="#0f1a0f" strokeWidth={0.5} />
      {countries.features.map((f, i) => (
        <path key={i} d={pathGen(f)} fill="#0c160c" stroke="#1a3a1a" strokeWidth={0.4} />
      ))}

      {mode === 'rbn' ? (
        <>
          {homeXY && rbnSpotsWithPos.map(s => (
            <line
              key={`line-${s.id}`}
              x1={homeXY[0]} y1={homeXY[1]}
              x2={s.xy[0]}   y2={s.xy[1]}
              stroke={(BAND_COLORS[s.band] || '#00ff41') + '55'}
              strokeWidth={1}
            />
          ))}
          {rbnSpotsWithPos.map(s => (
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
        </>
      ) : (
        <>
          {homeXY && potaSpotsWithPos.map(s => (
            <line
              key={`pline-${s.id}`}
              x1={homeXY[0]} y1={homeXY[1]}
              x2={s.xy[0]}   y2={s.xy[1]}
              stroke={(BAND_COLORS[s.band] || '#00ff41') + '55'}
              strokeWidth={1}
            />
          ))}
          {potaSpotsWithPos.map(s => (
            <g
              key={`pdot-${s.id}`}
              onClick={() => window.api?.rig?.setFreq(s.freq_hz)}
              style={{ cursor: 'pointer' }}
            >
              <title>{`${s.activator} @ ${s.reference}\n${s.park_name_full || s.parkName}\n${s.freq_mhz?.toFixed(3)} MHz ${s.mode} | ${ageLabel(s.age_min)}`}</title>
              <circle
                cx={s.xy[0]} cy={s.xy[1]} r={5}
                fill={BAND_COLORS[s.band] || '#00ff41'}
                stroke="#000" strokeWidth={0.5}
                opacity={s.age_min > 30 ? 0.4 : 1}
              />
            </g>
          ))}
        </>
      )}

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

// ---- Tab button ----
function TabBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid #00ff41' : '2px solid transparent',
        color: active ? '#00ff41' : '#004d1a',
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: '0.62rem',
        letterSpacing: '0.1em',
        padding: '2px 10px 4px',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

// ---- RBN spot row ----
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
      opacity: actualAge > 120 ? 0.45 : 1,
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

// ---- RBN stats row ----
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

// ---- POTA spot row ----
function POTARow({ spot, idx, onClick }) {
  const [hovered, setHovered] = useState(false)
  const isFresh = spot.age_min < 5
  const isStale = spot.age_min > 30

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: POTA_COLS,
        gap: '4px',
        padding: '2px 6px',
        fontSize: '0.72rem',
        fontFamily: '"Share Tech Mono", monospace',
        background: hovered
          ? 'rgba(0,255,65,0.05)'
          : idx % 2 === 0 ? 'transparent' : 'rgba(0,255,65,0.02)',
        opacity: isStale ? 0.5 : 1,
        borderBottom: '1px solid #0d1a0d',
        borderLeft: isFresh ? '2px solid #00ff41' : '2px solid transparent',
        cursor: 'pointer',
      }}
    >
      <span style={{ color: '#00551a' }}>{formatTime(spot.spotTime)}</span>
      <span style={{ color: '#00ff41' }}>{spot.activator}</span>
      <span style={{ color: '#ffb000' }}>{spot.freq_mhz?.toFixed(3)}</span>
      <span style={{ color: BAND_COLORS[spot.band] || '#00ff41', fontSize: '0.6rem' }}>{spot.band}</span>
      <span style={{ color: spot.mode === 'CW' ? '#00ff41' : '#00ddff' }}>{spot.mode}</span>
      <span style={{ color: '#00551a' }}>{spot.reference}</span>
      <span
        style={{ color: '#335533', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={spot.park_name_full || spot.parkName}
      >
        {(spot.park_name_full || spot.parkName || '').slice(0, 22)}
      </span>
      <span style={{ color: '#335533', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {(spot.locationDesc || '').slice(0, 10)}
      </span>
    </div>
  )
}

// ---- Main panel ----
export default function RBNPanel() {
  const pushed     = useIPCEvent(window.api?.rbn?.onSpots, null)
  const potaPushed = useIPCEvent(window.api?.pota?.onSpots, null)

  const [spots, setSpots]               = useState([])
  const [potaSpots, setPotaSpots]       = useState([])
  const [potaFilters, setPotaFilters]   = useState(
    { '40m CW': true, '15m CW': true, '10m CW': true, '10m SSB': true }
  )
  const [potaLastUpdate, setPotaLastUpdate] = useState(null)
  const [activeTab, setActiveTab]       = useState('rbn')
  const [refreshing, setRefreshing]     = useState(false)
  const [tick, setTick]                 = useState(0)

  useEffect(() => {
    window.api?.rbn?.get().then(data => { if (data) setSpots(data) })
    window.api?.pota?.get().then(data => {
      if (data?.length) {
        setPotaSpots(data)
        setPotaLastUpdate(new Date().toISOString().slice(11, 15) + 'z')
      }
    })
  }, [])

  useEffect(() => { if (pushed !== null) setSpots(pushed) }, [pushed])

  useEffect(() => {
    if (potaPushed !== null) {
      setPotaSpots(potaPushed)
      setPotaLastUpdate(new Date().toISOString().slice(11, 15) + 'z')
    }
  }, [potaPushed])

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const filteredPota = useMemo(() =>
    potaSpots.filter(s => {
      if (s.age_min > 60) return false
      if (s.band === '40m' && s.mode === 'CW')  return potaFilters['40m CW']
      if (s.band === '15m' && s.mode === 'CW')  return potaFilters['15m CW']
      if (s.band === '10m' && s.mode === 'CW')  return potaFilters['10m CW']
      if (s.band === '10m' && s.mode === 'SSB') return potaFilters['10m SSB']
      return false
    }),
    [potaSpots, potaFilters]
  )

  const potaStats = useMemo(() => {
    const active = potaSpots.filter(s => s.age_min <= 60)
    return {
      '40m':    active.filter(s => s.band === '40m').length,
      '15m':    active.filter(s => s.band === '15m').length,
      '10m CW': active.filter(s => s.band === '10m' && s.mode === 'CW').length,
      '10m SSB':active.filter(s => s.band === '10m' && s.mode === 'SSB').length,
    }
  }, [potaSpots])

  const handleRefresh = async () => {
    setRefreshing(true)
    if (activeTab === 'rbn') {
      const data = await window.api?.rbn?.refresh()
      if (data) setSpots(data)
    } else {
      const data = await window.api?.pota?.refresh()
      if (data) {
        setPotaSpots(data)
        setPotaLastUpdate(new Date().toISOString().slice(11, 15) + 'z')
      }
    }
    setRefreshing(false)
  }

  const handlePotaRowClick = (spot) => {
    window.api?.rig?.setFreq(spot.freq_hz)
    window.api?.qso?.prefill({ callsign: spot.activator, freq_mhz: spot.freq_mhz, mode: spot.mode })
  }

  const recentSpots = spots.filter(s => s.age_min <= 720)
  const lastSpot    = spots[0]

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>

      {/* Tab bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0, padding: '4px 8px 0 8px', borderBottom: '1px solid #1a3a1a'
      }}>
        <div style={{ display: 'flex' }}>
          <TabBtn label="RBN SPOTS"   active={activeTab === 'rbn'}  onClick={() => setActiveTab('rbn')} />
          <TabBtn label="POTA HUNTER" active={activeTab === 'pota'} onClick={() => setActiveTab('pota')} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '4px' }}>
          {activeTab === 'rbn' ? (
            recentSpots.length > 0 ? (
              <span style={{ fontSize: '0.58rem', color: '#00551a' }}>
                {recentSpots.length} skimmer{recentSpots.length !== 1 ? 's' : ''} (12h)
                {lastSpot && (
                  <span style={{ color: '#ffb000', marginLeft: '6px' }}>
                    last: {lastSpot.freq_mhz?.toFixed(3)} {lastSpot.mode}
                  </span>
                )}
              </span>
            ) : (
              <span style={{ fontSize: '0.58rem', color: '#ffb000' }}>NO RECENT SPOTS</span>
            )
          ) : (
            filteredPota.length > 0 ? (
              <span style={{ fontSize: '0.58rem', color: '#00551a' }}>
                {filteredPota.length} active
                {potaLastUpdate && (
                  <span style={{ marginLeft: '6px' }}>| updated {potaLastUpdate}</span>
                )}
              </span>
            ) : (
              <span style={{ fontSize: '0.58rem', color: '#ffb000' }}>NO ACTIVE SPOTS</span>
            )
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

      {/* Map — always visible, switches content by tab */}
      <div style={{ flex: '3 1 0', minHeight: '200px', borderBottom: '1px solid #1a3a1a', overflow: 'hidden', margin: 0, padding: 0 }}>
        <RBNMap mode={activeTab} rbnSpots={spots} potaSpots={filteredPota} />
      </div>

      {/* Band legend — always visible */}
      <div style={{
        display: 'flex', gap: '6px', padding: '2px 8px',
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

      {/* Below-map content — switches by tab */}
      {activeTab === 'rbn' ? (
        <>
          {spots.length > 0 && <StatsRow spots={spots} />}
          {spots.length === 0 && (
            <div style={{
              textAlign: 'center', color: '#335533', fontSize: '0.72rem',
              letterSpacing: '0.1em', padding: '8px', flexShrink: 0
            }}>
              NO SPOTS — RBN only logs KJ5NUJ when actively TX&apos;ing CW/RTTY
            </div>
          )}
          {spots.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '52px 90px 52px 70px 44px 44px 44px 1fr',
              gap: '4px', padding: '2px 8px', flexShrink: 0,
              borderBottom: '1px solid #1a3a1a'
            }}>
              {['TIME', 'SPOTTER', 'GRID', 'FREQ', 'BAND', 'SNR', 'AGE', 'DIST'].map(h => (
                <span key={h} style={{ fontSize: '0.5rem', color: '#00441a', letterSpacing: '0.08em' }}>{h}</span>
              ))}
            </div>
          )}
          <div style={{ overflowY: 'auto', flex: '1 1 0', minHeight: '80px', paddingBottom: '4px' }}>
            {spots.slice(0, 10).map((s, i) => (
              <SpotRow key={s.id} spot={s} idx={i} tick={tick} />
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Filter toggles */}
          <div style={{
            display: 'flex', gap: '4px', padding: '3px 8px',
            flexShrink: 0, flexWrap: 'wrap', borderBottom: '1px solid #1a3a1a'
          }}>
            {POTA_FILTER_KEYS.map(key => (
              <button
                key={key}
                onClick={() => setPotaFilters(f => ({ ...f, [key]: !f[key] }))}
                style={{
                  background: potaFilters[key] ? 'rgba(0,255,65,0.12)' : 'transparent',
                  border: `1px solid ${potaFilters[key] ? '#00ff41' : '#1a3a1a'}`,
                  color: potaFilters[key] ? '#00ff41' : '#335533',
                  fontFamily: '"Share Tech Mono", monospace',
                  fontSize: '0.52rem', padding: '1px 7px',
                  cursor: 'pointer', letterSpacing: '0.08em',
                }}
              >
                {key}
              </button>
            ))}
          </div>

          {/* Stats bar */}
          <div style={{
            fontSize: '0.55rem', color: '#00551a', padding: '2px 8px',
            flexShrink: 0, borderBottom: '1px solid #1a3a1a'
          }}>
            <span style={{ color: BAND_COLORS['40m'] }}>40m: {potaStats['40m']}</span>
            {' | '}
            <span style={{ color: BAND_COLORS['15m'] }}>15m: {potaStats['15m']}</span>
            {' | '}
            <span style={{ color: BAND_COLORS['10m'] }}>10m CW: {potaStats['10m CW']}</span>
            {' | '}
            <span style={{ color: BAND_COLORS['10m'] }}>10m SSB: {potaStats['10m SSB']}</span>
          </div>

          {/* Table header */}
          {filteredPota.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: POTA_COLS,
              gap: '4px', padding: '2px 8px', flexShrink: 0,
              borderBottom: '1px solid #1a3a1a'
            }}>
              {['TIME', 'ACTIVATOR', 'FREQ', 'BAND', 'MODE', 'REF', 'PARK', 'STATE'].map(h => (
                <span key={h} style={{ fontSize: '0.5rem', color: '#00441a', letterSpacing: '0.08em' }}>{h}</span>
              ))}
            </div>
          )}

          {filteredPota.length === 0 ? (
            <div style={{
              textAlign: 'center', color: '#ffb000', fontSize: '0.72rem',
              letterSpacing: '0.1em', height: '50px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0
            }}>
              NO ACTIVE POTA STATIONS ON 40/15/10m
            </div>
          ) : (
            <div style={{ overflowY: 'auto', flex: '1 1 0', minHeight: '80px', paddingBottom: '4px' }}>
              {filteredPota.map((s, i) => (
                <POTARow key={s.id} spot={s} idx={i} onClick={() => handlePotaRowClick(s)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
