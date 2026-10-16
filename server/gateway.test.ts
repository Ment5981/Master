import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import WebSocket, { WebSocketServer } from 'ws'
import { createGateway } from './app'
import { readConfig } from './config'
import type { AgentInput } from '../src/v2/core/types'
import type { ModelPlan } from './schema'
import type { FastifyInstance } from 'fastify'

const input: AgentInput = { text: '今天阅读30分钟', mode: 'plan', date: '2026-09-28', inputRevision: 1, workspace: { revision: 0, goals: [], nodes: [], tasks: [], allocations: [], capacities: [] }, conversation: [] }
const plan: ModelPlan = { summary: '先安排一段阅读。', question: null, assumptions: [], goals: [], nodes: [], tasks: [{ title: '阅读', targetTaskId: null, goalRef: null, nodeRef: null, status: 'todo', estimateMinutes: 30, plannedDate: '2026-09-28', dueDate: null, importance: 'unknown', urgent: null, evidence: [{ sourceId: 'current-input', quote: '阅读30分钟', kind: 'user_report' }] }], capacity: null }
const resources: Array<() => Promise<unknown>> = []
const config = (extra = {}) => ({ ...readConfig({}), ...extra })
const make = async (options: Parameters<typeof createGateway>[0] = {}) => {
  const app = await createGateway({ config: config(), ...options })
  resources.push(() => app.close())
  return app
}
const request = (app: FastifyInstance, body = input, id = 'test-request-001', extra: Record<string, string> = {}) => app.inject({ method: 'POST', url: '/api/agent', headers: { 'x-request-id': id, ...extra }, payload: body })
afterEach(async () => { for (const close of resources.splice(0).reverse()) await close() })

describe('local gateway boundaries', () => {
  it('health is readable without key/token; no key yields explicit 503 without generator call', async () => {
    let calls = 0
    const app = await make({ config: config({ bearer: 'secret' }), generate: async () => { calls++; return plan } })
    expect((await app.inject('/api/health')).json()).toMatchObject({ ready: false, ai: false, asr: false, tts: false })
    expect((await request(app)).statusCode).toBe(401)
    const response = await request(app, input, 'test-request-001', { authorization: 'Bearer secret' })
    expect(response.statusCode).toBe(503)
    expect(response.json().code).toBe('NOT_CONFIGURED')
    expect(calls).toBe(0)
  })
  it('rejects invalid inputs, origins, host rebinding and authorization before model calls', async () => {
    let calls = 0
    const app = await make({ config: config({ apiKey: 'fake', bearer: 'secret' }), generate: async () => { calls++; return plan } })
    const auth = { authorization: 'Bearer secret' }
    expect((await request(app, { ...input, date: '2026-02-30' }, 'invalid-001', auth)).statusCode).toBe(400)
    expect((await request(app, { ...input, text: '' }, 'invalid-002', auth)).statusCode).toBe(400)
    expect((await request(app, input, 'invalid-003', { ...auth, origin: 'https://evil.invalid' })).statusCode).toBe(403)
    expect((await request(app, input, 'invalid-004', { ...auth, host: 'evil.invalid:4318' })).statusCode).toBe(403)
    expect((await request(app, input, 'invalid-005', { authorization: 'Bearer wrong' })).statusCode).toBe(401)
    expect(calls).toBe(0)
  })
  it('caches same request, rejects changed payload, verifies quotes and never applies', async () => {
    let calls = 0
    const app = await make({ config: config({ apiKey: 'fake' }), generate: async () => { calls++; return plan } })
    const first = await request(app)
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ engine: 'remote', state: 'draft', inputRevision: 1, baseRevision: 0 })
    expect(first.json().tasks[0].evidence[0].sourceId).toBe(first.json().sources[0].id)
    expect((await request(app)).json()).toEqual(first.json())
    expect((await request(app, { ...input, text: 'different' })).statusCode).toBe(409)
    expect(calls).toBe(1)
  })
  it('rejects fabricated evidence and assistant completion claims remain todo', async () => {
    const bad = structuredClone(plan)
    bad.tasks[0].evidence[0].quote = '这句话并不存在'
    const app = await make({ config: config({ apiKey: 'fake' }), generate: async () => bad })
    expect((await request(app)).json().code).toBe('INVALID_PROPOSAL')
    const claim = structuredClone(plan)
    claim.tasks[0].status = 'reported_done'
    claim.tasks[0].evidence = [{ sourceId: 'turn-0', quote: '阅读已完成', kind: 'assistant_claim' }]
    const app2 = await make({ config: config({ apiKey: 'fake' }), generate: async () => claim })
    const response = await request(app2, { ...input, conversation: [{ role: 'assistant', text: '阅读已完成' }] })
    expect(response.json().tasks[0].status).toBe('todo')
  })
  it('cancel aborts an in-flight generator and late output cannot become a proposal', async () => {
    let started!: () => void
    const running = new Promise<void>(resolve => { started = resolve })
    let signal: AbortSignal | undefined
    const app = await make({ config: config({ apiKey: 'fake' }), generate: async (_input, _sources, abort) => { signal = abort; started(); return new Promise(() => undefined) } })
    const pending = request(app)
    await running
    const cancellation = await app.inject({ method: 'POST', url: '/api/agent/test-request-001/cancel', payload: {} })
    expect(cancellation.statusCode).toBe(200)
    expect(signal?.aborted).toBe(true)
    expect((await pending).json().code).toBe('CANCELLED')
    expect((await request(app)).json().code).toBe('CANCELLED')
  })
  it('rejects unknown output keys and cross-snapshot target tasks', async () => {
    const app = await make({ config: config({ apiKey: 'fake' }), generate: async () => ({ ...plan, apply: true }) })
    expect((await request(app)).statusCode).toBe(502)
    const app2 = await make({ config: config({ apiKey: 'fake' }), generate: async () => ({ ...plan, tasks: [{ ...plan.tasks[0], targetTaskId: 'foreign-id' }] }) })
    expect((await request(app2)).statusCode).toBe(502)
  })
  it('accepts the real buffer-ratio contract and optional civil completion date', async () => {
    const app = await make({ config: config({ apiKey: 'fake' }), generate: async () => ({ ...plan, capacity: { date: input.date, minutes: 60, buffer: 0.2 } }) })
    const body = structuredClone(input)
    body.workspace.capacities = [{ date: input.date, minutes: 90, buffer: 0.2 }]
    body.workspace.tasks = [{ id: 'existing', title: '已完成任务', nodeId: null, goalId: null, status: 'done', importance: 'unknown', urgent: null, estimateMinutes: null, dueDate: null, startDate: null, locked: false, createdAt: '2026-09-28T00:00:00Z', completedAt: '2026-09-28T00:00:00Z', completedDate: '2026-09-28', sourceId: null }]
    const response = await request(app, body)
    expect(response.statusCode).toBe(200)
    expect(response.json().capacity.buffer).toBe(0.2)
  })
  it('enforces request budget, input size and timeout without retrying upstream', async () => {
    let calls = 0
    const app = await make({ config: config({ apiKey: 'fake', maxRequestsPerHour: 1, requestTimeoutMs: 20 }), generate: async () => { calls++; return new Promise(() => undefined) } })
    expect((await request(app, { ...input, text: 'x'.repeat(24001) })).statusCode).toBe(400)
    expect((await request(app)).json().code).toBe('TIMEOUT')
    expect((await request(app, input, 'request-second')).statusCode).toBe(429)
    expect(calls).toBe(1)
  })
  it('voice ticket requires configuration and rejects query-string authentication', async () => {
    const app = await make()
    expect((await app.inject({ method: 'POST', url: '/api/voice/ticket', payload: {} })).statusCode).toBe(503)
    const result = await app.inject({ method: 'GET', url: '/api/voice?key=not-a-real-key' })
    expect(result.statusCode).toBe(400)
    expect(result.json().code).toBe('NO_QUERY_AUTH')
  })
  it('keeps cited provenance when editing a saved draft after conversation was closed', async () => {
    const app = await make({ config: config({ apiKey: 'fake' }), generate: async (payload, sources) => {
      if (!payload.previousProposal) return plan
      const previous = sources.find(s => s.id.startsWith('previous:'))!
      return { ...plan, tasks: [{ ...plan.tasks[0], estimateMinutes: 15, evidence: [{ sourceId: previous.id, quote: '阅读30分钟', kind: 'user_report' }] }] }
    } })
    const first = (await request(app)).json()
    const response = await request(app, { ...input, text: '这项改成15分钟', conversation: [], previousProposal: first, inputRevision: 2 }, 'test-followup-02')
    expect(response.statusCode).toBe(200)
    expect(response.json().tasks[0].estimateMinutes).toBe(15)
    expect(response.json().sources.find((s: { id: string }) => s.id === response.json().tasks[0].evidence[0].sourceId).text).toBe(input.text)
  })
})

async function listen(server: Server): Promise<string> {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing address')
  return `http://127.0.0.1:${address.port}`
}
describe('mock upstream contracts (no remote API calls)', () => {
  it('runs actual AI SDK/OpenAI-compatible HTTP adapter through schema and evidence validation', async () => {
    let received: Record<string, unknown> | undefined
    let auth = ''
    const upstream = createServer((req, res) => {
      auth = req.headers.authorization ?? ''
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        received = JSON.parse(body)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ id: 'mock-completion', object: 'chat.completion', created: 1, model: 'mock-qwen', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(plan) }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 50, total_tokens: 70 } }))
      })
    })
    const url = await listen(upstream)
    resources.push(() => new Promise<void>(resolve => upstream.close(() => resolve())))
    const app = await make({ config: config({ apiKey: 'mock-only-key', baseURL: `${url}/v1` }) })
    const response = await request(app)
    expect(response.statusCode).toBe(200)
    expect(response.json().tasks[0].title).toBe('阅读')
    expect(auth).toBe('Bearer mock-only-key')
    expect(received).toMatchObject({ model: 'qwen-plus', response_format: { type: 'json_object' }, enable_thinking: false })
    expect(JSON.stringify(received)).toContain('additionalProperties')
    expect(JSON.stringify(received)).not.toContain('mock-only-key')
  })
  it('authenticates WS with a one-use first-frame ticket, proxies PCM and waits for final transcript', async () => {
    const upstreamHTTP = createServer()
    const upstreamURL = await listen(upstreamHTTP)
    const wss = new WebSocketServer({ server: upstreamHTTP })
    resources.push(() => new Promise<void>(resolve => { wss.close(() => upstreamHTTP.close(() => resolve())) }))
    const events: string[] = []
    let keyHeader = ''
    wss.on('connection', (socket, req) => {
      keyHeader = req.headers.authorization ?? ''
      expect(req.url).toContain('model=qwen3-asr-flash-realtime')
      expect(req.url).not.toContain('mock-only-key')
      socket.on('message', raw => {
        const event = JSON.parse(raw.toString())
        events.push(event.type)
        if (event.type === 'session.update') {
          expect(event.session).toMatchObject({ input_audio_format: 'pcm', sample_rate: 16000 })
          socket.send(JSON.stringify({ type: 'session.updated' }))
        }
        if (event.type === 'input_audio_buffer.append') {
          expect(Buffer.from(event.audio, 'base64').length).toBe(3200)
          socket.send(JSON.stringify({ type: 'conversation.item.input_audio_transcription.text', item_id: 'item1', text: '今天', stash: '阅读' }))
        }
        if (event.type === 'session.finish') {
          socket.send(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item1', transcript: '今天阅读三十分钟' }))
          socket.send(JSON.stringify({ type: 'session.finished' }))
        }
      })
    })
    const app = await make({ config: config({ apiKey: 'mock-only-key', bearer: 'local-token', asrURL: upstreamURL.replace('http:', 'ws:') }) })
    const address = await app.listen({ port: 0, host: '127.0.0.1' })
    const ticketResponse = await app.inject({ method: 'POST', url: '/api/voice/ticket', headers: { authorization: 'Bearer local-token' }, payload: {} })
    const ticket = ticketResponse.json().ticket
    const socket = new WebSocket(address.replace('http:', 'ws:') + '/api/voice')
    const collected: Array<{ type: string; text?: string; final?: boolean }> = []
    const ended = new Promise<void>((resolve, reject) => {
      socket.on('error', reject)
      socket.on('message', raw => {
        const message = JSON.parse(raw.toString())
        collected.push(message)
        if (message.type === 'ready') socket.send(Buffer.alloc(3200))
        if (message.type === 'transcript' && !message.final) socket.send(JSON.stringify({ type: 'finish' }))
        if (message.type === 'finished') resolve()
      })
    })
    await once(socket, 'open')
    socket.send(JSON.stringify({ type: 'auth', ticket }))
    await ended
    await once(socket, 'close')
    expect(keyHeader).toBe('Bearer mock-only-key')
    expect(events).toEqual(['session.update', 'input_audio_buffer.append', 'session.finish'])
    expect(collected).toContainEqual({ type: 'transcript', itemId: 'item1', text: '今天阅读', final: false })
    expect(collected).toContainEqual({ type: 'transcript', itemId: 'item1', text: '今天阅读三十分钟', final: true })
    const reused = new WebSocket(address.replace('http:', 'ws:') + '/api/voice')
    const rejected = new Promise<string>(resolve => reused.on('message', raw => resolve(JSON.parse(raw.toString()).code)))
    await once(reused, 'open')
    reused.send(JSON.stringify({ type: 'auth', ticket }))
    expect(await rejected).toBe('UNAUTHORIZED')
    reused.terminate()
  })
})
