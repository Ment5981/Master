import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = process.env.MASTER_PREVIEW_URL ?? 'http://127.0.0.1:4173'
const outputDir = resolve('.visual-qa', 'mobile')
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

await mkdir(outputDir, { recursive: true })
const browser = await chromium.launch({ executablePath: edgePath, headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()
const runtimeErrors = []

page.on('pageerror', (error) => runtimeErrors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(message.text())
})

const applyNativeFrame = () =>
  page.evaluate(() => {
    document.documentElement.classList.add('native-app')
    document.documentElement.dataset.platform = 'ios'
  })

const assertNoOverflow = async (label) => {
  const sizes = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  if (sizes.scroll > sizes.client + 1) {
    throw new Error(`${label} overflows horizontally: ${sizes.scroll}px > ${sizes.client}px`)
  }
}

await page.goto(baseUrl, { waitUntil: 'networkidle' })
await applyNativeFrame()
await page.getByRole('button', { name: '先看示例' }).click()
await page.waitForTimeout(250)
await page.screenshot({ path: resolve(outputDir, '01-today.png'), fullPage: true })
await assertNoOverflow('mobile today')

await page.getByRole('button', { name: '添加任务' }).click()
await page.waitForTimeout(180)
await page.screenshot({ path: resolve(outputDir, '02-task-sheet.png') })
await assertNoOverflow('task sheet')
await page.getByRole('button', { name: '关闭' }).click()

await page.getByRole('button', { name: '地图', exact: true }).click()
await page.waitForTimeout(450)
await page.screenshot({ path: resolve(outputDir, '03-map.png') })
await assertNoOverflow('mobile map')

if (runtimeErrors.length) {
  throw new Error(`Mobile runtime errors:\n${runtimeErrors.join('\n')}`)
}

await context.close()
await browser.close()
console.log(`Mobile QA screenshots saved to ${outputDir}`)
