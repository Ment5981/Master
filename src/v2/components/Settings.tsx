import { useEffect, useState } from 'react'
import { ArrowSquareOut, CheckCircle, DownloadSimple, FileArrowUp, PlugsConnected, ShieldCheck, WarningCircle } from '@phosphor-icons/react'
import type { Command, Workspace } from '../core/types'
import { parseImport } from '../core'
import { configureGateway, getHealth } from '../agent/client'

interface Props { workspace: Workspace; onExecute: (command: Command) => Promise<Workspace>; onExport: () => Promise<void>; demo: boolean }
export function Settings({ workspace: w, onExecute, onExport, demo }: Props) {
  const [url, setUrl] = useState(w.preferences.gatewayUrl)
  const [token, setToken] = useState('')
  const [health, setHealth] = useState(''); const [busy, setBusy] = useState(false)
  const [error, setError] = useState(''); const [imported, setImported] = useState<ReturnType<typeof parseImport> | null>(null)
  const [fileName, setFileName] = useState('')
  const [envPath, setEnvPath] = useState('')
  const desktop = !!window.masterV2
  useEffect(() => { if (window.masterV2) void window.masterV2.getGatewayConfig().then(config => { setUrl(config.url); setEnvPath(config.envPath) }).catch(() => setError('无法读取桌面 AI 服务配置')) }, [])
  async function setting(changes: Partial<Workspace['preferences']>) { try { await onExecute({ type: 'preferences', changes }) } catch (e) { setError(String(e)) } }
  async function checkService() {
    setBusy(true); setError(''); setHealth('')
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('请填写有效的服务地址，不要在地址里放密钥。')
      if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('非本机服务必须使用 HTTPS。')
      if (!desktop) {
        await onExecute({ type: 'preferences', changes: { gatewayUrl: url.replace(/\/$/, ''), ...(url !== w.preferences.gatewayUrl ? { aiConsent: false, audioConsent: false } : {}) } })
        configureGateway({ url, token: token || undefined })
      }
      const result = await getHealth()
      setHealth(result.ai && result.asr ? '网关已连接、密钥已配置。模型权限与语音效果仍需真实调用验证。' : `网关已连接。${result.message || '请在服务端配置阿里密钥。'}`)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  async function readImport(file?: File) {
    if (!file) return
    setError(''); setImported(null)
    try { if (file.size > 10_000_000) throw new Error('文件超过 10 MB，请先拆分或检查导出格式。'); setImported(parseImport(await file.text())); setFileName(file.name) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  async function importLegacy() {
    try {
      const raw = window.masterV2 ? await window.masterV2.readLegacy() : window.masterStorage?.getItem() ?? localStorage.getItem('master-local-state')
      if (!raw) throw new Error('当前设备未找到旧版数据。你也可以选择旧版导出的 JSON 文件。')
      setImported(parseImport(raw)); setFileName('当前设备的 Master 旧版数据')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  return <div className="m-settings"><header className="m-page-heading"><h1>设置与数据</h1><p>你决定数据放在哪里，以及助手能看到什么。</p></header>
    {error && <p className="m-error" role="alert">{error}</p>}
    <section className="m-settings-section"><div className="m-settings-heading"><ShieldCheck size={23} /><div><h2>数据始终属于你</h2><p>{demo ? '当前是独立示例空间，不会混入你的真实数据。' : window.masterV2 ? 'Windows 本地 SQLite。AI 服务与同步分开，当前未启用云同步。' : '当前浏览器本地数据库。换设备不会自动同步，请定期导出。'}</p></div></div><div className="m-settings-actions"><button className="m-button" onClick={() => void onExport().catch(e => setError(String(e)))}><DownloadSimple size={17} />导出完整备份</button><label className="m-button m-file-label"><FileArrowUp size={17} />选择备份文件<input type="file" accept=".json" onChange={e => void readImport(e.target.files?.[0])} /></label><button className="m-button" onClick={() => void importLegacy()}>读取旧版数据</button></div>
      {imported && <div className="m-import-preview"><h3>导入预览</h3><p>{fileName}</p><div className="m-import-counts"><span>{imported.workspace.goals.length} 个目标</span><span>{imported.workspace.tasks.length} 个任务</span><span>{imported.workspace.reviews.length} 份复盘</span></div>{imported.warnings.map((warning, i) => <p className="m-muted" key={i}>{warning}</p>)}<p className="m-muted">只新增可验证的记录，不删除原文件。不支持的内容请保留在原始备份中。</p><div className="m-settings-actions"><button className="m-button primary" disabled={busy} onClick={async () => { setBusy(true); try { await onExecute({ type: 'import', workspace: imported.workspace, digest: imported.digest }); setImported(null); setHealth('导入完成，原数据未被改动。') } catch (e) { setError(String(e)) } finally { setBusy(false) } }}>确认导入</button><button className="m-button" onClick={() => setImported(null)}>取消</button></div></div>}
    </section>
    <section className="m-settings-section"><div className="m-settings-heading"><PlugsConnected size={23} /><div><h2>阿里智能体与语音</h2><p>密钥在网关服务端配置；此处不需要阿里 API Key。</p></div></div><div className="m-form-grid"><label>网关地址<input type="url" readOnly={desktop} value={url} onChange={e => setUrl(e.target.value)} placeholder="http://127.0.0.1:4318" /></label>{!desktop && <label>网关访问令牌（可选，仅本次会话）<input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="不是模型 API Key" /></label>}</div><button className="m-button" disabled={busy} onClick={() => void checkService()}><PlugsConnected size={16} />{busy ? '连接中' : '保存并检查连接'}</button>{health && <p className="m-service-result" role="status"><CheckCircle size={17} />{health}</p>}
      <details className="m-setup-guide"><summary>{desktop ? '配置桌面 AI 服务' : '如何启动本地服务'}</summary>{desktop ? <div><p>桌面已内置服务，无需另装 Node。打开配置目录，编辑 <code>master-ai.env</code> 中的 <code>DASHSCOPE_API_KEY</code>，保存后重启 Master。</p><p className="m-config-path">{envPath}</p><button className="m-button" onClick={() => void window.masterV2?.openConfigFolder().catch(e => setError(String(e)))}>打开本地配置目录</button></div> : <ol><li>将项目中的 <code>server/.env.example</code> 复制为 <code>server/.env</code>，在本机填写阿里密钥。</li><li>在项目目录运行 <code>npm run server</code>。</li><li>回到此处检查连接，然后在下方授权文字或音频发送。</li></ol>}<p>请勿把密钥贴进对话、提交到 Git 或放入前端环境变量。</p><p>真实服务可用性与费用取决于你的阿里账号、开通模型和所选地区。</p></details>
    </section>
    <section className="m-settings-section"><h2>权限与偏好</h2><div className="m-setting-row"><div><strong>AI 文字与目标上下文</strong><p>主动使用助手时发送选定输入和有限相关上下文。</p></div><input aria-label="允许 AI 文本发送" type="checkbox" checked={w.preferences.aiConsent} onChange={e => void setting({ aiConsent: e.target.checked })} /></div><div className="m-setting-row"><div><strong>语音识别</strong><p>仅开启会话时把麦克风声音发送给阿里；默认不保存录音。</p></div><input aria-label="允许音频发送" type="checkbox" checked={w.preferences.audioConsent} onChange={e => void setting({ audioConsent: e.target.checked })} /></div><div className="m-setting-row"><div><strong>简短语音播报</strong><p>使用设备可用的系统语音读出关键问题，可以随时打断。</p></div><input aria-label="语音播报" type="checkbox" checked={w.preferences.speak} onChange={e => void setting({ speak: e.target.checked })} /></div><div className="m-setting-row"><div><strong>外观</strong><p>减少动态效果跟随系统设置。</p></div><select aria-label="外观主题" value={w.preferences.theme} onChange={e => void setting({ theme: e.target.value as Workspace['preferences']['theme'] })}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></div></section>
    <div className="m-note"><WarningCircle size={20} /><div><strong>本地保存不等于云备份</strong><p>当前版本没有账号同步、收费服务或自动扫描聊天历史。关闭 AI 不影响已保存内容的查看、修改和导出。</p><a href="https://help.aliyun.com/zh/model-studio/get-api-key" target="_blank" rel="noreferrer">阿里密钥配置说明 <ArrowSquareOut size={13} /></a></div></div>
  </div>
}
