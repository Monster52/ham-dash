import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useIPCEvent } from '../hooks/useIPC'

const MODES = ['CW', 'SSB', 'USB', 'LSB', 'AM', 'FM', 'FT8', 'FT4', 'PSK31', 'RTTY', 'OTHER']
const PHONE_MODES = new Set(['SSB', 'USB', 'LSB', 'AM', 'FM'])

function utcNow() {
  const now = new Date()
  return { date: now.toISOString().slice(0, 10), time: now.toISOString().slice(11, 15) }
}

function freqToBand(freq) {
  const f = parseFloat(freq)
  if (isNaN(f)) return ''
  if (f >= 1.8 && f <= 2.0) return '160m'
  if (f >= 3.5 && f <= 4.0) return '80m'
  if (f >= 7.0 && f <= 7.3) return '40m'
  if (f >= 10.1 && f <= 10.15) return '30m'
  if (f >= 14.0 && f <= 14.35) return '20m'
  if (f >= 18.068 && f <= 18.168) return '17m'
  if (f >= 21.0 && f <= 21.45) return '15m'
  if (f >= 24.89 && f <= 24.99) return '12m'
  if (f >= 28.0 && f <= 29.7) return '10m'
  return ''
}

function defaultRst(mode) { return PHONE_MODES.has(mode) ? '59' : '599' }

function blankForm(freq = '', mode = 'CW') {
  const { date, time } = utcNow()
  const rst = defaultRst(mode)
  return { callsign: '', freq, mode, rst_sent: rst, rst_rcvd: rst, skcc_nr: '', date_on: date, time_on: time, notes: '' }
}

const INP = {
  background: '#081208', border: '1px solid #1a3a1a', color: '#00ff41',
  fontFamily: '"Share Tech Mono", monospace', fontSize: '0.72rem',
  padding: '3px 6px', outline: 'none', width: '100%'
}
const INP_FOCUS = { borderColor: '#00ff41' }
const INP_RO = { ...INP, background: '#0a120a', border: '1px solid #1a2a1a', color: '#00551a' }

function Inp({ value, onChange, onBlur, placeholder, readOnly, type = 'text', style = {} }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      placeholder={placeholder}
      style={{ ...(readOnly ? INP_RO : INP), ...style }}
      onFocus={e => { if (!readOnly) e.target.style.borderColor = '#00ff41' }}
      onBlur={e => {
        if (!readOnly) e.target.style.borderColor = '#1a3a1a'
        onBlur?.(e)
      }}
    />
  )
}

function CallsignBanner({ info }) {
  if (!info) return null
  if (info === 'loading') return (
    <div style={{ fontSize: '0.6rem', color: '#007722', fontFamily: '"Share Tech Mono", monospace', padding: '2px 4px' }}>
      looking up...
    </div>
  )
  if (info === 'not-found') return (
    <div style={{ fontSize: '0.6rem', color: '#ffb000', fontFamily: '"Share Tech Mono", monospace', padding: '2px 4px' }}>
      callsign not found
    </div>
  )
  const parts = [info.name, [info.city, info.state].filter(Boolean).join(', '), info.grid, info.class].filter(Boolean)
  return (
    <div style={{
      fontSize: '0.65rem', color: '#00ff41',
      background: 'rgba(0,255,65,0.07)',
      fontFamily: '"Share Tech Mono", monospace',
      padding: '2px 8px',
      borderLeft: '2px solid #00ff41',
    }}>
      ✓ {parts.join(' — ')}
    </div>
  )
}

function ModeSelect({ value, onChange, style = {} }) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={{ ...INP, ...style }}
      onFocus={e => { e.target.style.borderColor = '#00ff41' }}
      onBlur={e => { e.target.style.borderColor = '#1a3a1a' }}
    >
      {MODES.map(m => <option key={m} value={m}>{m}</option>)}
    </select>
  )
}

// ---- Shared state logic (used by both compact and expanded views) ----

function useQSOLog() {
  const rigStatus = useIPCEvent(window.api?.rig?.onStatus, null)
  const pushed = useIPCEvent(window.api?.qso?.onLog, null)
  const [qsos, setQsos] = useState([])
  const [stats, setStats] = useState(null)
  const [form, setForm] = useState(() => blankForm())
  const [freqLocked, setFreqLocked] = useState(false)
  const [modeLocked, setModeLocked] = useState(false)
  const [toast, setToast] = useState(null)
  const [callsignInfo, setCallsignInfo] = useState(null)
  const lookupTimer = useRef(null)

  useEffect(() => {
    window.api?.qso?.list().then(rows => { if (rows) setQsos(rows) })
    window.api?.qso?.stats().then(s => { if (s) setStats(s) })
  }, [])

  useEffect(() => {
    if (pushed) {
      setQsos(pushed)
      window.api?.qso?.stats().then(s => { if (s) setStats(s) })
    }
  }, [pushed])

  useEffect(() => {
    const unsub = window.api?.qso?.onPrefill?.((data) => {
      setForm(f => {
        const mode = data.mode || f.mode
        const freq = data.freq_mhz != null ? data.freq_mhz.toFixed(3) : f.freq
        const rst = defaultRst(mode)
        return {
          ...f,
          callsign: data.callsign ? data.callsign.toUpperCase() : f.callsign,
          freq,
          band: freqToBand(freq),
          mode,
          rst_sent: rst,
          rst_rcvd: rst,
        }
      })
      if (data.freq_mhz != null) setFreqLocked(true)
      if (data.mode) setModeLocked(true)
    })
    return () => unsub?.()
  }, [])

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

  useEffect(() => {
    setForm(f => {
      const rst = defaultRst(f.mode)
      return { ...f, rst_sent: rst, rst_rcvd: rst }
    })
  }, [form.mode])

  const triggerLookup = useCallback(async (call) => {
    const trimmed = call.trim()
    if (trimmed.length < 3) { setCallsignInfo(null); return }
    setCallsignInfo('loading')
    const result = await window.api?.callsign?.lookup(trimmed)
    setCallsignInfo(result ?? 'not-found')
  }, [])

  useEffect(() => {
    clearTimeout(lookupTimer.current)
    const call = form.callsign.trim()
    if (call.length < 3) { setCallsignInfo(null); return }
    lookupTimer.current = setTimeout(() => triggerLookup(call), 800)
    return () => clearTimeout(lookupTimer.current)
  }, [form.callsign, triggerLookup])

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
    setCallsignInfo(null)
  }

  async function handleLog() {
    if (!form.callsign.trim()) { showToast('CALLSIGN required', 'err'); return }
    if (!form.freq) { showToast('FREQ required', 'err'); return }
    if (!form.mode) { showToast('MODE required', 'err'); return }

    const result = await window.api?.qso?.add({
      callsign: form.callsign.toUpperCase(),
      freq: parseFloat(form.freq),
      mode: form.mode,
      rst_sent: form.rst_sent || defaultRst(form.mode),
      rst_rcvd: form.rst_rcvd || defaultRst(form.mode),
      date_on: form.date_on, time_on: form.time_on,
      skcc_nr: form.skcc_nr || null,
      notes: form.notes || null,
      source: 'manual'
    })

    if (result?.success) {
      showToast(`LOGGED: ${form.callsign.toUpperCase()}`, 'ok')
      handleClear()
      const [rows, s] = await Promise.all([window.api.qso.list(), window.api.qso.stats()])
      if (rows) setQsos(rows)
      if (s) setStats(s)
    } else {
      showToast(result?.error || 'LOG FAILED', 'err')
    }
  }

  async function handleDelete(id) {
    await window.api?.qso?.delete(id)
    const [rows, s] = await Promise.all([window.api.qso.list(), window.api.qso.stats()])
    if (rows) setQsos(rows)
    if (s) setStats(s)
  }

  async function handleExport() {
    const result = await window.api?.qso?.export()
    if (result?.success) showToast(`EXPORT: ${result.filepath.split('/').pop()}`, 'ok')
    else showToast(result?.error || 'EXPORT FAILED', 'err')
  }

  return {
    form, setField, freqLocked, setFreqLocked, modeLocked, setModeLocked,
    qsos, stats, toast, handleLog, handleClear, handleDelete, handleExport,
    callsignInfo, triggerLookup,
  }
}

// ---- Compact row table ----

const COL_WIDTHS = '60px 90px 70px 40px 50px 72px 68px 1fr 40px 24px'

function QSORow({ qso, onDelete, idx }) {
  const [confirmDel, setConfirmDel] = useState(false)
  const srcColor = qso.source === 'skcclogger' ? '#00ff41' : '#ffb000'

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: COL_WIDTHS, gap: '4px',
      padding: '2px 4px', fontSize: '0.63rem',
      background: idx % 2 === 0 ? 'transparent' : 'rgba(0,255,65,0.02)',
      borderBottom: '1px solid #0d1a0d', alignItems: 'center'
    }}>
      <span style={{ color: '#00551a' }}>{(qso.time_on || '----')}Z</span>
      <span style={{ color: '#00ff41' }}>{qso.callsign}</span>
      <span style={{ color: '#ffb000' }}>{qso.freq ? Number(qso.freq).toFixed(3) : '---'}</span>
      <span style={{ color: '#00aa2b' }}>{qso.band || '---'}</span>
      <span style={{ color: '#00aa2b' }}>{qso.mode || '---'}</span>
      <span style={{ color: '#00551a' }}>{qso.rst_sent}/{qso.rst_rcvd}</span>
      <span style={{ color: '#00551a' }}>{qso.skcc_nr || '—'}</span>
      <span style={{ color: '#335533', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={qso.notes || ''}>{qso.notes ? qso.notes.slice(0, 30) : ''}</span>
      <span style={{ color: srcColor, fontSize: '0.55rem', border: `1px solid ${srcColor}44`, padding: '0 2px' }}>
        {qso.source === 'skcclogger' ? 'SKCC' : 'MAN'}
      </span>
      <button
        onClick={() => confirmDel ? onDelete(qso.id) : setConfirmDel(true)}
        onBlur={() => setConfirmDel(false)}
        style={{
          background: 'transparent', border: confirmDel ? '1px solid #ff2200' : 'none',
          color: confirmDel ? '#ff2200' : '#335533', cursor: 'pointer',
          fontFamily: 'monospace', fontSize: '0.65rem', padding: '0 2px'
        }}
        title={confirmDel ? 'Confirm delete' : 'Delete'}
      >
        {confirmDel ? '!' : '✕'}
      </button>
    </div>
  )
}

// ---- Expanded full overlay ----

function ExpandedLog({ onClose, shared }) {
  const {
    form, setField, freqLocked, setFreqLocked, modeLocked, setModeLocked,
    qsos, stats, toast, handleLog, handleClear, handleDelete, handleExport,
    callsignInfo, triggerLookup,
  } = shared

  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const searchTimer = useRef(null)

  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (!search.trim()) { setSearchResults(null); return }
    searchTimer.current = setTimeout(async () => {
      const r = await window.api?.qso?.search(search)
      setSearchResults(r || [])
    }, 300)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  const displayQsos = searchResults ?? qsos

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: '100%', maxWidth: '1600px', height: '90vh',
        background: '#0f1a0f', border: '1px solid #1a3a1a',
        boxShadow: '0 0 30px rgba(0,255,65,0.2)', display: 'flex', flexDirection: 'column',
        padding: '12px', borderRadius: '4px', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexShrink: 0 }}>
          <span style={{ color: '#00ff41', fontSize: '0.9rem', letterSpacing: '0.2em' }}>QSO LOG</span>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid #1a3a1a', color: '#00551a',
            fontFamily: '"Share Tech Mono", monospace', fontSize: '0.7rem',
            padding: '3px 12px', cursor: 'pointer'
          }}>CLOSE ✕</button>
        </div>

        {/* Form — 3-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '6px', flexShrink: 0 }}>
          {/* Row 1 */}
          <div>
            <label style={LBL}>CALLSIGN *</label>
            <Inp value={form.callsign} placeholder="KJ5NUJ"
              onChange={e => setField('callsign', e.target.value.toUpperCase())}
              onBlur={() => triggerLookup(form.callsign)} />
            <CallsignBanner info={callsignInfo} />
          </div>
          <div><label style={LBL}>FREQ (MHz) *</label>
            <Inp value={form.freq} placeholder="14.060"
              onChange={e => { setFreqLocked(true); setField('freq', e.target.value) }} /></div>
          <div><label style={LBL}>MODE *</label>
            <ModeSelect value={form.mode} onChange={e => { setModeLocked(true); setField('mode', e.target.value) }} /></div>
          {/* Row 2 */}
          <div><label style={LBL}>RST SENT</label>
            <Inp value={form.rst_sent} onChange={e => setField('rst_sent', e.target.value)} /></div>
          <div><label style={LBL}>RST RCVD</label>
            <Inp value={form.rst_rcvd} onChange={e => setField('rst_rcvd', e.target.value)} /></div>
          <div><label style={LBL}>SKCC#</label>
            <Inp value={form.skcc_nr} placeholder="SKCC# (optional)" onChange={e => setField('skcc_nr', e.target.value)} /></div>
          {/* Row 3 */}
          <div><label style={LBL}>DATE (UTC)</label>
            <Inp value={form.date_on} placeholder="2026-06-05" onChange={e => setField('date_on', e.target.value)} /></div>
          <div><label style={LBL}>TIME (UTC)</label>
            <Inp value={form.time_on} placeholder="2359" onChange={e => setField('time_on', e.target.value)} /></div>
          <div><label style={LBL}>BAND (auto)</label>
            <Inp value={form.band || freqToBand(form.freq) || ''} readOnly /></div>
        </div>

        {/* Notes + buttons */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexShrink: 0, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={LBL}>NOTES</label>
            <Inp value={form.notes} placeholder="Optional" onChange={e => setField('notes', e.target.value)} />
          </div>
          <button onClick={handleLog} style={{
            background: '#00ff41', color: '#000', fontFamily: '"Share Tech Mono", monospace',
            fontSize: '0.72rem', padding: '5px 18px', cursor: 'pointer', border: 'none',
            fontWeight: 'bold', letterSpacing: '0.1em', flexShrink: 0
          }}>LOG QSO</button>
          <button onClick={handleClear} className="btn-green" style={{ fontSize: '0.7rem', flexShrink: 0 }}>CLEAR</button>
          <button onClick={handleExport} className="btn-amber" style={{ fontSize: '0.7rem', flexShrink: 0 }}>EXPORT ADIF</button>
          {toast && <span style={{ fontSize: '0.65rem', color: toast.type === 'ok' ? '#00ff41' : '#ff2200', letterSpacing: '0.1em' }}>{toast.msg}</span>}
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ fontSize: '0.58rem', color: '#00551a', padding: '3px 0', borderTop: '1px solid #1a3a1a', borderBottom: '1px solid #1a3a1a', marginBottom: '6px', flexShrink: 0 }}>
            <span style={{ color: '#00ff41' }}>Total: {stats.total}</span>
            {' | '}<span style={{ color: '#ffb000' }}>SKCC: {stats.skcc_count}</span>
            {Object.entries(stats.bands || {}).slice(0, 4).length > 0 && (
              <>{' | '}Bands: {Object.entries(stats.bands).slice(0, 4).map(([b, c]) => `${b}(${c})`).join(' ')}</>
            )}
            {Object.entries(stats.modes || {}).slice(0, 3).length > 0 && (
              <>{' | '}Modes: {Object.entries(stats.modes).slice(0, 3).map(([m, c]) => `${m}(${c})`).join(' ')}</>
            )}
          </div>
        )}

        {/* Search */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', flexShrink: 0 }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search callsign / notes / SKCC#..."
            style={{ flex: 1, ...INP }}
            onFocus={e => { e.target.style.borderColor = '#00ff41' }}
            onBlur={e => { e.target.style.borderColor = '#1a3a1a' }} />
          {search && <button onClick={() => setSearch('')} className="btn-green" style={{ fontSize: '0.6rem', padding: '2px 8px' }}>CLR</button>}
          {searchResults && <span style={{ fontSize: '0.55rem', color: '#00551a', alignSelf: 'center' }}>{searchResults.length} match</span>}
        </div>

        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: COL_WIDTHS, gap: '4px', padding: '2px 4px', borderBottom: '1px solid #1a3a1a', flexShrink: 0 }}>
          {['TIME', 'CALLSIGN', 'FREQ', 'BAND', 'MODE', 'RST S/R', 'SKCC#', 'NOTES', 'SRC', ''].map((h, i) => (
            <span key={i} style={{ fontSize: '0.5rem', color: '#00441a', letterSpacing: '0.1em' }}>{h}</span>
          ))}
        </div>

        {/* Table body */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {displayQsos.length === 0
            ? <div style={{ textAlign: 'center', color: '#335533', fontSize: '0.72rem', marginTop: '20px', letterSpacing: '0.15em' }}>
                {search ? 'NO MATCHES' : 'NO QSOS LOGGED'}
              </div>
            : displayQsos.map((q, i) => <QSORow key={q.id} qso={q} idx={i} onDelete={handleDelete} />)
          }
        </div>
      </div>
    </div>
  )
}

const LBL = { fontSize: '0.5rem', color: '#00551a', letterSpacing: '0.1em', display: 'block', marginBottom: '2px' }

// ---- Main compact view ----

export default function QSOLog() {
  const shared = useQSOLog()
  const { form, setField, setFreqLocked, setModeLocked, qsos, stats, toast, handleLog, handleClear, handleDelete, handleExport, callsignInfo, triggerLookup } = shared
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ---- Compact form — single row ---- */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '130px 88px 80px 62px 62px 90px 100px 68px 56px 1fr 90px 70px 86px',
        gap: '4px',
        padding: '4px 4px 3px',
        flexShrink: 0,
        alignItems: 'end'
      }}>
        <div>
          <span style={LBL}>CALLSIGN *</span>
          <Inp value={form.callsign} placeholder="KJ5NUJ"
            onChange={e => setField('callsign', e.target.value.toUpperCase())}
            onBlur={() => triggerLookup(form.callsign)} />
        </div>
        <div>
          <span style={LBL}>FREQ *</span>
          <Inp value={form.freq} placeholder="14.060"
            onChange={e => { setFreqLocked(true); setField('freq', e.target.value) }} />
        </div>
        <div>
          <span style={LBL}>MODE *</span>
          <ModeSelect value={form.mode}
            onChange={e => { setModeLocked(true); setField('mode', e.target.value) }} />
        </div>
        <div>
          <span style={LBL}>RST S</span>
          <Inp value={form.rst_sent} onChange={e => setField('rst_sent', e.target.value)} />
        </div>
        <div>
          <span style={LBL}>RST R</span>
          <Inp value={form.rst_rcvd} onChange={e => setField('rst_rcvd', e.target.value)} />
        </div>
        <div>
          <span style={LBL}>SKCC#</span>
          <Inp value={form.skcc_nr} placeholder="optional" onChange={e => setField('skcc_nr', e.target.value)} />
        </div>
        <div>
          <span style={LBL}>DATE</span>
          <Inp value={form.date_on} onChange={e => setField('date_on', e.target.value)} />
        </div>
        <div>
          <span style={LBL}>TIME</span>
          <Inp value={form.time_on} onChange={e => setField('time_on', e.target.value)} />
        </div>
        <div>
          <span style={LBL}>BAND</span>
          <Inp value={form.band || freqToBand(form.freq) || ''} readOnly />
        </div>
        <div>
          <span style={LBL}>NOTES</span>
          <Inp value={form.notes} placeholder="notes" onChange={e => setField('notes', e.target.value)} />
        </div>

        {/* Buttons */}
        <button onClick={handleLog} style={{
          background: '#00ff41', color: '#000', fontFamily: '"Share Tech Mono", monospace',
          fontSize: '0.72rem', padding: '4px 0', cursor: 'pointer', border: 'none',
          fontWeight: 'bold', letterSpacing: '0.1em', alignSelf: 'end', height: '26px'
        }}>LOG QSO</button>
        <button onClick={handleClear} className="btn-green"
          style={{ fontSize: '0.65rem', padding: '3px 0', alignSelf: 'end', height: '26px' }}>
          CLEAR
        </button>
        <button onClick={() => setExpanded(true)}
          style={{
            background: 'transparent', border: '1px solid #1a3a1a', color: '#00551a',
            fontFamily: '"Share Tech Mono", monospace', fontSize: '0.65rem',
            padding: '3px 0', cursor: 'pointer', alignSelf: 'end', height: '26px',
            letterSpacing: '0.08em'
          }}
          onMouseEnter={e => { e.target.style.borderColor = '#00ff41'; e.target.style.color = '#00ff41' }}
          onMouseLeave={e => { e.target.style.borderColor = '#1a3a1a'; e.target.style.color = '#00551a' }}
        >
          EXPAND LOG
        </button>
      </div>

      {/* Callsign lookup banner */}
      {callsignInfo && (
        <div style={{ flexShrink: 0 }}>
          <CallsignBanner info={callsignInfo} />
        </div>
      )}

      {/* Toast + stats on same line */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1px 4px', flexShrink: 0,
        borderTop: '1px solid #1a3a1a', borderBottom: '1px solid #1a3a1a'
      }}>
        <div style={{ fontSize: '0.57rem', color: '#00551a' }}>
          {stats && (
            <>
              <span style={{ color: '#00ff41' }}>Total: {stats.total}</span>
              {' | '}<span style={{ color: '#ffb000' }}>SKCC: {stats.skcc_count}</span>
              {Object.entries(stats.bands || {}).slice(0, 3).length > 0 && (
                <> | Bands: {Object.entries(stats.bands).slice(0, 3).map(([b, c]) => `${b}(${c})`).join(' ')}</>
              )}
              {Object.entries(stats.modes || {}).slice(0, 2).length > 0 && (
                <> | Modes: {Object.entries(stats.modes).slice(0, 2).map(([m, c]) => `${m}(${c})`).join(' ')}</>
              )}
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {toast && (
            <span style={{ fontSize: '0.65rem', color: toast.type === 'ok' ? '#00ff41' : '#ff2200', letterSpacing: '0.1em' }}>
              {toast.msg}
            </span>
          )}
          <button onClick={handleExport} className="btn-amber" style={{ fontSize: '0.6rem', padding: '1px 8px' }}>
            EXPORT
          </button>
        </div>
      </div>

      {/* Table header */}
      <div style={{ display: 'grid', gridTemplateColumns: COL_WIDTHS, gap: '4px', padding: '2px 4px', borderBottom: '1px solid #1a3a1a', flexShrink: 0 }}>
        {['TIME', 'CALLSIGN', 'FREQ', 'BAND', 'MODE', 'RST S/R', 'SKCC#', 'NOTES', 'SRC', ''].map((h, i) => (
          <span key={i} style={{ fontSize: '0.5rem', color: '#00441a', letterSpacing: '0.1em' }}>{h}</span>
        ))}
      </div>

      {/* Last 3 QSOs */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {qsos.length === 0
          ? <div style={{ textAlign: 'center', color: '#335533', fontSize: '0.65rem', letterSpacing: '0.15em', padding: '6px' }}>
              NO QSOS LOGGED
            </div>
          : qsos.slice(0, 3).map((q, i) => (
              <QSORow key={q.id} qso={q} idx={i} onDelete={handleDelete} />
            ))
        }
      </div>

      {/* Expand overlay */}
      {expanded && <ExpandedLog onClose={() => setExpanded(false)} shared={shared} />}
    </div>
  )
}
