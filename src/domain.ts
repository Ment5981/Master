export type AppView = 'today' | 'map' | 'quadrants' | 'plan' | 'review'

export type GoalCategory =
  | 'career'
  | 'learning'
  | 'health'
  | 'finance'
  | 'family'
  | 'creative'
  | 'other'

export type GoalStatus = 'active' | 'paused' | 'completed'
export type NodeType = 'goal' | 'element' | 'milestone' | 'subgoal'
export type NodeStatus = 'not_started' | 'active' | 'blocked' | 'completed'
export type TaskStatus =
  | 'inbox'
  | 'planned'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'cancelled'

export type Quadrant = 'do' | 'schedule' | 'delegate' | 'eliminate'
export type ReviewPeriod = 'weekly' | 'monthly' | 'yearly'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface Goal {
  id: string
  title: string
  description: string
  category: GoalCategory
  startDate: string
  deadline: string
  successCriteria: string[]
  constraints: string
  weeklyHours: number
  status: GoalStatus
  createdAt: string
}

export interface GoalNode {
  id: string
  goalId: string
  parentId: string | null
  type: NodeType
  title: string
  description: string
  weight: number
  deadline: string | null
  status: NodeStatus
  order: number
}

export interface Task {
  id: string
  title: string
  nodeId: string | null
  quadrant: Quadrant
  status: TaskStatus
  estimatedMinutes: number
  actualMinutes: number | null
  plannedDate: string | null
  dueDate: string | null
  createdAt: string
  completedAt: string | null
}

export interface Review {
  id: string
  period: ReviewPeriod
  rangeStart: string
  rangeEnd: string
  wins: string
  friction: string
  insight: string
  nextFocusNodeIds: string[]
  createdAt: string
}

export interface GoalDraft {
  title: string
  description: string
  category: GoalCategory
  deadline: string
  successCriteria: string[]
  constraints: string
  weeklyHours: number
  elements: string[]
}

export interface NewTaskInput {
  title: string
  nodeId: string | null
  quadrant: Quadrant
  estimatedMinutes: number
  plannedDate: string | null
  dueDate: string | null
}

export type ActivityLevel =
  | 'not_started'
  | 'active'
  | 'steady'
  | 'cooling'
  | 'stalled'

export type RiskLevel = 'normal' | 'watch' | 'high' | 'blocked'

export interface BranchHealth {
  progress: number
  activity: ActivityLevel
  risk: RiskLevel
  plannedMinutes: number
  actualMinutes: number
  completedTasks: number
  totalTasks: number
  lastActivityAt: string | null
}
