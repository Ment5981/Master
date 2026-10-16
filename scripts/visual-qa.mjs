import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = process.env.MASTER_PREVIEW_URL ?? 'http://127.0.0.1:4173'
const outputDir = resolve('.visual-qa')
const edgePath =
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
})

const desktop = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
})
const page = await desktop.newPage()
const runtimeErrors = []

page.on('pageerror', (error) => runtimeErrors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(message.text())
})

const assertNoHorizontalOverflow = async (label) => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  if (dimensions.scrollWidth > dimensions.clientWidth + 1) {
    throw new Error(
      `${label} has horizontal overflow: ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px`,
    )
  }
}

const assertInteractiveNames = async (label) => {
  const issues = await page.evaluate(() => {
    const unnamedButtons = [...document.querySelectorAll('button')].filter(
      (element) =>
        !element.textContent?.trim() &&
        !element.getAttribute('aria-label') &&
        !element.getAttribute('aria-labelledby') &&
        !element.getAttribute('title'),
    ).length
    const unnamedFields = [
      ...document.querySelectorAll('input, textarea, select'),
    ].filter(
      (element) =>
        !(element instanceof HTMLInputElement && element.type === 'hidden') &&
        !element.labels?.length &&
        !element.getAttribute('aria-label') &&
        !element.getAttribute('aria-labelledby') &&
        !element.getAttribute('title'),
    ).length
    return { unnamedButtons, unnamedFields }
  })
  if (issues.unnamedButtons || issues.unnamedFields) {
    throw new Error(
      `${label} has unnamed controls: ${JSON.stringify(issues)}`,
    )
  }
}

await page.goto(baseUrl, { waitUntil: 'networkidle' })
await page.screenshot({
  path: resolve(outputDir, '01-onboarding.png'),
  fullPage: true,
})
await assertNoHorizontalOverflow('onboarding')
await assertInteractiveNames('onboarding')

await page.getByLabel('目标名称').fill('在年底前建立稳定的创作系统')
await page.getByLabel('为什么现在要做').fill('把重要作品从愿望变成稳定产出。')
await page.getByRole('button', { name: '继续' }).click()
await page.getByLabel('成功标准 1').fill('连续十二周每周发布一篇完整作品')
await page.getByRole('button', { name: '继续' }).click()
await page.getByLabel('现实限制').fill('工作日时间有限，需要保留休息与家庭时间。')
await page.getByRole('button', { name: '继续' }).click()
await page.getByRole('button', { name: '创建目标地图' }).click()
await page.locator('.react-flow__node').first().waitFor()
await page.waitForTimeout(400)
await page.screenshot({
  path: resolve(outputDir, '01b-created-goal-map.png'),
  fullPage: true,
})

await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })

await page.getByRole('button', { name: '先看示例' }).click()
await page.waitForTimeout(400)
await page.screenshot({
  path: resolve(outputDir, '02-today.png'),
  fullPage: true,
})
await assertNoHorizontalOverflow('today')
await assertInteractiveNames('today')

await page.getByRole('button', { name: '完成任务' }).first().click()
const completionDialog = page.getByRole('dialog', { name: '确认完成' })
await completionDialog.getByRole('button', { name: '完成任务' }).click()
await page.getByText(/已完成：/).waitFor()
await page.screenshot({
  path: resolve(outputDir, '02b-completion-feedback.png'),
  fullPage: true,
})

await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: '先看示例' }).click()

await page.getByRole('button', { name: '目标地图', exact: true }).click()
await page.waitForTimeout(700)
await page.screenshot({
  path: resolve(outputDir, '03-map.png'),
  fullPage: true,
})
await assertNoHorizontalOverflow('map')
await assertInteractiveNames('map')

await page.getByRole('button', { name: '四象限', exact: true }).click()
await page.waitForTimeout(400)
await page.screenshot({
  path: resolve(outputDir, '04-quadrants.png'),
  fullPage: true,
})
await assertNoHorizontalOverflow('quadrants')
await assertInteractiveNames('quadrants')

await page.getByRole('button', { name: '计划', exact: true }).click()
await page.waitForTimeout(400)
await page.screenshot({
  path: resolve(outputDir, '06-plan.png'),
  fullPage: true,
})
await assertNoHorizontalOverflow('plan')
await assertInteractiveNames('plan')

await page.getByRole('button', { name: '复盘', exact: true }).click()
await page.waitForTimeout(400)
await page.screenshot({
  path: resolve(outputDir, '07-review.png'),
  fullPage: true,
})
await assertNoHorizontalOverflow('review')
await assertInteractiveNames('review')

await page.getByRole('button', { name: '切换主题' }).click()
await page.getByRole('menuitem', { name: /深色/ }).click()
await page.waitForTimeout(250)
await page.screenshot({
  path: resolve(outputDir, '08-dark-review.png'),
  fullPage: true,
})
if ((await page.locator('html').getAttribute('data-theme')) !== 'dark') {
  throw new Error('Dark theme did not apply')
}

await page.getByRole('button', { name: '切换主题' }).click()
await page.getByRole('menuitem', { name: /浅色/ }).click()
await page.getByRole('button', { name: '今日', exact: true }).click()
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(350)
await page.screenshot({
  path: resolve(outputDir, '05-mobile-today.png'),
  fullPage: true,
})
await assertNoHorizontalOverflow('mobile today')
await assertInteractiveNames('mobile today')

await page.evaluate(() => navigator.serviceWorker.ready)
await desktop.setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.locator('.mobile-brand').waitFor()
await desktop.setOffline(false)

if (runtimeErrors.length) {
  throw new Error(`Browser runtime errors:\n${runtimeErrors.join('\n')}`)
}

await desktop.close()
await browser.close()

console.log(`Visual QA screenshots saved to ${outputDir}`)
