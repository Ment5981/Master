import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isEqual,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export function dateKey(date = new Date()) {
  return format(date, "yyyy-MM-dd");
}

export function monthKey(date = new Date()) {
  return format(date, "yyyy-MM");
}

export function shiftDate(value: string, days: number) {
  return dateKey(addDays(parseISO(value), days));
}

export function shiftMonth(value: string, months: number) {
  return monthKey(addMonths(parseISO(`${value}-01`), months));
}

export function startOfLocalWeek(value = dateKey()) {
  return dateKey(startOfWeek(parseISO(value), { weekStartsOn: 1 }));
}

export function endOfLocalWeek(value = dateKey()) {
  return dateKey(endOfWeek(parseISO(value), { weekStartsOn: 1 }));
}

export function startOfLocalMonth(value = monthKey()) {
  return dateKey(startOfMonth(parseISO(`${value}-01`)));
}

export function endOfLocalMonth(value = monthKey()) {
  return dateKey(endOfMonth(parseISO(`${value}-01`)));
}

export function rangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
) {
  const aStart = parseISO(startA);
  const aEnd = parseISO(endA);
  const bStart = parseISO(startB);
  const bEnd = parseISO(endB);
  return (
    (isBefore(aStart, bEnd) || isEqual(aStart, bEnd)) &&
    (isAfter(aEnd, bStart) || isEqual(aEnd, bStart))
  );
}

export function formatMonthTitle(value: string) {
  const date = parseISO(`${value}-01`);
  return `${format(date, "yyyy")} 年 ${Number(format(date, "M"))} 月`;
}

export function formatShortDate(value: string | null) {
  if (!value) return "未安排";
  return `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`;
}

export function daysUntil(value: string, from = dateKey()) {
  return differenceInCalendarDays(parseISO(value), parseISO(from));
}
