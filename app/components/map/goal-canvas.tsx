"use client";

import {
  Background,
  BaseEdge,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type OnNodesChange,
} from "@xyflow/react";
import {
  ArrowsClockwise,
  CaretDown,
  CaretRight,
  Check,
  CirclesFour,
  Crosshair,
  Flag,
  LockSimple,
  Minus,
  Plus,
  Target,
  TreeStructure,
} from "@phosphor-icons/react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ancestorIds,
  nodeMetrics,
  structureNode,
} from "../../domain/selectors";
import type {
  CanvasViewport,
  Risk,
  WorkspaceState,
} from "../../domain/types";
import {
  NODE_SIZES,
  childCount,
  isTaskCanvasId,
  layoutCanvas,
  resolveDropCollision,
  taskIdFromCanvasId,
} from "../../lib/tree-layout";

type CanvasNodeData = {
  [key: string]: unknown;
  label: string;
  kind: "goal" | "factor" | "milestone" | "subgoal" | "task";
  progress: number;
  risk: Risk;
  taskCount: number;
  openTaskCount: number;
  collapsed: boolean;
  childCount: number;
  selected: boolean;
  feedback: boolean;
  filtered: boolean;
  pinned: boolean;
  side: "left" | "right" | "center";
  completed: boolean;
  onToggleCollapse?: () => void;
  onAddChild?: () => void;
  onAddTask?: () => void;
  onToggleTask?: () => void;
};

type CanvasFlowNode = Node<CanvasNodeData, "masterNode">;
type OrganicEdge = Edge<
  { depth: number; highlighted: boolean; filtered: boolean },
  "organicEdge"
>;

const kindIcon = {
  goal: Target,
  factor: CirclesFour,
  milestone: Flag,
  subgoal: TreeStructure,
  task: Check,
};

function MasterNodeView({ data }: NodeProps<CanvasFlowNode>) {
  const Icon = kindIcon[data.kind];
  const canHaveChildren =
    data.kind !== "task" && data.kind !== "subgoal";
  return (
    <div
      className={[
        "canvas-node",
        `canvas-node-${data.kind}`,
        data.selected ? "is-selected" : "",
        data.risk === "risk" ? "is-risk" : "",
        data.feedback ? "is-feedback" : "",
        data.completed ? "is-completed" : "",
        data.filtered ? "is-filtered" : "",
      ].join(" ")}
      data-side={data.side}
      aria-label={`${data.label}，进度 ${data.progress}%`}
    >
      <Handle
        id="left-target"
        type="target"
        position={Position.Left}
        className="canvas-handle"
      />
      <Handle
        id="right-target"
        type="target"
        position={Position.Right}
        className="canvas-handle"
      />
      <Handle
        id="left-source"
        type="source"
        position={Position.Left}
        className="canvas-handle"
      />
      <Handle
        id="right-source"
        type="source"
        position={Position.Right}
        className="canvas-handle"
      />

      {data.kind === "goal" ? (
        <>
          <span className="goal-node-title">{data.label}</span>
          <span className="goal-node-metric">
            <i
              style={
                {
                  "--node-progress": `${data.progress * 3.6}deg`,
                } as React.CSSProperties
              }
            />
            {data.progress}%
          </span>
          <span className="goal-node-affordances">
            <button
              className="node-quick-action nodrag"
              onClick={(event) => {
                event.stopPropagation();
                data.onAddChild?.();
              }}
              aria-label="添加关键要素"
            >
              <Plus size={14} />
            </button>
            {data.childCount > 0 && (
              <button
                className="node-expand-action nodrag"
                onClick={(event) => {
                  event.stopPropagation();
                  data.onToggleCollapse?.();
                }}
                aria-label={data.collapsed ? "展开关键要素" : "收起关键要素"}
              >
                {data.collapsed ? (
                  <>
                    <Plus size={12} />
                    <span>{data.childCount}</span>
                  </>
                ) : (
                  <CaretDown size={14} />
                )}
              </button>
            )}
          </span>
        </>
      ) : data.kind === "task" ? (
        <>
          <button
            className="canvas-task-check nodrag"
            onClick={(event) => {
              event.stopPropagation();
              data.onToggleTask?.();
            }}
            aria-label={data.completed ? "恢复任务" : "完成任务"}
          >
            {data.completed && <Check size={12} weight="bold" />}
          </button>
          <span className="canvas-task-title">{data.label}</span>
        </>
      ) : (
        <>
          <span className="canvas-node-icon">
            <Icon size={data.kind === "factor" ? 26 : 18} weight="light" />
          </span>
          <span className="canvas-node-copy">
            <b>{data.label}</b>
            <small>
              <span>
                <i
                  className="mini-progress"
                  style={
                    {
                      "--node-progress": `${data.progress * 3.6}deg`,
                    } as React.CSSProperties
                  }
                />
                {data.progress}%
              </span>
              <span>{data.taskCount} 项任务</span>
              {data.risk !== "calm" && (
                <span className={`node-risk-text ${data.risk}`}>
                  {data.risk === "risk" ? "有风险" : "需关注"}
                </span>
              )}
            </small>
          </span>
          <span className="canvas-node-affordances">
            {canHaveChildren && (
              <button
                className="node-quick-action nodrag"
                onClick={(event) => {
                  event.stopPropagation();
                  data.onAddChild?.();
                }}
                aria-label="添加子节点"
              >
                <Plus size={14} />
              </button>
            )}
            {data.kind === "subgoal" && (
              <button
                className="node-quick-action nodrag"
                onClick={(event) => {
                  event.stopPropagation();
                  data.onAddTask?.();
                }}
                aria-label="添加可执行任务"
              >
                <Plus size={14} />
              </button>
            )}
            {data.childCount > 0 && (
              <button
                className="node-expand-action nodrag"
                onClick={(event) => {
                  event.stopPropagation();
                  data.onToggleCollapse?.();
                }}
                aria-label={data.collapsed ? "展开子节点" : "收起子节点"}
              >
                {data.collapsed ? (
                  <>
                    <Plus size={12} />
                    <span>{data.childCount}</span>
                  </>
                ) : (
                  <CaretDown size={14} />
                )}
              </button>
            )}
            {data.pinned && (
              <span className="node-pinned" title="已固定位置">
                <LockSimple size={11} />
              </span>
            )}
          </span>
        </>
      )}
    </div>
  );
}

const MasterNode = memo(MasterNodeView);

function OrganicEdgeView(props: EdgeProps<OrganicEdge>) {
  const [path] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
    curvature: 0.38,
  });
  const depth = props.data?.depth ?? 1;
  return (
    <>
      <path className="organic-edge-hit" d={path} />
      <BaseEdge
        id={props.id}
        path={path}
        className={[
          "organic-edge",
          `organic-edge-depth-${Math.min(depth, 3)}`,
          props.data?.highlighted ? "is-highlighted" : "",
          props.data?.filtered ? "is-filtered" : "",
        ].join(" ")}
      />
    </>
  );
}

const OrganicEdgeViewMemo = memo(OrganicEdgeView);
const NODE_TYPES = { masterNode: MasterNode };
const EDGE_TYPES = { organicEdge: OrganicEdgeViewMemo };

function depthForNode(state: WorkspaceState, id: string) {
  if (id === state.goal.id) return 0;
  const byId = new Map(state.nodes.map((node) => [node.id, node]));
  let depth = 0;
  let cursor: string | null = id;
  while (cursor && cursor !== state.goal.id) {
    depth += 1;
    cursor = byId.get(cursor)?.parentId ?? state.goal.id;
  }
  return depth;
}

function CanvasInner({
  state,
  selectedId,
  feedbackIds,
  riskOnly,
  onSelect,
  onEditTask,
  onAddChild,
  onAddTask,
  onToggleCollapse,
  onToggleTask,
  onPositionChange,
  onViewportChange,
  onArrange,
}: {
  state: WorkspaceState;
  selectedId: string;
  feedbackIds: Set<string>;
  riskOnly: boolean;
  onSelect: (id: string) => void;
  onEditTask: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onAddTask: (nodeId: string) => void;
  onToggleCollapse: (id: string) => void;
  onToggleTask: (id: string) => void;
  onPositionChange: (
    id: string,
    position: { x: number; y: number },
    side: "left" | "right" | "center",
  ) => void;
  onViewportChange: (viewport: CanvasViewport) => void;
  onArrange: (all: boolean) => void;
}) {
  const { fitView, setCenter, zoomIn, zoomOut, getZoom } = useReactFlow();
  const [zoom, setZoom] = useState(state.canvas.viewport.zoom);
  const [showTools, setShowTools] = useState(false);
  const { items, points } = useMemo(() => layoutCanvas(state), [state]);
  const selectedAncestors = useMemo(
    () => ancestorIds(state, selectedId),
    [selectedId, state],
  );
  const riskContextIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      if (isTaskCanvasId(item.id)) {
        const task = state.tasks.find(
          (entry) => entry.id === taskIdFromCanvasId(item.id),
        );
        const isRisk =
          task?.status === "blocked" ||
          Boolean(
            task?.dueDate &&
              task.dueDate < new Date().toISOString().slice(0, 10) &&
              task.status !== "done",
          );
        if (isRisk) {
          ids.add(item.id);
          ancestorIds(state, task?.nodeId ?? null).forEach((id) => ids.add(id));
        }
      } else if (nodeMetrics(state, item.id).risk !== "calm") {
        ancestorIds(state, item.id).forEach((id) => ids.add(id));
      }
    }
    return ids;
  }, [items, state]);

  const createFlowNodes = useCallback((): CanvasFlowNode[] => {
    return items.map((item) => {
      const point = points.get(item.id) ?? {
        x: 0,
        y: 0,
        side: item.layout.side,
      };
      const size = NODE_SIZES[item.kind];
      if (isTaskCanvasId(item.id)) {
        const taskId = taskIdFromCanvasId(item.id);
        const task = state.tasks.find((entry) => entry.id === taskId);
        return {
          id: item.id,
          type: "masterNode",
          draggable: true,
          position: {
            x: point.x - size.width / 2,
            y: point.y - size.height / 2,
          },
          sourcePosition:
            point.side === "left" ? Position.Left : Position.Right,
          targetPosition:
            point.side === "left" ? Position.Right : Position.Left,
          data: {
            label: task?.title ?? "任务",
            kind: "task",
            progress: task?.status === "done" ? 100 : 0,
            risk:
              task?.status === "blocked" ||
              Boolean(
                task?.dueDate &&
                  task.dueDate < new Date().toISOString().slice(0, 10) &&
                  task.status !== "done",
              )
                ? "risk"
                : task?.dueDate
                  ? "watch"
                  : "calm",
            taskCount: 1,
            openTaskCount: task?.status === "done" ? 0 : 1,
            collapsed: false,
            childCount: 0,
            selected: selectedId === item.id,
            feedback:
              Boolean(task?.nodeId && feedbackIds.has(task.nodeId)) ||
              feedbackIds.has(item.id),
            pinned: item.layout.mode === "pinned",
            filtered:
              riskOnly &&
              task?.status !== "blocked" &&
              (!task?.dueDate || task.dueDate >= new Date().toISOString().slice(0, 10)),
            side: point.side,
            completed: task?.status === "done",
            onToggleTask: () => onToggleTask(taskId),
          },
          style: { width: size.width, height: size.height },
        };
      }
      const node = structureNode(state, item.id);
      const metrics = nodeMetrics(state, item.id);
      const count = node
        ? childCount(node, state.nodes, state.tasks)
        : 0;
      return {
        id: item.id,
        type: "masterNode",
        draggable: item.kind !== "goal",
        position: {
          x: point.x - size.width / 2,
          y: point.y - size.height / 2,
        },
        sourcePosition:
          point.side === "left" ? Position.Left : Position.Right,
        targetPosition:
          point.side === "left" ? Position.Right : Position.Left,
        data: {
          label: node?.title ?? "",
          kind: item.kind,
          progress: metrics.progress,
          risk: metrics.risk,
          taskCount: metrics.taskCount,
          openTaskCount: metrics.openTaskCount,
          collapsed: Boolean(node?.collapsed),
          childCount: count,
          selected: selectedId === item.id,
          feedback: feedbackIds.has(item.id),
          pinned: item.layout.mode === "pinned",
          filtered: riskOnly && metrics.risk === "calm",
          side: point.side,
          completed: metrics.status === "done",
          onToggleCollapse: () => onToggleCollapse(item.id),
          onAddChild: () => onAddChild(item.id),
          onAddTask: () => onAddTask(item.id),
        },
        style: { width: size.width, height: size.height },
      };
    });
  }, [
    feedbackIds,
    items,
    onAddChild,
    onAddTask,
    onToggleCollapse,
    onToggleTask,
    points,
    selectedId,
    riskOnly,
    state,
  ]);

  const [nodes, setNodes, handleNodesChange] =
    useNodesState<CanvasFlowNode>(createFlowNodes());
  useEffect(() => {
    setNodes(createFlowNodes());
  }, [createFlowNodes, setNodes]);

  const edges = useMemo<OrganicEdge[]>(() => {
    return items.flatMap((item) => {
      if (!item.parentId) return [];
      const point = points.get(item.id);
      const side = point?.side ?? item.layout.side;
      const depth = depthForNode(
        state,
        isTaskCanvasId(item.id) ? item.parentId : item.id,
      );
      return [
        {
          id: `${item.parentId}->${item.id}`,
          type: "organicEdge",
          source: item.parentId,
          target: item.id,
          sourceHandle: side === "left" ? "left-source" : "right-source",
          targetHandle: side === "left" ? "right-target" : "left-target",
          data: {
            depth,
            highlighted:
              selectedAncestors.has(item.parentId) &&
              (selectedAncestors.has(item.id) || selectedId === item.id),
            filtered: riskOnly && !riskContextIds.has(item.id),
          },
        },
      ];
    });
  }, [
    items,
    points,
    riskContextIds,
    riskOnly,
    selectedAncestors,
    selectedId,
    state,
  ]);

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: CanvasFlowNode) => {
      const size = NODE_SIZES[node.data.kind];
      const center = {
        x: node.position.x + size.width / 2,
        y: node.position.y + size.height / 2,
      };
      const corrected = resolveDropCollision(node.id, center, state);
      const side =
        corrected.x < -12
          ? ("left" as const)
          : corrected.x > 12
            ? ("right" as const)
            : ("center" as const);
      setNodes((current) =>
        current.map((item) =>
          item.id === node.id
            ? {
                ...item,
                position: {
                  x: corrected.x - size.width / 2,
                  y: corrected.y - size.height / 2,
                },
              }
            : item,
        ),
      );
      onPositionChange(node.id, corrected, side);
    },
    [onPositionChange, setNodes, state],
  );

  const goCenter = useCallback(() => {
    void setCenter(0, 0, {
      zoom: Math.max(0.72, Math.min(getZoom(), 1)),
      duration: 260,
    });
  }, [getZoom, setCenter]);

  return (
    <div className="goal-canvas-shell">
      <ReactFlow<CanvasFlowNode, OrganicEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={handleNodesChange as OnNodesChange<CanvasFlowNode>}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_event, node) => {
          if (isTaskCanvasId(node.id)) {
            onEditTask(taskIdFromCanvasId(node.id));
          } else {
            onSelect(node.id);
          }
        }}
        onMove={(_event, viewport) => setZoom(viewport.zoom)}
        onMoveEnd={(_event, viewport) => onViewportChange(viewport)}
        defaultViewport={state.canvas.viewport}
        fitView={!state.canvas.hasSavedViewport}
        minZoom={0.28}
        maxZoom={1.65}
        fitViewOptions={{ padding: 0.2, duration: 260 }}
        panOnDrag
        zoomOnPinch
        zoomOnScroll
        zoomOnDoubleClick={false}
        nodesFocusable
        edgesFocusable={false}
        selectionOnDrag={false}
        proOptions={{ hideAttribution: false }}
      >
        <Background color="#dce5e6" gap={28} size={1} />
      </ReactFlow>
      <div className="canvas-floating-tools" aria-label="画布工具">
        <button
          onClick={() => void zoomOut({ duration: 140 })}
          aria-label="缩小"
        >
          <Minus size={16} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => void zoomIn({ duration: 140 })}
          aria-label="放大"
        >
          <Plus size={16} />
        </button>
        <i />
        <button onClick={goCenter} aria-label="回到中心" title="回到中心">
          <Crosshair size={17} />
        </button>
        <button
          onClick={() => void fitView({ padding: 0.2, duration: 260 })}
          aria-label="适配全部"
          title="适配全部"
        >
          <ArrowsClockwise size={17} />
        </button>
        <button
          className={showTools ? "active" : ""}
          onClick={() => setShowTools((value) => !value)}
          aria-label="布局菜单"
          title="布局菜单"
        >
          <TreeStructure size={17} />
        </button>
        {showTools && (
          <div className="canvas-layout-menu">
            <button onClick={() => onArrange(false)}>
              整理自动节点
              <CaretRight size={13} />
            </button>
            <button onClick={() => onArrange(true)}>
              全部重新布局
              <CaretRight size={13} />
            </button>
          </div>
        )}
      </div>
      <div className="canvas-mobile-hint">拖动画布 · 双指缩放 · 点选节点管理</div>
      {riskOnly && <div className="risk-filter-note">正在聚焦风险分支</div>}
    </div>
  );
}

export function GoalCanvas(
  props: Parameters<typeof CanvasInner>[0],
) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
