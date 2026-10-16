interface GatewayConnection { url: string; token: string }
let connection: GatewayConnection = { url: 'http://127.0.0.1:4318', token: '' }
let desktopManaged = false

function normalizeURL(value: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('网关地址必须是 HTTP(S) 地址，不能携带密钥或参数。')
  return url.href.replace(/\/$/, '')
}

/** Preferences may change Web configuration; they never replace a main-process gateway. */
export function configureGateway(options: { url: string; token?: string }) {
  if (desktopManaged) return
  const url = normalizeURL(options.url)
  connection = { url, token: options.token ?? (url === connection.url ? connection.token : '') }
}

/** Call once from a trusted preload result before mounting the desktop UI. Memory only. */
export function configureDesktopGateway(options: { url: string; token: string }) {
  const normalized = normalizeURL(options.url)
  const url = new URL(normalized)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || (url.pathname && url.pathname !== '/')) throw new Error('内置桌面网关必须是本机随机端口。')
  if (!/^[a-zA-Z0-9_-]{32,256}$/.test(options.token)) throw new Error('内置桌面网关缺少有效会话令牌。')
  connection = { url: normalized, token: options.token }
  desktopManaged = true
}

export function getGatewayConnection(): Readonly<GatewayConnection> { return { ...connection } }
