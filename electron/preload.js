import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Rig control
  rig: {
    onStatus: (cb) => {
      const handler = (_, data) => cb(data)
      ipcRenderer.on('rig:status', handler)
      return () => ipcRenderer.removeListener('rig:status', handler)
    },
    setFreq: (freqHz) => ipcRenderer.invoke('rig:setFreq', freqHz),
    setMode: (mode) => ipcRenderer.invoke('rig:setMode', mode),
    tuneStep: (direction, step) => ipcRenderer.invoke('rig:tuneStep', { direction, step })
  },

  // CW Keyer
  keyer: {
    onStatus: (cb) => {
      const handler = (_, data) => cb(data)
      ipcRenderer.on('keyer:status', handler)
      return () => ipcRenderer.removeListener('keyer:status', handler)
    },
    send: (text, wpm) => ipcRenderer.invoke('keyer:send', { text, wpm }),
    setWpm: (wpm) => ipcRenderer.invoke('keyer:setWpm', wpm),
    dit: () => ipcRenderer.invoke('keyer:dit'),
    dah: () => ipcRenderer.invoke('keyer:dah')
  },

  // GPS
  gps: {
    onStatus: (cb) => {
      const handler = (_, data) => cb(data)
      ipcRenderer.on('gps:status', handler)
      return () => ipcRenderer.removeListener('gps:status', handler)
    }
  },

  // Propagation / Band Conditions
  propagation: {
    onData: (cb) => {
      const handler = (_, data) => cb(data)
      ipcRenderer.on('propagation:data', handler)
      return () => ipcRenderer.removeListener('propagation:data', handler)
    },
    onBandActivity: (cb) => {
      const handler = (_, data) => cb(data)
      ipcRenderer.on('propagation:bandactivity', handler)
      return () => ipcRenderer.removeListener('propagation:bandactivity', handler)
    },
    get: () => ipcRenderer.invoke('propagation:get'),
    refresh: () => ipcRenderer.invoke('propagation:refresh')
  },

  // RBN
  rbn: {
    onSpots: (cb) => {
      const handler = (_, data) => cb(data)
      ipcRenderer.on('rbn:spots', handler)
      return () => ipcRenderer.removeListener('rbn:spots', handler)
    },
    get:     () => ipcRenderer.invoke('rbn:get'),
    refresh: () => ipcRenderer.invoke('rbn:refresh')
  },

  // POTA
  pota: {
    onSpots: (cb) => {
      const handler = (_, data) => cb(data)
      ipcRenderer.on('pota:spots', handler)
      return () => ipcRenderer.removeListener('pota:spots', handler)
    },
    get:     () => ipcRenderer.invoke('pota:get'),
    refresh: () => ipcRenderer.invoke('pota:refresh')
  },

  // QSO Log
  qso: {
    onLog: (cb) => {
      const handler = (_, data) => cb(data)
      ipcRenderer.on('qso:log', handler)
      return () => ipcRenderer.removeListener('qso:log', handler)
    },
    onPrefill: (cb) => {
      const handler = (_, data) => cb(data)
      ipcRenderer.on('qso:prefill', handler)
      return () => ipcRenderer.removeListener('qso:prefill', handler)
    },
    prefill: (data)   => ipcRenderer.send('qso:prefill', data),
    add:    (qso)     => ipcRenderer.invoke('qso:add', qso),
    list:   ()        => ipcRenderer.invoke('qso:list'),
    search: (query)   => ipcRenderer.invoke('qso:search', { query }),
    delete: (id)      => ipcRenderer.invoke('qso:delete', { id }),
    export: ()        => ipcRenderer.invoke('qso:export'),
    stats:  ()        => ipcRenderer.invoke('qso:stats')
  },

  // SKCC Skimmer
  skcc: {
    getSked: () => ipcRenderer.invoke('skcc:getSked'),
    getRbn:  () => ipcRenderer.invoke('skcc:getRbn'),
    onSked: (cb) => {
      const handler = (_, data) => cb(data)
      ipcRenderer.on('skcc:sked', handler)
      return () => ipcRenderer.removeListener('skcc:sked', handler)
    },
    onRbn: (cb) => {
      const handler = (_, data) => cb(data)
      ipcRenderer.on('skcc:rbn', handler)
      return () => ipcRenderer.removeListener('skcc:rbn', handler)
    },
  },

  // Callsign lookup
  callsign: {
    lookup: (call) => ipcRenderer.invoke('callsign:lookup', call)
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (settings) => ipcRenderer.invoke('settings:set', settings)
  }
}

contextBridge.exposeInMainWorld('api', api)
