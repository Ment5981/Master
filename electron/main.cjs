const { app, BrowserWindow, ipcMain, Menu, shell, protocol, net, session } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { randomBytes } = require('node:crypto')
const { createV2Storage } = require('./v2-storage.cjs')

const isDev = process.argv.includes('--dev') && !app.isPackaged
const smokeRequested = process.argv.includes('--smoke-test')
const testProfile = process.env.MASTER_TEST_PROFILE
const smokeTest = smokeRequested && typeof testProfile === 'string' && testProfile.trim().length > 0 && path.isAbsolute(testProfile)
if (smokeRequested && !smokeTest) { console.error('Smoke test requires an explicit absolute MASTER_TEST_PROFILE.'); app.exit(1) }
if (smokeTest) app.setPath('userData', path.resolve(testProfile))
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }])
let storage, gateway, config, window
const appOrigin = 'app://master'
const devOrigin = 'http://127.0.0.1:5173'
const trustedURL = raw => {
  try { const u = new URL(raw); return isDev ? u.origin === devOrigin : u.protocol === 'app:' && u.host === 'master' } catch { return false }
}
const assertSender = event => {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !trustedURL(event.senderFrame.url)) throw new Error('Untrusted IPC sender')
}
const handle = (name, fn) => ipcMain.handle(name, async (event, ...args) => { assertSender(event); return fn(...args) })
const broadcast = () => { if (window && !window.isDestroyed()) window.webContents.send('master:v2-changed') }

function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 920, minWidth: 960, minHeight: 680,
    show: !smokeTest, backgroundColor: '#f4f7f4', title: 'Master', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: smokeTest, backgroundThrottling: !smokeTest },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    try { const parsed = new URL(url); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) void shell.openExternal(parsed.href) } catch { /* Invalid external link is denied. */ }
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => { if (!trustedURL(url)) event.preventDefault() })
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  void window.loadURL(isDev ? devOrigin : appOrigin + '/index.html')
}

app.whenReady().then(async () => {
  const profile = app.getPath('userData')
  await fs.mkdir(profile, { recursive: true })
  const envPath = path.join(profile, 'master-ai.env')
  // Create only an empty template; never overwrite an existing local key file.
  try { await fs.writeFile(envPath, '# Master local AI configuration. Keep private. Restart Master after editing.\nDASHSCOPE_API_KEY=\nQWEN_MODEL=qwen-plus\nQWEN_ASR_MODEL=qwen3-asr-flash-realtime\n', { flag: 'wx', mode: 0o600 }) } catch (e) { if (e.code !== 'EEXIST') throw e }
  storage = await createV2Storage({ filePath: path.join(profile, 'master-v2.sqlite') })
  const { startDesktopGateway } = require('./gateway.cjs')
  const token = randomBytes(32).toString('base64url')
  gateway = await startDesktopGateway({ envPath, token, origin: appOrigin })
  config = { url: gateway.url, token, envPath }
  const distPath = path.resolve(__dirname, '..', 'dist')
  protocol.handle('app', async request => {
    try {
      const url = new URL(request.url)
      if (url.host !== 'master' || request.method !== 'GET') return new Response('Not found', { status: 404 })
      const target = path.resolve(distPath, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname))
      const relative = path.relative(distPath, target)
      if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Forbidden', { status: 403 })
      const response = await net.fetch(pathToFileURL(target).href)
      const headers = new Headers(response.headers)
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' " + gateway.url + ' ' + gateway.url.replace('http:', 'ws:') + "; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-src 'none'")
      return new Response(response.body, { status: response.status, headers })
    } catch { return new Response('Not found', { status: 404 }) }
  })
  session.defaultSession.setPermissionCheckHandler((contents, permission, requestingOrigin) => contents === window?.webContents && permission === 'media' && trustedURL(requestingOrigin))
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(contents === window?.webContents && permission === 'media' && trustedURL(details.requestingUrl || contents.getURL()) && (!details.mediaTypes || details.mediaTypes.every(type => type === 'audio'))))
  handle('master:v2-load', () => storage.load())
  handle('master:v2-execute', request => {
    if (JSON.stringify(request).length > 12_000_000) throw new Error('操作内容过大')
    const result = storage.execute(request); broadcast(); return result
  })
  handle('master:v2-undo', revision => { const result = storage.undo(revision); broadcast(); return result })
  handle('master:v2-export', () => storage.export())
  handle('master:v2-gateway', () => config)
  handle('master:v2-legacy', async () => { try { return await fs.readFile(path.join(profile, 'master-state.json'), 'utf8') } catch (e) { if (e.code === 'ENOENT') return null; throw e } })
  handle('master:v2-config-folder', async () => { const error = await shell.openPath(profile); if (error) throw new Error(error) })
  Menu.setApplicationMenu(null)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
}).catch(error => { console.error('Master startup failed:', error.message); app.exit(1) })

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('will-quit', () => { storage?.close(); void gateway?.close() })
