import React, { useState, useEffect } from 'react'
import { useIPCEvent, useSettings } from '../hooks/useIPC'

export default function KeyerPanel() {
  const keyerStatus = useIPCEvent(window.api?.keyer?.onStatus, { connected: false })
  const [settings, updateSettings] = useSettings()
  const [wpm, setWpmLocal] = useState(18)
  const [messages, setMessages] = useState({
    msg1: 'CQ CQ DE KJ5NUJ KJ5NUJ K',
    msg2: 'TU 73 DE KJ5NUJ K',
    msg3: 'KJ5NUJ EM50JI',
    msg4: 'QRZ? DE KJ5NUJ K'
  })
  const [editingMsg, setEditingMsg] = useState(null)
  const [editText, setEditText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (settings) {
      setWpmLocal(settings.wpm || 18)
      if (settings.keyerMessages) setMessages(settings.keyerMessages)
    }
  }, [settings])

  const handleWpmChange = (val) => {
    setWpmLocal(val)
    window.api?.keyer?.setWpm(val)
    updateSettings?.({ wpm: val })
  }

  const handleSend = async (text) => {
    if (sending || !keyerStatus?.connected) return
    setSending(true)
    await window.api?.keyer?.send(text, wpm)
    setSending(false)
  }

  const handleSaveMsg = (key) => {
    const updated = { ...messages, [key]: editText }
    setMessages(updated)
    updateSettings?.({ keyerMessages: updated })
    setEditingMsg(null)
  }

  const connected = keyerStatus?.connected

  const msgKeys = ['msg1', 'msg2', 'msg3', 'msg4']
  const msgLabels = ['MSG1', 'MSG2', 'MSG3', 'MSG4']

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>CW KEYER</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span
            style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: connected ? '#00ff41' : '#ff2200',
              boxShadow: connected ? '0 0 4px #00ff41' : '0 0 4px #ff2200',
              display: 'inline-block'
            }}
          />
          <span style={{ fontSize: '0.55rem', color: connected ? '#00ff41' : '#ff2200' }}>
            {connected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </span>
      </div>

      {/* WPM Slider */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '0.6rem', color: '#00aa2b', letterSpacing: '0.1em' }}>WPM</span>
          <span style={{ fontSize: '1.1rem', color: '#00ff41', textShadow: '0 0 6px rgba(0,255,65,0.5)' }}>
            {wpm}
          </span>
        </div>
        <input
          type="range"
          min={5}
          max={40}
          value={wpm}
          onChange={(e) => handleWpmChange(Number(e.target.value))}
          style={{
            width: '100%',
            accentColor: '#00ff41',
            cursor: 'pointer'
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.5rem', color: '#00551a' }}>
          <span>5</span><span>40</span>
        </div>
      </div>

      {/* Dit/Dah buttons */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        <button
          className="btn-green"
          style={{ flex: 1, letterSpacing: '0.15em' }}
          onMouseDown={() => window.api?.keyer?.dit()}
          disabled={!connected}
        >
          · DIT
        </button>
        <button
          className="btn-green"
          style={{ flex: 1, letterSpacing: '0.15em' }}
          onMouseDown={() => window.api?.keyer?.dah()}
          disabled={!connected}
        >
          — DAH
        </button>
      </div>

      {/* Message buttons */}
      <div style={{ fontSize: '0.6rem', color: '#00aa2b', letterSpacing: '0.1em', marginBottom: '6px' }}>
        MESSAGES
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
        {msgKeys.map((key, i) => (
          <div key={key}>
            {editingMsg === key ? (
              <div style={{ display: 'flex', gap: '3px' }}>
                <input
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveMsg(key)
                    if (e.key === 'Escape') setEditingMsg(null)
                  }}
                  style={{
                    flex: 1,
                    background: '#0a1a0a',
                    border: '1px solid #00ff41',
                    color: '#00ff41',
                    fontFamily: '"Share Tech Mono", monospace',
                    fontSize: '0.65rem',
                    padding: '3px 6px',
                    outline: 'none'
                  }}
                />
                <button
                  className="btn-green"
                  style={{ padding: '2px 6px', fontSize: '0.6rem' }}
                  onClick={() => handleSaveMsg(key)}
                >
                  OK
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '3px' }}>
                <button
                  className="btn-amber"
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: '0.62rem',
                    padding: '4px 7px',
                    opacity: sending ? 0.5 : 1
                  }}
                  onClick={() => handleSend(messages[key])}
                  disabled={!connected || sending}
                  title={messages[key]}
                >
                  {msgLabels[i]}: {messages[key]}
                </button>
                <button
                  style={{
                    background: 'transparent',
                    border: '1px solid #1a3a1a',
                    color: '#00551a',
                    fontFamily: '"Share Tech Mono", monospace',
                    fontSize: '0.55rem',
                    padding: '2px 5px',
                    cursor: 'pointer'
                  }}
                  onClick={() => { setEditingMsg(key); setEditText(messages[key]) }}
                  title="Edit message"
                >
                  EDIT
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {sending && (
        <div style={{ textAlign: 'center', fontSize: '0.65rem', color: '#ffb000', marginTop: '6px' }}>
          SENDING...
        </div>
      )}
    </div>
  )
}
