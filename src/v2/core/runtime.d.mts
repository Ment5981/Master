import type { Workspace, Goal, Task, Command, Review } from './types'
export class DomainError extends Error { code: string; constructor(code: string, message: string) }
export const ENTITY_TABLES: readonly ['goals','nodes','tasks','allocations','timeEntries','capacities','reviews','sources','proposals']
export function newId(): string
export function todayISO(now?: Date): string
export function validDate(date: unknown): date is string
export function addDays(date: string, count: number): string
export function createEmptyWorkspace(): Workspace
export function createDemoWorkspace(today?: string): Workspace
export function createTask(title: string, overrides?: Partial<Task>): Task
export function createGoal(title: string): Goal
export function stableStringify(value: unknown): string
export function digestText(text: string): string
export function validateWorkspace(state: Workspace): Workspace
export function nodeProgress(state: Workspace, id: string): number
export function goalProgress(state: Workspace, id: string): number
export function progressSnapshot(state: Workspace): { nodes: Record<string,number>; goals: Record<string,number> }
export function dateInTimezone(value: string | null, timezone: string): string | null
export function taskCompletionDate(task: Task, timezone: string): string | null
export interface DayCapacity { capacityMinutes: number; plannedMinutes: number; actualMinutes: number; consumedMinutes: number; remainingMinutes: number; overMinutes: number; unknownTasks: number; buffer: number; knownCapacity: boolean }
export function dayCapacity(state: Workspace, date: string): DayCapacity
export function reviewSnapshot(state: Workspace, start: string, end: string): Review['snapshot']
export function reduceCommand(current: Workspace, command: Command, context?: { now?: string }): Workspace
export function commandLabel(command: Command): string
export function workspaceMeta(state: Workspace): Omit<Workspace, typeof ENTITY_TABLES[number]>
export function entityKey(table: string, row: unknown): string
export interface EntityChange { put: Array<Record<string, unknown>>; remove: string[]; inverse: Array<{id:string; value: unknown}> }
export function entityDiff(before: Workspace, after: Workspace): Record<typeof ENTITY_TABLES[number], EntityChange>
export interface WorkspaceInverse { meta: Omit<Workspace, typeof ENTITY_TABLES[number]>; tables: Record<typeof ENTITY_TABLES[number], Array<{id:string; value:unknown}>> }
export function inverseFor(before: Workspace, after: Workspace): WorkspaceInverse
export function restoreInverse(current: Workspace, inverse: WorkspaceInverse): Workspace
