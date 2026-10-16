import { createGateway } from './app'
import { readConfig } from './config'

const config = readConfig()
const app = await createGateway({ config })
await app.listen({ host: '127.0.0.1', port: config.port })
process.stdout.write(`Master local gateway: http://127.0.0.1:${config.port} (${config.apiKey ? 'provider configured, not verified' : 'API key not configured'})\n`)
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)) })
