import {
  addDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'

export const toDateKey = (date: Date) => format(date, 'yyyy-MM-dd')

export const todayKey = () => toDateKey(new Date())

export const formatLongDate = (date: Date | string) =>
  format(typeof date === 'string' ? parseISO(date) : date, 'M月d日 EEEE', {
    locale: zhCN,
  })

export const formatShortDate = (date: Date | string) =>
  format(typeof date === 'string' ? parseISO(date) : date, 'M月d日', {
    locale: zhCN,
  })

export const formatWeekday = (date: Date | string) =>
  format(typeof date === 'string' ? parseISO(date) : date, 'EEE', {
    locale: zhCN,
  })

export const getWeekDays = (anchor = new Date()) => {
  const first = startOfWeek(anchor, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, index) => addDays(first, index))
}

export const isToday = (date: Date) => isSameDay(date, new Date())

export const getPeriodRange = (
  period: 'weekly' | 'monthly' | 'yearly',
  anchor = new Date(),
) => {
  if (period === 'monthly') {
    return {
      start: toDateKey(startOfMonth(anchor)),
      end: toDateKey(endOfMonth(anchor)),
    }
  }

  if (period === 'yearly') {
    return {
      start: toDateKey(startOfYear(anchor)),
      end: toDateKey(endOfYear(anchor)),
    }
  }

  return {
    start: toDateKey(startOfWeek(anchor, { weekStartsOn: 1 })),
    end: toDateKey(endOfWeek(anchor, { weekStartsOn: 1 })),
  }
}

export const minutesLabel = (minutes: number) => {
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}小时${rest}分钟` : `${hours}小时`
}
