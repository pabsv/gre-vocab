import { createEmptyCard, fsrs, type Card, type FSRS, type Grade } from 'ts-fsrs'
import { DAY_MS } from './time'

/** ts-fsrs Card with dates stored as ms so it survives JSON and IndexedDB unchanged. */
export type CardRow = Omit<Card, 'due' | 'last_review'> & { due: number; last_review: number | null }

export const MAX_INTERVAL_DAYS = 120

export function makeScheduler(retention = 0.9, enableFuzz = true): FSRS {
  return fsrs({
    request_retention: retention,
    maximum_interval: MAX_INTERVAL_DAYS,
    enable_fuzz: enableFuzz,
    // Same-day steps are handled by the session engine; FSRS only schedules whole days.
    enable_short_term: false,
  })
}

const toRow = (c: Card): CardRow => ({
  ...c,
  due: c.due.getTime(),
  last_review: c.last_review ? c.last_review.getTime() : null,
})

/** Applies one grade. `at` is clamped so time never runs backwards (device clock skew). */
export function applyGrade(f: FSRS, card: CardRow | null, at: number, grade: Grade): CardRow {
  const base = card ?? toRow(createEmptyCard(at))
  const when = Math.max(at, base.last_review ?? 0)
  return f.next({ ...base, last_review: base.last_review ?? undefined }, when, grade, ({ card: next }) => toRow(next))
}

/** Probability of recall right now (smooth, fractional days). */
export function recallProbability(f: FSRS, card: CardRow, now: number): number {
  if (!card.last_review || card.stability <= 0) return 0
  const days = Math.max(0, (now - card.last_review) / DAY_MS)
  return f.forgetting_curve(days, card.stability)
}

export type Bucket = 'new' | 'learning' | 'familiar' | 'mastered'

/** Mastery bucket from FSRS stability (days until recall drops to 90%). */
export function bucketOf(card: CardRow | null): Bucket {
  if (!card) return 'new'
  if (card.stability >= 21) return 'mastered'
  if (card.stability >= 7) return 'familiar'
  return 'learning'
}
