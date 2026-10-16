import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, X } from '@phosphor-icons/react'
import type { Task } from '../domain'
import { useMasterStore } from '../store/useMasterStore'
import { Button } from './ui/Button'

interface CompletionDialogProps {
  task: Task
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CompletionDialog({
  task,
  open,
  onOpenChange,
}: CompletionDialogProps) {
  const completeTask = useMasterStore((state) => state.completeTask)
  const [actualMinutes, setActualMinutes] = useState(task.estimatedMinutes)

  const submit = () => {
    completeTask(task.id, Math.max(1, actualMinutes))
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content completion-dialog">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>确认完成</Dialog.Title>
              <Dialog.Description>
                记录真实投入，Master会更新对应目标分支。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="关闭">
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>

          <div className="completion-task-name">{task.title}</div>
          <label className="field">
            <span>实际用时</span>
            <div className="number-input-wrap">
              <input
                type="number"
                min={1}
                value={actualMinutes}
                onChange={(event) =>
                  setActualMinutes(Number(event.target.value))
                }
              />
              <span>分钟</span>
            </div>
          </label>

          <div className="dialog-actions">
            <Dialog.Close asChild>
              <Button variant="ghost">稍后处理</Button>
            </Dialog.Close>
            <Button
              variant="primary"
              leadingIcon={<Check size={17} weight="bold" />}
              onClick={submit}
            >
              完成任务
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
