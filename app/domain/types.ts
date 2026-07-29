export type Tab = "today" | "map" | "plan" | "review" | "me";
export type PlanView = "today" | "week" | "month" | "calendar";
export type Quadrant =
  | "important-urgent"
  | "important"
  | "urgent"
  | "later";
export type Risk = "calm" | "watch" | "risk";
export type NodeKind = "goal" | "factor" | "milestone" | "subgoal";
export type NodeStatus = "not_started" | "active" | "blocked" | "done";
export type TaskStatus = "todo" | "doing" | "blocked" | "done";
export type LayoutMode = "auto" | "pinned";
export type BranchSide = "left" | "right" | "center";

export type NodeLayout = {
  x: number;
  y: number;
  side: BranchSide;
  mode: LayoutMode;
};

export type Goal = {
  id: string;
  parentId: null;
  kind: "goal";
  title: string;
  note: string;
  order: number;
  collapsed: boolean;
  status: NodeStatus;
  riskOverride?: Risk;
  manualProgress?: number;
  layout: NodeLayout;
  deadline: string;
  successCriteria: string;
  constraints: string;
  weeklyHours: number;
  bufferPercent: number;
  createdAt: string;
  updatedAt: string;
};

export type GoalNode = {
  id: string;
  parentId: string;
  kind: Exclude<NodeKind, "goal">;
  title: string;
  note: string;
  order: number;
  collapsed: boolean;
  status: NodeStatus;
  riskOverride?: Risk;
  manualProgress?: number;
  historicalHours?: number;
  dueDate: string | null;
  layout: NodeLayout;
  createdAt: string;
  updatedAt: string;
};

export type Task = {
  id: string;
  title: string;
  nodeId: string | null;
  quadrant: Quadrant;
  minutes: number;
  status: TaskStatus;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  showOnMap: boolean;
  planningBucket?: "week" | "month" | null;
  layout: NodeLayout;
  createdAt: string;
  updatedAt: string;
};

export type MonthlyOutcome = {
  id: string;
  month: string;
  title: string;
  nodeId: string | null;
  completed: boolean;
};

export type CanvasViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type ReviewNotes = {
  wins: string;
  friction: string;
  next: string;
};

export type WorkspaceState = {
  version: 2;
  goal: Goal;
  nodes: GoalNode[];
  tasks: Task[];
  planning: {
    monthlyOutcomes: MonthlyOutcome[];
  };
  canvas: {
    viewport: CanvasViewport;
    hasSavedViewport?: boolean;
  };
  reviewNotes: ReviewNotes;
  reviews?: Record<string, ReviewNotes>;
  migration?: {
    migratedAt: string;
    sourceVersion: number;
    legacyV1?: unknown;
  };
};

export type LegacyFactor = {
  id: string;
  title: string;
  note: string;
  progress: number;
  risk: Risk;
  hours: number;
  milestones: string[];
};

export type LegacyTask = {
  id: string;
  title: string;
  nodeId: string;
  quadrant: Quadrant;
  plan: "today" | "week";
  minutes: number;
  completed: boolean;
};

export type LegacyState = {
  version: 1;
  goal: {
    title: string;
    deadline: string;
    successCriteria: string;
    constraints: string;
    weeklyHours: number;
    bufferPercent: number;
    progress: number;
    factors: LegacyFactor[];
  };
  tasks: LegacyTask[];
  reviewNotes: ReviewNotes;
};

export type NodeMetrics = {
  progress: number;
  risk: Risk;
  status: NodeStatus;
  taskCount: number;
  openTaskCount: number;
  completedTaskCount: number;
  blockedTaskCount: number;
  minutes: number;
};

export const KIND_LABELS: Record<NodeKind, string> = {
  goal: "长期目标",
  factor: "关键要素",
  milestone: "里程碑",
  subgoal: "子目标",
};

export const NEXT_KIND: Partial<Record<NodeKind, GoalNode["kind"]>> = {
  goal: "factor",
  factor: "milestone",
  milestone: "subgoal",
};

export const QUADRANTS: Array<{
  id: Quadrant;
  label: string;
  tip: string;
}> = [
  { id: "important-urgent", label: "重要且紧急", tip: "今天必须推动" },
  { id: "important", label: "重要不紧急", tip: "为长期目标留时间" },
  { id: "urgent", label: "不重要但紧急", tip: "快速处理或委托" },
  { id: "later", label: "不重要不紧急", tip: "减少或暂缓" },
];
