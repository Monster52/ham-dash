import React, { useState } from 'react'
import Header from './components/Header'
import RigPanel from './components/RigPanel'
import KeyerPanel from './components/KeyerPanel'
import GridPanel from './components/GridPanel'
import BandConditions from './components/BandConditions'
import QSOLog from './components/QSOLog'
import RBNPanel from './components/RBNPanel'
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
        gridTemplateRows: 'auto 1fr 1fr',
        gridTemplateColumns: '1fr',
        overflow: 'hidden',
        fontFamily: '"Share Tech Mono", monospace'
      }}
    >
      <Header onSettings={() => setShowSettings(true)} />

      {/* Top row: 3 columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '300px 460px 1fr',
          gap: '6px',
          padding: '6px 6px 3px 6px',
          overflow: 'hidden',
          minHeight: 0
        }}
      >
        {/* Col 1: Rig Panel */}
        <RigPanel />

        {/* Col 2: Keyer + GPS + BandConditions stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ flex: '1.4', minHeight: 0, overflow: 'hidden' }}>
            <KeyerPanel />
          </div>
          <div style={{ flex: '1', minHeight: 0, overflow: 'hidden' }}>
            <GridPanel />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <BandConditions />
          </div>
        </div>

        {/* Col 3: RBN Panel */}
        <RBNPanel />
      </div>

      {/* Bottom row: QSO Log full width */}
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
