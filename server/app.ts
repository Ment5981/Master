import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import rateLimit from '@fastify/rate-limit'
import { createHash, timingSafeEqual } from 'node:crypto'
import type { AgentInput, GatewayHealth, Proposal } from '../src/v2/core/types'
import { readConfig, type GatewayConfig } from './config'
import { agentInputSchema } from './schema'
import { createQwenGenerator, type PlanGenerator } from './provider'
import { buildSources, materializeProposal } from './proposal'
import { registerVoice } from './asr'

interface Run {
  digest: string; controller: AbortController; expires: number
  promise: Promise<{ status: number; body: Proposal | { code: string; message: string } }>
  state: 'running' | 'completed' | 'failed' | 'cancelled'
}
const loopback = (host: string) => ['127.0.0.1', 'localhost', '::1', '::ffff:127.0.0.1', '[::1]'].includes(host)
const equal = (a: string, b: string) => {
  const left = Buffer.from(a), right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function createGateway(options: { config?: GatewayConfig; generate?: PlanGenerator } = {}) {
  const config = options.config ?? readConfig()
  if (config.origins.includes('null') && !config.bearer) throw new Error('null origin requires MASTER_GATEWAY_TOKEN')
  const app = Fastify({ logger: false, bodyLimit: 512 * 1024, requestTimeout: 10000, trustProxy: false })
  const generate = options.generate ?? createQwenGenerator(config)
  const runs = new Map<string, Run>()
  let concurrent = 0
  let quotaStart = Date.now()
  let quotaCount = 0
  await app.register(cors, { origin: (origin, done) => done(null, !origin || config.origins.includes(origin)), methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'], maxAge: 600 })
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })
  await app.register(websocket, { options: { maxPayload: 8192, perMessageDeflate: false } })
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    const path = request.url.split('?')[0]
    // Health never consumes tokens and remains readable even before API-key configuration.
    if (path === '/api/health') return
    let hostname = ''
    try { hostname = new URL(`http://${request.headers.host}`).hostname } catch { /* rejected below */ }
    if (!loopback(request.ip) || !loopback(hostname)) return reply.code(403).send({ code: 'LOCAL_ONLY', message: '网关仅允许本机访问。' })
    const origin = request.headers.origin
    if (origin && !config.origins.includes(origin)) return reply.code(403).send({ code: 'ORIGIN_DENIED', message: '此页面不在网关允许列表。' })
    if (request.method === 'OPTIONS') return
    // Browser WebSockets cannot set Authorization. They authenticate with a short-lived
    // single-use ticket in their first frame; provider keys never enter URLs or clients.
    if (path === '/api/voice' && request.method === 'GET') {
      if (request.url.includes('?')) return reply.code(400).send({ code: 'NO_QUERY_AUTH', message: '禁止 URL 携带语音凭据。' })
      return
    }
    if (config.bearer && !equal(request.headers.authorization ?? '', `Bearer ${config.bearer}`)) return reply.code(401).send({ code: 'UNAUTHORIZED', message: '本地网关需要访问令牌。' })
  })
  app.get('/api/health', async (): Promise<GatewayHealth> => ({ ready: !!config.apiKey, ai: !!config.apiKey, asr: !!config.apiKey, tts: false, provider: '阿里通义', message: config.apiKey ? '已配置阿里通义；可尝试连接（尚不代表密钥或模型权限已验证）。播报使用系统语音。' : '尚未配置 DASHSCOPE_API_KEY；手动管理正常可用，AI 和语音暂不可用。' }))
  app.post('/api/agent', async (request, reply) => {
    const parsed = agentInputSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'INVALID_INPUT', message: '输入超过范围、缺少字段或格式错误。', fields: parsed.error.issues.slice(0, 5).map(x => x.path.join('.')) })
    const requestId = request.headers['x-request-id']
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(requestId)) return reply.code(400).send({ code: 'REQUEST_ID_REQUIRED', message: '需要有效 X-Request-ID。' })
    if (!config.apiKey) return reply.code(503).send({ code: 'NOT_CONFIGURED', message: '尚未配置阿里通义 API Key。没有调用模型，也没有生成模拟提案。' })
    const input = parsed.data as AgentInput
    const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    for (const [key, run] of runs) if (run.state !== 'running' && run.expires < Date.now()) runs.delete(key)
    let run = runs.get(requestId)
    if (run && run.digest !== digest) return reply.code(409).send({ code: 'REQUEST_ID_CONFLICT', message: '同一请求编号不能用于不同输入。' })
    if (!run) {
      if (Date.now() - quotaStart > 3600000) { quotaStart = Date.now(); quotaCount = 0 }
      if (concurrent >= config.maxConcurrent || quotaCount >= config.maxRequestsPerHour || runs.size >= 200) return reply.code(429).send({ code: 'BUDGET_LIMIT', message: '达到本地网关并发或每小时调用上限，请稍后再试。' })
      const controller = new AbortController()
      const current: Run = { digest, controller, expires: Date.now() + 300000, state: 'running', promise: Promise.resolve({ status: 500, body: { code: 'PENDING', message: '' } }) }
      concurrent++
      quotaCount++
      const timeout = setTimeout(() => controller.abort('timeout'), config.requestTimeoutMs)
      const abortResult = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('ABORTED')), { once: true }))
      current.promise = (async () => {
        try {
          const sources = buildSources(input)
          const result = await Promise.race([generate(input, sources, controller.signal), abortResult])
          if (controller.signal.aborted) throw new Error('ABORTED')
          const proposal = materializeProposal(result, input, sources, requestId)
          current.state = 'completed'
          return { status: 200, body: proposal }
        } catch (error) {
          if (controller.signal.aborted) {
            current.state = 'cancelled'
            return { status: controller.signal.reason === 'timeout' ? 504 : 409, body: { code: controller.signal.reason === 'timeout' ? 'TIMEOUT' : 'CANCELLED', message: controller.signal.reason === 'timeout' ? '模型响应超时；没有保存任何任务。' : '已取消本次生成；没有保存任何任务。' } }
          }
          current.state = 'failed'
          const validation = error instanceof Error && (error.message.startsWith('INVALID_PROPOSAL') || error.name === 'ZodError')
          return { status: 502, body: { code: validation ? 'INVALID_PROPOSAL' : 'UPSTREAM_FAILED', message: validation ? '模型草案未通过引用或结构校验，请调整描述后重试。' : '阿里通义请求失败，请检查 Key、地区、模型权限或网络。没有自动重试收费请求。' } }
        } finally { concurrent--; clearTimeout(timeout); current.expires = Date.now() + 300000 }
      })()
      runs.set(requestId, current)
      run = current
    }
    // A disconnected JSON request cancels best-effort. The explicit cancel endpoint also
    // handles browser abort races; neither path ever writes to a local workspace.
    const active = run
    const disconnected = () => { if (!reply.raw.writableEnded && active.state === 'running') active.controller.abort('disconnect') }
    reply.raw.on('close', disconnected)
    const result = await run.promise
    reply.raw.off('close', disconnected)
    return reply.code(result.status).send(result.body)
  })
  app.post<{ Params: { id: string } }>('/api/agent/:id/cancel', async (request, reply) => {
    const run = runs.get(request.params.id)
    if (!run) return reply.code(404).send({ code: 'NOT_FOUND', message: '运行不存在或已过期。' })
    if (run.state === 'running') run.controller.abort('user')
    return { state: run.state === 'completed' ? 'completed' : 'cancelled', message: '停止生成不撤销已经在客户端确认的操作。' }
  })
  registerVoice(app, config)
  app.setErrorHandler((error, _request, reply) => {
    const code = error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500
    reply.code(code).send({ code: code === 413 ? 'PAYLOAD_LIMIT' : 'REQUEST_FAILED', message: code === 413 ? '输入太大，请缩小范围后再试。' : '请求无法处理。' })
  })
  app.addHook('preClose', async () => { for (const run of runs.values()) if (run.state === 'running') run.controller.abort('shutdown') })
  app.addHook('onClose', async () => { runs.clear() })
  return app
}
