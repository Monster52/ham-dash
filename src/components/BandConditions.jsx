import React, { useState, useEffect } from 'react'
import { useIPCEvent } from '../hooks/useIPC'

const BANDS = ['80m', '40m', '20m', '17m', '15m', '10m']

// Thresholds: [openAt, marginalAt] in MHz
const BAND_MUF_THRESHOLDS = {
  '10m': [28, 23],
  '15m': [21, 17],
  '17m': [18, 15],
}

function mufStatus(muf, band) {
  const t = BAND_MUF_THRESHOLDS[band]
  if (!t || muf == null) return null
  if (muf >= t[0]) return 'OPEN'
  if (muf >= t[1]) return 'MARGINAL'
  return 'CLOSED'
}

const STATUS_COLOR = { OPEN: '#00ff41', MARGINAL: '#ffb000', CLOSED: '#ff2200' }

const CONDITION_COLORS = {
  'Good': '#00ff41',
  'Fair': '#ffb000',
  'Poor': '#ff2200',
  'Unknown': '#335533'
}

function ConditionBadge({ value }) {
  const color = CONDITION_COLORS[value] || CONDITION_COLORS.Unknown
  return (
    <span
      style={{
        fontSize: '0.6rem',
        color,
        padding: '1px 5px',
        border: `1px solid ${color}44`,
        background: `${color}11`,
        letterSpacing: '0.05em'
      }}
    >
      {value || '???'}
    </span>
  )
}

function IndexBadge({ label, value, good, warn }) {
  const num = parseFloat(value)
  let color = '#00ff41'
  if (!isNaN(num)) {
    if (num >= warn) color = '#ff2200'
    else if (num >= good) color = '#ffb000'
  }
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.55rem', color: '#00551a', letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ fontSize: '1rem', color, textShadow: `0 0 6px ${color}66` }}>
        {value ?? '---'}
      </div>
    </div>
  )
}

export default function BandConditions() {
  const pushed = useIPCEvent(window.api?.propagation?.onData, null)
  const [pulled, setPulled] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  // Pull cached data on mount — resolves after React is ready, no race condition
  useEffect(() => {
    window.api?.propagation?.get().then(setPulled)
  }, [])

  // Pushed updates (hourly timer) override the pulled value
  const raw = pushed ?? pulled
  const hasError = raw?.error != null
  const propData = hasError ? null : raw

  const handleRefresh = async () => {
    setRefreshing(true)
    await window.api?.propagation?.refresh()
    setRefreshing(false)
  }

  const formatUpdated = (iso) => {
    if (!iso) return 'Never'
    const d = new Date(iso)
    return d.toUTCString().replace(/GMT$/, 'UTC').split(' ').slice(1).join(' ')
  }

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>BAND CONDITIONS</span>
        <button
          className="btn-green"
          style={{ fontSize: '0.55rem', padding: '2px 6px', opacity: refreshing ? 0.5 : 1 }}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'FETCHING...' : 'REFRESH'}
        </button>
      </div>

      {/* Solar Indices Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          padding: '6px 0',
          borderBottom: '1px solid #1a3a1a',
          marginBottom: '8px'
        }}
      >
        <IndexBadge label="SFI" value={propData?.sfi} good={150} warn={250} />
        <IndexBadge label="A" value={propData?.aindex} good={15} warn={30} />
        <IndexBadge label="K" value={propData?.kindex} good={3} warn={5} />
        <IndexBadge label="X-RAY" value={propData?.xray} good={99} warn={99} />
        <IndexBadge label="SPOTS" value={propData?.sunspots} good={50} warn={200} />
      </div>

      {/* MUF / foF2 row */}
      {(() => {
        const m = propData?.muf
        const mufVal = m?.muf
        const foF2Val = m?.foF2
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '4px 2px',
              borderBottom: '1px solid #1a3a1a',
              marginBottom: '6px',
              flexWrap: 'wrap',
              fontSize: '0.68rem',
              fontFamily: '"Share Tech Mono", monospace'
            }}
          >
            {/* MUF value */}
            <span>
              <span style={{ color: '#00551a' }}>MUF: </span>
              <span style={{ color: '#00ff41' }}>
                {mufVal != null ? `${mufVal} MHz` : '-- MHz'}
              </span>
              {m && (
                <span
                  title="Estimated from SFI + K-index (URSI formula, ±2–3 MHz)"
                  style={{
                    color: '#ffb000',
                    fontSize: '0.55rem',
                    marginLeft: '4px',
                    cursor: 'help',
                    letterSpacing: '0.05em'
                  }}
                >
                  [est.]
                </span>
              )}
            </span>

            {/* foF2 value */}
            <span>
              <span style={{ color: '#00551a' }}>foF2: </span>
              <span style={{ color: '#00aa2b' }}>
                {foF2Val != null ? `${foF2Val} MHz` : '--'}
              </span>
            </span>

            {/* Band open/marginal/closed indicators */}
            {['10m', '15m', '17m'].map(band => {
              const status = mufVal != null ? mufStatus(mufVal, band) : null
              const color = status ? STATUS_COLOR[status] : '#335533'
              return (
                <span key={band}>
                  <span style={{ color: '#00551a' }}>{band}: </span>
                  <span style={{ color, textShadow: status === 'OPEN' ? `0 0 5px ${color}88` : 'none' }}>
                    {status ?? '--'}
                  </span>
                </span>
              )
            })}
          </div>
        )
      })()}

      {/* Error state */}
      {hasError && (
        <div
          style={{
            textAlign: 'center',
            color: '#ff2200',
            fontSize: '0.72rem',
            letterSpacing: '0.15em',
            border: '1px solid #440000',
            padding: '6px 10px',
            marginBottom: '6px',
            background: '#1a0000'
          }}
        >
          DATA UNAVAILABLE
          {raw.error && (
            <div style={{ fontSize: '0.55rem', marginTop: '3px', color: '#aa2200' }}>
              {raw.error}
            </div>
          )}
        </div>
      )}

      {/* Band Grid */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px'
          }}
        >
          {BANDS.map(band => {
            const day = propData?.bands?.[band]?.day
            const night = propData?.bands?.[band]?.night
            return (
              <div
                key={band}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#0a140a',
                  border: '1px solid #1a2a1a',
                  padding: '4px 6px',
                  gap: '4px'
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: '#00aa2b',
                    letterSpacing: '0.1em',
                    minWidth: '28px'
                  }}
                >
                  {band}
                </span>
                <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.5rem', color: '#ffb00088' }}>☀</span>
                  <ConditionBadge value={day} />
                  <span style={{ fontSize: '0.5rem', color: '#5566aa88' }}>☽</span>
                  <ConditionBadge value={night} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Last Updated */}
      <div
        style={{
          fontSize: '0.5rem',
          color: '#00441a',
          borderTop: '1px solid #1a3a1a',
          paddingTop: '4px',
          marginTop: '6px'
        }}
      >
        UPDATED: {formatUpdated(propData?.updated)}
      </div>
    </div>
  )
}
