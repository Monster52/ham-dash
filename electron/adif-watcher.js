import chokidar from 'chokidar'
import { readFileSync, existsSync } from 'fs'
import { createHash } from 'crypto'
import { insertOrIgnoreAdif, listQsos } from './db.js'

let watcher = null
let logCallback = null
let database = null

export function startAdifWatcher(filePath, db, onLog) {
  database = db
  logCallback = onLog
  watchFile(filePath)
}

export function stopAdifWatcher() {
  if (watcher) { watcher.close(); watcher = null }
}

function watchFile(filePath) {
  if (watcher) { watcher.close(); watcher = null }

  if (existsSync(filePath)) {
    syncAdif(filePath)
  }

  watcher = chokidar.watch(filePath, {
    persistent: true,
    usePolling: false,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
  })

  watcher.on('change', () => syncAdif(filePath))
  watcher.on('add',    () => syncAdif(filePath))
}

function syncAdif(filePath) {
  if (!database) return
  try {
    const content = readFileSync(filePath, 'utf8')
    const records = parseAdif(content)
    for (const r of records) {
      insertOrIgnoreAdif(r)
    }
    logCallback?.(listQsos(50))
  } catch (e) {
    console.error('[adif-watcher] sync error:', e.message)
  }
}

function adifHash(call, date, time, freq) {
  return createHash('md5')
    .update(`${call}|${date}|${time}|${freq}`)
    .digest('hex')
}

function parseAdif(content) {
  const records = content.split(/<EOR>/i).filter(Boolean)
  const qsos = []

  for (const record of records) {
    const fields = {}
    const regex = /<([A-Z_0-9]+)(?::\d+(?::[A-Z])?)?>([^<]*)/gi
    let m
    while ((m = regex.exec(record)) !== null) {
      const key = m[1].toUpperCase()
      const val = m[2].trim()
      if (val) fields[key] = val
    }

    const call = fields['CALL']
    if (!call) continue

    const freq    = fields['FREQ'] || ''
    const date    = fields['QSO_DATE'] || ''
    const timeOn  = (fields['TIME_ON'] || '').slice(0, 4)
    // Normalize date YYYYMMDD → YYYY-MM-DD
    const dateNorm = date.length === 8
      ? `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`
      : date

    qsos.push({
      callsign: call.toUpperCase(),
      freq:     freq ? parseFloat(freq) : null,
      mode:     fields['MODE']  || null,
      rst_sent: fields['RST_SENT'] || '599',
      rst_rcvd: fields['RST_RCVD'] || '599',
      date_on:  dateNorm || null,
      time_on:  timeOn   || null,
      skcc_nr:  fields['SRX'] || fields['SRX_STRING'] || null,
      notes:    fields['COMMENT'] || fields['NOTES'] || null,
      source:   'skcclogger',
      adif_hash: adifHash(call, date, timeOn, freq)
    })
  }

  return qsos
}
