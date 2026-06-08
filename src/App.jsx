import React, { useState } from 'react'
import Header from './components/Header'
import RigPanel from './components/RigPanel'
import KeyerPanel from './components/KeyerPanel'
import BandConditions from './components/BandConditions'
import QSOLog from './components/QSOLog'
import RBNPanel from './components/RBNPanel'
import SKCCPanel from './components/SKCCPanel'
import SettingsPanel from './components/SettingsPanel'

export default function App() {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#0a0a0a',
        display: 'grid',
        gridTemplateRows: 'auto 1fr 200px 220px',
        gridTemplateColumns: '1fr',
        overflow: 'hidden',
        fontFamily: '"Share Tech Mono", monospace'
      }}
    >
      <Header onSettings={() => setShowSettings(true)} />

      {/* Top section — 3 columns, fills all space above QSO log */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '280px 320px 1fr',
          gap: '6px',
          padding: '6px 6px 3px 6px',
          overflow: 'hidden',
          minHeight: 0
        }}
      >
        {/* Col 1: Rig Control */}
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <RigPanel />
        </div>

        {/* Col 2: Keyer (grows) + Band Conditions (fixed, never shrinks) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden', minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <KeyerPanel />
          </div>
          <div style={{ flexShrink: 0 }}>
            <BandConditions />
          </div>
        </div>

        {/* Col 3: RBN Panel */}
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <RBNPanel />
        </div>
      </div>

      {/* SKCC Skimmer — full width, 200px */}
      <div style={{ padding: '3px 6px', overflow: 'hidden', minHeight: 0 }}>
        <SKCCPanel />
      </div>

      {/* Bottom: QSO Log fixed 220px */}
      <div style={{ padding: '3px 6px 6px 6px', overflow: 'hidden', minHeight: 0 }}>
        <QSOLog />
      </div>

      {showSettings && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={(e) => e.target === e.currentTarget && setShowSettings(false)}
        >
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </div>
      )}
    </div>
  )
}
