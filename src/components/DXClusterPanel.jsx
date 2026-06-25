import React, { useState, useEffect } from 'react'
import { useIPCEvent } from '../hooks/useIPC'

const BAND_COLORS = {
  '160m': '#cc44ff', '80m': '#ff6600', '40m': '#ffb000',
  '30m': '#44ffaa', '20m': '#00ff41', '17m': '#00ddff',
  '15m': '#00aaff', '12m': '#ff44aa', '10m': '#ff2200', '6m': '#ff00ff'
}

const COLS = '42px 38px 72px 72px 80px 1fr'

function formatFreq(khz) {
  if (!khz && khz !== 0) return '---'
  const mhz = khz / 1000
  return mhz >= 10 ? mhz.toFixed(2) : mhz.toFixed(3)
}

function SpotRow({ spot, idx }) {
  const bandColor = BAND_COLORS[spot.band] || '#00ff41'
  const bg = idx % 2 === 0 ? 'transparent' : 'rgba(0,255,65,0.02)'

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: COLS,
      gap: '4px', padding: '1px 6px',
      background: bg, alignItems: 'center',
      borderBottom: '1px solid rgba(0,255,65,0.04)',
    }}>
      <span style={{ fontSize: '0.6rem', color: '#00aa2b', letterSpacing: '0.04em' }}>
        {spot.time || '--:--'}
      </span>
      <span style={{ fontSize: '0.6rem', color: bandColor, fontWeight: 'bold' }}>
        {spot.band || '--'}
      </span>
      <span style={{ fontSize: '0.65rem', color: '#00ff41', letterSpacing: '0.04em' }}>
        {spot.dxCall}
      </span>
      <span style={{ fontSize: '0.6rem', color: '#00aa2b' }}>
        {formatFreq(spot.freq)} MHz
      </span>
      <span style={{ fontSize: '0.58rem', color: '#00551a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {spot.spotter}
      </span>
      <span style={{ fontSize: '0.55rem', color: '#335533', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {spot.comment}
      </span>
    </div>
  )
}

const STATUS_COLOR = { connected: '#00ff41', disconnected: '#ff2200', retrying: '#ffb000' }

export default function DXClusterPanel() {
  const statusPush = useIPCEvent(window.api?.dxcluster?.onStatus, null)
  const spotPush   = useIPCEvent(window.api?.dxcluster?.onSpot, null)
  const [spots, setSpots]   = useState([])
  const [connStatus, setConnStatus] = useState('retrying')

  useEffect(() => {
    window.api?.dxcluster?.get().then(d => { if (d?.length) setSpots(d) })
    window.api?.dxcluster?.getStatus().then(s => { if (s) setConnStatus(s) })
  }, [])

  useEffect(() => {
    if (statusPush !== null) setConnStatus(statusPush.status)
  }, [statusPush])

  useEffect(() => {
    if (spotPush === null) return
    setSpots(prev => [spotPush, ...prev].slice(0, 50))
  }, [spotPush])

  const dotColor = STATUS_COLOR[connStatus] || '#ffb000'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '2px 6px', flexShrink: 0, borderBottom: '1px solid #111f11',
      }}>
        <span style={{ fontSize: '0.62rem', color: '#00aa2b', letterSpacing: '0.12em' }}>
          DX CLUSTER
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: dotColor, boxShadow: `0 0 4px ${dotColor}`,
            display: 'inline-block'
          }} />
          <span style={{ fontSize: '0.52rem', color: dotColor }}>
            {connStatus.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: COLS,
        gap: '4px', padding: '1px 6px', flexShrink: 0,
        borderBottom: '1px solid #111f11',
      }}>
        {['TIME', 'BAND', 'DX CALL', 'FREQ', 'SPOTTER', 'COMMENT'].map(h => (
          <span key={h} style={{ fontSize: '0.5rem', color: '#00441a', letterSpacing: '0.06em' }}>{h}</span>
        ))}
      </div>

      {/* Spot list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {spots.length === 0 ? (
          <div style={{
            padding: '10px 6px', fontSize: '0.62rem', color: '#335533',
            textAlign: 'center', letterSpacing: '0.1em',
          }}>
            {connStatus === 'connected' ? 'WAITING FOR SPOTS...' : 'CONNECTING TO DX CLUSTER...'}
          </div>
        ) : (
          spots.map((s, i) => <SpotRow key={s.id} spot={s} idx={i} />)
        )}
      </div>

      {/* Footer count */}
      <div style={{
        padding: '1px 6px', flexShrink: 0, borderTop: '1px solid #111f11',
        fontSize: '0.5rem', color: '#00441a',
      }}>
        {spots.length} spot{spots.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
