const { DatabaseSync } = require('node:sqlite')
const { mkdirSync } = require('node:fs')
const path = require('node:path')

/**
 * IPC contract (all methods may be awaited):
 * load() -> Workspace
 * execute({operationId,expectedRevision,command}) -> {workspace,receipt}
 * undo(expectedRevision: number) -> {workspace,receipt}
 * export() -> JSON string; close() -> void
 * Main must validate IPC sender. Expose only these methods through preload;
 * renderer never chooses a filesystem path or executes SQL.
 */
async function createV2Storage({ filePath, initialWorkspace } = {}) {
  if (typeof filePath !== 'string' || !filePath) throw new Error('An explicit database filePath is required')
  const core = await import('../src/v2/core/runtime.mjs')
  if (filePath !== ':memory:') mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true })
  const db = new DatabaseSync(filePath)
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
  db.exec(`CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entities (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(collection,id));
    CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, digest TEXT NOT NULL, receipt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS history (seq INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT NOT NULL, head_revision INTEGER NOT NULL, undone INTEGER NOT NULL DEFAULT 0, inverse TEXT NOT NULL);`)
  const metaGet = db.prepare('SELECT data FROM metadata WHERE key=?')
  const metaPut = db.prepare('INSERT INTO metadata(key,data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data')
  const entitiesGet = db.prepare('SELECT data FROM entities WHERE collection=? ORDER BY rowid')
  const entityPut = db.prepare('INSERT INTO entities(collection,id,data) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data')
  const entityDelete = db.prepare('DELETE FROM entities WHERE collection=? AND id=?')
  const operationGet = db.prepare('SELECT digest,receipt FROM operations WHERE id=?')
  const operationPut = db.prepare('INSERT INTO operations(id,digest,receipt) VALUES(?,?,?)')
  const historyPut = db.prepare('INSERT INTO history(operation_id,head_revision,inverse) VALUES(?,?,?)')
  const historyTop = db.prepare('SELECT * FROM history WHERE undone=0 ORDER BY seq DESC LIMIT 1')
  let knownRevision
  const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result } catch (error) { db.exec('ROLLBACK'); throw error } }
  const read = () => {
    const meta = metaGet.get('workspace')
    if (!meta) {
      const workspace = core.validateWorkspace(structuredClone(initialWorkspace || core.createEmptyWorkspace()))
      metaPut.run('workspace', JSON.stringify(core.workspaceMeta(workspace)))
      for (const table of core.ENTITY_TABLES) for (const row of workspace[table]) entityPut.run(table, core.entityKey(table, row), JSON.stringify(row))
      return workspace
    }
    const workspace = JSON.parse(meta.data)
    for (const table of core.ENTITY_TABLES) workspace[table] = entitiesGet.all(table).map(row => JSON.parse(row.data))
    return core.validateWorkspace(workspace)
  }
  const write = (before, after) => {
    const changes = core.entityDiff(before, after)
    for (const table of core.ENTITY_TABLES) {
      for (const id of changes[table].remove) entityDelete.run(table, id)
      for (const row of changes[table].put) entityPut.run(table, core.entityKey(table, row), JSON.stringify(row))
    }
    metaPut.run('workspace', JSON.stringify(core.workspaceMeta(after)))
  }
  return {
    load() { const workspace = tx(read); knownRevision = workspace.revision; return workspace },
    execute(request) {
      if (!request || typeof request.operationId !== 'string' || !request.operationId || !Number.isInteger(request.expectedRevision)) throw new core.DomainError('INVALID_REQUEST', '操作标识或版本无效')
      const digest = core.digestText(core.stableStringify(request.command))
      const result = tx(() => {
        const current = read(), previous = operationGet.get(request.operationId)
        if (previous) { if (previous.digest !== digest) throw new core.DomainError('IDEMPOTENCY_CONFLICT', '同一操作 ID 不能用于不同内容'); return { workspace: current, receipt: JSON.parse(previous.receipt) } }
        if (current.revision !== request.expectedRevision) throw new core.DomainError('REVISION_CONFLICT', '工作区已修改，请刷新')
        const workspace = core.reduceCommand(current, request.command)
        const receipt = { operationId: request.operationId, revision: workspace.revision, label: core.commandLabel(request.command), at: new Date().toISOString() }
        if (workspace.revision !== current.revision) { write(current, workspace); historyPut.run(request.operationId, workspace.revision, JSON.stringify(core.inverseFor(current, workspace))) }
        operationPut.run(request.operationId, digest, JSON.stringify(receipt))
        return { workspace, receipt }
      })
      knownRevision = result.workspace.revision; return result
    },
    undo(expectedRevision = knownRevision) {
      if (!Number.isInteger(expectedRevision)) throw new core.DomainError('REVISION_CONFLICT', '请先读取工作区再撤销')
      const result = tx(() => {
        const current = read()
        if (current.revision !== expectedRevision) throw new core.DomainError('REVISION_CONFLICT', '其他窗口已修改，不能覆盖新的内容')
        const history = historyTop.get()
        if (!history) throw new core.DomainError('NOTHING_TO_UNDO', '没有可撤销的操作')
        if (history.head_revision !== current.revision) throw new core.DomainError('UNDO_CONFLICT', '不能覆盖后续修改')
        const workspace = core.restoreInverse(current, JSON.parse(history.inverse))
        const receipt = { operationId: core.newId(), revision: workspace.revision, label: '撤销上一步', at: new Date().toISOString() }
        write(current, workspace)
        db.prepare('UPDATE history SET undone=1 WHERE seq=?').run(history.seq)
        const prior = historyTop.get(); if (prior) db.prepare('UPDATE history SET head_revision=? WHERE seq=?').run(workspace.revision, prior.seq)
        operationPut.run(receipt.operationId, core.digestText(`undo:${history.operation_id}`), JSON.stringify(receipt))
        return { workspace, receipt }
      })
      knownRevision = result.workspace.revision; return result
    },
    export() { return JSON.stringify(tx(read), null, 2) },
    close() { db.close() },
  }
}
module.exports = { createV2Storage }
