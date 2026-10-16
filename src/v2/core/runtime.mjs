// Platform-neutral domain runtime shared by the browser and Electron.
export const ENTITY_TABLES = ['goals', 'nodes', 'tasks', 'allocations', 'timeEntries', 'capacities', 'reviews', 'sources', 'proposals']
export class DomainError extends Error {
  constructor(code, message) { super(message); this.name = 'DomainError'; this.code = code }
}
const fail = (code, message) => { throw new DomainError(code, message) }
const assert = (ok, code, message) => { if (!ok) fail(code, message) }
export const newId = () => globalThis.crypto.randomUUID()
export const todayISO = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
export function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
}
export function addDays(date, count) {
  assert(validDate(date) && Number.isInteger(count), 'INVALID_DATE', '日期或天数无效')
  const parsed = new Date(`${date}T12:00:00Z`); parsed.setUTCDate(parsed.getUTCDate() + count)
  return parsed.toISOString().slice(0, 10)
}
export function createEmptyWorkspace() {
  return { schemaVersion: 2, id: newId(), revision: 0, name: '我的 Master', goals: [], nodes: [], tasks: [], allocations: [], timeEntries: [], capacities: [], reviews: [], sources: [], proposals: [], preferences: { theme: 'system', aiConsent: false, audioConsent: false, speak: false, gatewayUrl: 'http://127.0.0.1:4318', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai' }, imports: [] }
}
export const createGoal = title => ({ id: newId(), title: title.trim(), description: '', dueDate: null, criteria: [], verified: false, status: 'active', createdAt: new Date().toISOString() })
export const createTask = (title, overrides = {}) => ({ id: newId(), title: title.trim(), nodeId: null, goalId: null, status: 'todo', importance: 'unknown', urgent: null, estimateMinutes: null, dueDate: null, startDate: null, locked: false, createdAt: new Date().toISOString(), completedAt: null, sourceId: null, ...overrides })
export function createDemoWorkspace(today = todayISO()) {
  const state = createEmptyWorkspace()
  state.name = '示例 · 安静地推进'
  const goal = { ...createGoal('建立自己的作品集'), description: '把正在做的事情，变成能展示的成果。', dueDate: addDays(today, 45), criteria: ['发布两篇有证据的项目案例'] }
  const node = { id: newId(), goalId: goal.id, parentId: null, kind: 'element', title: '项目案例', weight: 1, order: 0 }
  const task = createTask('整理一个项目的关键发现', { goalId: goal.id, nodeId: node.id, importance: 'important', estimateMinutes: 45 })
  state.goals.push(goal); state.nodes.push(node); state.tasks.push(task)
  state.allocations.push({ id: newId(), taskId: task.id, date: today, minutes: 45 })
  state.capacities.push({ date: today, minutes: 180, buffer: 0.2 })
  return state
}
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
// SHA-256 is synchronous here so import previews work identically in both hosts.
export function digestText(text) {
  const bytes = new TextEncoder().encode(text)
  const length = Math.ceil((bytes.length + 9) / 64) * 64
  const data = new Uint8Array(length); data.set(bytes); data[bytes.length] = 128
  const view = new DataView(data.buffer); const bits = bytes.length * 8
  view.setUint32(length - 8, Math.floor(bits / 4294967296)); view.setUint32(length - 4, bits >>> 0)
  const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]
  const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]
  const rotr = (n, s) => (n >>> s) | (n << (32 - s)); const w = new Uint32Array(64)
  for (let pos = 0; pos < length; pos += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(pos + i * 4)
    for (let i = 16; i < 64; i++) { const x = w[i-15], y = w[i-2]; w[i] = (w[i-16] + (rotr(x,7)^rotr(x,18)^(x>>>3)) + w[i-7] + (rotr(y,17)^rotr(y,19)^(y>>>10))) >>> 0 }
    let [a,b,c,d,e,f,g,j] = h
    for (let i = 0; i < 64; i++) { const t = (j + (rotr(e,6)^rotr(e,11)^rotr(e,25)) + ((e&f)^(~e&g)) + k[i] + w[i]) >>> 0; const u = ((rotr(a,2)^rotr(a,13)^rotr(a,22)) + ((a&b)^(a&c)^(b&c))) >>> 0; j=g;g=f;f=e;e=(d+t)>>>0;d=c;c=b;b=a;a=(t+u)>>>0 }
    ;[a,b,c,d,e,f,g,j].forEach((n, i) => { h[i] = (h[i] + n) >>> 0 })
  }
  return h.map(n => n.toString(16).padStart(8, '0')).join('')
}
const isString = value => typeof value === 'string' && value.length > 0
const text = value => typeof value === 'string' && value.trim().length > 0
const nonnegative = value => Number.isFinite(value) && value >= 0
const minutes = value => value === null || (Number.isFinite(value) && value > 0 && value <= 1_000_000)
const dateOrNull = value => value === null || validDate(value)
const find = (items, id, label = '对象') => { const item = items.find(row => row.id === id); assert(item, 'NOT_FOUND', `${label}不存在`); return item }
const requireUnique = (items, id) => assert(!items.some(row => row.id === id), 'DUPLICATE_ID', '对象 ID 已存在')
function assignAllowed(target, changes, keys) {
  assert(changes && typeof changes === 'object' && !Array.isArray(changes), 'INVALID_COMMAND', '修改内容无效')
  for (const key of Object.keys(changes)) assert(keys.includes(key), 'INVALID_FIELD', `不能修改字段 ${key}`)
  Object.assign(target, changes)
}
export function validateWorkspace(state) {
  assert(state && state.schemaVersion === 2 && isString(state.id) && Number.isInteger(state.revision) && state.revision >= 0, 'INVALID_WORKSPACE', '工作区版本或标识无效')
  for (const table of ENTITY_TABLES) {
    assert(Array.isArray(state[table]) && state[table].length <= 100_000, 'INVALID_WORKSPACE', `${table} 数据无效或超限`)
    const ids = new Set()
    for (const row of state[table]) { const key = table === 'capacities' ? row?.date : row?.id; assert(isString(key) && !ids.has(key), 'DUPLICATE_ID', `${table} 存在无效或重复 ID`); ids.add(key) }
  }
  const goals = new Map(state.goals.map(g => [g.id, g])); const nodes = new Map(state.nodes.map(n => [n.id, n])); const tasks = new Map(state.tasks.map(t => [t.id, t])); const sources = new Set(state.sources.map(s => s.id))
  for (const goal of state.goals) assert(text(goal.title) && typeof goal.description === 'string' && dateOrNull(goal.dueDate) && Array.isArray(goal.criteria) && goal.criteria.every(text) && typeof goal.verified === 'boolean' && ['active','paused','archived'].includes(goal.status), 'INVALID_GOAL', '目标字段无效')
  for (const node of state.nodes) {
    assert(text(node.title) && goals.has(node.goalId) && ['element','milestone','subgoal'].includes(node.kind) && Number.isFinite(node.weight) && node.weight > 0 && Number.isInteger(node.order), 'INVALID_NODE', '节点字段无效')
    assert(node.parentId === null || (nodes.has(node.parentId) && nodes.get(node.parentId).goalId === node.goalId), 'INVALID_PARENT', '节点归属无效或跨目标')
  }
  const checked = new Set()
  for (const node of state.nodes) { const path = new Set(); let current = node; while (current && !checked.has(current.id)) { assert(!path.has(current.id), 'CYCLE', '节点关系不能形成循环'); path.add(current.id); current = current.parentId ? nodes.get(current.parentId) : null } for (const id of path) checked.add(id) }
  for (const task of state.tasks) {
    assert(text(task.title) && ['todo','in_progress','blocked','done','cancelled'].includes(task.status) && ['important','normal','unknown'].includes(task.importance) && (task.urgent === null || typeof task.urgent === 'boolean') && minutes(task.estimateMinutes) && dateOrNull(task.dueDate) && dateOrNull(task.startDate) && typeof task.locked === 'boolean', 'INVALID_TASK', '任务字段无效')
    assert(task.goalId === null || goals.has(task.goalId), 'INVALID_REFERENCE', '任务目标不存在')
    assert(task.nodeId === null || (nodes.has(task.nodeId) && nodes.get(task.nodeId).goalId === task.goalId), 'INVALID_REFERENCE', '任务节点不存在或与目标不一致')
    assert(task.sourceId === null || sources.has(task.sourceId), 'INVALID_REFERENCE', '任务来源不存在')
    assert(!task.startDate || !task.dueDate || task.startDate <= task.dueDate, 'INVALID_DATE', '开始日期不能晚于硬截止')
    assert(task.completedDate === undefined || dateOrNull(task.completedDate), 'INVALID_DATE', '完成发生日期无效')
    assert(task.completedAt === null || (typeof task.completedAt === 'string' && Number.isFinite(Date.parse(task.completedAt))), 'INVALID_DATE', '完成记录时间无效')
  }
  const allocationKeys = new Set()
  for (const row of state.allocations) { const key = `${row.taskId}:${row.date}`; assert(tasks.has(row.taskId) && validDate(row.date) && minutes(row.minutes) && !allocationKeys.has(key), 'INVALID_ALLOCATION', '日期分配无效或重复'); allocationKeys.add(key) }
  for (const row of state.timeEntries) assert(tasks.has(row.taskId) && dateOrNull(row.date) && nonnegative(row.minutes) && ['manual','timer','legacy'].includes(row.source), 'INVALID_TIME', '实际时间记录无效')
  for (const row of state.capacities) assert(validDate(row.date) && nonnegative(row.minutes) && Number.isFinite(row.buffer) && row.buffer >= 0 && row.buffer < 1, 'INVALID_CAPACITY', '容量或缓冲比例无效')
  for (const row of state.sources) assert(typeof row.text === 'string' && typeof row.title === 'string' && isString(row.digest) && ['conversation','import'].includes(row.kind), 'INVALID_SOURCE', '来源记录无效')
  assert(state.preferences && ['system','light','dark'].includes(state.preferences.theme) && ['aiConsent','audioConsent','speak'].every(k => typeof state.preferences[k] === 'boolean') && typeof state.preferences.gatewayUrl === 'string' && isString(state.preferences.timezone), 'INVALID_PREFERENCES', '偏好设置无效')
  assert(Array.isArray(state.imports) && state.imports.every(isString), 'INVALID_IMPORT', '导入记录无效')
  for (const review of state.reviews) assert(['week','month','year'].includes(review.period) && validDate(review.start) && validDate(review.end) && review.start <= review.end && typeof review.notes === 'string' && typeof review.next === 'string' && review.snapshot && nonnegative(review.snapshot.minutes) && nonnegative(review.snapshot.completed) && nonnegative(review.snapshot.unknownTime), 'INVALID_REVIEW', '复盘数据无效')
  for (const proposal of state.proposals) validateProposal(proposal)
  return state
}
function calculateProgress(state) {
  const children = new Map(), direct = new Map(), goalTasks = new Map(), values = new Map()
  for (const node of state.nodes) { const list = children.get(node.parentId) || []; list.push(node); children.set(node.parentId, list) }
  for (const task of state.tasks) {
    if (task.status === 'cancelled') continue
    const map = task.nodeId ? direct : goalTasks; const key = task.nodeId || task.goalId
    const list = map.get(key) || []; list.push(task); map.set(key, list)
  }
  const aggregate = (nodes, tasks) => { let numerator = 0, denominator = 0; for (const n of nodes) { denominator += n.weight; numerator += n.weight * (values.get(n.id) ?? 0) } for (const t of tasks) { denominator++; numerator += t.status === 'done' ? 1 : 0 } return denominator ? numerator / denominator : 0 }
  const stack = state.nodes.filter(n => n.parentId === null).map(n => [n, false])
  while (stack.length) { const [n, visited] = stack.pop(); if (visited) values.set(n.id, aggregate(children.get(n.id) || [], direct.get(n.id) || [])); else { stack.push([n,true]); for (const c of children.get(n.id) || []) stack.push([c,false]) } }
  const goalValues = new Map(state.goals.map(g => [g.id, aggregate((children.get(null) || []).filter(n => n.goalId === g.id), goalTasks.get(g.id) || [])]))
  return { values, goalValues }
}
export const nodeProgress = (state, id) => Math.round((calculateProgress(state).values.get(id) || 0) * 100)
export const goalProgress = (state, id) => Math.round((calculateProgress(state).goalValues.get(id) || 0) * 100)
export function progressSnapshot(state) { const result=calculateProgress(state);return {nodes:Object.fromEntries([...result.values].map(([id,value])=>[id,Math.round(value*100)])),goals:Object.fromEntries([...result.goalValues].map(([id,value])=>[id,Math.round(value*100)]))} }
export function dateInTimezone(value, timezone) { if(!value)return null;if(validDate(value))return value;try{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));return ['year','month','day'].map(type=>parts.find(p=>p.type===type)?.value).join('-')}catch{return null} }
export const taskCompletionDate = (task, timezone) => task.completedDate || dateInTimezone(task.completedAt,timezone)
export function dayCapacity(state, date) {
  assert(validDate(date), 'INVALID_DATE', '日期无效')
  const capacity = state.capacities.find(c => c.date === date)
  const knownCapacity = Boolean(capacity)
  const capacityMinutes = capacity ? Math.floor(capacity.minutes * (1 - capacity.buffer)) : 0
  const allocations = state.allocations.filter(a => a.date === date && state.tasks.some(t => t.id === a.taskId && t.status !== 'cancelled'))
  const entries = state.timeEntries.filter(e => e.date === date && e.source !== 'legacy')
  const actualByTask = new Map(); for (const e of entries) actualByTask.set(e.taskId, (actualByTask.get(e.taskId) || 0) + e.minutes)
  const actualMinutes = entries.reduce((s, e) => s + e.minutes, 0)
  const plannedMinutes = allocations.reduce((s, a) => s + (a.minutes ?? 0), 0)
  const consumedMinutes = actualMinutes + allocations.reduce((s, a) => s + Math.max(0, (a.minutes ?? 0) - (actualByTask.get(a.taskId) || 0)), 0)
  const unknownTasks = allocations.filter(a => a.minutes === null || (state.tasks.find(t => t.id === a.taskId)?.status === 'done' && !actualByTask.has(a.taskId))).length
  return { capacityMinutes, plannedMinutes, actualMinutes, consumedMinutes, remainingMinutes: Math.max(0, capacityMinutes - consumedMinutes), overMinutes: Math.max(0, consumedMinutes - capacityMinutes), unknownTasks, buffer: capacity?.buffer ?? 0.2, knownCapacity }
}
export function reviewSnapshot(state, start, end) {
  assert(validDate(start) && validDate(end) && start <= end, 'INVALID_DATE', '复盘日期无效')
  const inRange = date => Boolean(date && date >= start && date <= end)
  const done = state.tasks.filter(t => t.status === 'done' && inRange(taskCompletionDate(t,state.preferences.timezone)))
  const entries = state.timeEntries.filter(e => e.source !== 'legacy' && inRange(e.date))
  const goalMinutes = Object.create(null); const tasks = new Map(state.tasks.map(t => [t.id,t])); const recorded = new Set(entries.map(e => e.taskId))
  for (const entry of entries) { const goalId = 'goalId' in entry ? entry.goalId : tasks.get(entry.taskId)?.goalId; if (goalId) goalMinutes[goalId] = (goalMinutes[goalId] || 0) + entry.minutes }
  return { completed: done.length, minutes: entries.reduce((s,e) => s+e.minutes,0), unknownTime: done.filter(t => !recorded.has(t.id)).length, goalMinutes }
}
function allocate(state, taskId, date, value) {
  const task = find(state.tasks, taskId, '任务')
  if (date === null) { state.allocations = state.allocations.filter(a => a.taskId !== taskId); return }
  assert(validDate(date) && minutes(value), 'INVALID_ALLOCATION', '计划日期或时长无效')
  assert(!['done','cancelled'].includes(task.status),'INVALID_ALLOCATION','已完成或取消任务不能新增计划')
  assert(!task.startDate || date >= task.startDate,'INVALID_DATE','安排早于可开始日期')
  const existing = state.allocations.find(a => a.taskId === taskId && a.date === date)
  if (existing) existing.minutes = value
  else state.allocations.push({ id: newId(), taskId, date, minutes: value })
}
const normalize = value => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
function originKey(task) { return digestText(stableStringify({ title: normalize(task.title), evidence: task.evidence.filter(e => e.kind !== 'suggestion').map(e => [e.kind, e.messageId || normalize(e.quote)]).sort() })) }
function validateProposal(proposal) {
  assert(proposal && isString(proposal.id) && Number.isInteger(proposal.revision) && proposal.revision>0 && Number.isInteger(proposal.baseRevision) && proposal.baseRevision>=0 && Number.isInteger(proposal.inputRevision) && proposal.inputRevision>=0 && ['draft','applied','cancelled'].includes(proposal.state) && ['remote','manual'].includes(proposal.engine), 'INVALID_PROPOSAL', '草案版本无效')
  assert(['goals','nodes','tasks','sources','assumptions'].every(k => Array.isArray(proposal[k]) && proposal[k].length <= 10_000) && proposal.assumptions.every(v=>typeof v==='string') && typeof proposal.summary === 'string' && (proposal.question === null || typeof proposal.question === 'string'), 'INVALID_PROPOSAL', '草案结构无效')
  const ids = new Set()
  for (const task of proposal.tasks) {
    assert(isString(task.id) && !ids.has(task.id) && text(task.title) && typeof task.selected === 'boolean' && ['todo','reported_done'].includes(task.status) && minutes(task.estimateMinutes) && dateOrNull(task.plannedDate) && dateOrNull(task.dueDate) && ['goalId','nodeId','targetTaskId'].every(k=>task[k]===null||isString(task[k])) && ['important','normal','unknown'].includes(task.importance) && (task.urgent===null||typeof task.urgent==='boolean') && Array.isArray(task.evidence), 'INVALID_PROPOSAL', '草案任务无效')
    for(const evidence of task.evidence)assert(evidence&&typeof evidence.sourceId==='string'&&typeof evidence.quote==='string'&&['user_report','assistant_claim','tool_result','suggestion'].includes(evidence.kind)&&(evidence.messageId===undefined||isString(evidence.messageId)),'INVALID_EVIDENCE','来源证据结构无效')
    ids.add(task.id)
  }
  for(const source of proposal.sources)assert(isString(source.id)&&typeof source.title==='string'&&typeof source.text==='string'&&isString(source.digest)&&['conversation','import'].includes(source.kind),'INVALID_SOURCE','草案来源无效')
  if(proposal.capacity)assert(validDate(proposal.capacity.date)&&nonnegative(proposal.capacity.minutes)&&Number.isFinite(proposal.capacity.buffer)&&proposal.capacity.buffer>=0&&proposal.capacity.buffer<1,'INVALID_CAPACITY','草案容量无效')
}
function applyProposal(state, command) {
  const proposal = find(state.proposals, command.id, '草案')
  assert(proposal.state === 'draft' && proposal.revision === command.revision && proposal.baseRevision === state.revision, 'STALE_PROPOSAL', '草案已过期，请基于当前修改重新预览')
  assert(!proposal.question, 'UNANSWERED_QUESTION', '请先回答草案中的关键问题')
  assert(Array.isArray(command.verifiedTaskIds), 'INVALID_COMMAND', '核实列表无效')
  const selected = proposal.tasks.filter(t => t.selected && (t.status !== 'reported_done' || command.verifiedTaskIds.includes(t.id)))
  // The preview explicitly confirms all listed new goals/path nodes; checkboxes scope tasks only.
  const neededNodes = new Set(proposal.nodes.map(n => n.id)), neededGoals = new Set([...proposal.goals.map(g => g.id), ...selected.map(t => t.goalId).filter(Boolean)])
  for (const task of selected) { let id = task.nodeId; const seen = new Set(); while (id && !state.nodes.some(n => n.id === id)) { assert(!seen.has(id), 'CYCLE', '草案节点存在循环'); seen.add(id); const node = find(proposal.nodes,id,'草案节点'); neededNodes.add(id); neededGoals.add(node.goalId); id=node.parentId } }
  for (const goal of proposal.goals.filter(g => neededGoals.has(g.id))) { const existing=state.goals.find(g=>g.id===goal.id); assert(!existing || stableStringify(existing) === stableStringify(goal), 'MANUAL_CONFLICT', '草案不能覆盖已有目标'); if (!existing) state.goals.push(structuredClone(goal)) }
  for (const node of proposal.nodes.filter(n => neededNodes.has(n.id))) state.nodes.push(structuredClone(node))
  const sourceMap = new Map()
  for (const draft of selected) {
    for (const evidence of draft.evidence) {
      if (evidence.kind === 'suggestion' && !evidence.sourceId) continue
      const source = state.sources.find(s=>s.id===evidence.sourceId) || proposal.sources.find(s=>s.id===evidence.sourceId)
      assert(source && typeof evidence.quote === 'string' && source.text.includes(evidence.quote), 'INVALID_EVIDENCE', '草案证据无法在指定来源中定位')
      const existing = state.sources.find(s=>s.digest===source.digest)
      if (existing) sourceMap.set(source.id,existing.id)
      else { requireUnique(state.sources,source.id); state.sources.push(structuredClone(source)); sourceMap.set(source.id,source.id) }
    }
    const key = draft.evidence.some(e=>e.kind!=='suggestion') ? originKey(draft) : null
    const duplicate = key && state.tasks.find(t=>t.originKey===key)
    if (duplicate && !draft.targetTaskId) {
      const previousSource=state.sources.find(s=>s.id===duplicate.sourceId)
      const sameSource=draft.evidence.some(e=>sourceMap.get(e.sourceId)===previousSource?.id)
      assert(sameSource||draft.evidence.some(e=>e.messageId),'POSSIBLE_DUPLICATE','相同片段来自不同记录，需核对是否为同一行动')
      continue
    }
    const existing = draft.targetTaskId ? find(state.tasks,draft.targetTaskId,'待修改任务') : null
    assert(!existing?.locked, 'LOCKED_TASK', '草案不能修改锁定任务')
    const task = existing || createTask(draft.title,{ id:draft.id })
    if (!existing) requireUnique(state.tasks,task.id)
    task.title=draft.title;task.goalId=draft.goalId;task.nodeId=draft.nodeId;task.estimateMinutes=draft.estimateMinutes;task.dueDate=draft.dueDate;task.importance=draft.importance;task.urgent=draft.urgent
    if (draft.status === 'reported_done') task.status='done'
    // Imported statements have no trustworthy completion date or duration.
    if (!existing) { task.sourceId=sourceMap.get(draft.evidence[0]?.sourceId) || null; if(key)task.originKey=key; state.tasks.push(task) }
    if (draft.plannedDate && draft.status !== 'reported_done') {
      assert(task.status !== 'done' && task.status !== 'cancelled' && task.status !== 'blocked','INVALID_ALLOCATION','不能把已完成、取消或阻塞任务安排为可执行行动')
      assert(!task.goalId || find(state.goals,task.goalId).status==='active','INVALID_ALLOCATION','目标已暂停或归档')
      assert(!task.startDate || draft.plannedDate >= task.startDate,'INVALID_DATE','安排早于可开始日期')
      assert(!task.dueDate || draft.plannedDate <= task.dueDate,'INVALID_DATE','安排晚于硬截止')
      const previous = state.allocations.filter(a => a.taskId === task.id)
      assert(previous.length < 2 || previous.some(a => a.date === draft.plannedDate), 'AMBIGUOUS_RESCHEDULE', '这项任务原有多个计划日，请在周计划中明确要移动哪一天')
      if (existing && previous.length === 1 && previous[0].date !== draft.plannedDate) state.allocations = state.allocations.filter(a => a.taskId !== task.id)
      allocate(state,task.id,draft.plannedDate,draft.estimateMinutes)
    }
  }
  if (proposal.capacity) { const index=state.capacities.findIndex(c=>c.date===proposal.capacity.date); if(index<0)state.capacities.push(structuredClone(proposal.capacity));else state.capacities[index]=structuredClone(proposal.capacity) }
  for (const date of new Set([...selected.map(t=>t.plannedDate), proposal.capacity?.date].filter(Boolean))) { const capacity=dayCapacity(state,date); assert(!capacity.knownCapacity || capacity.overMinutes===0,'CAPACITY_EXCEEDED','草案超出已确认容量，请减少安排') }
  proposal.state='applied'
}
export function reduceCommand(current, command, context = {}) {
  validateWorkspace(current)
  assert(command && typeof command.type === 'string','INVALID_COMMAND','命令无效')
  const state=structuredClone(current)
  switch(command.type) {
    case 'create_goal': requireUnique(state.goals,command.goal.id);state.goals.push(structuredClone(command.goal));for(const node of command.nodes){requireUnique(state.nodes,node.id);assert(node.goalId===command.goal.id,'INVALID_REFERENCE','新增节点必须属于新目标');state.nodes.push(structuredClone(node))}break
    case 'update_goal': assignAllowed(find(state.goals,command.id,'目标'),command.changes,['title','description','dueDate','criteria','verified','status']);break
    case 'create_node': requireUnique(state.nodes,command.node.id);state.nodes.push(structuredClone(command.node));break
    case 'update_node': assignAllowed(find(state.nodes,command.id,'节点'),command.changes,['title','parentId','weight']);break
    case 'create_task': requireUnique(state.tasks,command.task.id);state.tasks.push(structuredClone(command.task));if(command.allocation){assert(command.allocation.taskId===command.task.id,'INVALID_REFERENCE','计划不属于新任务');state.allocations.push(structuredClone(command.allocation))}break
    case 'update_task': {
      const task=find(state.tasks,command.id,'任务')
      const previousStatus=task.status
      assignAllowed(task,command.changes,['title','goalId','nodeId','status','importance','urgent','estimateMinutes','dueDate','startDate','locked'])
      if(command.changes.status && command.changes.status!=='done'){task.completedAt=null;task.completedDate=null}
      if(command.changes.status==='done'&&previousStatus!=='done'){task.completedAt=context.now||new Date().toISOString();task.completedDate=dateInTimezone(task.completedAt,state.preferences.timezone)}
      if(command.scheduling){
        const {fromDate,toDate,minutes:plannedMinutes}=command.scheduling
        assert(dateOrNull(fromDate)&&dateOrNull(toDate)&&minutes(plannedMinutes),'INVALID_ALLOCATION','任务排期无效')
        if(fromDate){assert(state.allocations.some(a=>a.taskId===task.id&&a.date===fromDate),'NOT_FOUND','原计划已不存在，请重新选择');state.allocations=state.allocations.filter(a=>!(a.taskId===task.id&&a.date===fromDate))}
        if(toDate){const existing=state.allocations.find(a=>a.taskId===task.id&&a.date===toDate);const value=existing&&fromDate&&fromDate!==toDate?(existing.minutes===null||plannedMinutes===null?null:existing.minutes+plannedMinutes):plannedMinutes;allocate(state,task.id,toDate,value)}
      }
      break
    }
    case 'complete_task': { const task=find(state.tasks,command.id,'任务');assert(validDate(command.date) && typeof command.done==='boolean','INVALID_DATE','完成日期无效');if(command.done && task.status==='done')return current;if(!command.done && task.status!=='done')return current;task.status=command.done?'done':'todo';task.completedAt=command.done?(context.now || new Date().toISOString()):null;task.completedDate=command.done?command.date:null;if(command.done && command.minutes!==undefined){assert(nonnegative(command.minutes),'INVALID_TIME','实际用时无效');const recorded=state.timeEntries.filter(e=>e.taskId===task.id && e.source!=='legacy').reduce((s,e)=>s+e.minutes,0);assert(command.minutes>=recorded,'TIME_CONFLICT','已有工时超过输入总时长，请使用修正流程');if(command.minutes>recorded)state.timeEntries.push({id:newId(),taskId:task.id,date:command.date,minutes:command.minutes-recorded,source:'manual',goalId:task.goalId,nodeId:task.nodeId})}break }
    case 'allocate': allocate(state,command.taskId,command.date,command.minutes);break
    case 'reschedule': {find(state.tasks,command.taskId,'任务');assert(validDate(command.fromDate)&&validDate(command.toDate),'INVALID_DATE','改期日期无效');const allocation=state.allocations.find(a=>a.taskId===command.taskId&&a.date===command.fromDate);assert(allocation,'NOT_FOUND','原计划已不存在，请刷新');if(command.fromDate===command.toDate)return current;const target=state.allocations.find(a=>a.taskId===command.taskId&&a.date===command.toDate);if(target){target.minutes=target.minutes===null||allocation.minutes===null?null:target.minutes+allocation.minutes;state.allocations=state.allocations.filter(a=>a.id!==allocation.id)}else allocation.date=command.toDate;break}
    case 'unallocate': assert(validDate(command.date),'INVALID_DATE','日期无效');find(state.tasks,command.taskId,'任务');state.allocations=state.allocations.filter(a=>!(a.taskId===command.taskId&&a.date===command.date));break
    case 'capacity': { const i=state.capacities.findIndex(c=>c.date===command.capacity.date);if(i<0)state.capacities.push(structuredClone(command.capacity));else state.capacities[i]=structuredClone(command.capacity);break }
    case 'save_review': { const i=state.reviews.findIndex(r=>r.id===command.review.id);if(i<0)state.reviews.push(structuredClone(command.review));else state.reviews[i]=structuredClone(command.review);break }
    case 'preferences': assignAllowed(state.preferences,command.changes,['theme','aiConsent','audioConsent','speak','gatewayUrl','timezone']);break
    case 'save_proposal': { validateProposal(command.proposal);assert(command.proposal.baseRevision===current.revision,'STALE_PROPOSAL','生成期间工作区已修改，请重新预览');const copy=structuredClone(command.proposal);assert(copy.state==='draft','INVALID_PROPOSAL','只能保存草案');const i=state.proposals.findIndex(p=>p.id===copy.id);if(i>=0)assert(state.proposals[i].state==='draft' && copy.revision>state.proposals[i].revision,'STALE_PROPOSAL','草案版本需要递增');else for(const task of copy.tasks)if(task.status==='reported_done')task.selected=false;copy.baseRevision=current.revision+1;if(i<0)state.proposals.push(copy);else state.proposals[i]=copy;break }
    case 'cancel_proposal': {const proposal=find(state.proposals,command.id,'草案');assert(proposal.state!=='applied','INVALID_PROPOSAL','已应用计划请使用撤销');proposal.state='cancelled';break}
    case 'apply_proposal': applyProposal(state,command);break
    case 'import': { assert(isString(command.digest),'INVALID_IMPORT','导入摘要缺失');if(state.imports.includes(command.digest))return current;validateWorkspace(command.workspace);for(const table of ENTITY_TABLES){if(table==='capacities'||table==='proposals')continue;for(const item of command.workspace[table]){const existing=state[table].find(row=>row.id===item.id);assert(!existing || stableStringify(existing)===stableStringify(item),'IMPORT_CONFLICT','导入与已有对象冲突，请先在独立空间核对');if(!existing)state[table].push(structuredClone(item))}}for(const capacity of command.workspace.capacities){if(!state.capacities.some(c=>c.date===capacity.date))state.capacities.push(structuredClone(capacity))}state.imports.push(command.digest);break }
    default: fail('UNKNOWN_COMMAND','不支持的命令')
  }
  state.revision=current.revision+1
  return validateWorkspace(state)
}
export function commandLabel(command) { return ({create_goal:'创建目标',update_goal:'修改目标',create_node:'添加节点',update_node:'修改节点',create_task:'创建任务',update_task:'修改任务',complete_task:'更新完成状态',allocate:'安排任务',reschedule:'任务改期',unallocate:'取消当天安排',capacity:'调整容量',save_review:'保存复盘',preferences:'修改偏好',save_proposal:'保存草案',cancel_proposal:'取消草案',apply_proposal:'应用计划',import:'导入数据'})[command.type] || '更新工作区' }
export function workspaceMeta(state) { return Object.fromEntries(Object.entries(state).filter(([key])=>!ENTITY_TABLES.includes(key))) }
export const entityKey = (table, row) => table === 'capacities' ? row.date : row.id
export function entityDiff(before, after) {
  const changed={}
  for(const table of ENTITY_TABLES){const prev=new Map(before[table].map(row=>[entityKey(table,row),row]));const next=new Map(after[table].map(row=>[entityKey(table,row),row]));changed[table]={put:[],remove:[],inverse:[]};for(const [id,row]of next)if(!prev.has(id)||stableStringify(prev.get(id))!==stableStringify(row)){changed[table].put.push(row);changed[table].inverse.push({id,value:prev.get(id)||null})}for(const[id,row]of prev)if(!next.has(id)){changed[table].remove.push(id);changed[table].inverse.push({id,value:row})}}
  return changed
}
export function inverseFor(before, after) { const changes=entityDiff(before,after);return {meta:workspaceMeta(before),tables:Object.fromEntries(ENTITY_TABLES.map(table=>[table,changes[table].inverse]))} }
export function restoreInverse(current, inverse) {
  const state={...structuredClone(current),...structuredClone(inverse.meta),revision:current.revision+1}
  for(const table of ENTITY_TABLES){const items=new Map(state[table].map(row=>[entityKey(table,row),row]));for(const patch of inverse.tables[table]){if(patch.value===null)items.delete(patch.id);else items.set(patch.id,structuredClone(patch.value))}state[table]=[...items.values()]}
  for(const proposal of state.proposals)if(proposal.state==='draft'&&proposal.baseRevision===inverse.meta.revision)proposal.baseRevision=state.revision
  return validateWorkspace(state)
}
