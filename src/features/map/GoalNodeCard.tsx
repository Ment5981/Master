import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Flag, Target, TreeStructure } from '@phosphor-icons/react'
import clsx from 'clsx'
import type { BranchHealth, GoalNode } from '../../domain'
import { ProgressRing } from '../../components/ui/ProgressRing'

export interface GoalNodeData extends Record<string, unknown> {
  node: GoalNode
  health: BranchHealth
}

export type GoalFlowNode = Node<GoalNodeData, 'goalNode'>

const nodeIcon = {
  goal: Target,
  element: TreeStructure,
  milestone: Flag,
  subgoal: TreeStructure,
}

export function GoalNodeCard({ data, selected }: NodeProps<GoalFlowNode>) {
  const Icon = nodeIcon[data.node.type]
  const riskLabel = {
    normal: '状态正常',
    watch: '需要关注',
    high: '截止风险',
    blocked: '存在阻塞',
  }[data.health.risk]

  return (
    <div
      className={clsx(
        'map-node',
        `map-node-${data.node.type}`,
        `map-risk-${data.health.risk}`,
        selected && 'selected',
      )}
    >
      {data.node.parentId ? (
        <Handle
          type="target"
          position={Position.Left}
          className="map-handle"
        />
      ) : null}
      <div className="map-node-heading">
        <span className="map-node-icon">
          <Icon size={17} weight={data.node.type === 'goal' ? 'fill' : 'regular'} />
        </span>
        <span className="map-node-type">
          {data.node.type === 'goal'
            ? '中心目标'
            : data.node.type === 'element'
              ? '关键要素'
              : data.node.type === 'milestone'
                ? '里程碑'
                : '子目标'}
        </span>
        <ProgressRing value={data.health.progress} size="sm" />
      </div>
      <strong>{data.node.title}</strong>
      <div className="map-node-footer">
        <span>{data.health.totalTasks}项任务</span>
        <span className={`map-risk-label risk-${data.health.risk}`}>
          {riskLabel}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="map-handle"
      />
    </div>
  )
}
