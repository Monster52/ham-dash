import chokidar from 'chokidar'
import { readFileSync } from 'fs'
import { existsSync } from 'fs'

let watcher = null
let logCallback = null

export function startAdifWatcher(filePath, onLog) {
  logCallback = onLog
  watchFile(filePath)
}

export function stopAdifWatcher() {
  if (watcher) { watcher.close(); watcher = null }
}

function watchFile(filePath) {
  if (watcher) { watcher.close(); watcher = null }

  // Initial read
  if (existsSync(filePath)) {
    parseAndEmit(filePath)
  }

  watcher = chokidar.watch(filePath, {
    persistent: true,
    usePolling: false,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
  })

  watcher.on('change', () => parseAndEmit(filePath))
  watcher.on('add', () => parseAndEmit(filePath))
}

function parseAndEmit(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8')
    const qsos = parseAdif(content)
    logCallback?.(qsos.slice(-10).reverse())
  } catch { }
}

function parseAdif(content) {
  // Split on end-of-record markers <EOR>
  const records = content.toUpperCase().split(/<EOR>/i).filter(Boolean)
  const qsos = []

  for (const record of records) {
    const fields = {}
    const regex = /<([A-Z_]+)(?::\d+(?::[A-Z])?)?>([^<]*)/gi
    let match
    while ((match = regex.exec(record)) !== null) {
      const fieldName = match[1].toUpperCase()
      const value = match[2].trim()
      if (value) fields[fieldName] = value
    }

    if (fields['CALL']) {
      qsos.push({
        call: fields['CALL'] || '',
        freq: fields['FREQ'] || '',
        mode: fields['MODE'] || '',
        skcc: fields['SRX'] || fields['SRX_STRING'] || '',
        timeOn: fields['TIME_ON'] || '',
        date: fields['QSO_DATE'] || ''
      })
    }
  }

  return qsos
}
