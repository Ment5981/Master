import { beforeEach, describe, expect, it } from 'vitest'
import type { Task } from '../domain'

const memory = new Map<string, string>()
const memoryStorage: Storage = {
  get length() {
    return memory.size
  },
  clear: () => memory.clear(),
  getItem: (key) => memory.get(key) ?? null,
  key: (index) => [...memory.keys()][index] ?? null,
  removeItem: (key) => {
    memory.delete(key)
  },
  setItem: (key, value) => {
    memory.set(key, value)
  },
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: memoryStorage,
})

const { useMasterStore } = await import('./useMasterStore')

const baseTask: Task = {
  id: 'task-test',
  title: '完成进度回写',
  nodeId: 'milestone-model',
  quadrant: 'schedule',
  status: 'planned',
  estimatedMinutes: 45,
  actualMinutes: null,
  plannedDate: '2026-07-27',
  dueDate: '2026-07-28',
  createdAt: '2026-07-20T08:00:00.000Z',
  completedAt: null,
}

describe('Master 任务闭环', () => {
  beforeEach(() => {
    memory.clear()
    useMasterStore.setState({
      tasks: [baseTask],
      completionFeedback: null,
    })
  })

  it('完成任务时记录实际投入并触发节点反馈', () => {
    useMasterStore.getState().completeTask(baseTask.id, 52)

    const state = useMasterStore.getState()
    expect(state.tasks[0]).toMatchObject({
      status: 'completed',
      actualMinutes: 52,
    })
    expect(state.tasks[0].completedAt).toBeTruthy()
    expect(state.completionFeedback).toMatchObject({
      taskTitle: baseTask.title,
      nodeId: baseTask.nodeId,
    })
  })

  it('调整计划日期时同步任务计划状态', () => {
    useMasterStore.getState().planTask(baseTask.id, null)
    expect(useMasterStore.getState().tasks[0]).toMatchObject({
      plannedDate: null,
      status: 'inbox',
    })

    useMasterStore.getState().planTask(baseTask.id, '2026-07-30')
    expect(useMasterStore.getState().tasks[0]).toMatchObject({
      plannedDate: '2026-07-30',
      status: 'planned',
    })
  })

  it('拖动任务时只改变四象限归属', () => {
    useMasterStore.getState().moveTaskToQuadrant(baseTask.id, 'do')

    expect(useMasterStore.getState().tasks[0]).toMatchObject({
      quadrant: 'do',
      nodeId: baseTask.nodeId,
    })
  })
})
