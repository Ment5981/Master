import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, LockKey, FloppyDisk, Target } from '@phosphor-icons/react'
import type { Command, Goal, Task, Workspace } from '../core/types'
import { createGoal, createTask, newId } from '../core'
import { localDay } from './context'

interface TaskEditorProps {
  workspace: Workspace; task?: Task; goalId?: string; nodeId?: string
  onExecute: (command: Command) => Promise<Workspace>; onClose: () => void
}
export function TaskEditor({ workspace, task, goalId, nodeId, onExecute, onClose }: TaskEditorProps) {
  const [form, setForm] = useState<Task>(task ?? createTask('', { goalId: goalId ?? null, nodeId: nodeId ?? null }))
  const current = workspace.allocations.find(a => a.taskId === task?.id)
  const [date, setDate] = useState(current?.date ?? (task ? '' : localDay(workspace.preferences.timezone)))
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false)
  const [actual, setActual] = useState('')
  function change<K extends keyof Task>(key: K, value: Task[K]) { setForm(s => ({ ...s, [key]: value })) }
  async function save() {
    if (!form.title.trim()) { setError('给这一步起个清楚的名字。'); return }
    setSaving(true); setError('')
    try {
      if (task) {
        await onExecute({ type: 'update_task', id: task.id, changes: { title: form.title.trim(), goalId: form.goalId, nodeId: form.nodeId, importance: form.importance, urgent: form.urgent, estimateMinutes: form.estimateMinutes, dueDate: form.dueDate, startDate: form.startDate, status: form.status === 'done' ? task.status : form.status, locked: form.locked }, scheduling: { fromDate: current?.date ?? null, toDate: date || null, minutes: form.estimateMinutes } })
      } else await onExecute({ type: 'create_task', task: { ...form, title: form.title.trim() }, allocation: date ? { id: newId(), taskId: form.id, date, minutes: form.estimateMinutes } : undefined })
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setSaving(false) }
  }
  return <Modal title={task ? '编辑行动' : '新的一步'} subtitle="细节可以之后补充，先知道下一步做什么。" onClose={onClose}>
    <form onSubmit={e => { e.preventDefault(); void save() }} className="m-editor-form">
      <label>任务名称<input autoFocus value={form.title} maxLength={180} onChange={e => change('title', e.target.value)} placeholder="例如：整理作品集的第一个案例" /></label>
      <div className="m-form-grid"><label>所属目标<select value={form.goalId ?? ''} onChange={e => setForm(s => ({ ...s, goalId: e.target.value || null, nodeId: null }))}><option value="">收集箱</option>{workspace.goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label><label>具体分支<select value={form.nodeId ?? ''} onChange={e => change('nodeId', e.target.value || null)}><option value="">直接归属目标</option>{workspace.nodes.filter(n => n.goalId === form.goalId).map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label></div>
      <div className="m-form-grid"><label>计划日期<input type="date" value={date} onChange={e => setDate(e.target.value)} /><small>想什么时候做，不是截止</small></label><label>预计分钟<input type="number" min="1" max="1440" value={form.estimateMinutes ?? ''} onChange={e => change('estimateMinutes', e.target.value ? Number(e.target.value) : null)} placeholder="可以暂不估计" /></label></div>
      <div className="m-form-grid"><label>硬截止（可选）<input type="date" value={form.dueDate ?? ''} onChange={e => change('dueDate', e.target.value || null)} /></label><label>开始日期（可选）<input type="date" value={form.startDate ?? ''} onChange={e => change('startDate', e.target.value || null)} /></label></div>
      <div className="m-form-grid"><label>重要性<select value={form.importance} onChange={e => change('importance', e.target.value as Task['importance'])}><option value="unknown">待判断</option><option value="important">重要</option><option value="normal">一般</option></select></label><label>紧急程度<select value={form.urgent === null ? 'unknown' : String(form.urgent)} onChange={e => change('urgent', e.target.value === 'unknown' ? null : e.target.value === 'true')}><option value="unknown">待判断</option><option value="true">紧急</option><option value="false">不紧急</option></select></label></div>
      {task && task.status !== 'done' && <label>执行状态<select value={form.status} onChange={e => change('status', e.target.value as Task['status'])}><option value="todo">待开始</option><option value="in_progress">进行中</option><option value="blocked">遇到阻碍</option><option value="cancelled">取消</option></select></label>}
      <label className="m-check-label"><input type="checkbox" checked={form.locked} onChange={e => change('locked', e.target.checked)} /><LockKey size={15} />锁定安排，AI 不自动调整</label>
      {task && task.status !== 'done' && <details className="m-completion-detail"><summary>完成任务并记录投入</summary><p className="m-muted">填写截至本次完成的累计时长。已有记录会保留，仅新增差额计入今天。</p><label>累计实际分钟（可不填）<input type="number" min="1" max="1440" value={actual} onChange={e => setActual(e.target.value)} /></label><button type="button" className="m-button" disabled={saving} onClick={async () => { setSaving(true); try { await onExecute({ type: 'complete_task', id: task.id, done: true, date: localDay(workspace.preferences.timezone), ...(actual ? { minutes: Number(actual) } : {}) }); onClose() } catch (e) { setError(String(e)) } finally { setSaving(false) } }}>标记完成</button></details>}
      {error && <p className="m-error" role="alert">{error}</p>}<footer className="m-dialog-actions"><button type="button" className="m-button" onClick={onClose}>取消</button><button className="m-button primary" disabled={saving}><FloppyDisk size={16} />{saving ? '保存中' : '保存行动'}</button></footer>
    </form>
  </Modal>
}

export function GoalEditor({ goal, onExecute, onClose }: {goal?: Goal; onExecute: (command: Command) => Promise<Workspace>; onClose: () => void}) {
  const [form, setForm] = useState<Goal>(goal ?? createGoal(''))
  const [criteria, setCriteria] = useState(form.criteria.join('\n'))
  const [elements, setElements] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true); setError('')
    try {
      if (!form.title.trim()) throw new Error('请填写目标名称。')
      if (!goal && elements.split('\n').filter(x => x.trim()).length > 12) throw new Error('一次最多创建 12 个要素，建议先聚焦 3–7 个，不会截断你的输入。')
      const value = { ...form, title: form.title.trim(), criteria: criteria.split('\n').map(x => x.trim()).filter(Boolean) }
      if (goal) await onExecute({ type: 'update_goal', id: goal.id, changes: { title: value.title, description: value.description, criteria: value.criteria, dueDate: value.dueDate, status: value.status, verified: value.verified } })
      else await onExecute({ type: 'create_goal', goal: value, nodes: elements.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 12).map((title, order) => ({ id: newId(), goalId: value.id, parentId: null, kind: 'element', title, weight: 1, order })) })
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setSaving(false) }
  }
  return <Modal title={goal ? '目标与成功标准' : '种下一个目标'} subtitle="明确结果，留出空间。无需一次想好全部路径。" onClose={onClose}><form className="m-editor-form" onSubmit={e => { e.preventDefault(); void save() }}>
    <label>目标名称<input autoFocus value={form.title} maxLength={180} onChange={e => setForm(s => ({ ...s, title: e.target.value }))} placeholder="我想实现什么变化？" /></label>
    <label>为什么做 / 现实限制<textarea value={form.description} onChange={e => setForm(s => ({ ...s, description: e.target.value }))} rows={3} /></label>
    <label>成功标准，每行一条<textarea value={criteria} onChange={e => setCriteria(e.target.value)} rows={3} placeholder="怎样才算真正完成？可以之后再补。" /></label>
    <label>完成日期（可选）<input type="date" value={form.dueDate ?? ''} onChange={e => setForm(s => ({ ...s, dueDate: e.target.value || null }))} /></label>
    {!goal && <label>关键要素，每行一个<textarea value={elements} onChange={e => setElements(e.target.value)} rows={3} placeholder="建议 3-7 个，可以先只写一个" /></label>}
    {goal && <><label>目标状态<select value={form.status} onChange={e => setForm(s => ({ ...s, status: e.target.value as Goal['status'] }))}><option value="active">正在推进</option><option value="paused">暂停</option><option value="archived">归档</option></select></label><label className="m-check-label"><input type="checkbox" checked={form.verified} onChange={e => setForm(s => ({ ...s, verified: e.target.checked }))} />我确认成功标准已经达成</label><p className="m-muted">成果验收独立于任务完成率，不会自动勾完剩余行动。</p></>}
    {error && <p className="m-error" role="alert">{error}</p>}<footer className="m-dialog-actions"><button type="button" className="m-button" onClick={onClose}>取消</button><button className="m-button primary" disabled={saving}><Target size={16} />{saving ? '保存中' : goal ? '保存目标' : '创建目标'}</button></footer>
  </form></Modal>
}

export function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}><Dialog.Portal><Dialog.Overlay className="m-dialog-overlay" /><Dialog.Content className="m-dialog"><div className="m-dialog-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{subtitle ?? '修改后保存，操作支持撤销。'}</Dialog.Description></div><Dialog.Close className="m-icon-button" aria-label="关闭对话框"><X size={20} /></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>
}
