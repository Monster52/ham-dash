import React, { useState, useEffect } from 'react'
import { useSettings } from '../hooks/useIPC'

export default function SettingsPanel({ onClose }) {
  const [settings, updateSettings] = useSettings()
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(false)
  const [showRestartNote, setShowRestartNote] = useState(false)

  useEffect(() => {
    if (settings && !form) {
      setForm({ ...settings })
    }
  }, [settings])

  const handleChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    const restartNeeded = form.callsign !== settings?.callsign || form.grid !== settings?.grid
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
