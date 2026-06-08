import React, { useState, useEffect, useMemo } from 'react'
import { useIPCEvent } from '../hooks/useIPC'

const SKED_COLS = '44px 80px 55px 38px 65px 32px 75px 80px 1fr'
const RBN_COLS  = '44px 80px 55px 38px 65px 32px 60px 65px 48px 36px 1fr'

function awardColor(award) {
  if (!award) return '#335533'
  const a = award.toUpperCase()
  if (a.startsWith('S')) return '#00ddff'
  if (a.startsWith('T')) return '#00ff41'
  if (a.startsWith('C')) return '#ffb000'
  return '#335533'
}

function snrColor(snr) {
  if (snr >= 10) return '#00ff41'
  if (snr >= 5)  return '#ffb000'
  return '#ff2200'
}

function parseStatusFreq(status) {
  if (!status) return null
  const m = status.match(/([\d.]+)/)
  if (!m) return null
  const khz = parseFloat(m[1])
  return isNaN(khz) ? null : Math.round(khz * 1000)
}

function tuneRig(freqHz) {
  if (freqHz) window.api?.rig?.setFreq(freqHz)
}

function prefillCallsign(spot) {
  window.api?.qso?.prefill({ callsign: spot.callsign })
}

const hdr = {
  fontSize: '0.5rem', color: '#00551a', padding: '1px 0',
  borderBottom: '1px solid #0d1a0d', userSelect: 'none',
}

function ColHeaders({ cols, labels }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '4px', padding: '1px 4px' }}>
      {labels.map(l => <span key={l} style={hdr}>{l}</span>)}
    </div>
  )
}

// ---- Sked row ----
function SkedRow({ spot, idx }) {
  const [hovered, setHovered] = useState(false)
  const theyNeed = spot.they_need?.length > 0
  const freqHz   = parseStatusFreq(spot.status)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid', gridTemplateColumns: SKED_COLS, gap: '4px',
        padding: '1px 4px', fontSize: '0.65rem',
        fontFamily: '"Share Tech Mono", monospace',
        background: hovered ? 'rgba(0,255,65,0.05)' : idx % 2 === 0 ? 'transparent' : 'rgba(0,255,65,0.02)',
        borderBottom: '1px solid #0d1a0d',
        borderLeft: theyNeed ? '2px solid #ffb000' : '2px solid transparent',
      }}
    >
      <span style={{ color: '#335533' }}>{spot.time}z</span>
      <span
        style={{ color: '#00ff41', cursor: 'pointer' }}
        onClick={() => prefillCallsign(spot)}
        title="Prefill QSO log"
      >
        {spot.callsign}
      </span>
      <span style={{ color: '#ffb000' }}>{spot.skcc_nr}</span>
      <span style={{ color: awardColor(spot.award), fontSize: '0.6rem' }}>{spot.award || '—'}</span>
      <span style={{ color: '#00551a' }}>{spot.name}</span>
      <span style={{ color: '#335533' }}>{spot.spc}</span>
      <span
        style={{ color: freqHz ? '#ffb000' : '#335533', cursor: freqHz ? 'pointer' : 'default' }}
        onClick={() => freqHz && tuneRig(freqHz)}
        title={freqHz ? 'Tune rig' : ''}
      >
        {spot.status || '—'}
      </span>
      <span style={{ color: '#00ff41', fontSize: '0.62rem' }}>
        {spot.you_need?.join(' ') || '—'}
      </span>
      <span style={{ color: '#ffb000', fontSize: '0.62rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {spot.they_need?.join(' ') || ''}
      </span>
    </div>
  )
}

// ---- RBN row ----
function RBNRow({ spot, idx }) {
  const [hovered, setHovered] = useState(false)
  const theyNeed = spot.they_need?.length > 0
  const freqHz   = Math.round(spot.freq_mhz * 1000000)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid', gridTemplateColumns: RBN_COLS, gap: '4px',
        padding: '1px 4px', fontSize: '0.65rem',
        fontFamily: '"Share Tech Mono", monospace',
        background: hovered ? 'rgba(0,255,65,0.05)' : idx % 2 === 0 ? 'transparent' : 'rgba(0,255,65,0.02)',
        borderBottom: '1px solid #0d1a0d',
        borderLeft: theyNeed ? '2px solid #ffb000' : '2px solid transparent',
      }}
    >
      <span style={{ color: '#335533' }}>{spot.time}z</span>
      <span
        style={{ color: '#00ff41', cursor: 'pointer' }}
        onClick={() => prefillCallsign(spot)}
        title="Prefill QSO log"
      >
        {spot.callsign}
      </span>
      <span style={{ color: '#ffb000' }}>{spot.skcc_nr}</span>
      <span style={{ color: awardColor(spot.award), fontSize: '0.6rem' }}>{spot.award || '—'}</span>
      <span style={{ color: '#00551a' }}>{spot.name}</span>
      <span style={{ color: '#335533' }}>{spot.spc}</span>
      <span
        style={{ color: '#ffb000', cursor: 'pointer' }}
        onClick={() => tuneRig(freqHz)}
        title="Tune rig"
      >
        {spot.freq_mhz.toFixed(3)}
      </span>
      <span style={{ color: '#335533', fontSize: '0.62rem' }}>{spot.spotter}</span>
      <span style={{ color: '#335533' }}>{spot.dist_mi}mi</span>
      <span style={{ color: snrColor(spot.snr_db) }}>{spot.snr_db}</span>
      <span style={{ color: '#00ff41', fontSize: '0.62rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {spot.you_need?.join(' ') || '—'}
      </span>
    </div>
  )
}

// ---- Main panel ----
export default function SKCCPanel() {
  const pushedSked = useIPCEvent(window.api?.skcc?.onSked, null)
  const pushedRbn  = useIPCEvent(window.api?.skcc?.onRbn,  null)
  const [skedData, setSkedData] = useState([])
  const [rbnData,  setRbnData]  = useState([])
  const [activeTab, setActiveTab] = useState('sked')

  useEffect(() => {
    window.api?.skcc?.getSked().then(d => { if (d) setSkedData(d) })
    window.api?.skcc?.getRbn().then(d  => { if (d) setRbnData(d) })
  }, [])

  useEffect(() => { if (pushedSked !== null) setSkedData(pushedSked) }, [pushedSked])
  useEffect(() => { if (pushedRbn  !== null) setRbnData(pushedRbn)   }, [pushedRbn])

  const skedStats = useMemo(() => ({
    total:    skedData.length,
    needYou:  skedData.filter(s => s.they_need?.length > 0).length,
    youNeed:  skedData.filter(s => s.you_need?.length > 0).length,
  }), [skedData])

  const rbnStats = useMemo(() => {
    const total   = rbnData.length
    const needYou = rbnData.filter(s => s.they_need?.length > 0).length
    const best    = rbnData.reduce((a, b) => (b.snr_db > (a?.snr_db ?? -Infinity) ? b : a), null)
    const closest = rbnData.reduce((a, b) => (b.dist_mi < (a?.dist_mi ?? Infinity) ? b : a), null)
    return { total, needYou, best, closest }
  }, [rbnData])

  const tabStyle = (active) => ({
    padding: '1px 8px', fontSize: '0.6rem', cursor: 'pointer',
    fontFamily: '"Share Tech Mono", monospace', letterSpacing: '0.08em',
    background: active ? 'rgba(0,255,65,0.1)' : 'transparent',
    border: `1px solid ${active ? '#00ff41' : '#1a3a1a'}`,
    color: active ? '#00ff41' : '#335533',
    marginRight: '4px',
  })

  return (
    <div style={{
      background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: '4px',
      boxShadow: '0 0 8px rgba(0,255,65,0.15)',
      fontFamily: '"Share Tech Mono", monospace',
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', gap: '8px', flexShrink: 0, borderBottom: '1px solid #111f11' }}>
        <button style={tabStyle(activeTab === 'sked')} onClick={() => setActiveTab('sked')}>SKED PAGE</button>
        <button style={tabStyle(activeTab === 'rbn')}  onClick={() => setActiveTab('rbn')}>RBN SPOTS</button>
        <span style={{ fontSize: '0.58rem', color: '#00551a', marginLeft: '4px' }}>
          KJ5NUJ #30741 · Goal: Centurion
        </span>
        <span style={{ fontSize: '0.52rem', color: '#335533', marginLeft: 'auto' }}>
          {activeTab === 'sked'
            ? `${skedStats.total} entries`
            : `${rbnStats.total} spots`}
        </span>
      </div>

      {/* Table area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {activeTab === 'sked' ? (
          <>
            <ColHeaders cols={SKED_COLS} labels={['TIME', 'CALLSIGN', 'SKCC#', 'AWD', 'NAME', 'SPC', 'STATUS', 'YOU NEED', 'THEY NEED']} />
            <div style={{ overflowY: 'auto', maxHeight: '100px' }}>
              {skedData.length === 0
                ? <div style={{ padding: '12px 6px', fontSize: '0.65rem', color: '#335533' }}>
                    SKCC SKED PAGE OFFLINE — skimmer connecting...
                  </div>
                : skedData.map((s, i) => <SkedRow key={`${s.callsign}${s.time}`} spot={s} idx={i} />)
              }
            </div>
          </>
        ) : (
          <>
            <ColHeaders cols={RBN_COLS} labels={['TIME', 'CALLSIGN', 'SKCC#', 'AWD', 'NAME', 'SPC', 'FREQ', 'SPOTTER', 'DIST', 'SNR', 'YOU NEED']} />
            <div style={{ overflowY: 'auto', maxHeight: '100px' }}>
              {rbnData.length === 0
                ? <div style={{ padding: '12px 6px', fontSize: '0.65rem', color: '#335533' }}>
                    NO SKCC SPOTS — band may be closed or no members active
                  </div>
                : rbnData.map((s, i) => <RBNRow key={`${s.callsign}${s.time}${s.freq_mhz}`} spot={s} idx={i} />)
              }
            </div>
          </>
        )}
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'flex', gap: '10px', padding: '2px 6px',
        borderTop: '1px solid #111f11', fontSize: '0.55rem', color: '#00551a', flexShrink: 0,
      }}>
        {activeTab === 'sked' ? (
          <>
            <span>On sked: <span style={{ color: '#00ff41' }}>{skedStats.total}</span></span>
            <span>Need you: <span style={{ color: '#ffb000' }}>{skedStats.needYou}</span></span>
            <span>You need: <span style={{ color: '#00ff41' }}>{skedStats.youNeed}</span></span>
          </>
        ) : (
          <>
            <span>Live spots: <span style={{ color: '#00ff41' }}>{rbnStats.total}</span></span>
            <span>Need you: <span style={{ color: '#ffb000' }}>{rbnStats.needYou}</span></span>
            {rbnStats.best && (
              <span>Best SNR: <span style={{ color: '#00ff41' }}>{rbnStats.best.callsign} +{rbnStats.best.snr_db}dB</span></span>
            )}
            {rbnStats.closest && (
              <span>Closest: <span style={{ color: '#00ff41' }}>{rbnStats.closest.callsign} {rbnStats.closest.dist_mi}mi</span></span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
