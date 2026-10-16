import { useState } from 'react'
import {
  Check,
  Clock,
  Play,
  WarningCircle,
} from '@phosphor-icons/react'
import type { Task } from '../domain'
import { formatShortDate, minutesLabel } from '../lib/date'
import { useMasterStore } from '../store/useMasterStore'
import { CompletionDialog } from './CompletionDialog'
import { StatusBadge } from './ui/StatusBadge'

interface TaskRowProps {
  task: Task
  showQuadrant?: boolean
  draggable?: boolean
  onDragStart?: (taskId: string) => void
}

export function TaskRow({
  task,
  showQuadrant = true,
  draggable = false,
  onDragStart,
}: TaskRowProps) {
  const [completionOpen, setCompletionOpen] = useState(false)
  const nodes = useMasterStore((state) => state.nodes)
  const updateTask = useMasterStore((state) => state.updateTask)
  const node = nodes.find((candidate) => candidate.id === task.nodeId)
  const complete = task.status === 'completed'

  return (
    <>
      <article
        className={`task-row ${complete ? 'task-row-complete' : ''}`}
        draggable={draggable}
        onDragStart={(event) => {
          event.dataTransfer.setData('text/task-id', task.id)
          event.dataTransfer.effectAllowed = 'move'
          onDragStart?.(task.id)
        }}
      >
        <button
          type="button"
          className="task-check"
          aria-label={complete ? '任务已完成' : '完成任务'}
          disabled={complete}
          onClick={() => setCompletionOpen(true)}
        >
          {complete ? <Check size={15} weight="bold" /> : null}
        </button>

        <div className="task-row-content">
          <div className="task-row-title-line">
            <h3>{task.title}</h3>
            {task.status === 'blocked' ? (
              <WarningCircle
                className="task-warning"
                size={17}
                aria-label="任务阻塞"
              />
            ) : null}
          </div>
          <div className="task-meta">
            {node ? <span>{node.title}</span> : <span>临时事务</span>}
            <span className="task-time">
              <Clock size={14} />
              {minutesLabel(task.estimatedMinutes)}
            </span>
            {task.dueDate ? <span>{formatShortDate(task.dueDate)}截止</span> : null}
          </div>
        </div>

        <div className="task-row-actions">
          {showQuadrant ? <StatusBadge kind={task.quadrant} /> : null}
          {!complete && task.status !== 'in_progress' ? (
            <button
              type="button"
              className="task-start"
              aria-label="开始任务"
              onClick={() => updateTask(task.id, { status: 'in_progress' })}
            >
              <Play size={15} weight="fill" />
            </button>
          ) : null}
          {task.status === 'in_progress' ? (
            <StatusBadge kind="in_progress" />
          ) : null}
        </div>
      </article>

      <CompletionDialog
        task={task}
        open={completionOpen}
        onOpenChange={setCompletionOpen}
      />
    </>
  )
}
