import clsx from 'clsx'
import type {
  ActivityLevel,
  Quadrant,
  RiskLevel,
  TaskStatus,
} from '../../domain'

type BadgeKind = ActivityLevel | RiskLevel | Quadrant | TaskStatus

const labels: Record<BadgeKind, string> = {
  not_started: '未启动',
  active: '活跃',
  steady: '平稳',
  cooling: '降温',
  stalled: '停滞',
  normal: '正常',
  watch: '关注',
  high: '高风险',
  blocked: '阻塞',
  do: '重要且紧急',
  schedule: '重要不紧急',
  delegate: '不重要但紧急',
  eliminate: '低优先',
  inbox: '待安排',
  planned: '已计划',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
}

export function StatusBadge({ kind }: { kind: BadgeKind }) {
  return (
    <span className={clsx('status-badge', `status-${kind}`)}>
      {labels[kind]}
    </span>
  )
}
