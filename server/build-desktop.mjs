import { build } from 'esbuild'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
await build({
  entryPoints: [resolve(root, 'server/electron.ts')],
  outfile: resolve(root, 'electron/gateway.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  packages: 'external',
  sourcemap: false,
  logLevel: 'warning',
})
