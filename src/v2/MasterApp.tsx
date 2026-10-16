import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowCounterClockwise, ArrowRight, CalendarDots, ChartLineUp, Check, CloudSlash, Compass, GearSix, Graph, Leaf, MagnifyingGlass, Microphone, Plus, SidebarSimple, Sparkle, Target, X } from '@phosphor-icons/react'
import type { Command, Task, View, Workspace } from './core/types'
import { createDemoWorkspace, newId, todayISO } from './core'
import { createRepository, type MasterRepository } from './storage'
import { configureGateway } from './agent/client'
import { localDay } from './components/context'
import { Today } from './components/Today'
import { TaskEditor, GoalEditor, Modal } from './components/Editors'
import { Settings } from './components/Settings'
import './master.css'

const Assistant = lazy(() => import('./components/Assistant').then(m => ({ default: m.Assistant })))
const GoalMap = lazy(() => import('./components/GoalMap').then(m => ({ default: m.GoalMap })))
const PlanView = lazy(() => import('./components/PlanView').then(m => ({ default: m.PlanView })))
const ReviewView = lazy(() => import('./components/ReviewView').then(m => ({ default: m.ReviewView })))
const views = [{ id: 'today', title: '今日', icon: Compass }, { id: 'map', title: '目标地图', icon: Graph }, { id: 'plan', title: '计划', icon: CalendarDots }, { id: 'review', title: '复盘', icon: ChartLineUp }] as const

export default function MasterApp() {
  const [demo, setDemo] = useState(() => sessionStorage.getItem('master-v2-space') === 'demo')
  const repositoryRef = useRef<MasterRepository | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const stateRef = useRef<Workspace | null>(null)
  const serial = useRef<Promise<unknown>>(Promise.resolve())
  const [view, setView] = useState<View>('today')
  const [selectedGoalId, setSelectedGoalId] = useState('')
  const [assistant, setAssistant] = useState(false); const [prompt, setPrompt] = useState('')
  const [reviewRange, setReviewRange] = useState<{start: string; end: string} | null>(null)
  const [taskEditor, setTaskEditor] = useState<{ id?: string; goalId?: string; nodeId?: string } | null>(null)
  const [goalEditor, setGoalEditor] = useState<{ id?: string } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false); const [search, setSearch] = useState('')
  const [toast, setToast] = useState(''); const [error, setError] = useState('')
  const [toastUndo, setToastUndo] = useState(false)
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [navOpen, setNavOpen] = useState(false)
  const theme = workspace?.preferences.theme
  const gatewayUrl = workspace?.preferences.gatewayUrl

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [view, demo])

  useEffect(() => {
    let active = true
    const repository = createRepository(demo ? { databaseName: 'master-v2-demo', initialWorkspace: createDemoWorkspace(todayISO()) } : {})
    repositoryRef.current = repository
    setLoading(true); setError(''); stateRef.current = null
    const load = () => repository.load().then(w => { if (active) { stateRef.current = w; setWorkspace(w); setLoading(false) } }).catch(e => { if (active) { setError(messageOf(e)); setLoading(false) } })
    void load()
    const unsubscribe = repository.subscribe(() => { void load() })
    return () => { active = false; unsubscribe(); if (repositoryRef.current === repository) repositoryRef.current = null; void serial.current.finally(() => repository.close()) }
  }, [demo])

  useEffect(() => {
    if (!theme) return
    const media = matchMedia('(prefers-color-scheme: dark)')
    const update = () => { document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme }
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [theme])
  useEffect(() => { if (gatewayUrl) configureGateway({ url: gatewayUrl }) }, [gatewayUrl])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 6000); return () => clearTimeout(timer) }, [toast])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.isComposing) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(s => !s) }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setAssistant(s => !s) }
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }, [])

  const execute = useCallback((command: Command): Promise<Workspace> => {
    const repository = repositoryRef.current
    const work = async () => {
      if (!repository || repository !== repositoryRef.current || !stateRef.current) throw new Error('本地数据尚未就绪，或空间已切换。')
      setSaving(true)
      try {
        const result = await repository.execute({ operationId: newId(), expectedRevision: stateRef.current.revision, command })
        if (repository === repositoryRef.current) { stateRef.current = result.workspace; setWorkspace(result.workspace); setError('') }
        if (!['save_proposal', 'preferences'].includes(command.type)) { setToast(result.receipt.label || '已保存到本机'); setToastUndo(true) }
        return result.workspace
      } catch (e) { setError(messageOf(e)); throw e } finally { setSaving(false) }
    }
    const result = serial.current.then(work, work); serial.current = result.catch(() => undefined); return result
  }, [])
  const onCommand = useCallback(async (command: Command) => { await execute(command) }, [execute])

  async function undo() {
    const repository = repositoryRef.current
    const work = async () => {
      if (!repository || repository !== repositoryRef.current) return
      setSaving(true)
      try { const result = await repository.undo(); if (repository === repositoryRef.current) { stateRef.current = result.workspace; setWorkspace(result.workspace) }; setToast('已撤销上一次变更'); setToastUndo(false); setError('') } catch (e) { setError(messageOf(e)) } finally { setSaving(false) }
    }
    const result = serial.current.then(work, work); serial.current = result; await result
  }
  async function exportData() {
    const repository = repositoryRef.current
    if (!repository) throw new Error('本地数据尚未就绪')
    await serial.current
    const text = await repository.export(); const href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = href; a.download = `Master-${demo ? 'example-' : ''}${todayISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(href), 2000); setToast('已生成备份，请确认下载已保存'); setToastUndo(false)
  }
  function showAssistant(value = '', range?: {start: string; end: string}) { setPrompt(value); setReviewRange(range ?? null); setAssistant(true) }
  function switchDemo(value: boolean) { if (saving) return; setAssistant(false); setTaskEditor(null); setGoalEditor(null); setToast(''); setDemo(value); sessionStorage.setItem('master-v2-space', value ? 'demo' : 'personal'); setView('today'); setNavOpen(false) }
  function complete(task: Task) { void execute({ type: 'complete_task', id: task.id, done: task.status !== 'done', date: localDay(workspace?.preferences.timezone) }).catch(() => undefined) }
  const task = taskEditor?.id ? workspace?.tasks.find(t => t.id === taskEditor.id) : undefined
  const activeGoals = workspace?.goals.filter(g => g.status === 'active') ?? []
  const common = workspace ? { workspace, onCommand, onEditTask: (id: string) => setTaskEditor({ id }), onAssist: showAssistant } : null

  if (loading) return <div className="m-loading"><Leaf size={32} /><strong>Master</strong><span>正在打开本地工作空间</span><div className="m-loading-lines"><i /><i /><i /></div></div>
  if (!workspace) return <div className="m-loading"><h1>暂时无法读取本地数据</h1><p className="m-error">{error}</p><p>原数据未被删除。请重试，或检查浏览器存储与设备空间。</p><button className="m-button" onClick={() => location.reload()}>重试</button></div>
  return <div className={`m-app ${assistant ? 'with-assistant' : ''}`}>
    <aside className={`m-sidebar ${navOpen ? 'open' : ''}`}><button className="m-brand" onClick={() => { setView('today'); setNavOpen(false) }}><span><Leaf size={25} weight="bold" /></span><strong>Master</strong></button>
      <button className="m-space-switch" onClick={() => switchDemo(!demo)}><span className="m-space-avatar">{demo ? '示' : 'M'}</span><span>{demo ? '示例空间' : '我的空间'}<small>{demo ? '点击回到我的空间' : '个人时间工作台'}</small></span><ArrowRight size={13} /></button>
      <button className="m-search-trigger" onClick={() => setSearchOpen(true)}><MagnifyingGlass size={17} /><span>搜索</span><kbd>⌃ K</kbd></button>
      <nav aria-label="主导航">{views.map(v => <button key={v.id} className={view === v.id ? 'active' : ''} onClick={() => { setView(v.id); setNavOpen(false) }} aria-current={view === v.id ? 'page' : undefined}><v.icon size={20} weight={view === v.id ? 'fill' : 'regular'} /><span>{v.title}</span>{v.id === 'today' && <small>{workspace.allocations.filter(a => a.date === localDay(workspace.preferences.timezone) && workspace.tasks.some(t => t.id === a.taskId && t.status !== 'done' && t.status !== 'cancelled')).length || ''}</small>}</button>)}</nav>
      <div className="m-sidebar-goals"><div><span>我的目标</span><button aria-label="添加目标" onClick={() => setGoalEditor({})}><Plus size={15} /></button></div>{activeGoals.slice(0, 5).map(g => <button key={g.id} onClick={() => { setSelectedGoalId(g.id); setView('map'); setNavOpen(false) }}><Target size={14} /><span>{g.title}</span></button>)}{!activeGoals.length && <p>每个行动，都可以有来处。</p>}</div>
      <div className="m-sidebar-bottom"><button onClick={() => showAssistant()}><Sparkle size={18} /><span>Master 助手</span><kbd>⌃ J</kbd></button><button className={view === 'settings' ? 'active' : ''} onClick={() => { setView('settings'); setNavOpen(false) }}><GearSix size={19} /><span>设置与数据</span></button><div className="m-local-note"><span className="m-saved-dot" />本地优先，留有余地</div></div>
    </aside>
    <div className="m-workspace"><header className="m-topbar"><div className="m-breadcrumb"><button className="m-icon-button m-mobile-nav" onClick={() => setNavOpen(!navOpen)} aria-label="切换导航"><SidebarSimple size={21} /></button><span>{demo ? '示例空间' : '我的空间'}</span><span>/</span><strong>{views.find(v => v.id === view)?.title ?? '设置与数据'}</strong></div><div className="m-top-actions"><span className="m-save-state">{error ? '请检查操作提示' : saving ? '保存中…' : <><Check size={13} />已保存到本机</>}</span>{!online && <span className="m-offline"><CloudSlash size={15} />离线</span>}<button className="m-icon-button" aria-label="撤销上一次变更" title="撤销上一次变更" onClick={() => void undo()}><ArrowCounterClockwise size={18} /></button><button className="m-button m-top-assist" onClick={() => showAssistant()}><Microphone size={16} />说一说</button></div></header>
      {demo && <div className="m-demo-banner">这里是独立示例数据，你可以放心体验。<button onClick={() => switchDemo(false)}>回到我的空间 <ArrowRight size={13} /></button></div>}
      {error && <div className="m-global-error" role="alert"><span>{error}</span><button className="m-icon-button" aria-label="关闭错误提示" onClick={() => setError('')}><X size={16} /></button></div>}
      <main className={`m-main m-view-${view}`}><div className="m-date-line">{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', timeZone: workspace.preferences.timezone }).format(new Date())}</div><Suspense fallback={<div className="m-view-loading" role="status">正在打开视图…</div>}>
        {view === 'today' && <Today workspace={workspace} onEditTask={id => setTaskEditor({ id })} onCreateTask={() => setTaskEditor({})} onComplete={complete} onAssist={showAssistant} onPlan={() => setView('plan')} onMap={id => { if (id) setSelectedGoalId(id); setView('map') }} onEditGoal={id => setGoalEditor({ id })} onDemo={() => switchDemo(true)} />}
        {view === 'map' && common && <GoalMap {...common} selectedGoalId={selectedGoalId} onSelectGoal={setSelectedGoalId} onEditGoal={id => setGoalEditor({ id })} onCreateTask={(goalId, nodeId) => setTaskEditor({ goalId, nodeId })} />}
        {view === 'plan' && common && <PlanView {...common} />}
        {view === 'review' && common && <ReviewView {...common} />}
        {view === 'settings' && <Settings workspace={workspace} onExecute={execute} onExport={exportData} demo={demo} />}
      </Suspense></main>
    </div>
    {assistant && <Suspense fallback={<aside className="m-assistant m-view-loading">正在打开助手…</aside>}><Assistant workspace={workspace} initialPrompt={prompt} reviewRange={reviewRange} onExecute={execute} onClose={() => setAssistant(false)} onSettings={() => { setAssistant(false); setView('settings') }} /></Suspense>}
    {toast && <div className="m-toast" role="status"><Check size={17} /><span>{toast}</span>{toastUndo && <button onClick={() => void undo()}>撤销</button>}<button aria-label="关闭通知" onClick={() => setToast('')}><X size={14} /></button></div>}
    {taskEditor && <TaskEditor key={taskEditor.id ?? 'new'} workspace={workspace} task={task} goalId={taskEditor.goalId} nodeId={taskEditor.nodeId} onExecute={execute} onClose={() => setTaskEditor(null)} />}
    {goalEditor && <GoalEditor goal={workspace.goals.find(g => g.id === goalEditor.id)} onExecute={execute} onClose={() => setGoalEditor(null)} />}
    {searchOpen && <Modal title="找到下一步" subtitle="搜索目标与行动。Ctrl + K 随时打开。" onClose={() => setSearchOpen(false)}><label className="m-search-field"><MagnifyingGlass size={20} /><input autoFocus aria-label="搜索目标与任务" placeholder="输入名称或关键词" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="m-search-results">{workspace.tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()) && t.status !== 'cancelled').slice(0, 12).map(t => <button key={t.id} onClick={() => { setSearchOpen(false); setTaskEditor({ id: t.id }) }}><Check size={15} /><span>{t.title}</span><small>行动</small></button>)}{workspace.goals.filter(g => g.title.toLowerCase().includes(search.toLowerCase())).slice(0, 5).map(g => <button key={g.id} onClick={() => { setSearchOpen(false); setGoalEditor({ id: g.id }) }}><Target size={15} /><span>{g.title}</span><small>目标</small></button>)}{!workspace.tasks.length && !workspace.goals.length && <p>还没有内容，可以先说一个想法。</p>}</div></Modal>}
  </div>
}
function messageOf(e: unknown) { return e instanceof Error ? e.message : String(e) }
