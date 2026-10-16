import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron as electron } from 'playwright-core'
import asar from '@electron/asar'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagedExecutable = process.env.MASTER_ELECTRON_EXECUTABLE?.trim()
if (packagedExecutable && !isAbsolute(packagedExecutable)) throw new Error('MASTER_ELECTRON_EXECUTABLE must be an explicit absolute path.')
const executablePath = packagedExecutable || join(root, 'node_modules/electron/dist/electron.exe')
const outputRoot = join(root, '.visual-qa')
await mkdir(outputRoot, { recursive: true })
// This directory belongs only to this run. It is deliberately retained for evidence;
// the script never opens or removes the actual Master userData directory.
const profile = await mkdtemp(join(outputRoot, packagedExecutable ? 'v2-packaged-' : 'v2-electron-'))
const evidenceDir = join(profile, 'qa-evidence')
await mkdir(evidenceDir)
const report = { profile, executablePath, packaged: !!packagedExecutable, passed: [], errors: [], requestFailures: [], screenshots: [], phases: [] }
const check = (name, value, expected = true) => { assert.deepEqual(value, expected, name); report.passed.push(name); process.stdout.write(`[desktop QA] ${name}\n`) }
let desktop
const env = { ...process.env, MASTER_TEST_PROFILE: profile }
delete env.ELECTRON_RUN_AS_NODE
delete env.DASHSCOPE_API_KEY

async function waitForBuild() {
  try { await stat(executablePath) }
  catch { throw new Error('Electron runtime missing: run node node_modules/electron/install.js before desktop QA.') }
  if (packagedExecutable) {
    // Fail before process launch if an older packaged build ignores the isolation flag.
    // Inspect application code only, never the existing real userData profile.
    const archive = join(dirname(executablePath), 'resources/app.asar')
    const main = asar.extractFile(archive, 'electron/main.cjs').toString('utf8')
    assert.ok(main.includes('smokeRequested') && main.includes('path.isAbsolute(testProfile)') && main.includes("if (smokeTest) app.setPath('userData'"), 'Packaged app lacks the isolated smoke-mode guard; refusing to launch a potentially real profile.')
    return
  }
  const sourceTime = Math.max(...await Promise.all(['src/main.tsx', 'src/v2/agent/client.ts', 'src/v2/agent/pcm-worklet.js'].map(async source => (await stat(join(root, source))).mtimeMs)))
  const deadline = Date.now() + 90000
  let announced = false
  while (Date.now() < deadline) {
    try {
      const index = await stat(join(root, 'dist/index.html'))
      await stat(join(root, 'electron/gateway.cjs'))
      if (index.mtimeMs >= sourceTime - 1000) return
    } catch { /* A concurrent build may be replacing dist. */ }
    if (!announced) { process.stdout.write('[desktop QA] Waiting for the current frontend build to finish.\n'); announced = true }
    await delay(1000)
  }
  throw new Error('Desktop QA requires a fresh npm run build and the bundled electron/gateway.cjs.')
}

async function launch(phase) {
  desktop = await electron.launch({
    executablePath,
    args: packagedExecutable ? ['--smoke-test'] : [root, '--smoke-test'], cwd: root, env, timeout: 30000,
  })
  const page = await desktop.firstWindow()
  const actual = await desktop.evaluate(({ app, BrowserWindow }) => ({ profile: app.getPath('userData'), packaged: app.isPackaged, visible: BrowserWindow.getAllWindows().some(window => window.isVisible()) }))
  check(`${phase}: isolated userData`, resolve(actual.profile).toLowerCase(), profile.toLowerCase())
  check(`${phase}: hidden window`, actual.visible, false)
  check(`${phase}: packaged runtime matches requested mode`, actual.packaged, !!packagedExecutable)
  page.on('pageerror', error => report.errors.push({ phase, kind: 'pageerror', message: error.message }))
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push({ phase, kind: 'console', message: message.text() })
  })
  page.on('requestfailed', request => report.requestFailures.push({ phase, url: request.url().replace(/\?.*$/, ''), error: request.failure()?.errorText }))
  await page.waitForURL('app://master/index.html', { timeout: 20000 })
  await page.getByRole('navigation', { name: '主导航' }).waitFor({ timeout: 20000 })
  check(`${phase}: custom application origin`, new URL(page.url()).host, 'master')
  check(`${phase}: preload bridge`, await page.evaluate(() => typeof window.masterV2?.load), 'function')
  check(`${phase}: node integration disabled`, await page.evaluate(() => typeof window.require), 'undefined')
  report.phases.push(phase)
  return page
}

async function screenshot(page, name) {
  const path = join(evidenceDir, name)
  await page.screenshot({ path, fullPage: false })
  report.screenshots.push(path)
}

try {
  await waitForBuild()
  let page = await launch('first-launch')
  const workletAsset = (await readdir(join(root, 'dist/assets'))).find(name => /^pcm-worklet-.*\.js$/.test(name))
  assert.ok(workletAsset, 'Production build must emit a separate, non-inlined PCM worklet asset')
  const worklet = await page.evaluate(async asset => {
    // Exercises the real AudioWorklet and desktop CSP, without opening a microphone.
    const context = new AudioContext()
    let node
    try {
      await context.audioWorklet.addModule(new URL('/assets/' + asset, location.href).href)
      node = new AudioWorkletNode(context, 'master-pcm16')
      return { loaded: true, secure: isSecureContext }
    } finally { node?.disconnect(); node?.port.close(); await context.close() }
  }, workletAsset)
  check('real AudioWorklet asset loads under desktop CSP without microphone', worklet, { loaded: true, secure: true })
  const created = await page.evaluate(async () => {
    const bridge = window.masterV2
    const before = await bridge.load()
    if (before.goals.length || before.tasks.length) throw new Error('QA profile was not empty')
    const goal = { id: crypto.randomUUID(), title: 'Electron QA 持久化目标', description: 'isolated smoke test', dueDate: null, criteria: ['SQLite 重启恢复'], verified: false, status: 'active', createdAt: new Date().toISOString() }
    const first = await bridge.execute({ operationId: crypto.randomUUID(), expectedRevision: before.revision, command: { type: 'create_goal', goal, nodes: [] } })
    const task = { id: crypto.randomUUID(), title: 'Electron QA 可撤销任务', nodeId: null, goalId: goal.id, status: 'todo', importance: 'important', urgent: false, estimateMinutes: 20, dueDate: null, startDate: null, locked: false, createdAt: new Date().toISOString(), completedAt: null, sourceId: null }
    const request = { operationId: crypto.randomUUID(), expectedRevision: first.workspace.revision, command: { type: 'create_task', task } }
    const second = await bridge.execute(request)
    const duplicate = await bridge.execute(request)
    return { goalId: goal.id, taskId: task.id, revision: second.workspace.revision, duplicateCount: duplicate.workspace.tasks.filter(row => row.id === task.id).length }
  })
  check('preload command idempotence', created.duplicateCount, 1)
  await screenshot(page, '01-desktop-home.png')
  await desktop.close(); desktop = undefined

  const dbHeader = (await readFile(join(profile, 'master-v2.sqlite'))).subarray(0, 16).toString('utf8')
  check('real SQLite file', dbHeader, 'SQLite format 3\u0000')
  page = await launch('restart')
  const persisted = await page.evaluate(async ({ goalId, taskId }) => {
    const before = await window.masterV2.load()
    const result = { goalPresent: before.goals.some(goal => goal.id === goalId), taskPresent: before.tasks.some(task => task.id === taskId), revision: before.revision }
    const undone = await window.masterV2.undo(before.revision)
    return { ...result, undoRemovedTask: !undone.workspace.tasks.some(task => task.id === taskId), undoPreservedGoal: undone.workspace.goals.some(goal => goal.id === goalId), undoRevision: undone.workspace.revision }
  }, created)
  check('SQLite restart restores goal', persisted.goalPresent)
  check('SQLite restart restores task', persisted.taskPresent)
  check('SQLite restart preserves revision', persisted.revision, created.revision)
  check('undo removes only last task', persisted.undoRemovedTask)
  check('undo preserves earlier goal', persisted.undoPreservedGoal)

  // Credentials stay inside the renderer evaluation; results and artifacts contain no token.
  const gateway = await page.evaluate(async () => {
    const connection = await window.masterV2.getGatewayConfig()
    const healthResponse = await fetch(connection.url + '/api/health')
    const health = await healthResponse.json()
    const request = async token => {
      const response = await fetch(connection.url + '/api/voice/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: '{}' })
      const body = await response.json()
      return { status: response.status, code: body.code }
    }
    return { hostname: new URL(connection.url).hostname, healthStatus: healthResponse.status, ready: health.ready, ai: health.ai, asr: health.asr, missing: await request(), wrong: await request('invalid-test-token'), authorized: await request(connection.token) }
  })
  check('embedded gateway loopback', gateway.hostname, '127.0.0.1')
  check('embedded gateway health', gateway.healthStatus, 200)
  check('empty isolated profile stays unconfigured', [gateway.ready, gateway.ai, gateway.asr], [false, false, false])
  check('missing token denied', gateway.missing.status, 401)
  check('wrong token denied', gateway.wrong.status, 401)
  check('valid token reaches explicit no-key response', gateway.authorized, { status: 503, code: 'NOT_CONFIGURED' })

  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await page.getByRole('heading', { name: '设置与数据', exact: true }).waitFor()
  check('settings identifies SQLite desktop', await page.getByText('Windows 本地 SQLite。', { exact: false }).count(), 1)
  await page.getByRole('button', { name: '保存并检查连接', exact: true }).click()
  await page.getByText(/网关已连接。.*尚未配置/).waitFor({ timeout: 10000 })
  check('settings retains embedded connection despite default preference URL', true)
  await screenshot(page, '02-desktop-settings.png')

  // Explicitly opt in only inside the empty test profile. No-key 503 must prevent all upstream calls.
  // A controlled checkbox persists through async IPC before React acknowledges it.
  await page.getByRole('checkbox', { name: '允许 AI 文本发送', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[aria-label="允许 AI 文本发送"]')?.checked === true)
  check('AI consent persisted through real IPC', await page.evaluate(async () => (await window.masterV2.load()).preferences.aiConsent))
  await page.getByRole('button', { name: /Master 助手/ }).click()
  await page.getByRole('textbox', { name: '告诉 Master 你的安排', exact: true }).fill('今天安排二十分钟阅读。')
  await page.getByRole('button', { name: '发送给 Master', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '尚未配置阿里通义 API Key' }).waitFor({ timeout: 10000 })
  check('assistant shows actionable no-key error', true)
  const afterFailedAI = await page.evaluate(async () => { const workspace = await window.masterV2.load(); return { tasks: workspace.tasks.length, proposals: workspace.proposals.length } })
  check('failed AI creates neither tasks nor fake proposals', afterFailedAI, { tasks: 0, proposals: 0 })
  await screenshot(page, '03-desktop-ai-unconfigured.png')

  // Expected failed HTTP status lines (401/503) are not JavaScript startup errors.
  const unexpected = report.errors.filter(error => error.kind === 'pageerror' || !/Failed to load resource: the server responded with a status of (401|503)/.test(error.message))
  check('no unexpected renderer errors', unexpected, [])
  check('no failed asset requests', report.requestFailures.filter(item => item.url.startsWith('app://master/')), [])
  await desktop.close(); desktop = undefined
  report.success = true
} catch (error) {
  report.success = false
  report.failure = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
} finally {
  if (desktop) await desktop.close().catch(() => undefined)
  const output = join(evidenceDir, 'report.json')
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(JSON.stringify({ success: report.success, checks: report.passed.length, report: output, ...(report.failure ? { failure: report.failure } : {}) }, null, 2) + '\n')
}
