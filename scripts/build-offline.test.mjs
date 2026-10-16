import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { createServiceWorkerSource } from './build-offline.mjs'

function worker() {
  const listeners = new Map()
  const cached = { status: 200, marker: 'public-build-asset' }
  const match = vi.fn(async (key, options) => typeof key === 'string' && options?.ignoreVary ? cached : undefined)
  const addAll = vi.fn(async () => undefined)
  const remove = vi.fn(async () => true)
  const fetch = vi.fn(async () => { throw new Error('offline') })
  const claim = vi.fn(async () => undefined)
  const caches = { open: vi.fn(async () => ({ match, addAll })), keys: vi.fn(async () => ['master-shell-v2-old', 'master-shell-v2-test', 'unrelated-app']), delete: remove }
  vm.runInNewContext(createServiceWorkerSource('master-shell-v2-test', ['./index.html', './assets/app.js', './assets/app.css', './assets/GoalMap.js']), {
    URL, caches, fetch,
    self: { registration: { scope: 'https://master.example/app/' }, location: { origin: 'https://master.example' }, clients: { claim }, addEventListener: (name, listener) => listeners.set(name, listener) },
  })
  const dispatch = (url, mode = 'cors', method = 'GET') => {
    const respondWith = vi.fn()
    listeners.get('fetch')({ request: { url, mode, method, headers: { Origin: 'https://master.example' } }, respondWith })
    return respondWith
  }
  return { listeners, dispatch, match, addAll, fetch, claim, remove, cached }
}

describe('Production offline shell boundaries', () => {
  it('precaches every build asset, including lazy modules never opened online', async () => {
    const test = worker(), waitUntil = vi.fn()
    test.listeners.get('install')({ waitUntil })
    await waitUntil.mock.calls[0][0]
    expect(test.addAll).toHaveBeenCalledWith(['https://master.example/app/index.html', 'https://master.example/app/assets/app.js', 'https://master.example/app/assets/app.css', 'https://master.example/app/assets/GoalMap.js'])
  })
  it('matches a public module by URL ignoring Origin variance, not the incoming request', async () => {
    const test = worker(), response = test.dispatch('https://master.example/app/assets/app.js')
    expect(await response.mock.calls[0][0]).toBe(test.cached)
    expect(test.match).toHaveBeenCalledWith('https://master.example/app/assets/app.js', { ignoreVary: true })
    expect(test.fetch).not.toHaveBeenCalled()
  })
  it('serves offline navigation from the scope-specific index', async () => {
    const test = worker(), response = test.dispatch('https://master.example/app/plan', 'navigate')
    expect(await response.mock.calls[0][0]).toBe(test.cached)
    expect(test.match).toHaveBeenCalledWith('https://master.example/app/index.html', { ignoreVary: true })
  })
  it('never responds to API fetch or navigation, including a subpath deployment', () => {
    const test = worker()
    for (const path of ['/api', '/api/agent', '/app/api/health']) for (const mode of ['cors', 'navigate']) expect(test.dispatch(`https://master.example${path}`, mode)).not.toHaveBeenCalled()
    expect(test.match).not.toHaveBeenCalled()
  })
  it('does not intercept remote, non-manifest, query-modified or non-GET resources', () => {
    const test = worker()
    for (const url of ['https://external.example/app/assets/app.js', 'https://master.example/app/private.json', 'https://master.example/app/assets/app.js?private=1']) expect(test.dispatch(url)).not.toHaveBeenCalled()
    expect(test.dispatch('https://master.example/app/assets/app.js', 'cors', 'POST')).not.toHaveBeenCalled()
  })
  it('activation deletes only old Master caches and claims the fresh client', async () => {
    const test = worker(), waitUntil = vi.fn()
    test.listeners.get('activate')({ waitUntil })
    await waitUntil.mock.calls[0][0]
    expect(test.remove).toHaveBeenCalledExactlyOnceWith('master-shell-v2-old')
    expect(test.claim).toHaveBeenCalledTimes(1)
  })
})
