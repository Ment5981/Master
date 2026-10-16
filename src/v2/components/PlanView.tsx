import { useState } from 'react'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { ArrowLeft, ArrowRight, CalendarBlank, Check, Circle, Clock, Sparkle } from '@phosphor-icons/react'
import type { Command, Task, Workspace } from '../core/types'
import { dayCapacity } from '../core/runtime.mjs'
import './features.css'

export interface PlanViewProps {
  workspace: Workspace
  onCommand: (command: Command) => Promise<void>
  onEditTask: (id: string) => void
  onAssist: (prompt?: string) => void
}

const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const quadrants = [
  { key: 'do', label: '优先处理', detail: '重要且紧急', important: true, urgent: true },
  { key: 'grow', label: '留给长远', detail: '重要 · 不紧急', important: true, urgent: false },
  { key: 'delegate', label: '简化处理', detail: '不重要 · 紧急', important: false, urgent: true },
  { key: 'release', label: '留有取舍', detail: '不重要 · 不紧急', important: false, urgent: false },
]
const minutesLabel = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ''}` : `${minutes}分`

export function PlanView({ workspace, onCommand, onEditTask, onAssist }: PlanViewProps) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: workspace.preferences.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const [anchor, setAnchor] = useState(today)
  const [selectedDay, setSelectedDay] = useState(today)
  const [view, setView] = useState<'week' | 'matrix'>('week')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const first = startOfWeek(parseISO(anchor), { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, index) => format(addDays(first, index), 'yyyy-MM-dd'))
  const activeDay = days.includes(selectedDay) ? selectedDay : days[0]
  const tasks = workspace.tasks.filter(task => task.status !== 'cancelled')
  const openTasks = tasks.filter(task => task.status !== 'done')
  const capacity = workspace.capacities.find(item => item.date === activeDay)
  const gross = capacity?.minutes ?? 240
  const buffer = capacity?.buffer ?? 0.2
  const budget = dayCapacity(workspace, activeDay)
  const net = budget.capacityMinutes
  const dayAllocations = workspace.allocations.filter(item => item.date === activeDay && tasks.some(task => task.id === item.taskId))
  const planned = budget.plannedMinutes
  const unknown = dayAllocations.filter(item => item.minutes === null).length
  const pool = openTasks.filter(task => !workspace.allocations.some(item => item.taskId === task.id) && task.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const run = async (command: Command) => {
    if (pending) return
    setPending(true)
    setError('')
    try { await onCommand(command) } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试。') } finally { setPending(false) }
  }
  const schedule = (task: Task, date: string | null) => void run({ type: 'allocate', taskId: task.id, date, minutes: task.estimateMinutes })
  const goalTitle = (task: Task) => workspace.goals.find(goal => goal.id === task.goalId)?.title ?? '独立行动'
  const navigate = (delta: number) => {
    const date = format(addDays(first, delta * 7), 'yyyy-MM-dd')
    setAnchor(date)
    setSelectedDay(date)
  }
  const taskCard = (task: Task, allocationDate?: string) => <div className="m-plan-task" key={task.id}>
    <button type="button" className="m-feature-check" aria-label={`${task.status === 'done' ? '重新打开' : '完成'}：${task.title}`} aria-pressed={task.status === 'done'} disabled={pending} onClick={() => void run({ type: 'complete_task', id: task.id, done: task.status !== 'done', date: today })}>{task.status === 'done' && <Check size={13} weight="bold" />}</button>
    <button type="button" className="m-feature-text-button" onClick={() => onEditTask(task.id)}><span>{task.title}</span><small>{goalTitle(task)} · {task.estimateMinutes === null ? '待估时' : minutesLabel(task.estimateMinutes)}</small></button>
    {allocationDate ? <div className="m-plan-reschedule"><label><span className="m-feature-sr">为{task.title}改期</span><input type="date" value={allocationDate} disabled={pending} onChange={event => { if (event.target.value) void run({ type: 'reschedule', taskId: task.id, fromDate: allocationDate, toDate: event.target.value }) }} /></label><button type="button" className="m-feature-link" disabled={pending} onClick={() => void run({ type: 'unallocate', taskId: task.id, date: allocationDate })}>取消当天</button></div> : <button type="button" className="m-plan-schedule" disabled={pending} onClick={() => schedule(task, activeDay)} aria-label={`把${task.title}安排到${activeDay}`}>安排 <ArrowRight size={14} /></button>}
  </div>

  return <section className="m-feature-view" aria-label="时间计划">
    <header className="m-feature-header"><div><p className="m-feature-eyebrow">时间有余地</p><h1>安排节奏<span className="m-feature-title-dot">.</span></h1><p>给重要的事留位置，也给生活留白。</p></div><button type="button" className="m-feature-action" onClick={() => onAssist(`帮我结合目标、现有安排和可投入时间，规划 ${days[0]} 至 ${days[6]} 这一周。请保留弹性时间。`)}><Sparkle size={17} /> 一起安排</button></header>
    <div className="m-feature-toolbar"><div className="m-plan-period"><button type="button" className="m-feature-icon-button" onClick={() => navigate(-1)} aria-label="上一周"><ArrowLeft size={17} /></button><strong>{format(first, 'M月d日')} — {format(addDays(first, 6), 'M月d日')}</strong><button type="button" className="m-feature-icon-button" onClick={() => navigate(1)} aria-label="下一周"><ArrowRight size={17} /></button><button type="button" className="m-feature-link" onClick={() => { setAnchor(today); setSelectedDay(today) }}>本周</button></div><div className="m-feature-segment"><button type="button" aria-pressed={view === 'week'} onClick={() => setView('week')}>一周</button><button type="button" aria-pressed={view === 'matrix'} onClick={() => setView('matrix')}>四象限</button></div></div>
    {error && <p className="m-feature-error" role="alert">{error}</p>}
    <div className="m-week-strip" aria-label="选择计划日期">{days.map((date, index) => {
      const dayBudget = dayCapacity(workspace, date)
      const dayNet = dayBudget.capacityMinutes
      const allocations = workspace.allocations.filter(item => item.date === date && tasks.some(task => task.id === item.taskId))
      const total = dayBudget.consumedMinutes
      return <button type="button" key={date} className={`m-week-day${date === today ? ' is-today' : ''}`} aria-pressed={date === activeDay} onClick={() => setSelectedDay(date)}><span>周{weekdays[index]}{date === today && <i aria-label="今天" />}</span><strong>{format(parseISO(date), 'd')}</strong><div className={`m-capacity-track${dayBudget.knownCapacity && total > dayNet ? ' is-over' : ''}`}><span style={{ width: `${!dayBudget.knownCapacity ? 0 : dayNet > 0 ? Math.min(100, total / dayNet * 100) : total ? 100 : 0}%` }} /></div><small>{allocations.length ? `${allocations.length} 项 · ${minutesLabel(total)}` : '尚有留白'}</small></button>
    })}</div>
    {view === 'week' ? <>
      <div className="m-plan-capacity-panel"><div><span className="m-feature-kicker">{format(parseISO(activeDay), 'M月d日')} · 时间预算</span><div className="m-capacity-numbers"><strong className={budget.knownCapacity && budget.overMinutes > 0 ? 'm-feature-danger' : ''}>{minutesLabel(planned)}</strong><span>{budget.knownCapacity ? `/ 可安排 ${minutesLabel(net)}` : '/ 尚未设定预算'}</span></div><p>{capacity ? `已预留 ${Math.round(buffer * 100)}% 弹性。` : '填入今天可投入的时间，建议预留 20% 弹性。'}{unknown ? `还有 ${unknown} 项待估时。` : ''}{budget.knownCapacity && budget.overMinutes > 0 ? '实际与计划合计已超出预算，建议减少承诺。' : ''}{budget.actualMinutes > 0 ? ` 已记录实际投入 ${minutesLabel(budget.actualMinutes)}。` : ''}</p></div>
        <form className="m-capacity-form" key={`${activeDay}:${gross}:${buffer}`} onSubmit={event => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const minutes = Number(form.get('minutes'))
          const percentage = Number(form.get('buffer'))
          if (Number.isFinite(minutes) && minutes >= 0 && minutes <= 1440 && Number.isFinite(percentage) && percentage >= 0 && percentage < 100) void run({ type: 'capacity', capacity: { date: activeDay, minutes, buffer: percentage / 100 } })
        }}><label>可投入 / 分钟<input name="minutes" type="number" min="0" max="1440" step="1" defaultValue={gross} required /></label><label>弹性 / %<input name="buffer" type="number" min="0" max="99" step="1" defaultValue={Math.round(buffer * 100)} required /></label><button type="submit" className="m-feature-secondary" disabled={pending}>{capacity ? '更新预算' : '设定预算'}</button></form>
      </div>
      <div className="m-plan-columns"><section><div className="m-feature-section-heading"><h2><CalendarBlank size={18} /> 当日安排</h2><span>{dayAllocations.length}</span></div><div className="m-plan-task-list">{dayAllocations.map(item => { const task = tasks.find(candidate => candidate.id === item.taskId); return task ? taskCard(task, item.date) : null })}{!dayAllocations.length && <div className="m-feature-inline-empty"><Circle size={24} weight="light" /><p>还没有安排。挑一个重要的小行动，今天就从这里开始。</p></div>}</div></section>
        <section><div className="m-feature-section-heading"><h2><Clock size={18} /> 待安排</h2><span>{pool.length}</span></div><label className="m-plan-search"><span className="m-feature-sr">搜索待安排行动</span><input type="search" placeholder="找一件想推进的事…" value={search} onChange={event => setSearch(event.target.value)} /></label><div className="m-plan-task-list">{pool.map(task => taskCard(task))}{!pool.length && <div className="m-feature-inline-empty"><p>{search ? '没有找到匹配的行动。' : '没有未安排的行动。可以和 Master 聊聊下一步。'}</p><button type="button" className="m-feature-link" onClick={() => onAssist('帮我根据目标梳理接下来可以做的行动。')}>聊聊下一步</button></div>}</div></section></div>
    </> : <><p className="m-feature-muted m-matrix-note">全部未完成行动。点击「安排」放入 {activeDay}；点击标题可修改重要性和紧急性。</p><div className="m-quadrant-grid">{quadrants.map(quadrant => {
      const items = openTasks.filter(task => task.importance !== 'unknown' && task.urgent !== null && (task.importance === 'important') === quadrant.important && task.urgent === quadrant.urgent)
      return <section key={quadrant.key} className={`m-quadrant m-quadrant--${quadrant.key}`}><header><div><span>{quadrant.detail}</span><h2>{quadrant.label}</h2></div><strong>{items.length}</strong></header>{items.map(task => taskCard(task))}{!items.length && <p className="m-feature-muted">这里暂时没有行动。</p>}</section>
    })}</div>{openTasks.some(task => task.importance === 'unknown' || task.urgent === null) && <section className="m-unclassified"><div className="m-feature-section-heading"><h2>还需判断</h2><span>重要性或紧急性尚未明确</span></div>{openTasks.filter(task => task.importance === 'unknown' || task.urgent === null).map(task => taskCard(task))}</section>}</>}
  </section>
}
