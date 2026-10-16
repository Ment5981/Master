import Dexie, { type Table } from 'dexie'
import type { CommitRequest, Receipt, Repository, Workspace } from '../core/types'
import { commandLabel, createEmptyWorkspace, digestText, DomainError, ENTITY_TABLES, entityDiff, inverseFor, newId, reduceCommand, restoreInverse, stableStringify, validateWorkspace, workspaceMeta, type WorkspaceInverse } from '../core/runtime.mjs'

interface MetaRow { key: 'workspace'; value: ReturnType<typeof workspaceMeta> }
interface OperationRow { operationId: string; digest: string; receipt: Receipt }
interface HistoryRow { seq?: number; operationId: string; headRevision: number; inverse: WorkspaceInverse; undone: 0 | 1 }
interface DesktopBridge {
  load(): Promise<Workspace>
  execute(request: CommitRequest): Promise<{ workspace: Workspace; receipt: Receipt }>
  undo(expectedRevision?: number): Promise<{ workspace: Workspace; receipt: Receipt }>
  export(): Promise<string>
  subscribe?(callback: () => void): () => void
}
export interface RepositoryOptions { databaseName?: string; initialWorkspace?: Workspace; memory?: boolean }
export type MasterRepository = Repository & { close(): void }
class WorkspaceDB extends Dexie {
  meta!: Table<MetaRow, string>
  operations!: Table<OperationRow, string>
  history!: Table<HistoryRow, number>
  constructor(name: string) {
    super(name)
    this.version(1).stores({ meta: '&key', operations: '&operationId', history: '++seq,operationId,undone', goals: '&id', nodes: '&id,goalId,parentId', tasks: '&id,goalId,nodeId,status,sourceId', allocations: '&id,taskId,date,[taskId+date]', timeEntries: '&id,taskId,date', capacities: '&date', reviews: '&id,start,end', sources: '&id,digest', proposals: '&id,state' })
  }
}
const invalid = (code: string, message: string): never => { throw new DomainError(code, message) }
const notifyListeners = (listeners: Set<() => void>) => { for (const listener of listeners) { try { listener() } catch { /* Observer errors must not turn a committed write into a save failure. */ } } }
const requestDigest = (request: CommitRequest) => {
  if (!request || typeof request.operationId !== 'string' || !request.operationId || !Number.isInteger(request.expectedRevision)) return invalid('INVALID_REQUEST', '操作标识或版本无效')
  return digestText(stableStringify(request.command))
}
const receiptFor = (request: CommitRequest, workspace: Workspace): Receipt => ({ operationId: request.operationId, revision: workspace.revision, label: commandLabel(request.command), at: new Date().toISOString() })

export function createRepository(options: RepositoryOptions = {}): MasterRepository {
  const bridge = (globalThis as { window?: { masterV2?: DesktopBridge } }).window?.masterV2
  if (bridge && !options.databaseName && !options.memory && !options.initialWorkspace) return desktopRepository(bridge)
  if (options.memory) return memoryRepository(options.initialWorkspace)
  const db = new WorkspaceDB(options.databaseName || 'master-v2')
  const initial = structuredClone(options.initialWorkspace || createEmptyWorkspace())
  validateWorkspace(initial)
  const listeners = new Set<() => void>()
  let knownRevision: number | undefined
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(`master-workspace:${db.name}`) : null
  if (channel) channel.onmessage = () => notifyListeners(listeners)
  const notify = () => { notifyListeners(listeners); try { channel?.postMessage('committed') } catch { /* A closed observer cannot invalidate the commit. */ } }
  const read = async (): Promise<Workspace> => {
    const meta = await db.meta.get('workspace')
    if (!meta) {
      await db.meta.put({ key: 'workspace', value: workspaceMeta(initial) })
      for (const table of ENTITY_TABLES) if (initial[table].length) await db.table(table).bulkPut(initial[table])
      return structuredClone(initial)
    }
    const entries = await Promise.all(ENTITY_TABLES.map(async table => [table, await db.table(table).toArray()] as const))
    return validateWorkspace({ ...meta.value, ...Object.fromEntries(entries) } as Workspace)
  }
  const write = async (before: Workspace, after: Workspace) => {
    const changes = entityDiff(before, after)
    for (const table of ENTITY_TABLES) {
      if (changes[table].remove.length) await db.table(table).bulkDelete(changes[table].remove)
      if (changes[table].put.length) await db.table(table).bulkPut(changes[table].put)
    }
    await db.meta.put({ key: 'workspace', value: workspaceMeta(after) })
  }
  return {
    async load() { const result = await db.transaction('rw', db.tables, read); knownRevision = result.revision; return result },
    async execute(request) {
      const digest = requestDigest(request)
      const result = await db.transaction('rw', db.tables, async () => {
        const current = await read()
        const previous = await db.operations.get(request.operationId)
        if (previous) { if (previous.digest !== digest) return invalid('IDEMPOTENCY_CONFLICT', '同一操作 ID 不能用于不同内容'); return { workspace: current, receipt: previous.receipt } }
        if (current.revision !== request.expectedRevision) return invalid('REVISION_CONFLICT', '工作区已被修改，请刷新后重新操作')
        const workspace = reduceCommand(current, request.command)
        const receipt = receiptFor(request, workspace)
        if (workspace.revision !== current.revision) {
          await write(current, workspace)
          await db.history.add({ operationId: request.operationId, headRevision: workspace.revision, inverse: inverseFor(current, workspace), undone: 0 })
        }
        await db.operations.add({ operationId: request.operationId, digest, receipt })
        return { workspace, receipt }
      })
      knownRevision = result.workspace.revision; notify(); return result
    },
    async undo() {
      if (knownRevision === undefined) return invalid('REVISION_CONFLICT', '请先读取工作区再撤销')
      const expectedRevision = knownRevision
      const result = await db.transaction('rw', db.tables, async () => {
        const current = await read()
        if (current.revision !== expectedRevision) return invalid('REVISION_CONFLICT', '其他窗口已修改，不能覆盖新的内容')
        const history = await db.history.orderBy('seq').reverse().filter(row => row.undone === 0).first()
        if (!history) return invalid('NOTHING_TO_UNDO', '没有可撤销的操作')
        if (history.headRevision !== current.revision) return invalid('UNDO_CONFLICT', '该操作之后有新修改，不能直接撤销')
        const workspace = restoreInverse(current, history.inverse)
        const receipt: Receipt = { operationId: newId(), revision: workspace.revision, label: '撤销上一步', at: new Date().toISOString() }
        await write(current, workspace)
        await db.history.update(history.seq!, { undone: 1 })
        const prior = await db.history.orderBy('seq').reverse().filter(row => row.undone === 0).first()
        if (prior) await db.history.update(prior.seq!, { headRevision: workspace.revision })
        await db.operations.add({ operationId: receipt.operationId, digest: digestText(`undo:${history.operationId}`), receipt })
        return { workspace, receipt }
      })
      knownRevision = result.workspace.revision; notify(); return result
    },
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback) },
    async export() { const workspace = await db.transaction('rw', db.tables, read); return JSON.stringify(workspace, null, 2) },
    close() { db.close(); channel?.close(); listeners.clear() },
  }
}

function desktopRepository(bridge: DesktopBridge): MasterRepository {
  let knownRevision: number | undefined
  const listeners = new Set<() => void>()
  const unsubscribe = bridge.subscribe?.(() => notifyListeners(listeners))
  return {
    async load() { const workspace = validateWorkspace(await bridge.load()); knownRevision = workspace.revision; return workspace },
    async execute(request) { const result = await bridge.execute(request); knownRevision = result.workspace.revision; notifyListeners(listeners); return result },
    async undo() { if (knownRevision === undefined) return invalid('REVISION_CONFLICT', '请先读取工作区再撤销'); const result = await bridge.undo(knownRevision); knownRevision = result.workspace.revision; notifyListeners(listeners); return result },
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback) },
    export: () => bridge.export(),
    close() { unsubscribe?.(); listeners.clear() },
  }
}

function memoryRepository(initial?: Workspace): MasterRepository {
  let state = structuredClone(initial || createEmptyWorkspace()); validateWorkspace(state)
  const operations = new Map<string, OperationRow>(), history: HistoryRow[] = [], listeners = new Set<() => void>()
  let knownRevision: number | undefined, tail: Promise<unknown> = Promise.resolve()
  const exclusive = <T>(fn: () => T): Promise<T> => { const pending = tail.then(fn); tail = pending.then(() => undefined, () => undefined); return pending }
  return {
    load: () => exclusive(() => { knownRevision = state.revision; return structuredClone(state) }),
    execute: request => exclusive(() => {
      const digest = requestDigest(request), previous = operations.get(request.operationId)
      if (previous) { if (previous.digest !== digest) return invalid('IDEMPOTENCY_CONFLICT', '同一操作 ID 不能用于不同内容'); knownRevision = state.revision; return { workspace: structuredClone(state), receipt: structuredClone(previous.receipt) } }
      if (state.revision !== request.expectedRevision) return invalid('REVISION_CONFLICT', '工作区版本已改变')
      const next = reduceCommand(state, request.command), receipt = receiptFor(request, next)
      if (next.revision !== state.revision) history.push({ operationId: request.operationId, headRevision: next.revision, inverse: inverseFor(state, next), undone: 0 })
      state = next; operations.set(request.operationId, { operationId: request.operationId, digest, receipt }); knownRevision = state.revision
      notifyListeners(listeners); return { workspace: structuredClone(state), receipt }
    }),
    undo: () => exclusive(() => {
      if (knownRevision !== state.revision) return invalid('REVISION_CONFLICT', '工作区版本已改变')
      const previous = history.findLast(row => row.undone === 0)
      if (!previous) return invalid('NOTHING_TO_UNDO', '没有可撤销的操作')
      if (previous.headRevision !== state.revision) return invalid('UNDO_CONFLICT', '不能覆盖后续修改')
      state = restoreInverse(state, previous.inverse); previous.undone = 1
      const prior = history.findLast(row => row.undone === 0); if (prior) prior.headRevision = state.revision
      knownRevision = state.revision; notifyListeners(listeners)
      return { workspace: structuredClone(state), receipt: { operationId: newId(), revision: state.revision, label: '撤销上一步', at: new Date().toISOString() } }
    }),
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback) },
    export: () => exclusive(() => JSON.stringify(state, null, 2)),
    close() { listeners.clear() },
  }
}
