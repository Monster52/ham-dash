import React, { useState, useEffect } from 'react'
import { useIPCEvent } from '../hooks/useIPC'

const BANDS = ['80m', '40m', '20m', '17m', '15m', '12m', '10m']

const BAND_MUF_THRESHOLDS = {
  '10m': [28, 23],
  '15m': [21, 17],
  '17m': [18, 15],
}

function mufStatus(muf, band) {
  const t = BAND_MUF_THRESHOLDS[band]
  if (!t || muf == null) return null
  if (muf >= t[0]) return 'OPEN'
  if (muf >= t[1]) return 'MARG'
  return 'CLSD'
}

const STATUS_COLOR = { OPEN: '#00ff41', MARG: '#ffb000', CLSD: '#ff2200' }

function kColor(k) {
  const n = parseFloat(k)
  if (isNaN(n)) return '#00551a'
  if (n >= 5) return '#ff2200'
  if (n >= 3) return '#ffb000'
  return '#00ff41'
}

function isDaytime() {
  const h = new Date().getUTCHours()
  return h >= 6 && h < 20
}

function bandCondColor(c) {
  if (!c) return '#335533'
  const l = c.toLowerCase()
  if (l === 'good') return '#00ff41'
  if (l === 'fair') return '#ffb000'
  if (l === 'poor') return '#ff2200'
  return '#335533'
}

function bandCondLetter(c) {
  if (!c) return '?'
  const l = c.toLowerCase()
  if (l === 'good') return 'G'
  if (l === 'fair') return 'F'
  if (l === 'poor') return 'P'
  return '?'
}

export default function BandConditions() {
  const pushed = useIPCEvent(window.api?.propagation?.onData, null)
  const [pulled, setPulled] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    window.api?.propagation?.get().then(setPulled)
  }, [])

  const raw = pushed ?? pulled
  const hasError = raw?.error != null
  const propData = hasError ? null : raw
  const muf = propData?.muf
  const daytime = isDaytime()

  const handleRefresh = async () => {
    setRefreshing(true)
    await window.api?.propagation?.refresh()
    setRefreshing(false)
  }

  const lbl = { color: '#00551a', marginRight: '3px', fontSize: '0.7rem' }
  const val = { fontSize: '0.85rem' }
  const row = { display: 'flex', alignItems: 'center', gap: '10px', padding: '3px 0' }

  return (
    <div style={{
      background: '#0f1a0f',
      border: '1px solid #1a3a1a',
      borderRadius: '4px',
      boxShadow: '0 0 8px rgba(0,255,65,0.15)',
      padding: '6px',
      fontFamily: '"Share Tech Mono", monospace'
    }}>
      {/* Row 1: header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
        <span style={{ fontSize: '0.62rem', color: '#00aa2b', letterSpacing: '0.12em' }}>
          BAND CONDITIONS
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {hasError && <span style={{ fontSize: '0.58rem', color: '#ff2200' }}>UNAVAIL</span>}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              background: 'transparent', border: '1px solid #1a3a1a', color: '#00551a',
              fontFamily: '"Share Tech Mono", monospace', fontSize: '0.58rem',
              padding: '1px 6px', cursor: 'pointer', opacity: refreshing ? 0.5 : 1
            }}
          >
            {refreshing ? '…' : 'REFRESH'}
          </button>
        </div>
      </div>

      {/* Row 2: solar indices */}
      <div style={{ ...row, borderTop: '1px solid #111f11', paddingTop: '4px' }}>
        {[
          ['SFI', propData?.sfi, null],
          ['A',   propData?.aindex, null],
          ['K',   propData?.kindex, kColor(propData?.kindex)],
          ['X',   propData?.xray, null],
          ['SN',  propData?.sunspots, null],
        ].map(([label, value, color]) => (
          <span key={label}>
            <span style={lbl}>{label}:</span>
            <span style={{ ...val, color: color || (value != null ? '#00ff41' : '#335533') }}>
              {value ?? '---'}
            </span>
          </span>
        ))}
      </div>

      {/* Row 3: MUF + foF2 + open indicators */}
      <div style={{ ...row, borderTop: '1px solid #111f11' }}>
        <span>
          <span style={lbl}>MUF:</span>
          <span style={{ ...val, color: muf ? '#00ff41' : '#335533' }}>
            {muf ? `${muf.muf}MHz` : '--'}
          </span>
          {muf && (
            <span
              title="Estimated from SFI + K-index (URSI formula, ±2–3 MHz)"
              style={{ color: '#ffb000', fontSize: '0.6rem', marginLeft: '3px', cursor: 'help' }}
            >
              [est.]
            </span>
          )}
        </span>
        <span>
          <span style={lbl}>foF2:</span>
          <span style={{ ...val, color: muf ? '#00aa2b' : '#335533' }}>
            {muf ? `${muf.foF2}MHz` : '--'}
          </span>
        </span>
        {['10m', '15m', '17m'].map(band => {
          const status = muf?.muf != null ? mufStatus(muf.muf, band) : null
          const color = status ? STATUS_COLOR[status] : '#335533'
          return (
            <span key={band}>
              <span style={{ ...lbl }}>{band}:</span>
              <span style={{ ...val, color }}>{status ?? '--'}</span>
            </span>
          )
        })}
      </div>

      {/* Row 4: band badges */}
      <div style={{ display: 'flex', gap: '4px', paddingTop: '4px', borderTop: '1px solid #111f11', flexWrap: 'nowrap' }}>
        {BANDS.map(band => {
          const cond = daytime
            ? (propData?.bands?.[band]?.day ?? propData?.bands?.[band]?.night)
            : (propData?.bands?.[band]?.night ?? propData?.bands?.[band]?.day)
          const color = bandCondColor(cond)
          const letter = bandCondLetter(cond)
          return (
            <span
              key={band}
              title={`${band}: ${cond || 'unknown'} (${daytime ? 'day' : 'night'})`}
              style={{
                display: 'inline-flex', gap: '3px', alignItems: 'center',
                padding: '2px 5px',
                background: `${color}18`,
                border: `1px solid ${color}55`,
                fontSize: '0.68rem',
                cursor: 'default',
                whiteSpace: 'nowrap'
              }}
            >
              <span style={{ color: '#00551a' }}>{band}</span>
              <span style={{ color, fontWeight: 'bold' }}>{letter}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
