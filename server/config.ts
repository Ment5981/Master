export interface GatewayConfig {
  apiKey: string
  model: string
  baseURL: string
  asrURL: string
  asrModel: string
  asrProxyURL: string
  bearer: string
  origins: string[]
  port: number
  requestTimeoutMs: number
  maxConcurrent: number
  maxRequestsPerHour: number
  structuredOutputs: boolean
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const integer = (value: string | undefined, fallback: number, min: number, max: number) => {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback
  }
  return {
    apiKey: env.DASHSCOPE_API_KEY?.trim() ?? '',
    model: env.QWEN_MODEL?.trim() || 'qwen-plus',
    baseURL: env.QWEN_BASE_URL?.trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    asrURL: env.QWEN_ASR_URL?.trim() || 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime',
    asrModel: env.QWEN_ASR_MODEL?.trim() || 'qwen3-asr-flash-realtime',
    asrProxyURL: env.QWEN_HTTPS_PROXY?.trim() || env.HTTPS_PROXY?.trim() || env.HTTP_PROXY?.trim() || env.ALL_PROXY?.trim() || '',
    bearer: env.MASTER_GATEWAY_TOKEN?.trim() ?? '',
    origins: (env.MASTER_ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173').split(',').map(s => s.trim()).filter(Boolean),
    port: integer(env.MASTER_GATEWAY_PORT, 4318, 1024, 65535),
    requestTimeoutMs: integer(env.MASTER_AI_TIMEOUT_MS, 60000, 1000, 120000),
    maxConcurrent: integer(env.MASTER_AI_CONCURRENCY, 2, 1, 8),
    maxRequestsPerHour: integer(env.MASTER_AI_REQUESTS_PER_HOUR, 60, 1, 500),
    structuredOutputs: env.QWEN_JSON_SCHEMA === 'true',
  }
}
