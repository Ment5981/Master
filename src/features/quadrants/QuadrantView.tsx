import { useState } from 'react'
import {
  ArrowDown,
  ClockCountdown,
  HandArrowDown,
  Plus,
  Trash,
} from '@phosphor-icons/react'
import type { Quadrant } from '../../domain'
import { TaskComposer } from '../../components/TaskComposer'
import { TaskRow } from '../../components/TaskRow'
import { Button } from '../../components/ui/Button'
import { useMasterStore } from '../../store/useMasterStore'

const quadrantConfig: Array<{
  id: Quadrant
  title: string
  action: string
  description: string
  icon: typeof ClockCountdown
}> = [
  {
    id: 'do',
    title: '重要且紧急',
    action: '立即处理',
    description: '有明确后果，且时间窗口已经很小。',
    icon: ClockCountdown,
  },
  {
    id: 'schedule',
    title: '重要不紧急',
    action: '主动安排',
    description: '真正推动长期目标的核心区域。',
    icon: ArrowDown,
  },
  {
    id: 'delegate',
    title: '不重要但紧急',
    action: '缩短或委托',
    description: '需要回应，但不值得占用核心精力。',
    icon: HandArrowDown,
  },
  {
    id: 'eliminate',
    title: '不重要不紧急',
    action: '删除或限制',
    description: '保留前先确认它是否仍有必要。',
    icon: Trash,
  },
]

export function QuadrantView() {
  const [composerOpen, setComposerOpen] = useState(false)
  const [defaultQuadrant, setDefaultQuadrant] =
    useState<Quadrant>('schedule')
  const [dragOver, setDragOver] = useState<Quadrant | null>(null)
  const tasks = useMasterStore((state) => state.tasks)
  const moveTaskToQuadrant = useMasterStore(
    (state) => state.moveTaskToQuadrant,
  )
  const activeTasks = tasks.filter(
    (task) => !['completed', 'cancelled'].includes(task.status),
  )

  return (
    <div className="page quadrant-page">
      <header className="page-header">
        <div>
          <span className="page-context">执行优先级</span>
          <h1>先判断价值，再判断时间</h1>
          <p>拖动任务调整象限。结构属于目标地图，优先级会随时间变化。</p>
        </div>
        <Button
          variant="primary"
          leadingIcon={<Plus size={17} weight="bold" />}
          onClick={() => {
            setDefaultQuadrant('schedule')
            setComposerOpen(true)
          }}
        >
          添加任务
        </Button>
      </header>

      <div className="quadrant-axis-labels" aria-hidden="true">
        <span>紧急程度</span>
        <span>重要程度</span>
      </div>

      <section className="quadrant-grid">
        {quadrantConfig.map((quadrant) => {
          const Icon = quadrant.icon
          const quadrantTasks = activeTasks.filter(
            (task) => task.quadrant === quadrant.id,
          )
          return (
            <div
              className={`quadrant-panel quadrant-${quadrant.id} ${
                dragOver === quadrant.id ? 'drag-over' : ''
              }`}
              key={quadrant.id}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDragOver(quadrant.id)
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(event) => {
                event.preventDefault()
                const taskId = event.dataTransfer.getData('text/task-id')
                if (taskId) moveTaskToQuadrant(taskId, quadrant.id)
                setDragOver(null)
              }}
            >
              <header className="quadrant-heading">
                <div className="quadrant-title">
                  <Icon size={20} />
                  <span>
                    <strong>{quadrant.title}</strong>
                    <small>{quadrant.action}</small>
                  </span>
                </div>
                <span className="quadrant-count">{quadrantTasks.length}</span>
              </header>
              <p className="quadrant-description">{quadrant.description}</p>

              <div className="quadrant-task-list">
                {quadrantTasks.length ? (
                  quadrantTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      showQuadrant={false}
                      draggable
                    />
                  ))
                ) : (
                  <div className="quadrant-empty">
                    <span>拖动任务到这里</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="quadrant-add"
                onClick={() => {
                  setDefaultQuadrant(quadrant.id)
                  setComposerOpen(true)
                }}
              >
                <Plus size={15} />
                添加到此象限
              </button>
            </div>
          )
        })}
      </section>

      <TaskComposer
        key={defaultQuadrant}
        open={composerOpen}
        onOpenChange={setComposerOpen}
        defaultQuadrant={defaultQuadrant}
      />
    </div>
  )
}
