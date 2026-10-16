import { differenceInCalendarDays, isAfter, parseISO } from 'date-fns'
import type {
  BranchHealth,
  Goal,
  GoalNode,
  RiskLevel,
  Task,
} from '../domain'

export const getChildNodes = (nodeId: string, nodes: GoalNode[]) =>
  nodes
    .filter((node) => node.parentId === nodeId)
    .sort((a, b) => a.order - b.order)

export const getDescendantNodeIds = (nodeId: string, nodes: GoalNode[]) => {
  const ids = new Set<string>([nodeId])
  const visit = (parentId: string) => {
    getChildNodes(parentId, nodes).forEach((child) => {
      ids.add(child.id)
      visit(child.id)
    })
  }
  visit(nodeId)
  return ids
}

export const getBranchTasks = (
  nodeId: string,
  nodes: GoalNode[],
  tasks: Task[],
) => {
  const ids = getDescendantNodeIds(nodeId, nodes)
  return tasks.filter((task) => task.nodeId && ids.has(task.nodeId))
}

const taskCompletion = (task: Task) =>
  task.status === 'completed' ? task.estimatedMinutes : 0

export const computeNodeProgress = (
  nodeId: string,
  nodes: GoalNode[],
  tasks: Task[],
): number => {
  const children = getChildNodes(nodeId, nodes)

  if (children.length) {
    const totalWeight = children.reduce(
      (sum, child) => sum + Math.max(child.weight, 1),
      0,
    )
    const weighted = children.reduce(
      (sum, child) =>
        sum +
        computeNodeProgress(child.id, nodes, tasks) *
          Math.max(child.weight, 1),
      0,
    )
    return Math.round(weighted / totalWeight)
  }

  const directTasks = tasks.filter(
    (task) => task.nodeId === nodeId && task.status !== 'cancelled',
  )
  if (!directTasks.length) return 0

  const total = directTasks.reduce(
    (sum, task) => sum + Math.max(task.estimatedMinutes, 5),
    0,
  )
  const complete = directTasks.reduce(
    (sum, task) => sum + taskCompletion(task),
    0,
  )
  return Math.min(100, Math.round((complete / total) * 100))
}

const computeRisk = (
  goal: Goal,
  node: GoalNode,
  branchTasks: Task[],
  progress: number,
): RiskLevel => {
  const incomplete = branchTasks.filter(
    (task) => !['completed', 'cancelled'].includes(task.status),
  )
  if (incomplete.some((task) => task.status === 'blocked')) return 'blocked'

  const now = new Date()
  const deadline = parseISO(node.deadline ?? goal.deadline)
  const remainingDays = Math.max(differenceInCalendarDays(deadline, now), 0)
  const remainingMinutes = incomplete.reduce(
    (sum, task) => sum + task.estimatedMinutes,
    0,
  )
  const weeklyCapacity = Math.max(goal.weeklyHours * 60, 60)
  const availableMinutes = Math.max(
    (remainingDays / 7) * weeklyCapacity,
    weeklyCapacity / 7,
  )
  const pressure = remainingMinutes / availableMinutes

  if (isAfter(now, deadline) && progress < 100) return 'high'
  if (pressure > 1 || (remainingDays <= 3 && progress < 80)) return 'high'
  if (pressure >= 0.7 || (remainingDays <= 7 && progress < 60)) return 'watch'
  return 'normal'
}

export const computeBranchHealth = (
  goal: Goal,
  node: GoalNode,
  nodes: GoalNode[],
  tasks: Task[],
): BranchHealth => {
  const branchTasks = getBranchTasks(node.id, nodes, tasks).filter(
    (task) => task.status !== 'cancelled',
  )
  const completed = branchTasks.filter((task) => task.status === 'completed')
  const completionDates = completed
    .map((task) => task.completedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
  const lastActivityAt = completionDates.at(-1) ?? null
  const daysSinceActivity = lastActivityAt
    ? differenceInCalendarDays(new Date(), parseISO(lastActivityAt))
    : Number.POSITIVE_INFINITY

  const activity =
    branchTasks.length === 0 || !lastActivityAt
      ? 'not_started'
      : daysSinceActivity <= 3
        ? 'active'
        : daysSinceActivity <= 7
          ? 'steady'
          : daysSinceActivity <= 14
            ? 'cooling'
            : 'stalled'

  const progress = computeNodeProgress(node.id, nodes, tasks)
  return {
    progress,
    activity,
    risk: computeRisk(goal, node, branchTasks, progress),
    plannedMinutes: branchTasks.reduce(
      (sum, task) => sum + task.estimatedMinutes,
      0,
    ),
    actualMinutes: completed.reduce(
      (sum, task) => sum + (task.actualMinutes ?? task.estimatedMinutes),
      0,
    ),
    completedTasks: completed.length,
    totalTasks: branchTasks.length,
    lastActivityAt,
  }
}

export const taskCompletionRate = (tasks: Task[]) => {
  const relevant = tasks.filter((task) => task.status !== 'cancelled')
  if (!relevant.length) return 0
  return Math.round(
    (relevant.filter((task) => task.status === 'completed').length /
      relevant.length) *
      100,
  )
}
