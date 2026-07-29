"use client";

import {
  ArrowRight,
  CalendarBlank,
  ChartDonut,
  Check,
  Code,
  Clock,
  DotsThree,
  DownloadSimple,
  FileText,
  Funnel,
  Leaf,
  MapTrifold,
  Minus,
  Plus,
  RocketLaunch,
  SlidersHorizontal,
  Sparkle,
  Sun,
  Target,
  UserCircle,
  Users,
  X,
} from "@phosphor-icons/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Tab = "today" | "map" | "plan" | "review" | "me";
type Range = "today" | "week";
type Quadrant = "important-urgent" | "important" | "urgent" | "later";
type Risk = "calm" | "watch" | "risk";

type Factor = {
  id: string;
  title: string;
  note: string;
  progress: number;
  risk: Risk;
  hours: number;
  milestones: string[];
};

type Task = {
  id: string;
  title: string;
  nodeId: string;
  quadrant: Quadrant;
  plan: Range;
  minutes: number;
  completed: boolean;
};

type Goal = {
  title: string;
  deadline: string;
  successCriteria: string;
  constraints: string;
  weeklyHours: number;
  bufferPercent: number;
  progress: number;
  factors: Factor[];
};

type State = {
  version: 1;
  goal: Goal;
  tasks: Task[];
  reviewNotes: { wins: string; friction: string; next: string };
};

const INITIAL: State = {
  version: 1,
  goal: {
    title: "完成 Master V1 发布验证",
    deadline: "2026-09-30",
    successCriteria:
      "完成目标地图、四象限任务、动态进度与周期复盘的真实闭环，并邀请 5 位用户连续体验两周。",
    constraints:
      "每周最多投入 12 小时；优先手机端；第一版保持功能克制，不扩展团队协作。",
    weeklyHours: 12,
    bufferPercent: 25,
    progress: 46,
    factors: [
      {
        id: "product",
        title: "产品定义",
        note: "明确核心场景、拆解规则与验证标准。",
        progress: 67,
        risk: "calm",
        hours: 3.2,
        milestones: ["核心流程确定", "V1 范围冻结"],
      },
      {
        id: "experience",
        title: "核心体验",
        note: "让目标拆解、任务安排和完成反馈自然连成一条线。",
        progress: 50,
        risk: "watch",
        hours: 2.4,
        milestones: ["手机原型", "交互走查"],
      },
      {
        id: "development",
        title: "设计开发",
        note: "构建稳定、可保存且适合真实验证的产品基础。",
        progress: 38,
        risk: "risk",
        hours: 4.1,
        milestones: ["数据层", "核心闭环"],
      },
      {
        id: "validation",
        title: "用户验证",
        note: "找到真实使用阻力，验证时间地图是否优于任务清单。",
        progress: 29,
        risk: "watch",
        hours: 1.1,
        milestones: ["招募体验者", "两周反馈"],
      },
      {
        id: "launch",
        title: "发布上线",
        note: "以稳定、克制的方式完成发布，并建立首轮反馈入口。",
        progress: 24,
        risk: "calm",
        hours: 1.2,
        milestones: ["发布检查", "首批用户进入"],
      },
    ],
  },
  tasks: [
    { id: "t1", title: "冻结 V1 核心范围", nodeId: "product", quadrant: "important-urgent", plan: "today", minutes: 45, completed: true },
    { id: "t2", title: "完成手机端目标地图", nodeId: "experience", quadrant: "important-urgent", plan: "today", minutes: 90, completed: false },
    { id: "t3", title: "打通任务与节点进度", nodeId: "development", quadrant: "important", plan: "today", minutes: 75, completed: false },
    { id: "t4", title: "整理首轮访谈提纲", nodeId: "validation", quadrant: "important", plan: "today", minutes: 40, completed: false },
    { id: "t5", title: "确认数据保存策略", nodeId: "development", quadrant: "urgent", plan: "today", minutes: 30, completed: true },
    { id: "t6", title: "优化节点详情层级", nodeId: "experience", quadrant: "important", plan: "week", minutes: 60, completed: false },
    { id: "t7", title: "邀请 5 位体验用户", nodeId: "validation", quadrant: "important", plan: "week", minutes: 50, completed: false },
    { id: "t8", title: "整理产品说明文档", nodeId: "product", quadrant: "later", plan: "week", minutes: 35, completed: false },
  ],
  reviewNotes: {
    wins: "目标范围比上周更清晰，核心页面已完成视觉定向。",
    friction: "设计开发分支投入较多，但数据保存仍是截止风险。",
    next: "下周减少视觉微调，把 60% 的可用时间放到核心闭环。",
  },
};

const NAV = [
  { id: "today" as Tab, label: "今天", Icon: Sun },
  { id: "map" as Tab, label: "地图", Icon: MapTrifold },
  { id: "plan" as Tab, label: "计划", Icon: CalendarBlank },
  { id: "review" as Tab, label: "复盘", Icon: ChartDonut },
  { id: "me" as Tab, label: "我的", Icon: UserCircle },
];

const QUADRANTS = [
  { id: "important-urgent" as Quadrant, label: "重要且紧急", tip: "今天必须推动" },
  { id: "important" as Quadrant, label: "重要不紧急", tip: "为长期目标留时间" },
  { id: "urgent" as Quadrant, label: "不重要但紧急", tip: "快速处理或委托" },
  { id: "later" as Quadrant, label: "不重要不紧急", tip: "减少或暂缓" },
];

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type MapPoint = { x: number; y: number };

const REFERENCE_POSITIONS: Record<number, MapPoint[]> = {
  3: [{ x: 500, y: 105 }, { x: 205, y: 315 }, { x: 795, y: 315 }],
  4: [{ x: 500, y: 105 }, { x: 190, y: 290 }, { x: 810, y: 290 }, { x: 500, y: 565 }],
  5: [
    { x: 500, y: 105 },
    { x: 185, y: 285 },
    { x: 815, y: 285 },
    { x: 230, y: 555 },
    { x: 785, y: 555 },
  ],
};

function mapPositions(total: number): MapPoint[] {
  if (REFERENCE_POSITIONS[total]) return REFERENCE_POSITIONS[total];
  return Array.from({ length: total }, (_, index) => {
    const angle = -90 + index * (360 / total);
    const radians = angle * (Math.PI / 180);
    return {
      x: 500 + Math.cos(radians) * 350,
      y: 380 + Math.sin(radians) * 245,
    };
  });
}

function connectorGeometry(point: MapPoint) {
  const center = { x: 500, y: 400 };
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / distance;
  const uy = dy / distance;
  const start = { x: center.x + ux * 108, y: center.y + uy * 108 };
  const capsuleRadius =
    1 / Math.sqrt((ux * ux) / (145 * 145) + (uy * uy) / (47 * 47));
  const end = {
    x: point.x - ux * capsuleRadius,
    y: point.y - uy * capsuleRadius,
  };
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const c1 = horizontal
    ? { x: start.x + dx * 0.34, y: start.y }
    : { x: start.x, y: start.y + dy * 0.34 };
  const c2 = horizontal
    ? { x: end.x - dx * 0.28, y: end.y }
    : { x: end.x, y: end.y - dy * 0.28 };
  return {
    path: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
    port: {
      left: `${((145 + end.x - point.x) / 290) * 100}%`,
      top: `${((47 + end.y - point.y) / 94) * 100}%`,
    } as React.CSSProperties,
  };
}

function normalizeState(value: State): State {
  const legacyIds = ["product", "experience", "development", "validation"];
  const isLegacyDemo =
    value.goal.factors.length === 4 &&
    legacyIds.every((id) => value.goal.factors.some((factor) => factor.id === id));
  if (!isLegacyDemo) return value;
  return {
    ...value,
    goal: {
      ...value.goal,
      factors: [...value.goal.factors, clone(INITIAL.goal.factors[4])],
    },
  };
}

export function MasterApp({
  user,
}: {
  user: { displayName: string; email: string };
}) {
  const [tab, setTab] = useState<Tab>("map");
  const [range, setRange] = useState<Range>("today");
  const [state, setState] = useState<State>(() => clone(INITIAL));
  const [selectedId, setSelectedId] = useState("development");
  const [taskOpen, setTaskOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [goalDraft, setGoalDraft] = useState<Goal>(() => clone(INITIAL.goal));
  const [taskDraft, setTaskDraft] = useState({
    title: "",
    nodeId: "development",
    quadrant: "important" as Quadrant,
    plan: "today" as Range,
    minutes: 45,
  });
  const [save, setSave] = useState<"loading" | "saving" | "saved" | "error">("loading");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/workspace")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as { state: State | null; updatedAt: string | null };
      })
      .then((data) => {
        if (!live) return;
        if (data.state?.version === 1) {
          const nextState = normalizeState(data.state);
          setState(nextState);
          setGoalDraft(nextState.goal);
          setSelectedId(nextState.goal.factors.find((item) => item.id === "development")?.id ?? nextState.goal.factors[0]?.id ?? "");
        }
        setSavedAt(data.updatedAt);
        setSave("saved");
      })
      .catch(() => live && setSave("error"))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSave("saving");
      fetch("/api/workspace", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error();
          return (await response.json()) as { updatedAt: string };
        })
        .then((data) => {
          setSavedAt(data.updatedAt);
          setSave("saved");
        })
        .catch(() => setSave("error"));
    }, 650);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, loaded]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const factor = state.goal.factors.find((item) => item.id === selectedId) ?? state.goal.factors[0];
  const visibleTasks = state.tasks.filter((task) => task.plan === range);
  const allocation = useMemo(
    () =>
      state.goal.factors.map((item) => ({
        ...item,
        minutes: state.tasks
          .filter((task) => task.nodeId === item.id)
          .reduce((sum, task) => sum + task.minutes, 0),
      })),
    [state],
  );

  const mutate = (change: (draft: State) => void) =>
    setState((current) => {
      const draft = clone(current);
      change(draft);
      return draft;
    });

  const recalc = (draft: State) => {
    draft.goal.factors = draft.goal.factors.map((item) => {
      const linked = draft.tasks.filter((task) => task.nodeId === item.id);
      if (!linked.length) return item;
      const progress = Math.round(
        (linked.filter((task) => task.completed).length / linked.length) * 100,
      );
      const risk: Risk = progress >= 75 ? "calm" : progress >= 40 ? "watch" : "risk";
      return { ...item, progress, risk };
    });
    draft.goal.progress = Math.round(
      draft.goal.factors.reduce((sum, item) => sum + item.progress, 0) /
        Math.max(draft.goal.factors.length, 1),
    );
  };

  const toggleTask = (id: string) => {
    let message = "";
    mutate((draft) => {
      const task = draft.tasks.find((item) => item.id === id);
      if (!task) return;
      const before = draft.goal.factors.find((item) => item.id === task.nodeId)?.progress ?? 0;
      task.completed = !task.completed;
      recalc(draft);
      const after = draft.goal.factors.find((item) => item.id === task.nodeId);
      message = task.completed
        ? `已完成。${after?.title}进度 ${before}% → ${after?.progress}%`
        : "任务已恢复，相关进度已重新计算。";
    });
    setToast(message);
  };

  const openTask = (nodeId?: string) => {
    setTaskDraft((current) => ({
      ...current,
      nodeId: nodeId ?? factor?.id ?? state.goal.factors[0]?.id,
      plan: range,
    }));
    setTaskOpen(true);
  };

  const addTask = (event: FormEvent) => {
    event.preventDefault();
    if (!taskDraft.title.trim()) return;
    mutate((draft) => {
      draft.tasks.push({
        ...taskDraft,
        id: `task-${Date.now()}`,
        title: taskDraft.title.trim(),
        completed: false,
      });
      recalc(draft);
    });
    setTaskOpen(false);
    setTaskDraft((current) => ({ ...current, title: "" }));
    setToast("任务已加入，并关联到目标分支。");
  };

  const editGoal = () => {
    setGoalDraft(clone(state.goal));
    setStep(1);
    setGoalOpen(true);
  };

  const navigate = (id: Tab) => {
    if (id === "today") setRange("today");
    if (id === "plan") setRange("week");
    setTab(id);
  };

  const saveGoal = () => {
    if (!goalDraft.title.trim() || goalDraft.factors.length < 3) return;
    mutate((draft) => {
      draft.goal = goalDraft;
      recalc(draft);
    });
    setSelectedId(goalDraft.factors[0]?.id ?? "");
    setGoalOpen(false);
    setToast("目标地图已更新，新的时间配置开始生效。");
  };

  return (
    <div className="master-shell">
      <aside className="desktop-sidebar">
        <div className="brand-wordmark">Master</div>
        <nav className="side-nav">
          {NAV.map(({ id, label, Icon }) => (
            <button key={id} className={`nav-item ${tab === id ? "active" : ""}`} onClick={() => navigate(id)}>
              <Icon size={20} weight="regular" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className={`sync-dot ${save}`} />
          {save === "saved" ? "已永久保存" : save === "error" ? "等待重新连接" : "正在保存"}
        </div>
      </aside>

      <header className="mobile-header">
        <div className="brand-wordmark">Master</div>
        <button className="icon-button" aria-label="添加任务" onClick={() => openTask()}>
          <Plus size={20} />
        </button>
      </header>

      <main className="app-stage">
        {tab === "map" && (
          <MapView
            state={state}
            factor={factor}
            selectedId={selectedId}
            select={setSelectedId}
            toggle={toggleTask}
            add={openTask}
            edit={editGoal}
          />
        )}
        {(tab === "today" || tab === "plan") && (
          <TodayView
            state={state}
            range={range}
            setRange={setRange}
            tasks={visibleTasks}
            toggle={toggleTask}
            add={() => openTask()}
          />
        )}
        {tab === "review" && (
          <ReviewView
            state={state}
            allocation={allocation}
            update={(field, value) =>
              mutate((draft) => {
                draft.reviewNotes[field] = value;
              })
            }
          />
        )}
        {tab === "me" && (
          <ProfileView
            user={user}
            state={state}
            save={save}
            savedAt={savedAt}
            reset={() => {
              setState(clone(INITIAL));
              setSelectedId("development");
              setToast("示例目标已恢复。");
            }}
          />
        )}
      </main>

      <nav className="mobile-nav">
        {NAV.map(({ id, label, Icon }) => (
          <button key={id} className={`mobile-nav-item ${tab === id ? "active" : ""}`} onClick={() => navigate(id)}>
            <Icon size={21} weight="regular" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {taskOpen && (
        <Modal title="添加一项真实可执行的任务" subtitle="任务会进入四象限，并直接影响关联分支的进度。" close={() => setTaskOpen(false)}>
          <form className="form-stack" onSubmit={addTask}>
            <Field label="任务名称">
              <input
                autoFocus
                value={taskDraft.title}
                placeholder="例如：完成首轮手机交互测试"
                onChange={(e) => setTaskDraft({ ...taskDraft, title: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label="关联分支">
                <select value={taskDraft.nodeId} onChange={(e) => setTaskDraft({ ...taskDraft, nodeId: e.target.value })}>
                  {state.goal.factors.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              </Field>
              <Field label="放入计划">
                <select value={taskDraft.plan} onChange={(e) => setTaskDraft({ ...taskDraft, plan: e.target.value as Range })}>
                  <option value="today">今日计划</option>
                  <option value="week">本周计划</option>
                </select>
              </Field>
            </div>
            <Field label="四象限">
              <div className="choice-grid">
                {QUADRANTS.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`choice-card ${taskDraft.quadrant === item.id ? "selected" : ""}`}
                    onClick={() => setTaskDraft({ ...taskDraft, quadrant: item.id })}
                  >
                    <strong>{item.label}</strong><small>{item.tip}</small>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="预计耗时">
              <div className="duration-row">
                {[25, 45, 60, 90].map((minutes) => (
                  <button
                    type="button"
                    key={minutes}
                    className={`duration-pill ${taskDraft.minutes === minutes ? "selected" : ""}`}
                    onClick={() => setTaskDraft({ ...taskDraft, minutes })}
                  >
                    {minutes} 分钟
                  </button>
                ))}
              </div>
            </Field>
            <button className="primary-button full-width" type="submit">加入计划 <ArrowRight size={17} /></button>
          </form>
        </Modal>
      )}

      {goalOpen && (
        <Modal title="重新看清这个目标" subtitle={`第 ${step} 步，共 3 步`} close={() => setGoalOpen(false)} wide>
          <div className="wizard-progress">{[1, 2, 3].map((n) => <span className={n <= step ? "active" : ""} key={n} />)}</div>
          {step === 1 && (
            <div className="form-stack">
              <WizardIntro Icon={Target} title="先定义结果，不急着列任务" text="一个好目标必须有清晰终点、时间边界和可验证的成功标准。" />
              <Field label="中心目标"><input value={goalDraft.title} onChange={(e) => setGoalDraft({ ...goalDraft, title: e.target.value })} /></Field>
              <Field label="完成时间"><input type="date" value={goalDraft.deadline} onChange={(e) => setGoalDraft({ ...goalDraft, deadline: e.target.value })} /></Field>
              <Field label="什么结果代表真正完成"><textarea rows={3} value={goalDraft.successCriteria} onChange={(e) => setGoalDraft({ ...goalDraft, successCriteria: e.target.value })} /></Field>
            </div>
          )}
          {step === 2 && (
            <div className="form-stack">
              <WizardIntro Icon={Leaf} title="给现实留位置" text="计划不是把时间填满，而是保护重要投入，同时容纳生活和意外。" />
              <div className="form-grid">
                <Field label="每周可投入时间"><input type="number" min={1} max={80} value={goalDraft.weeklyHours} onChange={(e) => setGoalDraft({ ...goalDraft, weeklyHours: Number(e.target.value) })} /></Field>
                <Field label="保留弹性时间">
                  <select value={goalDraft.bufferPercent} onChange={(e) => setGoalDraft({ ...goalDraft, bufferPercent: Number(e.target.value) })}>
                    {[15, 20, 25, 30].map((n) => <option key={n} value={n}>{n}%</option>)}
                  </select>
                </Field>
              </div>
              <Field label="现实限制"><textarea rows={4} value={goalDraft.constraints} onChange={(e) => setGoalDraft({ ...goalDraft, constraints: e.target.value })} /></Field>
              <div className="buffer-note"><Clock size={19} />每周将保留约 {Math.round(goalDraft.weeklyHours * goalDraft.bufferPercent / 100)} 小时，用于休息、家庭和突发事项。</div>
            </div>
          )}
          {step === 3 && (
            <div className="form-stack">
              <WizardIntro Icon={MapTrifold} title="找到 3-7 个决定性要素" text="它们应共同覆盖目标成功的必要条件，而不是普通任务分类。" />
              <div className="factor-editor-list">
                {goalDraft.factors.map((item, index) => (
                  <div className="factor-editor-row" key={item.id}>
                    <span className="factor-index">{index + 1}</span>
                    <input
                      aria-label={`要素 ${index + 1}`}
                      value={item.title}
                      onChange={(e) => setGoalDraft({ ...goalDraft, factors: goalDraft.factors.map((f) => f.id === item.id ? { ...f, title: e.target.value } : f) })}
                    />
                    <button
                      type="button"
                      className="icon-button subtle"
                      disabled={goalDraft.factors.length <= 3}
                      onClick={() => setGoalDraft({ ...goalDraft, factors: goalDraft.factors.filter((f) => f.id !== item.id) })}
                      aria-label={`删除${item.title}`}
                    ><X size={16} /></button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={goalDraft.factors.length >= 7}
                onClick={() => setGoalDraft({
                  ...goalDraft,
                  factors: [...goalDraft.factors, {
                    id: `factor-${Date.now()}`,
                    title: `关键要素 ${goalDraft.factors.length + 1}`,
                    note: "说明这个要素为什么决定目标能否实现。",
                    progress: 0,
                    risk: "watch",
                    hours: 0,
                    milestones: ["第一个里程碑"],
                  }],
                })}
              ><Plus size={16} />增加关键要素</button>
            </div>
          )}
          <div className="wizard-actions">
            {step > 1 ? <button className="secondary-button" onClick={() => setStep(step - 1)}>上一步</button> : <span />}
            {step < 3
              ? <button className="primary-button" onClick={() => setStep(step + 1)}>继续 <ArrowRight size={17} /></button>
              : <button className="primary-button" onClick={saveGoal}>生成目标地图 <Sparkle size={17} /></button>}
          </div>
        </Modal>
      )}

      {toast && <div className="feedback-toast" role="status"><span><Check size={14} weight="bold" /></span>{toast}</div>}
    </div>
  );
}

function MapView({
  state, factor, selectedId, select, toggle, add, edit,
}: {
  state: State;
  factor: Factor;
  selectedId: string;
  select: (id: string) => void;
  toggle: (id: string) => void;
  add: (id?: string) => void;
  edit: () => void;
}) {
  const [zoom, setZoom] = useState(100);
  const [riskOnly, setRiskOnly] = useState(false);
  const [detailVisible, setDetailVisible] = useState(true);
  const linked = state.tasks.filter((task) => task.nodeId === factor?.id);
  const risk = { calm: "节奏稳定", watch: "需要关注", risk: "存在风险" }[factor?.risk ?? "watch"];
  const positions = mapPositions(state.goal.factors.length);
  const completed = state.tasks.filter((task) => task.completed).length;
  const inProgress = state.tasks.filter((task) => !task.completed).length;
  const riskCount = state.goal.factors.filter((item) => item.risk === "risk").length;
  const linkedAtRisk = factor?.risk === "risk" ? linked.filter((task) => !task.completed).length : 0;
  const blocked = linked.filter((task) => !task.completed && task.quadrant === "later").length;
  const icons = [FileText, Sparkle, Code, Users, RocketLaunch];

  const chooseFactor = (id: string) => {
    select(id);
    setDetailVisible(true);
  };

  return (
    <div className={`map-layout ${detailVisible ? "" : "detail-closed"}`}>
      <section className="map-workspace">
        <div className="map-topbar">
          <section className="goal-overview" aria-label="目标概览">
            <h1>{state.goal.title}</h1>
            <div className="goal-overview-stats">
              <Ring progress={state.goal.progress} size="small" />
              <div className="overview-label"><span>总进度</span></div>
              <div className="overview-stat"><i className="metric-dot blue" /><strong>{completed}</strong><span>已完成</span></div>
              <div className="overview-stat"><i className="metric-dot blue" /><strong>{inProgress}</strong><span>进行中</span></div>
              <div className="overview-stat"><i className="metric-dot risk" /><strong>{riskCount}</strong><span>有风险</span></div>
            </div>
          </section>

          <div className="canvas-controls" aria-label="地图工具">
            <div className="zoom-control">
              <button aria-label="缩小" onClick={() => setZoom((value) => Math.max(80, value - 10))}><Minus size={15} /></button>
              <span>{zoom}%</span>
              <button aria-label="放大" onClick={() => setZoom((value) => Math.min(120, value + 10))}><Plus size={15} /></button>
            </div>
            <button
              className={riskOnly ? "active" : ""}
              aria-label="只看风险分支"
              title="只看风险分支"
              onClick={() => setRiskOnly((value) => !value)}
            ><Funnel size={18} /></button>
            <button aria-label="编辑目标" title="编辑目标" onClick={edit}><SlidersHorizontal size={18} /></button>
          </div>
        </div>

        <div className="map-canvas">
          <div className="map-scene" style={{ transform: `scale(${zoom / 100})` }}>
            <svg className="map-connectors" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true">
              {state.goal.factors.map((item, index) => (
                <path
                  className={riskOnly && item.risk === "calm" ? "muted" : ""}
                  key={item.id}
                  d={connectorGeometry(positions[index]).path}
                />
              ))}
            </svg>

            <button
              className="goal-node"
              onClick={edit}
              style={{ "--goal-progress": `${state.goal.progress * 3.6}deg` } as React.CSSProperties}
            >
              <b>{state.goal.title}</b>
              <span className="goal-node-progress">
                <i className="node-progress-mark" style={{ "--node-progress": `${state.goal.progress * 3.6}deg` } as React.CSSProperties} />
                {state.goal.progress}%
              </span>
            </button>

            {state.goal.factors.map((item, index) => {
              const point = positions[index];
              const geometry = connectorGeometry(point);
              const Icon = icons[index % icons.length];
              const taskCount = state.tasks.filter((task) => task.nodeId === item.id).length;
              const itemRisk = state.tasks.filter((task) => task.nodeId === item.id && !task.completed).length;
              return (
                <button
                  key={item.id}
                  style={{
                    left: `${point.x / 10}%`,
                    top: `${point.y / 6.5}%`,
                  }}
                  className={`factor-node ${selectedId === item.id ? "selected" : ""} ${riskOnly && item.risk === "calm" ? "filtered" : ""}`}
                  onClick={() => chooseFactor(item.id)}
                >
                  <span className="factor-icon"><Icon size={27} weight="light" /></span>
                  <span className="factor-copy">
                    <b>{item.title}</b>
                    <small>
                      <span className="node-progress-inline"><i className="node-progress-mark" style={{ "--node-progress": `${item.progress * 3.6}deg` } as React.CSSProperties} />{item.progress}%</span>
                      <span><i className="metric-dot blue" />{taskCount}</span>
                      <span><i className="metric-dot risk" />{itemRisk}</span>
                    </small>
                  </span>
                  <i className="node-port" style={geometry.port} />
                </button>
              );
            })}
          </div>
        </div>

        <button className="map-add-button" onClick={() => add(factor?.id)}><Plus size={19} weight="light" />添加任务</button>
      </section>

      {detailVisible && <aside className="detail-panel">
        <div className="detail-heading">
          <span className="detail-icon"><Code size={24} weight="light" /></span>
          <div><h2>{factor?.title}</h2></div>
          <div className="detail-actions">
            <button aria-label="更多"><DotsThree size={20} /></button>
            <button aria-label="关闭详情" onClick={() => setDetailVisible(false)}><X size={18} /></button>
          </div>
        </div>

        <div className="detail-progress">
          <Ring progress={factor?.progress ?? 0} size="small" />
          <div><strong>{linked.length}</strong><span>任务</span></div>
          <div className="risk-metric"><strong>{linkedAtRisk}</strong><span>有风险</span></div>
          <div><strong>{blocked}</strong><span>阻塞</span></div>
        </div>

        <section className="detail-section"><h3>聚焦</h3><p>{factor?.note}</p></section>
        <section className="detail-section">
          <header><h3>关键任务</h3><button className="text-button" onClick={() => add(factor?.id)}><Plus size={14} />添加</button></header>
          <div className="detail-task-list">
            {linked.length ? linked.map((task) => {
              const status = task.completed
                ? "已完成"
                : factor?.risk === "risk" && task.quadrant === "important-urgent"
                  ? "有风险"
                  : task.quadrant === "later"
                    ? "未开始"
                    : "进行中";
              return (
                <button
                  className={`detail-task-row ${task.completed ? "completed" : ""}`}
                  key={task.id}
                  onClick={() => toggle(task.id)}
                >
                  <span className="detail-task-check">{task.completed && <Check size={13} weight="bold" />}</span>
                  <strong>{task.title}</strong>
                  <em className={status === "有风险" ? "risk" : ""}>{status}</em>
                </button>
              );
            }) : <div className="empty detail-empty">这个分支还没有任务</div>}
          </div>
        </section>
        <section className="detail-section">
          <h3>下一里程碑</h3>
          <p>{factor?.milestones[1] ?? factor?.milestones[0]}</p>
          <span className={`detail-risk-note ${factor?.risk}`}>{risk} · 本周已投入 {factor?.hours} 小时</span>
        </section>
      </aside>}
    </div>
  );
}

function TodayView({
  state, range, setRange, tasks, toggle, add,
}: {
  state: State;
  range: Range;
  setRange: (value: Range) => void;
  tasks: Task[];
  toggle: (id: string) => void;
  add: () => void;
}) {
  const planned = tasks.reduce((sum, task) => sum + task.minutes, 0);
  const available = state.goal.weeklyHours * 60 * (range === "today" ? 0.2 : 1);
  return (
    <div className="view-frame">
      <div className="view-heading">
        <div>
          <p className="section-kicker">{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date())}</p>
          <h1>给重要的事，留出安静时间</h1><p>今天的每一项投入，都会回到你的目标地图。</p>
        </div>
        <button className="primary-button desktop-only" onClick={add}><Plus size={17} />添加任务</button>
      </div>
      <Segment value={range} setValue={setRange} />
      <section className="capacity-strip">
        <span className="soft-icon"><Clock size={21} /></span>
        <div><small>已安排</small><strong>{(planned / 60).toFixed(1)} 小时</strong></div>
        <div className="capacity-meter"><span style={{ width: `${Math.min(100, planned / Math.max(available, 1) * 100)}%` }} /></div>
        <div className="capacity-buffer"><Leaf size={18} />保留 {Math.round(available * state.goal.bufferPercent / 100 / 6) / 10} 小时弹性</div>
      </section>
      <div className="quadrant-grid">
        {QUADRANTS.map((quadrant) => {
          const group = tasks.filter((task) => task.quadrant === quadrant.id);
          return (
            <section className={`quadrant-panel q-${quadrant.id}`} key={quadrant.id}>
              <header><div><h2>{quadrant.label}</h2><p>{quadrant.tip}</p></div><span>{group.filter((task) => !task.completed).length}</span></header>
              <div className="task-list">{group.length ? group.map((task) => <TaskRow key={task.id} task={task} factors={state.goal.factors} toggle={toggle} />) : <div className="empty">这里暂时很安静</div>}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ReviewView({
  state, allocation, update,
}: {
  state: State;
  allocation: (Factor & { minutes: number })[];
  update: (field: keyof State["reviewNotes"], value: string) => void;
}) {
  const [period, setPeriod] = useState<"week" | "month" | "year">("week");
  const max = Math.max(1, ...allocation.map((item) => item.minutes));
  const ordered = [...allocation].sort((a, b) => b.minutes - a.minutes);
  return (
    <div className="view-frame">
      <div className="view-heading"><div><p className="section-kicker">周期复盘</p><h1>看见时间真正流向了哪里</h1><p>不评价忙碌，只判断投入是否靠近目标。</p></div></div>
      <div className="segmented-control">{[["week", "本周"], ["month", "本月"], ["year", "今年"]].map(([id, label]) => <button className={period === id ? "active" : ""} key={id} onClick={() => setPeriod(id as typeof period)}>{label}</button>)}</div>
      <div className="review-grid">
        <section className="review-panel">
          <PanelTitle title="分支投入" text="按已安排任务时间计算" aside={`${state.goal.weeklyHours}h 可投入`} />
          <div className="allocation-list">{allocation.map((item) => <div className="allocation-row" key={item.id}><div><strong>{item.title}</strong><span>{(item.minutes / 60).toFixed(1)}h</span></div><div><span style={{ width: `${Math.max(8, item.minutes / max * 100)}%` }} /></div></div>)}</div>
        </section>
        <section className="review-panel insight-panel">
          <span className="insight-icon"><Sparkle size={22} /></span><h2>下一阶段建议</h2>
          <p>「{ordered[0]?.title}」获得了最多时间，但「{ordered.at(-1)?.title}」投入偏少。建议下周先安排 2 个重要不紧急任务，避免分支继续失衡。</p>
          <div className="insight-action"><span>建议配置</span><strong>60% 核心推进 · 15% 验证 · 25% 弹性</strong></div>
        </section>
      </div>
      <section className="reflection-section">
        <PanelTitle title={`${period === "week" ? "本周" : period === "month" ? "本月" : "今年"}回看`} text="记录判断，让下一次规划更诚实。" />
        <div className="reflection-grid">
          {[["wins", "值得保留的节奏"], ["friction", "停滞或失衡"], ["next", "下一周期只改变一件事"]].map(([field, label]) => (
            <label key={field}><span>{label}</span><textarea rows={4} value={state.reviewNotes[field as keyof State["reviewNotes"]]} onChange={(e) => update(field as keyof State["reviewNotes"], e.target.value)} /></label>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProfileView({
  user, state, save, savedAt, reset,
}: {
  user: { displayName: string; email: string };
  state: State;
  save: string;
  savedAt: string | null;
  reset: () => void;
}) {
  const exportData = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "master-data.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="view-frame">
      <div className="view-heading"><div><p className="section-kicker">我的空间</p><h1>时间属于你，不属于清单</h1><p>这里保存你的目标、投入习惯与每一次真实复盘。</p></div></div>
      <section className="profile-card"><div className="profile-avatar">{user.displayName.slice(0, 2)}</div><div><h2>{user.displayName}</h2><p>{user.email || "当前为验证体验身份"}</p></div><span className={`account-state ${save}`}>{save === "saved" ? "数据已保存" : "正在同步"}</span></section>
      <div className="profile-grid">
        <section><h3>当前目标</h3><strong>{state.goal.title}</strong><p>{state.goal.progress}% 已完成</p><div className="profile-progress"><span style={{ width: `${state.goal.progress}%` }} /></div></section>
        <section><h3>时间边界</h3><strong>{state.goal.weeklyHours} 小时 / 周</strong><p>保留 {state.goal.bufferPercent}% 弹性时间</p></section>
        <section><h3>数据状态</h3><strong>{save === "error" ? "等待连接" : "永久保存中"}</strong><p>{savedAt ? `最近保存 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(savedAt))}` : "完成第一次修改后自动保存"}</p></section>
      </div>
      <section className="data-actions"><div><h2>数据与恢复</h2><p>你可以随时导出当前目标数据。恢复示例会覆盖当前工作区。</p></div><div><button className="secondary-button" onClick={exportData}><DownloadSimple size={17} />导出数据</button><button className="text-button danger" onClick={reset}>恢复示例</button></div></section>
    </div>
  );
}

function TaskRow({ task, factors, toggle, compact = false }: { task: Task; factors: Factor[]; toggle: (id: string) => void; compact?: boolean }) {
  return (
    <div className={`task-row ${task.completed ? "completed" : ""} ${compact ? "compact" : ""}`}>
      <button className="task-check" aria-label={task.completed ? `恢复${task.title}` : `完成${task.title}`} onClick={() => toggle(task.id)}>{task.completed && <Check size={13} weight="bold" />}</button>
      <div><strong>{task.title}</strong><span>{factors.find((factor) => factor.id === task.nodeId)?.title} · {task.minutes} 分钟</span></div>
    </div>
  );
}

function Ring({ progress, size }: { progress: number; size: "tiny" | "small" | "medium" }) {
  return <span className={`progress-ring ${size}`} style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><i>{size === "medium" ? `${progress}%` : ""}</i></span>;
}

function Segment({ value, setValue }: { value: Range; setValue: (value: Range) => void }) {
  return <div className="segmented-control"><button className={value === "today" ? "active" : ""} onClick={() => setValue("today")}>今日计划</button><button className={value === "week" ? "active" : ""} onClick={() => setValue("week")}>本周计划</button></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function WizardIntro({ Icon, title, text }: { Icon: typeof Target; title: string; text: string }) {
  return <div className="wizard-copy"><Icon size={23} /><div><h3>{title}</h3><p>{text}</p></div></div>;
}

function PanelTitle({ title, text, aside }: { title: string; text: string; aside?: string }) {
  return <header className="panel-heading"><div><h2>{title}</h2><p>{text}</p></div>{aside && <span>{aside}</span>}</header>;
}

function Modal({ title, subtitle, close, children, wide = false }: { title: string; subtitle: string; close: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section className={`modal-sheet ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button subtle" aria-label="关闭" onClick={close}><X size={18} /></button></header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
