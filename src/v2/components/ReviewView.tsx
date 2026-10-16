import { useId, useState } from 'react'
import { addMonths, addWeeks, addYears, endOfMonth, endOfWeek, endOfYear, format, parseISO, startOfMonth, startOfWeek, startOfYear } from 'date-fns'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Clock, Leaf, NotePencil } from '@phosphor-icons/react'
import type { Command, Review, Workspace } from '../core/types'
import { reviewSnapshot, taskCompletionDate } from '../core/runtime.mjs'
import './features.css'

export interface ReviewViewProps {
  workspace: Workspace
  onCommand: (command: Command) => Promise<void>
  onEditTask: (id: string) => void
  onAssist: (prompt?: string, range?: {start: string; end: string}) => void
}

const periodNames = { week: '周', month: '月', year: '年' }
function dateInZone(value: string, timezone: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
const minutesLabel = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ''}` : `${minutes}分钟`

function ReviewEditor({ saved, period, start, end, snapshot, onCommand }: { saved?: Review; period: Review['period']; start: string; end: string; snapshot: Review['snapshot']; onCommand: ReviewViewProps['onCommand'] }) {
  const formId = useId()
  const [notes, setNotes] = useState(saved?.notes ?? '')
  const [next, setNext] = useState(saved?.next ?? '')
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const save = async () => {
    setPending(true)
    setStatus('')
    try {
      await onCommand({ type: 'save_review', review: { id: saved?.id ?? crypto.randomUUID(), period, start, end, notes: notes.trim(), next: next.trim(), createdAt: new Date().toISOString(), snapshot, snapshotStatus: 'captured' } })
      setStatus('复盘与当前统计快照已保存。')
    } catch (reason) { setStatus(reason instanceof Error ? reason.message : '保存失败，请重试。') } finally { setPending(false) }
  }
  return <form className="m-review-editor" onSubmit={event => { event.preventDefault(); void save() }}>
    <div className="m-feature-section-heading"><h2><NotePencil size={19} /> 留下自己的观察</h2>{saved && <span>已有保存的复盘</span>}</div>
    <div className="m-review-writing">
      <div><label htmlFor={`${formId}-notes`}>这一程，什么值得记住？</label><textarea id={`${formId}-notes`} value={notes} onChange={event => setNotes(event.target.value)} placeholder="什么推进了，什么卡住了？也记下那些让你恢复能量的事。" rows={5} /></div>
      <div><label htmlFor={`${formId}-next`}>下一程，想做什么调整？</label><textarea id={`${formId}-next`} value={next} onChange={event => setNext(event.target.value)} placeholder="继续一件事，减少一件事。给下一阶段一个清晰的小改变。" rows={5} /></div>
    </div>
    <footer><p role="status">{status || '保存时会保留本期统计快照，方便以后回看。'}</p><button type="submit" className="m-feature-action" disabled={pending}>{pending ? '保存中…' : '保存这次复盘'}</button></footer>
  </form>
}

export function ReviewView({ workspace, onCommand, onEditTask, onAssist }: ReviewViewProps) {
  const timezone = workspace.preferences.timezone
  const today = dateInZone(new Date().toISOString(), timezone)
  const [period, setPeriod] = useState<Review['period']>('week')
  const [anchor, setAnchor] = useState(today)
  const date = parseISO(anchor)
  const range = period === 'week' ? [startOfWeek(date, { weekStartsOn: 1 }), endOfWeek(date, { weekStartsOn: 1 })] : period === 'month' ? [startOfMonth(date), endOfMonth(date)] : [startOfYear(date), endOfYear(date)]
  const start = format(range[0], 'yyyy-MM-dd')
  const end = format(range[1], 'yyyy-MM-dd')
  const within = (value: string | null) => { if (!value) return false; const key = dateInZone(value, timezone); return key >= start && key <= end }
  const completedTasks = workspace.tasks.filter(task => task.status === 'done' && within(taskCompletionDate(task, timezone)))
  const undatedEntries = workspace.timeEntries.filter(entry => !entry.date || entry.source === 'legacy')
  const snapshot = reviewSnapshot(workspace, start, end)
  const { minutes, unknownTime, goalMinutes } = snapshot
  const saved = workspace.reviews.filter(review => review.period === period && review.start === start && review.end === end).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const goalRows = Object.entries(goalMinutes)
  const unassignedMinutes = minutes - goalRows.reduce((sum, [, value]) => sum + value, 0)
  if (unassignedMinutes > 0) goalRows.push(['unassigned', unassignedMinutes])
  goalRows.sort((a, b) => b[1] - a[1])
  const navigate = (direction: number) => setAnchor(format(period === 'week' ? addWeeks(date, direction) : period === 'month' ? addMonths(date, direction) : addYears(date, direction), 'yyyy-MM-dd'))
  const label = period === 'year' ? format(date, 'yyyy年') : period === 'month' ? format(date, 'yyyy年M月') : `${format(range[0], 'M月d日')} — ${format(range[1], 'M月d日')}`
  return <section className="m-feature-view" aria-label="周期复盘"><header className="m-feature-header"><div><p className="m-feature-eyebrow">回望，然后向前</p><h1>看见生长<span className="m-feature-title-dot">.</span></h1><p>不是评判自己，而是找到更适合自己的节奏。</p></div><button type="button" className="m-feature-action" onClick={() => onAssist(`帮我复盘 ${start} 至 ${end}。先根据我的真实记录整理已完成的事和实际投入，再问我一个最值得澄清的问题。`, { start, end })}><Leaf size={17} /> 和 Master 一起回顾</button></header>
    <div className="m-feature-toolbar"><div className="m-plan-period"><button type="button" className="m-feature-icon-button" onClick={() => navigate(-1)} aria-label={`上一${periodNames[period]}`}><ArrowLeft size={17} /></button><strong>{label}</strong><button type="button" className="m-feature-icon-button" onClick={() => navigate(1)} aria-label={`下一${periodNames[period]}`}><ArrowRight size={17} /></button><button type="button" className="m-feature-link" onClick={() => setAnchor(today)}>本{periodNames[period]}</button></div><div className="m-feature-segment">{(['week', 'month', 'year'] as const).map(value => <button type="button" key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{periodNames[value]}度</button>)}</div></div>
    <div className="m-review-stats"><div><span><Check size={17} /> 本期完成</span><strong>{completedTasks.length}<small>项行动</small></strong><p>按完成日期统计</p></div><div><span><Clock size={17} /> 实际投入</span><strong>{minutesLabel(minutes)}</strong><p>来自有日期的时间记录，不用估时代替</p></div><div><span><Leaf size={17} /> 待补时间</span><strong>{unknownTime}<small>项行动</small></strong><p>本期完成，但没有本期投入记录</p></div></div>
    <div className="m-review-columns"><section className="m-review-allocation"><div className="m-feature-section-heading"><h2>时间去了哪里</h2><span>实际分钟</span></div>{goalRows.length ? goalRows.map(([goalId, value]) => <div className="m-review-goal" key={goalId}><div><span>{workspace.goals.find(goal => goal.id === goalId)?.title ?? '未关联目标'}</span><strong>{minutesLabel(value)}</strong></div><div className="m-capacity-track"><span style={{ width: `${minutes ? value / minutes * 100 : 0}%` }} /></div></div>) : <div className="m-feature-inline-empty"><Leaf size={28} weight="light" /><p>这个周期还没有可统计的时间记录。记录实际投入后，就能看见各个方向的分布。</p></div>}{undatedEntries.length > 0 && <p className="m-feature-footnote">另有 {undatedEntries.length} 条历史时间记录缺少日期，未计入任何周期。</p>}</section>
      <section className="m-review-completed"><div className="m-feature-section-heading"><h2>已经走过的小步</h2><span>{completedTasks.length}</span></div>{completedTasks.length ? <ul>{completedTasks.map(task => <li key={task.id}><Check size={15} /><button type="button" className="m-feature-text-button" onClick={() => onEditTask(task.id)}><span>{task.title}</span><small>{taskCompletionDate(task, timezone)} · {workspace.goals.find(goal => goal.id === task.goalId)?.title ?? '独立行动'}</small></button><ArrowUpRight size={14} /></li>)}</ul> : <div className="m-feature-inline-empty"><p>这段时间还没有标记完成的行动。探索、暂停和重新思考，也可以写进下面的复盘。</p></div>}</section></div>
    <ReviewEditor key={`${period}:${start}`} saved={saved} period={period} start={start} end={end} snapshot={snapshot} onCommand={onCommand} />
    {saved && <aside className="m-review-snapshot"><span>上次保存的快照</span>{saved.snapshotStatus === 'unavailable' ? <p>这份历史复盘没有可靠的统计快照，原始文字已保留。</p> : <p>{saved.snapshot.completed} 项完成 · {minutesLabel(saved.snapshot.minutes)} 实际投入 · {saved.snapshot.unknownTime} 项待补时间</p>}<small>上方为当前记录统计，重新保存会更新这份快照。</small></aside>}
  </section>
}
