import React, { useState, useEffect } from 'react'
import { useSettings } from '../hooks/useIPC'

export default function SettingsPanel({ onClose }) {
  const [settings, updateSettings] = useSettings()
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(false)
  const [showRestartNote, setShowRestartNote] = useState(false)
  const [skccError, setSkccError] = useState(false)
  const [apiStatus, setApiStatus] = useState(null)
  const [apiFlushed, setApiFlushed] = useState(false)

  useEffect(() => {
    if (settings && !form) {
      setForm({ ...settings })
    }
  }, [settings])

  useEffect(() => {
    window.api?.apiserver?.getStatus()?.then(setApiStatus)
  }, [])

  const handleChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (form.skccMember && !form.skccNumber?.trim()) {
      setSkccError(true)
      return
    }
    setSkccError(false)
    const restartNeeded =
      form.callsign      !== settings?.callsign      ||
      form.grid          !== settings?.grid          ||
      form.dxclusterHost !== settings?.dxclusterHost ||
      form.dxclusterPort !== settings?.dxclusterPort
    await updateSettings(form)
    setSaved(true)
    if (restartNeeded) setShowRestartNote(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!form) return null

  const fieldStyle = {
    width: '100%',
    background: '#0a1a0a',
    border: '1px solid #1a3a1a',
    color: '#00ff41',
    fontFamily: '"Share Tech Mono", monospace',
    fontSize: '0.78rem',
    padding: '5px 8px',
    outline: 'none',
    marginTop: '3px'
  }

  const labelStyle = {
    fontSize: '0.6rem',
    color: '#00aa2b',
    letterSpacing: '0.12em',
    display: 'block'
  }

  return (
    <div
      className="panel"
      style={{
        width: '480px',
        maxHeight: '80vh',
        overflowY: 'auto',
        padding: '16px'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          borderBottom: '1px solid #1a3a1a',
          paddingBottom: '8px'
        }}
      >
        <span style={{ fontSize: '0.9rem', letterSpacing: '0.2em', color: '#00ff41' }}>
          SETTINGS
        </span>
        <button
          style={{
            background: 'transparent',
            border: 'none',
            color: '#00551a',
            fontSize: '1.2rem',
            cursor: 'pointer',
            fontFamily: 'monospace'
          }}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Station */}
        <div>
          <div style={{ fontSize: '0.65rem', color: '#00551a', letterSpacing: '0.15em', marginBottom: '6px' }}>
            STATION
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={labelStyle}>CALLSIGN</label>
              <input
                style={fieldStyle}
                value={form.callsign || ''}
                onChange={(e) => handleChange('callsign', e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label style={labelStyle}>GRID SQUARE</label>
              <input
                style={fieldStyle}
                value={form.grid || ''}
                onChange={(e) => handleChange('grid', e.target.value.toUpperCase())}
              />
            </div>
          </div>
        </div>

        {/* SKCC */}
        <div>
          <div style={{ fontSize: '0.65rem', color: '#00551a', letterSpacing: '0.15em', marginBottom: '6px' }}>
            SKCC
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '6px' }}>
            <input
              type="checkbox"
              checked={form.skccMember ?? true}
              onChange={(e) => {
                handleChange('skccMember', e.target.checked)
                if (e.target.checked) setSkccError(false)
              }}
              style={{ accentColor: '#00ff41', width: '14px', height: '14px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.65rem', color: '#00aa2b', letterSpacing: '0.08em' }}>
              I&apos;m an SKCC member
            </span>
          </label>
          {form.skccMember && (
            <div>
              <label style={labelStyle}>SKCC NUMBER</label>
              <input
                style={{
                  ...fieldStyle,
                  borderColor: skccError ? '#ff2200' : '#1a3a1a',
                }}
                value={form.skccNumber || ''}
                placeholder="e.g. 30741"
                onChange={(e) => {
                  handleChange('skccNumber', e.target.value.replace(/\D/g, ''))
                  if (e.target.value.trim()) setSkccError(false)
                }}
              />
              {skccError && (
                <div style={{ fontSize: '0.58rem', color: '#ff2200', marginTop: '3px' }}>
                  SKCC number required to enable SKCC features
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rigctld */}
        <div>
          <div style={{ fontSize: '0.65rem', color: '#00551a', letterSpacing: '0.15em', marginBottom: '6px' }}>
            RIG CONTROL (RIGCTLD)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '8px' }}>
            <div>
              <label style={labelStyle}>HOST</label>
              <input
                style={fieldStyle}
                value={form.rigctldHost || ''}
                onChange={(e) => handleChange('rigctldHost', e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>PORT</label>
              <input
                style={fieldStyle}
                type="number"
                value={form.rigctldPort || 4532}
                onChange={(e) => handleChange('rigctldPort', Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Keyer */}
        <div>
          <div style={{ fontSize: '0.65rem', color: '#00551a', letterSpacing: '0.15em', marginBottom: '6px' }}>
            CW KEYER
          </div>
          <label style={labelStyle}>SERIAL PORT</label>
          <input
            style={fieldStyle}
            value={form.keyerPort || ''}
            onChange={(e) => handleChange('keyerPort', e.target.value)}
            placeholder="/dev/ttyUSB0"
          />
        </div>

        {/* ADIF Log */}
        <div>
          <div style={{ fontSize: '0.65rem', color: '#00551a', letterSpacing: '0.15em', marginBottom: '6px' }}>
            QSO LOG
          </div>
          <label style={labelStyle}>ADIF LOG FILE PATH</label>
          <input
            style={fieldStyle}
            value={form.adifPath || ''}
            onChange={(e) => handleChange('adifPath', e.target.value)}
            placeholder="~/skcclogger/log.adi"
          />
        </div>

        {/* DX Cluster */}
        <div>
          <div style={{ fontSize: '0.65rem', color: '#00551a', letterSpacing: '0.15em', marginBottom: '6px' }}>
            DX CLUSTER
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '8px' }}>
            <div>
              <label style={labelStyle}>HOST</label>
              <input
                style={fieldStyle}
                value={form.dxclusterHost || ''}
                onChange={(e) => handleChange('dxclusterHost', e.target.value)}
                placeholder="hamqth.com"
              />
            </div>
            <div>
              <label style={labelStyle}>PORT</label>
              <input
                style={fieldStyle}
                type="number"
                value={form.dxclusterPort || 7300}
                onChange={(e) => handleChange('dxclusterPort', Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* API Server */}
        <div>
          <div style={{ fontSize: '0.65rem', color: '#00551a', letterSpacing: '0.15em', marginBottom: '6px' }}>
            API SERVER
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
              background: apiStatus?.listening ? '#00ff41' : '#ff2200',
              boxShadow: apiStatus?.listening ? '0 0 5px #00ff41' : '0 0 5px #ff2200',
            }} />
            <span style={{ fontSize: '0.65rem', color: apiStatus?.listening ? '#00ff41' : '#ff2200' }}>
              {apiStatus?.listening
                ? `LISTENING ON :${apiStatus.port}`
                : 'NOT LISTENING'}
            </span>
          </div>
          {apiStatus?.listening && (
            <div style={{ fontSize: '0.55rem', color: '#00551a', marginBottom: '6px', fontFamily: 'monospace' }}>
              http://&lt;machine-ip&gt;:{apiStatus.port}/api/station-summary
            </div>
          )}
          <button
            className="btn-green"
            style={{ padding: '3px 12px', fontSize: '0.6rem' }}
            onClick={async () => {
              await window.api?.apiserver?.flush()
              setApiFlushed(true)
              setTimeout(() => setApiFlushed(false), 2000)
            }}
          >
            {apiFlushed ? 'CACHE CLEARED' : 'FLUSH CACHE'}
          </button>
          <div style={{ fontSize: '0.52rem', color: '#00441a', marginTop: '4px' }}>
            Forces fresh data on next ESP32 poll (bypasses 5-min cache).
          </div>
        </div>

        {/* MUF/LUF Location */}
        <div>
          <div style={{ fontSize: '0.65rem', color: '#00551a', letterSpacing: '0.15em', marginBottom: '6px' }}>
            MUF/LUF LOCATION
          </div>
          <label style={labelStyle}>GRID SQUARE OVERRIDE</label>
          <input
            style={fieldStyle}
            value={form.mufLufGrid || ''}
            onChange={(e) => handleChange('mufLufGrid', e.target.value.toUpperCase())}
            placeholder="Leave blank to use station grid"
          />
          <div style={{ fontSize: '0.55rem', color: '#00441a', marginTop: '3px' }}>
            Overrides station grid for MUF/LUF solar calculations only.
          </div>
        </div>

        {/* Keyer Messages */}
        <div>
          <div style={{ fontSize: '0.65rem', color: '#00551a', letterSpacing: '0.15em', marginBottom: '6px' }}>
            CW MESSAGES
          </div>
          {['msg1', 'msg2', 'msg3', 'msg4'].map((key, i) => (
            <div key={key} style={{ marginBottom: '6px' }}>
              <label style={labelStyle}>MSG{i + 1}</label>
              <input
                style={fieldStyle}
                value={(form.keyerMessages || {})[key] || ''}
                onChange={(e) =>
                  handleChange('keyerMessages', {
                    ...(form.keyerMessages || {}),
                    [key]: e.target.value.toUpperCase()
                  })
                }
              />
            </div>
          ))}
        </div>

      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end', alignItems: 'center' }}>
        {showRestartNote && (
          <span style={{ fontSize: '0.56rem', color: '#ffb000', flex: 1 }}>
            Restart required for RBN/SKCC/POTA to use new callsign.
          </span>
        )}
        <button className="btn-green" style={{ padding: '5px 16px' }} onClick={onClose}>
          CANCEL
        </button>
        <button
          className="btn-amber"
          style={{ padding: '5px 20px' }}
          onClick={handleSave}
        >
          {saved ? 'SAVED!' : 'SAVE'}
        </button>
      </div>
    </div>
  )
}
