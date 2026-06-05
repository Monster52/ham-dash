import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import { startRigctld, stopRigctld, sendRigCommand } from './rigctl.js'
import { startKeyer, stopKeyer, sendCW, setWpm } from './keyer.js'
import { startGPS, stopGPS } from './gps.js'
import { startAdifWatcher, stopAdifWatcher } from './adif-watcher.js'
import { fetchPropagation, startPropagationTimer, stopPropagationTimer } from './propagation.js'

const store = new Store({
  defaults: {
    rigctldHost: 'localhost',
    rigctldPort: 4532,
    keyerPort: '/dev/ttyUSB0',
    adifPath: `${process.env.HOME}/skcclogger/log.adi`,
    keyerMessages: {
      msg1: 'CQ CQ DE KJ5NUJ KJ5NUJ K',
      msg2: 'TU 73 DE KJ5NUJ K',
      msg3: 'KJ5NUJ EM50JI',
      msg4: 'QRZ? DE KJ5NUJ K'
    },
    wpm: 18
  }
})

let mainWindow = null
let lastPropagationData = null

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

  createWindow()
  initHardware()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  shutdownHardware()
  if (process.platform !== 'darwin') app.quit()
})

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

  startAdifWatcher(settings.adifPath, (qsos) => {
    mainWindow?.webContents.send('qso:log', qsos)
  })

  startPropagationTimer((data) => {
    lastPropagationData = data
    mainWindow?.webContents.send('propagation:data', data)
  })

  // Fetch immediately on startup; cache and send when renderer is ready
  fetchPropagation().then((data) => {
    lastPropagationData = data
    mainWindow?.webContents.send('propagation:data', data)
  })
}

function shutdownHardware() {
  stopRigctld()
  stopKeyer()
  stopGPS()
  stopAdifWatcher()
  stopPropagationTimer()
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
  // Pull: renderer calls this on mount — returns cached data or fetches fresh
  if (lastPropagationData) return lastPropagationData
  const data = await fetchPropagation()
  lastPropagationData = data
  return data
})

ipcMain.handle('propagation:refresh', async () => {
  const data = await fetchPropagation()
  lastPropagationData = data
  mainWindow?.webContents.send('propagation:data', data)
  return data
})

ipcMain.handle('settings:get', async () => {
  return store.store
})

ipcMain.handle('settings:set', async (_, newSettings) => {
  const old = store.store
  store.set(newSettings)

  // Restart hardware if connection settings changed
  if (
    newSettings.rigctldHost !== old.rigctldHost ||
    newSettings.rigctldPort !== old.rigctldPort
  ) {
    stopRigctld()
    startRigctld(newSettings.rigctldHost || old.rigctldHost, newSettings.rigctldPort || old.rigctldPort, (data) => {
      mainWindow?.webContents.send('rig:status', data)
    })
  }

  if (newSettings.keyerPort && newSettings.keyerPort !== old.keyerPort) {
    stopKeyer()
    startKeyer(newSettings.keyerPort, (status) => {
      mainWindow?.webContents.send('keyer:status', status)
    })
  }

  if (newSettings.adifPath && newSettings.adifPath !== old.adifPath) {
    stopAdifWatcher()
    startAdifWatcher(newSettings.adifPath, (qsos) => {
      mainWindow?.webContents.send('qso:log', qsos)
    })
  }

  return store.store
})
