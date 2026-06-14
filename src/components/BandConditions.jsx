import React, { useState, useEffect } from 'react'
import { useIPCEvent } from '../hooks/useIPC'

const STATUS_COLORS = {
  ACTIVE:   { border: '#00ff41', text: '#00ff41', bar: '#00ff41' },
  MARGINAL: { border: '#ffb000', text: '#ffb000', bar: '#ffb000' },
  QUIET:    { border: '#333333', text: '#335533', bar: '#1a3a1a' },
}

const BANDS = ['40m', '20m', '15m', '10m']
const BAR_CELLS = 10
const BAR_MAX_SPOTS = 50

function kColor(k) {
  const n = parseFloat(k)
  if (isNaN(n)) return '#00551a'
  if (n >= 5) return '#ff2200'
  if (n >= 3) return '#ffb000'
  return '#00ff41'
}

function utcHHMM(iso) {
  return new Date(iso).toISOString().slice(11, 16) + 'z'
}

function BandCard({ band, data }) {
  const colors = data ? (STATUS_COLORS[data.status] || STATUS_COLORS.QUIET) : null

  if (!data) {
    return (
      <div style={{
        flex: 1, border: '1px solid #1a3a1a', padding: '5px 6px',
        background: '#0a150a', textAlign: 'center',
      }}>
        <div style={{ color: '#00551a', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '4px' }}>
          {band}
        </div>
        <div style={{
          color: '#1a5a1a', fontSize: '0.6rem',
          animation: 'collecting-pulse 1.5s ease-in-out infinite',
        }}>
          COLLECTING...
        </div>
      </div>
    )
  }

  const { status, count, potaCount } = data
  const filledCells = Math.round(Math.min(count / BAR_MAX_SPOTS, 1) * BAR_CELLS)
  const label = status === 'MARGINAL' ? 'MARG' : status

  return (
    <div style={{
      flex: 1, border: `1px solid ${colors.border}55`, padding: '5px 6px',
      background: `${colors.border}08`,
    }}>
      <div style={{ color: colors.text, fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '2px' }}>
        {band}
      </div>
      <div style={{ color: colors.text, fontSize: '0.6rem', fontWeight: 'bold', marginBottom: '3px' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.55rem', color: colors.bar, marginBottom: '2px', letterSpacing: '1px' }}>
        {'█'.repeat(filledCells)}{'░'.repeat(BAR_CELLS - filledCells)}
      </div>
      <div style={{ color: '#00551a', fontSize: '0.55rem' }}>
        {count} {count === 1 ? 'spot' : 'spots'}
      </div>
      <div style={{ color: potaCount > 0 ? '#00ddff' : '#1a3a1a', fontSize: '0.55rem' }}>
        {potaCount > 0 ? `+${potaCount} POTA` : '—'}
      </div>
    </div>
  )
}

export default function BandConditions() {
  const pushed       = useIPCEvent(window.api?.propagation?.onData, null)
  const bandActivity = useIPCEvent(window.api?.propagation?.onBandActivity, null)
  const [pulled, setPulled] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    window.api?.propagation?.get().then(setPulled)
  }, [])

  const raw      = pushed ?? pulled
  const hasError = raw?.error != null
  const propData = hasError ? null : raw
  const sunTimes = propData?.sunTimes

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
      background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: '4px',
      boxShadow: '0 0 8px rgba(0,255,65,0.15)', padding: '6px',
      fontFamily: '"Share Tech Mono", monospace',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
        <span style={{ fontSize: '0.62rem', color: '#00aa2b', letterSpacing: '0.12em' }}>
          BAND CONDITIONS
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {hasError && <span style={{ fontSize: '0.58rem', color: '#ff2200' }}>UNAVAIL</span>}
          <button
            onClick={handleRefresh} disabled={refreshing}
            style={{
              background: 'transparent', border: '1px solid #1a3a1a', color: '#00551a',
              fontFamily: '"Share Tech Mono", monospace', fontSize: '0.58rem',
              padding: '1px 6px', cursor: 'pointer', opacity: refreshing ? 0.5 : 1,
            }}
          >
            {refreshing ? '…' : 'REFRESH'}
          </button>
        </div>
      </div>

      {/* Solar indices */}
      <div style={{ ...row, borderTop: '1px solid #111f11', paddingTop: '4px' }}>
        {[
          ['SFI', propData?.sfi, null],
          ['A',   propData?.aindex, null],
          ['K',   propData?.kp != null
                    ? `${propData.kp} [${propData.kpSource}]`
                    : propData?.kindex,
                  kColor(propData?.kp ?? propData?.kindex)],
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

      {/* Band Activity */}
      <div style={{ borderTop: '1px solid #111f11', paddingTop: '4px' }}>
        <div style={{ fontSize: '0.52rem', color: '#00441a', marginBottom: '4px' }}>
          BAND ACTIVITY  (RBN + POTA · last 30min CW)
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {BANDS.map(band => (
            <BandCard key={band} band={band} data={bandActivity?.[band] ?? null} />
          ))}
        </div>
      </div>

      {/* Sun times */}
      {sunTimes && (
        <div style={{ fontSize: '0.48rem', color: '#005522', padding: '2px 0', borderTop: '1px solid #111f11' }}>
          {`☀ Rise: ${utcHHMM(sunTimes.sunrise)}  Noon: ${utcHHMM(sunTimes.solarNoon)}  Set: ${utcHHMM(sunTimes.sunset)}`}
        </div>
      )}
    </div>
  )
}
