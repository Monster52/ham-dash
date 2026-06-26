import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import { startRigctld, stopRigctld, sendRigCommand } from './rigctl.js'
import { startKeyer, stopKeyer, sendCW, setWpm } from './keyer.js'
import { startGPS, stopGPS } from './gps.js'
import { startAdifWatcher, stopAdifWatcher } from './adif-watcher.js'
import { fetchPropagation, startPropagationTimer, stopPropagationTimer } from './propagation.js'
import { buildRatingResponse } from './band-conditions-rating.js'
import { openDatabase, closeDatabase, insertQso, listQsos, searchQsos, deleteQso, getStats } from './db.js'
import { exportAdif } from './adif-export.js'
import { initRBN, getRBNSpots } from './rbn.js'
import { initPOTA } from './pota.js'
import { initCallsignLookup } from './callsign.js'
import { initSKCCSkimmer, startSKCCSkimmer, stopSKCCSkimmer } from './skcc-skimmer.js'
import { initOutlook, stopOutlook, getOutlookCache, refreshOutlook } from './daily-outlook.js'
import { initDXCluster, stopDXCluster } from './dxcluster.js'
import { gridToLatLon } from './grid-utils.js'
import { computeMufLuf } from './muf-luf.js'

const DEFAULT_CALLSIGN = 'KJ5NUJ'
const DEFAULT_GRID     = 'EM50JI'

const store = new Store({
  defaults: {
    callsign:       DEFAULT_CALLSIGN,
    grid:           DEFAULT_GRID,
    skccMember:     true,
    skccNumber:     '30741',
    mufLufGrid:     '',
    dxclusterHost:  'hamqth.com',
    dxclusterPort:  7300,
    rigctldHost: 'localhost',
    rigctldPort: 4532,
    keyerPort: '/dev/ttyUSB0',
    adifPath: `${process.env.HOME}/skcclogger/log.adi`,
    keyerMessages: {
      msg1: `CQ CQ DE ${DEFAULT_CALLSIGN} ${DEFAULT_CALLSIGN} K`,
      msg2: `TU 73 DE ${DEFAULT_CALLSIGN} K`,
      msg3: `${DEFAULT_CALLSIGN} ${DEFAULT_GRID}`,
      msg4: `QRZ? DE ${DEFAULT_CALLSIGN} K`
    },
    wpm: 18
  }
})

let mainWindow = null
let lastPropagationData = null
let lastMufLufData = null
let db = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    initHardware()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.fac.shack.dashboard')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  db = openDatabase()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  shutdownHardware()
  closeDatabase()
  if (process.platform !== 'darwin') app.quit()
})

function emitQsoUpdate() {
  mainWindow?.webContents.send('qso:log', listQsos(50))
}

function emitMufLuf() {
  if (!lastPropagationData || lastPropagationData.error) return
  const overrideGrid = (store.get('mufLufGrid') || '').trim()
  const stationGrid  = store.get('grid') || DEFAULT_GRID
  const resolvedGrid = overrideGrid || stationGrid
  const isOverride   = !!overrideGrid

  let coords = gridToLatLon(resolvedGrid)
  if (!coords) {
    console.warn(`[muf-luf] Invalid grid "${resolvedGrid}", falling back to ${stationGrid}`)
    coords = gridToLatLon(stationGrid) || { lat: 30.35, lon: -89.15 }
  }

  const result = computeMufLuf(lastPropagationData, coords.lat, coords.lon)
  lastMufLufData = { ...result, updated: new Date().toISOString(), gridUsed: resolvedGrid, isOverride }
  mainWindow?.webContents.send('mufluf:data', lastMufLufData)
}

function initHardware() {
  const settings = store.store

  startRigctld(settings.rigctldHost, settings.rigctldPort, (data) => {
    mainWindow?.webContents.send('rig:status', data)
  })

  startKeyer(settings.keyerPort, (status) => {
    mainWindow?.webContents.send('keyer:status', status)
  })

  startGPS('localhost', 2947, (data) => {
    mainWindow?.webContents.send('gps:status', data)
  })

  startAdifWatcher(settings.adifPath, db, (qsos) => {
    mainWindow?.webContents.send('qso:log', qsos)
  })

  initRBN(mainWindow, store.get('callsign'))
  initPOTA(mainWindow)
  initCallsignLookup()
  initSKCCSkimmer(mainWindow)
  if (store.get('skccMember')) startSKCCSkimmer()
  initDXCluster(mainWindow, {
    callsign: store.get('callsign'),
    host:     store.get('dxclusterHost'),
    port:     store.get('dxclusterPort'),
  })

  startPropagationTimer((data) => {
    lastPropagationData = data
    mainWindow?.webContents.send('propagation:data', data)
    const rating = buildRatingResponse(data)
    if (rating) mainWindow?.webContents.send('bandconditions:rating', rating)
    emitMufLuf()
  })

  fetchPropagation().then((data) => {
    lastPropagationData = data
    mainWindow?.webContents.send('propagation:data', data)
    const rating = buildRatingResponse(data)
    if (rating) mainWindow?.webContents.send('bandconditions:rating', rating)
    emitMufLuf()
  })

  initOutlook((data) => {
    mainWindow?.webContents.send('outlook:data', data)
  })
}

function shutdownHardware() {
  stopRigctld()
  stopKeyer()
  stopGPS()
  stopAdifWatcher()
  stopPropagationTimer()
  stopOutlook()
  stopDXCluster()
  stopSKCCSkimmer()
}

// --- IPC Handlers ---

ipcMain.handle('rig:setFreq', async (_, freqHz) => {
  return sendRigCommand(`F ${freqHz}`)
})

ipcMain.handle('rig:setMode', async (_, mode) => {
  return sendRigCommand(`M ${mode} 0`)
})

ipcMain.handle('rig:tuneStep', async (_, { direction, step }) => {
  return sendRigCommand(`tuneStep:${direction}:${step}`)
})

ipcMain.handle('rig:init', async () => {
  return await sendRigCommand('init')
})

ipcMain.handle('keyer:send', async (_, { text, wpm }) => {
  return sendCW(text, wpm)
})

ipcMain.handle('keyer:setWpm', async (_, wpm) => {
  store.set('wpm', wpm)
  return setWpm(wpm)
})

ipcMain.handle('keyer:dit', async () => {
  return sendCW('.', store.get('wpm'))
})

ipcMain.handle('keyer:dah', async () => {
  return sendCW('-', store.get('wpm'))
})

ipcMain.handle('propagation:get', async () => {
  if (lastPropagationData) return lastPropagationData
  const data = await fetchPropagation()
  lastPropagationData = data
  return data
})

ipcMain.handle('propagation:refresh', async () => {
  const data = await fetchPropagation()
  lastPropagationData = data
  mainWindow?.webContents.send('propagation:data', data)
  const rating = buildRatingResponse(data)
  if (rating) mainWindow?.webContents.send('bandconditions:rating', rating)
  emitMufLuf()
  return data
})

ipcMain.handle('mufluf:get', async () => lastMufLufData)

ipcMain.handle('bandconditions:get', async () => {
  return lastPropagationData ? buildRatingResponse(lastPropagationData) : null
})

ipcMain.handle('outlook:get', async () => {
  return getOutlookCache()
})

ipcMain.handle('outlook:refresh', async () => {
  const data = await refreshOutlook()
  if (data) mainWindow?.webContents.send('outlook:data', data)
  return data
})

// --- QSO prefill relay ---

ipcMain.on('qso:prefill', (_, data) => {
  mainWindow?.webContents.send('qso:prefill', data)
})

// --- QSO handlers ---

ipcMain.handle('qso:add', async (_, qso) => {
  try {
    const result = insertQso(qso)
    emitQsoUpdate()
    return { success: true, id: result.id }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('qso:list', async () => {
  return listQsos(50)
})

ipcMain.handle('qso:search', async (_, { query }) => {
  if (!query?.trim()) return listQsos(50)
  return searchQsos(query.trim())
})

ipcMain.handle('qso:delete', async (_, { id }) => {
  try {
    deleteQso(id)
    emitQsoUpdate()
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('qso:export', async () => {
  try {
    const filepath = exportAdif()
    return { success: true, filepath }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('qso:stats', async () => {
  return getStats()
})

// --- Config ---

ipcMain.handle('config:getStation', async () => ({
  callsign:   store.get('callsign'),
  grid:       store.get('grid'),
  skccMember: store.get('skccMember'),
  skccNumber: store.get('skccNumber'),
}))

// --- Settings ---

ipcMain.handle('settings:get', async () => {
  return store.store
})

ipcMain.handle('settings:set', async (_, newSettings) => {
  const old = store.store
  store.set(newSettings)

  mainWindow?.webContents.send('config:changed', {
    callsign:   store.get('callsign'),
    grid:       store.get('grid'),
    skccMember: store.get('skccMember'),
    skccNumber: store.get('skccNumber'),
  })

  if (
    newSettings.rigctldHost !== old.rigctldHost ||
    newSettings.rigctldPort !== old.rigctldPort
  ) {
    stopRigctld()
    startRigctld(
      newSettings.rigctldHost || old.rigctldHost,
      newSettings.rigctldPort || old.rigctldPort,
      (data) => { mainWindow?.webContents.send('rig:status', data) }
    )
  }

  if (newSettings.keyerPort && newSettings.keyerPort !== old.keyerPort) {
    stopKeyer()
    startKeyer(newSettings.keyerPort, (status) => {
      mainWindow?.webContents.send('keyer:status', status)
    })
  }

  if (newSettings.adifPath && newSettings.adifPath !== old.adifPath) {
    stopAdifWatcher()
    startAdifWatcher(newSettings.adifPath, db, (qsos) => {
      mainWindow?.webContents.send('qso:log', qsos)
    })
  }

  if (old.skccMember && !newSettings.skccMember) {
    stopSKCCSkimmer()
  } else if (!old.skccMember && newSettings.skccMember) {
    startSKCCSkimmer()
  }

  if (newSettings.mufLufGrid !== undefined && newSettings.mufLufGrid !== old.mufLufGrid) {
    emitMufLuf()
  }

  return store.store
})
