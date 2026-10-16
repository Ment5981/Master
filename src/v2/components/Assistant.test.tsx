// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyWorkspace, reduceCommand } from '../core'
import type { AgentInput, Command, DraftTask, Proposal, Workspace } from '../core/types'
import type { VoiceOptions, VoiceSession } from '../agent/client'
import { Assistant } from './Assistant'

const remote = vi.hoisted(() => ({
  generateProposal: vi.fn(), getHealth: vi.fn(), startVoice: vi.fn(), speakText: vi.fn(), stopSpeaking: vi.fn(),
}))
vi.mock('../agent/client', () => ({ generateProposal: remote.generateProposal, getHealth: remote.getHealth }))
vi.mock('../agent/voice', () => ({ startVoice: remote.startVoice, speakText: remote.speakText, stopSpeaking: remote.stopSpeaking }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
function workspace(consent = true) {
  const state = createEmptyWorkspace()
  state.preferences.aiConsent = consent
  state.preferences.audioConsent = consent
  return state
}
function draftTask(changes: Partial<DraftTask> = {}): DraftTask {
  return { id: 'draft-task', title: '梳理作品集结构', targetTaskId: null, goalId: null, nodeId: null, status: 'todo', estimateMinutes: 25, plannedDate: null, dueDate: null, importance: 'important', urgent: false, evidence: [], selected: true, ...changes }
}
function proposal(state: Workspace, changes: Partial<Proposal> = {}): Proposal {
  return { id: 'proposal-1', revision: 1, baseRevision: state.revision, inputRevision: 1, createdAt: '2026-09-28T09:00:00Z', summary: '先从一项小行动开始。', question: null, assumptions: [], goals: [], nodes: [], tasks: [draftTask()], capacity: null, sources: [], state: 'draft', engine: 'remote', ...changes }
}
function mount(initial = workspace(), executor?: (command: Command, current: Workspace) => Promise<Workspace>) {
  const host = { state: initial, closed: false }
  const execute = vi.fn(async (command: Command) => {
    host.state = executor ? await executor(command, host.state) : reduceCommand(host.state, command)
    if (!host.closed) view.rerender(element())
    return host.state
  })
  function element() {
    return <Assistant workspace={host.state} onExecute={execute} onSettings={vi.fn()} onClose={() => { host.closed = true; view.unmount() }} />
  }
  const view = render(element())
  return {
    host, execute,
    change(command: Command) { act(() => { host.state = reduceCommand(host.state, command); view.rerender(element()) }) },
    commands(type: Command['type']) { return execute.mock.calls.map(([command]) => command).filter(command => command.type === type) },
  }
}
function send(text: string) {
  fireEvent.change(screen.getByLabelText('告诉 Master 你的安排'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: '发送给 Master' }))
}
async function generated(state: Workspace, changes: Partial<Proposal> = {}) {
  remote.generateProposal.mockResolvedValueOnce(proposal(state, changes))
  send('今天先梳理作品集')
  await screen.findByRole('region', { name: '计划草案' })
}
function savedWorkspace(changes: Partial<Proposal> = {}) {
  const state = workspace()
  return reduceCommand(state, { type: 'save_proposal', proposal: proposal(state, changes) })
}

beforeEach(() => {
  for (const fn of Object.values(remote)) fn.mockReset()
  remote.getHealth.mockResolvedValue({ ready: true, ai: true, asr: true, tts: false, provider: 'test', message: 'mock only' })
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Tests must never call the network'))))
})
afterEach(() => {
  cleanup()
  expect(fetch).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('Assistant：授权、提案与用户确认', () => {
  it('未授权文字时不发送目标上下文，也不生成本地任务', async () => {
    const app = mount(workspace(false))
    send('今天想做作品集')
    expect(await screen.findByRole('alert')).toHaveTextContent('先允许发送')
    expect(remote.generateProposal).not.toHaveBeenCalled()
    expect(app.execute).not.toHaveBeenCalled()
    expect(app.host.state.tasks).toHaveLength(0)
  })

  it('文字和音频分别授权：允许文字不等于允许启动麦克风', async () => {
    const state = workspace(); state.preferences.audioConsent = false
    const app = mount(state)
    fireEvent.click(screen.getByRole('button', { name: '开始说话' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('分别授权')
    expect(remote.startVoice).not.toHaveBeenCalled()
    await generated(app.host.state)
    expect(remote.generateProposal).toHaveBeenCalledTimes(1)
  })

  it('潜在密钥在发送前拦截，原输入保留供删除', async () => {
    mount()
    const input = '请检查 api_key=example_secret_for_test_only'
    send(input)
    expect(await screen.findByRole('alert')).toHaveTextContent('可能含密钥或密码')
    expect(remote.generateProposal).not.toHaveBeenCalled()
    expect(screen.getByLabelText('告诉 Master 你的安排')).toHaveValue(input)
  })

  it('生成只持久化草案，不直接创建任务；一次确认才原子应用', async () => {
    const app = mount()
    await generated(app.host.state)
    expect(app.commands('save_proposal')).toHaveLength(1)
    expect(app.commands('apply_proposal')).toHaveLength(0)
    expect(app.host.state.tasks).toHaveLength(0)
    expect(screen.getByText('还未执行')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '确认安排 1 项' }))
    await waitFor(() => expect(app.host.state.tasks).toHaveLength(1))
    expect(app.commands('apply_proposal')).toEqual([{ type: 'apply_proposal', id: 'proposal-1', revision: 1, verifiedTaskIds: [] }])
    expect(app.host.state.proposals[0].state).toBe('applied')
  })

  it('手动修改标题和估时后，确认采用修改版而非模型原版', async () => {
    const app = mount()
    await generated(app.host.state)
    fireEvent.change(screen.getByLabelText('草案任务 1'), { target: { value: '我确认后的清晰标题' } })
    fireEvent.change(screen.getByLabelText('建议分钟'), { target: { value: '55' } })
    fireEvent.click(screen.getByRole('button', { name: '确认安排 1 项' }))
    await waitFor(() => expect(app.host.state.tasks).toHaveLength(1))
    expect(app.host.state.tasks[0]).toMatchObject({ title: '我确认后的清晰标题', estimateMinutes: 55 })
    expect(app.commands('save_proposal')).toHaveLength(2)
    expect(app.commands('apply_proposal')[0]).toMatchObject({ revision: 3 })
  })

  it('当前工作区产生新版本后，旧草案不能覆盖新修改', async () => {
    const app = mount()
    await generated(app.host.state)
    app.change({ type: 'preferences', changes: { theme: 'dark' } })
    fireEvent.click(screen.getByRole('button', { name: '确认安排 1 项' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('计划期间有数据更新')
    expect(app.commands('apply_proposal')).toHaveLength(0)
    expect(app.host.state.tasks).toHaveLength(0)
    expect(app.host.state.preferences.theme).toBe('dark')
  })

  it('生成途中工作区被手改，晚到结果不保存且保留输入', async () => {
    const app = mount(), pending = deferred<Proposal>()
    const original = proposal(app.host.state)
    remote.generateProposal.mockReturnValueOnce(pending.promise)
    send('保留这一句原始安排')
    app.change({ type: 'preferences', changes: { theme: 'dark' } })
    await act(async () => { pending.resolve(original) })
    expect(await screen.findByRole('alert')).toHaveTextContent('你刚刚修改了工作区')
    expect(app.commands('save_proposal')).toHaveLength(0)
    expect(screen.getByLabelText('告诉 Master 你的安排')).toHaveValue('保留这一句原始安排')
  })

  it('泛泛的“好的”不构成执行授权', async () => {
    const app = mount(savedWorkspace()), pending = deferred<Proposal>()
    remote.generateProposal.mockReturnValueOnce(pending.promise)
    send('好的')
    await waitFor(() => expect(remote.generateProposal).toHaveBeenCalledTimes(1))
    expect(app.commands('apply_proposal')).toHaveLength(0)
    expect(app.host.state.tasks).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }))
    await act(async () => { pending.resolve(proposal(app.host.state)) })
    expect(app.commands('save_proposal')).toHaveLength(0)
  })

  it('“按这版安排”只确认当前可见草案，不再次调用模型', async () => {
    const app = mount(savedWorkspace())
    send('按这版安排。')
    await waitFor(() => expect(app.host.state.tasks).toHaveLength(1))
    expect(remote.generateProposal).not.toHaveBeenCalled()
    expect(app.commands('apply_proposal')[0]).toMatchObject({ id: 'proposal-1', revision: 1 })
  })

  it('整理记录模式中的“按这版安排”是来源文字，不是对旧草案的授权', async () => {
    const app = mount(savedWorkspace()), pending = deferred<Proposal>()
    remote.generateProposal.mockReturnValueOnce(pending.promise)
    fireEvent.change(screen.getByLabelText('助手模式'), { target: { value: 'import' } })
    send('按这版安排')
    await waitFor(() => expect(remote.generateProposal).toHaveBeenCalledTimes(1))
    expect(remote.generateProposal.mock.calls[0][0]).toMatchObject({ text: '按这版安排', mode: 'import' })
    expect(app.commands('apply_proposal')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }))
    await act(async () => { pending.resolve(proposal(app.host.state)) })
    expect(app.host.state.tasks).toHaveLength(0)
  })

  it('明确唯一任务的有限时长修改与确认，采用该修改版一次应用', async () => {
    const app = mount(savedWorkspace())
    send('把第一项改成15分钟，按这版安排')
    await waitFor(() => expect(app.host.state.tasks).toHaveLength(1))
    expect(app.host.state.tasks[0].estimateMinutes).toBe(15)
    expect(app.commands('save_proposal')).toHaveLength(1)
    expect(app.commands('apply_proposal')).toHaveLength(1)
    expect(remote.generateProposal).not.toHaveBeenCalled()
  })

  it('历史完成默认未采纳；用户逐项核实后才完成且不捏造工时', async () => {
    const app = mount()
    await generated(app.host.state, { tasks: [draftTask({ status: 'reported_done', selected: true })] })
    expect(screen.getByRole('checkbox', { name: '采纳 梳理作品集结构' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: '确认安排' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: '我确认这项已经完成（不推断工时）' }))
    fireEvent.click(screen.getByRole('button', { name: '确认安排 1 项' }))
    await waitFor(() => expect(app.host.state.tasks).toHaveLength(1))
    expect(app.commands('apply_proposal')[0]).toMatchObject({ verifiedTaskIds: ['draft-task'] })
    expect(app.host.state.tasks[0].status).toBe('done')
    expect(app.host.state.tasks[0].completedAt).toBeNull()
    expect(app.host.state.timeEntries).toHaveLength(0)
  })

  it('保存失败时不能误报已安排，草案与手改继续可见', async () => {
    const state = savedWorkspace()
    const app = mount(state, async () => { throw new Error('本机存储已满') })
    fireEvent.change(screen.getByLabelText('草案任务 1'), { target: { value: '尚未丢失的修改' } })
    fireEvent.click(screen.getByRole('button', { name: '确认安排 1 项' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('本机存储已满')
    expect(screen.getByLabelText('草案任务 1')).toHaveValue('尚未丢失的修改')
    expect(app.commands('apply_proposal')).toHaveLength(0)
    expect(app.host.state.tasks).toHaveLength(0)
  })
})

describe('Assistant：麦克风及迟到响应安全', () => {
  it('会话中撤回音频授权会中止采集；后续转写不发送', async () => {
    const capture = { stop: vi.fn(), cancel: vi.fn() }
    remote.startVoice.mockResolvedValueOnce(capture)
    const app = mount()
    fireEvent.click(screen.getByRole('button', { name: '开始说话' }))
    await screen.findByRole('button', { name: '结束并发送' })
    const options = remote.startVoice.mock.calls[0][0] as VoiceOptions
    app.change({ type: 'preferences', changes: { audioConsent: false } })
    expect(options.signal?.aborted).toBe(true)
    expect(capture.cancel).toHaveBeenCalled()
    act(() => options.onTranscript('撤回授权之后的内容', true))
    expect(remote.generateProposal).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '结束并发送' })).not.toBeInTheDocument()
  })

  it('生成中撤回文字授权会取消请求，迟到结果不保存', async () => {
    const app = mount(), pending = deferred<Proposal>()
    const original = proposal(app.host.state)
    remote.generateProposal.mockReturnValueOnce(pending.promise)
    send('这段输入随后撤回授权')
    const options = remote.generateProposal.mock.calls[0][1]
    app.change({ type: 'preferences', changes: { aiConsent: false } })
    expect(options.signal.aborted).toBe(true)
    await act(async () => { pending.resolve(original) })
    expect(app.commands('save_proposal')).toHaveLength(0)
    expect(screen.getByLabelText('告诉 Master 你的安排')).toHaveValue('这段输入随后撤回授权')
  })

  it('重新授权后可发起新请求，旧请求晚到不会取消或覆盖新草案', async () => {
    const app = mount(), oldRun = deferred<Proposal>(), newRun = deferred<Proposal>()
    const oldProposal = proposal(app.host.state)
    remote.generateProposal.mockReturnValueOnce(oldRun.promise).mockReturnValueOnce(newRun.promise)
    send('旧的安排')
    const oldSignal = remote.generateProposal.mock.calls[0][1].signal as AbortSignal
    app.change({ type: 'preferences', changes: { aiConsent: false } })
    expect(oldSignal.aborted).toBe(true)
    app.change({ type: 'preferences', changes: { aiConsent: true } })
    send('重新授权后的安排')
    const input = remote.generateProposal.mock.calls[1][0] as AgentInput
    const newSignal = remote.generateProposal.mock.calls[1][1].signal as AbortSignal
    await act(async () => { oldRun.resolve(oldProposal) })
    expect(newSignal.aborted).toBe(false)
    expect(app.commands('save_proposal')).toHaveLength(0)
    expect(screen.getByRole('button', { name: '停止生成' })).toBeVisible()
    await act(async () => { newRun.resolve(proposal(app.host.state, { id: 'new-proposal', inputRevision: input.inputRevision, tasks: [draftTask({ title: '新授权后的任务' })] })) })
    expect(await screen.findByLabelText('草案任务 1')).toHaveValue('新授权后的任务')
    expect(app.commands('save_proposal')).toHaveLength(1)
    expect(app.host.state.proposals[0].id).toBe('new-proposal')
  })

  it('重新授权音频后可重开麦克风，旧转写不干扰新会话', async () => {
    const oldCapture = { stop: vi.fn(), cancel: vi.fn() }, newCapture = { stop: vi.fn(), cancel: vi.fn() }
    remote.startVoice.mockResolvedValueOnce(oldCapture).mockResolvedValueOnce(newCapture)
    const app = mount()
    fireEvent.click(screen.getByRole('button', { name: '开始说话' }))
    await screen.findByRole('button', { name: '结束并发送' })
    const oldOptions = remote.startVoice.mock.calls[0][0] as VoiceOptions
    app.change({ type: 'preferences', changes: { audioConsent: false } })
    app.change({ type: 'preferences', changes: { audioConsent: true } })
    fireEvent.click(screen.getByRole('button', { name: '开始说话' }))
    await screen.findByRole('button', { name: '结束并发送' })
    const newOptions = remote.startVoice.mock.calls[1][0] as VoiceOptions
    act(() => { newOptions.onTranscript('新的转写', false); oldOptions.onTranscript('迟到的旧转写', true) })
    expect(screen.getByLabelText('告诉 Master 你的安排')).toHaveValue('新的转写')
    expect(newOptions.signal?.aborted).toBe(false)
    expect(remote.generateProposal).not.toHaveBeenCalled()
  })

  it('麦克风仍在启动时关闭助手会 abort；晚到会话被取消而不复活', async () => {
    const app = mount(), pending = deferred<VoiceSession>()
    remote.startVoice.mockReturnValueOnce(pending.promise)
    fireEvent.click(screen.getByRole('button', { name: '开始说话' }))
    expect(screen.getByRole('button', { name: '取消连接' })).toBeVisible()
    const options = remote.startVoice.mock.calls[0][0] as VoiceOptions
    fireEvent.click(screen.getByRole('button', { name: '关闭助手' }))
    expect(options.signal?.aborted).toBe(true)
    const capture = { stop: vi.fn(), cancel: vi.fn() }
    await act(async () => { pending.resolve(capture); options.onTranscript('迟到的转写', true) })
    expect(capture.cancel).toHaveBeenCalledTimes(1)
    expect(remote.generateProposal).not.toHaveBeenCalled()
    expect(app.execute).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Master 助手')).not.toBeInTheDocument()
  })

  it('流式部分结果不执行；结束录音后只提交最终转写', async () => {
    const capture = { stop: vi.fn().mockResolvedValue('最终安排：先写作品集提纲'), cancel: vi.fn() }
    remote.startVoice.mockResolvedValueOnce(capture)
    const app = mount()
    remote.generateProposal.mockImplementationOnce(async (input: AgentInput) => proposal(app.host.state, { inputRevision: input.inputRevision }))
    fireEvent.click(screen.getByRole('button', { name: '开始说话' }))
    await screen.findByRole('button', { name: '结束并发送' })
    const options = remote.startVoice.mock.calls[0][0] as VoiceOptions
    act(() => options.onTranscript('临时转写可能变化', false))
    expect(screen.getByLabelText('告诉 Master 你的安排')).toHaveValue('临时转写可能变化')
    expect(remote.generateProposal).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '结束并发送' }))
    await screen.findByRole('region', { name: '计划草案' })
    expect(capture.stop).toHaveBeenCalledTimes(1)
    expect(remote.generateProposal).toHaveBeenCalledTimes(1)
    expect(remote.generateProposal.mock.calls[0][0].text).toBe('最终安排：先写作品集提纲')
    expect(app.commands('apply_proposal')).toHaveLength(0)
  })

  it('已取消的模型结果不会在关闭后保存或播报', async () => {
    const state = workspace(); state.preferences.speak = true
    const app = mount(state), pending = deferred<Proposal>()
    remote.generateProposal.mockReturnValueOnce(pending.promise)
    send('稍后才会返回的计划')
    const options = remote.generateProposal.mock.calls[0][1]
    fireEvent.click(screen.getByRole('button', { name: '关闭助手' }))
    expect(options.signal.aborted).toBe(true)
    await act(async () => { pending.resolve(proposal(state)) })
    expect(app.execute).not.toHaveBeenCalled()
    expect(remote.speakText).not.toHaveBeenCalled()
  })

  it('关闭后迟到的草案保存不得再次播报', async () => {
    const state = workspace(); state.preferences.speak = true
    const pendingSave = deferred<Workspace>()
    const app = mount(state, () => pendingSave.promise)
    remote.generateProposal.mockResolvedValueOnce(proposal(state))
    send('先整理再让我确认')
    await waitFor(() => expect(app.commands('save_proposal')).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: '关闭助手' }))
    await act(async () => { pendingSave.resolve(reduceCommand(state, { type: 'save_proposal', proposal: proposal(state) })) })
    expect(remote.speakText).not.toHaveBeenCalled()
    expect(app.commands('apply_proposal')).toHaveLength(0)
  })

  it('取消旧录音的最终转写后重连，旧 finally 不能清掉新连接状态', async () => {
    const stop = deferred<string>(), nextStart = deferred<VoiceSession>()
    remote.startVoice.mockResolvedValueOnce({ stop: () => stop.promise, cancel: vi.fn() }).mockReturnValueOnce(nextStart.promise)
    mount()
    fireEvent.click(screen.getByRole('button', { name: '开始说话' }))
    fireEvent.click(await screen.findByRole('button', { name: '结束并发送' }))
    fireEvent.click(screen.getByRole('button', { name: '取消连接' }))
    fireEvent.click(screen.getByRole('button', { name: '开始说话' }))
    await act(async () => { stop.resolve('旧录音不应发送') })
    expect(screen.getByRole('button', { name: '取消连接' })).toBeVisible()
    expect(remote.generateProposal).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '关闭助手' }))
    const capture = { stop: vi.fn(), cancel: vi.fn() }
    await act(async () => { nextStart.resolve(capture) })
    expect(capture.cancel).toHaveBeenCalledTimes(1)
  })
})
