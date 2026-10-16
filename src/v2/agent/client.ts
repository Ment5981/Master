import type { AgentInput, GatewayHealth, Proposal } from '../core/types'
import pcmWorkletUrl from './pcm-worklet.js?url&no-inline'
import { getGatewayConnection } from './connection'
export { configureGateway, configureDesktopGateway } from './connection'

const headers = (connection = getGatewayConnection()) => ({ 'Content-Type': 'application/json', ...(connection.token ? { Authorization: `Bearer ${connection.token}` } : {}) })
async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof body?.message === 'string' ? body.message : `网关请求失败 (${response.status})`)
  return body as T
}
export async function getHealth(options: { signal?: AbortSignal } = {}): Promise<GatewayHealth> {
  return readResponse<GatewayHealth>(await fetch(`${getGatewayConnection().url}/api/health`, { signal: options.signal ?? AbortSignal.timeout(4000) }))
}
export async function generateProposal(input: AgentInput, options: { signal?: AbortSignal; onStatus?: (status: string) => void } = {}): Promise<Proposal> {
  options.signal?.throwIfAborted()
  const requestId = crypto.randomUUID()
  const connection = getGatewayConnection()
  const url = connection.url
  const auth = headers(connection)
  const cancel = () => { void fetch(`${url}/api/agent/${requestId}/cancel`, { method: 'POST', headers: auth, body: '{}', keepalive: true }).catch(() => undefined) }
  options.signal?.addEventListener('abort', cancel, { once: true })
  try {
    options.onStatus?.('正在理解你的安排…')
    const response = await fetch(`${url}/api/agent`, { method: 'POST', headers: { ...auth, 'X-Request-ID': requestId }, body: JSON.stringify(input), signal: options.signal })
    options.signal?.throwIfAborted()
    const proposal = await readResponse<Proposal>(response)
    if (!proposal || proposal.engine !== 'remote' || proposal.state !== 'draft' || proposal.inputRevision !== input.inputRevision || proposal.baseRevision !== input.workspace.revision || !Array.isArray(proposal.tasks)) throw new Error('网关提案与当前输入不匹配，请重新生成。')
    options.signal?.throwIfAborted()
    options.onStatus?.(proposal.question ? '有一个问题需要确认' : '草案已生成，等待你确认')
    return proposal
  } finally { options.signal?.removeEventListener('abort', cancel) }
}

export interface VoiceOptions {
  signal?: AbortSignal
  onTranscript: (text: string, final: boolean) => void
  onStatus?: (status: string) => void
  onError?: (error: Error) => void
}
export interface VoiceSession { stop(): Promise<string>; cancel(): void }

/** Opens one explicit microphone session. Text is not submitted to the planner here. */
export async function startVoice(options: VoiceOptions): Promise<VoiceSession> {
  options.signal?.throwIfAborted()
  const connection = getGatewayConnection()
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) throw new Error('当前环境不支持麦克风采集，请使用 HTTPS、本机页面或文字输入。')
  let stream: MediaStream | undefined
  let context: AudioContext | undefined
  let source: MediaStreamAudioSourceNode | undefined
  let node: AudioWorkletNode | undefined
  let socket: WebSocket | undefined
  let stopped = false
  let closed = false
  let cancelled = false
  let lastFailure: Error | undefined
  let finishTimeout: ReturnType<typeof setTimeout> | undefined
  let flushResolve: (() => void) | undefined
  let readyResolve: (() => void) | undefined
  let readyReject: ((error: Error) => void) | undefined
  let doneResolve: ((value: string) => void) | undefined
  let doneReject: ((error: Error) => void) | undefined
  const sentences = new Map<string, { text: string; final: boolean }>()
  const allText = () => [...sentences.values()].map(s => s.text).filter(Boolean).join('')
  const finalText = () => [...sentences.values()].filter(s => s.final).map(s => s.text).join('')
  const done = new Promise<string>((resolve, reject) => { doneResolve = resolve; doneReject = reject })
  void done.catch(() => undefined) // stop() still receives the rejection, never an unhandled promise.
  const cleanupAudio = () => {
    stream?.getTracks().forEach(track => track.stop())
    source?.disconnect()
  }
  const cleanup = () => {
    if (closed) return
    closed = true
    cleanupAudio()
    node?.disconnect()
    node?.port.close()
    if (context && context.state !== 'closed') void context.close().catch(() => undefined)
    clearTimeout(finishTimeout)
    options.signal?.removeEventListener('abort', cancel)
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close()
  }
  const fail = (error: Error) => {
    if (closed) return
    lastFailure = error
    readyReject?.(error)
    doneReject?.(error)
    cleanup()
    options.onError?.(error)
  }
  const cancel = () => {
    if (closed) return
    cancelled = true
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'cancel' }))
    const error = new DOMException('已取消录音', 'AbortError')
    readyReject?.(error)
    doneReject?.(error)
    cleanup()
    options.onStatus?.('已取消录音')
  }
  options.signal?.addEventListener('abort', cancel, { once: true })
  try {
    options.onStatus?.('等待麦克风权限…')
    stopSpeaking()
    context = new AudioContext({ latencyHint: 'interactive' })
    void context.resume().catch(() => undefined)
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
    if (cancelled || options.signal?.aborted) { stream.getTracks().forEach(track => track.stop()); throw new DOMException('已取消录音', 'AbortError') }
    const result = await readResponse<{ ticket: string }>(await fetch(`${connection.url}/api/voice/ticket`, { method: 'POST', headers: headers(connection), body: '{}', signal: options.signal }))
    if (cancelled) throw new DOMException('已取消录音', 'AbortError')
    options.onStatus?.('正在连接实时语音…')
    const wsUrl = new URL(`${connection.url}/api/voice`)
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    socket = new WebSocket(wsUrl)
    socket.binaryType = 'arraybuffer'
    const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject })
    const connectTimeout = setTimeout(() => fail(new Error('实时语音连接超时。')), 15000)
    socket.onopen = () => socket?.send(JSON.stringify({ type: 'auth', ticket: result.ticket }))
    socket.onmessage = event => {
      if (closed || cancelled) return
      let message: { type: string; text?: string; final?: boolean; itemId?: string; message?: string }
      try { message = JSON.parse(event.data) } catch { return fail(new Error('语音服务消息格式错误。')) }
      if (message.type === 'ready') readyResolve?.()
      if (message.type === 'transcript' && typeof message.text === 'string' && typeof message.itemId === 'string') {
        sentences.set(message.itemId, { text: message.text, final: message.final === true })
        options.onTranscript(allText(), message.final === true)
      }
      if (message.type === 'finished') { doneResolve?.(finalText()); options.onStatus?.('转写已完成，可编辑后发送'); cleanup() }
      if (message.type === 'error') fail(new Error(message.message || '实时语音失败。'))
    }
    socket.onerror = () => fail(new Error('无法连接实时语音网关，请检查设置。'))
    socket.onclose = () => { if (!closed) fail(new Error('语音连接提前断开，已保留收到的文字。')) }
    try { await ready } finally { clearTimeout(connectTimeout) }
    if (cancelled) throw new DOMException('已取消录音', 'AbortError')
    // A real same-origin asset: Blob/data script URLs are rejected by desktop CSP.
    await context.audioWorklet.addModule(pcmWorkletUrl)
    if (cancelled) throw new DOMException('已取消录音', 'AbortError')
    node = new AudioWorkletNode(context, 'master-pcm16', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] })
    node.port.onmessage = event => {
      if (event.data?.type === 'flushed') { flushResolve?.(); return }
      if (event.data instanceof ArrayBuffer && socket?.readyState === WebSocket.OPEN && !closed) {
        if (socket.bufferedAmount > 64000) return fail(new Error('网络发送过慢，录音已停止。'))
        socket.send(event.data)
      }
    }
    source = context.createMediaStreamSource(stream)
    source.connect(node)
    node.connect(context.destination) // The processor writes silence, not microphone feedback.
    await context.resume()
    if (context.state !== 'running') throw new Error('音频设备未能启动，请再次点击录音。')
    options.onStatus?.('正在聆听 · 音频发送至阿里通义')
    return {
      cancel,
      stop: async () => {
        if (lastFailure) throw lastFailure
        if (closed) return done
        if (!stopped) {
          stopped = true
          cleanupAudio()
          options.onStatus?.('正在确认最后一句…')
          await Promise.race([new Promise<void>(resolve => { flushResolve = resolve; node?.port.postMessage({ type: 'flush' }) }), new Promise<void>(resolve => setTimeout(resolve, 300))])
          node?.disconnect()
          if (socket?.readyState === WebSocket.OPEN && !closed) socket.send(JSON.stringify({ type: 'finish' }))
          finishTimeout = setTimeout(() => fail(new Error('最终转写超时，请检查已显示的文字。')), 14000)
        }
        return done
      },
    }
  } catch (error) {
    cleanup()
    throw error
  }
}

/** OS/browser synthesis, not Alibaba cloud TTS. Never speaks more than a short summary. */
export function speakText(text: string) {
  if (!('speechSynthesis' in window)) return false
  stopSpeaking()
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 300))
  utterance.lang = 'zh-CN'
  utterance.rate = 1.05
  window.speechSynthesis.speak(utterance)
  return true
}
export function stopSpeaking() { if ('speechSynthesis' in window) window.speechSynthesis.cancel() }
