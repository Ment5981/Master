import { dateKey, daysUntil, endOfLocalMonth, endOfLocalWeek, rangesOverlap, startOfLocalMonth, startOfLocalWeek } from "../lib/dates";
import type {
  GoalNode,
  NodeMetrics,
  Risk,
  Task,
  WorkspaceState,
} from "./types";

export function allStructureNodes(state: WorkspaceState) {
  return [state.goal, ...state.nodes];
}

export function structureNode(
  state: WorkspaceState,
  id: string | null | undefined,
) {
  if (!id) return null;
  if (id === state.goal.id) return state.goal;
  return state.nodes.find((node) => node.id === id) ?? null;
}

export function directChildren(state: WorkspaceState, parentId: string) {
  return state.nodes
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

export function descendantIds(state: WorkspaceState, nodeId: string) {
  const ids = new Set<string>([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of state.nodes) {
      if (ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function ancestorIds(state: WorkspaceState, nodeId: string | null) {
  const result = new Set<string>();
  if (!nodeId) return result;
  const byId = new Map(state.nodes.map((node) => [node.id, node]));
  let cursor = nodeId;
  while (cursor) {
    result.add(cursor);
    if (cursor === state.goal.id) break;
    cursor = byId.get(cursor)?.parentId ?? state.goal.id;
  }
  return result;
}

export function tasksForNode(
  state: WorkspaceState,
  nodeId: string,
  includeDescendants = true,
) {
  const ids = includeDescendants
    ? descendantIds(state, nodeId)
    : new Set([nodeId]);
  return state.tasks.filter((task) => task.nodeId && ids.has(task.nodeId));
}

export function nodeMetrics(
  state: WorkspaceState,
  nodeId: string,
  today = dateKey(),
): NodeMetrics {
  const node = structureNode(state, nodeId);
  const tasks = tasksForNode(state, nodeId);
  const minutes = tasks.reduce((sum, task) => sum + task.minutes, 0);
  const completedMinutes = tasks
    .filter((task) => task.status === "done")
    .reduce((sum, task) => sum + task.minutes, 0);
  const progress = minutes
    ? Math.round((completedMinutes / minutes) * 100)
    : node?.manualProgress ?? 0;
  const open = tasks.filter((task) => task.status !== "done");
  const blocked = open.filter((task) => task.status === "blocked");
  const overdue = open.some(
    (task) => task.dueDate && daysUntil(task.dueDate, today) < 0,
  );
  const nearDue = open.some(
    (task) =>
      task.dueDate &&
      daysUntil(task.dueDate, today) >= 0 &&
      daysUntil(task.dueDate, today) <= 7,
  );
  const nodeNearDue =
    node && "dueDate" in node && node.dueDate
      ? daysUntil(node.dueDate, today) <= 7
      : false;
  let risk: Risk =
    blocked.length || overdue
      ? "risk"
      : nearDue || nodeNearDue || (open.length > 0 && progress < 35)
        ? "watch"
        : "calm";
  if (node?.riskOverride && tasks.length === 0) risk = node.riskOverride;
  const status =
    progress >= 100
      ? ("done" as const)
      : blocked.length
        ? ("blocked" as const)
        : tasks.length || node?.status === "active"
          ? ("active" as const)
          : ("not_started" as const);
  return {
    progress,
    risk,
    status,
    taskCount: tasks.length,
    openTaskCount: open.length,
    completedTaskCount: tasks.length - open.length,
    blockedTaskCount: blocked.length,
    minutes,
  };
}

export function breadcrumb(state: WorkspaceState, nodeId: string) {
  const chain: string[] = [];
  const byId = new Map(state.nodes.map((node) => [node.id, node]));
  let cursor: string | null = nodeId;
  while (cursor) {
    if (cursor === state.goal.id) {
      chain.unshift(state.goal.title);
      break;
    }
    const node = byId.get(cursor);
    if (!node) break;
    chain.unshift(node.title);
    cursor = node.parentId;
  }
  return chain;
}

function taskDates(task: Task) {
  const start = task.plannedStartDate;
  return start
    ? { start, end: task.plannedEndDate ?? start }
    : null;
}

export function tasksForDay(state: WorkspaceState, day: string) {
  return state.tasks.filter((task) => {
    const dates = taskDates(task);
    return dates ? rangesOverlap(dates.start, dates.end, day, day) : false;
  });
}

export function tasksForWeek(state: WorkspaceState, day = dateKey()) {
  const start = startOfLocalWeek(day);
  const end = endOfLocalWeek(day);
  return state.tasks.filter((task) => {
    const dates = taskDates(task);
    return dates ? rangesOverlap(dates.start, dates.end, start, end) : false;
  });
}

export function tasksForMonth(state: WorkspaceState, month: string) {
  const start = startOfLocalMonth(month);
  const end = endOfLocalMonth(month);
  return state.tasks.filter((task) => {
    const dates = taskDates(task);
    return dates ? rangesOverlap(dates.start, dates.end, start, end) : false;
  });
}

export function unscheduledTasks(state: WorkspaceState) {
  return state.tasks.filter(
    (task) => task.status !== "done" && !task.plannedStartDate,
  );
}

export function nodeById(
  state: WorkspaceState,
  id: string,
): GoalNode | WorkspaceState["goal"] | undefined {
  return id === state.goal.id
    ? state.goal
    : state.nodes.find((node) => node.id === id);
}
