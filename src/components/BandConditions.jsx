import React, { useState } from 'react'
import { useIPCEvent } from '../hooks/useIPC'

const BANDS = ['80m', '40m', '20m', '17m', '15m', '10m']

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
  const propData = useIPCEvent(window.api?.propagation?.onData, null)
  const [refreshing, setRefreshing] = useState(false)

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
