import type { FSRS } from 'ts-fsrs'
import { ENTRIES, type Tier } from '../data/words'
import { missScoreAt } from './derive'
import { bucketOf, recallProbability, type Bucket } from './fsrs'
import { addDays, dayStart, DAY_MS, studyDay } from './time'
import type { Progress, StudyEvent } from './types'

export type BucketCounts = Record<Bucket, number>

export function bucketCounts(progress: ReadonlyMap<string, Progress>, tier?: Tier): BucketCounts {
  const out: BucketCounts = { new: 0, learning: 0, familiar: 0, mastered: 0 }
  for (const e of ENTRIES) {
    if (tier && e.tier !== tier) continue
    out[bucketOf(progress.get(e.id)?.card ?? null)]++
  }
  return out
}

/** Expected number of words you would recall right now: sum of recall probabilities. */
export function recallEstimate(progress: ReadonlyMap<string, Progress>, f: FSRS, now: number): number {
  let sum = 0
  for (const p of progress.values()) if (p.card) sum += recallProbability(f, p.card, now)
  return sum
}

export function troubleList(progress: ReadonlyMap<string, Progress>, now: number, min = 0.35): { id: string; score: number; p: Progress }[] {
  const out: { id: string; score: number; p: Progress }[] = []
  for (const p of progress.values()) {
    const score = missScoreAt(p, now)
    if (score >= min) out.push({ id: p.entryId, score, p })
  }
  return out.sort((a, b) => b.score - a.score)
}

/** Confused pairs, strongest first. Each unordered pair appears once with the combined count. */
export function confusionPairs(progress: ReadonlyMap<string, Progress>): { a: string; b: string; count: number }[] {
  const pairs = new Map<string, { a: string; b: string; count: number }>()
  for (const p of progress.values()) {
    for (const [other, count] of Object.entries(p.confusions)) {
      const [a, b] = [p.entryId, other].sort()
      const key = `${a}|${b}`
      const cur = pairs.get(key)
      if (cur) cur.count += count
      else pairs.set(key, { a, b, count })
    }
  }
  return [...pairs.values()].sort((x, y) => y.count - x.count)
}

/** Reviews due per study day for the next `days` days; index 0 includes everything overdue. */
export function forecast(progress: ReadonlyMap<string, Progress>, now: number, days = 14): number[] {
  const out = Array.from({ length: days }, () => 0)
  const start = dayStart(now)
  const today = studyDay(now)
  for (const p of progress.values()) {
    if (!p.card) continue
    let k = Math.floor((p.card.due - start) / DAY_MS)
    if (k === 0 && p.lastGradedDay === today) continue
    if (k < 0) k = 0
    if (k < days) out[k]++
  }
  return out
}

export interface DayActivity {
  answers: number
  correct: number
  reviews: number
  newWords: number
  ms: number
}

export function activityByDay(events: readonly StudyEvent[]): Map<string, DayActivity> {
  const out = new Map<string, DayActivity>()
  const started = new Set<string>()
  for (const e of events) {
    if (e.voided || e.kind === 'reset' || e.kind === 'known') continue
    let a = out.get(e.day)
    if (!a) {
      a = { answers: 0, correct: 0, reviews: 0, newWords: 0, ms: 0 }
      out.set(e.day, a)
    }
    a.ms += e.ms ?? 0
    if (e.mode !== 'flash') {
      a.answers++
      if (e.ok) a.correct++
    }
    if (e.kind === 'review' && e.grade) a.reviews++
    if (e.kind === 'new' && !started.has(e.entryId)) {
      started.add(e.entryId)
      a.newWords++
    }
  }
  return out
}

/** Consecutive study days ending today (or yesterday, when today has no answers yet). */
export function streak(activity: ReadonlyMap<string, DayActivity>, today: string): number {
  let day = (activity.get(today)?.answers ?? 0) > 0 ? today : addDays(today, -1)
  let n = 0
  while ((activity.get(day)?.answers ?? 0) > 0) {
    n++
    day = addDays(day, -1)
  }
  return n
}

/** Share of graded reviews since `since` that were recalled (FSRS aims for the target retention). */
export function reviewRecallRate(events: readonly StudyEvent[], since: string): number | null {
  let ok = 0
  let n = 0
  for (const e of events) {
    if (e.voided || e.kind !== 'review' || !e.grade || e.day < since) continue
    n++
    if (e.grade > 1) ok++
  }
  return n ? Math.round((ok / n) * 100) : null
}
