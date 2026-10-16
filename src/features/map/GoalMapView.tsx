import { useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowsOutSimple, Target } from '@phosphor-icons/react'
import { Button } from '../../components/ui/Button'
import { computeBranchHealth } from '../../lib/metrics'
import { useMasterStore } from '../../store/useMasterStore'
import {
  GoalNodeCard,
  type GoalFlowNode,
} from './GoalNodeCard'
import { NodeDetailPanel } from './NodeDetailPanel'

const nodeTypes = { goalNode: GoalNodeCard }

const buildLayout = (
  goalId: string,
  nodes: ReturnType<typeof useMasterStore.getState>['nodes'],
  tasks: ReturnType<typeof useMasterStore.getState>['tasks'],
  goal: ReturnType<typeof useMasterStore.getState>['goals'][number],
) => {
  const relevant = nodes.filter((node) => node.goalId === goalId)
  const children = new Map<string, typeof relevant>()
  relevant.forEach((node) => {
    if (!node.parentId) return
    const current = children.get(node.parentId) ?? []
    current.push(node)
    children.set(node.parentId, current)
  })
  children.forEach((items) => items.sort((a, b) => a.order - b.order))

  let leafCursor = 0
  const positions = new Map<string, { x: number; y: number }>()

  const place = (nodeId: string, depth: number): number => {
    const childNodes = children.get(nodeId) ?? []
    if (!childNodes.length) {
      const y = leafCursor * 138
      leafCursor += 1
      positions.set(nodeId, { x: depth * 328, y })
      return y
    }
    const childY = childNodes.map((child) => place(child.id, depth + 1))
    const y = childY.reduce((sum, value) => sum + value, 0) / childY.length
    positions.set(nodeId, { x: depth * 328, y })
    return y
  }

  const root = relevant.find((node) => node.parentId === null)
  if (root) place(root.id, 0)

  const minY = Math.min(...Array.from(positions.values()).map((item) => item.y))
  const maxY = Math.max(...Array.from(positions.values()).map((item) => item.y))
  const offset = 80 - (minY + maxY) / 2

  const flowNodes: GoalFlowNode[] = relevant.map((node) => ({
    id: node.id,
    type: 'goalNode',
    position: {
      x: (positions.get(node.id)?.x ?? 0) + 64,
      y: (positions.get(node.id)?.y ?? 0) + offset + 320,
    },
    data: {
      node,
      health: computeBranchHealth(goal, node, relevant, tasks),
    },
  }))

  const edges: Edge[] = relevant
    .filter((node) => node.parentId)
    .map((node) => ({
      id: `${node.parentId}-${node.id}`,
      source: node.parentId!,
      target: node.id,
      type: 'smoothstep',
      animated: false,
      style: { strokeWidth: 1.25 },
    }))

  return { flowNodes, edges }
}

export function GoalMapView() {
  const goals = useMasterStore((state) => state.goals)
  const nodes = useMasterStore((state) => state.nodes)
  const tasks = useMasterStore((state) => state.tasks)
  const selectedNodeId = useMasterStore((state) => state.selectedNodeId)
  const selectNode = useMasterStore((state) => state.selectNode)
  const goal = goals[0]

  const layout = useMemo(
    () =>
      goal
        ? buildLayout(goal.id, nodes, tasks, goal)
        : { flowNodes: [], edges: [] },
    [goal, nodes, tasks],
  )

  if (!goal) {
    return (
      <div className="page empty-page">
        <Target size={32} />
        <h1>先建立一个长期目标</h1>
      </div>
    )
  }

  return (
    <div className="map-page">
      <header className="map-toolbar">
        <div>
          <span>目标地图</span>
          <h1>{goal.title}</h1>
        </div>
        <Button
          variant="secondary"
          leadingIcon={<ArrowsOutSimple size={17} />}
          onClick={() => selectNode(null)}
        >
          查看全局
        </Button>
      </header>

      <div className="map-canvas-wrap">
        <ReactFlow<GoalFlowNode>
          nodes={layout.flowNodes.map((node) => ({
            ...node,
            selected: node.id === selectedNodeId,
          }))}
          edges={layout.edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
          minZoom={0.35}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          onNodeClick={(_, node) => selectNode(node.id)}
          onPaneClick={() => selectNode(null)}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Lines}
            gap={36}
            size={0.4}
          />
          <Controls showInteractive={false} />
          <MiniMap
            className="map-minimap"
            nodeColor="var(--surface-strong)"
            maskColor="var(--map-mask)"
            pannable
            zoomable
          />
        </ReactFlow>
      </div>
      <NodeDetailPanel />
    </div>
  )
}
