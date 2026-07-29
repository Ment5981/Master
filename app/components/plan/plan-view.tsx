"use client";

import dynamic from "next/dynamic";
import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Check,
  Clock,
  Leaf,
  Plus,
  Sparkle,
  Target,
} from "@phosphor-icons/react";
import {
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
} from "date-fns";
import { useMemo, useState } from "react";
import {
  nodeById,
  tasksForDay,
  tasksForMonth,
  tasksForWeek,
  unscheduledTasks,
} from "../../domain/selectors";
import {
  QUADRANTS,
  type MonthlyOutcome,
  type PlanView,
  type Task,
  type WorkspaceState,
} from "../../domain/types";
import {
  dateKey,
  endOfLocalWeek,
  formatMonthTitle,
  formatShortDate,
  shiftMonth,
  startOfLocalWeek,
} from "../../lib/dates";

const CalendarView = dynamic(
  () =>
    import("./calendar-view").then((module) => module.CalendarView),
  {
    ssr: false,
    loading: () => <div className="calendar-skeleton" aria-label="加载日历" />,
  },
);

const PLAN_TABS: Array<{ id: PlanView; label: string }> = [
  { id: "today", label: "今日" },
  { id: "week", label: "本周" },
  { id: "month", label: "月计划" },
  { id: "calendar", label: "日历" },
];

function TaskRow({
  task,
  state,
  onToggle,
  onEdit,
}: {
  task: Task;
  state: WorkspaceState;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const branch = task.nodeId ? nodeById(state, task.nodeId) : undefined;
  return (
    <div
      className={`task-row ${task.status === "done" ? "completed" : ""}`}
    >
      <button
        className="task-check"
        onClick={() => onToggle(task.id)}
        aria-label={
          task.status === "done"
            ? `恢复${task.title}`
            : `完成${task.title}`
        }
      >
        {task.status === "done" && <Check size={13} weight="bold" />}
      </button>
      <button className="task-row-copy" onClick={() => onEdit(task.id)}>
        <strong>{task.title}</strong>
        <span>
          {branch?.title ?? "未关联目标"} · {task.minutes} 分钟
          {task.dueDate ? ` · 截止 ${formatShortDate(task.dueDate)}` : ""}
        </span>
      </button>
      {task.status === "blocked" && <em>阻塞</em>}
    </div>
  );
}

function PlanHeader({
  view,
  onAddTask,
}: {
  view: PlanView;
  onAddTask: () => void;
}) {
  const today = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
  const content = {
    today: {
      kicker: today,
      title: "给重要的事，留出安静时间",
      description: "今天的每一项投入，都会回到你的目标地图。",
    },
    week: {
      kicker: "本周节奏",
      title: "先保护长期重要，再回应紧急",
      description: "把一周当成一个有呼吸感的容器，而不是填满的格子。",
    },
    month: {
      kicker: "月度规划",
      title: "用一个月，推动少数真正重要的结果",
      description: "月度成果决定方向，周与日只负责把方向变成行动。",
    },
    calendar: {
      kicker: "时间落点",
      title: "让计划在真实日期中自然发生",
      description: "计划日期、截止日期与完成日期彼此独立，但始终同步。",
    },
  }[view];
  return (
    <div className="view-heading plan-heading">
      <div>
        <p className="section-kicker">{content.kicker}</p>
        <h1>{content.title}</h1>
        <p>{content.description}</p>
      </div>
      <button className="primary-button desktop-only" onClick={onAddTask}>
        <Plus size={17} />
        添加任务
      </button>
    </div>
  );
}

function CapacityStrip({
  state,
  tasks,
  period,
  month,
}: {
  state: WorkspaceState;
  tasks: Task[];
  period: "today" | "week" | "month";
  month?: string;
}) {
  const weekStart = startOfLocalWeek(dateKey());
  const weekEnd = endOfLocalWeek(dateKey());
  const planned = tasks
    .filter(
      (task) =>
        task.status !== "done" &&
        (period === "today"
          ? task.plannedStartDate === dateKey()
          : period === "week"
            ? Boolean(
                task.plannedStartDate &&
                  task.plannedStartDate >= weekStart &&
                  task.plannedStartDate <= weekEnd,
              )
            : Boolean(
                task.plannedStartDate &&
                  month &&
                  task.plannedStartDate.startsWith(month),
              )),
    )
    .reduce((sum, task) => sum + task.minutes, 0);
  const multiplier = period === "today" ? 0.2 : period === "week" ? 1 : 4.33;
  const available = state.goal.weeklyHours * 60 * multiplier;
  const buffer = available * (state.goal.bufferPercent / 100);
  const usable = Math.max(1, available - buffer);
  return (
    <section className="capacity-strip">
      <span className="soft-icon">
        <Clock size={21} />
      </span>
      <div>
        <small>已安排</small>
        <strong>{(planned / 60).toFixed(1)} 小时</strong>
      </div>
      <div className="capacity-meter">
        <span
          style={{
            width: `${Math.min(100, (planned / usable) * 100)}%`,
          }}
        />
      </div>
      <div className="capacity-buffer">
        <Leaf size={18} />
        保留 {(buffer / 60).toFixed(1)} 小时弹性
      </div>
    </section>
  );
}

function QuadrantView({
  state,
  tasks,
  onToggleTask,
  onEditTask,
  onAddTask,
}: {
  state: WorkspaceState;
  tasks: Task[];
  onToggleTask: (id: string) => void;
  onEditTask: (id: string) => void;
  onAddTask: () => void;
}) {
  return (
    <section className="quadrant-surface">
      {QUADRANTS.map((quadrant) => {
        const group = tasks.filter((task) => task.quadrant === quadrant.id);
        return (
          <div className={`quadrant-cell q-${quadrant.id}`} key={quadrant.id}>
            <header>
              <div>
                <h2>{quadrant.label}</h2>
                <p>{quadrant.tip}</p>
              </div>
              <span>
                {group.filter((task) => task.status !== "done").length}
              </span>
            </header>
            <div className="task-list">
              {group.length ? (
                group.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    state={state}
                    onToggle={onToggleTask}
                    onEdit={onEditTask}
                  />
                ))
              ) : (
                <button className="quadrant-empty" onClick={onAddTask}>
                  暂时没有任务
                  <Plus size={14} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function MonthPlan({
  state,
  month,
  onMonthChange,
  onEditTask,
  onAddOutcome,
  onToggleOutcome,
  onAddTask,
}: {
  state: WorkspaceState;
  month: string;
  onMonthChange: (value: string) => void;
  onEditTask: (id: string) => void;
  onAddOutcome: (outcome: Omit<MonthlyOutcome, "id" | "completed">) => void;
  onToggleOutcome: (id: string) => void;
  onAddTask: () => void;
}) {
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [nodeId, setNodeId] = useState<string | null>(
    state.nodes.find((node) => node.kind === "factor")?.id ?? null,
  );
  const tasks = tasksForMonth(state, month);
  const outcomes = state.planning.monthlyOutcomes.filter(
    (outcome) => outcome.month === month,
  );
  const unscheduled = unscheduledTasks(state);
  const weeks = useMemo(() => {
    const start = startOfMonth(parseISO(`${month}-01`));
    const end = endOfMonth(start);
    return eachWeekOfInterval(
      { start, end },
      { weekStartsOn: 1 },
    ).map((weekStart, index) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const startKey = format(
        index === 0 && weekStart < start ? start : weekStart,
        "yyyy-MM-dd",
      );
      const endKey = format(weekEnd > end ? end : weekEnd, "yyyy-MM-dd");
      const weekTasks = tasks.filter((task) => {
        if (!task.plannedStartDate) return false;
        const taskEnd = task.plannedEndDate ?? task.plannedStartDate;
        return (
          task.plannedStartDate <= endKey && taskEnd >= startKey
        );
      });
      const ownedMinutes = weekTasks
        .filter(
          (task) =>
            task.plannedStartDate &&
            task.plannedStartDate >= startKey &&
            task.plannedStartDate <= endKey,
        )
        .reduce((sum, task) => sum + task.minutes, 0);
      return {
        index,
        startKey,
        endKey,
        tasks: weekTasks,
        minutes: ownedMinutes,
      };
    });
  }, [month, tasks]);
  const branchAllocation = state.nodes
    .filter((node) => node.kind === "factor")
    .map((factor) => ({
      factor,
      minutes: tasks
        .filter((task) => {
          if (!task.plannedStartDate?.startsWith(month)) return false;
          const node = task.nodeId ? nodeById(state, task.nodeId) : undefined;
          if (!node) return false;
          if (node.id === factor.id) return true;
          let cursor = node;
          while (cursor && cursor.kind !== "goal") {
            if (cursor.id === factor.id) return true;
            cursor = nodeById(state, cursor.parentId)!;
          }
          return false;
        })
        .reduce((sum, task) => sum + task.minutes, 0),
    }))
    .sort((a, b) => b.minutes - a.minutes);
  const maxMinutes = Math.max(1, ...branchAllocation.map((item) => item.minutes));

  return (
    <div className="month-plan">
      <div className="month-plan-toolbar">
        <button
          aria-label="上个月"
          onClick={() => onMonthChange(shiftMonth(month, -1))}
        >
          <CaretLeft size={18} />
        </button>
        <h2>{formatMonthTitle(month)}</h2>
        <button
          aria-label="下个月"
          onClick={() => onMonthChange(shiftMonth(month, 1))}
        >
          <CaretRight size={18} />
        </button>
      </div>
      <CapacityStrip state={state} tasks={tasks} period="month" month={month} />

      <section className="monthly-outcomes">
        <header>
          <div>
            <span>本月关键成果</span>
            <h3>只保留 1–3 个真正重要的结果</h3>
          </div>
          {outcomes.length < 3 && (
            <button
              className="text-button"
              onClick={() => setComposing((value) => !value)}
            >
              <Plus size={15} />
              添加成果
            </button>
          )}
        </header>
        {composing && (
          <form
            className="outcome-composer"
            onSubmit={(event) => {
              event.preventDefault();
              if (!title.trim()) return;
              onAddOutcome({ title: title.trim(), nodeId, month });
              setTitle("");
              setComposing(false);
            }}
          >
            <input
              autoFocus
              placeholder="例如：完成可真实使用的手机闭环"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <select
              value={nodeId ?? ""}
              onChange={(event) => setNodeId(event.target.value || null)}
            >
              {state.nodes
                .filter((node) => node.kind === "factor")
                .map((node) => (
                  <option value={node.id} key={node.id}>
                    {node.title}
                  </option>
                ))}
            </select>
            <button className="primary-button" type="submit">
              保存
            </button>
          </form>
        )}
        <div className="outcome-grid">
          {outcomes.length ? (
            outcomes.map((outcome, index) => {
              const node = outcome.nodeId
                ? nodeById(state, outcome.nodeId)
                : undefined;
              return (
                <button
                  className={`outcome-item ${
                    outcome.completed ? "completed" : ""
                  }`}
                  key={outcome.id}
                  onClick={() => onToggleOutcome(outcome.id)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{outcome.title}</strong>
                    <small>
                      <Target size={13} />
                      {node?.title ?? "未关联目标"}
                    </small>
                  </div>
                  <i>{outcome.completed ? <Check size={13} /> : null}</i>
                </button>
              );
            })
          ) : (
            <div className="monthly-outcome-empty">
              <Sparkle size={21} weight="light" />
              先写下这个月结束时，最希望看见的结果
            </div>
          )}
        </div>
      </section>

      <div className="month-plan-grid">
        <section className="week-allocation">
          <header>
            <div>
              <span>按周落地</span>
              <h3>保持节奏，也保留转向空间</h3>
            </div>
          </header>
          <div className="week-rows">
            {weeks.map((week) => (
              <div className="week-row" key={week.startKey}>
                <div className="week-index">
                  <span>第 {week.index + 1} 周</span>
                  <small>
                    {formatShortDate(week.startKey)}–{formatShortDate(week.endKey)}
                  </small>
                </div>
                <div className="week-task-chips">
                  {week.tasks.slice(0, 3).map((task) => (
                    <button key={task.id} onClick={() => onEditTask(task.id)}>
                      {task.title}
                    </button>
                  ))}
                  {week.tasks.length > 3 && (
                    <span>还有 {week.tasks.length - 3} 项</span>
                  )}
                  {!week.tasks.length && <em>留白周</em>}
                </div>
                <strong>{(week.minutes / 60).toFixed(1)}h</strong>
              </div>
            ))}
          </div>
        </section>
        <aside className="month-side">
          <section className="branch-balance">
            <header>
              <span>目标投入</span>
              <h3>时间正在流向哪里</h3>
            </header>
            {branchAllocation.slice(0, 5).map(({ factor, minutes }) => (
              <div className="branch-balance-row" key={factor.id}>
                <div>
                  <span>{factor.title}</span>
                  <em>{(minutes / 60).toFixed(1)}h</em>
                </div>
                <i>
                  <b style={{ width: `${(minutes / maxMinutes) * 100}%` }} />
                </i>
              </div>
            ))}
          </section>
          <section className="unscheduled-panel">
            <header>
              <div>
                <span>待安排</span>
                <h3>{unscheduled.length} 项还没有日期</h3>
              </div>
              <button className="text-button" onClick={onAddTask}>
                <Plus size={14} />
              </button>
            </header>
            {unscheduled.slice(0, 4).map((task) => (
              <button key={task.id} onClick={() => onEditTask(task.id)}>
                <strong>{task.title}</strong>
                <span>{task.minutes} 分钟</span>
              </button>
            ))}
            {!unscheduled.length && <p>所有任务都已有清晰落点。</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

export function PlanExperience({
  state,
  view,
  month,
  onViewChange,
  onMonthChange,
  onToggleTask,
  onEditTask,
  onAddTask,
  onMoveTask,
  onAddOutcome,
  onToggleOutcome,
}: {
  state: WorkspaceState;
  view: PlanView;
  month: string;
  onViewChange: (view: PlanView) => void;
  onMonthChange: (month: string) => void;
  onToggleTask: (id: string) => void;
  onEditTask: (id: string) => void;
  onAddTask: (date?: string) => void;
  onMoveTask: (id: string, start: string, end: string) => void;
  onAddOutcome: (outcome: Omit<MonthlyOutcome, "id" | "completed">) => void;
  onToggleOutcome: (id: string) => void;
}) {
  const today = dateKey();
  const tasks =
    view === "today"
      ? tasksForDay(state, today)
      : view === "week"
        ? tasksForWeek(state, today)
        : [];
  return (
    <div className="view-frame plan-frame">
      <PlanHeader view={view} onAddTask={() => onAddTask()} />
      <div className="plan-tabs" role="tablist" aria-label="计划视图">
        {PLAN_TABS.map((tab) => (
          <button
            role="tab"
            aria-selected={view === tab.id}
            className={view === tab.id ? "active" : ""}
            key={tab.id}
            onClick={() => onViewChange(tab.id)}
          >
            {tab.id === "calendar" && <CalendarBlank size={15} />}
            {tab.label}
          </button>
        ))}
      </div>
      {(view === "today" || view === "week") && (
        <>
          <CapacityStrip state={state} tasks={tasks} period={view} />
          <QuadrantView
            state={state}
            tasks={tasks}
            onToggleTask={onToggleTask}
            onEditTask={onEditTask}
            onAddTask={() => onAddTask()}
          />
          {view === "week" &&
            state.tasks.some(
              (task) =>
                !task.plannedStartDate && task.planningBucket === "week",
            ) && (
              <section className="week-backlog">
                <header>
                  <div>
                    <span>本周待安排</span>
                    <h2>保留原有周计划，再决定具体日期</h2>
                  </div>
                </header>
                <div>
                  {state.tasks
                    .filter(
                      (task) =>
                        !task.plannedStartDate &&
                        task.planningBucket === "week",
                    )
                    .map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        state={state}
                        onToggle={onToggleTask}
                        onEdit={onEditTask}
                      />
                    ))}
                </div>
              </section>
            )}
        </>
      )}
      {view === "month" && (
        <MonthPlan
          state={state}
          month={month}
          onMonthChange={onMonthChange}
          onEditTask={onEditTask}
          onAddOutcome={onAddOutcome}
          onToggleOutcome={onToggleOutcome}
          onAddTask={() => onAddTask()}
        />
      )}
      {view === "calendar" && (
        <CalendarView
          state={state}
          selectedMonth={month}
          onMonthChange={onMonthChange}
          onMoveTask={onMoveTask}
          onAddTask={(date) => onAddTask(date)}
          onEditTask={onEditTask}
          onToggleTask={onToggleTask}
        />
      )}
    </div>
  );
}
