import { SerialPort } from 'serialport'

let port = null
let statusCallback = null
let connected = false
let retryTimer = null
let currentPortPath = null
let currentWpm = 18

// WPM -> dit duration in ms
function ditMs(wpm) {
  return Math.round(1200 / wpm)
}

export function startKeyer(portPath, onStatus) {
  currentPortPath = portPath
  statusCallback = onStatus
  openPort(portPath)
}

export function stopKeyer() {
  if (retryTimer) clearTimeout(retryTimer)
  if (port && port.isOpen) {
    port.close()
  }
  port = null
  connected = false
}

function openPort(portPath) {
  if (port) {
    try { port.close() } catch { }
    port = null
  }

  try {
    port = new SerialPort({
      path: portPath,
      baudRate: 9600,
      autoOpen: true
    })

    port.on('open', () => {
      connected = true
      statusCallback?.({ connected: true, port: portPath })
    })

    port.on('error', (err) => {
      connected = false
      statusCallback?.({ connected: false, port: portPath, error: err.message })
      scheduleRetry(portPath)
    })

    port.on('close', () => {
      connected = false
      statusCallback?.({ connected: false, port: portPath })
      scheduleRetry(portPath)
    })
  } catch (err) {
    connected = false
    statusCallback?.({ connected: false, port: portPath, error: err.message })
    scheduleRetry(portPath)
  }
}

function scheduleRetry(portPath) {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = setTimeout(() => openPort(portPath), 5000)
}

export function setWpm(wpm) {
  currentWpm = wpm
  return { ok: true }
}

// Send CW by toggling RTS line (dit = short key, dah = 3x dit)
// Sends morse code via RTS keying
export async function sendCW(text, wpm) {
  if (!connected || !port) return { ok: false, error: 'Keyer not connected' }
  const dit = ditMs(wpm || currentWpm)
  const morse = textToMorse(text.toUpperCase())

  for (const symbol of morse) {
    if (symbol === '.') {
      await keyDown(dit)
      await keyUp(dit)
    } else if (symbol === '-') {
      await keyDown(dit * 3)
      await keyUp(dit)
    } else if (symbol === ' ') {
      await sleep(dit * 7)
    } else if (symbol === '/') {
      await sleep(dit * 3)
    }
  }
  return { ok: true }
}

function keyDown(ms) {
  return new Promise((resolve) => {
    port.set({ rts: true }, () => {
      setTimeout(resolve, ms)
    })
  })
}

function keyUp(ms) {
  return new Promise((resolve) => {
    port.set({ rts: false }, () => {
      setTimeout(resolve, ms)
    })
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const MORSE_TABLE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.',
  G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..',
  M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
  S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '?': '..--..', '/': '-..-.', '.': '.-.-.-', ',': '--..--',
  '=': '-...-', '+': '.-.-.', '-': '-....-', ' ': ' '
}

function textToMorse(text) {
  const result = []
  for (const char of text) {
    const code = MORSE_TABLE[char]
    if (code) {
      if (result.length > 0 && code !== ' ') result.push('/')
      for (const sym of code) result.push(sym)
    }
  }
  return result
}
