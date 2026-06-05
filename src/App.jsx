import React, { useState } from 'react'
import Header from './components/Header'
import RigPanel from './components/RigPanel'
import KeyerPanel from './components/KeyerPanel'
import GridPanel from './components/GridPanel'
import BandConditions from './components/BandConditions'
import QSOLog from './components/QSOLog'
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
        gridTemplateRows: 'auto 1fr',
        gridTemplateColumns: '1fr',
        overflow: 'hidden',
        fontFamily: '"Share Tech Mono", monospace'
      }}
    >
      <Header onSettings={() => setShowSettings(true)} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '380px 220px 220px 1fr',
          gridTemplateRows: '1fr 1fr',
          gap: '6px',
          padding: '6px',
          height: '100%',
          overflow: 'hidden'
        }}
      >
        {/* Row 1: Rig spans 2 rows, Keyer, Grid, Band/QSO */}
        <div style={{ gridRow: '1 / 3', gridColumn: '1' }}>
          <RigPanel />
        </div>
        <div style={{ gridRow: '1', gridColumn: '2' }}>
          <KeyerPanel />
        </div>
        <div style={{ gridRow: '1', gridColumn: '3' }}>
          <GridPanel />
        </div>
        <div style={{ gridRow: '1', gridColumn: '4' }}>
          <BandConditions />
        </div>
        <div style={{ gridRow: '2', gridColumn: '2 / 5' }}>
          <QSOLog />
        </div>
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
