import React from 'react'
import { useIPCEvent } from '../hooks/useIPC'

export default function GridPanel() {
  const gps = useIPCEvent(window.api?.gps?.onStatus, {
    connected: false,
    locked: false,
    lat: null,
    lon: null,
    grid: '??????'
  })

  const connected = gps?.connected
  const locked = gps?.locked

  const formatCoord = (val, posLabel, negLabel) => {
    if (val == null) return '---'
    const abs = Math.abs(val).toFixed(5)
    const dir = val >= 0 ? posLabel : negLabel
    return `${abs}° ${dir}`
  }

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>GPS / GRID SQUARE</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span
            style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: connected ? (locked ? '#00ff41' : '#ffb000') : '#ff2200',
              boxShadow: connected ? (locked ? '0 0 4px #00ff41' : '0 0 4px #ffb000') : '0 0 4px #ff2200',
              display: 'inline-block'
            }}
          />
          <span style={{
            fontSize: '0.55rem',
            color: connected ? (locked ? '#00ff41' : '#ffb000') : '#ff2200'
          }}>
            {!connected ? 'OFFLINE' : locked ? 'LOCKED' : 'NO FIX'}
          </span>
        </span>
      </div>

      {/* Large Grid Square Display */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px'
        }}
      >
        <div
          style={{
            fontSize: '3rem',
            letterSpacing: '0.2em',
            color: locked ? '#00ff41' : '#335533',
            textShadow: locked
              ? '0 0 20px rgba(0,255,65,0.6), 0 0 40px rgba(0,255,65,0.2)'
              : 'none',
            fontFamily: '"Share Tech Mono", monospace',
            lineHeight: 1
          }}
        >
          {gps?.grid || 'EM50JI'}
        </div>

        <div style={{ textAlign: 'center', lineHeight: 1.8 }}>
          <div style={{ fontSize: '0.75rem', color: '#00aa2b', letterSpacing: '0.05em' }}>
            {formatCoord(gps?.lat, 'N', 'S')}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#00aa2b', letterSpacing: '0.05em' }}>
            {formatCoord(gps?.lon, 'E', 'W')}
          </div>
        </div>

        {!connected && (
          <div
            style={{
              fontSize: '0.65rem',
              color: '#ff2200',
              letterSpacing: '0.15em',
              border: '1px solid #440000',
              padding: '4px 12px'
            }}
          >
            GPSD OFFLINE
          </div>
        )}

        {connected && !locked && (
          <div
            style={{
              fontSize: '0.65rem',
              color: '#ffb000',
              letterSpacing: '0.15em',
              border: '1px solid #443300',
              padding: '4px 12px',
              animation: 'status-blink 1s ease-in-out infinite'
            }}
          >
            ACQUIRING SATELLITES...
          </div>
        )}
      </div>

      {/* Default grid callout */}
      <div
        style={{
          fontSize: '0.55rem',
          color: '#00551a',
          textAlign: 'center',
          borderTop: '1px solid #1a3a1a',
          paddingTop: '5px'
        }}
      >
        {locked ? 'GPS FIX' : 'DEFAULT: EM50JI'}
      </div>
    </div>
  )
}
