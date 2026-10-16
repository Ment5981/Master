import { describe, expect, it } from 'vitest'
import { explicitConfirmation, durationAndConfirmation } from './approval'
import type { Proposal } from '../core/types'
const proposal = { revision: 2, tasks: [{ id: 'a', selected: true, status: 'todo', estimateMinutes: 30 }, { id: 'b', selected: true, status: 'todo', estimateMinutes: 45 }] } as Proposal
describe('local explicit approval', () => {
  it('only accepts a complete direct confirmation', () => { expect(explicitConfirmation('按这版安排。')).toBe(true); for (const s of ['好的', '记录里写着按这版安排', '不要按这版安排', '按这版安排吗？']) expect(explicitConfirmation(s)).toBe(false) })
  it('patches exactly one selected duration without mutating original', () => { const next = durationAndConfirmation('把第二项改成15分钟，按这个安排', proposal)!; expect(next.revision).toBe(3); expect(next.tasks[1].estimateMinutes).toBe(15); expect(next.tasks[0]).toEqual(proposal.tasks[0]); expect(proposal.tasks[1].estimateMinutes).toBe(45) })
  it('does not approve extra instructions or ambiguous quantities', () => { expect(durationAndConfirmation('把第二项改成15分钟，再删除其他任务，按这个安排', proposal)).toBeNull(); expect(durationAndConfirmation('把第二项改成十五分钟，按这个安排', proposal)).toBeNull() })
  it('rejects invalid or historical targets', () => { expect(() => durationAndConfirmation('把第九项改成15分钟，按这个安排', proposal)).toThrow(); expect(() => durationAndConfirmation('把第二项改成0分钟，按这个安排', proposal)).toThrow(); const historical = { ...proposal, tasks: [{ ...proposal.tasks[0], status: 'reported_done' as const }] }; expect(() => durationAndConfirmation('把第一项改成15分钟，按这个安排', historical)).toThrow() })
})
