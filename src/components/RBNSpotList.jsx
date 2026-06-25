import React, { useState, useEffect, useMemo } from 'react'
import { useIPCEvent, useStationConfig } from '../hooks/useIPC'

const HOME = { lat: 30.35, lon: -89.15 }

const BAND_COLORS = {
  '160m': '#cc44ff', '80m': '#ff6600', '40m': '#ffb000',
  '30m': '#44ffaa', '20m': '#00ff41', '17m': '#00ddff',
  '15m': '#00aaff', '12m': '#ff44aa', '10m': '#ff2200'
}

function gridToLatLon(grid) {
  if (!grid || grid.length < 4) return null
  const g = grid.toUpperCase()
  const lon = (g.charCodeAt(0) - 65) * 20 - 180 + parseInt(g[2]) * 2 + 1
  const lat = (g.charCodeAt(1) - 65) * 10 - 90  + parseInt(g[3]) + 0.5
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

function SpotRow({ spot, idx }) {
  const actualAge = (Date.now() - Date.parse(spot.timestamp)) / 60000
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
      gap: '4px', padding: '2px 6px', fontSize: '0.72rem',
      fontFamily: '"Share Tech Mono", monospace',
      background: idx % 2 === 0 ? 'transparent' : 'rgba(0,255,65,0.02)',
      opacity: actualAge > 120 ? 0.45 : 1,
      borderBottom: '1px solid #0d1a0d',
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

function StatsRow({ spots }) {
  if (!spots.length) return null

  const bestDx = spots.reduce((best, s) => {
    const pos = s.spotter_grid ? gridToLatLon(s.spotter_grid) : null
    if (!pos) return best
    const km = haversineKm(HOME.lat, HOME.lon, pos.lat, pos.lon)
    return (!best || km > best.km) ? { call: s.spotter, km, snr: s.snr_db } : best
  }, null)

  const bestSnr  = spots.reduce((b, s) => s.snr_db > (b?.snr_db ?? -99) ? s : b, null)
  const bandCounts = {}
  for (const s of spots) {
    if (s.band) bandCounts[s.band] = (bandCounts[s.band] || 0) + 1
  }
  const bandStr = Object.entries(bandCounts).map(([b, c]) => `${b}(${c})`).join(' ')
  const avgSnr  = Math.round(spots.reduce((sum, s) => sum + s.snr_db, 0) / spots.length)

  return (
    <div style={{
      fontSize: '0.58rem', color: '#00551a', padding: '3px 6px',
      borderTop: '1px solid #1a3a1a', flexShrink: 0,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {bestSnr && <span style={{ color: '#00aa2b' }}>Best: {bestSnr.spotter} +{bestSnr.snr_db}dB</span>}
      {bandStr && <span> | Bands: {bandStr}</span>}
      <span> | Avg SNR: +{avgSnr}dB</span>
      {bestDx && <span> | DX: {bestDx.call} {bestDx.km.toLocaleString()}km</span>}
    </div>
  )
}

export default function RBNSpotList() {
  const { callsign } = useStationConfig()
  const pushed = useIPCEvent(window.api?.rbn?.onSpots, null)
  const [spots, setSpots]       = useState([])
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    window.api?.rbn?.get().then(data => { if (data) setSpots(data) })
  }, [])

  useEffect(() => { if (pushed !== null) setSpots(pushed) }, [pushed])

  const handleRefresh = async () => {
    setRefreshing(true)
    const data = await window.api?.rbn?.refresh()
    if (data) setSpots(data)
    setRefreshing(false)
  }

  const recentSpots = useMemo(() => spots.filter(s => s.age_min <= 720), [spots])

  return (
    <div style={{
      background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: '4px',
      boxShadow: '0 0 8px rgba(0,255,65,0.15)',
      fontFamily: '"Share Tech Mono", monospace',
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '3px 6px', flexShrink: 0, borderBottom: '1px solid #111f11',
      }}>
        <span style={{ fontSize: '0.62rem', color: '#00aa2b', letterSpacing: '0.12em' }}>
          RBN SPOTS — {callsign}
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.58rem', color: recentSpots.length > 0 ? '#00551a' : '#ffb000' }}>
            {recentSpots.length > 0 ? `${recentSpots.length} spots` : 'NO RECENT SPOTS'}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              background: 'transparent', border: '1px solid #1a3a1a', color: '#00551a',
              fontFamily: '"Share Tech Mono", monospace', fontSize: '0.55rem',
              padding: '1px 6px', cursor: 'pointer', opacity: refreshing ? 0.5 : 1,
            }}
          >
            {refreshing ? '…' : 'REFRESH'}
          </button>
        </div>
      </div>

      {/* Column headers */}
      {recentSpots.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '52px 90px 52px 70px 44px 44px 44px 1fr',
          gap: '4px', padding: '2px 6px', flexShrink: 0,
          borderBottom: '1px solid #111f11',
        }}>
          {['TIME', 'SPOTTER', 'GRID', 'FREQ', 'BAND', 'SNR', 'AGE', 'DIST'].map(h => (
            <span key={h} style={{ fontSize: '0.5rem', color: '#00441a', letterSpacing: '0.08em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* Spot rows */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {recentSpots.length === 0 ? (
          <div style={{
            padding: '10px 6px', fontSize: '0.65rem', color: '#335533',
            textAlign: 'center', letterSpacing: '0.1em',
          }}>
            NO SPOTS — RBN only logs {callsign} when actively TX&apos;ing CW/RTTY
          </div>
        ) : (
          recentSpots.slice(0, 8).map((s, i) => <SpotRow key={s.id} spot={s} idx={i} />)
        )}
      </div>

      {/* Stats row */}
      <StatsRow spots={recentSpots} />
    </div>
  )
}
