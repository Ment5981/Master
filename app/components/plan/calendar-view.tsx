"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, {
  type DateClickArg,
} from "@fullcalendar/interaction";
import zhCnLocale from "@fullcalendar/core/locales/zh-cn";
import type {
  DatesSetArg,
  EventClickArg,
  EventContentArg,
} from "@fullcalendar/core";
import type { EventDropArg } from "@fullcalendar/core";
import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Check,
  Plus,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  dateKey,
  formatMonthTitle,
  formatShortDate,
  monthKey,
  shiftDate,
} from "../../lib/dates";
import { nodeById, tasksForDay } from "../../domain/selectors";
import type { WorkspaceState } from "../../domain/types";

export function CalendarView({
  state,
  selectedMonth,
  onMonthChange,
  onMoveTask,
  onAddTask,
  onEditTask,
  onToggleTask,
}: {
  state: WorkspaceState;
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  onMoveTask: (taskId: string, start: string, end: string) => void;
  onAddTask: (date: string) => void;
  onEditTask: (taskId: string) => void;
  onToggleTask: (taskId: string) => void;
}) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [selectedDate, setSelectedDate] = useState(dateKey());
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const events = useMemo(
    () =>
      state.tasks.flatMap((task) => {
        const branch = task.nodeId ? nodeById(state, task.nodeId) : undefined;
        const common = {
          extendedProps: {
            taskId: task.id,
            branchTitle: branch?.title ?? "未关联目标",
            status: task.status,
          },
        };
        const result = [];
        if (task.plannedStartDate) {
          const end = task.plannedEndDate ?? task.plannedStartDate;
          result.push({
            ...common,
            id: `plan:${task.id}`,
            title: task.title,
            start: task.plannedStartDate,
            end: shiftDate(end, 1),
            allDay: true,
            editable: !compact,
            classNames: [
              "event-plan",
              task.status === "done" ? "event-done" : "",
              task.status === "blocked" ? "event-blocked" : "",
              task.dueDate && task.dueDate < dateKey() && task.status !== "done"
                ? "event-overdue"
                : "",
            ].filter(Boolean),
            extendedProps: {
              ...common.extendedProps,
              eventKind: "plan",
            },
          });
        }
        if (task.dueDate) {
          result.push({
            ...common,
            id: `due:${task.id}`,
            title: `截止 · ${task.title}`,
            start: task.dueDate,
            allDay: true,
            editable: false,
            classNames: ["event-due"],
            extendedProps: {
              ...common.extendedProps,
              eventKind: "due",
            },
          });
        }
        if (task.completedAt) {
          result.push({
            ...common,
            id: `done:${task.id}`,
            title: `完成 · ${task.title}`,
            start: task.completedAt.slice(0, 10),
            allDay: true,
            editable: false,
            classNames: ["event-completed-marker"],
            extendedProps: {
              ...common.extendedProps,
              eventKind: "completed",
            },
          });
        }
        return result;
      }),
    [compact, state],
  );
  const selectedTasks = tasksForDay(state, selectedDate);

  const renderEvent = (content: EventContentArg) => {
    const done = content.event.extendedProps.status === "done";
    return (
      <span className="calendar-event-content">
        {done && <Check size={11} weight="bold" />}
        <span>{content.event.title}</span>
      </span>
    );
  };

  const go = (direction: "prev" | "next" | "today") => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (direction === "prev") api.prev();
    if (direction === "next") api.next();
    if (direction === "today") api.today();
  };

  return (
    <div className="calendar-experience">
      <div className="calendar-toolbar">
        <div>
          <p className="section-kicker">日历视图</p>
          <h2>{formatMonthTitle(selectedMonth)}</h2>
        </div>
        <div className="calendar-toolbar-actions">
          <button onClick={() => go("today")}>回到今天</button>
          <button aria-label="上个月" onClick={() => go("prev")}>
            <CaretLeft size={17} />
          </button>
          <button aria-label="下个月" onClick={() => go("next")}>
            <CaretRight size={17} />
          </button>
        </div>
      </div>
      <div className="calendar-surface">
        <div className="calendar-grid-wrap">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            initialDate={`${selectedMonth}-01`}
            locale={zhCnLocale}
            firstDay={1}
            fixedWeekCount={false}
            showNonCurrentDates
            headerToolbar={false}
            height="auto"
            editable={!compact}
            eventStartEditable={!compact}
            eventDurationEditable={false}
            dayMaxEvents={compact ? 1 : 2}
            longPressDelay={350}
            eventLongPressDelay={350}
            selectLongPressDelay={350}
            events={events}
            datesSet={(info: DatesSetArg) => {
              const center = new Date(
                (info.start.getTime() + info.end.getTime()) / 2,
              );
              const month = monthKey(center);
              if (month !== selectedMonth) onMonthChange(month);
            }}
            dateClick={(info: DateClickArg) => setSelectedDate(info.dateStr)}
            eventClick={(info: EventClickArg) => {
              setSelectedDate(info.event.startStr.slice(0, 10));
              onEditTask(info.event.extendedProps.taskId);
            }}
            eventDrop={(info: EventDropArg) => {
              if (info.event.extendedProps.eventKind !== "plan") {
                info.revert();
                return;
              }
              const start = info.event.startStr.slice(0, 10);
              const exclusiveEnd = info.event.endStr?.slice(0, 10);
              const end = exclusiveEnd ? shiftDate(exclusiveEnd, -1) : start;
              onMoveTask(info.event.extendedProps.taskId, start, end);
            }}
            eventContent={renderEvent}
            dayCellClassNames={(info) =>
              dateKey(info.date) === selectedDate ? ["is-selected-day"] : []
            }
            moreLinkContent={(args) => `还有 ${args.num} 项`}
          />
        </div>
        <aside className="day-agenda">
          <header>
            <div>
              <span>当天安排</span>
              <h3>
                {Number(selectedDate.slice(5, 7))}月
                {Number(selectedDate.slice(8, 10))}日
              </h3>
            </div>
            <button
              className="icon-button"
              onClick={() => onAddTask(selectedDate)}
              aria-label="在这一天添加任务"
            >
              <Plus size={18} />
            </button>
          </header>
          <div className="agenda-list">
            {selectedTasks.length ? (
              selectedTasks.map((task) => {
                const branch = task.nodeId
                  ? nodeById(state, task.nodeId)
                  : undefined;
                return (
                  <div
                    className={`agenda-row ${
                      task.status === "done" ? "completed" : ""
                    }`}
                    key={task.id}
                  >
                    <button
                      className="task-check"
                      onClick={() => onToggleTask(task.id)}
                      aria-label={
                        task.status === "done"
                          ? `恢复${task.title}`
                          : `完成${task.title}`
                      }
                    >
                      {task.status === "done" && (
                        <Check size={12} weight="bold" />
                      )}
                    </button>
                    <button
                      className="agenda-copy"
                      onClick={() => onEditTask(task.id)}
                    >
                      <strong>{task.title}</strong>
                      <span>
                        {branch?.title ?? "未关联目标"} · {task.minutes} 分钟
                      </span>
                      {(task.dueDate || task.completedAt) && (
                        <small>
                          {task.dueDate
                            ? `截止 ${formatShortDate(task.dueDate)}`
                            : ""}
                          {task.dueDate && task.completedAt ? " · " : ""}
                          {task.completedAt
                            ? `完成 ${formatShortDate(task.completedAt.slice(0, 10))}`
                            : ""}
                        </small>
                      )}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="agenda-empty">
                <CalendarBlank size={25} weight="light" />
                <p>这一天还留有空间</p>
                <button onClick={() => onAddTask(selectedDate)}>
                  安排一项重要的事
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
