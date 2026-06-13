const FLRIG_URL = 'http://localhost:12345/RPC2'

let pollInterval  = null
let retryTimer    = null
let statusCallback = null
let currentFreq   = 0
let currentMode   = 'USB'
let connected     = false

// ---- XML-RPC transport ----

async function xmlrpc(method, params = []) {
  const paramXml = params.map(p =>
    typeof p === 'number'
      ? `<param><value><double>${p}</double></value></param>`
      : `<param><value><string>${p}</string></value></param>`
  ).join('')

  const body = `<?xml version="1.0"?>
<methodCall>
  <methodName>${method}</methodName>
  <params>${paramXml}</params>
</methodCall>`

  const res = await fetch(FLRIG_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/xml' },
    body,
    signal:  AbortSignal.timeout(3000),
  })
  const text = await res.text()
  if (text.includes('<fault>')) throw new Error(`XML-RPC fault from ${method}`)
  const m = text.match(/<value>(?:<[^/][^>]*>)?([^<]*)/)
  return m ? m[1].trim() : ''
}

// ---- Polling ----

function startPolling() {
  if (retryTimer)   { clearTimeout(retryTimer);    retryTimer   = null }
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null }

  pollInterval = setInterval(async () => {
    try {
      const freqStr = await xmlrpc('rig.get_vfo')
      const freq    = parseInt(freqStr, 10)
      if (!isNaN(freq) && freq > 0) currentFreq = freq

      const mode = await xmlrpc('rig.get_mode')
      if (mode) currentMode = mode

      const smeterStr  = await xmlrpc('rig.get_smeter')
      const smeter0100 = parseInt(smeterStr, 10)
      // flrig 0-100 → approximate hamlib dBm (0 = S0 = -54 dBm, 100 = S9+60 = +60 dBm)
      const smeter = isNaN(smeter0100) ? 0 : Math.round(smeter0100 * 1.14 - 54)

      connected = true
      statusCallback?.({ connected: true, freq: currentFreq, mode: currentMode, smeter })
    } catch {
      connected = false
      statusCallback?.({ connected: false, freq: currentFreq, mode: currentMode, smeter: 0 })
      scheduleRetry()
    }
  }, 500)
}

function scheduleRetry() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
  if (retryTimer)   clearTimeout(retryTimer)
  retryTimer = setTimeout(startPolling, 5000)
}

// ---- Public API (same signatures as rigctld version) ----

export function startRigctld(_host, _port, onStatus) {
  statusCallback = onStatus
  startPolling()
}

export function stopRigctld() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
  if (retryTimer)   { clearTimeout(retryTimer);    retryTimer   = null }
  connected = false
}

export async function sendRigCommand(cmd) {
  try {
    if (cmd.startsWith('tuneStep:')) {
      const [, direction, stepStr] = cmd.split(':')
      const step    = parseInt(stepStr, 10)
      const delta   = direction === 'up' ? step : -step
      const newFreq = Math.max(0, currentFreq + delta)
      await xmlrpc('rig.set_vfo', [newFreq])
      currentFreq = newFreq
      return { ok: true }
    }
    if (cmd.startsWith('F ')) {
      const freqHz = parseInt(cmd.slice(2), 10)
      await xmlrpc('rig.set_vfo', [freqHz])
      currentFreq = freqHz
      return { ok: true }
    }
    if (cmd.startsWith('M ')) {
      const mode = cmd.split(' ')[1]
      await xmlrpc('rig.set_mode', [mode])
      currentMode = mode
      return { ok: true }
    }
    return { ok: false, error: 'Unknown command' }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
