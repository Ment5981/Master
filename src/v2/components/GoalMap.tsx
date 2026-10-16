import { memo, useEffect, useMemo, useState } from 'react'
import { Background, Controls, Handle, Position, ReactFlow, getViewportForBounds, useReactFlow, useStore, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { ArrowUpRight, Check, CaretDown, CaretRight, ListBullets, Plus, TreeStructure, PencilSimple } from '@phosphor-icons/react'
import type { Command, GoalNode, Task, Workspace } from '../core/types'
import { Modal } from './Editors'
import '@xyflow/react/dist/style.css'
import './features.css'

export interface GoalMapProps {
  workspace: Workspace
  onCommand: (command: Command) => Promise<void>
  onEditTask: (id: string) => void
  onAssist: (prompt?: string) => void
  onEditGoal?: (id?: string) => void
  onCreateTask?: (goalId?: string, nodeId?: string) => void
  selectedGoalId?: string
  onSelectGoal?: (id: string) => void
}

type MapNode = Node<{
  title: string; kind: 'goal' | 'element' | 'milestone' | 'subgoal' | 'task'
  subtitle: string; done?: boolean; expanded?: boolean; count?: number; warning?: boolean
  onOpen: () => void; onToggle?: () => void; onComplete?: () => void
}, 'master'>

const kindLabels = { goal: '长期目标', element: '关键要素', milestone: '里程碑', subgoal: '子目标', task: '下一步行动' }

const MasterNode = memo(function MasterNode({ data }: NodeProps<MapNode>) {
  return <div className={`m-map-node m-map-node--${data.kind}${data.done ? ' is-done' : ''}${data.warning ? ' has-risk' : ''}`}>
    {data.kind !== 'goal' && <Handle type="target" position={Position.Left} isConnectable={false} />}
    <div className="m-map-node-top"><span>{kindLabels[data.kind]}</span>
      {data.onToggle && <button type="button" className="m-map-toggle nodrag" onClick={data.onToggle} aria-expanded={data.expanded} aria-label={`${data.expanded ? '收起' : '展开'}${data.title}`}>
        {data.expanded ? <CaretDown size={15} /> : <CaretRight size={15} />}<span>{data.count}</span>
      </button>}
    </div>
    <div className="m-map-node-main">
      {data.onComplete && <button type="button" className="m-feature-check nodrag" aria-label={`${data.done ? '重新打开' : '完成'}：${data.title}`} aria-pressed={Boolean(data.done)} onClick={data.onComplete}>{data.done && <Check size={13} weight="bold" />}</button>}
      <button type="button" className="m-map-node-title nodrag" title={data.title} onClick={data.onOpen}>{data.title}</button>
    </div>
    <p>{data.subtitle}</p>
    {data.kind !== 'task' && <Handle type="source" position={Position.Right} isConnectable={false} />}
  </div>
})
const nodeTypes = { master: MasterNode }

function FitMapOnResize() {
  const width = useStore(state => state.width)
  const height = useStore(state => state.height)
  const { getNodes, getNodesBounds, setViewport } = useReactFlow()
  useEffect(() => {
    if (!width || !height) return
    const frame = requestAnimationFrame(() => {
      const bounds = getNodesBounds(getNodes())
      if (!bounds.width || !bounds.height) return
      // Resize changes the camera only, never the deterministic node positions.
      void setViewport(getViewportForBounds(bounds, width, height, 0.2, 1, 0.2), { duration: 0 })
    })
    return () => cancelAnimationFrame(frame)
  }, [width, height, getNodes, getNodesBounds, setViewport])
  return null
}

function localDate(workspace: Workspace) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: workspace.preferences.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function NodeEditor({ node, parent, goalId, nodes, onCommand, onClose }: { node?: GoalNode; parent?: GoalNode; goalId: string; nodes: GoalNode[]; onCommand: GoalMapProps['onCommand']; onClose: () => void }) {
  const [title, setTitle] = useState(node?.title ?? '')
  const [kind, setKind] = useState<GoalNode['kind']>(node?.kind ?? (parent ? parent.kind === 'element' ? 'milestone' : 'subgoal' : 'element'))
  const [parentId, setParentId] = useState(node?.parentId ?? parent?.id ?? '')
  const [weight, setWeight] = useState(node?.weight ?? 1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const excluded = new Set(node ? [node.id] : [])
  for (let pass = 0; pass < nodes.length; pass++) for (const candidate of nodes) if (candidate.parentId && excluded.has(candidate.parentId)) excluded.add(candidate.id)
  const available = nodes.filter(candidate => !excluded.has(candidate.id))
  async function save() {
    setError('')
    if (!title.trim()) { setError('请为这个节点起一个清晰的名字。'); return }
    if (parentId && !available.some(candidate => candidate.id === parentId)) { setError('请选择合适的上级节点。'); return }
    setSaving(true)
    try {
      const values = { title: title.trim(), parentId: parentId || null, weight }
      if (node) await onCommand({ type: 'update_node', id: node.id, changes: values })
      else await onCommand({ type: 'create_node', node: { id: crypto.randomUUID(), goalId, kind, ...values, order: nodes.reduce((max, candidate) => Math.max(max, candidate.order + 1), 0) } })
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '节点没有保存，请重试。') } finally { setSaving(false) }
  }
  return <Modal title={node ? '完善地图节点' : parent ? '添加一个下级节点' : '添加关键要素'} subtitle="把方向拆成清晰的阶段。节点连接目标，可执行的具体行动再关联到节点。" onClose={onClose}>
    <form className="m-editor-form" onSubmit={event => { event.preventDefault(); void save() }}>
      <label>节点名称<input autoFocus value={title} maxLength={180} onChange={event => setTitle(event.target.value)} /></label>
      <div className="m-form-grid"><label>节点类型<select aria-label="节点类型" value={kind} disabled={Boolean(node)} onChange={event => setKind(event.target.value as GoalNode['kind'])}><option value="element">关键要素</option><option value="milestone">里程碑</option><option value="subgoal">子目标</option></select></label><label>上级节点<select aria-label="上级节点" value={parentId} onChange={event => setParentId(event.target.value)}><option value="">直接归属当前目标</option>{available.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label></div>
      <p className="m-feature-muted">建议按要素、里程碑、子目标逐步拆解；也可以跳过暂不需要的层级。</p>
      <label>相对权重<input type="number" min="0.1" max="100" step="0.1" value={weight} onChange={event => setWeight(Number(event.target.value))} required /><small>默认 1。权重影响任务推进的汇总，不代表成功标准已达成。</small></label>
      {error && <p className="m-error" role="alert">{error}</p>}<footer className="m-dialog-actions"><button type="button" className="m-button" onClick={onClose}>取消</button><button className="m-button primary" disabled={saving}>{saving ? '保存中…' : '保存节点'}</button></footer>
    </form>
  </Modal>
}

export function GoalMap({ workspace, onCommand, onEditTask, onAssist, onEditGoal, onCreateTask, selectedGoalId, onSelectGoal }: GoalMapProps) {
  const [selectedGoal, setSelectedGoal] = useState('')
  const [nodeEditor, setNodeEditor] = useState<{ node?: GoalNode; parent?: GoalNode } | null>(null)
  const [view, setView] = useState<'map' | 'outline'>('map')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const goals = workspace.goals.filter(goal => goal.status !== 'archived')
  const goal = goals.find(item => item.id === (selectedGoalId ?? selectedGoal)) ?? goals[0]
  const goalNodes = useMemo(() => workspace.nodes.filter(node => node.goalId === goal?.id).sort((a, b) => a.order - b.order), [workspace.nodes, goal?.id])
  const goalTasks = useMemo(() => workspace.tasks.filter(task => task.goalId === goal?.id && task.status !== 'cancelled'), [workspace.tasks, goal?.id])
  const completed = goalTasks.filter(task => task.status === 'done').length
  const today = localDate(workspace)
  const toggle = (id: string) => setExpanded(previous => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const complete = (task: Task) => {
    setError('')
    void onCommand({ type: 'complete_task', id: task.id, done: task.status !== 'done', date: today }).catch(reason => setError(reason instanceof Error ? reason.message : '保存失败，请重试。'))
  }
  const openGoal = () => {
    if (!goal) return
    if (onEditGoal) onEditGoal(goal.id)
    else onAssist(`我想完善目标「${goal.title}」的成功标准和完成时间。`)
  }
  const addTask = (node?: GoalNode) => {
    if (!goal) return
    if (onCreateTask) onCreateTask(goal.id, node?.id)
    else onAssist(`为目标「${goal.title}」${node ? `的「${node.title}」分支` : ''}整理下一步行动。`)
  }
  const childrenOf = (id: string | null) => goalNodes.filter(node => node.parentId === id || (id === null && node.parentId !== null && !goalNodes.some(parent => parent.id === node.parentId)))
  const tasksOf = (id: string | null) => goalTasks.filter(task => task.nodeId === id || (id === null && task.nodeId !== null && !goalNodes.some(node => node.id === task.nodeId)))
  const taskSubtitle = (task: Task) => [task.estimateMinutes !== null ? `${task.estimateMinutes} 分钟` : '待估时', task.status !== 'done' && task.dueDate && task.dueDate < today ? '已逾期' : task.dueDate ? `${task.dueDate.slice(5)} 截止` : null, task.status === 'blocked' ? '等待解除阻塞' : null].filter(Boolean).join(' · ')
  const descendantTasks = (nodeId: string) => {
    const ids = new Set<string>()
    const remaining = [nodeId]
    while (remaining.length) {
      const id = remaining.pop()!
      if (ids.has(id)) continue
      ids.add(id)
      childrenOf(id).forEach(child => remaining.push(child.id))
    }
    return goalTasks.filter(task => task.nodeId !== null && ids.has(task.nodeId))
  }

  // Positions depend on hierarchy and expansion only. Completing a task never changes its slot.
  const mapNodes: MapNode[] = []
  const edges: Edge[] = []
  const rowHeight = 144
  let slot = 0
  const addEdge = (source: string, target: string) => edges.push({ id: `${source}:${target}`, source, target, type: 'smoothstep', style: { stroke: 'var(--line)', strokeWidth: 1.5 } })
  const addTaskNode = (task: Task, parent: string, depth: number) => {
    mapNodes.push({ id: `task:${task.id}`, type: 'master', position: { x: depth * 310, y: slot++ * rowHeight }, data: { title: task.title, kind: 'task', subtitle: taskSubtitle(task), done: task.status === 'done', warning: task.status !== 'done' && Boolean(task.dueDate && task.dueDate < today), onOpen: () => onEditTask(task.id), onComplete: () => complete(task) } })
    addEdge(parent, `task:${task.id}`)
  }
  const visit = (node: GoalNode, parent: string, depth: number, ancestors: Set<string>) => {
    if (ancestors.has(node.id)) return
    const start = slot
    const childNodes = childrenOf(node.id)
    const directTasks = tasksOf(node.id)
    const count = childNodes.length + directTasks.length
    if (expanded.has(node.id)) {
      const seen = new Set(ancestors).add(node.id)
      childNodes.forEach(child => visit(child, node.id, depth + 1, seen))
      directTasks.forEach(task => addTaskNode(task, node.id, depth + 1))
    }
    if (slot === start) slot++
    const branchTasks = descendantTasks(node.id)
    const done = branchTasks.filter(task => task.status === 'done').length
    const overdue = branchTasks.filter(task => task.status !== 'done' && task.dueDate && task.dueDate < today).length
    mapNodes.push({ id: node.id, type: 'master', position: { x: depth * 310, y: (start + slot - 1) * rowHeight / 2 }, data: {
      title: node.title, kind: node.kind, subtitle: branchTasks.length ? `${done} / ${branchTasks.length} 项行动完成${overdue ? ` · ${overdue} 项逾期` : ''}` : count ? `${childNodes.length} 个下级节点` : '尚未安排下一步', count, warning: overdue > 0, expanded: expanded.has(node.id),
      onToggle: count ? () => toggle(node.id) : undefined, onOpen: () => count ? toggle(node.id) : addTask(node),
    } })
    addEdge(parent, node.id)
  }
  if (goal) {
    childrenOf(null).forEach(node => visit(node, `goal:${goal.id}`, 1, new Set()))
    tasksOf(null).forEach(task => addTaskNode(task, `goal:${goal.id}`, 1))
    mapNodes.push({ id: `goal:${goal.id}`, type: 'master', position: { x: 0, y: Math.max(0, slot - 1) * rowHeight / 2 }, data: { title: goal.title, kind: 'goal', subtitle: goal.dueDate ? `${goal.dueDate} · ${goal.verified ? '标准已确认' : '待确认成功标准'}` : '留出时间，让目标逐步清晰', onOpen: openGoal } })
  }
  const taskRow = (task: Task) => <li className="m-outline-task" key={task.id}>
    <button type="button" className="m-feature-check" aria-pressed={task.status === 'done'} aria-label={`${task.status === 'done' ? '重新打开' : '完成'}：${task.title}`} onClick={() => complete(task)}>{task.status === 'done' && <Check size={13} weight="bold" />}</button>
    <button type="button" className="m-feature-text-button" onClick={() => onEditTask(task.id)}><span>{task.title}</span><small>{taskSubtitle(task)}</small></button>
  </li>
  const outline = (node: GoalNode, ancestors: Set<string>) => {
    if (ancestors.has(node.id)) return null
    const seen = new Set(ancestors).add(node.id)
    return <li key={node.id} className="m-outline-branch"><details open={expanded.has(node.id)} onToggle={event => {
      const isOpen = event.currentTarget.open
      setExpanded(previous => { if (previous.has(node.id) === isOpen) return previous; const next = new Set(previous); if (isOpen) next.add(node.id); else next.delete(node.id); return next })
    }}><summary><span>{node.title}</span><small>{kindLabels[node.kind]}</small></summary>
      <ul>{childrenOf(node.id).map(child => outline(child, seen))}{tasksOf(node.id).map(taskRow)}</ul>
      <div className="m-outline-actions"><button type="button" className="m-feature-link" onClick={() => addTask(node)}><Plus size={14} /> 添加行动</button><button type="button" className="m-feature-link" onClick={() => setNodeEditor({ parent: node })} aria-label={`为${node.title}添加下级节点`}><TreeStructure size={14} /> 添加下级</button><button type="button" className="m-feature-link" onClick={() => setNodeEditor({ node })} aria-label={`编辑节点${node.title}`}><PencilSimple size={14} /> 编辑节点</button></div>
    </details></li>
  }

  return <section className="m-feature-view m-goal-map-view" aria-label="目标地图">
    <header className="m-feature-header"><div><p className="m-feature-eyebrow">看见方向</p><h1>目标地图<span className="m-feature-title-dot">.</span></h1><p>每一个小行动，都有自己的来处。</p></div>
      <button type="button" className="m-feature-action" onClick={() => onEditGoal ? onEditGoal() : onAssist('我想通过对话梳理一个长期目标，先帮我问清最重要的事。')}><Plus size={17} /> 新的目标</button>
    </header>
    {!goal ? <div className="m-feature-empty"><TreeStructure size={40} weight="light" /><h2>先种下一个想做的事</h2><p>说说你想达成什么。Master 会陪你理清方向，拆出真正能开始的下一步。</p><button type="button" className="m-feature-action" onClick={() => onAssist('我想建立第一个长期目标。')}>聊聊我的目标 <ArrowUpRight size={16} /></button></div> : <>
      <div className="m-feature-toolbar"><label className="m-feature-select-label">当前目标<select aria-label="当前目标" value={goal.id} onChange={event => { setSelectedGoal(event.target.value); onSelectGoal?.(event.target.value); setNodeEditor(null) }}>{goals.map(item => <option key={item.id} value={item.id}>{item.title}{item.status === 'paused' ? '（暂停）' : ''}</option>)}</select></label>
        <div className="m-map-view-controls"><button type="button" className="m-feature-link" onClick={() => setNodeEditor({})}><Plus size={15} /> 添加要素</button><div className="m-feature-segment" aria-label="地图视图"><button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}><TreeStructure size={16} /> 地图</button><button type="button" aria-pressed={view === 'outline'} onClick={() => setView('outline')}><ListBullets size={16} /> 大纲</button></div></div>
      </div>
      <div className="m-goal-brief"><div><span className="m-feature-kicker">{goal.status === 'paused' ? '暂停中的目标' : '正在生长'}</span><h2>{goal.title}</h2>{goal.description && <p>{goal.description}</p>}</div><div className="m-goal-progress"><strong>{completed}<span> / {goalTasks.length}</span></strong><span>项行动完成 · 非目标达成率</span></div></div>
      {error && <p className="m-feature-error" role="alert">{error}</p>}
      {view === 'map' ? <div className="m-map-canvas"><ReactFlow<MapNode> key={goal.id} nodes={mapNodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.25, maxZoom: 1 }} minZoom={0.2} maxZoom={1.6} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: false }} ariaLabelConfig={{ 'controls.zoomIn.ariaLabel': '放大地图', 'controls.zoomOut.ariaLabel': '缩小地图', 'controls.fitView.ariaLabel': '显示全部节点' }}>
        <Background gap={28} size={1} color="var(--line)" /><Controls showInteractive={false} /><FitMapOnResize />
      </ReactFlow><div className="m-map-caption">滚轮缩放 · 拖动留白平移 · 点击分支展开</div></div> : <div className="m-map-outline"><ul>{childrenOf(null).map(node => outline(node, new Set()))}{tasksOf(null).map(taskRow)}</ul>{!goalNodes.length && !goalTasks.length && <p className="m-feature-muted">这张地图还是空白。从一个下一步开始。</p>}</div>}
      <footer className="m-map-footer"><span>{goalNodes.length} 个节点 · {goalTasks.length} 项行动</span><div><button type="button" className="m-feature-link" onClick={() => addTask()}><Plus size={15} /> 添加行动</button><button type="button" className="m-feature-link" onClick={() => onAssist(`帮我分析目标「${goal.title}」的分支结构、停滞风险与下一步。`)}>一起梳理 <ArrowUpRight size={15} /></button></div></footer>
      <div className="m-goal-criteria"><h3>怎样才算达成</h3>{goal.criteria.length ? <ul>{goal.criteria.map((criterion, index) => <li key={`${index}:${criterion}`}>{criterion}</li>)}</ul> : <p>还未定义成功标准。明确结果，比增加任务更重要。</p>}<button type="button" className="m-feature-link" onClick={openGoal}>完善目标 <ArrowUpRight size={14} /></button></div>
      {nodeEditor && <NodeEditor key={nodeEditor.node?.id ?? nodeEditor.parent?.id ?? 'root'} {...nodeEditor} goalId={goal.id} nodes={goalNodes} onCommand={onCommand} onClose={() => setNodeEditor(null)} />}
    </>}
  </section>
}
