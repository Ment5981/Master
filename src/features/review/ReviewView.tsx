import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  ClockCounterClockwise,
  Compass,
  Sparkle,
  Warning,
} from '@phosphor-icons/react'
import { endOfDay, isWithinInterval, parseISO } from 'date-fns'
import type { ReviewPeriod } from '../../domain'
import { Button } from '../../components/ui/Button'
import { ProgressRing } from '../../components/ui/ProgressRing'
import { StatusBadge } from '../../components/ui/StatusBadge'
import {
  formatShortDate,
  getPeriodRange,
  minutesLabel,
} from '../../lib/date'
import {
  computeBranchHealth,
  taskCompletionRate,
} from '../../lib/metrics'
import { useMasterStore } from '../../store/useMasterStore'

const periodLabels: Record<
  ReviewPeriod,
  {
    tab: string
    title: string
    subtitle: string
    focusLabel: string
  }
> = {
  weekly: {
    tab: '周度',
    title: '这一周，时间去了哪里',
    subtitle: '先看事实，再决定下一周怎样配置时间。',
    focusLabel: '下周重点',
  },
  monthly: {
    tab: '月度',
    title: '这个月，哪些投入真正有效',
    subtitle: '检查目标组合、分支失衡和持续出现的计划偏差。',
    focusLabel: '下月重点',
  },
  yearly: {
    tab: '年度',
    title: '这一年，哪些事情改变了你',
    subtitle: '回看成果、关系与生活结构，再决定下一年的方向。',
    focusLabel: '下一年度主题',
  },
}

export function ReviewView() {
  const [period, setPeriod] = useState<ReviewPeriod>('weekly')
  const [wins, setWins] = useState('')
  const [friction, setFriction] = useState('')
  const [insight, setInsight] = useState('')
  const [nextFocusNodeIds, setNextFocusNodeIds] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const savedTimer = useRef<number | null>(null)
  const goals = useMasterStore((state) => state.goals)
  const nodes = useMasterStore((state) => state.nodes)
  const tasks = useMasterStore((state) => state.tasks)
  const reviews = useMasterStore((state) => state.reviews)
  const saveReview = useMasterStore((state) => state.saveReview)
  const setActiveView = useMasterStore((state) => state.setActiveView)
  const selectNode = useMasterStore((state) => state.selectNode)
  const goal = goals[0]
  const rootNode = nodes.find((node) => node.parentId === null)
  const elements = nodes.filter((node) => node.parentId === rootNode?.id)
  const range = getPeriodRange(period)

  const periodTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const value = task.completedAt ?? task.plannedDate
        if (!value) return false
        return isWithinInterval(parseISO(value), {
          start: parseISO(range.start),
          end: endOfDay(parseISO(range.end)),
        })
      }),
    [range.end, range.start, tasks],
  )

  const completed = periodTasks.filter(
    (task) => task.status === 'completed',
  )
  const actualMinutes = completed.reduce(
    (sum, task) => sum + (task.actualMinutes ?? task.estimatedMinutes),
    0,
  )
  const linkedMinutes = completed
    .filter((task) => task.nodeId)
    .reduce(
      (sum, task) => sum + (task.actualMinutes ?? task.estimatedMinutes),
      0,
    )
  const alignment = actualMinutes
    ? Math.round((linkedMinutes / actualMinutes) * 100)
    : 0

  const branchHealth = goal
    ? elements.map((element) => ({
        node: element,
        health: computeBranchHealth(goal, element, nodes, tasks),
      }))
    : []
  const riskBranch = branchHealth.find(
    (item) =>
      item.health.risk === 'blocked' || item.health.risk === 'high',
  )
  const quietBranch = branchHealth.find(
    (item) =>
      item.health.activity === 'stalled' ||
      item.health.activity === 'not_started',
  )
  const largestBranch = [...branchHealth].sort(
    (a, b) => b.health.actualMinutes - a.health.actualMinutes,
  )[0]
  const latestReview = [...reviews]
    .filter((review) => review.period === period)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

  const submit = () => {
    saveReview({
      period,
      rangeStart: range.start,
      rangeEnd: range.end,
      wins,
      friction,
      insight,
      nextFocusNodeIds,
    })
    setSaved(true)
    if (savedTimer.current) window.clearTimeout(savedTimer.current)
    savedTimer.current = window.setTimeout(() => setSaved(false), 3200)
  }

  useEffect(
    () => () => {
      if (savedTimer.current) window.clearTimeout(savedTimer.current)
    },
    [],
  )

  const switchPeriod = (next: ReviewPeriod) => {
    setPeriod(next)
    setWins('')
    setFriction('')
    setInsight('')
    setNextFocusNodeIds([])
  }

  return (
    <div className="page review-page">
      <header className="page-header">
        <div>
          <span className="page-context">回顾是下一阶段的输入</span>
          <h1>{periodLabels[period].title}</h1>
          <p>{periodLabels[period].subtitle}</p>
        </div>
        <div className="segmented-control" role="tablist">
          {(Object.keys(periodLabels) as ReviewPeriod[]).map((item) => (
            <button
              type="button"
              role="tab"
              aria-selected={period === item}
              className={period === item ? 'selected' : ''}
              key={item}
              onClick={() => switchPeriod(item)}
            >
              {periodLabels[item].tab}
            </button>
          ))}
        </div>
      </header>

      <section className="review-period">
        <ClockCounterClockwise size={18} />
        <span>
          {formatShortDate(range.start)} 至 {formatShortDate(range.end)}
        </span>
        {latestReview ? <strong>已有复盘记录</strong> : null}
      </section>

      <section className="review-metrics" aria-label="周期事实">
        <div>
          <small>完成任务</small>
          <strong>{completed.length}</strong>
          <span>共安排 {periodTasks.length} 项</span>
        </div>
        <div>
          <small>投入时间</small>
          <strong>{minutesLabel(actualMinutes)}</strong>
          <span>基于已完成任务</span>
        </div>
        <div>
          <small>计划完成率</small>
          <strong>{taskCompletionRate(periodTasks)}%</strong>
          <span>不包含已取消任务</span>
        </div>
        <div>
          <small>目标关联度</small>
          <strong>{alignment}%</strong>
          <span>投入到长期目标的比例</span>
        </div>
      </section>

      <div className="review-layout">
        <section className="review-insights">
          <div className="section-heading">
            <div>
              <h2>系统观察</h2>
              <p>从投入、停滞和风险中提取少数信号。</p>
            </div>
          </div>

          <div className="insight-list">
            {largestBranch ? (
              <article>
                <Compass size={20} />
                <div>
                  <strong>主要投入在 {largestBranch.node.title}</strong>
                  <p>
                    当前累计投入
                    {minutesLabel(largestBranch.health.actualMinutes)}，进度
                    {largestBranch.health.progress}%。
                  </p>
                </div>
              </article>
            ) : null}
            {riskBranch ? (
              <article className="insight-risk">
                <Warning size={20} />
                <div>
                  <strong>{riskBranch.node.title} 需要先解除风险</strong>
                  <p>存在阻塞或截止压力，继续增加任务可能无法改善结果。</p>
                </div>
              </article>
            ) : null}
            {quietBranch ? (
              <article>
                <Sparkle size={20} />
                <div>
                  <strong>{quietBranch.node.title} 缺少近期行动</strong>
                  <p>下一周期可以安排一个60分钟以内的启动任务。</p>
                </div>
              </article>
            ) : null}
          </div>

          <div className="branch-review-list">
            {branchHealth.map(({ node, health }) => (
              <button
                type="button"
                key={node.id}
                onClick={() => {
                  selectNode(node.id)
                  setActiveView('map')
                }}
              >
                <ProgressRing value={health.progress} size="sm" />
                <span>
                  <strong>{node.title}</strong>
                  <small>
                    {health.completedTasks}/{health.totalTasks}项完成
                  </small>
                </span>
                <StatusBadge
                  kind={
                    health.risk === 'normal' ? health.activity : health.risk
                  }
                />
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </section>

        <section className="review-form-section">
          <div className="section-heading">
            <div>
              <h2>做出下一步决策</h2>
              <p>记录真正影响计划的事实，不需要写成长篇日记。</p>
            </div>
          </div>

          <div className="review-form">
            <label className="field">
              <span>值得保留的成果或做法</span>
              <textarea
                rows={3}
                value={wins}
                onChange={(event) => setWins(event.target.value)}
                placeholder="什么带来了真实推进？"
              />
            </label>
            <label className="field">
              <span>消耗时间或造成阻力的事情</span>
              <textarea
                rows={3}
                value={friction}
                onChange={(event) => setFriction(event.target.value)}
                placeholder="哪些任务反复延期，为什么？"
              />
            </label>
            <label className="field">
              <span>这次复盘后的一个判断</span>
              <textarea
                rows={3}
                value={insight}
                onChange={(event) => setInsight(event.target.value)}
                placeholder="下一阶段需要改变什么？"
              />
            </label>

            <div className="field">
              <span>{periodLabels[period].focusLabel}</span>
              <div className="focus-node-picker">
                {elements.map((element) => {
                  const selected = nextFocusNodeIds.includes(element.id)
                  return (
                    <button
                      type="button"
                      key={element.id}
                      className={selected ? 'selected' : ''}
                      onClick={() =>
                        setNextFocusNodeIds((current) =>
                          selected
                            ? current.filter((id) => id !== element.id)
                            : current.length < 3
                              ? [...current, element.id]
                              : current,
                        )
                      }
                    >
                      {selected ? <Check size={15} weight="bold" /> : null}
                      {element.title}
                    </button>
                  )
                })}
              </div>
              <small>最多选择3个重点分支。</small>
            </div>

            <Button
              variant="primary"
              onClick={submit}
              disabled={!wins.trim() && !friction.trim() && !insight.trim()}
            >
              {saved ? (
                <>
                  <Check size={17} weight="bold" />
                  已保存
                </>
              ) : (
                '保存本次复盘'
              )}
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
