import type { GoalNode, WorkspaceState } from "./types";

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

const NODE_KINDS = new Set(["factor", "milestone", "subgoal"]);
const NODE_STATUSES = new Set(["not_started", "active", "blocked", "done"]);
const TASK_STATUSES = new Set(["todo", "doing", "blocked", "done"]);
const QUADRANTS = new Set([
  "important-urgent",
  "important",
  "urgent",
  "later",
]);
const RISKS = new Set(["calm", "watch", "risk"]);
const SIDES = new Set(["left", "right", "center"]);
const MODES = new Set(["auto", "pinned"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function isOptionalDate(value: unknown) {
  return value === null || isDate(value);
}

function isOptionalIso(value: unknown) {
  return (
    value === null ||
    (typeof value === "string" && Number.isFinite(Date.parse(value)))
  );
}

function isIso(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isFiniteBetween(value: unknown, min: number, max: number) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function validLayout(layout: WorkspaceState["goal"]["layout"] | undefined) {
  return Boolean(
    layout &&
      isFiniteBetween(layout.x, -1_000_000, 1_000_000) &&
      isFiniteBetween(layout.y, -1_000_000, 1_000_000) &&
      SIDES.has(layout.side) &&
      MODES.has(layout.mode),
  );
}

function validReviewNotes(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const notes = value as Record<string, unknown>;
  return ["wins", "friction", "next"].every(
    (field) => typeof notes[field] === "string",
  );
}

export function validateWorkspace(state: WorkspaceState): ValidationResult {
  const errors: string[] = [];
  const source = state as Partial<WorkspaceState>;
  if (source.version !== 2) errors.push("工作区版本无效");
  if (!source.goal || typeof source.goal !== "object") {
    return { ok: false, errors: [...errors, "中心目标缺失"] };
  }
  if (!Array.isArray(source.nodes) || !Array.isArray(source.tasks)) {
    return { ok: false, errors: [...errors, "节点或任务集合无效"] };
  }
  if (
    !source.planning ||
    !Array.isArray(source.planning.monthlyOutcomes) ||
    !source.canvas
  ) {
    return { ok: false, errors: [...errors, "计划或画布数据无效"] };
  }

  const goal = source.goal;
  if (
    goal.kind !== "goal" ||
    goal.parentId !== null ||
    typeof goal.id !== "string" ||
    !goal.id ||
    typeof goal.title !== "string" ||
    !goal.title.trim() ||
    goal.order !== 0 ||
    typeof goal.collapsed !== "boolean"
  ) {
    errors.push("中心目标结构无效");
  }
  if (!NODE_STATUSES.has(goal.status)) errors.push("中心目标状态无效");
  if (
    typeof goal.note !== "string" ||
    typeof goal.successCriteria !== "string" ||
    typeof goal.constraints !== "string"
  ) {
    errors.push("中心目标文本字段无效");
  }
  if (goal.riskOverride && !RISKS.has(goal.riskOverride)) {
    errors.push("中心目标风险状态无效");
  }
  if (!isDate(goal.deadline)) errors.push("中心目标截止日期无效");
  if (!isFiniteBetween(goal.weeklyHours, 0, 168)) {
    errors.push("每周可投入时间无效");
  }
  if (!isFiniteBetween(goal.bufferPercent, 0, 90)) {
    errors.push("弹性时间比例无效");
  }
  if (!validLayout(goal.layout)) errors.push("中心目标布局无效");
  if (!isIso(goal.createdAt) || !isIso(goal.updatedAt)) {
    errors.push("中心目标时间戳无效");
  }
  if (
    goal.manualProgress !== undefined &&
    !isFiniteBetween(goal.manualProgress, 0, 100)
  ) {
    errors.push("中心目标进度无效");
  }
  if (!validReviewNotes(source.reviewNotes)) errors.push("复盘记录无效");
  if (
    source.reviews &&
    (typeof source.reviews !== "object" ||
      Object.values(source.reviews).some((notes) => !validReviewNotes(notes)))
  ) {
    errors.push("周期复盘记录无效");
  }
  const viewport = source.canvas.viewport;
  if (
    !viewport ||
    !isFiniteBetween(viewport.x, -1_000_000, 1_000_000) ||
    !isFiniteBetween(viewport.y, -1_000_000, 1_000_000) ||
    !isFiniteBetween(viewport.zoom, 0.1, 3)
  ) {
    errors.push("画布视口无效");
  }
  if (
    source.canvas.hasSavedViewport !== undefined &&
    typeof source.canvas.hasSavedViewport !== "boolean"
  ) {
    errors.push("画布保存状态无效");
  }

  const nodeIds = new Set<string>([goal.id]);
  for (const node of source.nodes) {
    if (!node.id || nodeIds.has(node.id)) {
      errors.push(`节点 ID 重复或为空：${node.id}`);
    }
    nodeIds.add(node.id);
    if (!NODE_KINDS.has(node.kind)) errors.push(`节点类型无效：${node.id}`);
    if (!NODE_STATUSES.has(node.status)) errors.push(`节点状态无效：${node.id}`);
    if (node.riskOverride && !RISKS.has(node.riskOverride)) {
      errors.push(`节点风险无效：${node.id}`);
    }
    if (typeof node.title !== "string" || !node.title.trim()) {
      errors.push(`节点标题为空：${node.id}`);
    }
    if (typeof node.note !== "string") {
      errors.push(`节点说明无效：${node.id}`);
    }
    if (!Number.isInteger(node.order) || node.order < 0) {
      errors.push(`节点顺序无效：${node.id}`);
    }
    if (typeof node.collapsed !== "boolean") {
      errors.push(`节点展开状态无效：${node.id}`);
    }
    if (!isOptionalDate(node.dueDate)) errors.push(`节点日期无效：${node.id}`);
    if (!validLayout(node.layout)) errors.push(`节点布局无效：${node.id}`);
    if (!isIso(node.createdAt) || !isIso(node.updatedAt)) {
      errors.push(`节点时间戳无效：${node.id}`);
    }
    if (
      node.manualProgress !== undefined &&
      !isFiniteBetween(node.manualProgress, 0, 100)
    ) {
      errors.push(`节点进度无效：${node.id}`);
    }
  }

  for (const node of source.nodes) {
    if (!nodeIds.has(node.parentId)) errors.push(`节点缺少父级：${node.id}`);
  }

  const taskIds = new Set<string>();
  for (const task of source.tasks) {
    if (!task.id || taskIds.has(task.id)) {
      errors.push(`任务 ID 重复或为空：${task.id}`);
    }
    taskIds.add(task.id);
    if (typeof task.title !== "string" || !task.title.trim()) {
      errors.push(`任务标题为空：${task.id}`);
    }
    if (task.nodeId && !nodeIds.has(task.nodeId)) {
      errors.push(`任务关联节点不存在：${task.id}`);
    }
    if (!QUADRANTS.has(task.quadrant)) errors.push(`任务象限无效：${task.id}`);
    if (!TASK_STATUSES.has(task.status)) errors.push(`任务状态无效：${task.id}`);
    if (typeof task.showOnMap !== "boolean") {
      errors.push(`任务地图状态无效：${task.id}`);
    }
    if (
      task.planningBucket !== undefined &&
      task.planningBucket !== null &&
      task.planningBucket !== "week" &&
      task.planningBucket !== "month"
    ) {
      errors.push(`任务计划归属无效：${task.id}`);
    }
    if (!isFiniteBetween(task.minutes, 1, 10_080)) {
      errors.push(`任务时长无效：${task.id}`);
    }
    if (
      !isOptionalDate(task.plannedStartDate) ||
      !isOptionalDate(task.plannedEndDate) ||
      !isOptionalDate(task.dueDate) ||
      !isOptionalIso(task.completedAt)
    ) {
      errors.push(`任务日期格式无效：${task.id}`);
    }
    if (!task.plannedStartDate && task.plannedEndDate) {
      errors.push(`任务缺少开始日期：${task.id}`);
    }
    if (
      task.plannedStartDate &&
      task.plannedEndDate &&
      task.plannedEndDate < task.plannedStartDate
    ) {
      errors.push(`任务日期范围无效：${task.id}`);
    }
    if (!validLayout(task.layout)) errors.push(`任务布局无效：${task.id}`);
    if (!isIso(task.createdAt) || !isIso(task.updatedAt)) {
      errors.push(`任务时间戳无效：${task.id}`);
    }
  }

  const byId = new Map(source.nodes.map((node) => [node.id, node]));
  const allowedParent = {
    factor: "goal",
    milestone: "factor",
    subgoal: "milestone",
  } as const;
  for (const node of source.nodes) {
    const parentKind =
      node.parentId === goal.id ? goal.kind : byId.get(node.parentId)?.kind;
    if (parentKind && parentKind !== allowedParent[node.kind]) {
      errors.push(`节点层级无效：${node.id}`);
    }
    const visited = new Set([node.id]);
    let cursor: GoalNode | undefined = node;
    while (cursor?.parentId && cursor.parentId !== goal.id) {
      if (visited.has(cursor.parentId)) {
        errors.push(`节点形成循环：${node.id}`);
        break;
      }
      visited.add(cursor.parentId);
      cursor = byId.get(cursor.parentId);
    }
  }

  const outcomeIds = new Set<string>();
  for (const outcome of source.planning.monthlyOutcomes) {
    if (!outcome.id || outcomeIds.has(outcome.id)) {
      errors.push(`月度成果 ID 重复或为空：${outcome.id}`);
    }
    outcomeIds.add(outcome.id);
    if (
      typeof outcome.month !== "string" ||
      !/^\d{4}-\d{2}$/.test(outcome.month) ||
      !isDate(`${outcome.month}-01`)
    ) {
      errors.push(`月度成果月份无效：${outcome.id}`);
    }
    if (
      typeof outcome.title !== "string" ||
      !outcome.title.trim() ||
      typeof outcome.completed !== "boolean"
    ) {
      errors.push(`月度成果内容无效：${outcome.id}`);
    }
    if (outcome.nodeId && !nodeIds.has(outcome.nodeId)) {
      errors.push(`月度成果关联节点不存在：${outcome.id}`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

export function assertWorkspace(state: WorkspaceState) {
  const result = validateWorkspace(state);
  if (!result.ok) throw new Error(result.errors.join("；"));
  return state;
}
