import React, { useState, useEffect } from 'react'
import { useIPCEvent, useSettings } from '../hooks/useIPC'

export default function CWKeyer() {
  const keyerStatus = useIPCEvent(window.api?.keyer?.onStatus, { connected: false })
  const [settings, updateSettings] = useSettings()
  const [wpm, setWpmLocal] = useState(18)
  const [messages, setMessages] = useState({
    msg1: 'CQ CQ DE KJ5NUJ KJ5NUJ K',
    msg2: 'TU 73 DE KJ5NUJ K',
    msg3: 'KJ5NUJ EM50JI',
    msg4: 'QRZ? DE KJ5NUJ K'
  })
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

  const connected = keyerStatus?.connected
  const msgKeys   = ['msg1', 'msg2', 'msg3', 'msg4']
  const msgLabels = ['MSG1', 'MSG2', 'MSG3', 'MSG4']

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '8px 10px 10px' }}>

      {/* Header: title + status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '0.62rem', color: '#00aa2b', letterSpacing: '0.12em' }}>CW KEYER</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
        </div>
      </div>

      {/* WPM Slider */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '0.6rem', color: '#00aa2b', letterSpacing: '0.1em' }}>WPM</span>
          <span style={{ fontSize: '1.1rem', color: '#00ff41', textShadow: '0 0 6px rgba(0,255,65,0.5)' }}>
            {wpm}
          </span>
        </div>
        <input
          type="range" min={5} max={40} value={wpm}
          onChange={(e) => handleWpmChange(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#00ff41', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.5rem', color: '#00551a' }}>
          <span>5</span><span>40</span>
        </div>
      </div>

      {/* Message buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
        {msgKeys.map((key, i) => (
          <button
            key={key}
            className="btn-green"
            style={{
              fontSize: '0.65rem', padding: '6px 0', letterSpacing: '0.08em',
              opacity: sending ? 0.5 : 1
            }}
            onClick={() => handleSend(messages[key])}
            disabled={!connected || sending}
            title={messages[key]}
          >
            {msgLabels[i]}
          </button>
        ))}
      </div>

      {sending && (
        <div style={{ textAlign: 'center', fontSize: '0.65rem', color: '#ffb000', marginTop: '8px' }}>
          SENDING...
        </div>
      )}
    </div>
  )
}
