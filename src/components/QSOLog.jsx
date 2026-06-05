import React from 'react'
import { useIPCEvent } from '../hooks/useIPC'

function formatTime(timeOn) {
  if (!timeOn) return '--:--'
  // ADIF TIME_ON is HHMMSS or HHMM
  const t = timeOn.replace(/\D/g, '')
  if (t.length >= 6) return `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`
  if (t.length >= 4) return `${t.slice(0, 2)}:${t.slice(2, 4)}Z`
  return timeOn
}

function formatDate(qsoDate) {
  if (!qsoDate) return '----'
  // ADIF QSO_DATE is YYYYMMDD
  const d = qsoDate.replace(/\D/g, '')
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
  return qsoDate
}

function formatFreq(freq) {
  if (!freq) return '---'
  const f = parseFloat(freq)
  if (isNaN(f)) return freq
  return f.toFixed(3) + ' MHz'
}

export default function QSOLog() {
  const qsos = useIPCEvent(window.api?.qso?.onLog, [])

  const cols = [
    { key: 'call', label: 'CALLSIGN', width: '14%' },
    { key: 'freq', label: 'FREQ', width: '14%' },
    { key: 'mode', label: 'MODE', width: '8%' },
    { key: 'skcc', label: 'SKCC#', width: '10%' },
    { key: 'date', label: 'DATE', width: '14%' },
    { key: 'timeOn', label: 'TIME(UTC)', width: '12%' },
  ]

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>QSO LOG (SKCCLOGGER — LAST 10)</span>
        <span style={{ fontSize: '0.55rem', color: '#00551a' }}>
          {qsos?.length || 0} ENTRIES
        </span>
      </div>

      {/* Table Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: cols.map(c => c.width).join(' '),
          borderBottom: '1px solid #1a3a1a',
          paddingBottom: '4px',
          marginBottom: '4px'
        }}
      >
        {cols.map(col => (
          <span
            key={col.key}
            style={{
              fontSize: '0.55rem',
              color: '#00551a',
              letterSpacing: '0.12em',
              textTransform: 'uppercase'
            }}
          >
            {col.label}
          </span>
        ))}
      </div>

      {/* QSO Rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {(!qsos || qsos.length === 0) ? (
          <div
            style={{
              textAlign: 'center',
              color: '#335533',
              fontSize: '0.75rem',
              letterSpacing: '0.15em',
              marginTop: '20px'
            }}
          >
            NO QSOS LOGGED — WATCHING ADIF FILE
          </div>
        ) : (
          qsos.map((qso, idx) => (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: cols.map(c => c.width).join(' '),
                padding: '3px 0',
                borderBottom: '1px solid #0f1f0f',
                background: idx === 0 ? 'rgba(0,255,65,0.04)' : 'transparent',
                transition: 'background 0.1s'
              }}
            >
              <span style={{ color: '#00ff41', fontSize: '0.78rem', letterSpacing: '0.05em' }}>
                {qso.call}
              </span>
              <span style={{ color: '#ffb000', fontSize: '0.72rem' }}>
                {formatFreq(qso.freq)}
              </span>
              <span style={{ color: '#00aa2b', fontSize: '0.72rem' }}>
                {qso.mode}
              </span>
              <span style={{ color: '#00aa2b', fontSize: '0.72rem' }}>
                {qso.skcc || '—'}
              </span>
              <span style={{ color: '#00551a', fontSize: '0.68rem' }}>
                {formatDate(qso.date)}
              </span>
              <span style={{ color: '#00551a', fontSize: '0.68rem' }}>
                {formatTime(qso.timeOn)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
