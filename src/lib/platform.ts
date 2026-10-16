import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { SplashScreen } from '@capacitor/splash-screen'

export const nativePlatform = Capacitor.getPlatform()
export const isNativeApp = Capacitor.isNativePlatform()

export function initializePlatformShell() {
  document.documentElement.dataset.platform = nativePlatform
  document.documentElement.classList.toggle('native-app', isNativeApp)

  if (isNativeApp) {
    void document.fonts.ready.then(() => SplashScreen.hide())
  }
}

export function hapticTap() {
  if (!isNativeApp) return
  void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined)
}
