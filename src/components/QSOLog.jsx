import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useIPCEvent } from '../hooks/useIPC'

const MODES = ['CW', 'SSB', 'USB', 'LSB', 'AM', 'FM', 'FT8', 'FT4', 'PSK31', 'RTTY', 'OTHER']
const PHONE_MODES = new Set(['SSB', 'USB', 'LSB', 'AM', 'FM'])

function utcNow() {
  const now = new Date()
  return {
    date: now.toISOString().slice(0, 10),
    time: now.toISOString().slice(11, 15)
  }
}

function freqToBand(freq) {
  const f = parseFloat(freq)
  if (isNaN(f)) return ''
  if (f >= 1.8   && f <= 2.0)    return '160m'
  if (f >= 3.5   && f <= 4.0)    return '80m'
  if (f >= 7.0   && f <= 7.3)    return '40m'
  if (f >= 10.1  && f <= 10.15)  return '30m'
  if (f >= 14.0  && f <= 14.35)  return '20m'
  if (f >= 18.068 && f <= 18.168) return '17m'
  if (f >= 21.0  && f <= 21.45)  return '15m'
  if (f >= 24.89 && f <= 24.99)  return '12m'
  if (f >= 28.0  && f <= 29.7)   return '10m'
  return ''
}

function defaultRst(mode) {
  return PHONE_MODES.has(mode) ? '59' : '599'
}

function blankForm(freq = '', mode = 'CW') {
  const { date, time } = utcNow()
  const rst = defaultRst(mode)
  return { callsign: '', freq, mode, rst_sent: rst, rst_rcvd: rst, skcc_nr: '', date_on: date, time_on: time, notes: '' }
}

// ---- sub-components ----

function Input({ label, value, onChange, readOnly, placeholder, style = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <label style={{ fontSize: '0.5rem', color: '#00551a', letterSpacing: '0.1em' }}>{label}</label>
      <input
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        style={{
          background: readOnly ? '#0a120a' : '#081208',
          border: `1px solid ${readOnly ? '#1a2a1a' : '#1a3a1a'}`,
          color: readOnly ? '#00551a' : '#00ff41',
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: '0.72rem',
          padding: '3px 6px',
          outline: 'none',
          width: '100%',
          ...style
        }}
        onFocus={e => { if (!readOnly) e.target.style.borderColor = '#00ff41' }}
        onBlur={e => { if (!readOnly) e.target.style.borderColor = '#1a3a1a' }}
      />
    </div>
  )
}

function StatsBar({ stats }) {
  if (!stats) return null
  const topBands = Object.entries(stats.bands || {}).slice(0, 4).map(([b, c]) => `${b}(${c})`).join(' ')
  const topModes = Object.entries(stats.modes || {}).slice(0, 3).map(([m, c]) => `${m}(${c})`).join(' ')
  return (
    <div style={{
      fontSize: '0.58rem',
      color: '#00551a',
      padding: '3px 4px',
      borderTop: '1px solid #1a3a1a',
      borderBottom: '1px solid #1a3a1a',
      letterSpacing: '0.05em',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }}>
      <span style={{ color: '#00ff41' }}>Total: {stats.total}</span>
      {' | '}
      <span style={{ color: '#ffb000' }}>SKCC: {stats.skcc_count}</span>
      {topBands && <>{' | '}<span>Bands: {topBands}</span></>}
      {topModes && <>{' | '}<span>Modes: {topModes}</span></>}
    </div>
  )
}

const COL_WIDTHS = '72px 100px 78px 44px 56px 80px 72px 1fr 44px 28px'

function TableRow({ qso, onDelete, idx }) {
  const [confirmDel, setConfirmDel] = useState(false)
  const srcColor = qso.source === 'skcclogger' ? '#00ff41' : '#ffb000'
  const srcLabel = qso.source === 'skcclogger' ? 'SKCC' : 'MAN'
  const notes = qso.notes || ''

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: COL_WIDTHS,
      alignItems: 'center',
      padding: '2px 4px',
      background: idx % 2 === 0 ? 'transparent' : 'rgba(0,255,65,0.03)',
      borderBottom: '1px solid #0d1a0d',
      fontSize: '0.65rem',
      fontFamily: '"Share Tech Mono", monospace',
      gap: '4px'
    }}>
      <span style={{ color: '#00551a' }}>{(qso.time_on || '----')}Z</span>
      <span style={{ color: '#00ff41', letterSpacing: '0.05em' }}>{qso.callsign}</span>
      <span style={{ color: '#ffb000' }}>{qso.freq ? Number(qso.freq).toFixed(3) : '---'}</span>
      <span style={{ color: '#00aa2b' }}>{qso.band || '---'}</span>
      <span style={{ color: '#00aa2b' }}>{qso.mode || '---'}</span>
      <span style={{ color: '#00551a' }}>{qso.rst_sent || '-'}/{qso.rst_rcvd || '-'}</span>
      <span style={{ color: '#00551a' }}>{qso.skcc_nr || '—'}</span>
      <span
        style={{ color: '#335533', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={notes}
      >
        {notes.length > 30 ? notes.slice(0, 30) + '…' : notes || ''}
      </span>
      <span style={{
        color: srcColor,
        fontSize: '0.55rem',
        border: `1px solid ${srcColor}44`,
        padding: '1px 3px',
        textAlign: 'center'
      }}>
        {srcLabel}
      </span>
      <button
        onClick={() => confirmDel ? onDelete(qso.id) : setConfirmDel(true)}
        onBlur={() => setConfirmDel(false)}
        style={{
          background: 'transparent',
          border: confirmDel ? '1px solid #ff2200' : 'none',
          color: confirmDel ? '#ff2200' : '#335533',
          cursor: 'pointer',
          fontFamily: 'monospace',
          fontSize: '0.65rem',
          padding: '0 2px',
          lineHeight: 1
        }}
        title={confirmDel ? 'Click again to confirm delete' : 'Delete'}
      >
        {confirmDel ? '!' : '✕'}
      </button>
    </div>
  )
}

// ---- main component ----

export default function QSOLog() {
  const rigStatus = useIPCEvent(window.api?.rig?.onStatus, null)
  const pushed = useIPCEvent(window.api?.qso?.onLog, null)

  const [qsos, setQsos] = useState([])
  const [stats, setStats] = useState(null)
  const [form, setForm] = useState(() => blankForm())
  const [freqLocked, setFreqLocked] = useState(false)
  const [modeLocked, setModeLocked] = useState(false)
  const [toast, setToast] = useState(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const searchTimer = useRef(null)

  // Initial data load
  useEffect(() => {
    window.api?.qso?.list().then(rows => { if (rows) setQsos(rows) })
    window.api?.qso?.stats().then(s => { if (s) setStats(s) })
  }, [])

  // Push updates from ADIF sync
  useEffect(() => {
    if (pushed) {
      setQsos(pushed)
      window.api?.qso?.stats().then(s => { if (s) setStats(s) })
    }
  }, [pushed])

  // Auto-fill freq from rig when not locked
  useEffect(() => {
    if (!rigStatus) return
    if (!freqLocked && rigStatus.freq) {
      const mhz = (rigStatus.freq / 1e6).toFixed(3)
      setForm(f => ({ ...f, freq: mhz, band: freqToBand(mhz) }))
    }
    if (!modeLocked && rigStatus.mode) {
      const mode = rigStatus.mode
      setForm(f => {
        const rst = defaultRst(mode)
        return { ...f, mode, rst_sent: rst, rst_rcvd: rst }
      })
    }
  }, [rigStatus, freqLocked, modeLocked])

  // Auto-set RST defaults when mode changes
  useEffect(() => {
    setForm(f => {
      const rst = defaultRst(f.mode)
      return { ...f, rst_sent: rst, rst_rcvd: rst }
    })
  }, [form.mode])

  // Debounced search
  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (!search.trim()) { setSearchResults(null); return }
    searchTimer.current = setTimeout(async () => {
      const results = await window.api?.qso?.search(search)
      setSearchResults(results || [])
    }, 300)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  function setField(key, value) {
    setForm(f => {
      const next = { ...f, [key]: value }
      if (key === 'freq') next.band = freqToBand(value)
      return next
    })
  }

  function handleClear() {
    const freq = rigStatus?.freq ? (rigStatus.freq / 1e6).toFixed(3) : ''
    const mode = rigStatus?.mode || 'CW'
    setForm(blankForm(freq, mode))
    setFreqLocked(false)
    setModeLocked(false)
  }

  async function handleLog() {
    if (!form.callsign.trim()) { showToast('CALLSIGN required', 'err'); return }
    if (!form.freq)             { showToast('FREQ required', 'err'); return }
    if (!form.mode)             { showToast('MODE required', 'err'); return }

    const result = await window.api?.qso?.add({
      callsign: form.callsign.toUpperCase(),
      freq:     parseFloat(form.freq),
      mode:     form.mode,
      rst_sent: form.rst_sent || defaultRst(form.mode),
      rst_rcvd: form.rst_rcvd || defaultRst(form.mode),
      date_on:  form.date_on,
      time_on:  form.time_on,
      skcc_nr:  form.skcc_nr || null,
      notes:    form.notes   || null,
      source:   'manual'
    })

    if (result?.success) {
      showToast(`LOGGED: ${form.callsign.toUpperCase()}`, 'ok')
      handleClear()
      const [rows, s] = await Promise.all([window.api.qso.list(), window.api.qso.stats()])
      if (rows) setQsos(rows)
      if (s)    setStats(s)
    } else {
      showToast(result?.error || 'LOG FAILED', 'err')
    }
  }

  async function handleDelete(id) {
    await window.api?.qso?.delete(id)
    const [rows, s] = await Promise.all([window.api.qso.list(), window.api.qso.stats()])
    if (rows) setQsos(rows)
    if (s)    setStats(s)
    if (search) {
      const results = await window.api?.qso?.search(search)
      setSearchResults(results || [])
    }
  }

  async function handleExport() {
    const result = await window.api?.qso?.export()
    if (result?.success) showToast(`EXPORT: ${result.filepath.split('/').pop()}`, 'ok')
    else showToast(result?.error || 'EXPORT FAILED', 'err')
  }

  const displayQsos = searchResults ?? qsos

  const inp = { fontSize: '0.72rem', padding: '3px 6px' }
  const btnBase = {
    fontFamily: '"Share Tech Mono", monospace',
    fontSize: '0.7rem',
    padding: '4px 12px',
    cursor: 'pointer',
    letterSpacing: '0.1em',
    border: 'none'
  }

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
        <span>QSO LOG</span>
        <span style={{ fontSize: '0.55rem', color: '#00551a' }}>{qsos.length} / 50 shown</span>
      </div>

      {/* ---- Entry Form ---- */}
      <div style={{ flexShrink: 0, paddingBottom: '5px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px', marginBottom: '4px' }}>
          {/* Row 1 */}
          <Input label="CALLSIGN *" value={form.callsign} placeholder="KJ5NUJ"
            onChange={e => setField('callsign', e.target.value.toUpperCase())} />
          <Input label="FREQ (MHz) *" value={form.freq} placeholder="14.060"
            onChange={e => { setFreqLocked(true); setField('freq', e.target.value) }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '0.5rem', color: '#00551a', letterSpacing: '0.1em' }}>MODE *</label>
            <select
              value={form.mode}
              onChange={e => { setModeLocked(true); setField('mode', e.target.value) }}
              style={{
                background: '#081208', border: '1px solid #1a3a1a', color: '#00ff41',
                fontFamily: '"Share Tech Mono", monospace', fontSize: '0.72rem',
                padding: '3px 6px', outline: 'none', width: '100%'
              }}
              onFocus={e => { e.target.style.borderColor = '#00ff41' }}
              onBlur={e => { e.target.style.borderColor = '#1a3a1a' }}
            >
              {MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Row 2 */}
          <Input label="RST SENT" value={form.rst_sent}
            onChange={e => setField('rst_sent', e.target.value)} />
          <Input label="RST RCVD" value={form.rst_rcvd}
            onChange={e => setField('rst_rcvd', e.target.value)} />
          <Input label="SKCC#" value={form.skcc_nr} placeholder="SKCC# (optional)"
            onChange={e => setField('skcc_nr', e.target.value)} />

          {/* Row 3 */}
          <Input label="DATE (UTC)" value={form.date_on} placeholder="2026-06-05"
            onChange={e => setField('date_on', e.target.value)} />
          <Input label="TIME (UTC)" value={form.time_on} placeholder="2359"
            onChange={e => setField('time_on', e.target.value)} />
          <Input label="BAND (auto)" value={form.band || freqToBand(form.freq) || ''} readOnly />
        </div>

        {/* Row 4 — Notes */}
        <div style={{ marginBottom: '4px' }}>
          <Input label="NOTES" value={form.notes} placeholder="Optional notes"
            onChange={e => setField('notes', e.target.value)} />
        </div>

        {/* Button row */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button onClick={handleLog} style={{
            ...btnBase, background: '#00ff41', color: '#000', fontWeight: 'bold',
            padding: '5px 18px', letterSpacing: '0.15em'
          }}>
            LOG QSO
          </button>
          <button onClick={handleClear} className="btn-green" style={{ fontSize: '0.68rem' }}>
            CLEAR
          </button>
          <button onClick={handleExport} className="btn-amber" style={{ fontSize: '0.68rem' }}>
            EXPORT ADIF
          </button>

          {/* Toast */}
          {toast && (
            <span style={{
              fontSize: '0.65rem',
              color: toast.type === 'ok' ? '#00ff41' : '#ff2200',
              letterSpacing: '0.1em',
              marginLeft: '8px',
              animation: 'fadeIn 0.1s'
            }}>
              {toast.msg}
            </span>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <StatsBar stats={stats} />

      {/* Search bar */}
      <div style={{ display: 'flex', gap: '5px', alignItems: 'center', padding: '4px 0', flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search callsign / notes / SKCC#..."
          style={{
            flex: 1, background: '#081208', border: '1px solid #1a3a1a', color: '#00ff41',
            fontFamily: '"Share Tech Mono", monospace', fontSize: '0.68rem',
            padding: '3px 6px', outline: 'none'
          }}
          onFocus={e => { e.target.style.borderColor = '#00ff41' }}
          onBlur={e => { e.target.style.borderColor = '#1a3a1a' }}
        />
        {search && (
          <button onClick={() => setSearch('')} className="btn-green"
            style={{ fontSize: '0.6rem', padding: '2px 8px' }}>
            CLEAR
          </button>
        )}
        {searchResults && (
          <span style={{ fontSize: '0.55rem', color: '#00551a' }}>{searchResults.length} match</span>
        )}
      </div>

      {/* Table header */}
      <div style={{
        display: 'grid', gridTemplateColumns: COL_WIDTHS, gap: '4px',
        padding: '2px 4px', borderBottom: '1px solid #1a3a1a', flexShrink: 0
      }}>
        {['TIME(UTC)', 'CALLSIGN', 'FREQ', 'BAND', 'MODE', 'RST S/R', 'SKCC#', 'NOTES', 'SRC', ''].map((h, i) => (
          <span key={i} style={{ fontSize: '0.5rem', color: '#00441a', letterSpacing: '0.1em' }}>{h}</span>
        ))}
      </div>

      {/* Table body */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {displayQsos.length === 0 ? (
          <div style={{
            textAlign: 'center', color: '#335533', fontSize: '0.72rem',
            letterSpacing: '0.15em', marginTop: '16px'
          }}>
            {search ? 'NO MATCHES' : 'NO QSOS LOGGED'}
          </div>
        ) : (
          displayQsos.map((q, i) => (
            <TableRow key={q.id} qso={q} idx={i} onDelete={handleDelete} />
          ))
        )}
      </div>
    </div>
  )
}
