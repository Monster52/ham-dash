import React, { useState, useEffect } from 'react'

function UTCClock() {
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toUTCString().split(' ')[4] + 'Z')
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <span style={{ color: '#00ff41', fontSize: '1.1rem', letterSpacing: '0.1em' }}>
      {time}
    </span>
  )
}

export default function Header({ onSettings }) {
  return (
    <div
      style={{
        background: '#050f05',
        borderBottom: '1px solid #1a3a1a',
        padding: '6px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 12px rgba(0,255,65,0.15)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <span
          style={{
            fontSize: '1.4rem',
            fontWeight: 'bold',
            letterSpacing: '0.25em',
            color: '#00ff41',
            textShadow: '0 0 12px rgba(0,255,65,0.6)'
          }}
        >
          FAC SHACK
        </span>
        <span
          style={{
            fontSize: '1rem',
            color: '#ffb000',
            letterSpacing: '0.15em',
            textShadow: '0 0 8px rgba(255,176,0,0.4)'
          }}
        >
          KJ5NUJ
        </span>
        <span style={{ color: '#00aa2b', fontSize: '0.8rem', letterSpacing: '0.1em' }}>
          EM50JI
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <UTCClock />
        <button
          onClick={onSettings}
          style={{
            background: 'transparent',
            border: '1px solid #1a3a1a',
            color: '#00aa2b',
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: '0.7rem',
            padding: '3px 10px',
            cursor: 'pointer',
            letterSpacing: '0.1em',
            transition: 'all 0.1s'
          }}
          onMouseEnter={(e) => {
            e.target.style.borderColor = '#00ff41'
            e.target.style.color = '#00ff41'
          }}
          onMouseLeave={(e) => {
            e.target.style.borderColor = '#1a3a1a'
            e.target.style.color = '#00aa2b'
          }}
        >
          SETTINGS
        </button>
      </div>
    </div>
  )
}
