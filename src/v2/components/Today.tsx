import { ArrowRight, Check, Clock, LockKey, Microphone, Plus, Target, Tray, Leaf } from '@phosphor-icons/react'
import type { Task, Workspace } from '../core/types'
import { dayCapacity, goalProgress } from '../core'
import { localDay } from './context'

interface Props {
  workspace: Workspace; onEditTask: (id: string) => void; onCreateTask: () => void
  onComplete: (task: Task) => void; onAssist: (text?: string) => void
  onMap: (id?: string) => void; onPlan: () => void; onEditGoal: (id?: string) => void; onDemo: () => void
}

export function Today({ workspace: w, onEditTask, onCreateTask, onComplete, onAssist, onMap, onPlan, onEditGoal, onDemo }: Props) {
  const today = localDay(w.preferences.timezone)
  const todayIds = new Set(w.allocations.filter(a => a.date === today).map(a => a.taskId))
  const tasks = w.tasks.filter(t => todayIds.has(t.id) && t.status !== 'cancelled')
  const done = tasks.filter(t => t.status === 'done')
  const next = tasks.filter(t => t.status !== 'done').sort((a, b) => Number(b.importance === 'important') - Number(a.importance === 'important'))
  const inbox = w.tasks.filter(t => !w.allocations.some(a => a.taskId === t.id) && t.status !== 'done' && t.status !== 'cancelled')
  const goals = w.goals.filter(g => g.status === 'active')
  const capacity = dayCapacity(w, today)
  const configured = w.capacities.some(c => c.date === today)
  const focus = next[0]
  return <div className="m-today-grid">
    <section className="m-today-main">
      <div className="m-welcome-line"><Leaf size={18} /><span>留一点余地，也是一种安排。</span></div>
      <h1>把时间，留给重要的事。</h1><p className="m-page-lead">从下一步开始，让今天的行动有方向。</p>
      <button className="m-conversation-entry" onClick={() => onAssist()}><span className="m-entry-icon"><Microphone size={23} /></span><span><strong>今天想推进什么？</strong><small>说一说，Master 帮你整理成安排</small></span><ArrowRight size={20} /></button>
      <div className="m-section-line m-action-heading"><h2>今日行动 <span>{next.length}</span></h2><button className="m-link" onClick={onCreateTask}><Plus size={15} />自己添加</button></div>
      {focus && <article className="m-focus-card"><div className="m-focus-label"><span>下一步</span><span>{focus.importance === 'important' ? '重要的事' : '现在可以开始'}</span></div><button className="m-focus-title" onClick={() => onEditTask(focus.id)}>{focus.title}</button><div className="m-focus-footer"><span><Target size={14} />{w.goals.find(g => g.id === focus.goalId)?.title ?? '个人行动'}</span><span><Clock size={14} />{focus.estimateMinutes ? `${focus.estimateMinutes} 分钟` : '时长待估'}</span><button onClick={() => onComplete(focus)}><Check size={17} />完成</button></div></article>}
      {next.slice(1).map(t => <TaskLine key={t.id} task={t} workspace={w} onEdit={() => onEditTask(t.id)} onComplete={() => onComplete(t)} />)}
      {!next.length && <div className="m-empty-action"><span className="m-empty-symbol"><Leaf size={36} weight="duotone" /></span><h3>{done.length ? '今天的安排，已经完成。' : '今天，先从一件事开始。'}</h3><p>{done.length ? '可以留出休息，也可以和 Master 聊聊新的想法。' : '说一个想法，或亲手记下一个可以开始的行动。'}</p><div><button className="m-button" onClick={onCreateTask}><Plus size={15} />添加行动</button>{!w.tasks.length && !w.goals.length && <button className="m-link" onClick={onDemo}>看看示例空间 <ArrowRight size={14} /></button>}</div></div>}
      {done.length > 0 && <details className="m-done-list"><summary>已完成 {done.length} 项</summary>{done.map(t => <TaskLine key={t.id} task={t} workspace={w} onEdit={() => onEditTask(t.id)} onComplete={() => onComplete(t)} />)}</details>}
      {inbox.length > 0 && <section className="m-inbox"><div className="m-section-line"><h2><Tray size={18} />暂存的想法 <span>{inbox.length}</span></h2><button className="m-link" onClick={() => onAssist('帮我整理收集箱里的任务，根据今天的可用时间提出安排。')}>请 Master 整理 <ArrowRight size={14} /></button></div>{inbox.slice(0, 5).map(t => <TaskLine key={t.id} task={t} workspace={w} onEdit={() => onEditTask(t.id)} onComplete={() => onComplete(t)} />)}</section>}
    </section>
    <aside className="m-today-context"><section className="m-capacity-panel"><div className="m-section-line"><h2>今天的余地</h2><Clock size={18} /></div><div className="m-capacity-number">{configured ? capacity.remainingMinutes : '未设置'}{configured && <span>分钟</span>}</div><p>{configured ? capacity.overMinutes > 0 ? `已超出容量 ${capacity.overMinutes} 分钟，试着少安排一点。` : '计划之外，也为生活留一些空间。' : '告诉 Master 今天有多少时间，不必填满日历。'}</p><div className="m-capacity-rail" aria-label="已安排占比"><i style={{ width: `${configured && capacity.capacityMinutes ? Math.min(100, capacity.plannedMinutes / capacity.capacityMinutes * 100) : 0}%` }} /></div><div className="m-capacity-legend"><span>已安排 {capacity.plannedMinutes} 分钟</span><span>{configured ? `弹性 ${Math.round(capacity.buffer * 100)}%` : '容量待确认'}</span></div>{capacity.unknownTasks > 0 && <small>{capacity.unknownTasks} 项任务未估时，余量未完整覆盖</small>}<button className="m-link" onClick={onPlan}>{configured ? '调整安排' : '设定可用时间'} <ArrowRight size={14} /></button></section>
      <section className="m-growing"><div className="m-section-line"><h2>正在生长的目标</h2><button className="m-icon-button" onClick={() => onEditGoal()} aria-label="新增目标"><Plus size={18} /></button></div>{goals.slice(0, 4).map((g, i) => <button className="m-goal-summary" key={g.id} onClick={() => onMap(g.id)}><span className={`m-goal-symbol tone-${i % 3}`}><Target size={21} weight="duotone" /></span><span><strong>{g.title}</strong><small>{w.tasks.filter(t => t.goalId === g.id && t.status === 'done').length} 个行动已完成</small></span><b>{goalProgress(w, g.id)}<small>%</small></b></button>)}{!goals.length && <div className="m-no-goals"><p>一个目标，连接每一次小小的行动。</p><button className="m-link" onClick={() => onEditGoal()}>创建第一个目标 <ArrowRight size={14} /></button></div>}{goals.length > 0 && <button className="m-link" onClick={() => onMap()}>展开目标地图 <ArrowRight size={14} /></button>}</section>
      <div className="m-rest-note"><Leaf size={22} weight="duotone" /><p>不必填满每一刻。<br /><span>休息，也在计划之中。</span></p></div>
    </aside>
  </div>
}

export function TaskLine({ task: t, workspace: w, onEdit, onComplete }: { task: Task; workspace: Workspace; onEdit: () => void; onComplete: () => void }) {
  return <div className={`m-task-line ${t.status === 'done' ? 'done' : ''}`}><button className="m-task-check" aria-label={t.status === 'done' ? `重新打开 ${t.title}` : `完成 ${t.title}`} aria-pressed={t.status === 'done'} onClick={onComplete}>{t.status === 'done' && <Check size={13} weight="bold" />}</button><button className="m-task-content" onClick={onEdit}><strong>{t.title}</strong><span>{w.goals.find(g => g.id === t.goalId)?.title ?? '收集箱'}{t.status === 'blocked' && ' / 遇到阻碍'}{t.locked && <LockKey size={12} />}</span></button><span className="m-task-duration">{t.estimateMinutes ? `${t.estimateMinutes} 分钟` : '待估时'}</span></div>
}
