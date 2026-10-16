import { useEffect } from 'react'
import { CheckCircle, X } from '@phosphor-icons/react'
import { computeNodeProgress } from '../lib/metrics'
import { useMasterStore } from '../store/useMasterStore'

export function CompletionFeedback() {
  const feedback = useMasterStore((state) => state.completionFeedback)
  const dismiss = useMasterStore((state) => state.dismissCompletionFeedback)
  const nodes = useMasterStore((state) => state.nodes)
  const tasks = useMasterStore((state) => state.tasks)

  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(dismiss, 5200)
    return () => window.clearTimeout(timer)
  }, [dismiss, feedback])

  if (!feedback) return null
  const node = nodes.find((candidate) => candidate.id === feedback.nodeId)
  const progress = node ? computeNodeProgress(node.id, nodes, tasks) : null

  return (
    <aside className="completion-feedback" aria-live="polite">
      <CheckCircle size={23} weight="fill" />
      <div>
        <strong>已完成：{feedback.taskTitle}</strong>
        <span>
          {node && progress !== null
            ? `${node.title}当前进度 ${progress}%`
            : '今天的计划已同步更新'}
        </span>
      </div>
      <button type="button" onClick={dismiss} aria-label="关闭反馈">
        <X size={16} />
      </button>
    </aside>
  )
}
