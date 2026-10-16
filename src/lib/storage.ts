import { createJSONStorage, type StateStorage, type PersistStorage } from 'zustand/middleware'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const platformStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window !== 'undefined' && window.masterStorage) return window.masterStorage.getItem()
    if (Capacitor.isNativePlatform()) {
      return Preferences.get({ key: name }).then(({ value }) => value)
    }
    return localStorage.getItem(name)
  },
  setItem: (name, value) => {
    if (typeof window !== 'undefined' && window.masterStorage) {
      window.masterStorage.setItem(value)
      return
    }
    if (Capacitor.isNativePlatform()) return Preferences.set({ key: name, value })
    localStorage.setItem(name, value)
  },
  removeItem: (name) => {
    if (typeof window !== 'undefined' && window.masterStorage) {
      window.masterStorage.removeItem()
      return
    }
    if (Capacitor.isNativePlatform()) return Preferences.remove({ key: name })
    localStorage.removeItem(name)
  },
}

export const masterStorage = createJSONStorage(() => platformStorage) as PersistStorage<unknown>
