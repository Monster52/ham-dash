import net from 'net'

let client = null
let statusCallback = null
let retryTimer = null
let connected = false

export function startGPS(host, port, onStatus) {
  statusCallback = onStatus
  connect(host, port)
}

export function stopGPS() {
  if (retryTimer) clearTimeout(retryTimer)
  if (client) { client.destroy(); client = null }
  connected = false
}

function connect(host, port) {
  if (client) client.destroy()

  client = new net.Socket()
  let buffer = ''

  client.connect(port, host, () => {
    connected = true
    // gpsd watch command
    client.write('?WATCH={"enable":true,"json":true};\n')
  })

  client.on('data', (data) => {
    buffer += data.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      try {
        const msg = JSON.parse(line.trim())
        if (msg.class === 'TPV') {
          const lat = msg.lat
          const lon = msg.lon
          const locked = msg.mode >= 2
          const grid = (lat != null && lon != null) ? maidenhead(lat, lon) : '??'
          statusCallback?.({ connected: true, locked, lat, lon, grid })
        }
      } catch { }
    }
  })

  client.on('error', () => {
    connected = false
    statusCallback?.({ connected: false, locked: false, lat: null, lon: null, grid: '???' })
    scheduleRetry(host, port)
  })

  client.on('close', () => {
    connected = false
    statusCallback?.({ connected: false, locked: false, lat: null, lon: null, grid: '???' })
    scheduleRetry(host, port)
  })
}

function scheduleRetry(host, port) {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = setTimeout(() => connect(host, port), 5000)
}

// Maidenhead grid square calculation (6-character)
export function maidenhead(lat, lon) {
  const adjLon = lon + 180
  const adjLat = lat + 90

  const fieldLon = Math.floor(adjLon / 20)
  const fieldLat = Math.floor(adjLat / 10)

  const squareLon = Math.floor((adjLon % 20) / 2)
  const squareLat = Math.floor(adjLat % 10)

  const subLon = Math.floor(((adjLon % 20) % 2) / (2 / 24))
  const subLat = Math.floor((adjLat % 1) / (1 / 24))

  return (
    String.fromCharCode(65 + fieldLon) +
    String.fromCharCode(65 + fieldLat) +
    String(squareLon) +
    String(squareLat) +
    String.fromCharCode(97 + subLon) +
    String.fromCharCode(97 + subLat)
  )
}
