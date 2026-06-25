import React, { useState } from 'react'
import DailyOutlook from './DailyOutlook'
import CWKeyer from './CWKeyer'

function TabBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid #00ff41' : '2px solid transparent',
        color: active ? '#00ff41' : '#004d1a',
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: '0.62rem',
        letterSpacing: '0.1em',
        padding: '2px 10px 4px',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

export default function KeyerOutlookTabs() {
  const [activeTab, setActiveTab] = useState('outlook')

  return (
    <div
      className="panel"
      style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
    >
      {/* Tab header */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #1a3a1a',
        flexShrink: 0,
        padding: '2px 4px 0',
      }}>
        <TabBtn
          label="24HR OUTLOOK"
          active={activeTab === 'outlook'}
          onClick={() => setActiveTab('outlook')}
        />
        <TabBtn
          label="CW KEYER"
          active={activeTab === 'keyer'}
          onClick={() => setActiveTab('keyer')}
        />
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {activeTab === 'outlook'
          ? <DailyOutlook />
          : <CWKeyer />
        }
      </div>
    </div>
  )
}
