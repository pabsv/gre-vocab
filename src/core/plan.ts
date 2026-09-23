import { BY_ID } from '../data/words'
import { nextRollover, studyDay } from './time'
import type { Progress, Settings } from './types'

/** Rough cost of one review and of one new word through the whole ladder (incl. misses). */
export const SEC_PER_REVIEW = 10
export const SEC_PER_NEW = 50

export interface DailyPlan {
  day: string
  /** Reviews due today, most overdue first. */
  dueIds: string[]
  /** Words started earlier but never finished; they continue at the MCQ step. */
  carryIds: string[]
  /** Fresh words for today, after the target and the time budget. */
  newIds: string[]
  /** New words already started today. */
  startedToday: number
  newTarget: number
  estMinutes: number
}

export function isDue(p: Progress, now: number): boolean {
  return !!p.card && p.card.due < nextRollover(now) && p.lastGradedDay !== studyDay(now)
}

export function buildPlan(args: {
  progress: ReadonlyMap<string, Progress>
  order: readonly string[]
  settings: Pick<Settings, 'newPerDay' | 'budgetMin'>
  now: number
  suspended: ReadonlySet<string>
  /** Exact number of fresh words for this session; overrides the daily target and the budget. */
  newCount?: number
}): DailyPlan {
  const { progress, order, settings, now, suspended, newCount } = args
  const day = studyDay(now)
  const due: Progress[] = []
  const carryIds: string[] = []
  let startedToday = 0
  let carriedIn = 0
  for (const p of progress.values()) {
    if (suspended.has(p.entryId) || !BY_ID.has(p.entryId)) continue
    if (p.card) {
      if (isDue(p, now)) due.push(p)
    } else if (p.firstDay) {
      carryIds.push(p.entryId)
      if (p.firstDay !== day) carriedIn++
    }
    if (p.firstDay === day && !p.known) startedToday++
  }
  due.sort((a, b) => a.due - b.due)
  const dueIds = due.map((p) => p.entryId)

  const seconds = settings.budgetMin * 60 - dueIds.length * SEC_PER_REVIEW - carryIds.length * SEC_PER_NEW
  const fit = Math.max(0, Math.floor(seconds / SEC_PER_NEW))
  const allowed = newCount ?? Math.max(0, Math.min(settings.newPerDay - startedToday - carriedIn, fit))

  const newIds: string[] = []
  const fresh = (id: string) => !suspended.has(id) && !progress.get(id)?.firstDay && !progress.get(id)?.card
  for (let k = 0; k < order.length && newIds.length < allowed; k++) {
    if (!fresh(order[k])) continue
    newIds.push(order[k])
  }
  // Never split a word's senses across days.
  if (newIds.length) {
    const lastWord = BY_ID.get(newIds[newIds.length - 1])!.word
    let k = order.indexOf(newIds[newIds.length - 1]) + 1
    while (k < order.length && BY_ID.get(order[k])!.word === lastWord) {
      if (fresh(order[k])) newIds.push(order[k])
      k++
    }
  }

  const estMinutes = Math.round((dueIds.length * SEC_PER_REVIEW + (carryIds.length + newIds.length) * SEC_PER_NEW) / 60)
  return { day, dueIds, carryIds, newIds, startedToday, newTarget: settings.newPerDay, estMinutes }
}
