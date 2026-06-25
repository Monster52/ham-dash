import net from 'net'
import { ipcMain, app } from 'electron'

const DEFAULT_HOST = 'hamqth.com'
const DEFAULT_PORT = 7300
const MAX_SPOTS = 50
const RECONNECT_DELAY_MS = 5000

// Standard AK1A/DXSpider spot: DX de SPOTTER:   FREQ   DXCALL   COMMENT   HHMMZ
const DX_SPOT_RE = /^DX de\s+(\S+):\s+([\d.]+)\s+(\S+)\s+(.*?)\s+(\d{4})Z\s*$/

let mainWindowRef = null
let socket = null
let reconnectTimer = null
let quitting = false
let callsign = 'KJ5NUJ'
let configHost = DEFAULT_HOST
let configPort = DEFAULT_PORT
let spots = []
let spotIdCounter = 0

function getBand(freqMhz) {
  if (freqMhz >= 1.8  && freqMhz < 2)    return '160m'
  if (freqMhz >= 3.5  && freqMhz < 4)    return '80m'
  if (freqMhz >= 7    && freqMhz < 7.3)  return '40m'
  if (freqMhz >= 10   && freqMhz < 10.2) return '30m'
  if (freqMhz >= 14   && freqMhz < 14.4) return '20m'
  if (freqMhz >= 18   && freqMhz < 18.2) return '17m'
  if (freqMhz >= 21   && freqMhz < 21.5) return '15m'
  if (freqMhz >= 24.8 && freqMhz < 25)   return '12m'
  if (freqMhz >= 28   && freqMhz < 29.7) return '10m'
  if (freqMhz >= 50   && freqMhz < 54)   return '6m'
  return null
}

function parseLine(line) {
  const m = DX_SPOT_RE.exec(line.trim())
  if (!m) return

  const [, spotter, freqKhzStr, dxCall, comment, time] = m
  const freqKhz = parseFloat(freqKhzStr)
  const band    = getBand(freqKhz / 1000)

  const spot = {
    id:        ++spotIdCounter,
    spotter:   spotter.replace(/:$/, ''),
    freq:      freqKhz,
    dxCall:    dxCall.toUpperCase(),
    comment:   comment.trim(),
    band,
    time,
    timestamp: Date.now(),
  }

  spots.unshift(spot)
  spots = spots.slice(0, MAX_SPOTS)

  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('dxcluster:spot', spot)
  }
}

function sendStatus(status) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('dxcluster:status', { status })
  }
}

function connect() {
  if (quitting) return

  socket = new net.Socket()
  let buffer = ''

  socket.connect(configPort, configHost, () => {
    console.log('[DX] Connected to', configHost + ':' + configPort)
    sendStatus('connected')
    // 2s delay before login — same pattern as RBN
    setTimeout(() => {
      if (socket && !socket.destroyed) {
        socket.write(callsign + '\r\n')
      }
    }, 2000)
  })

  socket.on('data', chunk => {
    buffer += chunk.toString('utf8')
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      parseLine(line.trim())
    }
  })

  socket.on('close', () => {
    console.log('[DX] Connection closed')
    sendStatus('retrying')
    scheduleReconnect()
  })

  socket.on('error', err => {
    console.error('[DX] Socket error:', err.message)
    sendStatus('retrying')
    socket.destroy()
  })
}

function scheduleReconnect() {
  if (quitting || reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, RECONNECT_DELAY_MS)
}

function initDXCluster(mainWindow, options = {}) {
  callsign   = options.callsign || 'KJ5NUJ'
  configHost = options.host     || DEFAULT_HOST
  configPort = options.port     || DEFAULT_PORT
  mainWindowRef = mainWindow

  ipcMain.handle('dxcluster:get', () => spots.slice(0, MAX_SPOTS))

  connect()

  app.on('before-quit', () => {
    quitting = true
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (socket)         { socket.destroy(); socket = null }
  })
}

function stopDXCluster() {
  quitting = true
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (socket)         { socket.destroy(); socket = null }
}

export { initDXCluster, stopDXCluster }
