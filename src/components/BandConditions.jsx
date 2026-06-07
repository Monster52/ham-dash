import React, { useState, useEffect } from 'react'
import { useIPCEvent } from '../hooks/useIPC'

const STATUS_COLOR = { OPEN: '#00ff41', MARG: '#ffb000', CLSD: '#ff2200' }

function kColor(k) {
  const n = parseFloat(k)
  if (isNaN(n)) return '#00551a'
  if (n >= 5) return '#ff2200'
  if (n >= 3) return '#ffb000'
  return '#00ff41'
}

function mufLabelColor(source) {
  if (source === 'ionosonde') return '#00ff41'
  if (source === 'noaa')      return '#00ddff'
  return '#ffb000'
}

function BandBadge({ band, status }) {
  const color = status ? STATUS_COLOR[status] : '#335533'
  return (
    <span
      title={`${band}: ${status || 'unknown'}`}
      style={{
        display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
        padding: '2px 5px',
        background: `${color}18`,
        border: `1px solid ${color}55`,
        fontSize: '0.68rem',
        cursor: 'default',
        minWidth: '32px',
      }}
    >
      <span style={{ color: '#00551a' }}>{band}</span>
      <span style={{ color, fontWeight: 'bold' }}>{status ?? '--'}</span>
    </span>
  )
}

export default function BandConditions() {
  const pushed = useIPCEvent(window.api?.propagation?.onData, null)
  const [pulled, setPulled] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    window.api?.propagation?.get().then(setPulled)
  }, [])

  const raw = pushed ?? pulled
  const hasError  = raw?.error != null
  const propData  = hasError ? null : raw
  const muf       = propData?.muf
  const mufSource   = propData?.mufSource
  const mufLabel    = propData?.mufLabel
  const mufDetail   = propData?.mufDetail
  const mufAdjusted = propData?.mufAdjusted
  const nvisBands   = propData?.nvisBands
  const dxBands     = propData?.dxBands

  const handleRefresh = async () => {
    setRefreshing(true)
    await window.api?.propagation?.refresh()
    setRefreshing(false)
  }

  const lbl        = { color: '#00551a', marginRight: '3px', fontSize: '0.7rem' }
  const val        = { fontSize: '0.85rem' }
  const row        = { display: 'flex', alignItems: 'center', gap: '10px', padding: '3px 0' }
  const labelColor = mufLabelColor(mufSource)

  return (
    <div style={{
      background: '#0f1a0f',
      border: '1px solid #1a3a1a',
      borderRadius: '4px',
      boxShadow: '0 0 8px rgba(0,255,65,0.15)',
      padding: '6px',
      fontFamily: '"Share Tech Mono", monospace'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
        <span style={{ fontSize: '0.62rem', color: '#00aa2b', letterSpacing: '0.12em' }}>
          BAND CONDITIONS
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {hasError && <span style={{ fontSize: '0.58rem', color: '#ff2200' }}>UNAVAIL</span>}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              background: 'transparent', border: '1px solid #1a3a1a', color: '#00551a',
              fontFamily: '"Share Tech Mono", monospace', fontSize: '0.58rem',
              padding: '1px 6px', cursor: 'pointer', opacity: refreshing ? 0.5 : 1
            }}
          >
            {refreshing ? '…' : 'REFRESH'}
          </button>
        </div>
      </div>

      {/* Solar indices */}
      <div style={{ ...row, borderTop: '1px solid #111f11', paddingTop: '4px' }}>
        {[
          ['SFI', propData?.sfi, null],
          ['A',   propData?.aindex, null],
          ['K',   propData?.kp != null
                    ? `${propData.kp} [${propData.kpSource}]`
                    : propData?.kindex,
                  kColor(propData?.kp ?? propData?.kindex)],
          ['X',   propData?.xray, null],
          ['SN',  propData?.sunspots, null],
        ].map(([label, value, color]) => (
          <span key={label}>
            <span style={lbl}>{label}:</span>
            <span style={{ ...val, color: color || (value != null ? '#00ff41' : '#335533') }}>
              {value ?? '---'}
            </span>
          </span>
        ))}
      </div>

      {/* MUF + foF2 */}
      <div style={{ ...row, borderTop: '1px solid #111f11' }}>
        <span>
          <span style={lbl}>MUF:</span>
          <span style={{ ...val, color: muf?.muf != null ? '#00ff41' : '#335533' }}>
            {muf?.muf != null ? `${mufAdjusted ? '~' : ''}${muf.muf}MHz` : '--'}
          </span>
          {mufLabel && (
            <span
              title={mufDetail || ''}
              style={{ color: labelColor, fontSize: '0.6rem', marginLeft: '3px', cursor: 'help' }}
            >
              {mufLabel}
            </span>
          )}
        </span>
        <span>
          <span style={lbl}>foF2:</span>
          <span style={{ ...val, color: muf?.foF2 != null ? '#00aa2b' : '#335533' }}>
            {muf?.foF2 != null ? `${muf.foF2}MHz` : '--'}
          </span>
        </span>
      </div>

      {/* NVIS band badges */}
      <div style={{ borderTop: '1px solid #111f11', paddingTop: '4px' }}>
        <div style={{ fontSize: '0.52rem', color: '#00441a', marginBottom: '2px' }}>NVIS</div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap' }}>
          {['160m', '80m', '40m', '30m'].map(band => (
            <BandBadge key={band} band={band} status={nvisBands?.[band]} />
          ))}
        </div>
      </div>

      {/* DX band badges */}
      <div style={{ borderTop: '1px solid #111f11', paddingTop: '4px' }}>
        <div style={{ fontSize: '0.52rem', color: '#00441a', marginBottom: '2px' }}>DX</div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap' }}>
          {['20m', '17m', '15m', '10m'].map(band => (
            <BandBadge key={band} band={band} status={dxBands?.[band]} />
          ))}
        </div>
      </div>

      {/* Source indicator */}
      <div style={{ fontSize: '0.52rem', color: '#00441a', paddingTop: '3px', borderTop: '1px solid #111f11' }}>
        {mufSource === 'ionosonde' && `ionosonde: ${propData?.muf?.stationName || ''}`}
        {mufSource === 'noaa'      && 'NOAA real-time Kp'}
        {mufSource === 'empirical' && 'empirical estimate (HamQSL)'}
        {!mufSource                && 'no data'}
      </div>
    </div>
  )
}
