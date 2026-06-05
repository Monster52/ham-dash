import net from 'net'

let client = null
let pollInterval = null
let statusCallback = null
let currentFreq = 0
let currentMode = 'USB'
let retryTimer = null
let connected = false

export function startRigctld(host, port, onStatus) {
  statusCallback = onStatus
  connect(host, port)
}

export function stopRigctld() {
  if (pollInterval) clearInterval(pollInterval)
  if (retryTimer) clearTimeout(retryTimer)
  if (client) {
    client.destroy()
    client = null
  }
  connected = false
}

function connect(host, port) {
  if (client) client.destroy()

  client = new net.Socket()
  let buffer = ''
  let pendingResolve = null
  let pendingReject = null

  client.connect(port, host, () => {
    connected = true
    startPolling(host, port)
  })

  client.on('data', (data) => {
    buffer += data.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      const trimmed = line.trim()
      if (pendingResolve && trimmed) {
        const resolve = pendingResolve
        pendingResolve = null
        pendingReject = null
        resolve(trimmed)
      }
    }
  })

  client.on('error', () => {
    connected = false
    if (pendingReject) {
      const reject = pendingReject
      pendingResolve = null
      pendingReject = null
      reject(new Error('Connection error'))
    }
    statusCallback?.({ connected: false, freq: currentFreq, mode: currentMode, smeter: 0 })
    scheduleRetry(host, port)
  })

  client.on('close', () => {
    connected = false
    statusCallback?.({ connected: false, freq: currentFreq, mode: currentMode, smeter: 0 })
    scheduleRetry(host, port)
  })

  // Attach command sender to client instance
  client._send = (cmd) => {
    return new Promise((resolve, reject) => {
      if (!connected) return reject(new Error('Not connected'))
      pendingResolve = resolve
      pendingReject = reject
      client.write(cmd + '\n')
      setTimeout(() => {
        if (pendingReject === reject) {
          pendingResolve = null
          pendingReject = null
          reject(new Error('Timeout'))
        }
      }, 2000)
    })
  }
}

function scheduleRetry(host, port) {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = setTimeout(() => connect(host, port), 5000)
}

function startPolling(host, port) {
  if (pollInterval) clearInterval(pollInterval)
  pollInterval = setInterval(async () => {
    if (!connected || !client) return
    try {
      const freqStr = await client._send('f')
      const freq = parseInt(freqStr, 10)
      if (!isNaN(freq)) currentFreq = freq

      const modeStr = await client._send('m')
      if (modeStr) currentMode = modeStr.split('\n')[0].trim()

      const smeterStr = await client._send('l STRENGTH')
      const smeterRaw = parseInt(smeterStr, 10)
      const smeter = isNaN(smeterRaw) ? 0 : smeterRaw

      statusCallback?.({
        connected: true,
        freq: currentFreq,
        mode: currentMode,
        smeter
      })
    } catch {
      // poll failure handled by socket events
    }
  }, 500)
}

export async function sendRigCommand(cmd) {
  if (!connected || !client) return { ok: false, error: 'Not connected' }
  try {
    if (cmd.startsWith('tuneStep:')) {
      const [, direction, stepStr] = cmd.split(':')
      const step = parseInt(stepStr, 10)
      const delta = direction === 'up' ? step : -step
      const newFreq = Math.max(0, currentFreq + delta)
      await client._send(`F ${newFreq}`)
      currentFreq = newFreq
      return { ok: true }
    }
    const result = await client._send(cmd)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
