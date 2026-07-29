import { hierarchy, tree } from "d3-hierarchy";
import type {
  GoalNode,
  NodeKind,
  NodeLayout,
  Task,
  WorkspaceState,
} from "../domain/types";

export type CanvasDatum = {
  id: string;
  parentId: string | null;
  kind: NodeKind | "task";
  layout: NodeLayout;
};

export type LayoutPoint = {
  x: number;
  y: number;
  side: "left" | "right" | "center";
};

type TreeDatum = CanvasDatum & { children?: TreeDatum[] };

export const NODE_SIZES: Record<
  NodeKind | "task",
  { width: number; height: number }
> = {
  goal: { width: 216, height: 216 },
  factor: { width: 290, height: 94 },
  milestone: { width: 226, height: 68 },
  subgoal: { width: 204, height: 58 },
  task: { width: 184, height: 46 },
};

function subtreeSize(
  id: string,
  childrenByParent: Map<string, CanvasDatum[]>,
): number {
  return (
    1 +
    (childrenByParent.get(id) ?? []).reduce(
      (sum, child) => sum + subtreeSize(child.id, childrenByParent),
      0,
    )
  );
}

function buildTree(
  item: CanvasDatum,
  childrenByParent: Map<string, CanvasDatum[]>,
): TreeDatum {
  const children = childrenByParent.get(item.id) ?? [];
  return {
    ...item,
    children: children.map((child) => buildTree(child, childrenByParent)),
  };
}

export function visibleCanvasData(state: WorkspaceState): CanvasDatum[] {
  const result: CanvasDatum[] = [
    {
      id: state.goal.id,
      parentId: null,
      kind: "goal",
      layout: state.goal.layout,
    },
  ];
  if (state.goal.collapsed) return result;
  const collapsed = new Set<string>();
  const visible = new Set([state.goal.id]);
  const ordered = [...state.nodes].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of ordered) {
      if (visible.has(node.id) || !visible.has(node.parentId)) continue;
      if (collapsed.has(node.parentId)) continue;
      visible.add(node.id);
      result.push({
        id: node.id,
        parentId: node.parentId,
        kind: node.kind,
        layout: node.layout,
      });
      if (node.collapsed) collapsed.add(node.id);
      changed = true;
    }
  }
  for (const task of state.tasks) {
    if (!task.showOnMap || !task.nodeId || !visible.has(task.nodeId)) continue;
    if (collapsed.has(task.nodeId)) continue;
    result.push({
      id: `task:${task.id}`,
      parentId: task.nodeId,
      kind: "task",
      layout: task.layout,
    });
  }
  return result;
}

function balanceSides(
  factors: CanvasDatum[],
  childrenByParent: Map<string, CanvasDatum[]>,
) {
  const sorted = [...factors].sort(
    (a, b) =>
      subtreeSize(b.id, childrenByParent) -
      subtreeSize(a.id, childrenByParent),
  );
  const left: CanvasDatum[] = [];
  const right: CanvasDatum[] = [];
  let leftWeight = 0;
  let rightWeight = 0;
  for (const factor of sorted) {
    const weight = subtreeSize(factor.id, childrenByParent);
    const preferred = factor.layout.side;
    if (preferred === "left" && leftWeight <= rightWeight + weight) {
      left.push(factor);
      leftWeight += weight;
    } else if (
      preferred === "right" &&
      rightWeight <= leftWeight + weight
    ) {
      right.push(factor);
      rightWeight += weight;
    } else if (leftWeight <= rightWeight) {
      left.push(factor);
      leftWeight += weight;
    } else {
      right.push(factor);
      rightWeight += weight;
    }
  }
  return { left, right };
}

function layoutSide(
  rootItem: CanvasDatum,
  factors: CanvasDatum[],
  childrenByParent: Map<string, CanvasDatum[]>,
  side: "left" | "right",
) {
  if (!factors.length) return new Map<string, LayoutPoint>();
  const virtual: TreeDatum = {
    ...rootItem,
    children: factors.map((factor) => buildTree(factor, childrenByParent)),
  };
  const root = hierarchy(virtual);
  const engine = tree<TreeDatum>()
    .nodeSize([118, 268])
    .separation((a, b) => {
      const aHeight = NODE_SIZES[a.data.kind].height;
      const bHeight = NODE_SIZES[b.data.kind].height;
      return a.parent === b.parent
        ? Math.max(1, (aHeight + bHeight + 34) / 118)
        : Math.max(1.18, (aHeight + bHeight + 52) / 118);
    });
  engine(root);
  const factorNodes = root.children ?? [];
  const factorCenter =
    factorNodes.reduce((sum, node) => sum + (node.x ?? 0), 0) /
    Math.max(1, factorNodes.length);
  const direction = side === "right" ? 1 : -1;
  const points = new Map<string, LayoutPoint>();
  root.descendants().slice(1).forEach((node) => {
    points.set(node.data.id, {
      x: direction * (node.y ?? 0),
      y: (node.x ?? 0) - factorCenter,
      side,
    });
  });
  return points;
}

function collides(
  point: LayoutPoint,
  kind: CanvasDatum["kind"],
  other: LayoutPoint,
  otherKind: CanvasDatum["kind"],
) {
  const a = NODE_SIZES[kind];
  const b = NODE_SIZES[otherKind];
  return (
    Math.abs(point.x - other.x) < (a.width + b.width) / 2 + 30 &&
    Math.abs(point.y - other.y) < (a.height + b.height) / 2 + 28
  );
}

export function layoutCanvas(state: WorkspaceState) {
  const items = visibleCanvasData(state);
  const rootItem = items[0];
  const childrenByParent = new Map<string, CanvasDatum[]>();
  for (const item of items.slice(1)) {
    if (!item.parentId) continue;
    const list = childrenByParent.get(item.parentId) ?? [];
    list.push(item);
    childrenByParent.set(item.parentId, list);
  }
  const factors = childrenByParent.get(rootItem.id) ?? [];
  const { left, right } = balanceSides(factors, childrenByParent);
  const points = new Map<string, LayoutPoint>([
    [rootItem.id, { x: 0, y: 0, side: "center" }],
  ]);
  for (const [id, point] of layoutSide(
    rootItem,
    left,
    childrenByParent,
    "left",
  )) {
    points.set(id, point);
  }
  for (const [id, point] of layoutSide(
    rootItem,
    right,
    childrenByParent,
    "right",
  )) {
    points.set(id, point);
  }

  const placed: Array<{
    id: string;
    kind: CanvasDatum["kind"];
    point: LayoutPoint;
    pinned: boolean;
  }> = [];
  for (const item of items) {
    const automatic = points.get(item.id) ?? {
      x: 0,
      y: 0,
      side: item.layout.side,
    };
    let point =
      item.layout.mode === "pinned"
        ? {
            x: item.layout.x,
            y: item.layout.y,
            side: item.layout.side,
          }
        : automatic;
    if (item.layout.mode !== "pinned") {
      let guard = 0;
      while (
        placed.some((other) =>
          collides(point, item.kind, other.point, other.kind),
        ) &&
        guard < 40
      ) {
        point = { ...point, y: point.y + 34 };
        guard += 1;
      }
    }
    points.set(item.id, point);
    placed.push({
      id: item.id,
      kind: item.kind,
      point,
      pinned: item.layout.mode === "pinned",
    });
  }
  return { items, points };
}

export function resolveDropCollision(
  itemId: string,
  point: { x: number; y: number },
  state: WorkspaceState,
) {
  const { items, points } = layoutCanvas(state);
  const current = items.find((item) => item.id === itemId);
  if (!current) return point;
  let candidate = {
    x: point.x,
    y: point.y,
    side: (point.x < 0 ? "left" : point.x > 0 ? "right" : "center") as
      | "left"
      | "right"
      | "center",
  };
  let guard = 0;
  while (
    items.some((item) => {
      if (item.id === itemId) return false;
      const other = points.get(item.id);
      return other
        ? collides(candidate, current.kind, other, item.kind)
        : false;
    }) &&
    guard < 30
  ) {
    candidate = { ...candidate, y: candidate.y + 30 };
    guard += 1;
  }
  return { x: candidate.x, y: candidate.y };
}

export function isTaskCanvasId(id: string) {
  return id.startsWith("task:");
}

export function taskIdFromCanvasId(id: string) {
  return id.replace(/^task:/, "");
}

export function childCount(
  node: GoalNode | WorkspaceState["goal"],
  nodes: GoalNode[],
  tasks: Task[],
) {
  return (
    nodes.filter((item) => item.parentId === node.id).length +
    tasks.filter((task) => task.showOnMap && task.nodeId === node.id).length
  );
}
