import { spawn } from 'child_process'
import { app, ipcMain } from 'electron'

let proc         = null
let mainWin      = null
let restartTimer = null
let buffer       = ''

let skedEntries = []  // newest first, max 50
let rbnSpots    = []  // newest first, max 50

// ---- Time parsing ----

function parseUTCTime(hhmm) {
  const h = parseInt(hhmm.slice(0, 2), 10)
  const m = parseInt(hhmm.slice(2, 4), 10)
  const now = new Date()
  const t = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    h, m, 0
  ))
  // If time appears >12h in the future, it's yesterday's reading across midnight
  if (t.getTime() - Date.now() > 12 * 60 * 60 * 1000) {
    t.setUTCDate(t.getUTCDate() - 1)
  }
  return t.getTime()
}

// ---- Regexes ----

const RE_SKED = /^(\d{4})Z\s+(\w+)\s+\((\s*\d+)\s*(\S*)\s+(\w+)\s+(\w+)\s*\)(?:.*?STATUS:\s*(.+))?$/
const RE_RBN  = /^(\d{4})Z\+(\w+)\s+\((\s*\d+)\s*(\S*)\s+(\w+)\s+(\w+)\s*\)\s+on\s+([\d.]+)\s+by\s+(\w+)\((\d+)mi,\s*(\d+)dB\)/

// ---- Need parsers ----

function parseYouNeed(line) {
  const m = line.match(/YOU need (?:them )?for\s+([^T\n]+?)(?:\s+THEY|\s*$)/i)
  if (!m) return []
  return m[1].trim().split(/[,\s]+/).filter(Boolean)
}

function parseTheyNeed(line) {
  const m = line.match(/THEY need you for\s+(.+?)(?:\s*$)/i)
  if (!m) return []
  return m[1].trim().split(/[,\s]+/).filter(Boolean)
}

// ---- Line parser ----

function parseLine(line) {
  // RBN spot (has + after time)
  const rbnMatch = RE_RBN.exec(line)
  if (rbnMatch) {
    const [, time, callsign, skcc_nr_raw, award, name, spc, freqKhz, spotter, dist_mi, snr_db] = rbnMatch
    return {
      type:     'rbn',
      time,
      callsign,
      skcc_nr:  skcc_nr_raw.trim(),
      award,
      name,
      spc,
      freq_mhz: parseFloat(freqKhz) / 1000,
      spotter,
      dist_mi:  parseInt(dist_mi, 10),
      snr_db:   parseInt(snr_db, 10),
      you_need:  parseYouNeed(line),
      they_need: parseTheyNeed(line),
      age_min:   Math.max(0, (Date.now() - parseUTCTime(time)) / 60000),
      timestamp: Date.now(),
    }
  }

  // Sked entry (no + after time)
  const skedMatch = RE_SKED.exec(line)
  if (skedMatch) {
    const [, time, callsign, skcc_nr_raw, award, name, spc, status] = skedMatch
    return {
      type:     'sked',
      time,
      callsign,
      skcc_nr:  skcc_nr_raw.trim(),
      award,
      name,
      spc,
      status:   status?.trim() || null,
      you_need:  parseYouNeed(line),
      they_need: parseTheyNeed(line),
      age_min:   Math.max(0, (Date.now() - parseUTCTime(time)) / 60000),
      timestamp: Date.now(),
    }
  }

  return null
}

// ---- Data store ----

function addEntry(entry) {
  if (entry.type === 'sked') {
    skedEntries = [entry, ...skedEntries.filter(e => e.callsign !== entry.callsign)].slice(0, 50)
  } else {
    const key    = `${entry.callsign}|${entry.freq_mhz.toFixed(3)}`
    const cutoff = Date.now() - 5 * 60 * 1000
    rbnSpots = [
      entry,
      ...rbnSpots.filter(e => {
        const eKey = `${e.callsign}|${e.freq_mhz.toFixed(3)}`
        return !(eKey === key && e.timestamp > cutoff)
      }),
    ].slice(0, 50)
  }
}

function pushUpdates() {
  if (!mainWin || mainWin.isDestroyed()) return
  mainWin.webContents.send('skcc:sked', skedEntries)
  mainWin.webContents.send('skcc:rbn',  rbnSpots)
}

// ---- Process management ----

function startProcess() {
  if (proc) return

  try {
    proc = spawn('./run', [], {
      cwd:   '/home/church/skcc_skimmer',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    console.log('[skcc-skimmer] started pid', proc.pid)

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop()  // keep incomplete trailing line
      let pushed = false
      for (const line of lines) {
        const entry = parseLine(line.trim())
        if (entry) { addEntry(entry); pushed = true }
      }
      if (pushed) pushUpdates()
    })

    proc.stderr.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) console.log('[skcc-skimmer] stderr:', line)
      }
    })

    proc.on('exit', (code) => {
      console.log('[skcc-skimmer] exited with code', code, '— restarting in 30s')
      proc   = null
      buffer = ''
      if (restartTimer) clearTimeout(restartTimer)
      restartTimer = setTimeout(startProcess, 30000)
    })

    proc.on('error', (err) => {
      console.error('[skcc-skimmer] spawn error:', err.message)
      proc = null
    })
  } catch (e) {
    console.error('[skcc-skimmer] failed to start:', e.message)
  }
}

function stopProcess() {
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null }
  if (proc) { proc.kill('SIGTERM'); proc = null }
}

// ---- IPC ----

export function initSKCCSkimmer(mainWindow) {
  mainWin = mainWindow

  ipcMain.handle('skcc:getSked', () => skedEntries)
  ipcMain.handle('skcc:getRbn',  () => rbnSpots)

  app.on('before-quit', stopProcess)

  startProcess()
}
