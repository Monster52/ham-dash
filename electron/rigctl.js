import http from 'http'

let pollInterval  = null
let retryTimer    = null
let statusCallback = null
let currentFreq   = 0
let currentMode   = 'USB'
let connected     = false

// ---- XML-RPC transport ----

function xmlrpc(method, params = []) {
  return new Promise((resolve, reject) => {
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

    const req = http.request({
      hostname: 'localhost',
      port: 12345,
      path: '/RPC2',
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (data.includes('<fault>')) {
          reject(new Error(`XML-RPC fault from ${method}`))
          return
        }
        const m = data.match(/<value>(?:<[^/][^>]*>)?([^<]*)/)
        resolve(m ? m[1].trim() : '')
      })
    })

    req.on('error', reject)
    req.setTimeout(3000, () => {
      req.destroy()
      reject(new Error('XML-RPC timeout'))
    })
    req.write(body)
    req.end()
  })
}

// ---- Polling ----

function startPolling() {
  if (retryTimer)   { clearTimeout(retryTimer);    retryTimer   = null }
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null }

  pollInterval = setInterval(async () => {
    try {
      const freqStr = await xmlrpc('rig.get_vfoA')
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
      await xmlrpc('rig.set_frequency', [newFreq])
      currentFreq = newFreq
      return { ok: true }
    }
    if (cmd.startsWith('F ')) {
      const freqHz = parseInt(cmd.slice(2), 10)
      await xmlrpc('rig.set_frequency', [freqHz])
      currentFreq = freqHz
      return { ok: true }
    }
    if (cmd.startsWith('M ')) {
      const mode = cmd.split(' ')[1]
      await xmlrpc('rig.set_verify_mode', [mode])
      currentMode = mode
      return { ok: true }
    }
    if (cmd === 'init') {
      if (retryTimer)   { clearTimeout(retryTimer);    retryTimer   = null }
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
      try {
        const xcvr = await xmlrpc('rig.get_xcvr')
        // rig.set_xcvr tells FLRig to close and reopen the serial port — same as
        // Config > Setup > Transceiver > Init in the FLRig GUI.
        await xmlrpc('rig.set_xcvr', [xcvr])
        // Give FLRig ~2 s to open the port and finish CAT init before polling.
        await new Promise(r => setTimeout(r, 2000))
        await xmlrpc('rig.get_update')
        startPolling()
        return { ok: true, xcvr: xcvr || 'unknown' }
      } catch (err) {
        scheduleRetry()
        return { ok: false, error: err.message }
      }
    }
    return { ok: false, error: 'Unknown command' }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
