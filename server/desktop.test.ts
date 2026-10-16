import { afterEach, describe, expect, it, vi } from 'vitest'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { startDesktopGateway, type DesktopGateway } from './electron'
import type { AgentInput } from '../src/v2/core/types'

const token = 'desktop-session-token-' + 'a'.repeat(32)
const running: DesktopGateway[] = []
const missingPath = resolve(tmpdir(), `master-missing-${randomUUID()}.env`)
const input: AgentInput = { text: '今天阅读30分钟', mode: 'plan', date: '2026-09-28', inputRevision: 1, workspace: { revision: 0, goals: [], nodes: [], tasks: [], allocations: [], capacities: [] }, conversation: [] }
const post = (url: string, auth?: string, origin = 'app://master') => fetch(`${url}/api/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'desktop-test-001', Origin: origin, ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(input) })
afterEach(async () => { for (const app of running.splice(0)) await app.close(); vi.resetModules() })

describe('embedded desktop gateway', () => {
  it('starts on distinct loopback ephemeral ports with missing env and requires its session token', async () => {
    const first = await startDesktopGateway({ envPath: missingPath, token })
    running.push(first)
    const second = await startDesktopGateway({ envPath: missingPath, token })
    running.push(second)
    expect(new URL(first.url).hostname).toBe('127.0.0.1')
    expect(first.url).not.toBe(second.url)
    const health = await fetch(`${first.url}/api/health`, { headers: { Origin: 'app://master' } })
    expect(health.headers.get('access-control-allow-origin')).toBe('app://master')
    expect(await health.json()).toMatchObject({ ready: false, ai: false, asr: false })
    expect((await post(first.url)).status).toBe(401)
    expect((await post(first.url, 'wrong-token')).status).toBe(401)
    expect((await post(first.url, token)).status).toBe(503)
    expect((await post(first.url, token, 'https://evil.invalid')).status).toBe(403)
    expect((await post(first.url, token, 'null')).status).toBe(403)
    await first.close()
    await first.close()
    await expect(fetch(`${first.url}/api/health`)).rejects.toThrow()
  })
  it('reads an isolated env object; file cannot replace token, origins or ephemeral port', async () => {
    const originalKey = process.env.DASHSCOPE_API_KEY
    const originalFixture = process.env.MASTER_DESKTOP_FIXTURE
    const envPath = fileURLToPath(new URL('./fixtures/desktop.env', import.meta.url))
    const app = await startDesktopGateway({ envPath, token })
    running.push(app)
    expect(process.env.DASHSCOPE_API_KEY).toBe(originalKey)
    expect(process.env.MASTER_DESKTOP_FIXTURE).toBe(originalFixture)
    expect((await (await fetch(`${app.url}/api/health`)).json()).ai).toBe(true)
    // No valid generation request is sent to the test-configured upstream.
    expect((await post(app.url, 'untrusted-file-token')).status).toBe(401)
    expect((await post(app.url, token, 'https://evil.invalid')).status).toBe(403)
    expect(new URL(app.url).port).not.toBe('49999')
  })
  it('rejects missing/weak tokens, relative config paths and non-origin values', async () => {
    await expect(startDesktopGateway({ envPath: missingPath, token: '' })).rejects.toThrow('会话令牌')
    await expect(startDesktopGateway({ envPath: '.env', token })).rejects.toThrow('绝对路径')
    await expect(startDesktopGateway({ envPath: missingPath, token, origin: '*' })).rejects.toThrow('Origin')
    await expect(startDesktopGateway({ envPath: missingPath, token, origin: 'https://good.invalid/other' })).rejects.toThrow('Origin')
  })
})

describe('renderer connection ownership', () => {
  it('preserves an omitted token only for the same normalized URL, clears it for a changed URL', async () => {
    const { configureGateway, getGatewayConnection } = await import('../src/v2/agent/connection')
    configureGateway({ url: 'http://127.0.0.1:4318', token: 'local-token' })
    configureGateway({ url: 'http://127.0.0.1:4318/' })
    expect(getGatewayConnection().token).toBe('local-token')
    configureGateway({ url: 'http://127.0.0.1:9999' })
    expect(getGatewayConnection().token).toBe('')
  })
  it('pins preload config so preferences cannot overwrite it or redirect its token', async () => {
    const { configureGateway, configureDesktopGateway, getGatewayConnection } = await import('../src/v2/agent/connection')
    configureDesktopGateway({ url: 'http://127.0.0.1:45678', token })
    configureGateway({ url: 'http://127.0.0.1:4318' })
    configureGateway({ url: 'https://evil.invalid', token: '' })
    expect(getGatewayConnection()).toEqual({ url: 'http://127.0.0.1:45678', token })
    await expect(async () => configureDesktopGateway({ url: 'https://evil.invalid', token })).rejects.toThrow('本机')
    expect(getGatewayConnection().token).toBe(token)
  })
})
