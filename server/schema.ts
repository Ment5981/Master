import { z } from 'zod'

const id = z.string().min(1).max(128)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}, '日期不存在')
const nullableDate = date.nullable()
const minutes = z.number().int().min(1).max(1440).nullable()
const importance = z.enum(['important', 'normal', 'unknown'])
const title = z.string().trim().min(1).max(240)
const timestamp = z.string().max(64)
const goal = z.object({ id, title, description: z.string().max(4000), dueDate: nullableDate, criteria: z.array(z.string().max(500)).max(20), verified: z.boolean(), status: z.enum(['active', 'paused', 'archived']), createdAt: timestamp, legacyRootNodeId: id.optional() }).strict()
const node = z.object({ id, goalId: id, parentId: id.nullable(), kind: z.enum(['element', 'milestone', 'subgoal']), title, weight: z.number().min(0).max(1000), order: z.number().int().min(0).max(10000) }).strict()
const task = z.object({ id, title, nodeId: id.nullable(), goalId: id.nullable(), status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']), importance, urgent: z.boolean().nullable(), estimateMinutes: minutes, dueDate: nullableDate, startDate: nullableDate, locked: z.boolean(), createdAt: timestamp, completedAt: timestamp.nullable(), completedDate: nullableDate.optional(), sourceId: id.nullable(), originKey: z.string().max(512).optional() }).strict()
const capacity = z.object({ date, minutes: z.number().int().min(0).max(1440), buffer: z.number().min(0).lt(1) }).strict()
const evidence = z.object({ sourceId: id, quote: z.string().min(1).max(2000), kind: z.enum(['user_report', 'assistant_claim', 'tool_result', 'suggestion']), messageId: id.optional() }).strict()
const draftTask = z.object({ id, title, targetTaskId: id.nullable(), goalId: id.nullable(), nodeId: id.nullable(), status: z.enum(['todo', 'reported_done']), estimateMinutes: minutes, plannedDate: nullableDate, dueDate: nullableDate, importance, urgent: z.boolean().nullable(), evidence: z.array(evidence).max(8), selected: z.boolean() }).strict()
const source = z.object({ id, title, text: z.string().max(24000), importedAt: timestamp, kind: z.enum(['conversation', 'import']), digest: z.string().max(128) }).strict()
export const proposalSchema = z.object({ id, revision: z.number().int().min(1), baseRevision: z.number().int().min(0), inputRevision: z.number().int().min(0), createdAt: timestamp, summary: z.string().max(2000), question: z.string().max(500).nullable(), assumptions: z.array(z.string().max(500)).max(20), goals: z.array(goal).max(8), nodes: z.array(node).max(100), tasks: z.array(draftTask).max(100), capacity: capacity.nullable(), sources: z.array(source).max(32), state: z.enum(['draft', 'applied', 'cancelled']), engine: z.enum(['remote', 'manual']) }).strict()
export const agentInputSchema = z.object({
  text: z.string().trim().min(1).max(24000), mode: z.enum(['plan', 'import', 'review']), date, inputRevision: z.number().int().min(0),
  workspace: z.object({ revision: z.number().int().min(0), goals: z.array(goal).max(100), nodes: z.array(node).max(1000), tasks: z.array(task).max(2000), allocations: z.array(z.object({ id, taskId: id, date, minutes }).strict()).max(3000), capacities: z.array(capacity).max(366) }).strict(),
  previousProposal: proposalSchema.optional(),
  reviewFacts: z.object({ start: date, end: date, timezone: z.string().max(100), snapshot: z.object({ completed: z.number().int().min(0), minutes: z.number().min(0), unknownTime: z.number().int().min(0), goalMinutes: z.record(z.string(), z.number().min(0)) }).strict(), completedTasks: z.array(z.object({ id, title, date }).strict()).max(100), incompleteList: z.boolean() }).strict().optional(),
  conversation: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(24000) }).strict()).max(30),
}).strict()

// The model can describe a draft, never mint approval, dates-of-completion or real time entries.
export const modelPlanSchema = z.object({
  summary: z.string().max(2000), question: z.string().max(500).nullable(), assumptions: z.array(z.string().max(500)).max(20),
  goals: z.array(z.object({ ref: id, title, description: z.string().max(4000), dueDate: nullableDate, criteria: z.array(z.string().max(500)).max(20) }).strict()).max(5),
  nodes: z.array(z.object({ ref: id, goalRef: id, parentRef: id.nullable(), kind: z.enum(['element', 'milestone', 'subgoal']), title }).strict()).max(60),
  tasks: z.array(z.object({ title, targetTaskId: id.nullable(), goalRef: id.nullable(), nodeRef: id.nullable(), status: z.enum(['todo', 'reported_done']), estimateMinutes: minutes, plannedDate: nullableDate, dueDate: nullableDate, importance, urgent: z.boolean().nullable(), evidence: z.array(z.object({ sourceId: id, quote: z.string().min(1).max(2000), kind: z.enum(['user_report', 'assistant_claim', 'tool_result', 'suggestion']) }).strict()).max(8) }).strict()).max(60),
  capacity: capacity.nullable(),
}).strict()
export type ModelPlan = z.infer<typeof modelPlanSchema>
