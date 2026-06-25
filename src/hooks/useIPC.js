import { useEffect, useState } from 'react'

// Generic hook for subscribing to IPC events from the main process
export function useIPCEvent(subscribe, initialValue = null) {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    if (!subscribe) return
    const unsub = subscribe((data) => setValue(data))
    return unsub
  }, [])

  return value
}

// Hook for settings with get/set
export function useSettings() {
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    window.api.settings.get().then(setSettings)
  }, [])

  const updateSettings = async (patch) => {
    const updated = await window.api.settings.set(patch)
    setSettings(updated)
    return updated
  }

  return [settings, updateSettings]
}

export function useStationConfig() {
  const [station, setStation] = useState({ callsign: 'KJ5NUJ', grid: 'EM50JI', skccMember: true, skccNumber: '30741' })

  useEffect(() => {
    window.api?.config?.getStation().then(s => { if (s) setStation(s) })
    return window.api?.config?.onChanged((s) => setStation(s))
  }, [])

  return station
}
