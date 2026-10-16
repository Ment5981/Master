import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat()
}
export function createServiceWorkerSource(cache, assets) {
  return `const CACHE = ${JSON.stringify(cache)};
const ASSETS = ${JSON.stringify(assets)};
const urls = ASSETS.map(asset => new URL(asset, self.registration.scope).href);
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('master-shell-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Never return the app shell for API navigation or retain private API responses.
  if (/\\/api(?:\\/|$)/.test(url.pathname)) return;
  if (url.origin !== self.location.origin || (!urls.includes(url.href) && event.request.mode !== 'navigate')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // These are same-origin, build-pinned public assets. Module/style requests can
    // include Origin where install-time addAll requests did not (Vary: Origin).
    // Match the manifest URL, not transient request headers; never do this for APIs.
    const cached = await cache.match(event.request.mode === 'navigate' ? new URL('./index.html', self.registration.scope).href : url.href, { ignoreVary: true });
    return cached || fetch(event.request);
  })());
});
`
}

export async function buildOffline(dist = path.resolve('dist')) {
  const paths = (await files(dist)).filter(file => !file.endsWith('sw.js') && !file.endsWith('.map')).sort()
  const assets = paths.map(file => './' + path.relative(dist, file).replaceAll('\\', '/'))
  const hash = createHash('sha256').update('master-offline-shell-v3\0')
  for (const file of paths) hash.update(await readFile(file))
  const cache = 'master-shell-v2-' + hash.digest('hex').slice(0, 16)
  await writeFile(path.join(dist, 'sw.js'), createServiceWorkerSource(cache, assets))
  console.log(`Offline shell: ${assets.length} assets, ${cache}`)
  return { cache, assets }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildOffline()
