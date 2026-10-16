export type Theme = 'system' | 'light' | 'dark'
export type View = 'today' | 'map' | 'plan' | 'review' | 'settings'
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'
export type Importance = 'important' | 'normal' | 'unknown'
export interface Goal {
  id: string; title: string; description: string; dueDate: string | null
  criteria: string[]; verified: boolean; status: 'active' | 'paused' | 'archived'
  createdAt: string
  legacyRootNodeId?: string
}
export interface GoalNode {
  id: string; goalId: string; parentId: string | null
  kind: 'element' | 'milestone' | 'subgoal'; title: string; weight: number; order: number
}
export interface Task {
  id: string; title: string; nodeId: string | null; goalId: string | null
  status: TaskStatus; importance: Importance; urgent: boolean | null
  estimateMinutes: number | null; dueDate: string | null; startDate: string | null
  locked: boolean; createdAt: string; completedAt: string | null; sourceId: string | null
  originKey?: string
  completedDate?: string | null
}
export interface Allocation { id: string; taskId: string; date: string; minutes: number | null }
export interface TimeEntry { id: string; taskId: string; date: string | null; minutes: number; source: 'manual' | 'timer' | 'legacy'; goalId?: string | null; nodeId?: string | null }
export interface Capacity { date: string; minutes: number; buffer: number }
export interface Review {
  id: string; period: 'week' | 'month' | 'year'; start: string; end: string
  notes: string; next: string; createdAt: string
  snapshot: { completed: number; minutes: number; unknownTime: number; goalMinutes: Record<string, number> }
  snapshotStatus?: 'captured' | 'unavailable'
}
export interface Source { id: string; title: string; text: string; importedAt: string; kind: 'conversation' | 'import'; digest: string }
export interface Evidence { sourceId: string; quote: string; kind: 'user_report' | 'assistant_claim' | 'tool_result' | 'suggestion'; messageId?: string }
export interface DraftTask {
  id: string; title: string; targetTaskId: string | null; goalId: string | null; nodeId: string | null
  status: 'todo' | 'reported_done'; estimateMinutes: number | null; plannedDate: string | null
  dueDate: string | null; importance: Importance; urgent: boolean | null
  evidence: Evidence[]; selected: boolean
}
export interface Proposal {
  id: string; revision: number; baseRevision: number; inputRevision: number; createdAt: string
  summary: string; question: string | null; assumptions: string[]
  goals: Goal[]; nodes: GoalNode[]; tasks: DraftTask[]; capacity: Capacity | null
  sources: Source[]; state: 'draft' | 'applied' | 'cancelled'; engine: 'remote' | 'manual'
}
export interface Preferences { theme: Theme; aiConsent: boolean; audioConsent: boolean; speak: boolean; gatewayUrl: string; timezone: string }
export interface Workspace {
  schemaVersion: 2; id: string; revision: number; name: string
  goals: Goal[]; nodes: GoalNode[]; tasks: Task[]; allocations: Allocation[]
  timeEntries: TimeEntry[]; capacities: Capacity[]; reviews: Review[]; sources: Source[]; proposals: Proposal[]
  preferences: Preferences; imports: string[]
}
export type Command =
  | { type: 'create_goal'; goal: Goal; nodes: GoalNode[] }
  | { type: 'update_goal'; id: string; changes: Partial<Pick<Goal, 'title' | 'description' | 'dueDate' | 'criteria' | 'verified' | 'status'>> }
  | { type: 'create_node'; node: GoalNode }
  | { type: 'update_node'; id: string; changes: Partial<Pick<GoalNode, 'title' | 'parentId' | 'weight'>> }
  | { type: 'create_task'; task: Task; allocation?: Allocation }
  | { type: 'update_task'; id: string; changes: Partial<Pick<Task, 'title' | 'goalId' | 'nodeId' | 'status' | 'importance' | 'urgent' | 'estimateMinutes' | 'dueDate' | 'startDate' | 'locked'>>; scheduling?: { fromDate: string | null; toDate: string | null; minutes: number | null } }
  | { type: 'complete_task'; id: string; done: boolean; date: string; minutes?: number }
  | { type: 'allocate'; taskId: string; date: string | null; minutes: number | null }
  | { type: 'reschedule'; taskId: string; fromDate: string; toDate: string }
  | { type: 'unallocate'; taskId: string; date: string }
  | { type: 'capacity'; capacity: Capacity }
  | { type: 'save_review'; review: Review }
  | { type: 'preferences'; changes: Partial<Preferences> }
  | { type: 'save_proposal'; proposal: Proposal }
  | { type: 'cancel_proposal'; id: string }
  | { type: 'apply_proposal'; id: string; revision: number; verifiedTaskIds: string[] }
  | { type: 'import'; workspace: Workspace; digest: string }
export interface Receipt { operationId: string; revision: number; label: string; at: string }
export interface CommitRequest { operationId: string; expectedRevision: number; command: Command }
export interface Repository {
  load(): Promise<Workspace>
  execute(request: CommitRequest): Promise<{ workspace: Workspace; receipt: Receipt }>
  undo(): Promise<{ workspace: Workspace; receipt: Receipt }>
  subscribe(callback: () => void): () => void
  export(): Promise<string>
}
export interface GatewayHealth { ready: boolean; ai: boolean; asr: boolean; tts: boolean; provider: string; message: string }
export interface AgentInput {
  text: string; mode: 'plan' | 'import' | 'review'; date: string; inputRevision: number
  workspace: Pick<Workspace, 'revision' | 'goals' | 'nodes' | 'tasks' | 'allocations' | 'capacities'>
  previousProposal?: Proposal; conversation: Array<{ role: 'user' | 'assistant'; text: string }>
  reviewFacts?: { start: string; end: string; timezone: string; snapshot: Review['snapshot']; completedTasks: Array<{id: string; title: string; date: string}>; incompleteList: boolean }
}
