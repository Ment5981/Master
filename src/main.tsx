import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import App from './v2/MasterApp'
import { configureDesktopGateway } from './v2/agent/client'

async function boot() {
  if (window.masterV2) configureDesktopGateway(await window.masterV2.getGatewayConfig())
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
}
void boot().catch(() => {
  document.getElementById('root')!.textContent = 'Master 未能连接本地服务。请重启应用；本地数据未被删除。'
})

if ('serviceWorker' in navigator && import.meta.env.PROD && ['http:', 'https:'].includes(location.protocol)) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('./sw.js', document.baseURI)).catch(() => { /* App remains usable online if offline caching is unavailable. */ })
  })
}
