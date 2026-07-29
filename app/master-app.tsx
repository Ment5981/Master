"use client";

import {
  ArrowRight,
  CalendarBlank,
  ChartDonut,
  Check,
  DownloadSimple,
  Funnel,
  MapTrifold,
  Plus,
  SlidersHorizontal,
  Sparkle,
  Sun,
  Target,
  UserCircle,
  X,
} from "@phosphor-icons/react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import { GoalCanvas } from "./components/map/goal-canvas";
import { MapDetailPanel } from "./components/map/map-detail-panel";
import { PlanExperience } from "./components/plan/plan-view";
import {
  allStructureNodes,
  ancestorIds,
  descendantIds,
  nodeById,
  nodeMetrics,
  structureNode,
} from "./domain/selectors";
import {
  KIND_LABELS,
  NEXT_KIND,
  QUADRANTS,
  type GoalNode,
  type NodeKind,
  type NodeStatus,
  type PlanView,
  type Quadrant,
  type Tab,
  type TaskStatus,
  type WorkspaceState,
} from "./domain/types";
import { useWorkspacePersistence } from "./hooks/use-workspace-persistence";
import {
  dateKey,
  endOfLocalMonth,
  endOfLocalWeek,
  monthKey,
  startOfLocalMonth,
  startOfLocalWeek,
} from "./lib/dates";
import {
  isTaskCanvasId,
  layoutCanvas,
  taskIdFromCanvasId,
} from "./lib/tree-layout";

const NAV = [
  { id: "today" as Tab, label: "今天", Icon: Sun },
  { id: "map" as Tab, label: "地图", Icon: MapTrifold },
  { id: "plan" as Tab, label: "计划", Icon: CalendarBlank },
  { id: "review" as Tab, label: "复盘", Icon: ChartDonut },
  { id: "me" as Tab, label: "我的", Icon: UserCircle },
];

const clone = <T,>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

type Toast = { message: string; undo?: boolean } | null;

type NodeEditorState =
  | { mode: "add"; parentId: string }
  | { mode: "edit"; id: string }
  | null;

type TaskEditorState =
  | { mode: "add"; nodeId: string | null; date?: string }
  | { mode: "edit"; id: string }
  | null;

const EMPTY_TASK_DRAFT = {
  title: "",
  nodeId: "",
  quadrant: "important" as Quadrant,
  minutes: 45,
  status: "todo" as TaskStatus,
  plannedStartDate: "",
  plannedEndDate: "",
  dueDate: "",
  showOnMap: false,
};

export function MasterApp({
  user,
}: {
  user: { displayName: string; email: string };
}) {
  const {
    state,
    setState,
    mutate,
    status: save,
    savedAt,
    loaded,
    reset,
  } = useWorkspacePersistence();
  const [tab, setTab] = useState<Tab>("map");
  const [planView, setPlanView] = useState<PlanView>("week");
  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const [selectedId, setSelectedId] = useState("development");
  const [detailVisible, setDetailVisible] = useState(true);
  const [riskOnly, setRiskOnly] = useState(false);
  const [nodeEditor, setNodeEditor] = useState<NodeEditorState>(null);
  const [taskEditor, setTaskEditor] = useState<TaskEditorState>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [feedbackIds, setFeedbackIds] = useState<Set<string>>(new Set());
  const [undoAvailable, setUndoAvailable] = useState(false);
  const undoRef = useRef<WorkspaceState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
      setUndoAvailable(false);
    }, 3400);
    return () => clearTimeout(timer);
  }, [toast]);

  const setWithUndo = (
    change: (draft: WorkspaceState) => void,
    message: string,
  ) => {
    setState((current) => {
      undoRef.current = clone(current);
      const draft = clone(current);
      change(draft);
      return draft;
    });
    setUndoAvailable(true);
    setToast({ message, undo: true });
  };

  const toggleTask = (taskId: string) => {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const willComplete = task.status !== "done";
    setWithUndo((draft) => {
      const target = draft.tasks.find((item) => item.id === taskId);
      if (!target) return;
      target.status = willComplete ? "done" : "todo";
      target.completedAt = willComplete ? new Date().toISOString() : null;
      target.updatedAt = new Date().toISOString();
    }, willComplete ? "任务完成，目标地图已同步更新。" : "任务已恢复。");
    const ancestors = ancestorIds(state, task.nodeId);
    setFeedbackIds(ancestors);
    setTimeout(() => setFeedbackIds(new Set()), 900);
  };

  const navigate = (next: Tab) => {
    if (next === "today") {
      setPlanView("today");
      setTab("today");
      return;
    }
    if (next === "plan") {
      if (planView === "today") setPlanView("week");
      setTab("plan");
      return;
    }
    setTab(next);
  };

  const selectedNode = structureNode(state, selectedId) ?? state.goal;
  const goalMetrics = nodeMetrics(state, state.goal.id);
  const completed = state.tasks.filter((task) => task.status === "done").length;
  const active = state.tasks.filter(
    (task) => task.status !== "done" && task.status !== "blocked",
  ).length;
  const riskCount = allStructureNodes(state).filter(
    (node) => nodeMetrics(state, node.id).risk === "risk",
  ).length;

  const moveNode = (
    canvasId: string,
    position: { x: number; y: number },
    side: "left" | "right" | "center",
  ) => {
    mutate((draft) => {
      if (isTaskCanvasId(canvasId)) {
        const task = draft.tasks.find(
          (entry) => entry.id === taskIdFromCanvasId(canvasId),
        );
        if (task) {
          task.layout = { ...position, side, mode: "pinned" };
          task.updatedAt = new Date().toISOString();
        }
        return;
      }
      if (canvasId === draft.goal.id) {
        draft.goal.layout = { ...position, side, mode: "pinned" };
        return;
      }
      const node = draft.nodes.find((entry) => entry.id === canvasId);
      if (node) {
        node.layout = { ...position, side, mode: "pinned" };
        node.updatedAt = new Date().toISOString();
      }
    });
  };

  const arrange = (all: boolean) => {
    if (
      all &&
      !window.confirm("全部重新布局会覆盖手动位置，是否继续？")
    ) {
      return;
    }
    mutate((draft) => {
      if (all) {
        draft.goal.layout.mode = "auto";
        draft.nodes.forEach((node) => {
          node.layout.mode = "auto";
        });
        draft.tasks.forEach((task) => {
          if (task.showOnMap) task.layout.mode = "auto";
        });
      }
      const { items, points } = layoutCanvas(draft);
      items.forEach((item) => {
        if (!all && item.layout.mode === "pinned") return;
        const point = points.get(item.id);
        if (!point) return;
        if (isTaskCanvasId(item.id)) {
          const task = draft.tasks.find(
            (entry) => entry.id === taskIdFromCanvasId(item.id),
          );
          if (task) task.layout = { ...point, mode: "auto" };
        } else if (item.id === draft.goal.id) {
          draft.goal.layout = { ...point, mode: "auto" };
        } else {
          const node = draft.nodes.find((entry) => entry.id === item.id);
          if (node) node.layout = { ...point, mode: "auto" };
        }
      });
    });
    setToast({ message: all ? "已重新整理整张目标地图。" : "自动节点已整理。" });
  };

  const deleteNode = (mode: "promote" | "subtree") => {
    if (!deleteId) return;
    const node = state.nodes.find((entry) => entry.id === deleteId);
    if (!node) return;
    setWithUndo((draft) => {
      if (mode === "subtree") {
        const ids = descendantIds(draft, deleteId);
        draft.nodes = draft.nodes.filter((entry) => !ids.has(entry.id));
        draft.tasks = draft.tasks.filter(
          (task) => !task.nodeId || !ids.has(task.nodeId),
        );
      } else {
        const promotedIds = descendantIds(draft, deleteId);
        draft.nodes = draft.nodes
          .filter((entry) => entry.id !== deleteId)
          .map((entry) => {
            if (!promotedIds.has(entry.id)) return entry;
            return {
              ...entry,
              parentId:
                entry.parentId === deleteId ? node.parentId : entry.parentId,
              kind:
                entry.kind === "milestone"
                  ? ("factor" as const)
                  : entry.kind === "subgoal"
                    ? ("milestone" as const)
                    : entry.kind,
              order:
                entry.parentId === deleteId ? node.order : entry.order,
              layout: { ...entry.layout, mode: "auto" as const },
            };
          });
        draft.tasks.forEach((task) => {
          if (task.nodeId === deleteId) task.nodeId = node.parentId;
        });
      }
    }, mode === "subtree" ? "分支及关联任务已删除。" : "节点已删除，内容已上移。");
    setSelectedId(node.parentId);
    setDeleteId(null);
  };

  return (
    <div className="master-shell">
      <aside className="desktop-sidebar">
        <div className="brand-wordmark">Master</div>
        <nav className="side-nav">
          {NAV.map(({ id: navId, label, Icon }) => (
            <button
              key={navId}
              className={`nav-item ${
                tab === navId ||
                (navId === "plan" && tab === "today")
                  ? "active"
                  : ""
              }`}
              onClick={() => navigate(navId)}
            >
              <Icon size={20} weight="regular" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className={`sync-dot ${save}`} />
          {save === "saved"
            ? "已永久保存"
            : save === "conflict"
              ? "发现其他页面更新"
              : save === "error"
                ? "等待重新连接"
                : "正在保存"}
        </div>
      </aside>

      <header className="mobile-header">
        <div className="brand-wordmark">Master</div>
        <button
          className="icon-button"
          aria-label="添加任务"
          onClick={() =>
            setTaskEditor({ mode: "add", nodeId: selectedNode.id })
          }
        >
          <Plus size={20} />
        </button>
      </header>

      <main className="app-stage">
        {tab === "map" && (
          <div
            className={`map-layout ${detailVisible ? "" : "detail-closed"}`}
          >
            <section className="map-workspace">
              <section className="goal-overview" aria-label="目标概览">
                <h1>{state.goal.title}</h1>
                <div className="goal-overview-stats">
                  <span
                    className="overview-progress"
                    style={
                      {
                        "--node-progress": `${goalMetrics.progress * 3.6}deg`,
                      } as React.CSSProperties
                    }
                  >
                    {goalMetrics.progress}%
                  </span>
                  <div className="overview-label">
                    <span>总进度</span>
                  </div>
                  <div className="overview-stat">
                    <i className="metric-dot blue" />
                    <strong>{completed}</strong>
                    <span>已完成</span>
                  </div>
                  <div className="overview-stat">
                    <i className="metric-dot blue" />
                    <strong>{active}</strong>
                    <span>进行中</span>
                  </div>
                  <div className="overview-stat">
                    <i className="metric-dot risk" />
                    <strong>{riskCount}</strong>
                    <span>有风险</span>
                  </div>
                </div>
              </section>
              <div className="map-top-actions">
                <button
                  className={riskOnly ? "active" : ""}
                  aria-label="聚焦风险分支"
                  onClick={() => setRiskOnly((value) => !value)}
                >
                  <Funnel size={18} />
                </button>
                <button
                  aria-label="编辑中心目标"
                  onClick={() =>
                    setNodeEditor({ mode: "edit", id: state.goal.id })
                  }
                >
                  <SlidersHorizontal size={18} />
                </button>
              </div>
              {loaded ? (
                <GoalCanvas
                  state={state}
                  selectedId={selectedId}
                  feedbackIds={feedbackIds}
                  riskOnly={riskOnly}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setDetailVisible(true);
                  }}
                  onEditTask={(taskId) =>
                    setTaskEditor({ mode: "edit", id: taskId })
                  }
                  onAddChild={(parentId) =>
                    setNodeEditor({ mode: "add", parentId })
                  }
                  onAddTask={(nodeId) =>
                    setTaskEditor({ mode: "add", nodeId })
                  }
                  onToggleCollapse={(nodeId) =>
                    mutate((draft) => {
                      if (nodeId === draft.goal.id) {
                        draft.goal.collapsed = !draft.goal.collapsed;
                      } else {
                        const node = draft.nodes.find(
                          (entry) => entry.id === nodeId,
                        );
                        if (node) node.collapsed = !node.collapsed;
                      }
                    })
                  }
                  onToggleTask={toggleTask}
                  onPositionChange={moveNode}
                  onViewportChange={(viewport) =>
                    mutate((draft) => {
                      draft.canvas.viewport = viewport;
                      draft.canvas.hasSavedViewport = true;
                    })
                  }
                  onArrange={arrange}
                />
              ) : (
                <div className="map-loading-skeleton" />
              )}
              <button
                className="map-add-button"
                onClick={() =>
                  setTaskEditor({
                    mode: "add",
                    nodeId: selectedNode.id,
                  })
                }
              >
                <Plus size={18} />
                添加关联任务
              </button>
            </section>
            {detailVisible && (
              <MapDetailPanel
                state={state}
                selectedId={selectedNode.id}
                onClose={() => setDetailVisible(false)}
                onSelect={(nodeId) => setSelectedId(nodeId)}
                onEditNode={(nodeId) =>
                  setNodeEditor({ mode: "edit", id: nodeId })
                }
                onDeleteNode={setDeleteId}
                onAddChild={(parentId) =>
                  setNodeEditor({ mode: "add", parentId })
                }
                onAddTask={(nodeId) =>
                  setTaskEditor({ mode: "add", nodeId })
                }
                onEditTask={(taskId) =>
                  setTaskEditor({ mode: "edit", id: taskId })
                }
                onToggleTask={toggleTask}
                onToggleCollapse={(nodeId) =>
                  mutate((draft) => {
                    if (nodeId === draft.goal.id) {
                      draft.goal.collapsed = !draft.goal.collapsed;
                    } else {
                      const node = draft.nodes.find(
                        (entry) => entry.id === nodeId,
                      );
                      if (node) node.collapsed = !node.collapsed;
                    }
                  })
                }
              />
            )}
          </div>
        )}

        {(tab === "today" || tab === "plan") && (
          <PlanExperience
            state={state}
            view={tab === "today" ? "today" : planView}
            month={selectedMonth}
            onViewChange={(view) => {
              setPlanView(view);
              if (view === "today") setTab("today");
              else setTab("plan");
            }}
            onMonthChange={setSelectedMonth}
            onToggleTask={toggleTask}
            onEditTask={(taskId) =>
              setTaskEditor({ mode: "edit", id: taskId })
            }
            onAddTask={(date) =>
              setTaskEditor({
                mode: "add",
                nodeId: selectedNode.id,
                date,
              })
            }
            onMoveTask={(taskId, start, end) =>
              mutate((draft) => {
                const task = draft.tasks.find((entry) => entry.id === taskId);
                if (!task) return;
                task.plannedStartDate = start;
                task.plannedEndDate = end;
                task.updatedAt = new Date().toISOString();
              })
            }
            onAddOutcome={(outcome) =>
              mutate((draft) => {
                draft.planning.monthlyOutcomes.push({
                  ...outcome,
                  id: id("outcome"),
                  completed: false,
                });
              })
            }
            onToggleOutcome={(outcomeId) =>
              mutate((draft) => {
                const outcome = draft.planning.monthlyOutcomes.find(
                  (entry) => entry.id === outcomeId,
                );
                if (outcome) outcome.completed = !outcome.completed;
              })
            }
          />
        )}

        {tab === "review" && (
          <ReviewExperience
            state={state}
            update={(periodKey, field, value) =>
              mutate((draft) => {
                draft.reviews ??= {};
                draft.reviews[periodKey] = {
                  ...(draft.reviews[periodKey] ?? {
                    wins: "",
                    friction: "",
                    next: "",
                  }),
                  [field]: value,
                };
              })
            }
          />
        )}

        {tab === "me" && (
          <ProfileExperience
            user={user}
            state={state}
            save={save}
            savedAt={savedAt}
            reset={() => {
              if (window.confirm("恢复示例会覆盖当前工作区，是否继续？")) {
                reset();
                setSelectedId("development");
                setToast({ message: "示例目标已恢复。" });
              }
            }}
          />
        )}
      </main>

      <nav className="mobile-nav">
        {NAV.map(({ id: navId, label, Icon }) => (
          <button
            key={navId}
            className={`mobile-nav-item ${
              tab === navId || (navId === "plan" && tab === "today")
                ? "active"
                : ""
            }`}
            onClick={() => navigate(navId)}
          >
            <Icon size={21} weight="regular" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {nodeEditor && (
        <NodeEditor
          state={state}
          editor={nodeEditor}
          onClose={() => setNodeEditor(null)}
          onSave={(payload) => {
            mutate((draft) => {
              if (payload.id === draft.goal.id) {
                draft.goal = {
                  ...draft.goal,
                  title: payload.title,
                  note: payload.note,
                  deadline: payload.dueDate ?? draft.goal.deadline,
                  successCriteria:
                    payload.successCriteria ?? draft.goal.successCriteria,
                  constraints: payload.constraints ?? draft.goal.constraints,
                  weeklyHours:
                    payload.weeklyHours ?? draft.goal.weeklyHours,
                  bufferPercent:
                    payload.bufferPercent ?? draft.goal.bufferPercent,
                  updatedAt: new Date().toISOString(),
                };
                return;
              }
              if (nodeEditor.mode === "add") {
                draft.nodes.push({
                  id: payload.id,
                  parentId: payload.parentId!,
                  kind: payload.kind as GoalNode["kind"],
                  title: payload.title,
                  note: payload.note,
                  order: draft.nodes.filter(
                    (node) => node.parentId === payload.parentId,
                  ).length,
                  collapsed: false,
                  status: payload.status,
                  dueDate: payload.dueDate,
                  layout: {
                    x: 0,
                    y: 0,
                    side:
                      nodeById(draft, payload.parentId!)?.layout.side ??
                      "right",
                    mode: "auto",
                  },
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
              } else {
                const node = draft.nodes.find(
                  (entry) => entry.id === payload.id,
                );
                if (!node) return;
                node.title = payload.title;
                node.note = payload.note;
                node.status = payload.status;
                node.dueDate = payload.dueDate;
                node.parentId = payload.parentId!;
                node.kind = payload.kind as GoalNode["kind"];
                node.layout.mode = "auto";
                node.updatedAt = new Date().toISOString();
              }
            });
            setSelectedId(payload.id);
            setNodeEditor(null);
            setDetailVisible(true);
            setToast({ message: "目标地图已更新。" });
          }}
        />
      )}

      {taskEditor && (
        <TaskEditor
          state={state}
          editor={taskEditor}
          onClose={() => setTaskEditor(null)}
          onSave={(draftTask) => {
            mutate((draft) => {
              if (taskEditor.mode === "edit") {
                const task = draft.tasks.find(
                  (entry) => entry.id === taskEditor.id,
                );
                if (!task) return;
                const wasDone = task.status === "done";
                Object.assign(task, draftTask, {
                  updatedAt: new Date().toISOString(),
                  completedAt:
                    draftTask.status === "done"
                      ? task.completedAt ?? new Date().toISOString()
                      : wasDone
                        ? null
                        : task.completedAt,
                });
              } else {
                draft.tasks.push({
                  ...draftTask,
                  id: id("task"),
                  completedAt:
                    draftTask.status === "done"
                      ? new Date().toISOString()
                      : null,
                  layout: {
                    x: 0,
                    y: 0,
                    side:
                      draftTask.nodeId &&
                      nodeById(draft, draftTask.nodeId)?.layout.side === "left"
                        ? "left"
                        : "right",
                    mode: "auto",
                  },
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
              }
            });
            setTaskEditor(null);
            setToast({ message: "任务已保存，并同步到所有计划视图。" });
          }}
          onDelete={
            taskEditor.mode === "edit"
              ? () => {
                  setWithUndo((draft) => {
                    draft.tasks = draft.tasks.filter(
                      (task) => task.id !== taskEditor.id,
                    );
                  }, "任务已删除。");
                  setTaskEditor(null);
                }
              : undefined
          }
        />
      )}

      {deleteId && (
        <DeleteNodeDialog
          state={state}
          nodeId={deleteId}
          onClose={() => setDeleteId(null)}
          onDelete={deleteNode}
        />
      )}

      {toast && (
        <div className="feedback-toast" role="status">
          <span>
            <Check size={14} weight="bold" />
          </span>
          {toast.message}
          {toast.undo && undoAvailable && (
            <button
              onClick={() => {
                if (undoRef.current) setState(clone(undoRef.current));
                undoRef.current = null;
                setUndoAvailable(false);
                setToast({ message: "已撤销上一步操作。" });
              }}
            >
              撤销
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type NodeEditorPayload = {
  id: string;
  title: string;
  note: string;
  kind: NodeKind;
  parentId: string | null;
  status: NodeStatus;
  dueDate: string | null;
  successCriteria?: string;
  constraints?: string;
  weeklyHours?: number;
  bufferPercent?: number;
};

function NodeEditor({
  state,
  editor,
  onClose,
  onSave,
}: {
  state: WorkspaceState;
  editor: Exclude<NodeEditorState, null>;
  onClose: () => void;
  onSave: (payload: NodeEditorPayload) => void;
}) {
  const existing =
    editor.mode === "edit" ? structureNode(state, editor.id) : null;
  const parent =
    editor.mode === "add" ? structureNode(state, editor.parentId) : null;
  const initialKind =
    existing?.kind ?? NEXT_KIND[parent?.kind ?? "goal"] ?? "subgoal";
  const [kind, setKind] = useState<NodeKind>(initialKind);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [status, setStatus] = useState<NodeStatus>(
    existing?.status ?? "not_started",
  );
  const [dueDate, setDueDate] = useState(
    existing && "dueDate" in existing
      ? existing.dueDate ?? ""
      : existing?.kind === "goal"
        ? existing.deadline
        : "",
  );
  const [parentId, setParentId] = useState<string | null>(
    existing && existing.kind !== "goal"
      ? existing.parentId
      : editor.mode === "add"
        ? editor.parentId
        : null,
  );
  const [successCriteria, setSuccessCriteria] = useState(
    existing?.kind === "goal" ? existing.successCriteria : "",
  );
  const [constraints, setConstraints] = useState(
    existing?.kind === "goal" ? existing.constraints : "",
  );
  const [weeklyHours, setWeeklyHours] = useState(
    existing?.kind === "goal" ? existing.weeklyHours : 12,
  );
  const [bufferPercent, setBufferPercent] = useState(
    existing?.kind === "goal" ? existing.bufferPercent : 25,
  );
  const isGoal = existing?.kind === "goal";
  const childIds =
    editor.mode === "edit" ? descendantIds(state, editor.id) : new Set<string>();
  const parentKind: Partial<Record<NodeKind, NodeKind>> = {
    factor: "goal",
    milestone: "factor",
    subgoal: "milestone",
  };
  const parentOptions = allStructureNodes(state).filter(
    (node) =>
      node.kind === parentKind[kind] &&
      !childIds.has(node.id),
  );
  const resolvedParentId =
    kind === "goal"
      ? null
      : parentOptions.some((option) => option.id === parentId)
        ? parentId
        : parentOptions[0]?.id ?? null;
  const hasChildren =
    editor.mode === "edit" &&
    state.nodes.some((node) => node.parentId === editor.id);

  return (
    <Modal
      title={
        editor.mode === "add"
          ? `添加${KIND_LABELS[kind]}`
          : `编辑${KIND_LABELS[existing?.kind ?? kind]}`
      }
      subtitle="清晰定义结果、关系与时间边界。"
      close={onClose}
      wide={isGoal}
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) return;
          onSave({
            id:
              editor.mode === "edit"
                ? editor.id
                : id(kind === "goal" ? "goal" : kind),
            title: title.trim(),
            note: note.trim(),
            kind,
            parentId: resolvedParentId,
            status,
            dueDate: dueDate || null,
            successCriteria,
            constraints,
            weeklyHours,
            bufferPercent,
          });
        }}
      >
        {isGoal && (
          <div className="wizard-copy">
            <Target size={23} />
            <div>
              <h3>先定义结果，再安排时间</h3>
              <p>目标的完成标准、现实限制与时间容量会约束整张地图。</p>
            </div>
          </div>
        )}
        <Field label={isGoal ? "中心目标" : "节点名称"}>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="写成一个可判断是否完成的结果"
          />
        </Field>
        <Field label={isGoal ? "目标说明" : "完成定义"}>
          <textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="一句话说明这个节点为什么重要"
          />
        </Field>
        {isGoal ? (
          <>
            <Field label="成功标准">
              <textarea
                rows={3}
                value={successCriteria}
                onChange={(event) => setSuccessCriteria(event.target.value)}
              />
            </Field>
            <Field label="现实限制">
              <textarea
                rows={3}
                value={constraints}
                onChange={(event) => setConstraints(event.target.value)}
              />
            </Field>
            <div className="form-grid">
              <Field label="完成时间">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </Field>
              <Field label="每周可投入小时">
                <input
                  type="number"
                  min={1}
                  max={80}
                  value={weeklyHours}
                  onChange={(event) =>
                    setWeeklyHours(Number(event.target.value))
                  }
                />
              </Field>
            </div>
            <Field label="弹性时间">
              <select
                value={bufferPercent}
                onChange={(event) =>
                  setBufferPercent(Number(event.target.value))
                }
              >
                {[15, 20, 25, 30, 35].map((value) => (
                  <option value={value} key={value}>
                    {value}% · 用于休息、家庭与突发事项
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <>
            <div className="form-grid">
              <Field label="层级">
                <select
                  value={kind}
                  disabled={hasChildren}
                  onChange={(event) => {
                    const nextKind = event.target.value as NodeKind;
                    const expectedParent = parentKind[nextKind];
                    setKind(nextKind);
                    setParentId(
                      allStructureNodes(state).find(
                        (option) =>
                          option.kind === expectedParent &&
                          !childIds.has(option.id),
                      )?.id ?? null,
                    );
                  }}
                >
                  <option value="factor">关键要素</option>
                  <option value="milestone">里程碑</option>
                  <option value="subgoal">子目标</option>
                </select>
              </Field>
              <Field label="所属父级">
                <select
                  value={resolvedParentId ?? ""}
                  onChange={(event) => setParentId(event.target.value)}
                >
                  {parentOptions.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="form-grid">
              <Field label="状态">
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as NodeStatus)
                  }
                >
                  <option value="not_started">未开始</option>
                  <option value="active">进行中</option>
                  <option value="blocked">阻塞</option>
                  <option value="done">已完成</option>
                </select>
              </Field>
              <Field label="目标日期">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </Field>
            </div>
          </>
        )}
        <button className="primary-button full-width" type="submit">
          保存到目标地图
          <ArrowRight size={17} />
        </button>
      </form>
    </Modal>
  );
}

function TaskEditor({
  state,
  editor,
  onClose,
  onSave,
  onDelete,
}: {
  state: WorkspaceState;
  editor: Exclude<TaskEditorState, null>;
  onClose: () => void;
  onSave: (
    draft: Omit<
      WorkspaceState["tasks"][number],
      "id" | "layout" | "createdAt" | "updatedAt" | "completedAt"
    >,
  ) => void;
  onDelete?: () => void;
}) {
  const existing =
    editor.mode === "edit"
      ? state.tasks.find((task) => task.id === editor.id)
      : null;
  const [draft, setDraft] = useState({
    ...EMPTY_TASK_DRAFT,
    title: existing?.title ?? "",
    nodeId:
      existing?.nodeId ??
      (editor.mode === "add" ? editor.nodeId ?? "" : ""),
    quadrant: existing?.quadrant ?? EMPTY_TASK_DRAFT.quadrant,
    minutes: existing?.minutes ?? EMPTY_TASK_DRAFT.minutes,
    status: existing?.status ?? EMPTY_TASK_DRAFT.status,
    plannedStartDate:
      existing?.plannedStartDate ??
      (editor.mode === "add" ? editor.date ?? "" : ""),
    plannedEndDate:
      existing?.plannedEndDate ??
      (editor.mode === "add" ? editor.date ?? "" : ""),
    dueDate: existing?.dueDate ?? "",
    showOnMap: existing?.showOnMap ?? false,
  });
  return (
    <Modal
      title={editor.mode === "edit" ? "编辑任务" : "添加一项可执行任务"}
      subtitle="计划日期决定何时做，截止日期只表达最晚完成时间。"
      close={onClose}
      wide
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.title.trim()) return;
          const start = draft.plannedStartDate || null;
          const end =
            start && draft.plannedEndDate >= start
              ? draft.plannedEndDate
              : start;
          onSave({
            title: draft.title.trim(),
            nodeId: draft.nodeId || null,
            quadrant: draft.quadrant,
            minutes: draft.minutes,
            status: draft.status,
            plannedStartDate: start,
            plannedEndDate: end,
            dueDate: draft.dueDate || null,
            showOnMap: draft.showOnMap,
          });
        }}
      >
        <Field label="任务名称">
          <input
            autoFocus
            value={draft.title}
            placeholder="例如：完成首轮手机交互测试"
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </Field>
        <div className="form-grid">
          <Field label="关联目标节点">
            <select
              value={draft.nodeId}
              onChange={(event) =>
                setDraft({ ...draft, nodeId: event.target.value })
              }
            >
              <option value="">暂不关联</option>
              {allStructureNodes(state).map((node) => (
                <option value={node.id} key={node.id}>
                  {KIND_LABELS[node.kind]} · {node.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="任务状态">
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  status: event.target.value as TaskStatus,
                })
              }
            >
              <option value="todo">待开始</option>
              <option value="doing">进行中</option>
              <option value="blocked">阻塞</option>
              <option value="done">已完成</option>
            </select>
          </Field>
        </div>
        <Field label="四象限">
          <div className="choice-grid">
            {QUADRANTS.map((quadrant) => (
              <button
                type="button"
                key={quadrant.id}
                className={`choice-card ${
                  draft.quadrant === quadrant.id ? "selected" : ""
                }`}
                onClick={() =>
                  setDraft({ ...draft, quadrant: quadrant.id })
                }
              >
                <strong>{quadrant.label}</strong>
                <small>{quadrant.tip}</small>
              </button>
            ))}
          </div>
        </Field>
        <div className="form-grid three">
          <Field label="计划开始">
            <input
              type="date"
              value={draft.plannedStartDate}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  plannedStartDate: event.target.value,
                  plannedEndDate:
                    !event.target.value
                      ? ""
                      : !draft.plannedEndDate ||
                    draft.plannedEndDate < event.target.value
                      ? event.target.value
                      : draft.plannedEndDate,
                })
              }
            />
          </Field>
          <Field label="计划结束">
            <input
              type="date"
              min={draft.plannedStartDate || undefined}
              value={draft.plannedEndDate}
              onChange={(event) =>
                setDraft({ ...draft, plannedEndDate: event.target.value })
              }
            />
          </Field>
          <Field label="截止日期">
            <input
              type="date"
              value={draft.dueDate}
              onChange={(event) =>
                setDraft({ ...draft, dueDate: event.target.value })
              }
            />
          </Field>
        </div>
        <Field label="预计耗时">
          <div className="duration-row">
            {[25, 45, 60, 90].map((minutes) => (
              <button
                type="button"
                key={minutes}
                className={`duration-pill ${
                  draft.minutes === minutes ? "selected" : ""
                }`}
                onClick={() => setDraft({ ...draft, minutes })}
              >
                {minutes} 分钟
              </button>
            ))}
          </div>
        </Field>
        <label className="switch-row">
          <span>
            <strong>在目标地图中显示</strong>
            <small>任务会作为当前节点的叶子自然展开</small>
          </span>
          <input
            type="checkbox"
            checked={draft.showOnMap}
            onChange={(event) =>
              setDraft({ ...draft, showOnMap: event.target.checked })
            }
          />
        </label>
        <div className="modal-form-actions">
          {onDelete ? (
            <button
              type="button"
              className="text-button danger"
              onClick={onDelete}
            >
              删除任务
            </button>
          ) : (
            <span />
          )}
          <button className="primary-button" type="submit">
            保存任务
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteNodeDialog({
  state,
  nodeId,
  onClose,
  onDelete,
}: {
  state: WorkspaceState;
  nodeId: string;
  onClose: () => void;
  onDelete: (mode: "promote" | "subtree") => void;
}) {
  const node = state.nodes.find((entry) => entry.id === nodeId);
  if (!node) return null;
  const ids = descendantIds(state, nodeId);
  const childCount = ids.size - 1;
  const taskCount = state.tasks.filter(
    (task) => task.nodeId && ids.has(task.nodeId),
  ).length;
  return (
    <Modal
      title={`删除「${node.title}」？`}
      subtitle={`这个分支包含 ${childCount} 个子节点和 ${taskCount} 项任务。`}
      close={onClose}
    >
      <div className="delete-options">
        <button onClick={() => onDelete("promote")}>
          <strong>只删除当前节点</strong>
          <span>子节点上移，当前任务转移到父节点</span>
        </button>
        <button className="danger" onClick={() => onDelete("subtree")}>
          <strong>删除整个分支</strong>
          <span>同时删除所有子节点和关联任务</span>
        </button>
      </div>
    </Modal>
  );
}

function ReviewExperience({
  state,
  update,
}: {
  state: WorkspaceState;
  update: (
    periodKey: string,
    field: keyof WorkspaceState["reviewNotes"],
    value: string,
  ) => void;
}) {
  const [period, setPeriod] = useState<"week" | "month" | "year">("week");
  const today = dateKey();
  const periodRange =
    period === "week"
      ? {
          start: startOfLocalWeek(today),
          end: endOfLocalWeek(today),
          key: `week:${startOfLocalWeek(today)}`,
        }
      : period === "month"
        ? {
            start: startOfLocalMonth(today.slice(0, 7)),
            end: endOfLocalMonth(today.slice(0, 7)),
            key: `month:${today.slice(0, 7)}`,
          }
        : {
            start: `${today.slice(0, 4)}-01-01`,
            end: `${today.slice(0, 4)}-12-31`,
            key: `year:${today.slice(0, 4)}`,
          };
  const periodTasks = state.tasks.filter(
    (task) =>
      task.plannedStartDate &&
      task.plannedStartDate >= periodRange.start &&
      task.plannedStartDate <= periodRange.end,
  );
  const notes =
    state.reviews?.[periodRange.key] ??
    (period === "week"
      ? state.reviewNotes
      : { wins: "", friction: "", next: "" });
  const allocation = state.nodes
    .filter((node) => node.kind === "factor")
    .map((factor) => {
      const ids = descendantIds(state, factor.id);
      const minutes = periodTasks
        .filter((task) => task.nodeId && ids.has(task.nodeId))
        .reduce((sum, task) => sum + task.minutes, 0);
      return { factor, minutes, metrics: nodeMetrics(state, factor.id) };
    });
  const max = Math.max(1, ...allocation.map((item) => item.minutes));
  const ordered = [...allocation].sort((a, b) => b.minutes - a.minutes);
  const atRisk = allocation.filter(
    (item) => item.metrics.risk !== "calm",
  );
  return (
    <div className="view-frame">
      <div className="view-heading">
        <div>
          <p className="section-kicker">周期复盘</p>
          <h1>看见时间真正流向了哪里</h1>
          <p>不评价忙碌，只判断投入是否靠近目标。</p>
        </div>
      </div>
      <div className="segmented-control">
        {[
          ["week", "本周"],
          ["month", "本月"],
          ["year", "今年"],
        ].map(([value, label]) => (
          <button
            className={period === value ? "active" : ""}
            key={value}
            onClick={() => setPeriod(value as typeof period)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="review-grid">
        <section className="review-panel">
          <PanelTitle
            title="分支投入"
            text="按当前任务预计时间计算"
            aside={`${state.goal.weeklyHours}h 可投入`}
          />
          <div className="allocation-list">
            {allocation.map(({ factor, minutes, metrics }) => (
              <div className="allocation-row" key={factor.id}>
                <div>
                  <strong>{factor.title}</strong>
                  <span>
                    {(minutes / 60).toFixed(1)}h · {metrics.progress}%
                  </span>
                </div>
                <div>
                  <span
                    style={{
                      width: `${Math.max(8, (minutes / max) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="review-panel insight-panel">
          <span className="insight-icon">
            <Sparkle size={22} />
          </span>
          <h2>下一阶段建议</h2>
          <p>
            「{ordered[0]?.factor.title}」获得了最多时间。
            {atRisk.length
              ? `「${atRisk[0].factor.title}」已出现停滞或截止风险，建议先配置一项重要不紧急任务。`
              : "当前分支节奏较稳定，可以继续保护重要不紧急的投入。"}
          </p>
          <div className="insight-action">
            <span>建议配置</span>
            <strong>60% 核心推进 · 15% 验证 · 25% 弹性</strong>
          </div>
        </section>
      </div>
      <section className="reflection-section">
        <PanelTitle
          title={
            period === "week"
              ? "本周回看"
              : period === "month"
                ? "本月回看"
                : "今年回看"
          }
          text="记录判断，让下一次规划更诚实。"
        />
        <div className="reflection-grid">
          {[
            ["wins", "值得保留的节奏"],
            ["friction", "停滞或失衡"],
            ["next", "下一周期只改变一件事"],
          ].map(([field, label]) => (
            <label key={field}>
              <span>{label}</span>
              <textarea
                rows={4}
                value={
                  notes[field as keyof WorkspaceState["reviewNotes"]]
                }
                onChange={(event) =>
                  update(
                    periodRange.key,
                    field as keyof WorkspaceState["reviewNotes"],
                    event.target.value,
                  )
                }
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProfileExperience({
  user,
  state,
  save,
  savedAt,
  reset,
}: {
  user: { displayName: string; email: string };
  state: WorkspaceState;
  save: string;
  savedAt: string | null;
  reset: () => void;
}) {
  const metrics = nodeMetrics(state, state.goal.id);
  const exportData = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "master-data.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="view-frame">
      <div className="view-heading">
        <div>
          <p className="section-kicker">我的空间</p>
          <h1>时间属于你，不属于清单</h1>
          <p>这里保存你的目标、投入习惯与每一次真实复盘。</p>
        </div>
      </div>
      <section className="profile-card">
        <div className="profile-avatar">{user.displayName.slice(0, 2)}</div>
        <div>
          <h2>{user.displayName}</h2>
          <p>{user.email || "当前为验证体验身份"}</p>
        </div>
        <span className={`account-state ${save}`}>
          {save === "saved"
            ? "数据已保存"
            : save === "conflict"
              ? "请刷新以合并更新"
              : "正在同步"}
        </span>
      </section>
      <div className="profile-grid">
        <section>
          <h3>当前目标</h3>
          <strong>{state.goal.title}</strong>
          <p>{metrics.progress}% 已完成</p>
          <div className="profile-progress">
            <span style={{ width: `${metrics.progress}%` }} />
          </div>
        </section>
        <section>
          <h3>时间边界</h3>
          <strong>{state.goal.weeklyHours} 小时 / 周</strong>
          <p>保留 {state.goal.bufferPercent}% 弹性时间</p>
        </section>
        <section>
          <h3>数据状态</h3>
          <strong>{save === "error" ? "等待连接" : "永久保存中"}</strong>
          <p>
            {savedAt
              ? `最近保存 ${new Intl.DateTimeFormat("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(savedAt))}`
              : "完成第一次修改后自动保存"}
          </p>
        </section>
      </div>
      <section className="data-actions">
        <div>
          <h2>数据与恢复</h2>
          <p>你可以随时导出当前目标数据。恢复示例会覆盖当前工作区。</p>
        </div>
        <div>
          <button className="secondary-button" onClick={exportData}>
            <DownloadSimple size={17} />
            导出数据
          </button>
          <button className="text-button danger" onClick={reset}>
            恢复示例
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function PanelTitle({
  title,
  text,
  aside,
}: {
  title: string;
  text: string;
  aside?: string;
}) {
  return (
    <header className="panel-heading">
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      {aside && <span>{aside}</span>}
    </header>
  );
}

function Modal({
  title,
  subtitle,
  close,
  children,
  wide = false,
}: {
  title: string;
  subtitle: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section
        className={`modal-sheet ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button
            className="icon-button subtle"
            aria-label="关闭"
            onClick={close}
          >
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
