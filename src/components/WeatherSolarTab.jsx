import React, { useState, useEffect } from 'react'
import { useIPCEvent } from '../hooks/useIPC'

const RATING_COLOR = { Good: '#00ff41', Fair: '#ffb000', Poor: '#ff2200' }
const RATING_BG    = { Good: 'rgba(0,255,65,0.10)', Fair: 'rgba(255,176,0,0.10)', Poor: 'rgba(255,34,0,0.10)' }

const BAND_ORDER   = ['80m-40m', '30m-20m', '17m-15m', '12m-10m']
const ACTIVITY_BANDS = ['40m', '20m', '15m', '10m']
const BAR_CELLS    = 10
const BAR_MAX      = 50

const STATUS_COLOR = {
  ACTIVE:   '#00ff41',
  MARGINAL: '#ffb000',
  QUIET:    '#335533',
}

function kColor(k) {
  const n = parseFloat(k)
  if (isNaN(n))  return '#00551a'
  if (n >= 5)    return '#ff2200'
  if (n >= 3)    return '#ffb000'
  return '#00ff41'
}

function utcHHMM(iso) {
  return new Date(iso).toISOString().slice(11, 16) + 'z'
}

function RatingChip({ value }) {
  if (!value) return <span style={{ color: '#335533', fontSize: '0.72rem' }}>---</span>
  return (
    <span style={{
      color:      RATING_COLOR[value] || '#00551a',
      background: RATING_BG[value]    || 'transparent',
      border:     `1px solid ${(RATING_COLOR[value] || '#00551a')}44`,
      padding:    '1px 10px',
      fontSize:   '0.72rem',
      letterSpacing: '0.04em',
    }}>
      {value.toUpperCase()}
    </span>
  )
}

function ActivityCard({ band, data }) {
  if (!data) {
    return (
      <div style={{
        flex: 1, border: '1px solid #1a3a1a', padding: '4px 5px',
        background: '#0a150a', textAlign: 'center',
      }}>
        <div style={{ color: '#00551a', fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '2px' }}>{band}</div>
        <div style={{ color: '#1a3a1a', fontSize: '0.5rem' }}>—</div>
      </div>
    )
  }
  const color  = STATUS_COLOR[data.status] || STATUS_COLOR.QUIET
  const filled = Math.round(Math.min(data.count / BAR_MAX, 1) * BAR_CELLS)
  const label  = data.status === 'MARGINAL' ? 'MARG' : data.status
  return (
    <div style={{ flex: 1, border: `1px solid ${color}55`, padding: '4px 5px', background: `${color}08` }}>
      <div style={{ color, fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '1px' }}>{band}</div>
      <div style={{ color, fontSize: '0.52rem', fontWeight: 'bold', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '0.48rem', color, marginBottom: '1px', letterSpacing: '1px' }}>
        {'█'.repeat(filled)}{'░'.repeat(BAR_CELLS - filled)}
      </div>
      <div style={{ color: '#00551a', fontSize: '0.48rem' }}>{data.count} stn</div>
      {data.potaCount > 0 && (
        <div style={{ color: '#00ddff', fontSize: '0.46rem' }}>+{data.potaCount} POTA</div>
      )}
    </div>
  )
}

export default function WeatherSolarTab() {
  const pushed       = useIPCEvent(window.api?.propagation?.onData,       null)
  const ratingPushed = useIPCEvent(window.api?.bandconditions?.onRating,  null)
  const bandActivity = useIPCEvent(window.api?.propagation?.onBandActivity, null)
  const mufLufPushed = useIPCEvent(window.api?.mufluf?.onData,            null)

  const [pulled,    setPulled]    = useState(null)
  const [rating,    setRating]    = useState(null)
  const [mufLuf,   setMufLuf]    = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    window.api?.propagation?.get().then(setPulled)
    window.api?.bandconditions?.get().then(d => { if (d) setRating(d) })
    window.api?.mufluf?.get().then(d => { if (d) setMufLuf(d) })
  }, [])

  useEffect(() => { if (pushed       !== null) setPulled(pushed)       }, [pushed])
  useEffect(() => { if (ratingPushed !== null) setRating(ratingPushed)  }, [ratingPushed])
  useEffect(() => { if (mufLufPushed !== null) setMufLuf(mufLufPushed)  }, [mufLufPushed])

  const raw      = pushed ?? pulled
  const hasError = raw?.error != null
  const propData = hasError ? null : raw
  const sunTimes = propData?.sunTimes

  const handleRefresh = async () => {
    setRefreshing(true)
    await window.api?.propagation?.refresh()
    setRefreshing(false)
  }

  const lbl = { color: '#00551a', marginRight: '2px', fontSize: '0.6rem' }
  const val = { fontSize: '0.78rem' }

  const kVal = propData?.kp != null ? propData.kp : propData?.kindex

  return (
    <div style={{
      background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: '4px',
      boxShadow: '0 0 8px rgba(0,255,65,0.15)', padding: '6px',
      fontFamily: '"Share Tech Mono", monospace',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
        <span style={{ fontSize: '0.62rem', color: '#00aa2b', letterSpacing: '0.12em' }}>
          PROPAGATION STATUS
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {rating?.updated && (
            <span style={{ fontSize: '0.52rem', color: '#004d19' }}>
              {utcHHMM(rating.updated)}
            </span>
          )}
          {hasError && <span style={{ fontSize: '0.55rem', color: '#ff2200' }}>UNAVAIL</span>}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              background: 'transparent', border: '1px solid #1a3a1a', color: '#00551a',
              fontFamily: '"Share Tech Mono", monospace', fontSize: '0.55rem',
              padding: '1px 6px', cursor: 'pointer', opacity: refreshing ? 0.5 : 1,
            }}
          >
            {refreshing ? '…' : 'REFRESH'}
          </button>
        </div>
      </div>

      {/* Solar stat strip */}
      <div style={{
        display: 'flex', gap: '10px', alignItems: 'center',
        borderTop: '1px solid #111f11', padding: '3px 0 3px',
        flexWrap: 'wrap',
      }}>
        {[
          ['SFI',  rating?.sfi,                                  null],
          ['SN',   rating?.sunspotNumber,                        null],
          ['K',    kVal,                                         kColor(kVal)],
          ['A',    rating?.aIndex ?? propData?.aindex,           null],
          ['S/N',  rating?.signalNoise,                          null],
          ['X',    propData?.xray,                               null],
        ].map(([label, value, color]) => (
          <span key={label}>
            <span style={lbl}>{label}:</span>
            <span style={{ ...val, color: color || (value != null ? '#00ff41' : '#335533') }}>
              {value ?? '---'}
            </span>
          </span>
        ))}
      </div>

      {/* Usable HF Window */}
      {mufLuf && (
        <div style={{ borderTop: '1px solid #111f11', paddingTop: '4px', marginBottom: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
            <span style={{ fontSize: '0.5rem', color: '#00441a', letterSpacing: '0.08em' }}>
              USABLE HF WINDOW
            </span>
            <span style={{ fontSize: '0.48rem', color: '#00331a' }}>
              {mufLuf.isOverride ? `grid: ${mufLuf.gridUsed} (override)` : `grid: ${mufLuf.gridUsed}`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.65rem', color: '#00aa2b' }}>
              LUF: <span style={{ color: '#00ff41' }}>{mufLuf.lufMHz} MHz</span>
            </span>
            <span style={{ fontSize: '0.65rem', color: '#00aa2b' }}>
              MUF: <span style={{ color: '#00ff41' }}>{mufLuf.mufMHz} MHz</span>
            </span>
          </div>
          {/* Range bar: 1.8–30 MHz scale */}
          {(() => {
            const MIN = 1.8, MAX = 30
            const span = MAX - MIN
            const lufPct = Math.max(0, Math.min(100, ((mufLuf.lufMHz - MIN) / span) * 100))
            const mufPct = Math.max(0, Math.min(100, ((mufLuf.mufMHz - MIN) / span) * 100))
            const widthPct = Math.max(0, mufPct - lufPct)
            return (
              <div style={{ position: 'relative', height: '7px', background: '#0a1a0a', border: '1px solid #1a3a1a', borderRadius: '2px', marginBottom: '3px' }}>
                <div style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${lufPct}%`, width: `${widthPct}%`,
                  background: 'linear-gradient(90deg, #00551a, #00ff41)',
                  borderRadius: '1px',
                }} />
              </div>
            )
          })()}
          <div style={{ fontSize: '0.46rem', color: '#003311' }}>
            Estimated from SFI/K/X-ray for {mufLuf.gridUsed} — actual frequencies vary by path, distance, and direction.
          </div>
        </div>
      )}

      {/* N0NBH-style band rating table */}
      <div style={{ borderTop: '1px solid #111f11', paddingTop: '4px' }}>
        <div style={{ fontSize: '0.5rem', color: '#00441a', marginBottom: '3px', letterSpacing: '0.08em' }}>
          BAND CONDITIONS  (SFI / K-adjusted · day vs night)
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: '68px 1fr 1fr',
          gap: '2px', padding: '1px 0 3px',
          borderBottom: '1px solid #0d1a0d',
        }}>
          <span style={{ fontSize: '0.5rem', color: '#00441a' }}>BAND</span>
          <span style={{ fontSize: '0.5rem', color: '#00441a', textAlign: 'center' }}>☀ DAY</span>
          <span style={{ fontSize: '0.5rem', color: '#00441a', textAlign: 'center' }}>☾ NIGHT</span>
        </div>
        {BAND_ORDER.map((band, i) => {
          const r = rating?.ratings?.[band]
          return (
            <div key={band} style={{
              display: 'grid', gridTemplateColumns: '68px 1fr 1fr',
              gap: '2px', padding: '3px 0',
              borderBottom: i < BAND_ORDER.length - 1 ? '1px solid #0a150a' : 'none',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '0.72rem', color: '#00aa2b' }}>{band}</span>
              <div style={{ textAlign: 'center' }}><RatingChip value={r?.day}   /></div>
              <div style={{ textAlign: 'center' }}><RatingChip value={r?.night} /></div>
            </div>
          )
        })}
      </div>

      {/* Band Activity */}
      <div style={{ borderTop: '1px solid #111f11', paddingTop: '4px' }}>
        <div style={{ fontSize: '0.5rem', color: '#00441a', marginBottom: '4px' }}>
          BAND ACTIVITY  (N. America RBN + US POTA · 30min CW)
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {ACTIVITY_BANDS.map(band => (
            <ActivityCard key={band} band={band} data={bandActivity?.[band] ?? null} />
          ))}
        </div>
      </div>

      {/* Sun times */}
      {sunTimes && (
        <div style={{ fontSize: '0.48rem', color: '#004d19', padding: '3px 0 0', borderTop: '1px solid #111f11', marginTop: '3px' }}>
          {`☀ Rise ${utcHHMM(sunTimes.sunrise)}  Noon ${utcHHMM(sunTimes.solarNoon)}  Set ${utcHHMM(sunTimes.sunset)}`}
        </div>
      )}
    </div>
  )
}
