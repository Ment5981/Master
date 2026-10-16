import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import WebSocket from 'ws'
import type { GatewayConfig } from './config'

interface Ticket { expires: number; owner: string; origin: string | undefined }
export function registerVoice(app: FastifyInstance, config: GatewayConfig) {
  const tickets = new Map<string, Ticket>()
  const clients = new Set<WebSocket>()
  let sessions = 0
  app.post('/api/voice/ticket', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!config.apiKey) return reply.code(503).send({ code: 'NOT_CONFIGURED', message: '尚未配置阿里通义 API Key，语音不会发送。' })
    for (const [key, value] of tickets) if (value.expires < Date.now()) tickets.delete(key)
    if (tickets.size >= 20 || sessions >= 2) return reply.code(429).send({ code: 'VOICE_BUSY', message: '语音会话已满，请先停止已有录音。' })
    const ticket = randomUUID()
    const expires = Date.now() + 15000
    tickets.set(ticket, { expires, owner: request.ip, origin: request.headers.origin })
    return { ticket, expiresAt: new Date(expires).toISOString(), sampleRate: 16000, maxSeconds: 120 }
  })

  app.get('/api/voice', { websocket: true }, (socket, request) => {
    clients.add(socket)
    let upstream: WebSocket | undefined
    let authorized = false
    let configured = false
    let finishing = false
    let ended = false
    let audioBytes = 0
    const started = Date.now()
    let lastAudio = Date.now()
    let windowAt = Date.now()
    let windowBytes = 0
    let messages = 0
    let finishTimer: ReturnType<typeof setTimeout> | undefined
    const send = (value: object) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)) }
    const cleanup = () => {
      if (ended) return
      ended = true
      clearTimeout(authTimer)
      clearInterval(guard)
      clearTimeout(finishTimer)
      if (authorized) sessions--
      clients.delete(socket)
      if (upstream && upstream.readyState !== WebSocket.CLOSED) upstream.terminate()
    }
    const fail = (code: string, message: string, closeCode = 1008) => {
      send({ type: 'error', code, message })
      socket.close(closeCode, code)
      cleanup()
    }
    const authTimer = setTimeout(() => fail('AUTH_TIMEOUT', '语音授权已超时。'), 3000)
    const guard = setInterval(() => {
      if (Date.now() - started > 120000) fail('VOICE_LIMIT', '单次录音最多两分钟，请继续新一段。')
      else if (authorized && !finishing && Date.now() - lastAudio > 15000) fail('VOICE_IDLE', '长时间没有收到音频，已停止语音。')
    }, 1000)
    const upstreamSend = (type: string, body: Record<string, unknown> = {}) => {
      if (upstream?.readyState === WebSocket.OPEN) upstream.send(JSON.stringify({ event_id: randomUUID(), type, ...body }))
    }

    socket.on('message', (raw, isBinary) => {
      if (ended) return
      if (Date.now() - windowAt > 1000) { windowAt = Date.now(); windowBytes = 0; messages = 0 }
      if (++messages > 80) return fail('RATE_LIMIT', '语音发送过快。')
      if (isBinary) {
        const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer)
        if (!authorized || !configured || finishing) return fail('VOICE_STATE', '语音尚未准备好或已结束。')
        if (chunk.length < 2 || chunk.length > 6400 || chunk.length % 2 !== 0) return fail('AUDIO_FORMAT', '需要单声道 16kHz PCM16 音频帧。')
        audioBytes += chunk.length
        windowBytes += chunk.length
        if (windowBytes > 64000 || audioBytes > 16000 * 2 * 120 || audioBytes > ((Date.now() - started) / 1000 + 2) * 32000) return fail('AUDIO_LIMIT', '音频超过速率或时长限制。')
        if ((upstream?.bufferedAmount ?? 0) > 128000 || socket.bufferedAmount > 128000) return fail('BACKPRESSURE', '网络过慢，已停止音频发送。')
        lastAudio = Date.now()
        upstreamSend('input_audio_buffer.append', { audio: chunk.toString('base64') })
        return
      }
      if (raw.toString().length > 1000) return fail('MESSAGE_LIMIT', '语音控制消息过大。')
      let message: { type?: string; ticket?: string }
      try { message = JSON.parse(raw.toString()) } catch { return fail('INVALID_MESSAGE', '语音消息格式错误。') }
      if (!authorized) {
        const ticket = typeof message.ticket === 'string' ? tickets.get(message.ticket) : undefined
        if (message.type !== 'auth' || !ticket || ticket.expires < Date.now() || ticket.owner !== request.ip || ticket.origin !== request.headers.origin || sessions >= 2) return fail('UNAUTHORIZED', '语音授权无效或已过期。')
        tickets.delete(message.ticket!)
        authorized = true
        sessions++
        clearTimeout(authTimer)
        const url = new URL(config.asrURL)
        url.searchParams.set('model', config.asrModel)
        upstream = new WebSocket(url, { headers: { Authorization: `Bearer ${config.apiKey}` }, handshakeTimeout: 10000, maxPayload: 128000 })
        upstream.on('open', () => {
          if (ended) return upstream?.terminate()
          upstreamSend('session.update', { session: { input_audio_format: 'pcm', sample_rate: 16000, input_audio_transcription: { language: 'zh' }, turn_detection: { type: 'server_vad', threshold: 0, silence_duration_ms: 700 } } })
        })
        upstream.on('message', data => {
          if (ended) return
          let event: Record<string, unknown>
          try { event = JSON.parse(data.toString()) } catch { return fail('UPSTREAM_PROTOCOL', '语音服务返回了无效数据。', 1011) }
          const type = event.type
          if (type === 'session.updated') { configured = true; send({ type: 'ready', sampleRate: 16000 }) }
          if (type === 'conversation.item.input_audio_transcription.text') send({ type: 'transcript', itemId: event.item_id, text: `${typeof event.text === 'string' ? event.text : ''}${typeof event.stash === 'string' ? event.stash : ''}`, final: false })
          if (type === 'conversation.item.input_audio_transcription.completed') send({ type: 'transcript', itemId: event.item_id, text: typeof event.transcript === 'string' ? event.transcript : '', final: true })
          if (type === 'error' || type === 'conversation.item.input_audio_transcription.failed') fail('ASR_FAILED', '语音识别失败，请检查服务区域、模型权限或稍后重试。', 1011)
          if (type === 'session.finished') { send({ type: 'finished' }); socket.close(1000, 'finished'); cleanup() }
        })
        upstream.on('error', () => fail('ASR_CONNECTION', '无法连接阿里实时语音，请检查服务配置和网络。', 1011))
        upstream.on('close', () => { if (!ended) fail('ASR_CLOSED', '语音连接提前结束，已保留收到的文字。', 1011) })
        return
      }
      if (message.type === 'cancel') { send({ type: 'cancelled' }); socket.close(1000, 'cancelled'); cleanup(); return }
      if (message.type === 'finish' && configured && !finishing) {
        finishing = true
        upstreamSend('session.finish')
        finishTimer = setTimeout(() => fail('ASR_TIMEOUT', '等待最终转写超时，已保留收到的文字。', 1011), 12000)
        return
      }
      fail('INVALID_MESSAGE', '不支持的语音控制指令。')
    })
    socket.on('close', cleanup)
    socket.on('error', cleanup)
  })
  app.addHook('preClose', async () => { for (const socket of clients) socket.terminate(); tickets.clear() })
}
