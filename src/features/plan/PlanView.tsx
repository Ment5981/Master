import { useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarBlank,
  Check,
  Clock,
  Plus,
  Sparkle,
} from '@phosphor-icons/react'
import {
  endOfMonth,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfMonth,
} from 'date-fns'
import type { Task } from '../../domain'
import { TaskComposer } from '../../components/TaskComposer'
import { Button } from '../../components/ui/Button'
import { ProgressRing } from '../../components/ui/ProgressRing'
import {
  formatShortDate,
  formatWeekday,
  getWeekDays,
  isToday,
  minutesLabel,
  toDateKey,
} from '../../lib/date'
import { computeBranchHealth, computeNodeProgress } from '../../lib/metrics'
import { useMasterStore } from '../../store/useMasterStore'

type PlanMode = 'week' | 'month' | 'year'

function PlanTaskCard({ task }: { task: Task }) {
  const nodes = useMasterStore((state) => state.nodes)
  const node = nodes.find((candidate) => candidate.id === task.nodeId)

  return (
    <article
      className={`plan-task-card ${task.status === 'completed' ? 'complete' : ''}`}
      draggable={task.status !== 'completed'}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/task-id', task.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
    >
      <div>
        {task.status === 'completed' ? (
          <Check size={14} weight="bold" />
        ) : (
          <Clock size={14} />
        )}
        <span>{minutesLabel(task.estimatedMinutes)}</span>
      </div>
      <strong>{task.title}</strong>
      <small>{node?.title ?? '临时事务'}</small>
    </article>
  )
}

export function PlanView() {
  const [mode, setMode] = useState<PlanMode>('week')
  const [composerOpen, setComposerOpen] = useState(false)
  const [dragOverDay, setDragOverDay] = useState<string | null>(null)
  const goals = useMasterStore((state) => state.goals)
  const nodes = useMasterStore((state) => state.nodes)
  const tasks = useMasterStore((state) => state.tasks)
  const planTask = useMasterStore((state) => state.planTask)
  const setActiveView = useMasterStore((state) => state.setActiveView)
  const selectNode = useMasterStore((state) => state.selectNode)
  const goal = goals[0]
  const rootNode = nodes.find((node) => node.parentId === null)
  const elements = nodes.filter((node) => node.parentId === rootNode?.id)
  const weekDays = useMemo(() => getWeekDays(), [])
  const weekKeys = weekDays.map(toDateKey)
  const weekTasks = tasks.filter(
    (task) =>
      task.plannedDate &&
      weekKeys.includes(task.plannedDate) &&
      task.status !== 'cancelled',
  )
  const plannedMinutes = weekTasks.reduce(
    (sum, task) => sum + task.estimatedMinutes,
    0,
  )
  const weeklyCapacity = (goal?.weeklyHours ?? 0) * 60
  const committedRate = weeklyCapacity
    ? Math.round((plannedMinutes / weeklyCapacity) * 100)
    : 0
  const unscheduled = tasks.filter(
    (task) =>
      !task.plannedDate && !['completed', 'cancelled'].includes(task.status),
  )
  const monthStart = startOfMonth(new Date())
  const monthEnd = endOfMonth(new Date())
  const monthMilestones = nodes.filter((node) => {
    if (!node.deadline || node.type !== 'milestone') return false
    const deadline = parseISO(node.deadline)
    return !isBefore(deadline, monthStart) && !isAfter(deadline, monthEnd)
  })

  return (
    <div className="page plan-page">
      <header className="page-header plan-header">
        <div>
          <span className="page-context">把目标放进真实时间</span>
          <h1>计划未来，但不排满未来</h1>
          <p>先配置关键推进，再为休息、家庭和意外保留空间。</p>
        </div>
        <Button
          variant="primary"
          leadingIcon={<Plus size={17} weight="bold" />}
          onClick={() => setComposerOpen(true)}
        >
          添加任务
        </Button>
      </header>

      <div className="segmented-control plan-mode-switch" role="tablist">
        {[
          { id: 'week' as const, label: '本周' },
          { id: 'month' as const, label: '月度' },
          { id: 'year' as const, label: '年度' },
        ].map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            className={mode === item.id ? 'selected' : ''}
            key={item.id}
            onClick={() => setMode(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {mode === 'week' ? (
        <>
          <section className="capacity-strip">
            <div>
              <span>本周计划</span>
              <strong>{minutesLabel(plannedMinutes)}</strong>
            </div>
            <div className="capacity-meter">
              <div>
                <span
                  style={{
                    width: `${Math.min(100, committedRate)}%`,
                  }}
                />
              </div>
              <small>
                已使用稳定容量的 {committedRate}%
                {committedRate > 75 ? '，建议移出次要任务' : '，仍保留弹性'}
              </small>
            </div>
            <div>
              <span>缓冲空间</span>
              <strong>
                {minutesLabel(Math.max(weeklyCapacity - plannedMinutes, 0))}
              </strong>
            </div>
          </section>

          <div className="week-layout">
            <section className="week-board">
              {weekDays.map((day) => {
                const key = toDateKey(day)
                const dayTasks = weekTasks.filter(
                  (task) => task.plannedDate === key,
                )
                const dayMinutes = dayTasks.reduce(
                  (sum, task) => sum + task.estimatedMinutes,
                  0,
                )
                return (
                  <div
                    className={`week-day ${isToday(day) ? 'today' : ''} ${
                      dragOverDay === key ? 'drag-over' : ''
                    }`}
                    key={key}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setDragOverDay(key)
                    }}
                    onDragLeave={() => setDragOverDay(null)}
                    onDrop={(event) => {
                      event.preventDefault()
                      const taskId =
                        event.dataTransfer.getData('text/task-id')
                      if (taskId) planTask(taskId, key)
                      setDragOverDay(null)
                    }}
                  >
                    <header>
                      <span>{formatWeekday(day)}</span>
                      <strong>{format(day, 'd')}</strong>
                      <small>
                        {dayMinutes ? minutesLabel(dayMinutes) : '未安排'}
                      </small>
                    </header>
                    <div className="day-task-stack">
                      {dayTasks.map((task) => (
                        <PlanTaskCard key={task.id} task={task} />
                      ))}
                      {!dayTasks.length ? (
                        <span className="day-drop-hint">拖入任务</span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </section>

            <aside className="unscheduled-panel">
              <div className="section-heading">
                <div>
                  <h2>待安排</h2>
                  <p>{unscheduled.length}项未进入计划</p>
                </div>
              </div>
              <div className="unscheduled-list">
                {unscheduled.length ? (
                  unscheduled.map((task) => (
                    <PlanTaskCard key={task.id} task={task} />
                  ))
                ) : (
                  <div className="panel-empty-copy">
                    当前任务都有明确位置。
                  </div>
                )}
              </div>
              <div className="planning-guidance">
                <Sparkle size={18} />
                <p>建议只规划稳定容量的60%到75%，不要把缓冲时间当成空闲。</p>
              </div>
            </aside>
          </div>
        </>
      ) : null}

      {mode === 'month' ? (
        <div className="period-plan-layout">
          <section className="period-focus">
            <span>{format(new Date(), 'yyyy年M月')}</span>
            <h2>本月把力量放在哪里</h2>
            <p>
              选择少数能够改变目标状态的里程碑，而不是追求完成更多零散任务。
            </p>
            <div className="month-milestones">
              {monthMilestones.length ? (
                monthMilestones.map((node) => (
                  <button
                    type="button"
                    key={node.id}
                    onClick={() => {
                      selectNode(node.id)
                      setActiveView('map')
                    }}
                  >
                    <CalendarBlank size={18} />
                    <span>
                      <strong>{node.title}</strong>
                      <small>
                        {node.deadline
                          ? `${formatShortDate(node.deadline)}前`
                          : '未设置日期'}
                      </small>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                ))
              ) : (
                <div className="empty-state compact-empty">
                  <CalendarBlank size={26} />
                  <strong>本月还没有里程碑</strong>
                  <p>回到地图，为关键节点设置一个清晰的阶段结果。</p>
                </div>
              )}
            </div>
          </section>

          <section className="period-branches">
            <div className="section-heading">
              <div>
                <h2>分支配置</h2>
                <p>检查投入是否平衡</p>
              </div>
            </div>
            {goal
              ? elements.map((element) => {
                  const health = computeBranchHealth(
                    goal,
                    element,
                    nodes,
                    tasks,
                  )
                  return (
                    <button
                      type="button"
                      key={element.id}
                      className="period-branch-row"
                      onClick={() => {
                        selectNode(element.id)
                        setActiveView('map')
                      }}
                    >
                      <ProgressRing value={health.progress} size="sm" />
                      <span>
                        <strong>{element.title}</strong>
                        <small>
                          已投入 {minutesLabel(health.actualMinutes)}
                        </small>
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  )
                })
              : null}
          </section>
        </div>
      ) : null}

      {mode === 'year' && goal && rootNode ? (
        <div className="year-plan">
          <section className="year-goal-summary">
            <div>
              <span>{format(new Date(), 'yyyy')}年度目标</span>
              <h2>{goal.title}</h2>
              <p>{goal.description}</p>
            </div>
            <ProgressRing
              value={computeNodeProgress(rootNode.id, nodes, tasks)}
              size="lg"
            />
          </section>

          <section className="year-success">
            <div className="section-heading">
              <div>
                <h2>完成的证据</h2>
                <p>年度回顾时，用结果而不是忙碌程度判断。</p>
              </div>
            </div>
            <div className="success-criteria-grid">
              {goal.successCriteria.map((criterion, index) => (
                <div key={criterion}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{criterion}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="year-branches">
            {elements.map((element) => {
              const health = computeBranchHealth(
                goal,
                element,
                nodes,
                tasks,
              )
              return (
                <button
                  type="button"
                  key={element.id}
                  onClick={() => {
                    selectNode(element.id)
                    setActiveView('map')
                  }}
                >
                  <span>{element.weight}%权重</span>
                  <strong>{element.title}</strong>
                  <small>
                    {health.progress}%完成，{health.totalTasks}项行动
                  </small>
                  <ArrowRight size={16} />
                </button>
              )
            })}
          </section>
        </div>
      ) : null}

      <TaskComposer open={composerOpen} onOpenChange={setComposerOpen} />
    </div>
  )
}
