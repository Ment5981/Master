import type { Goal, GoalNode, Task, Workspace } from './types'
import { createEmptyWorkspace, createGoal, createTask, digestText, DomainError, validDate, validateWorkspace } from './runtime.mjs'

type UnknownRow = Record<string, unknown>
const isRow = (value: unknown): value is UnknownRow => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const rows = (value: unknown): UnknownRow[] => Array.isArray(value) ? value.filter(isRow) : []
const nullableDate = (value: unknown) => validDate(value) ? value : null
const legacyMinutes = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
const idOf = (value: unknown) => typeof value === 'string' && value.length ? value : null

export function parseImport(text: string): { workspace: Workspace; warnings: string[]; digest: string } {
  if (typeof text !== 'string' || text.length > 16_000_000) throw new DomainError('IMPORT_TOO_LARGE', '导入文件不得超过 16 MB 文本')
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new DomainError('INVALID_IMPORT', '文件不是有效 JSON') }
  const digest = digestText(text)
  if (!isRow(parsed)) throw new DomainError('INVALID_IMPORT', '导入内容不是工作区对象')
  if (parsed.schemaVersion === 2) return { workspace: validateWorkspace(parsed as unknown as Workspace), warnings: [], digest }
  const legacy = isRow(parsed.state) ? parsed.state : parsed
  if (!Array.isArray(legacy.goals) || !Array.isArray(legacy.nodes) || !Array.isArray(legacy.tasks)) throw new DomainError('INVALID_IMPORT', '未识别为 Master 工作区或旧版备份')
  if ('version' in parsed && parsed.version !== 1 && parsed.version !== 0) throw new DomainError('INVALID_IMPORT', '不支持的旧版数据版本')
  const warnings: string[] = ['旧文件保持不变；已保留原始内容用于核对。导入不会自动开启 AI、音频或云同步。']
  for (const table of ['goals','nodes','tasks','reviews']) {
    const raw = legacy[table]
    if (Array.isArray(raw)) { const invalidCount=raw.filter(value=>!isRow(value)).length; if(invalidCount)warnings.push(`${table} 有 ${invalidCount} 项不是有效对象，保留在原始来源待修复。`) }
  }
  const workspace = createEmptyWorkspace()
  const sourceId = `legacy-source-${digest}`
  workspace.sources.push({ id: sourceId, title: '旧版 Master 原始导入', text, importedAt: new Date().toISOString(), kind: 'import', digest })
  const quarantine = (kind: string, id: unknown, reason: string) => warnings.push(`${kind} ${typeof id === 'string' ? id : '（无 ID）'}：${reason}；原始内容仍在导入来源中。`)
  for (const row of rows(legacy.goals)) {
    const id = idOf(row.id)
    if (!id || typeof row.title !== 'string' || !row.title.trim() || workspace.goals.some(g => g.id === id)) { quarantine('目标', row.id, '缺少 ID/名称或 ID 重复，待修复'); continue }
    const goal: Goal = { ...createGoal(row.title), id, description: typeof row.description === 'string' ? row.description : '', dueDate: nullableDate(row.deadline), criteria: Array.isArray(row.successCriteria) ? row.successCriteria.filter((v): v is string => typeof v === 'string' && Boolean(v.trim())) : [], verified: false, status: row.status === 'paused' ? 'paused' : 'active', createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString() }
    if (row.status === 'completed') warnings.push(`目标 ${id} 旧状态为完成，成功标准仍需核实，不伪造验收证据。`)
    if (row.deadline && !goal.dueDate) quarantine('目标', id, '截止日期无效，暂留空')
    workspace.goals.push(goal)
  }
  const rootMap = new Map<string, string>()
  for (const row of rows(legacy.nodes)) {
    const goal = workspace.goals.find(g => g.id === row.goalId)
    if (row.type === 'goal' && idOf(row.id) && goal) { rootMap.set(row.id as string, goal.id); goal.legacyRootNodeId = row.id as string }
  }
  for (const row of rows(legacy.nodes)) {
    if (rootMap.has(row.id as string)) continue
    const id = idOf(row.id)
    if (!id || typeof row.title !== 'string' || !row.title.trim() || !workspace.goals.some(g => g.id === row.goalId) || workspace.nodes.some(n => n.id === id)) { quarantine('节点', row.id, 'ID/名称/目标无效，待修复'); continue }
    const parentId = idOf(row.parentId)
    workspace.nodes.push({ id, goalId: row.goalId as string, parentId: parentId && !rootMap.has(parentId) ? parentId : null, kind: ['element','milestone','subgoal'].includes(row.type as string) ? row.type as GoalNode['kind'] : 'subgoal', title: row.title, weight: typeof row.weight === 'number' && Number.isFinite(row.weight) && row.weight > 0 ? row.weight : 1, order: typeof row.order === 'number' && Number.isInteger(row.order) ? row.order : 0 })
  }
  // Quarantine entire invalid chains rather than silently rewiring their meaning.
  const invalidNodes = new Set<string>()
  const byId = new Map(workspace.nodes.map(node => [node.id, node]))
  for (const node of workspace.nodes) {
    const path = new Set<string>(); let current: GoalNode | undefined = node
    while (current) {
      if (path.has(current.id)) { for (const id of path) invalidNodes.add(id); break }
      path.add(current.id)
      if (!current.parentId) break
      const parent = byId.get(current.parentId)
      if (!parent || parent.goalId !== current.goalId) { for (const id of path) invalidNodes.add(id); break }
      current = parent
    }
  }
  let changed = true
  while (changed) { changed = false; for (const node of workspace.nodes) if (node.parentId && invalidNodes.has(node.parentId) && !invalidNodes.has(node.id)) { invalidNodes.add(node.id); changed = true } }
  workspace.nodes = workspace.nodes.filter(node => { if (invalidNodes.has(node.id)) { quarantine('节点', node.id, '循环或父节点无效，待修复'); return false } return true })
  for (const row of rows(legacy.tasks)) {
    const id = idOf(row.id)
    if (!id || typeof row.title !== 'string' || !row.title.trim() || workspace.tasks.some(t => t.id === id)) { quarantine('任务', row.id, '缺少 ID/名称或 ID 重复，待修复'); continue }
    const node = workspace.nodes.find(n => n.id === row.nodeId)
    const goalId = node?.goalId ?? rootMap.get(row.nodeId as string) ?? null
    if (row.nodeId && !goalId) quarantine('任务', id, '关联节点不存在，放入收集箱')
    const status = ({ completed: 'done', in_progress: 'in_progress', blocked: 'blocked', cancelled: 'cancelled', inbox: 'todo', planned: 'todo' } as Record<string, Task['status']>)[row.status as string] ?? 'todo'
    const task = createTask(row.title, { id, nodeId: node?.id ?? null, goalId, status, sourceId, importance: row.quadrant === 'do' || row.quadrant === 'schedule' ? 'important' : row.quadrant === 'delegate' || row.quadrant === 'eliminate' ? 'normal' : 'unknown', urgent: row.quadrant === 'do' || row.quadrant === 'delegate' ? true : row.quadrant === 'schedule' || row.quadrant === 'eliminate' ? false : null, estimateMinutes: legacyMinutes(row.estimatedMinutes), dueDate: nullableDate(row.dueDate), completedAt: status === 'done' && typeof row.completedAt === 'string' && Number.isFinite(Date.parse(row.completedAt)) ? row.completedAt : null, createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString() })
    workspace.tasks.push(task)
    if (row.estimatedMinutes !== null && row.estimatedMinutes !== undefined && task.estimateMinutes === null) quarantine('任务', id, '预计用时无效，保留为未知')
    if (row.dueDate) warnings.push(`任务 ${id} 保留旧截止；旧界面曾把计划日写成截止，请核实。`)
    if (validDate(row.plannedDate)) workspace.allocations.push({ id: `legacy-allocation-${id}`, taskId: id, date: row.plannedDate, minutes: task.estimateMinutes })
    else if (row.plannedDate) quarantine('任务', id, '计划日期无效，未安排')
    if (typeof row.actualMinutes === 'number' && Number.isFinite(row.actualMinutes) && row.actualMinutes >= 0) workspace.timeEntries.push({ id: `legacy-time-${id}`, taskId: id, date: null, minutes: row.actualMinutes, source: 'legacy' })
    else if (row.actualMinutes !== null && row.actualMinutes !== undefined) quarantine('工时', id, '实际时间无效，未计入')
  }
  for (const row of rows(legacy.reviews)) {
    const id = idOf(row.id)
    if (!id || !validDate(row.rangeStart) || !validDate(row.rangeEnd) || row.rangeStart > row.rangeEnd || workspace.reviews.some(r => r.id === id)) { quarantine('复盘', row.id, '日期或 ID 无效，待修复'); continue }
    workspace.reviews.push({ id, period: row.period === 'yearly' ? 'year' : row.period === 'monthly' ? 'month' : 'week', start: row.rangeStart, end: row.rangeEnd, notes: [row.wins, row.friction, row.insight].filter(v => typeof v === 'string').join('\n\n'), next: '', createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(), snapshot: { completed: 0, minutes: 0, unknownTime: 0, goalMinutes: {} }, snapshotStatus: 'unavailable' })
  }
  if (workspace.timeEntries.length) warnings.push('旧累计工时没有可靠发生日期，只显示旧版累计记录，不计入严格周期投入。')
  if (workspace.reviews.length) warnings.push('旧复盘未保存统计快照；文本保留，统计标记为不可用。')
  if (['light','dark','system'].includes(legacy.theme as string)) workspace.preferences.theme = legacy.theme as Workspace['preferences']['theme']
  validateWorkspace(workspace)
  return { workspace, warnings, digest }
}
