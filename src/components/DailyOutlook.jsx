import React, { useState, useEffect } from 'react'
import { useIPCEvent } from '../hooks/useIPC'

function kpColor(kp) {
  const n = parseFloat(kp)
  if (isNaN(n)) return '#00551a'
  if (n >= 5)   return '#ff2200'
  if (n >= 3)   return '#ffb000'
  return '#00ff41'
}

function pctColor(pct, warnAt, alertAt) {
  const n = parseFloat(pct) || 0
  if (n >= alertAt) return '#ff2200'
  if (n >= warnAt)  return '#ffb000'
  return '#00ff41'
}

function utcHHMM(iso) {
  if (!iso) return '---'
  try { return new Date(iso).toISOString().slice(11, 16) + 'z' } catch { return '---' }
}

export default function DailyOutlook() {
  const pushed = useIPCEvent(window.api?.outlook?.onData, null)
  const [pulled, setPulled]     = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    window.api?.outlook?.get().then(d => { if (d) setPulled(d) })
  }, [])

  useEffect(() => { if (pushed !== null) setPulled(pushed) }, [pushed])

  const data = pushed ?? pulled

  const handleRefresh = async () => {
    setRefreshing(true)
    await window.api?.outlook?.refresh()
    setRefreshing(false)
  }

  const lbl = { color: '#00551a', marginRight: '2px', fontSize: '0.6rem' }
  const val = { fontSize: '0.8rem' }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '8px 10px 10px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '0.62rem', color: '#00aa2b', letterSpacing: '0.12em' }}>
          24HR OUTLOOK
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {data?.updated && (
            <span style={{ fontSize: '0.52rem', color: '#004d19' }}>
              {utcHHMM(data.updated)}
            </span>
          )}
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

      {/* Stat row */}
      <div style={{
        display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center',
        borderTop: '1px solid #111f11', padding: '5px 0 5px',
      }}>
        <span>
          <span style={lbl}>Max K:</span>
          <span style={{ ...val, color: kpColor(data?.maxKp) }}>
            {data?.maxKp ?? '---'}
          </span>
        </span>
        <span>
          <span style={lbl}>Max A:</span>
          <span style={{ ...val, color: kpColor(data?.maxKp) }}>
            {data?.maxA ?? '---'}
          </span>
        </span>
        <span>
          <span style={lbl}>R1-R2:</span>
          <span style={{ ...val, color: pctColor(data?.radioBlackoutR1R2Pct, 15, 40) }}>
            {data != null ? `${data.radioBlackoutR1R2Pct}%` : '---'}
          </span>
        </span>
        <span>
          <span style={lbl}>R3-R5:</span>
          <span style={{ ...val, color: pctColor(data?.radioBlackoutR3R5Pct, 5, 15) }}>
            {data != null ? `${data.radioBlackoutR3R5Pct}%` : '---'}
          </span>
        </span>
        <span>
          <span style={lbl}>S1+:</span>
          <span style={{ ...val, color: pctColor(data?.radiationStormPct, 5, 20) }}>
            {data != null ? `${data.radiationStormPct}%` : '---'}
          </span>
        </span>
      </div>

      {/* Summary */}
      <div style={{
        flex: 1, borderTop: '1px solid #111f11', paddingTop: '8px',
      }}>
        {data?.summary ? (
          <p style={{
            color: '#00cc35', fontSize: '0.75rem', lineHeight: '1.6',
            margin: 0, letterSpacing: '0.02em',
          }}>
            {data.summary}
          </p>
        ) : (
          <p style={{ color: '#335533', fontSize: '0.68rem', margin: 0 }}>
            {data === null ? 'Loading forecast...' : 'NOAA SWPC data unavailable.'}
          </p>
        )}
      </div>

      {/* Footer */}
      <div style={{
        fontSize: '0.46rem', color: '#004d19',
        borderTop: '1px solid #111f11', paddingTop: '4px', marginTop: '6px',
      }}>
        {data?.forecastIssued
          ? `Source: NOAA SWPC 3-Day Forecast · issued ${utcHHMM(data.forecastIssued)}`
          : 'Source: NOAA SWPC 3-Day Forecast'}
      </div>
    </div>
  )
}
