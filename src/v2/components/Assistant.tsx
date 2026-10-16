import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Check, FileText, Microphone, Stop, X, CaretDown, Sparkle, SpeakerHigh, WarningCircle } from '@phosphor-icons/react'
import type { AgentInput, Command, Proposal, Workspace } from '../core/types'
import { localDay, planningContext, reviewFacts } from './context'
import { generateProposal, getHealth } from '../agent/client'
import { startVoice, speakText, stopSpeaking } from '../agent/voice'
import { explicitConfirmation, durationAndConfirmation } from './approval'

interface Props {
  workspace: Workspace
  initialPrompt?: string
  reviewRange?: { start: string; end: string } | null
  onExecute: (command: Command) => Promise<Workspace>
  onClose: () => void
  onSettings: () => void
}

export function Assistant({ workspace, initialPrompt = '', reviewRange, onExecute, onClose, onSettings }: Props) {
  const saved = [...workspace.proposals].reverse().find(p => p.state === 'draft')
  const [text, setText] = useState(initialPrompt)
  const [draft, setDraft] = useState<Proposal | null>(saved ?? null)
  const [mode, setMode] = useState<AgentInput['mode']>(reviewRange ? 'review' : 'plan')
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([])
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [verified, setVerified] = useState<string[]>([])
  const [evidenceId, setEvidenceId] = useState<string | null>(null)
  const [ready, setReady] = useState<boolean | null>(null)
  const run = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const voice = useRef<Awaited<ReturnType<typeof startVoice>> | null>(null)
  const voiceAbort = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const current = useRef(workspace)
  current.current = workspace

  useEffect(() => { if (initialPrompt) setText(initialPrompt) }, [initialPrompt])
  useEffect(() => { if (reviewRange) setMode('review') }, [reviewRange])

  useEffect(() => {
    const controller = new AbortController()
    void getHealth({ signal: controller.signal }).then(h => setReady(h.ai)).catch(() => setReady(false))
    inputRef.current?.focus()
    // These refs hold the latest asynchronous sessions, not DOM nodes; cleanup must read the current values.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    return () => { controller.abort(); generation.current++; run.current?.abort(); voiceAbort.current?.abort(); voice.current?.cancel(); stopSpeaking() }
  }, [])

  const cancel = () => {
    generation.current++
    run.current?.abort(); voiceAbort.current?.abort(); voice.current?.cancel(); voice.current = null; stopSpeaking()
    setListening(false); setConnecting(false); setBusy(false); setStatus('已停止，输入仍保留')
  }

  useEffect(() => {
    if (!workspace.preferences.aiConsent) { generation.current++; run.current?.abort(); setBusy(false); stopSpeaking() }
    if (!workspace.preferences.aiConsent || !workspace.preferences.audioConsent) { voiceAbort.current?.abort(); voice.current?.cancel(); voice.current = null; setListening(false); setConnecting(false) }
    if (!workspace.preferences.speak) stopSpeaking()
  }, [workspace.preferences.aiConsent, workspace.preferences.audioConsent, workspace.preferences.speak])

  async function apply(candidate = draft) {
    if (!candidate || busy) return
    setError(''); setBusy(true); setStatus('正在保存到本机')
    try {
      if (candidate.question) throw new Error('请先回答这个关键问题，再确认安排。')
      if (candidate.baseRevision !== current.current.revision) throw new Error('计划期间有数据更新。请重新生成草案，避免覆盖你的修改。')
      const stored = current.current.proposals.find(p => p.id === candidate.id)
      const next = stored?.revision === candidate.revision ? current.current : await onExecute({ type: 'save_proposal', proposal: candidate })
      const persisted = next.proposals.find(p => p.id === candidate.id)!
      await onExecute({ type: 'apply_proposal', id: persisted.id, revision: persisted.revision, verifiedTaskIds: verified })
      setDraft(null); setVerified([]); setStatus('已保存到本机，可在顶部撤销')
      const reply = '已按确认的内容安排好，可以开始行动了。'
      setMessages(m => [...m, { role: 'assistant', text: reply }])
      if (current.current.preferences.speak) speakText(reply)
    } catch (e) { setError(messageOf(e)) } finally { setBusy(false) }
  }

  async function send(utterance = text) {
    const value = utterance.trim()
    if (!value || busy) return
    // Only an explicit confirmation of the visible unchanged draft takes this local path.
    if (mode === 'plan' && draft) {
      if (explicitConfirmation(value)) { setText(''); await apply(); return }
      try { const patched = durationAndConfirmation(value, draft); if (patched) { setDraft(patched); setText(''); await apply(patched); return } }
      catch (e) { setError(messageOf(e)); return }
    }
    if (!current.current.preferences.aiConsent) { setError('先允许发送本次文字和相关目标上下文，再使用联网助手。'); return }
    if (value.length > 24000) { setError('本次最多处理 24,000 字。请只选择与今天相关的记录。'); return }
    if (/(sk-[a-zA-Z0-9_-]{16,}|Bearer\s+[a-zA-Z0-9._-]{16,}|(?:api[_-]?key|password|secret)\s*[:=]\s*["']?[^\s"']{8,})/i.test(value)) {
      setError('这段文字可能含密钥或密码。请先删除敏感内容再发送。'); return
    }
    const epoch = ++generation.current
    const controller = new AbortController(); run.current?.abort(); run.current = controller
    setBusy(true); setError(''); setStatus('正在理解你的安排')
    stopSpeaking()
    const history = [...messages, { role: 'user' as const, text: value }]
    setMessages(history)
    try {
      const data = current.current
      const result = await generateProposal({
        text: value, mode, date: localDay(data.preferences.timezone), inputRevision: epoch,
        workspace: planningContext(data),
        ...(mode === 'review' && reviewRange ? { reviewFacts: reviewFacts(data, reviewRange) } : {}),
        previousProposal: draft ?? undefined, conversation: history.slice(-10),
      }, { signal: controller.signal, onStatus: () => { if (generation.current === epoch) setStatus('正在整理草案与来源') } })
      if (generation.current !== epoch) return
      if (current.current.revision !== data.revision) throw new Error('你刚刚修改了工作区。原输入已保留，请重新整理，避免旧结果覆盖新安排。')
      const next = await onExecute({ type: 'save_proposal', proposal: result })
      if (generation.current !== epoch || controller.signal.aborted) return
      const persisted = next.proposals.find(p => p.id === result.id)!
      setDraft(persisted); setVerified([]); setReady(true); setText('')
      const reply = persisted.question ?? persisted.summary
      setMessages(m => [...m, { role: 'assistant', text: reply }])
      setStatus(persisted.question ? '等你补充一句' : '草案已就绪，还未改变任务')
      if (data.preferences.speak && reply) speakText(reply.slice(0, 180))
    } catch (e) {
      if (generation.current === epoch && !controller.signal.aborted) setError(messageOf(e))
    } finally { if (generation.current === epoch) setBusy(false) }
  }

  async function toggleVoice() {
    if (connecting) { voiceAbort.current?.abort(); setConnecting(false); setStatus('已取消语音连接'); return }
    if (listening) {
      const capture = voice.current; voice.current = null; setListening(false); setStatus('正在完成转写')
      const controller = voiceAbort.current
      const signal = controller?.signal
      setConnecting(true)
      try { const result = await capture?.stop(); if (signal?.aborted) return; if (result?.trim()) { setText(result); await send(result) } else setStatus('没有识别到内容，你可以重说或打字') }
      catch (e) { if (!signal?.aborted) setError(messageOf(e)) }
      finally { if (voiceAbort.current === controller) setConnecting(false) }
      return
    }
    if (!workspace.preferences.audioConsent || !workspace.preferences.aiConsent) { setError('语音会发送音频给阿里识别，并将文字交给助手。请先在下方分别授权。'); return }
    setError(''); stopSpeaking(); setStatus('正在申请麦克风权限'); setConnecting(true)
    const controller = new AbortController(); voiceAbort.current = controller
    try {
      const capture = await startVoice({
        signal: controller.signal,
        onTranscript: (transcript) => { if (!controller.signal.aborted) setText(transcript) },
        onStatus: (state) => { if (!controller.signal.aborted) setStatus(state) },
        onError: (e) => { if (!controller.signal.aborted) { setError(messageOf(e)); setListening(false) } },
      })
      if (controller.signal.aborted) { capture.cancel(); return }
      voice.current = capture
      setListening(true); setStatus('正在听，点击结束后发送')
    } catch (e) { if (!controller.signal.aborted) { setError(messageOf(e)); setListening(false) } }
    finally { if (voiceAbort.current === controller) setConnecting(false) }
  }

  function editTask(id: string, change: Partial<Proposal['tasks'][number]>) {
    setDraft(p => p ? { ...p, revision: p.revision + 1, tasks: p.tasks.map(t => t.id === id ? { ...t, ...change } : t) } : p)
  }

  function editGoal(id: string, changes: Partial<Proposal['goals'][number]>) {
    setDraft(p => p ? { ...p, revision: p.revision + 1, goals: p.goals.map(g => g.id === id ? { ...g, ...changes } : g) } : p)
  }

  async function readFile(file?: File) {
    if (!file) return
    if (file.size > 200_000) { setError('请选取 200 KB 以内的文字片段，避免上传无关历史。'); return }
    const content = await file.text()
    setMode('import'); setText(content); setStatus(`已在本地读取 ${file.name}，尚未发送`)
  }

  const count = draft?.tasks.filter(t => t.selected && (t.status !== 'reported_done' || verified.includes(t.id))).length ?? 0
  return <aside className="m-assistant" aria-label="Master 助手">
    <header className="m-assistant-head"><div className="m-assistant-emblem"><Sparkle size={19} weight="fill" /></div><div><strong>和 Master 聊聊</strong><span>把想法，变成下一步</span></div><button className="m-icon-button" onClick={() => { cancel(); onClose() }} aria-label="关闭助手"><X size={19} /></button></header>
    <div className="m-assistant-scroll">
      {messages.length === 0 && !draft && <div className="m-assistant-welcome"><h2>不必先想好<br />一整张计划。</h2><p>说说今天想做什么、卡在哪里。我们从能开始的一步聊起。</p><button className="m-prompt" onClick={() => setText('今天我有一小时，想推进作品集，帮我安排一下。')}>今天只有一小时，帮我安排 <ArrowUp size={15} /></button><button className="m-prompt" onClick={() => { setMode('import'); inputRef.current?.focus() }}>整理一段工作或 Codex 记录 <FileText size={15} /></button></div>}
      {messages.slice(-6).map((m, i) => <div className={`m-message ${m.role}`} key={`${i}-${m.role}`}><span>{m.role === 'user' ? '你' : 'Master'}</span><p>{m.text}</p></div>)}
      {ready === false && <div className="m-note"><WarningCircle size={18} /><div><strong>等待连接 AI 服务</strong><p>文字输入已准备好。启动本地网关并配置阿里密钥后，即可真实生成计划。</p><button className="m-link" onClick={onSettings}>查看服务设置</button></div></div>}
      {draft && <section className="m-proposal" aria-label="计划草案"><div className="m-section-line"><strong>待确认的安排</strong><span>还未执行</span></div>
        {(draft.goals.length > 0 || draft.nodes.length > 0) && <p className="m-muted">确认时新增这里列出的 {draft.goals.length} 个目标、{draft.nodes.length} 个路径节点；下方任务可逐项取消采纳。</p>}
        {draft.question && <div className="m-question">{draft.question}<span>直接说或在下面补充即可</span></div>}
        {draft.goals.map(g => <details className="m-draft-goal-fields" key={g.id}><summary>新目标 · {g.title}</summary><label>目标名称<input value={g.title} onChange={e => editGoal(g.id, { title: e.target.value })} maxLength={180} /></label><label>完成日期<input type="date" value={g.dueDate ?? ''} onChange={e => editGoal(g.id, { dueDate: e.target.value || null })} /></label><label>成功标准，每行一条<textarea value={g.criteria.join('\n')} onChange={e => editGoal(g.id, { criteria: e.target.value.split('\n') })} /></label></details>)}
        {draft.nodes.length > 0 && <details className="m-draft-node-list"><summary>目标路径 · {draft.nodes.length} 个节点</summary>{draft.nodes.map(node => <label key={node.id}>{node.kind === 'element' ? '关键要素' : node.kind === 'milestone' ? '里程碑' : '子目标'}<input value={node.title} maxLength={180} onChange={e => setDraft(p => p ? { ...p, revision: p.revision + 1, nodes: p.nodes.map(n => n.id === node.id ? { ...n, title: e.target.value } : n) } : p)} /></label>)}</details>}
        {draft.capacity && <p className="m-draft-capacity">可用 {draft.capacity.minutes} 分钟，弹性 {Math.round(draft.capacity.buffer * 100)}%</p>}
        {draft.tasks.map((t, i) => <div className={`m-draft-item ${!t.selected ? 'excluded' : ''}`} key={t.id}>
          <div className="m-draft-title"><input type="checkbox" aria-label={`采纳 ${t.title}`} checked={t.selected} onChange={e => editTask(t.id, { selected: e.target.checked })} /><input aria-label={`草案任务 ${i + 1}`} value={t.title} maxLength={180} onChange={e => editTask(t.id, { title: e.target.value })} /></div>
          <div className="m-draft-fields"><label>建议分钟<input type="number" min="1" max="1440" value={t.estimateMinutes ?? ''} onChange={e => editTask(t.id, { estimateMinutes: e.target.value ? Number(e.target.value) : null })} /></label><label>安排日期<input type="date" value={t.plannedDate ?? ''} onChange={e => editTask(t.id, { plannedDate: e.target.value || null })} /></label></div>
          <details className="m-draft-reference"><summary>目标归属与分支</summary><label>归属目标<select value={t.goalId ?? ''} onChange={e => editTask(t.id, { goalId: e.target.value || null, nodeId: null })}><option value="">收集箱</option>{[...workspace.goals, ...draft.goals].map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label><label>分支节点<select value={t.nodeId ?? ''} onChange={e => editTask(t.id, { nodeId: e.target.value || null })}><option value="">直接归属目标</option>{[...workspace.nodes, ...draft.nodes].filter(n => n.goalId === t.goalId).map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label></details>
          {t.status === 'reported_done' && <label className="m-verify"><input type="checkbox" checked={verified.includes(t.id)} onChange={e => { setVerified(v => e.target.checked ? [...v, t.id] : v.filter(x => x !== t.id)); editTask(t.id, { selected: e.target.checked }) }} />我确认这项已经完成（不推断工时）</label>}
          <button className="m-source-toggle" onClick={() => setEvidenceId(evidenceId === t.id ? null : t.id)}><FileText size={12} />{t.status === 'reported_done' ? '完成声明，待核实' : t.evidence.length ? '查看来源' : 'AI 建议'}<CaretDown size={12} /></button>
          {evidenceId === t.id && <div className="m-evidence">{t.evidence.length ? t.evidence.map((e, n) => <blockquote key={n}><small>{e.kind === 'user_report' ? '用户自述' : e.kind === 'assistant_claim' ? '历史助手宣称' : e.kind === 'tool_result' ? '工具记录' : '建议'}</small>{e.quote}</blockquote>) : <p>这是下一步建议，不是已发生的事实。</p>}</div>}
        </div>)}
        {draft.assumptions.length > 0 && <details className="m-assumptions"><summary>查看假设与说明</summary>{draft.assumptions.map((a, i) => <p key={i}>{a}</p>)}</details>}
        <button className="m-button primary m-apply" disabled={busy || !!draft.question || (!count && !draft.goals.length && !draft.nodes.length && !draft.capacity)} onClick={() => void apply()}><Check size={16} />确认安排{count ? ` ${count} 项` : ''}</button>
        <button className="m-link m-discard" disabled={busy} onClick={async () => { try { await onExecute({ type: 'cancel_proposal', id: draft.id }); setDraft(null); setStatus('草案已取消，任务没有改变') } catch (e) { setError(messageOf(e)) } }}>放弃这份草案</button>
      </section>}
    </div>
    <div className="m-assistant-compose">
      <details className="m-context-scope"><summary>本次上下文范围</summary><p>只发送本轮输入、最近 10 条对话、当前草案和最多 30 个活跃/暂停目标、300 个行动及关联节点。不读取历史原文或其他应用。</p>{reviewRange && <p>复盘时包含 {reviewRange.start} 至 {reviewRange.end} 的实际统计与最多 100 项已完成行动，缺失工时不推算。</p>}</details>
      {error && <div className="m-error" role="alert">{error}</div>}
      {(!workspace.preferences.aiConsent || !workspace.preferences.audioConsent) && <div className="m-consent"><label><input type="checkbox" checked={workspace.preferences.aiConsent} onChange={e => void onExecute({ type: 'preferences', changes: { aiConsent: e.target.checked } }).catch(e => setError(messageOf(e)))} />允许将输入与相关目标发送给阿里 AI</label><label><input type="checkbox" checked={workspace.preferences.audioConsent} onChange={e => void onExecute({ type: 'preferences', changes: { audioConsent: e.target.checked } }).catch(e => setError(messageOf(e)))} />允许语音音频发送给阿里识别</label></div>}
      <div className="m-compose-top"><select aria-label="助手模式" value={mode} onChange={e => setMode(e.target.value as AgentInput['mode'])}><option value="plan">安排任务</option><option value="import">整理记录</option><option value="review">回顾进展</option></select><label className="m-file-label" title="选择本地文字记录"><FileText size={16} /><span>导入</span><input type="file" accept=".txt,.md,.json,.jsonl" onChange={e => void readFile(e.target.files?.[0])} /></label><button className={`m-icon-button ${workspace.preferences.speak ? 'active' : ''}`} aria-label={workspace.preferences.speak ? '关闭语音播报' : '开启语音播报'} onClick={() => { stopSpeaking(); void onExecute({ type: 'preferences', changes: { speak: !workspace.preferences.speak } }).catch(e => setError(messageOf(e))) }}><SpeakerHigh size={17} /></button></div>
      <label className="m-sr-only" htmlFor="master-conversation">告诉 Master 你的安排</label><textarea id="master-conversation" ref={inputRef} value={text} onChange={e => setText(e.target.value)} placeholder={mode === 'import' ? '粘贴选中的记录，发送前可以删改…' : '今天想推进什么？也可以直接说。'} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} />
      <div className="m-compose-bottom"><button className={`m-voice-button ${listening ? 'listening' : ''}`} disabled={busy && !listening && !connecting} onClick={() => void toggleVoice()}>{listening || connecting ? <Stop size={17} weight="fill" /> : <Microphone size={19} />}{listening ? '结束并发送' : connecting ? '取消连接' : '开始说话'}</button><span className="m-assistant-status" role="status">{status || 'Enter 发送'}</span>{busy ? <button className="m-send" aria-label="停止生成" onClick={cancel}><Stop size={18} /></button> : <button className="m-send" aria-label="发送给 Master" disabled={!text.trim() || listening || connecting} onClick={() => void send()}><ArrowUp size={20} /></button>}</div>
    </div>
  </aside>
}

function messageOf(e: unknown) { return e instanceof Error ? e.message : String(e) }
