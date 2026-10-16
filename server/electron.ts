import { readFile } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { parseEnv } from 'node:util'
import { createGateway } from './app'
import { readConfig } from './config'

export interface DesktopGatewayOptions { envPath: string; token: string; origin?: string }
export interface DesktopGateway { url: string; close(): Promise<void> }

/** Main-process only. Never pass envPath, provider keys or arbitrary ports from renderer IPC. */
export async function startDesktopGateway(options: DesktopGatewayOptions): Promise<DesktopGateway> {
  if (!isAbsolute(options.envPath)) throw new Error('桌面网关配置路径必须由主进程提供绝对路径。')
  if (!/^[a-zA-Z0-9_-]{32,256}$/.test(options.token)) throw new Error('桌面网关必须使用至少32位的随机会话令牌。')
  const origins = new Set(['app://master', 'http://127.0.0.1:5173', 'http://localhost:5173'])
  if (options.origin) {
    let url: URL
    try { url = new URL(options.origin) } catch { throw new Error('桌面应用 Origin 无效。') }
    if (!['app:', 'http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) throw new Error('桌面应用 Origin 必须是单个明确来源。')
    origins.add(`${url.protocol}//${url.host}`)
  }
  let fileEnv: NodeJS.ProcessEnv = {}
  try {
    const contents = await readFile(options.envPath, 'utf8')
    if (Buffer.byteLength(contents, 'utf8') > 64 * 1024) throw new Error('桌面网关配置文件超过64KB。')
    fileEnv = parseEnv(contents)
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw new Error('无法读取桌面网关配置，请检查文件权限和格式。')
  }
  // An isolated object, not process.loadEnvFile()/dotenv.config(): Electron process state
  // and parent-shell credentials remain untouched. env cannot override these boundaries.
  const inheritedProxy = process.env.HTTPS_PROXY?.trim() || process.env.HTTP_PROXY?.trim() || process.env.ALL_PROXY?.trim() || ''
  const config = { ...readConfig({ ...fileEnv, QWEN_HTTPS_PROXY: fileEnv.QWEN_HTTPS_PROXY?.trim() || inheritedProxy }), bearer: options.token, origins: [...origins], port: 0 }
  const app = await createGateway({ config })
  try {
    const url = await app.listen({ host: '127.0.0.1', port: 0 })
    let closing: Promise<void> | undefined
    return { url, close: () => closing ??= app.close() }
  } catch (error) {
    await app.close()
    throw error
  }
}
