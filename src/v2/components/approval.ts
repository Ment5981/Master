import type { Proposal } from '../core/types'

export function explicitConfirmation(text: string) {
  return /^(按这[个版份]安排|确认安排|应用这[个版份]计划)[。！!\s]*$/.test(text.trim())
}

/** Only a unique task duration change is eligible; model output never grants approval. */
export function durationAndConfirmation(text: string, proposal: Proposal): Proposal | null {
  const match = /^把第([一二两三四五六七八九十\d]+)(?:项|个任务)(?:的(?:预计)?(?:时长|时间))?(?:改成|改为|调整为)(\d{1,4})分钟[，,\s]*(?:然后)?(?:按这[个版份]安排|确认安排|应用这[个版份]计划)[。！!\s]*$/.exec(text.trim())
  if (!match) return null
  const ordinal = /^\d+$/.test(match[1]) ? Number(match[1]) : ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 } as Record<string, number>)[match[1]]
  const minutes = Number(match[2]); const target = proposal.tasks[ordinal - 1]
  if (!target || !target.selected || target.status !== 'todo' || minutes < 1 || minutes > 1440) throw new Error('这句话中的任务或时长还不明确，请在草案里修改后再确认。')
  return { ...proposal, revision: proposal.revision + 1, tasks: proposal.tasks.map(t => t.id === target.id ? { ...t, estimateMinutes: minutes } : t) }
}
