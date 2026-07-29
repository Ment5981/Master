import { dateKey, monthKey, shiftDate } from "../lib/dates";
import type {
  Goal,
  GoalNode,
  LegacyState,
  NodeLayout,
  Task,
  WorkspaceState,
} from "./types";

const DEFAULT_LAYOUT: NodeLayout = {
  x: 0,
  y: 0,
  side: "center",
  mode: "auto",
};

const clone = <T,>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

function stamp(day: string) {
  return `${day}T00:00:00.000Z`;
}

function factorSide(index: number) {
  return index % 2 === 0 ? ("right" as const) : ("left" as const);
}

export function createInitialWorkspace(day = dateKey()): WorkspaceState {
  const createdAt = stamp(day);
  const factorSpecs = [
    ["product", "产品定义", "明确核心场景、拆解规则与验证标准。", "calm"],
    ["experience", "核心体验", "让目标拆解、任务安排和完成反馈自然连成一条线。", "watch"],
    ["development", "设计开发", "构建稳定、可保存且适合真实验证的产品基础。", "risk"],
    ["validation", "用户验证", "找到真实使用阻力，验证时间地图是否优于任务清单。", "watch"],
    ["launch", "发布上线", "以稳定、克制的方式完成发布，并建立首轮反馈入口。", "calm"],
  ] as const;
  const milestoneTitles: Record<string, string[]> = {
    product: ["核心流程确定", "V1 范围冻结"],
    experience: ["手机原型", "交互走查"],
    development: ["数据层", "核心闭环"],
    validation: ["招募体验者", "两周反馈"],
    launch: ["发布检查", "首批用户进入"],
  };

  const nodes: GoalNode[] = [];
  factorSpecs.forEach(([id, title, note, risk], factorIndex) => {
    const side = factorSide(factorIndex);
    nodes.push({
      id,
      parentId: "goal-root",
      kind: "factor",
      title,
      note,
      order: factorIndex,
      collapsed: id !== "development",
      status: "active",
      riskOverride: risk,
      dueDate: "2026-09-30",
      layout: { ...DEFAULT_LAYOUT, side },
      createdAt,
      updatedAt: createdAt,
    });
    milestoneTitles[id].forEach((milestoneTitle, milestoneIndex) => {
      const milestoneId = `${id}-milestone-${milestoneIndex + 1}`;
      nodes.push({
        id: milestoneId,
        parentId: id,
        kind: "milestone",
        title: milestoneTitle,
        note: `完成「${milestoneTitle}」，让${title}进入下一阶段。`,
        order: milestoneIndex,
        collapsed: id !== "development" || milestoneIndex !== 1,
        status: "active",
        dueDate: shiftDate(day, 14 + factorIndex * 3 + milestoneIndex * 7),
        layout: { ...DEFAULT_LAYOUT, side },
        createdAt,
        updatedAt: createdAt,
      });
      if (id === "development" && milestoneIndex === 1) {
        nodes.push({
          id: "development-subgoal-calendar",
          parentId: milestoneId,
          kind: "subgoal",
          title: "月计划与日历联动",
          note: "让目标、四象限和真实日期只使用同一份任务数据。",
          order: 0,
          collapsed: false,
          status: "active",
          dueDate: shiftDate(day, 18),
          layout: { ...DEFAULT_LAYOUT, side },
          createdAt,
          updatedAt: createdAt,
        });
      }
    });
  });

  const taskSpecs = [
    ["t1", "冻结 V1 核心范围", "product", "important-urgent", -1, 45, "done"],
    ["t2", "完成手机端目标地图", "experience", "important-urgent", 0, 90, "doing"],
    ["t3", "打通任务与节点进度", "development", "important", 0, 75, "doing"],
    ["t4", "整理首轮访谈提纲", "validation", "important", 1, 40, "todo"],
    ["t5", "确认数据保存策略", "development-milestone-1", "urgent", -2, 30, "done"],
    ["t6", "优化节点详情层级", "experience-milestone-2", "important", 3, 60, "todo"],
    ["t7", "邀请 5 位体验用户", "validation", "important", 5, 50, "todo"],
    ["t8", "整理产品说明文档", "product", "later", 8, 35, "todo"],
    ["t9", "验证日历拖拽改期", "development-subgoal-calendar", "important-urgent", 2, 45, "todo"],
  ] as const;
  const tasks: Task[] = taskSpecs.map(
    ([id, title, nodeId, quadrant, offset, minutes, status], index) => {
      const plannedStartDate = shiftDate(day, offset);
      const isDone = status === "done";
      return {
        id,
        title,
        nodeId,
        quadrant,
        minutes,
        status,
        plannedStartDate,
        plannedEndDate: index === 8 ? shiftDate(day, offset + 2) : plannedStartDate,
        dueDate: shiftDate(day, Math.max(offset + 2, 1)),
        completedAt: isDone ? `${plannedStartDate}T09:00:00.000Z` : null,
        showOnMap: id === "t3" || id === "t9",
        layout: { ...DEFAULT_LAYOUT, side: "right" },
        createdAt,
        updatedAt: createdAt,
      };
    },
  );

  const goal: Goal = {
    id: "goal-root",
    parentId: null,
    kind: "goal",
    title: "完成 Master V1 发布验证",
    note: "把长期目标、时间投入和日常行动连接成一张可持续更新的地图。",
    order: 0,
    collapsed: false,
    status: "active",
    layout: { ...DEFAULT_LAYOUT },
    deadline: "2026-09-30",
    successCriteria:
      "完成目标地图、四象限任务、动态进度与周期复盘的真实闭环，并邀请 5 位用户连续体验两周。",
    constraints:
      "每周最多投入 12 小时；优先手机端；第一版保持功能克制，不扩展团队协作。",
    weeklyHours: 12,
    bufferPercent: 25,
    createdAt,
    updatedAt: createdAt,
  };

  return {
    version: 2,
    goal,
    nodes,
    tasks,
    planning: {
      monthlyOutcomes: [
        {
          id: "outcome-1",
          month: monthKey(new Date(`${day}T12:00:00`)),
          title: "完成可真实使用的核心闭环",
          nodeId: "development",
          completed: false,
        },
        {
          id: "outcome-2",
          month: monthKey(new Date(`${day}T12:00:00`)),
          title: "邀请首批体验者进入两周验证",
          nodeId: "validation",
          completed: false,
        },
      ],
    },
    canvas: { viewport: { x: 0, y: 0, zoom: 0.86 } },
    reviewNotes: {
      wins: "目标范围比上周更清晰，核心页面已完成视觉定向。",
      friction: "设计开发分支投入较多，但数据保存仍是截止风险。",
      next: "下周减少视觉微调，把 60% 的可用时间放到核心闭环。",
    },
  };
}

export function isWorkspaceV2(value: unknown): value is WorkspaceState {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { version?: unknown }).version === 2,
  );
}

export function isLegacyWorkspace(value: unknown): value is LegacyState {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { version?: unknown }).version === 1,
  );
}

export function migrateWorkspace(
  value: unknown,
  day = dateKey(),
): WorkspaceState {
  if (isWorkspaceV2(value)) return clone(value);
  if (value == null) return createInitialWorkspace(day);
  if (!isLegacyWorkspace(value)) {
    throw new Error("无法识别的工作区版本");
  }

  const createdAt = stamp(day);
  const goal: Goal = {
    id: "goal-root",
    parentId: null,
    kind: "goal",
    title: value.goal.title,
    note: value.goal.successCriteria,
    order: 0,
    collapsed: false,
    status: "active",
    manualProgress: value.goal.progress,
    layout: { ...DEFAULT_LAYOUT },
    deadline: value.goal.deadline,
    successCriteria: value.goal.successCriteria,
    constraints: value.goal.constraints,
    weeklyHours: value.goal.weeklyHours,
    bufferPercent: value.goal.bufferPercent,
    createdAt,
    updatedAt: createdAt,
  };
  const nodes: GoalNode[] = [];
  value.goal.factors.forEach((factor, factorIndex) => {
    const side = factorSide(factorIndex);
    nodes.push({
      id: factor.id,
      parentId: goal.id,
      kind: "factor",
      title: factor.title,
      note: factor.note,
      order: factorIndex,
      collapsed: true,
      status: factor.progress >= 100 ? "done" : "active",
      riskOverride: factor.risk,
      manualProgress: factor.progress,
      historicalHours: factor.hours,
      dueDate: value.goal.deadline || null,
      layout: { ...DEFAULT_LAYOUT, side },
      createdAt,
      updatedAt: createdAt,
    });
    factor.milestones.forEach((title, milestoneIndex) => {
      nodes.push({
        id: `${factor.id}-milestone-${milestoneIndex + 1}`,
        parentId: factor.id,
        kind: "milestone",
        title,
        note: "",
        order: milestoneIndex,
        collapsed: false,
        status: "not_started",
        dueDate: null,
        layout: { ...DEFAULT_LAYOUT, side },
        createdAt,
        updatedAt: createdAt,
      });
    });
  });
  const tasks: Task[] = value.tasks.map((task, index) => ({
    id: task.id,
    title: task.title,
    nodeId: task.nodeId,
    quadrant: task.quadrant,
    minutes: task.minutes,
    status: task.completed ? "done" : "todo",
    plannedStartDate: task.plan === "today" ? day : null,
    plannedEndDate: task.plan === "today" ? day : null,
    dueDate: null,
    completedAt: task.completed ? `${day}T00:00:00.000Z` : null,
    showOnMap: false,
    planningBucket: task.plan === "week" ? "week" : null,
    layout: {
      ...DEFAULT_LAYOUT,
      side: factorSide(index),
    },
    createdAt,
    updatedAt: createdAt,
  }));
  return {
    version: 2,
    goal,
    nodes,
    tasks,
    planning: { monthlyOutcomes: [] },
    canvas: { viewport: { x: 0, y: 0, zoom: 0.86 } },
    reviewNotes: clone(value.reviewNotes),
    migration: {
      migratedAt: createdAt,
      sourceVersion: 1,
      legacyV1: clone(value),
    },
  };
}
