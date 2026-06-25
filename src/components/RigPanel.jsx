import React, { useState, useEffect, useRef } from 'react'
import { useIPCEvent } from '../hooks/useIPC'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const MODES = ['CW', 'USB', 'LSB', 'AM']
const STEPS = [100, 1000, 10000, 100000]
const STEP_LABELS = ['100Hz', '1kHz', '10kHz', '100kHz']

function formatFreq(hz) {
  if (!hz || hz === 0) return '---.---'
  const mhz = hz / 1e6
  const [intPart, decPart] = mhz.toFixed(6).split('.')
  return `${intPart}.${decPart.slice(0, 3)}.${decPart.slice(3, 6)}`
}

function SMeter({ value }) {
  // value is raw hamlib STRENGTH: -54 dBm = S0, each S unit = 6dB
  // S9 = 0 dBm typically, but hamlib returns dBm relative to S9
  // Convert: smeter_raw is in dBm above/below S9
  // S9 = 0 in hamlib STRENGTH, below is negative
  const s9dBm = value || 0
  const sUnit = Math.max(0, Math.min(9, Math.round((s9dBm + 54) / 6)))
  const overS9 = Math.max(0, s9dBm)

  const bars = 14 // 9 S-units + 5 dB-over marks
  const filledBars = Math.min(bars, sUnit + Math.floor(overS9 / 10))

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ fontSize: '0.6rem', color: '#00aa2b', letterSpacing: '0.1em', marginBottom: '3px' }}>
        S-METER
      </div>
      <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end' }}>
        {Array.from({ length: bars }).map((_, i) => {
          const isFilled = i < filledBars
          const isOver9 = i >= 9
          const barColor = isOver9 ? '#ff2200' : (i >= 7 ? '#ffb000' : '#00ff41')
          const height = 6 + i * 1.2

          return (
            <div
              key={i}
              style={{
                width: '10px',
                height: `${height}px`,
                background: isFilled ? barColor : '#1a2a1a',
                boxShadow: isFilled ? `0 0 4px ${barColor}88` : 'none',
                transition: 'background 0.1s, box-shadow 0.1s',
                borderRadius: '1px'
              }}
            />
          )
        })}
        <span style={{ fontSize: '0.65rem', color: '#00aa2b', marginLeft: '6px' }}>
          S{sUnit}{overS9 > 0 ? `+${overS9}` : ''}
        </span>
      </div>
      <div style={{ display: 'flex', fontSize: '0.5rem', color: '#00551a', marginTop: '2px', gap: '2px' }}>
        {['1','2','3','4','5','6','7','8','9','+10','+20','+30','+40','+60'].map((label, i) => (
          <div key={i} style={{ width: '10px', textAlign: 'center' }}>{label}</div>
        ))}
      </div>
    </div>
  )
}

export default function RigPanel() {
  const rigStatus = useIPCEvent(window.api?.rig?.onStatus, { connected: false, freq: 0, mode: 'USB', smeter: 0 })
  const [tuneStep, setTuneStep] = useState(1000)
  const [smeterHistory, setSmeterHistory] = useState([])

  useEffect(() => {
    if (rigStatus?.smeter != null) {
      setSmeterHistory(prev => {
        const next = [...prev, { t: Date.now(), v: rigStatus.smeter }]
        return next.slice(-60)
      })
    }
  }, [rigStatus?.smeter])

  const handleTune = (dir) => {
    window.api?.rig?.tuneStep(dir, tuneStep)
  }

  const handleMode = (mode) => {
    window.api?.rig?.setMode(mode)
  }

  const [initing, setIniting] = useState(false)
  const [initSuccess, setInitSuccess] = useState(false)

  const handleInit = async () => {
    setIniting(true)
    const result = await window.api?.rig?.init()
    setIniting(false)
    if (result?.ok) {
      setInitSuccess(true)
      setTimeout(() => setInitSuccess(false), 2000)
    }
  }

  const connected = rigStatus?.connected

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>RIG CONTROL — XIEGU G106</span>
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
          <button
            onClick={handleInit}
            disabled={initing}
            style={{
              fontSize: '0.6rem',
              padding: '2px 8px',
              background: 'transparent',
              border: `1px solid ${initSuccess ? '#00ff41' : '#ffb000'}`,
              color: initSuccess ? '#00ff41' : '#ffb000',
              cursor: initing ? 'default' : 'pointer',
              letterSpacing: '0.05em'
            }}
          >
            {initing ? '...' : initSuccess ? 'OK ✓' : 'INIT'}
          </button>
        </span>
      </div>

      {/* Frequency Display */}
      <div
        style={{
          textAlign: 'center',
          padding: '12px 0 8px',
          borderBottom: '1px solid #1a3a1a'
        }}
      >
        <div
          className="freq-display"
          style={{
            fontSize: '2.8rem',
            color: connected ? '#00ff41' : '#335533',
            letterSpacing: '0.08em',
            lineHeight: 1,
            textShadow: connected
              ? '0 0 15px rgba(0,255,65,0.7), 0 0 30px rgba(0,255,65,0.3)'
              : 'none'
          }}
        >
          {connected ? formatFreq(rigStatus?.freq) : '--- --- --'}
        </div>
        <div style={{ fontSize: '0.65rem', color: '#00551a', marginTop: '3px', letterSpacing: '0.15em' }}>
          MHz
        </div>
      </div>

      {/* Mode Display */}
      <div style={{ padding: '8px 0', borderBottom: '1px solid #1a3a1a' }}>
        <div style={{ fontSize: '0.6rem', color: '#00aa2b', letterSpacing: '0.1em', marginBottom: '5px' }}>
          MODE
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {MODES.map(mode => (
            <button
              key={mode}
              className={`btn-green ${rigStatus?.mode === mode ? 'active' : ''}`}
              style={{
                background: rigStatus?.mode === mode ? 'rgba(0,255,65,0.2)' : 'transparent',
                boxShadow: rigStatus?.mode === mode ? '0 0 6px rgba(0,255,65,0.5)' : 'none',
                fontSize: '0.72rem',
                padding: '3px 8px'
              }}
              onClick={() => handleMode(mode)}
              disabled={!connected}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Tune Step + Controls */}
      <div style={{ padding: '8px 0', borderBottom: '1px solid #1a3a1a' }}>
        <div style={{ fontSize: '0.6rem', color: '#00aa2b', letterSpacing: '0.1em', marginBottom: '5px' }}>
          TUNE STEP
        </div>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
          {STEPS.map((step, i) => (
            <button
              key={step}
              className={`btn-green ${tuneStep === step ? 'active' : ''}`}
              style={{
                background: tuneStep === step ? 'rgba(0,255,65,0.2)' : 'transparent',
                fontSize: '0.65rem',
                padding: '2px 6px'
              }}
              onClick={() => setTuneStep(step)}
            >
              {STEP_LABELS[i]}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn-green"
            style={{ flex: 1, fontSize: '1.1rem', padding: '6px' }}
            onClick={() => handleTune('down')}
            disabled={!connected}
          >
            ▼
          </button>
          <button
            className="btn-green"
            style={{ flex: 1, fontSize: '1.1rem', padding: '6px' }}
            onClick={() => handleTune('up')}
            disabled={!connected}
          >
            ▲
          </button>
        </div>
      </div>

      {/* S-Meter */}
      <SMeter value={rigStatus?.smeter} />

      {/* S-Meter History Chart */}
      <div style={{ flex: 1, marginTop: '8px', minHeight: '80px' }}>
        <div style={{ fontSize: '0.6rem', color: '#00aa2b', letterSpacing: '0.1em', marginBottom: '3px' }}>
          SIGNAL HISTORY (60s)
        </div>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={smeterHistory} margin={{ top: 2, right: 4, bottom: 2, left: -20 }}>
            <XAxis dataKey="t" hide />
            <YAxis domain={[-54, 60]} tick={{ fill: '#00551a', fontSize: 9 }} />
            <Tooltip
              contentStyle={{ background: '#0f1a0f', border: '1px solid #1a3a1a', fontSize: '0.65rem' }}
              labelFormatter={() => ''}
              formatter={(v) => [`${v} dBm`, 'S']}
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke="#00ff41"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {!connected && (
        <div
          style={{
            textAlign: 'center',
            color: '#ff2200',
            fontSize: '0.75rem',
            letterSpacing: '0.2em',
            padding: '8px',
            border: '1px solid #440000',
            marginTop: '8px'
          }}
        >
          RIG OFFLINE — RETRYING...
        </div>
      )}
    </div>
  )
}
