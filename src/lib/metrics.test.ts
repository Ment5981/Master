import { addDays, formatISO } from 'date-fns'
import { describe, expect, it } from 'vitest'
import type { Goal, GoalNode, Task } from '../domain'
import {
  computeBranchHealth,
  computeNodeProgress,
  getDescendantNodeIds,
  taskCompletionRate,
} from './metrics'

const day = (offset: number) =>
  formatISO(addDays(new Date(), offset), { representation: 'date' })

const goal: Goal = {
  id: 'goal',
  title: '长期目标',
  description: '',
  category: 'other',
  startDate: day(-10),
  deadline: day(90),
  successCriteria: ['完成'],
  constraints: '',
  weeklyHours: 10,
  status: 'active',
  createdAt: new Date().toISOString(),
}

const nodes: GoalNode[] = [
  {
    id: 'root',
    goalId: 'goal',
    parentId: null,
    type: 'goal',
    title: '长期目标',
    description: '',
    weight: 100,
    deadline: day(90),
    status: 'active',
    order: 0,
  },
  {
    id: 'branch-a',
    goalId: 'goal',
    parentId: 'root',
    type: 'element',
    title: '分支 A',
    description: '',
    weight: 75,
    deadline: day(60),
    status: 'active',
    order: 0,
  },
  {
    id: 'branch-b',
    goalId: 'goal',
    parentId: 'root',
    type: 'element',
    title: '分支 B',
    description: '',
    weight: 25,
    deadline: day(60),
    status: 'active',
    order: 1,
  },
  {
    id: 'leaf-a',
    goalId: 'goal',
    parentId: 'branch-a',
    type: 'milestone',
    title: '里程碑 A',
    description: '',
    weight: 1,
    deadline: day(30),
    status: 'active',
    order: 0,
  },
  {
    id: 'leaf-b',
    goalId: 'goal',
    parentId: 'branch-b',
    type: 'milestone',
    title: '里程碑 B',
    description: '',
    weight: 1,
    deadline: day(30),
    status: 'active',
    order: 0,
  },
]

const task = (
  id: string,
  nodeId: string,
  status: Task['status'],
  estimatedMinutes = 60,
): Task => ({
  id,
  title: id,
  nodeId,
  quadrant: 'schedule',
  status,
  estimatedMinutes,
  actualMinutes: status === 'completed' ? estimatedMinutes : null,
  plannedDate: day(0),
  dueDate: day(10),
  createdAt: new Date().toISOString(),
  completedAt: status === 'completed' ? new Date().toISOString() : null,
})

describe('目标进度与健康度', () => {
  it('递归找到一个分支中的全部后代', () => {
    expect([...getDescendantNodeIds('branch-a', nodes)]).toEqual([
      'branch-a',
      'leaf-a',
    ])
  })

  it('按任务预计时间计算叶节点进度，并按分支权重回写根目标', () => {
    const tasks = [
      task('a-done', 'leaf-a', 'completed', 60),
      task('a-open', 'leaf-a', 'planned', 60),
      task('b-done', 'leaf-b', 'completed', 30),
    ]

    expect(computeNodeProgress('leaf-a', nodes, tasks)).toBe(50)
    expect(computeNodeProgress('leaf-b', nodes, tasks)).toBe(100)
    expect(computeNodeProgress('root', nodes, tasks)).toBe(63)
  })

  it('阻塞任务会把对应分支标记为阻塞风险', () => {
    const health = computeBranchHealth(
      goal,
      nodes[1],
      nodes,
      [task('blocked', 'leaf-a', 'blocked')],
    )

    expect(health.risk).toBe('blocked')
    expect(health.totalTasks).toBe(1)
  })

  it('完成率忽略已取消任务', () => {
    expect(
      taskCompletionRate([
        task('done', 'leaf-a', 'completed'),
        task('open', 'leaf-a', 'planned'),
        task('cancelled', 'leaf-a', 'cancelled'),
      ]),
    ).toBe(50)
  })
})
