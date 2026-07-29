"use client";

import {
  CaretDown,
  CaretRight,
  Check,
  CirclesFour,
  Flag,
  PencilSimple,
  Plus,
  Target,
  Trash,
  TreeStructure,
  X,
} from "@phosphor-icons/react";
import {
  breadcrumb,
  directChildren,
  nodeMetrics,
  structureNode,
  tasksForNode,
} from "../../domain/selectors";
import type { NodeKind, WorkspaceState } from "../../domain/types";
import { KIND_LABELS, NEXT_KIND } from "../../domain/types";

const iconByKind: Record<NodeKind, typeof Target> = {
  goal: Target,
  factor: CirclesFour,
  milestone: Flag,
  subgoal: TreeStructure,
};

export function MapDetailPanel({
  state,
  selectedId,
  onClose,
  onSelect,
  onEditNode,
  onDeleteNode,
  onAddChild,
  onAddTask,
  onEditTask,
  onToggleTask,
  onToggleCollapse,
}: {
  state: WorkspaceState;
  selectedId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onEditNode: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onAddChild: (id: string) => void;
  onAddTask: (nodeId: string) => void;
  onEditTask: (taskId: string) => void;
  onToggleTask: (taskId: string) => void;
  onToggleCollapse: (id: string) => void;
}) {
  const node = structureNode(state, selectedId) ?? state.goal;
  const metrics = nodeMetrics(state, node.id);
  const children = directChildren(state, node.id);
  const linked = tasksForNode(state, node.id, false);
  const path = breadcrumb(state, node.id);
  const Icon = iconByKind[node.kind];
  const riskLabel = {
    calm: "节奏稳定",
    watch: "需要关注",
    risk: "存在风险",
  }[metrics.risk];

  return (
    <aside className="detail-panel">
      <div className="detail-heading">
        <span className="detail-icon">
          <Icon size={24} weight="light" />
        </span>
        <div>
          <p className="detail-path">{path.join(" / ")}</p>
          <h2>{node.title}</h2>
        </div>
        <div className="detail-actions">
          <button aria-label="编辑节点" onClick={() => onEditNode(node.id)}>
            <PencilSimple size={18} />
          </button>
          <button aria-label="关闭详情" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="detail-progress">
        <span
          className="detail-progress-ring"
          style={
            {
              "--node-progress": `${metrics.progress * 3.6}deg`,
            } as React.CSSProperties
          }
        >
          {metrics.progress}%
        </span>
        <div>
          <strong>{metrics.taskCount}</strong>
          <span>任务</span>
        </div>
        <div className={metrics.risk === "risk" ? "risk-metric" : ""}>
          <strong>{metrics.openTaskCount}</strong>
          <span>待完成</span>
        </div>
        <div>
          <strong>{metrics.blockedTaskCount}</strong>
          <span>阻塞</span>
        </div>
      </div>

      <section className="detail-section">
        <h3>聚焦</h3>
        <p>{node.note || "为这个节点补充一句清晰的完成定义。"}</p>
        <span className={`detail-risk-note ${metrics.risk}`}>
          {riskLabel}
          {" · "}
          {metrics.minutes
            ? `已配置 ${(metrics.minutes / 60).toFixed(1)} 小时`
            : "尚未配置任务"}
        </span>
      </section>

      {children.length > 0 && (
        <section className="detail-section">
          <header>
            <div>
              <h3>下一级</h3>
              <span>{children.length} 个节点</span>
            </div>
            <button
              className="text-button"
              onClick={() => onToggleCollapse(node.id)}
            >
              {node.collapsed ? (
                <>
                  <CaretRight size={14} />
                  展开
                </>
              ) : (
                <>
                  <CaretDown size={14} />
                  收起
                </>
              )}
            </button>
          </header>
          <div className="detail-child-list">
            {children.map((child) => {
              const childMetrics = nodeMetrics(state, child.id);
              return (
                <button
                  key={child.id}
                  className="detail-child-row"
                  onClick={() => onSelect(child.id)}
                >
                  <span>{KIND_LABELS[child.kind]}</span>
                  <strong>{child.title}</strong>
                  <em>{childMetrics.progress}%</em>
                  <CaretRight size={14} />
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="detail-section">
        <header>
          <div>
            <h3>关联任务</h3>
            <span>地图与计划共用同一份任务</span>
          </div>
          <button
            className="text-button"
            onClick={() => onAddTask(node.id)}
          >
            <Plus size={14} />
            添加
          </button>
        </header>
        <div className="detail-task-list">
          {linked.length ? (
            linked.map((task) => (
              <div
                className={`detail-task-row ${
                  task.status === "done" ? "completed" : ""
                }`}
                key={task.id}
              >
                <button
                  className="detail-task-check"
                  onClick={() => onToggleTask(task.id)}
                  aria-label={
                    task.status === "done"
                      ? `恢复${task.title}`
                      : `完成${task.title}`
                  }
                >
                  {task.status === "done" && (
                    <Check size={13} weight="bold" />
                  )}
                </button>
                <button
                  className="detail-task-copy"
                  onClick={() => onEditTask(task.id)}
                >
                  <strong>{task.title}</strong>
                  <span>
                    {task.minutes} 分钟 ·{" "}
                    {task.status === "blocked"
                      ? "阻塞"
                      : task.status === "doing"
                        ? "进行中"
                        : task.status === "done"
                          ? "已完成"
                          : "待开始"}
                  </span>
                </button>
              </div>
            ))
          ) : (
            <div className="empty detail-empty">这个节点还没有直接任务</div>
          )}
        </div>
      </section>

      <div className="detail-footer-actions">
        {NEXT_KIND[node.kind] && (
          <button
            className="secondary-button"
            onClick={() => onAddChild(node.id)}
          >
            <Plus size={16} />
            添加{KIND_LABELS[NEXT_KIND[node.kind]!]}
          </button>
        )}
        {node.kind !== "goal" && (
          <button
            className="text-button danger"
            onClick={() => onDeleteNode(node.id)}
          >
            <Trash size={15} />
            删除节点
          </button>
        )}
      </div>
    </aside>
  );
}
