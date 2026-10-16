import type { AgentInput, Workspace } from '../core/types'
import { reviewSnapshot, taskCompletionDate } from '../core'

export function localDay(timezone?: string, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Bounded, referentially closed context. Never reads raw source history. */
export function planningContext(w: Workspace): AgentInput['workspace'] {
  const goals = w.goals.filter(g => g.status !== 'archived').slice(-30)
  const goalIds = new Set(goals.map(g => g.id))
  const candidates = w.tasks.filter(t => t.status !== 'cancelled' && (!t.goalId || goalIds.has(t.goalId))).slice(-300)
  const byId = new Map(w.nodes.filter(n => goalIds.has(n.goalId)).map(n => [n.id, n]))
  const nodeIds = new Set<string>()
  const addPath = (id: string) => {
    const path: string[] = []; let current: string | null = id
    while (current && byId.has(current) && !nodeIds.has(current) && !path.includes(current)) { path.push(current); current = byId.get(current)!.parentId }
    if (nodeIds.size + path.length <= 900) path.forEach(value => nodeIds.add(value))
  }
  for (const task of candidates) if (task.nodeId) addPath(task.nodeId)
  for (const node of [...byId.values()].slice(0, 200)) addPath(node.id)
  const nodes = [...byId.values()].filter(n => nodeIds.has(n.id))
  const tasks = candidates.filter(t => !t.nodeId || nodeIds.has(t.nodeId))
  const taskIds = new Set(tasks.map(t => t.id))
  return { revision: w.revision, goals, nodes, tasks, allocations: w.allocations.filter(a => taskIds.has(a.taskId)).slice(-1000), capacities: w.capacities.slice(-90) }
}

export function reviewFacts(w: Workspace, range: {start: string; end: string}): NonNullable<AgentInput['reviewFacts']> {
  const snapshot = reviewSnapshot(w, range.start, range.end)
  const completed = w.tasks.filter(t => { const date = taskCompletionDate(t, w.preferences.timezone); return t.status === 'done' && date && date >= range.start && date <= range.end })
  return { ...range, timezone: w.preferences.timezone, snapshot, completedTasks: completed.slice(0, 100).map(t => ({ id: t.id, title: t.title, date: taskCompletionDate(t, w.preferences.timezone)! })), incompleteList: completed.length > 100 }
}
