import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Sparkle,
  X,
} from '@phosphor-icons/react'
import { addMonths, differenceInCalendarWeeks, format } from 'date-fns'
import type { GoalCategory, GoalDraft } from '../../domain'
import { useMasterStore } from '../../store/useMasterStore'
import { Button } from '../../components/ui/Button'

const categoryOptions: Array<{ value: GoalCategory; label: string }> = [
  { value: 'career', label: '事业' },
  { value: 'learning', label: '学习' },
  { value: 'health', label: '健康' },
  { value: 'finance', label: '财务' },
  { value: 'family', label: '家庭' },
  { value: 'creative', label: '创作' },
  { value: 'other', label: '其他' },
]

const suggestedElements: Record<GoalCategory, string[]> = {
  career: ['核心能力', '关键成果', '资源与关系', '机会验证'],
  learning: ['知识基础', '专项练习', '反馈纠正', '成果验证'],
  health: ['运动能力', '饮食结构', '睡眠恢复', '周期评估'],
  finance: ['收入能力', '支出结构', '资产配置', '风险保障'],
  family: ['共同时间', '重要关系', '家庭责任', '长期安排'],
  creative: ['内容与能力', '作品产出', '受众验证', '发布系统'],
  other: ['核心能力', '阶段成果', '资源支持', '验证与调整'],
}

const stages = ['目标', '成功标准', '现实条件', '关键要素']

const initialDraft: GoalDraft = {
  title: '',
  description: '',
  category: 'career',
  deadline: format(addMonths(new Date(), 4), 'yyyy-MM-dd'),
  successCriteria: [''],
  constraints: '',
  weeklyHours: 8,
  elements: suggestedElements.career,
}

export function GoalWizard() {
  const onboardingOpen = useMasterStore((state) => state.onboardingOpen)
  const onboardingComplete = useMasterStore(
    (state) => state.onboardingComplete,
  )
  const closeOnboarding = useMasterStore((state) => state.closeOnboarding)
  const finishOnboarding = useMasterStore((state) => state.finishOnboarding)
  const startWithDemo = useMasterStore((state) => state.startWithDemo)
  const [stage, setStage] = useState(0)
  const [draft, setDraft] = useState<GoalDraft>(initialDraft)
  const [attempted, setAttempted] = useState(false)

  const availableWeeks = Math.max(
    1,
    differenceInCalendarWeeks(new Date(draft.deadline), new Date()),
  )
  const availableHours = availableWeeks * draft.weeklyHours

  const stageValid = useMemo(() => {
    if (stage === 0) return draft.title.trim().length >= 4
    if (stage === 1) {
      return (
        draft.deadline.length > 0 &&
        draft.successCriteria.some((criterion) => criterion.trim().length >= 4)
      )
    }
    if (stage === 2) return draft.weeklyHours > 0
    return (
      draft.elements.length >= 3 &&
      draft.elements.length <= 7 &&
      draft.elements.every((element) => element.trim().length >= 2)
    )
  }, [draft, stage])

  if (!onboardingOpen) return null

  const next = () => {
    setAttempted(true)
    if (!stageValid) return
    setAttempted(false)
    if (stage < stages.length - 1) {
      setStage((value) => value + 1)
      return
    }
    finishOnboarding({
      ...draft,
      title: draft.title.trim(),
      successCriteria: draft.successCriteria
        .map((criterion) => criterion.trim())
        .filter(Boolean),
      elements: draft.elements.map((element) => element.trim()),
    })
  }

  const updateCriterion = (index: number, value: string) => {
    setDraft((current) => ({
      ...current,
      successCriteria: current.successCriteria.map((criterion, itemIndex) =>
        itemIndex === index ? value : criterion,
      ),
    }))
  }

  const updateElement = (index: number, value: string) => {
    setDraft((current) => ({
      ...current,
      elements: current.elements.map((element, itemIndex) =>
        itemIndex === index ? value : element,
      ),
    }))
  }

  return (
    <div className="onboarding-layer" role="dialog" aria-modal="true">
      <header className="onboarding-header">
        <button type="button" className="onboarding-brand">
          <span className="brand-mark">M</span>
          <strong>Master</strong>
        </button>
        <div className="onboarding-stage-nav" aria-label="创建目标进度">
          {stages.map((label, index) => (
            <span
              key={label}
              className={
                index === stage
                  ? 'current'
                  : index < stage
                    ? 'complete'
                    : ''
              }
            >
              {index < stage ? <Check size={13} weight="bold" /> : null}
              {label}
            </span>
          ))}
        </div>
        {onboardingComplete ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={closeOnboarding}
            aria-label="关闭"
          >
            <X size={19} />
          </Button>
        ) : (
          <Button variant="ghost" onClick={startWithDemo}>
            先看示例
          </Button>
        )}
      </header>

      <main className="onboarding-main">
        <section className="wizard-copy">
          {stage === 0 ? (
            <>
              <span className="wizard-kicker">先选一个真正重要的方向</span>
              <h1>
                你准备完成
                <br />
                什么？
              </h1>
              <p>
                从一个长期目标开始。它会成为目标地图的中心，也是每日取舍的依据。
              </p>
            </>
          ) : null}
          {stage === 1 ? (
            <>
              <span className="wizard-kicker">把愿望变成可以验收的结果</span>
              <h1>
                怎样才算
                <br />
                真正完成？
              </h1>
              <p>截止时间提供边界，成功标准帮助你判断是否获得了真实结果。</p>
            </>
          ) : null}
          {stage === 2 ? (
            <>
              <span className="wizard-kicker">计划需要尊重现实</span>
              <h1>
                你能稳定投入
                <br />
                多少时间？
              </h1>
              <p>把工作、家庭、休息和突发情况都计算在内，不追求排满。</p>
            </>
          ) : null}
          {stage === 3 ? (
            <>
              <span className="wizard-kicker">找到成功所需的关键条件</span>
              <h1>
                这个目标依赖
                <br />
                哪些要素？
              </h1>
              <p>保留3到7个相对独立的分支。它们应该描述结果条件，而不是动作。</p>
            </>
          ) : null}
        </section>

        <section className="wizard-form-panel">
          {stage === 0 ? (
            <div className="wizard-form">
              <label className="field">
                <span>目标名称</span>
                <input
                  autoFocus
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="例如：在12月前通过雅思考试"
                />
                <small>建议写清结果和时间，不要只写一个方向。</small>
              </label>

              <label className="field">
                <span>为什么现在要做</span>
                <textarea
                  rows={4}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="这件事会带来什么变化？"
                />
              </label>

              <div className="field">
                <span>所属领域</span>
                <div className="category-picker">
                  {categoryOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={
                        draft.category === option.value ? 'selected' : ''
                      }
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          category: option.value,
                          elements: suggestedElements[option.value],
                        }))
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {stage === 1 ? (
            <div className="wizard-form">
              <label className="field">
                <span>计划完成时间</span>
                <input
                  type="date"
                  value={draft.deadline}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      deadline: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="field">
                <span>成功标准</span>
                <div className="criteria-list">
                  {draft.successCriteria.map((criterion, index) => (
                    <div className="criteria-row" key={index}>
                      <span>{index + 1}</span>
                      <input
                        value={criterion}
                        aria-label={`成功标准 ${index + 1}`}
                        onChange={(event) =>
                          updateCriterion(index, event.target.value)
                        }
                        placeholder="写下一个可以观察或验证的结果"
                      />
                      {draft.successCriteria.length > 1 ? (
                        <button
                          type="button"
                          aria-label="删除成功标准"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              successCriteria: current.successCriteria.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            }))
                          }
                        >
                          <X size={16} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                {draft.successCriteria.length < 3 ? (
                  <button
                    type="button"
                    className="inline-add"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        successCriteria: [...current.successCriteria, ''],
                      }))
                    }
                  >
                    <Plus size={15} />
                    增加标准
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {stage === 2 ? (
            <div className="wizard-form">
              <label className="field">
                <span>现实限制</span>
                <textarea
                  rows={5}
                  value={draft.constraints}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      constraints: event.target.value,
                    }))
                  }
                  placeholder="预算、能力、工作、家庭或健康方面有哪些限制？"
                />
              </label>
              <label className="field">
                <span>每周可稳定投入</span>
                <div className="hours-control">
                  <input
                    type="range"
                    min={1}
                    max={40}
                    value={draft.weeklyHours}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        weeklyHours: Number(event.target.value),
                      }))
                    }
                  />
                  <strong>{draft.weeklyHours}小时</strong>
                </div>
              </label>

              <div className="capacity-note">
                <Sparkle size={20} />
                <div>
                  <strong>可规划容量约 {availableHours} 小时</strong>
                  <span>
                    距离目标日期约 {availableWeeks} 周。周计划只使用其中的70%，其余留给生活和变化。
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {stage === 3 ? (
            <div className="wizard-form">
              <div className="element-editor">
                {draft.elements.map((element, index) => (
                  <div className="element-row" key={index}>
                    <span>{index + 1}</span>
                    <input
                      value={element}
                      onChange={(event) =>
                        updateElement(index, event.target.value)
                      }
                      aria-label={`关键要素 ${index + 1}`}
                    />
                    {draft.elements.length > 3 ? (
                      <button
                        type="button"
                        aria-label="删除要素"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            elements: current.elements.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          }))
                        }
                      >
                        <X size={16} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {draft.elements.length < 7 ? (
                <button
                  type="button"
                  className="inline-add"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      elements: [...current.elements, '新的关键要素'],
                    }))
                  }
                >
                  <Plus size={15} />
                  增加要素
                </button>
              ) : null}
              <div className="element-guidance">
                <strong>判断方式</strong>
                <p>
                  每个要素都应该是目标成功不可缺少的条件。合在一起时，应基本覆盖整个目标。
                </p>
              </div>
            </div>
          ) : null}

          {attempted && !stageValid ? (
            <p className="form-error" role="alert">
              请补充当前页面的必要信息后继续。
            </p>
          ) : null}

          <footer className="wizard-actions">
            <Button
              variant="ghost"
              disabled={stage === 0}
              leadingIcon={<ArrowLeft size={17} />}
              onClick={() => {
                setAttempted(false)
                setStage((value) => Math.max(0, value - 1))
              }}
            >
              返回
            </Button>
            <Button
              variant="primary"
              onClick={next}
              leadingIcon={
                stage === stages.length - 1 ? (
                  <Check size={17} weight="bold" />
                ) : undefined
              }
            >
              {stage === stages.length - 1 ? '创建目标地图' : '继续'}
              {stage < stages.length - 1 ? <ArrowRight size={17} /> : null}
            </Button>
          </footer>
        </section>
      </main>
    </div>
  )
}
