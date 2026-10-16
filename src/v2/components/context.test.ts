import { describe, expect, it } from 'vitest'
import { createEmptyWorkspace, createGoal, createTask } from '../core'
import { localDay, planningContext, reviewFacts } from './context'
describe('bounded factual AI context', () => {
  it('uses workspace day, not the device date', () => { expect(localDay('America/Los_Angeles', new Date('2026-09-28T00:30:00Z'))).toBe('2026-09-27'); expect(localDay('Asia/Shanghai', new Date('2026-09-28T00:30:00Z'))).toBe('2026-09-28') })
  it('keeps parent relationships and excludes archived/uncopied task allocations', () => {
    const w = createEmptyWorkspace(), goal = createGoal('目标'), archived = { ...createGoal('旧目标'), status: 'archived' as const }; w.goals = [goal, archived]
    w.nodes = [{ id: 'child', parentId: 'parent', goalId: goal.id, title: '子', kind: 'milestone', weight: 1, order: 1 }, { id: 'parent', parentId: null, goalId: goal.id, title: '父', kind: 'element', weight: 1, order: 0 }]
    const task = createTask('任务', { nodeId: 'child', goalId: goal.id }); w.tasks = [task, createTask('归档行动', { goalId: archived.id })]
    w.allocations = w.tasks.map(t => ({ id: t.id, taskId: t.id, date: '2026-09-28', minutes: 10 }))
    const scope = planningContext(w); expect(scope.nodes).toHaveLength(2); expect(scope.tasks).toHaveLength(1); expect(scope.allocations).toHaveLength(1)
  })
  it('review passes actual records, never substitutes estimates', () => {
    const w = createEmptyWorkspace(), task = createTask('做完', { status: 'done', completedAt: '2026-09-28T04:00:00Z', estimateMinutes: 100 }); w.preferences.timezone = 'Asia/Shanghai'; w.tasks = [task]
    const facts = reviewFacts(w, { start: '2026-09-01', end: '2026-09-30' }); expect(facts.snapshot.minutes).toBe(0); expect(facts.snapshot.unknownTime).toBe(1); expect(facts.completedTasks[0].date).toBe('2026-09-28')
  })
})
