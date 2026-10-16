import { createHash, randomUUID } from 'node:crypto'
import type { AgentInput, Proposal, Source } from '../src/v2/core/types'
import { modelPlanSchema, proposalSchema, type ModelPlan } from './schema'

export function buildSources(input: AgentInput): Source[] {
  const now = new Date().toISOString()
  const referenced = new Set(input.previousProposal?.tasks.flatMap(t => t.evidence.map(e => e.sourceId)) ?? [])
  const previous = input.previousProposal?.sources.filter(s => referenced.has(s.id)).map(s => ({ ...s, id: `previous:${s.id}` })) ?? []
  const rows = input.conversation.map((turn, i) => ({ id: `turn-${i}`, title: `${turn.role === 'user' ? '用户' : '助手'} · 第 ${i + 1} 条`, text: turn.text, kind: 'conversation' as const }))
  rows.push({ id: 'current-input', title: input.mode === 'import' ? '本次导入记录' : '本次用户输入', text: input.text, kind: 'conversation' })
  return [...previous, ...rows.map(row => ({ ...row, kind: row.id === 'current-input' && input.mode === 'import' ? 'import' as const : row.kind, importedAt: now, digest: createHash('sha256').update(row.text).digest('hex') }))]
}

export function materializeProposal(value: unknown, input: AgentInput, sources: Source[], requestId: string): Proposal {
  const plan: ModelPlan = modelPlanSchema.parse(value)
  const now = new Date().toISOString()
  const fail = (message: string): never => { throw new Error(`INVALID_PROPOSAL: ${message}`) }
  const goals = new Map(input.workspace.goals.map(g => [g.id, g]))
  const nodes = new Map(input.workspace.nodes.map(n => [n.id, n]))
  const refs = new Map<string, string>()
  const reserve = (ref: string) => {
    if (refs.has(ref) || goals.has(ref) || nodes.has(ref)) fail('新增引用重复')
    refs.set(ref, randomUUID())
  }
  plan.goals.forEach(g => reserve(g.ref))
  plan.nodes.forEach(n => reserve(n.ref))
  const resolveGoal = (ref: string) => {
    if (goals.has(ref)) return ref
    if (!plan.goals.some(g => g.ref === ref)) return fail('目标引用不在授权快照内')
    return refs.get(ref)!
  }
  const resolveNode = (ref: string) => {
    if (nodes.has(ref)) return ref
    if (!plan.nodes.some(n => n.ref === ref)) return fail('节点引用不在授权快照内')
    return refs.get(ref)!
  }
  const newGoals = plan.goals.map(g => ({ id: refs.get(g.ref)!, title: g.title, description: g.description, dueDate: g.dueDate, criteria: g.criteria, verified: false, status: 'active' as const, createdAt: now }))
  newGoals.forEach(g => goals.set(g.id, g))
  const newNodes = plan.nodes.map((n, index) => ({ id: refs.get(n.ref)!, goalId: resolveGoal(n.goalRef), parentId: n.parentRef ? resolveNode(n.parentRef) : null, kind: n.kind, title: n.title, weight: 1, order: index }))
  newNodes.forEach(n => nodes.set(n.id, n))
  for (const n of newNodes) {
    const visited = new Set([n.id])
    let parent = n.parentId
    while (parent) {
      const p = nodes.get(parent)
      if (!p || p.goalId !== n.goalId || visited.has(parent)) fail('节点循环或跨目标引用')
      visited.add(parent)
      parent = p!.parentId
    }
  }
  const sourceMap = new Map(sources.map(s => [s.id, s]))
  const sourceIds = new Map(sources.map(s => [s.id, randomUUID()]))
  const tasks = plan.tasks.map(t => {
    const existing = t.targetTaskId ? input.workspace.tasks.find(x => x.id === t.targetTaskId) : null
    if (t.targetTaskId && (!existing || existing.locked)) fail('任务不存在或已锁定')
    const goalId = t.goalRef ? resolveGoal(t.goalRef) : null
    const nodeId = t.nodeRef ? resolveNode(t.nodeRef) : null
    if (nodeId && nodes.get(nodeId)?.goalId !== goalId) fail('任务与节点归属不一致')
    const ev = t.evidence.map(e => {
      const s = sourceMap.get(e.sourceId)
      if (!s || !s.text.includes(e.quote)) fail('来源引文不匹配')
      const conversationIndex = e.sourceId.startsWith('turn-') ? Number(e.sourceId.slice(5)) : -1
      if (conversationIndex >= 0 && input.conversation[conversationIndex]?.role === 'assistant' && e.kind !== 'assistant_claim' && e.kind !== 'suggestion') fail('助手回复不能升级为用户或工具证据')
      if (e.sourceId.startsWith('previous:') && !input.previousProposal?.tasks.some(task => task.evidence.some(old => `previous:${old.sourceId}` === e.sourceId && old.quote === e.quote && old.kind === e.kind))) fail('已有来源不能在修订中改变证据类型')
      return { ...e, sourceId: sourceIds.get(e.sourceId)! }
    })
    // Imported mixed-role content is never trusted as a direct completion instruction.
    const userClaim = t.evidence.some(e => e.kind === 'user_report' && (e.sourceId === 'current-input' ? input.mode !== 'import' : e.sourceId.startsWith('previous:') ? input.previousProposal?.tasks.some(old => old.status === 'reported_done' && old.evidence.some(ev => `previous:${ev.sourceId}` === e.sourceId && ev.quote === e.quote && ev.kind === 'user_report')) : input.conversation[Number(e.sourceId.slice(5))]?.role === 'user'))
    const reported = input.mode !== 'import' && t.status === 'reported_done' && userClaim
    return { id: randomUUID(), title: t.title, targetTaskId: t.targetTaskId, goalId, nodeId, status: reported ? 'reported_done' as const : 'todo' as const, estimateMinutes: t.estimateMinutes, plannedDate: t.plannedDate, dueDate: t.dueDate, importance: t.importance, urgent: t.urgent, evidence: ev, selected: !reported }
  })
  const referencedSourceIds = new Set(tasks.flatMap(t => t.evidence.map(e => e.sourceId)))
  referencedSourceIds.add(sourceIds.get('current-input')!)
  const proposal: Proposal = {
    id: requestId, revision: (input.previousProposal?.revision ?? 0) + 1,
    baseRevision: input.workspace.revision, inputRevision: input.inputRevision, createdAt: now,
    summary: plan.summary, question: plan.question, assumptions: plan.assumptions,
    goals: newGoals, nodes: newNodes, tasks, capacity: plan.capacity,
    sources: sources.map(s => ({ ...s, id: sourceIds.get(s.id)! })).filter(s => referencedSourceIds.has(s.id)), state: 'draft', engine: 'remote',
  }
  return proposalSchema.parse(proposal)
}
