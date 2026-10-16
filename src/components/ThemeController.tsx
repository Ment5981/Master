import { useEffect } from 'react'
import { StatusBar, Style } from '@capacitor/status-bar'
import { isNativeApp } from '../lib/platform'
import { useMasterStore } from '../store/useMasterStore'

export function ThemeController() {
  const theme = useMasterStore((state) => state.theme)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
      document.documentElement.style.colorScheme = resolved
      if (isNativeApp) {
        void StatusBar.setStyle({
          style: resolved === 'dark' ? Style.Light : Style.Dark,
        }).catch(() => undefined)
      }
    }

    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [theme])

  return null
}
