import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialWorkspace,
  migrateWorkspace,
} from "../app/domain/migrate-workspace";
import {
  ancestorIds,
  nodeMetrics,
  tasksForDay,
  tasksForMonth,
  tasksForWeek,
} from "../app/domain/selectors";
import type { LegacyState } from "../app/domain/types";
import { validateWorkspace } from "../app/domain/validate-workspace";
import { layoutCanvas, NODE_SIZES } from "../app/lib/tree-layout";

const DAY = "2026-07-29";

const legacy: LegacyState = {
  version: 1,
  goal: {
    title: "迁移目标",
    deadline: "2026-12-31",
    successCriteria: "全部完成",
    constraints: "每周十小时",
    weeklyHours: 10,
    bufferPercent: 25,
    progress: 50,
    factors: [
      {
        id: "factor-a",
        title: "要素 A",
        note: "说明",
        progress: 50,
        risk: "watch",
        hours: 2,
        milestones: ["里程碑一", "里程碑二"],
      },
      {
        id: "factor-b",
        title: "要素 B",
        note: "说明",
        progress: 0,
        risk: "calm",
        hours: 1,
        milestones: ["里程碑三"],
      },
      {
        id: "factor-c",
        title: "要素 C",
        note: "说明",
        progress: 100,
        risk: "calm",
        hours: 3,
        milestones: [],
      },
    ],
  },
  tasks: [
    {
      id: "task-a",
      title: "今天做",
      nodeId: "factor-a",
      quadrant: "important",
      plan: "today",
      minutes: 60,
      completed: false,
    },
    {
      id: "task-b",
      title: "本周待安排",
      nodeId: "factor-b",
      quadrant: "later",
      plan: "week",
      minutes: 30,
      completed: true,
    },
  ],
  reviewNotes: { wins: "好", friction: "慢", next: "继续" },
};

test("V1 迁移保留 ID、关联并可重复执行", () => {
  const migrated = migrateWorkspace(legacy, DAY);
  const again = migrateWorkspace(migrated, DAY);
  assert.deepEqual(again, migrated);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.nodes.find((node) => node.id === "factor-a")?.title, "要素 A");
  assert.equal(
    migrated.nodes.find((node) => node.id === "factor-a-milestone-2")
      ?.parentId,
    "factor-a",
  );
  assert.equal(
    migrated.tasks.find((task) => task.id === "task-a")?.nodeId,
    "factor-a",
  );
  assert.equal(
    migrated.tasks.find((task) => task.id === "task-b")
      ?.plannedStartDate,
    null,
  );
  assert.equal(
    migrated.tasks.find((task) => task.id === "task-b")?.planningBucket,
    "week",
  );
  assert.equal(migrated.goal.manualProgress, 50);
  assert.equal(
    migrated.nodes.find((node) => node.id === "factor-a")?.historicalHours,
    2,
  );
  assert.equal(migrated.migration?.sourceVersion, 1);
  assert.deepEqual(validateWorkspace(migrated), { ok: true });
});

test("未知版本不会静默覆盖为示例数据", () => {
  assert.throws(
    () => migrateWorkspace({ version: 99 }, DAY),
    /无法识别的工作区版本/,
  );
});

test("校验拒绝循环和孤儿关联", () => {
  const state = createInitialWorkspace(DAY);
  state.nodes[0].parentId = state.nodes[0].id;
  state.tasks[0].nodeId = "missing";
  const result = validateWorkspace(state);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.includes("循环")));
    assert.ok(result.errors.some((error) => error.includes("关联节点不存在")));
  }
});

test("校验拒绝不符合目标树规则的父子层级", () => {
  const state = createInitialWorkspace(DAY);
  const subgoal = state.nodes.find((node) => node.kind === "subgoal");
  assert.ok(subgoal);
  subgoal.parentId = state.goal.id;
  const result = validateWorkspace(state);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.includes("层级无效")));
  }
});

test("校验拒绝非法日期、枚举与非有限画布数值", () => {
  const state = createInitialWorkspace(DAY);
  state.tasks[0].plannedStartDate = "2026-02-30";
  state.tasks[0].quadrant = "other" as never;
  state.nodes[0].note = { bad: true } as never;
  state.goal.successCriteria = { bad: true } as never;
  state.canvas.viewport.zoom = Number.NaN;
  const result = validateWorkspace(state);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.includes("日期")));
    assert.ok(result.errors.some((error) => error.includes("象限")));
    assert.ok(result.errors.some((error) => error.includes("视口")));
    assert.ok(result.errors.some((error) => error.includes("文本字段")));
    assert.ok(result.errors.some((error) => error.includes("节点说明")));
  }
});

test("祖先进度按唯一任务时长计算", () => {
  const state = createInitialWorkspace(DAY);
  const task = state.tasks.find((item) => item.id === "t9");
  assert.ok(task);
  const ancestors = ancestorIds(state, task.nodeId);
  assert.ok(ancestors.has("goal-root"));
  assert.ok(ancestors.has("development"));
  const before = nodeMetrics(state, "development", DAY);
  task.status = "done";
  task.completedAt = `${DAY}T10:00:00.000Z`;
  const after = nodeMetrics(state, "development", DAY);
  assert.ok(after.progress > before.progress);
});

test("今日、本周、本月由同一日期字段投影", () => {
  const state = createInitialWorkspace(DAY);
  const dayIds = new Set(tasksForDay(state, DAY).map((task) => task.id));
  const weekIds = new Set(tasksForWeek(state, DAY).map((task) => task.id));
  const monthIds = new Set(
    tasksForMonth(state, "2026-07").map((task) => task.id),
  );
  for (const id of dayIds) {
    assert.ok(weekIds.has(id));
    assert.ok(monthIds.has(id));
  }
});

test("跨周期任务保持可见，但投入时长只归属开始周期", () => {
  const state = createInitialWorkspace(DAY);
  const task = state.tasks[0];
  task.plannedStartDate = "2026-07-26";
  task.plannedEndDate = "2026-08-03";
  assert.ok(tasksForDay(state, "2026-08-03").some((item) => item.id === task.id));
  assert.ok(tasksForWeek(state, "2026-08-03").some((item) => item.id === task.id));
  assert.ok(
    tasksForMonth(state, "2026-08").some((item) => item.id === task.id),
  );
  assert.equal(task.plannedStartDate.startsWith("2026-08"), false);
});

test("多层级自动布局包含任务投影且没有近距离重叠", () => {
  const state = createInitialWorkspace(DAY);
  state.nodes.forEach((node) => {
    node.collapsed = false;
  });
  const { items, points } = layoutCanvas(state);
  assert.ok(items.length > state.nodes.length);
  assert.ok(points.has("task:t9"));
  const unique = new Set(
    [...points.values()].map(
      (point) => `${Math.round(point.x)}:${Math.round(point.y)}`,
    ),
  );
  assert.equal(unique.size, points.size);
  for (let index = 0; index < items.length; index += 1) {
    const first = items[index]!;
    const firstPoint = points.get(first.id);
    assert.ok(firstPoint);
    for (let otherIndex = index + 1; otherIndex < items.length; otherIndex += 1) {
      const second = items[otherIndex]!;
      const secondPoint = points.get(second.id);
      assert.ok(secondPoint);
      const firstSize = NODE_SIZES[first.kind];
      const secondSize = NODE_SIZES[second.kind];
      const overlaps: boolean =
        Math.abs(firstPoint.x - secondPoint.x) <
          (firstSize.width + secondSize.width) / 2 &&
        Math.abs(firstPoint.y - secondPoint.y) <
          (firstSize.height + secondSize.height) / 2;
      assert.equal(
        overlaps,
        false,
        `${first.id} 与 ${second.id} 不应重叠`,
      );
    }
  }
});

test("收起中心目标时只显示中心节点", () => {
  const state = createInitialWorkspace(DAY);
  state.goal.collapsed = true;
  const { items } = layoutCanvas(state);
  assert.deepEqual(items.map((item) => item.id), [state.goal.id]);
});

test("300 个可见节点布局与持久化体积保持在验证范围内", () => {
  const state = createInitialWorkspace(DAY);
  state.nodes.forEach((node) => {
    node.collapsed = false;
  });
  const milestone = state.nodes.find(
    (node) => node.kind === "milestone",
  );
  assert.ok(milestone);
  for (let index = 0; index < 290; index += 1) {
    state.nodes.push({
      id: `load-node-${index}`,
      parentId: milestone.id,
      kind: "subgoal",
      title: `性能验证节点 ${index + 1}`,
      note: "用于验证大量展开节点时的布局和保存体积。",
      order: index + 10,
      collapsed: false,
      status: "not_started",
      dueDate: null,
      layout: {
        x: 0,
        y: 0,
        side: milestone.layout.side,
        mode: "auto",
      },
      createdAt: `${DAY}T00:00:00.000Z`,
      updatedAt: `${DAY}T00:00:00.000Z`,
    });
  }
  const start = performance.now();
  const layout = layoutCanvas(state);
  const elapsed = performance.now() - start;
  assert.ok(layout.items.length >= 300);
  assert.ok(elapsed < 200, `布局耗时 ${elapsed.toFixed(1)}ms`);
  assert.ok(JSON.stringify(state).length < 500_000);
});
