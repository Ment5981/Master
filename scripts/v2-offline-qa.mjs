import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

// This test uses a new, non-persistent context. It never opens a real user profile.
// Start `vite preview --host 127.0.0.1 --port 4173 --strictPort` after a production build.
const baseUrl = process.env.MASTER_OFFLINE_PREVIEW_URL ?? 'http://127.0.0.1:4173'
const origin = new URL(baseUrl).origin
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname), 'Offline QA must use a loopback preview')
const outputDir = resolve('.visual-qa/v2-offline')
const swSource = await readFile(resolve('dist/sw.js'), 'utf8')
const sha256 = value => createHash('sha256').update(value).digest('hex')
const report = {
  startedAt: new Date().toISOString(), baseUrl, production: true,
  expectedCache: /^const CACHE = "([^"]+)";/m.exec(swSource)?.[1],
  serviceWorkerSha256: sha256(swSource), checks: [], screenshots: [],
  runtimeErrors: [], consoleErrors: [], requestFailures: [], offlineRequests: [], offlineResponses: [],
  caveat: 'One isolated Edge functional run, not Windows desktop-package validation, a latency benchmark, or proof of permanent browser data retention.',
}
await mkdir(outputDir, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.MASTER_EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, timezoneId: 'Asia/Singapore', colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'allow' })
// Routing also disables the ordinary HTTP cache. Unvisited lazy imports must use the SW.
await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('internetdisconnected'))
const page = await context.newPage()
page.setDefaultTimeout(15000)
page.on('pageerror', error => report.runtimeErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()) })
page.on('requestfailed', request => report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }))
let offline = false
page.on('request', request => { if (offline) report.offlineRequests.push({ url: request.url(), type: request.resourceType(), headers: request.headers() }) })
page.on('response', response => { if (offline) report.offlineResponses.push({ url: response.url(), status: response.status(), fromServiceWorker: response.fromServiceWorker() }) })
let stage = 'production shell'
const check = (name, details = {}) => { report.checks.push({ name, ...details }); console.log(`PASS ${name}`) }
const screenshot = async name => { const file = resolve(outputDir, `${name}.png`); await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(file) }
async function navigate(name, region) {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await page.locator('.m-view-loading').waitFor({ state: 'hidden' })
  if (region) await page.getByRole('region', { name: region, exact: true }).waitFor()
}
async function state() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('master-v2'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    try {
      const names = ['meta', 'goals', 'nodes', 'tasks', 'allocations', 'timeEntries', 'reviews', 'proposals']
      const transaction = db.transaction(names, 'readonly')
      return Object.fromEntries(await Promise.all(names.map(name => new Promise((resolve, reject) => { const request = transaction.objectStore(name).getAll(); request.onsuccess = () => resolve([name, request.result]); request.onerror = () => reject(request.error) }))))
    } finally { db.close() }
  })
}
async function cacheInventory() {
  return page.evaluate(async () => {
    const keys = await caches.keys()
    return Promise.all(keys.map(async key => ({ key, urls: (await (await caches.open(key)).keys()).map(request => request.url) })))
  })
}
const goalTitle = '离线验证：稳步整理作品集'
const taskTitle = '离线验证：整理一个案例的真实证据'
const apiProbe = '/api/offline-qa-cache-probe'

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: '把时间，留给重要的事。' }).waitFor()
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  const registration = await page.evaluate(async () => ({ scriptURL: navigator.serviceWorker.controller?.scriptURL, scope: (await navigator.serviceWorker.ready).scope }))
  let data = await state()
  assert.equal(data.goals.length, 0); assert.equal(data.tasks.length, 0)
  const firstResources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name))
  const lazyPattern = /\/(GoalMap|PlanView|ReviewView|Assistant)-[^/]+\.js(?:\?|$)/
  assert.deepEqual(firstResources.filter(url => lazyPattern.test(url)), [], 'Only Today should have been opened online; lazy views must remain unvisited')
  const firstCache = await cacheInventory()
  report.installedCaches = firstCache.map(item => ({ key: item.key, count: item.urls.length }))
  report.registration = registration
  assert.ok(firstCache.some(item => item.key === report.expectedCache), 'Preview build changed before service-worker activation; rerun on one build')
  for (const lazyName of ['GoalMap', 'PlanView', 'ReviewView', 'Assistant']) {
    assert.ok(firstCache.some(item => item.urls.some(url => new RegExp(`/${lazyName}-[^/]+\\.js$`).test(url))), `${lazyName} must be precached before it is visited`)
  }
  check('Fresh production homepage installs an active SW and precaches all four unvisited lazy screens', { cache: report.expectedCache, pageResources: firstResources.length })

  stage = 'API cache exclusion'
  const onlineProbe = await page.evaluate(async route => { const response = await fetch(route); return { status: response.status, from: response.url } }, apiProbe)
  // Vite preview is not an API server: this is only a same-origin fetch cache probe.
  assert.equal(onlineProbe.status, 200)
  assert.ok((await cacheInventory()).every(item => item.urls.every(url => !new URL(url).pathname.startsWith('/api/'))))
  check('Same-origin online /api fetch is not inserted in Cache Storage', { probe: apiProbe, note: 'Synthetic preview response; not a model call' })

  stage = 'offline first reload'
  await context.setOffline(true); offline = true
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: '把时间，留给重要的事。' }).waitFor()
  assert.equal(await page.evaluate(() => navigator.onLine), false)
  await page.locator('.m-offline').getByText('离线', { exact: true }).waitFor()
  const offlineProbe = await page.evaluate(async route => { try { const response = await fetch(route); return { succeeded: true, status: response.status } } catch { return { succeeded: false } } }, apiProbe)
  assert.equal(offlineProbe.succeeded, false, 'API fetch must fail offline, not receive a cached HTML shell or API response')
  check('Offline reload opens the shell; /api remains unavailable rather than receiving cached application HTML')

  stage = 'offline manual creation'
  await page.getByRole('button', { name: '添加目标', exact: true }).click()
  await page.getByLabel('目标名称', { exact: true }).fill(goalTitle)
  await page.getByLabel('成功标准，每行一条', { exact: true }).fill('发布一个可验证的完整案例')
  await page.getByLabel('关键要素，每行一个', { exact: true }).fill('收集证据\n组织表达\n检查与发布')
  await page.getByRole('dialog').getByRole('button', { name: '创建目标', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '自己添加', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('任务名称').fill(taskTitle)
  await dialog.getByLabel(/^所属目标/).selectOption({ label: goalTitle })
  await dialog.getByLabel(/^具体分支/).selectOption({ label: '收集证据' })
  await dialog.getByLabel('预计分钟', { exact: true }).fill('25')
  await dialog.getByRole('button', { name: '保存行动', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  data = await state()
  assert.equal(data.goals.length, 1); assert.equal(data.nodes.length, 3); assert.equal(data.tasks.length, 1)
  assert.equal(data.tasks[0].title, taskTitle); assert.equal(data.tasks[0].dueDate, null)
  check('Offline native forms create one goal, three branches and a task in IndexedDB without a hard deadline')
  await screenshot('01-offline-created-today')

  stage = 'first offline lazy views'
  await navigate('目标地图', '目标地图')
  await page.getByRole('button', { name: '展开收集证据', exact: true }).click()
  await page.locator('.m-map-canvas').getByRole('button', { name: taskTitle, exact: true }).waitFor()
  await screenshot('02-offline-first-map')
  await navigate('计划', '时间计划')
  await page.getByRole('button', { name: '四象限', exact: true }).click()
  await page.locator('.m-unclassified').getByText(taskTitle, { exact: true }).waitFor()
  await screenshot('03-offline-first-plan')
  await navigate('复盘', '周期复盘')
  await page.getByLabel('这一程，什么值得记住？', { exact: true }).fill('离线也能继续推进，不需要等待服务恢复。')
  await page.getByLabel('下一程，想做什么调整？', { exact: true }).fill('先把一项行动做完。')
  await page.getByRole('button', { name: '保存这次复盘', exact: true }).click()
  await page.getByText('复盘与当前统计快照已保存。', { exact: true }).waitFor()
  await screenshot('04-offline-first-review')
  check('Previously unvisited lazy map, plan/quadrants and review all open and remain editable offline')

  stage = 'offline AI unavailable'
  await page.getByRole('button', { name: /Master 助手/ }).click()
  const assistant = page.getByRole('complementary', { name: 'Master 助手' })
  await assistant.waitFor()
  await assistant.getByText('等待连接 AI 服务', { exact: true }).waitFor()
  // The controlled checkbox changes after the IndexedDB receipt, not synchronously.
  await assistant.getByRole('checkbox', { name: '允许将输入与相关目标发送给阿里 AI' }).click()
  await page.waitForFunction(() => document.querySelector('.m-consent input')?.checked)
  await assistant.getByLabel('告诉 Master 你的安排').fill('离线测试：明天先完善案例，不要直接创建任务。')
  await assistant.getByRole('button', { name: '发送给 Master', exact: true }).click()
  await assistant.getByRole('alert').waitFor()
  assert.equal(await assistant.getByLabel('告诉 Master 你的安排').inputValue(), '离线测试：明天先完善案例，不要直接创建任务。')
  data = await state(); assert.equal(data.tasks.length, 1); assert.equal(data.proposals.length, 0)
  await screenshot('05-offline-assistant-unavailable')
  check('First offline Assistant load shows AI unavailable; failed request preserves input and creates no tasks/proposal')
  await assistant.getByRole('button', { name: '关闭助手', exact: true }).click()

  stage = 'offline completion and persistence'
  await navigate('今日')
  await page.locator('.m-focus-card').getByRole('button', { name: '完成', exact: true }).click()
  await page.locator('.m-done-list > summary').click()
  await page.getByRole('button', { name: `重新打开 ${taskTitle}`, exact: true }).waitFor()
  const beforeReload = await state()
  assert.equal(beforeReload.tasks[0].status, 'done'); assert.equal(beforeReload.timeEntries.length, 0)
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.m-app').waitFor()
  const afterReload = await state()
  for (const key of ['goals', 'nodes', 'tasks', 'allocations', 'timeEntries', 'reviews']) assert.deepEqual(afterReload[key], beforeReload[key], `${key} changed after offline reload`)
  await navigate('复盘', '周期复盘')
  assert.equal(await page.getByLabel('这一程，什么值得记住？', { exact: true }).inputValue(), '离线也能继续推进，不需要等待服务恢复。')
  await screenshot('06-offline-reloaded-review')
  check('Offline task completion and another offline reload preserve all entities and review notes, without fabricated time')

  const lazyResponses = report.offlineResponses.filter(response => lazyPattern.test(response.url))
  for (const name of ['GoalMap', 'PlanView', 'ReviewView', 'Assistant']) {
    assert.ok(lazyResponses.some(response => response.url.includes(`/${name}-`) && response.status === 200 && response.fromServiceWorker), `${name} did not load through the SW while offline`)
  }
  report.finalCaches = await cacheInventory()
  assert.ok(report.finalCaches.every(item => item.urls.every(url => !new URL(url).pathname.startsWith('/api/'))))
  assert.deepEqual(report.runtimeErrors, [])
  assert.deepEqual(report.requestFailures.filter(request => !/\/api(?:\/|$)/.test(new URL(request.url).pathname)), [], 'No static asset may fail while offline')
  report.buildChangedDuringRun = sha256(await readFile(resolve('dist/sw.js'), 'utf8')) !== report.serviceWorkerSha256
  check('All four lazy JavaScript responses came from SW; no /api cache entries and no page exceptions', { buildChangedDuringRun: report.buildChangedDuringRun })
  report.passed = true
} catch (error) {
  report.passed = false; report.failedStage = stage; report.failure = error.stack
  report.cacheDiagnostics = await page.evaluate(async () => {
    const results = []
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      for (const request of await cache.keys()) {
        const response = await cache.match(request)
        results.push({ cache: name, url: request.url, requestHeaders: Object.fromEntries(request.headers), responseHeaders: Object.fromEntries(response.headers), plainUrlMatches: Boolean(await cache.match(request.url)), originHeaderMatches: Boolean(await cache.match(new Request(request.url, { headers: { Origin: location.origin } }))) })
      }
    }
    return results
  }).catch(() => [])
  await screenshot('99-failure').catch(() => {})
  console.error(`FAIL ${stage}:`, error)
  process.exitCode = 1
} finally {
  report.finishedAt = new Date().toISOString()
  await writeFile(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
  console.log(`Report: ${resolve(outputDir, 'report.json')}`)
}
