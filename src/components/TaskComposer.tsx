import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Plus, X } from '@phosphor-icons/react'
import type { Quadrant } from '../domain'
import { todayKey } from '../lib/date'
import { useMasterStore } from '../store/useMasterStore'
import { Button } from './ui/Button'

interface TaskComposerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultNodeId?: string | null
  defaultQuadrant?: Quadrant
}

export function TaskComposer({
  open,
  onOpenChange,
  defaultNodeId = null,
  defaultQuadrant = 'schedule',
}: TaskComposerProps) {
  const nodes = useMasterStore((state) => state.nodes)
  const addTask = useMasterStore((state) => state.addTask)
  const [title, setTitle] = useState('')
  const [nodeId, setNodeId] = useState(defaultNodeId ?? '')
  const [quadrant, setQuadrant] = useState<Quadrant>(defaultQuadrant)
  const [estimatedMinutes, setEstimatedMinutes] = useState(45)
  const [plannedDate, setPlannedDate] = useState(todayKey())

  useEffect(() => {
    if (open) {
      setNodeId(defaultNodeId ?? '')
      setQuadrant(defaultQuadrant)
    }
  }, [defaultNodeId, defaultQuadrant, open])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    addTask({
      title: title.trim(),
      nodeId: nodeId || null,
      quadrant,
      estimatedMinutes,
      plannedDate: plannedDate || null,
      dueDate: plannedDate || null,
    })
    setTitle('')
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content task-composer">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>添加下一行动</Dialog.Title>
              <Dialog.Description>
                写清楚动作、对象和完成条件。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="关闭">
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="task-form">
            <label className="field">
              <span>任务名称</span>
              <input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：完成访谈提纲并确认10个问题"
              />
            </label>

            <div className="field-grid">
              <label className="field">
                <span>关联节点</span>
                <select
                  value={nodeId}
                  onChange={(event) => setNodeId(event.target.value)}
                >
                  <option value="">临时事务</option>
                  {nodes
                    .filter((node) => node.type !== 'goal')
                    .map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.title}
                      </option>
                    ))}
                </select>
              </label>

              <label className="field">
                <span>四象限</span>
                <select
                  value={quadrant}
                  onChange={(event) =>
                    setQuadrant(event.target.value as Quadrant)
                  }
                >
                  <option value="do">重要且紧急</option>
                  <option value="schedule">重要不紧急</option>
                  <option value="delegate">不重要但紧急</option>
                  <option value="eliminate">低优先</option>
                </select>
              </label>
            </div>

            <div className="field-grid">
              <label className="field">
                <span>预计用时</span>
                <div className="number-input-wrap">
                  <input
                    type="number"
                    min={5}
                    step={5}
                    value={estimatedMinutes}
                    onChange={(event) =>
                      setEstimatedMinutes(Number(event.target.value))
                    }
                  />
                  <span>分钟</span>
                </div>
              </label>
              <label className="field">
                <span>计划日期</span>
                <input
                  type="date"
                  value={plannedDate}
                  onChange={(event) => setPlannedDate(event.target.value)}
                />
              </label>
            </div>

            <div className="dialog-actions">
              <Dialog.Close asChild>
                <Button variant="ghost" type="button">
                  取消
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                variant="primary"
                leadingIcon={<Plus size={17} weight="bold" />}
              >
                添加任务
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
