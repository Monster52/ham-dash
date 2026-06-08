import Database from 'better-sqlite3'
import { mkdirSync, appendFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const SKCCLOGGER_ADI = '/home/church/Desktop/SKCCLogger_Linux_64-Bit/Logs/logfile.adi'

function adifField(tag, value) {
  const s = String(value ?? '')
  return `<${tag}:${s.length}>${s}\n`
}

function appendSkccAdif(qso, band) {
  try {
    const record = [
      adifField('CALL',     qso.callsign),
      adifField('QSO_DATE', (qso.date_on || '').replace(/-/g, '')),
      adifField('TIME_ON',  (qso.time_on || '').replace(':', '').slice(0, 4)),
      adifField('BAND',     band),
      adifField('FREQ',     qso.freq),
      adifField('MODE',     qso.mode),
      adifField('RST_SENT', qso.rst_sent || '599'),
      adifField('RST_RCVD', qso.rst_rcvd || '599'),
      adifField('SRX',      qso.skcc_nr),
      ...(qso.notes ? [adifField('COMMENT', qso.notes)] : []),
      '<EOR>\n\n',
    ].join('')
    appendFileSync(SKCCLOGGER_ADI, record, 'utf8')
    console.log(`[db] appended SKCC ADIF for ${qso.callsign} #${qso.skcc_nr}`)
  } catch (e) {
    console.error('[db] SKCC ADIF append failed:', e.message)
  }
}

const DB_DIR = join(homedir(), 'fac-shack', 'log')
const DB_PATH = join(DB_DIR, 'facshack.db')

let db = null

export function openDatabase() {
  mkdirSync(DB_DIR, { recursive: true })
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS qsos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      callsign    TEXT NOT NULL,
      freq        REAL,
      band        TEXT,
      mode        TEXT,
      rst_sent    TEXT DEFAULT '599',
      rst_rcvd    TEXT DEFAULT '599',
      date_on     TEXT,
      time_on     TEXT,
      skcc_nr     TEXT,
      notes       TEXT,
      source      TEXT DEFAULT 'manual',
      adif_hash   TEXT UNIQUE,
      created_at  TEXT DEFAULT (datetime('now'))
    )
  `)
  return db
}

export function closeDatabase() {
  if (db) { db.close(); db = null }
}

export function freqToBand(freq) {
  const f = parseFloat(freq)
  if (isNaN(f)) return null
  if (f >= 1.8   && f <= 2.0)    return '160m'
  if (f >= 3.5   && f <= 4.0)    return '80m'
  if (f >= 7.0   && f <= 7.3)    return '40m'
  if (f >= 10.1  && f <= 10.15)  return '30m'
  if (f >= 14.0  && f <= 14.35)  return '20m'
  if (f >= 18.068 && f <= 18.168) return '17m'
  if (f >= 21.0  && f <= 21.45)  return '15m'
  if (f >= 24.89 && f <= 24.99)  return '12m'
  if (f >= 28.0  && f <= 29.7)   return '10m'
  return null
}

export function insertQso(qso) {
  const band = qso.band || freqToBand(qso.freq)
  const stmt = db.prepare(`
    INSERT INTO qsos
      (callsign, freq, band, mode, rst_sent, rst_rcvd, date_on, time_on, skcc_nr, notes, source)
    VALUES
      (@callsign, @freq, @band, @mode, @rst_sent, @rst_rcvd, @date_on, @time_on, @skcc_nr, @notes, @source)
  `)
  const normalized = {
    callsign: (qso.callsign || '').toUpperCase(),
    freq:     qso.freq != null ? parseFloat(qso.freq) : null,
    band,
    mode:     qso.mode    || null,
    rst_sent: qso.rst_sent || '599',
    rst_rcvd: qso.rst_rcvd || '599',
    date_on:  qso.date_on  || null,
    time_on:  qso.time_on  || null,
    skcc_nr:  qso.skcc_nr  || null,
    notes:    qso.notes    || null,
    source:   qso.source   || 'manual'
  }
  const result = stmt.run(normalized)
  if (normalized.skcc_nr) appendSkccAdif(normalized, band)
  return { id: result.lastInsertRowid }
}

export function insertOrIgnoreAdif(qso) {
  const band = freqToBand(qso.freq)
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO qsos
      (callsign, freq, band, mode, rst_sent, rst_rcvd, date_on, time_on, skcc_nr, notes, source, adif_hash)
    VALUES
      (@callsign, @freq, @band, @mode, @rst_sent, @rst_rcvd, @date_on, @time_on, @skcc_nr, @notes, @source, @adif_hash)
  `)
  return stmt.run({ ...qso, band })
}

export function listQsos(limit = 50) {
  return db.prepare('SELECT * FROM qsos ORDER BY id DESC LIMIT ?').all(limit)
}

export function searchQsos(query) {
  const like = `%${query}%`
  return db.prepare(`
    SELECT * FROM qsos
    WHERE callsign LIKE ? OR notes LIKE ? OR skcc_nr LIKE ?
    ORDER BY id DESC LIMIT 100
  `).all(like, like, like)
}

export function deleteQso(id) {
  return db.prepare('DELETE FROM qsos WHERE id = ?').run(id)
}

export function getAllQsos() {
  return db.prepare('SELECT * FROM qsos ORDER BY id ASC').all()
}

export function getStats() {
  const total      = db.prepare('SELECT COUNT(*) AS c FROM qsos').get().c
  const skcc_count = db.prepare("SELECT COUNT(*) AS c FROM qsos WHERE skcc_nr IS NOT NULL AND skcc_nr != ''").get().c
  const bandRows   = db.prepare("SELECT band, COUNT(*) AS c FROM qsos WHERE band IS NOT NULL GROUP BY band ORDER BY c DESC").all()
  const modeRows   = db.prepare("SELECT mode, COUNT(*) AS c FROM qsos WHERE mode IS NOT NULL GROUP BY mode ORDER BY c DESC").all()
  const bands = Object.fromEntries(bandRows.map(r => [r.band, r.c]))
  const modes = Object.fromEntries(modeRows.map(r => [r.mode, r.c]))
  return { total, skcc_count, bands, modes }
}
