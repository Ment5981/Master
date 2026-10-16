import assert from 'node:assert/strict'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import asar from '@electron/asar'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const archive = resolve(process.argv[2] || resolve(root, 'release-v2/win-unpacked/resources/app.asar'))
await stat(archive)
// Inspect the packaged application, never a real user's .env or database.
const metadata = new Map()
let links = 0
const walk = (entry, prefix = '') => {
  for (const [name, child] of Object.entries(entry.files || {})) {
    const path = prefix + name
    if (child.files) walk(child, path + '/')
    else if ('link' in child) links++ // The referenced real file tree is scanned separately.
    else metadata.set(path, child)
  }
}
walk(asar.getRawHeader(archive).header)
const files = [...metadata.keys()]
const own = files.filter(path => !path.startsWith('node_modules/'))
const forbidden = files.filter(path => /(^|\/)(\.env(?:\.[^/]*)?|master-ai\.env|master-state\.json|master-v2\.sqlite(?:-wal|-shm)?|[^/]*\.log|[^/]*\.jsonl|[^/]*\.pem|[^/]*\.key)$/i.test(path) && !/\.env\.example$/.test(path))
const privateTrees = own.filter(path => /^(?:\.visual-qa|\.performance|docs|server\/fixtures|release|scripts)\//.test(path))
const sourceMaps = own.filter(path => path.endsWith('.map'))
const credentialFindings = []
const dataFindings = []
let scanned = 0
for (const path of files) {
  if (!/\.(?:[cm]?js|json|map|txt|md|ya?ml|env)$/i.test(path)) continue
  const info = metadata.get(path)
  if (info.size > 20 * 1024 * 1024) continue
  const contents = asar.extractFile(archive, normalize(path)).toString('utf8')
  scanned++
  const categories = []
  if (/\bsk-[A-Za-z0-9_-]{24,}\b/.test(contents)) categories.push('key-shaped literal')
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(contents)) categories.push('private-key block')
  if (/(?:DASHSCOPE_API_KEY|MASTER_GATEWAY_TOKEN)\s*[:=]\s*["']?[A-Za-z0-9_-]{24,}/.test(contents)) categories.push('populated credential assignment')
  if (categories.length) credentialFindings.push({ path, categories })
  if (!path.startsWith('node_modules/') && /Electron QA 持久化目标|Electron QA 可撤销任务|must-not-be-loaded-into-process-env|mock-desktop-test-not-a-real-key/.test(contents)) dataFindings.push(path)
}
const report = {
  archive, files: files.length, links, applicationFiles: own.length, scannedTextFiles: scanned,
  forbiddenPaths: forbidden, privateTrees, applicationSourceMaps: sourceMaps, credentialFindings, testDataFindings: dataFindings,
  intentionalRuntimeSource: own.filter(path => path === 'src/v2/core/runtime.mjs'),
  scope: 'Pattern-based artifact scan, not proof against every possible secret encoding. Runtime JS and third-party source are expected shipping code; no real user configuration was read.',
  passed: !forbidden.length && !privateTrees.length && !sourceMaps.length && !credentialFindings.length && !dataFindings.length,
}
await mkdir(resolve(root, '.visual-qa'), { recursive: true })
const output = resolve(root, '.visual-qa/v2-artifact-audit.json')
await writeFile(output, JSON.stringify(report, null, 2) + '\n')
// Never print matched secret values. Only paths/categories/counts are persisted.
process.stdout.write(JSON.stringify({ passed: report.passed, files: report.files, report: output, findings: forbidden.length + privateTrees.length + sourceMaps.length + credentialFindings.length + dataFindings.length }, null, 2) + '\n')
assert.ok(report.passed, 'Artifact audit found potential private files or credentials; inspect the path/category-only report before release.')
