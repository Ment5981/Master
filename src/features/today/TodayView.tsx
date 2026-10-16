import { useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarCheck,
  Clock,
  Plus,
  Target,
} from '@phosphor-icons/react'
import { isSameWeek, parseISO } from 'date-fns'
import { Button } from '../../components/ui/Button'
import { ProgressRing } from '../../components/ui/ProgressRing'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { TaskComposer } from '../../components/TaskComposer'
import { TaskRow } from '../../components/TaskRow'
import { formatLongDate, minutesLabel, todayKey } from '../../lib/date'
import { computeBranchHealth, computeNodeProgress } from '../../lib/metrics'
import { useMasterStore } from '../../store/useMasterStore'

export function TodayView() {
  const [composerOpen, setComposerOpen] = useState(false)
  const goals = useMasterStore((state) => state.goals)
  const nodes = useMasterStore((state) => state.nodes)
  const tasks = useMasterStore((state) => state.tasks)
  const setActiveView = useMasterStore((state) => state.setActiveView)
  const goal = goals[0]
  const rootNode = nodes.find((node) => node.parentId === null)
  const elements = nodes
    .filter((node) => node.parentId === rootNode?.id)
    .sort((a, b) => a.order - b.order)

  const todayTasks = useMemo(
    () =>
      tasks
        .filter(
          (task) =>
            task.plannedDate === todayKey() && task.status !== 'cancelled',
        )
        .sort((a, b) => {
          const statusOrder = {
            in_progress: 0,
            blocked: 1,
            planned: 2,
            inbox: 3,
            completed: 4,
            cancelled: 5,
          }
          return statusOrder[a.status] - statusOrder[b.status]
        }),
    [tasks],
  )

  const weekTasks = tasks.filter((task) => {
    if (!task.plannedDate) return false
    return isSameWeek(parseISO(task.plannedDate), new Date(), {
      weekStartsOn: 1,
    })
  })
  const todayPlanned = todayTasks
    .filter((task) => task.status !== 'completed')
    .reduce((sum, task) => sum + task.estimatedMinutes, 0)
  const weekPlanned = weekTasks
    .filter((task) => task.status !== 'cancelled')
    .reduce((sum, task) => sum + task.estimatedMinutes, 0)
  const weeklyCapacity = (goal?.weeklyHours ?? 0) * 60
  const remainingCapacity = Math.max(weeklyCapacity - weekPlanned, 0)
  const rootProgress =
    rootNode && goal ? computeNodeProgress(rootNode.id, nodes, tasks) : 0
  const currentTask = todayTasks.find(
    (task) => task.status === 'in_progress',
  )

  return (
    <div className="page today-page">
      <header className="page-header today-header">
        <div>
          <span className="page-context">{formatLongDate(new Date())}</span>
          <h1>今天，推进最重要的一步</h1>
          <p>从长期目标中选择少数行动，给生活和变化保留空间。</p>
        </div>
        <Button
          variant="primary"
          leadingIcon={<Plus size={17} weight="bold" />}
          onClick={() => setComposerOpen(true)}
        >
          添加任务
        </Button>
      </header>

      <section className="day-summary" aria-label="今日概览">
        <div>
          <Clock size={19} />
          <span>
            <small>今日已安排</small>
            <strong>{minutesLabel(todayPlanned)}</strong>
          </span>
        </div>
        <div>
          <CalendarCheck size={19} />
          <span>
            <small>本周剩余容量</small>
            <strong>{minutesLabel(remainingCapacity)}</strong>
          </span>
        </div>
        <div>
          <Target size={19} />
          <span>
            <small>当前目标进度</small>
            <strong>{rootProgress}%</strong>
          </span>
        </div>
      </section>

      {currentTask ? (
        <section className="current-focus" aria-label="当前进行中的任务">
          <div className="focus-label">
            <span>正在推进</span>
            <strong>{currentTask.title}</strong>
          </div>
          <div className="focus-meta">
            <span>{minutesLabel(currentTask.estimatedMinutes)}</span>
            <button
              type="button"
              onClick={() => setActiveView('map')}
            >
              查看目标位置
              <ArrowRight size={15} />
            </button>
          </div>
        </section>
      ) : null}

      <div className="today-layout">
        <section className="task-section">
          <div className="section-heading">
            <div>
              <h2>今日关键推进</h2>
              <p>
                {todayTasks.filter((task) => task.status !== 'completed').length}
                项待完成
              </p>
            </div>
            <button type="button" onClick={() => setComposerOpen(true)}>
              <Plus size={16} />
              添加
            </button>
          </div>

          <div className="task-list">
            {todayTasks.length ? (
              todayTasks.map((task) => <TaskRow key={task.id} task={task} />)
            ) : (
              <div className="empty-state compact-empty">
                <CalendarCheck size={27} />
                <strong>今天还没有安排任务</strong>
                <p>从目标地图选择一个下一行动，或给今天留出完整的休息时间。</p>
                <Button
                  variant="secondary"
                  onClick={() => setComposerOpen(true)}
                >
                  安排任务
                </Button>
              </div>
            )}
          </div>
        </section>

        <aside className="goal-pulse">
          <div className="section-heading">
            <div>
              <h2>目标脉搏</h2>
              <p>{goal?.title}</p>
            </div>
            <ProgressRing value={rootProgress} size="lg" />
          </div>

          <div className="branch-pulse-list">
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
                      className="branch-pulse"
                      key={element.id}
                      onClick={() => {
                        useMasterStore.getState().selectNode(element.id)
                        setActiveView('map')
                      }}
                    >
                      <ProgressRing value={health.progress} size="sm" />
                      <span>
                        <strong>{element.title}</strong>
                        <small>
                          {health.completedTasks}/{health.totalTasks} 项完成
                        </small>
                      </span>
                      <StatusBadge
                        kind={
                          health.risk === 'normal'
                            ? health.activity
                            : health.risk
                        }
                      />
                    </button>
                  )
                })
              : null}
          </div>

          <button
            type="button"
            className="text-action"
            onClick={() => setActiveView('map')}
          >
            打开完整目标地图
            <ArrowRight size={15} />
          </button>
        </aside>
      </div>

      <TaskComposer open={composerOpen} onOpenChange={setComposerOpen} />
    </div>
  )
}
