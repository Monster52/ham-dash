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

function bandCondColor(condition) {
  if (!condition) return '#335533'
  const c = condition.toLowerCase()
  if (c === 'good') return '#00ff41'
  if (c === 'fair') return '#ffb000'
  if (c === 'poor') return '#ff2200'
  return '#335533'
}

function bandCondLetter(condition) {
  if (!condition) return '?'
  const c = condition.toLowerCase()
  if (c === 'good') return 'G'
  if (c === 'fair') return 'F'
  if (c === 'poor') return 'P'
  return '?'
}

const S = {
  label: { color: '#00551a', marginRight: '2px' },
  val:   { color: '#00ff41' },
  row:   { display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 4px', flexWrap: 'wrap' }
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

  return (
    <div
      style={{
        background: '#0f1a0f',
        border: '1px solid #1a3a1a',
        borderRadius: '4px',
        boxShadow: '0 0 8px rgba(0,255,65,0.15)',
        padding: '4px 6px',
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: '0.65rem'
      }}
    >
      {/* Line 1: header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
        <span style={{ fontSize: '0.58rem', color: '#00aa2b', letterSpacing: '0.12em' }}>
          BAND CONDITIONS
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {hasError && <span style={{ fontSize: '0.55rem', color: '#ff2200' }}>UNAVAIL</span>}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              background: 'transparent', border: '1px solid #1a3a1a', color: '#00551a',
              fontFamily: '"Share Tech Mono", monospace', fontSize: '0.55rem',
              padding: '1px 5px', cursor: 'pointer', opacity: refreshing ? 0.5 : 1
            }}
          >
            {refreshing ? '…' : 'REFRESH'}
          </button>
        </div>
      </div>

      {/* Line 2: solar indices */}
      <div style={S.row}>
        {[
          ['SFI', propData?.sfi, null],
          ['A',   propData?.aindex, null],
          ['K',   propData?.kindex, kColor(propData?.kindex)],
          ['X',   propData?.xray, null],
          ['SN',  propData?.sunspots, null],
        ].map(([label, val, color]) => (
          <span key={label}>
            <span style={S.label}>{label}:</span>
            <span style={{ color: color || (val != null ? '#00ff41' : '#335533') }}>
              {val ?? '---'}
            </span>
          </span>
        ))}
      </div>

      {/* Line 3: MUF + foF2 + band open indicators */}
      <div style={{ ...S.row, borderTop: '1px solid #111f11', marginTop: '2px', paddingTop: '3px' }}>
        <span>
          <span style={S.label}>MUF:</span>
          <span style={{ color: muf ? '#00ff41' : '#335533' }}>
            {muf ? `${muf.muf}MHz` : '--'}
          </span>
          {muf && (
            <span
              title="Estimated from SFI + K-index (URSI formula, ±2–3 MHz)"
              style={{ color: '#ffb000', fontSize: '0.52rem', marginLeft: '2px', cursor: 'help' }}
            >
              [est.]
            </span>
          )}
        </span>
        <span>
          <span style={S.label}>foF2:</span>
          <span style={{ color: muf ? '#00aa2b' : '#335533' }}>
            {muf ? `${muf.foF2}MHz` : '--'}
          </span>
        </span>
        {['10m', '15m', '17m'].map(band => {
          const status = muf?.muf != null ? mufStatus(muf.muf, band) : null
          const color = status ? STATUS_COLOR[status] : '#335533'
          return (
            <span key={band} style={{ color: '#00551a' }}>
              {band}:<span style={{ color }}>{status ?? '--'}</span>
            </span>
          )
        })}
      </div>

      {/* Line 4: band grid badges */}
      <div style={{ display: 'flex', gap: '3px', marginTop: '3px', paddingTop: '3px', borderTop: '1px solid #111f11', flexWrap: 'nowrap' }}>
        {BANDS.map(band => {
          const cond = daytime
            ? propData?.bands?.[band]?.day
            : propData?.bands?.[band]?.night
          const fallback = propData?.bands?.[band]?.day ?? propData?.bands?.[band]?.night
          const condition = cond ?? fallback
          const color = bandCondColor(condition)
          const letter = bandCondLetter(condition)
          return (
            <span
              key={band}
              title={`${band}: ${condition || 'unknown'} (${daytime ? 'day' : 'night'})`}
              style={{
                display: 'inline-flex', gap: '2px', alignItems: 'center',
                padding: '1px 3px',
                background: `${color}11`,
                border: `1px solid ${color}44`,
                fontSize: '0.58rem',
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
