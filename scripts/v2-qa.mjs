import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

// All mutations happen in a fresh, isolated browser context, never in a user's profile.
const baseUrl = process.env.MASTER_PREVIEW_URL ?? 'http://127.0.0.1:5173'
const outputDir = resolve('.visual-qa/v2')
const report = { startedAt: new Date().toISOString(), baseUrl, checks: [], screenshots: [], errors: [], unavailableGatewayChecks: [], overflow: [] }
await mkdir(outputDir, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.MASTER_EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, timezoneId: 'Asia/Singapore', colorScheme: 'light', reducedMotion: 'reduce' })
const page = await context.newPage()
page.on('pageerror', error => report.errors.push(error.message))
page.on('console', message => {
  if (message.type() !== 'error') return
  const url = message.location().url
  if (/^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/api\/health$/.test(url) && message.text().includes('ERR_CONNECTION_REFUSED')) report.unavailableGatewayChecks.push({ message: message.text(), url })
  else report.errors.push(message.text())
})
page.setDefaultTimeout(12000)
let stage = 'initial load'
const check = (name, details = {}) => { report.checks.push({ name, ...details }); console.log(`PASS ${name}`) }
const screenshot = async name => { const path = resolve(outputDir, `${name}.png`); await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.m-main')?.scrollTo(0, 0) }); await page.screenshot({ path, fullPage: true }); report.screenshots.push(path) }
async function navigate(name) {
  await page.locator('.m-app').waitFor()
  const nav = page.getByRole('navigation', { name: '主导航' })
  if (!await nav.isVisible()) await page.getByRole('button', { name: '切换导航' }).click()
  await nav.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await page.locator('.m-view-loading').waitFor({ state: 'hidden' })
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.m-main')?.scrollTo(0, 0) })
}
async function state(database = 'master-v2') {
  return page.evaluate(async dbName => {
    const database = await new Promise((resolve, reject) => { const r = indexedDB.open(dbName); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    try {
      const names = ['meta', 'goals', 'nodes', 'tasks', 'allocations', 'timeEntries', 'capacities', 'reviews']
      const transaction = database.transaction(names, 'readonly')
      const values = await Promise.all(names.map(name => new Promise((resolve, reject) => { const r = transaction.objectStore(name).getAll(); r.onsuccess = () => resolve([name, r.result]); r.onerror = () => reject(r.error) })))
      return Object.fromEntries(values)
    } finally { database.close() }
  }, database)
}
async function checkOverflow(label) {
  const result = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, offenders: [...document.querySelectorAll('main, section, aside, form, input, select')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.right > innerWidth + 1 || b.left < -1) }).map(e => ({ tag: e.tagName, class: e.className, width: Math.round(e.getBoundingClientRect().width) })).slice(0, 10) }))
  report.overflow.push({ label, ...result })
  assert.ok(result.document <= result.client + 1, `${label}: horizontal overflow ${JSON.stringify(result)}`)
}
async function createTask(title, { goal = false, date = '', importance = 'unknown', urgent = 'unknown', minutes = '' } = {}) {
  await navigate('今日')
  await page.getByRole('button', { name: '自己添加', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('任务名称').fill(title)
  if (goal) {
    await dialog.getByLabel(/^所属目标/).selectOption({ label: '让作品与生活一起生长' })
    await dialog.getByLabel(/^具体分支/).selectOption({ label: '作品与表达' })
  }
  await dialog.getByLabel('计划日期', { exact: false }).fill(date)
  await dialog.getByLabel('预计分钟', { exact: true }).fill(minutes)
  await dialog.getByLabel(/^重要性/).selectOption(importance)
  await dialog.getByLabel(/^紧急程度/).selectOption(urgent)
  await dialog.getByRole('button', { name: '保存行动', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
}

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: '把时间，留给重要的事。' }).waitFor()
  let data = await state()
  assert.equal(data.tasks.length, 0); assert.equal(data.goals.length, 0)
  await screenshot('01-empty-personal')
  check('Fresh personal space is empty; no demo data')
  const today = await page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()))
  const tomorrow = await page.evaluate(day => { const d = new Date(`${day}T12:00:00+08:00`); d.setDate(d.getDate() + 1); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) }, today)
  stage = 'create goal and tasks'
  await page.getByRole('button', { name: '添加目标', exact: true }).click()
  await page.getByLabel('目标名称', { exact: true }).fill('让作品与生活一起生长')
  await page.getByLabel('为什么做 / 现实限制', { exact: true }).fill('用清晰的作品连接长期方向，每天最多投入两小时，保留陪伴与休息。')
  await page.getByLabel('成功标准，每行一条', { exact: true }).fill('完成并发布三个真实案例\n每周保留两个晚上和家人相处')
  await page.getByLabel('关键要素，每行一个', { exact: true }).fill('作品与表达\n健康与节律\n关系与陪伴')
  await page.getByRole('dialog').getByRole('button', { name: '创建目标', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await createTask('整理第一个案例的真实证据', { goal: true, date: today, importance: 'important', urgent: 'false', minutes: '45' })
  await createTask('处理今天的关键反馈', { goal: true, date: today, importance: 'important', urgent: 'true', minutes: '20' })
  await createTask('回复临时确认信息', { importance: 'normal', urgent: 'true', minutes: '10' })
  await createTask('整理收藏夹', { importance: 'normal', urgent: 'false', minutes: '15' })
  await createTask('还没有想清楚的行动')
  data = await state()
  assert.equal(data.goals.length, 1); assert.equal(data.nodes.length, 3); assert.equal(data.tasks.length, 5); assert.equal(data.allocations.length, 2)
  check('Goal, three branches and five tasks created through native forms')
  await screenshot('02-today-with-work')

  stage = 'weekly capacity and atomic reschedule'
  await navigate('计划')
  await page.getByLabel('可投入 / 分钟', { exact: true }).fill('120')
  await page.getByLabel('弹性 / %', { exact: true }).fill('20')
  await page.getByRole('button', { name: '设定预算', exact: true }).click()
  await page.getByText('/ 可安排 1小时36分', { exact: true }).waitFor()
  await page.getByLabel('为处理今天的关键反馈改期', { exact: true }).fill(tomorrow)
  await page.getByLabel('为处理今天的关键反馈改期', { exact: true }).waitFor({ state: 'hidden' })
  data = await state()
  const movedTask = data.tasks.find(t => t.title === '处理今天的关键反馈')
  const moved = data.allocations.filter(a => a.taskId === movedTask.id)
  assert.equal(moved.length, 1); assert.equal(moved[0].date, tomorrow)
  assert.equal(data.capacities[0].minutes * (1 - data.capacities[0].buffer), 96)
  check('Capacity reserves 20%; rescheduling moves rather than duplicates an allocation')
  await screenshot('03-week-plan')

  stage = 'four quadrant classification'
  await page.getByRole('button', { name: '四象限', exact: true }).click()
  for (const [key, title] of [['do', '处理今天的关键反馈'], ['grow', '整理第一个案例的真实证据'], ['delegate', '回复临时确认信息'], ['release', '整理收藏夹']]) assert.ok(await page.locator(`.m-quadrant--${key}`).getByText(title, { exact: true }).isVisible())
  assert.ok(await page.locator('.m-unclassified').getByText('还没有想清楚的行动', { exact: true }).isVisible())
  check('All four quadrants plus explicit unknown classification render correctly')
  await screenshot('04-four-quadrants')

  stage = 'map, outline and shared completion'
  await navigate('目标地图')
  await page.getByRole('button', { name: '展开作品与表达', exact: true }).click()
  await page.getByRole('button', { name: '显示全部节点', exact: true }).click()
  await screenshot('05-goal-map')
  const nodePositions = await page.locator('.react-flow__node').evaluateAll(nodes => Object.fromEntries(nodes.map(n => [n.getAttribute('data-id'), n.style.transform])))
  await page.locator('.m-map-canvas').getByRole('button', { name: '整理第一个案例的真实证据', exact: true }).click()
  await page.getByText('完成任务并记录投入', { exact: true }).click()
  await page.getByLabel(/(?:本次|累计)实际分钟（可不填）/).fill('30')
  await page.getByRole('button', { name: '标记完成', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '重新打开：整理第一个案例的真实证据', exact: true }).waitFor()
  const completedPositions = await page.locator('.react-flow__node').evaluateAll(nodes => Object.fromEntries(nodes.map(n => [n.getAttribute('data-id'), n.style.transform])))
  assert.deepEqual(completedPositions, nodePositions)
  await page.getByRole('button', { name: '大纲', exact: true }).click()
  assert.ok(await page.locator('.m-map-outline').getByText('整理第一个案例的真实证据', { exact: true }).isVisible())
  data = await state()
  assert.equal(data.timeEntries.length, 1); assert.equal(data.timeEntries[0].minutes, 30)
  assert.equal(data.tasks.find(t => t.title === '整理第一个案例的真实证据').completedDate, today)
  check('Map expands, opens editor and completes task without node reflow; outline shares state')

  stage = 'manual hierarchy authoring'
  await page.getByRole('button', { name: '为作品与表达添加下级节点', exact: true }).click()
  assert.equal(await page.getByLabel('节点类型', { exact: true }).inputValue(), 'milestone')
  await page.getByLabel('节点名称', { exact: true }).fill('发布首个案例')
  await page.getByRole('button', { name: '保存节点', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.locator('.m-map-outline').getByText('发布首个案例', { exact: true }).click()
  await page.getByRole('button', { name: '为发布首个案例添加下级节点', exact: true }).click()
  assert.equal(await page.getByLabel('节点类型', { exact: true }).inputValue(), 'subgoal')
  await page.getByLabel('节点名称', { exact: true }).fill('完成案例初稿')
  await page.getByRole('button', { name: '保存节点', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '编辑节点发布首个案例', exact: true }).click()
  assert.equal(await page.getByLabel('上级节点', { exact: true }).getByRole('option', { name: '完成案例初稿', exact: true }).count(), 0)
  await page.getByLabel('节点名称', { exact: true }).fill('发布并验证首个案例')
  await page.getByRole('button', { name: '保存节点', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  data = await state()
  assert.equal(data.nodes.length, 5)
  const milestone = data.nodes.find(n => n.title === '发布并验证首个案例')
  assert.equal(data.nodes.find(n => n.title === '完成案例初稿').parentId, milestone.id)
  check('Manual milestone/subgoal creation and editing work; descendant cannot be chosen as parent')
  await page.getByRole('button', { name: '添加要素', exact: true }).click()
  await page.getByLabel('节点名称', { exact: true }).fill('资源与学习')
  await page.getByRole('button', { name: '保存节点', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  data = await state(); assert.equal(data.nodes.length, 6)
  assert.equal(data.nodes.find(n => n.title === '资源与学习').parentId, null)
  await screenshot('05b-goal-outline-hierarchy')

  stage = 'multiple goals and direct goal creation'
  await page.getByRole('button', { name: '新的目标', exact: true }).click()
  await page.getByLabel('目标名称', { exact: true }).fill('保持稳定的阅读节律')
  await page.getByRole('dialog').getByRole('button', { name: '创建目标', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.locator('.m-sidebar-goals').getByRole('button', { name: '保持稳定的阅读节律', exact: true }).click()
  assert.equal(await page.getByLabel('当前目标', { exact: true }).inputValue(), (await state()).goals.find(g => g.title === '保持稳定的阅读节律').id)
  await page.getByLabel('当前目标', { exact: true }).selectOption({ label: '让作品与生活一起生长' })
  await page.getByRole('heading', { name: '让作品与生活一起生长', exact: true }).waitFor()
  check('Map creates another goal directly; sidebar and map select keep the intended goal')

  stage = 'period review and saved snapshot'
  await navigate('复盘')
  assert.match(await page.locator('.m-review-stats').innerText(), /1\s*项行动/)
  assert.match(await page.locator('.m-review-stats').innerText(), /30分钟/)
  await page.getByLabel('这一程，什么值得记住？', { exact: true }).fill('从真实证据开始，比反复调整样式更有帮助。')
  await page.getByLabel('下一程，想做什么调整？', { exact: true }).fill('继续做一个小案例，每天预留 20% 弹性。')
  await page.getByRole('button', { name: '保存这次复盘', exact: true }).click()
  await page.getByText('复盘与当前统计快照已保存。', { exact: true }).waitFor()
  data = await state()
  assert.equal(data.reviews.length, 1); assert.equal(data.reviews[0].snapshot.completed, 1); assert.equal(data.reviews[0].snapshot.minutes, 30)
  await screenshot('06-week-review')
  for (const period of ['月度', '年度']) { await page.getByRole('button', { name: period, exact: true }).click(); assert.match(await page.locator('.m-review-stats').innerText(), /30分钟/) }
  await page.getByRole('button', { name: '上一年', exact: true }).click()
  assert.match(await page.locator('.m-review-stats').innerText(), /0分钟/)
  check('Weekly, monthly, annual review uses period facts; previous year is not all-time data')
  await page.reload({ waitUntil: 'networkidle' })
  await navigate('复盘')
  assert.equal(await page.getByLabel(/^这一程，什么值得记住？/).inputValue(), '从真实证据开始，比反复调整样式更有帮助。')
  data = await state(); assert.equal(data.tasks.length, 5); assert.equal(data.timeEntries[0].minutes, 30)
  check('Refresh retains tasks, completion evidence, capacity and review notes')

  stage = 'demo isolation'
  await page.locator('.m-space-switch').click()
  await page.locator('.m-demo-banner').waitFor()
  assert.ok(!(await state('master-v2-demo')).tasks.some(t => t.title === '还没有想清楚的行动'))
  await createTask('仅存在于示例空间的行动')
  await page.getByRole('button', { name: '回到我的空间', exact: true }).click()
  await page.locator('.m-demo-banner').waitFor({ state: 'hidden' })
  data = await state(); assert.equal(data.tasks.length, 5); assert.ok(!data.tasks.some(t => t.title === '仅存在于示例空间的行动'))
  check('Demo edits remain isolated from personal IndexedDB')

  stage = 'keyboard search and theme'
  await page.keyboard.press('Control+k')
  await page.getByLabel('搜索目标与任务', { exact: true }).fill('真实证据')
  assert.ok(await page.getByRole('dialog').getByText('整理第一个案例的真实证据', { exact: false }).isVisible())
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await page.getByLabel('外观主题', { exact: true }).selectOption('dark')
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await navigate('今日'); await screenshot('07-dark-today')
  await navigate('目标地图'); await page.getByLabel('当前目标', { exact: true }).selectOption({ label: '让作品与生活一起生长' }); await screenshot('08-dark-map')
  await page.getByRole('button', { name: 'Master 助手', exact: false }).click()
  await page.getByRole('button', { name: '开始说话', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '结束并发送', exact: true }).count(), 0)
  await page.waitForFunction(() => { const bounds = document.querySelector('.m-map-canvas')?.getBoundingClientRect(); return bounds && [...document.querySelectorAll('.react-flow__node')].every(node => { const box = node.getBoundingClientRect(); return box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom }) })
  await screenshot('08b-dark-map-assistant')
  await page.getByRole('button', { name: '关闭助手', exact: true }).click()
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await page.getByLabel('外观主题', { exact: true }).selectOption('light')
  await navigate('目标地图')
  await page.getByLabel('当前目标', { exact: true }).selectOption({ label: '让作品与生活一起生长' })
  await page.getByRole('button', { name: 'Master 助手', exact: false }).click()
  await page.getByRole('button', { name: '开始说话', exact: true }).waitFor()
  await screenshot('08c-light-map-assistant')
  await page.getByRole('button', { name: '关闭助手', exact: true }).click()
  check('Ctrl+K search, Escape dismissal and theme controls work')
  check('Assistant opens with explicit start-speaking control and no ambient listening')

  stage = 'responsive, native control names and late-loaded CSS'
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 1280, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    for (const view of ['今日', '目标地图', '计划', '复盘']) {
      await navigate(view)
      await checkOverflow(`${viewport.width}/${view}`)
      if (viewport.width === 390 || (viewport.width === 1440 && view === '今日')) await screenshot(`09-responsive-${viewport.width}-${view}`)
    }
  }
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('button,input,select,textarea')].filter(e => {
    if (!e.getClientRects().length || e.getAttribute('type') === 'hidden') return false
    return !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.getAttribute('title') && !e.textContent?.trim() && !e.labels?.length
  }).map(e => e.outerHTML.slice(0, 180)))
  assert.deepEqual(unnamed, [])
  assert.deepEqual(report.errors, [])
  check('Five viewports, four screens: no document overflow; current visible controls named; no runtime errors')
  report.passed = true
} catch (error) {
  report.passed = false; report.failedStage = stage; report.failure = error.stack
  report.mapDiagnostics = await page.evaluate(() => ({ transform: document.querySelector('.react-flow__viewport')?.getAttribute('style'), canvas: document.querySelector('.m-map-canvas')?.getBoundingClientRect().toJSON() })).catch(() => null)
  await screenshot('99-failure').catch(() => {})
  console.error(`FAIL ${stage}:`, error)
  process.exitCode = 1
} finally {
  report.finishedAt = new Date().toISOString()
  await writeFile(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
