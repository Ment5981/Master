import { useState } from 'react'
import {
  CalendarBlank,
  Clock,
  Flag,
  Plus,
  X,
} from '@phosphor-icons/react'
import { TaskComposer } from '../../components/TaskComposer'
import { TaskRow } from '../../components/TaskRow'
import { Button } from '../../components/ui/Button'
import { ProgressRing } from '../../components/ui/ProgressRing'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { formatShortDate, minutesLabel } from '../../lib/date'
import { computeBranchHealth } from '../../lib/metrics'
import { useMasterStore } from '../../store/useMasterStore'

export function NodeDetailPanel() {
  const [composerOpen, setComposerOpen] = useState(false)
  const [addingChild, setAddingChild] = useState(false)
  const [childTitle, setChildTitle] = useState('')
  const selectedNodeId = useMasterStore((state) => state.selectedNodeId)
  const selectNode = useMasterStore((state) => state.selectNode)
  const goals = useMasterStore((state) => state.goals)
  const nodes = useMasterStore((state) => state.nodes)
  const tasks = useMasterStore((state) => state.tasks)
  const addNode = useMasterStore((state) => state.addNode)
  const updateNode = useMasterStore((state) => state.updateNode)
  const node = nodes.find((candidate) => candidate.id === selectedNodeId)
  const goal = goals.find((candidate) => candidate.id === node?.goalId)

  if (!node || !goal) return null
  const health = computeBranchHealth(goal, node, nodes, tasks)
  const linkedTasks = tasks.filter((task) => task.nodeId === node.id)
  const childType =
    node.type === 'goal'
      ? 'element'
      : node.type === 'element'
        ? 'milestone'
        : 'subgoal'

  const submitChild = () => {
    if (!childTitle.trim()) return
    addNode(node.id, childType, childTitle.trim())
    setChildTitle('')
    setAddingChild(false)
  }

  return (
    <>
      <aside className="node-detail-panel">
        <header className="node-panel-header">
          <span>
            {node.type === 'goal'
              ? '中心目标'
              : node.type === 'element'
                ? '关键要素'
                : node.type === 'milestone'
                  ? '里程碑'
                  : '子目标'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => selectNode(null)}
            aria-label="关闭节点详情"
          >
            <X size={18} />
          </Button>
        </header>

        <div className="node-panel-title">
          <ProgressRing value={health.progress} size="lg" />
          <div>
            <h2>{node.title}</h2>
            <StatusBadge kind={health.risk} />
          </div>
        </div>

        <label className="field node-description-field">
          <span>完成定义</span>
          <textarea
            rows={3}
            value={node.description}
            onChange={(event) =>
              updateNode(node.id, { description: event.target.value })
            }
          />
        </label>

        <div className="node-stats">
          <div>
            <Clock size={17} />
            <span>
              <small>计划投入</small>
              <strong>{minutesLabel(health.plannedMinutes)}</strong>
            </span>
          </div>
          <div>
            <CalendarBlank size={17} />
            <span>
              <small>目标日期</small>
              <strong>
                {node.deadline ? formatShortDate(node.deadline) : '未设置'}
              </strong>
            </span>
          </div>
        </div>

        <section className="node-panel-section">
          <div className="node-panel-section-heading">
            <div>
              <h3>下一层拆解</h3>
              <span>
                {nodes.filter((candidate) => candidate.parentId === node.id).length}
                个节点
              </span>
            </div>
            <button type="button" onClick={() => setAddingChild(true)}>
              <Plus size={15} />
              新增
            </button>
          </div>
          {addingChild ? (
            <div className="inline-node-form">
              <Flag size={17} />
              <input
                autoFocus
                value={childTitle}
                onChange={(event) => setChildTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitChild()
                  if (event.key === 'Escape') setAddingChild(false)
                }}
                placeholder={
                  childType === 'milestone' ? '里程碑名称' : '节点名称'
                }
              />
              <Button size="sm" variant="primary" onClick={submitChild}>
                保存
              </Button>
            </div>
          ) : null}
          <div className="child-node-list">
            {nodes
              .filter((candidate) => candidate.parentId === node.id)
              .sort((a, b) => a.order - b.order)
              .map((child) => (
                <button
                  type="button"
                  key={child.id}
                  onClick={() => selectNode(child.id)}
                >
                  <span>{child.title}</span>
                  <strong>
                    {computeBranchHealth(goal, child, nodes, tasks).progress}%
                  </strong>
                </button>
              ))}
          </div>
        </section>

        <section className="node-panel-section linked-tasks">
          <div className="node-panel-section-heading">
            <div>
              <h3>关联任务</h3>
              <span>{linkedTasks.length}项</span>
            </div>
            <button type="button" onClick={() => setComposerOpen(true)}>
              <Plus size={15} />
              添加
            </button>
          </div>
          <div className="task-list">
            {linkedTasks.length ? (
              linkedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  showQuadrant={false}
                />
              ))
            ) : (
              <p className="panel-empty-copy">还没有关联到这个节点的任务。</p>
            )}
          </div>
        </section>
      </aside>

      <TaskComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        defaultNodeId={node.id}
      />
    </>
  )
}
