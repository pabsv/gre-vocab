import { describe, expect, it } from 'vitest'
import { emptyProgress } from './derive'
import { applyGrade, makeScheduler } from './fsrs'
import { activityByDay, bestStreak, bucketCounts, confusionPairs, forecast, startedByDay, streak } from './stats'
import { DAY_MS, studyDay } from './time'
import type { Progress, StudyEvent } from './types'

const f = makeScheduler(0.9, false)
const T0 = new Date(2026, 8, 10, 10, 0, 0).getTime()

function graded(id: string, at: number, grade: 1 | 2 | 3 | 4): Progress {
  const card = applyGrade(f, null, at, grade)
  return { ...emptyProgress(id), card, due: card.due, firstDay: studyDay(at), lastGradedDay: studyDay(at) }
}

function ev(day: string, over: Partial<StudyEvent> = {}): StudyEvent {
  return { id: crypto.randomUUID(), entryId: 'abate', at: T0, day, kind: 'review', mode: 'type', ok: 1, device: 'd', voided: 0, ...over }
}

describe('stats', () => {
  it('counts buckets over the whole deck', () => {
    const progress = new Map([['aberrant', graded('aberrant', T0, 3)]])
    const c = bucketCounts(progress)
    expect(c.learning).toBe(1)
    expect(c.new + c.learning + c.familiar + c.mastered).toBe(1066)
  })

  it('forecasts due reviews by study day', () => {
    const progress = new Map([
      ['a', graded('a', T0, 1)],
      ['b', graded('b', T0, 3)],
      ['c', graded('c', T0 - 10 * DAY_MS, 1)],
    ])
    const days = forecast(progress, T0, 5)
    expect(days[0]).toBe(1) // c is overdue
    expect(days[1]).toBe(1) // a: 1 day
    expect(days[3]).toBe(1) // b: 3 days
  })

  it('aggregates confusion pairs once per pair', () => {
    const a = { ...emptyProgress('errant'), confusions: { arrant: 2 } }
    const b = { ...emptyProgress('arrant'), confusions: { errant: 1 } }
    expect(confusionPairs(new Map<string, Progress>([['errant', a], ['arrant', b]]))).toEqual([{ a: 'arrant', b: 'errant', count: 3 }])
  })

  it('computes activity and streaks', () => {
    const today = studyDay(T0)
    const yesterday = studyDay(T0 - DAY_MS)
    const act = activityByDay([ev(today), ev(yesterday, { ok: 0 }), ev(yesterday, { kind: 'new', entryId: 'x' })])
    expect(act.get(yesterday)).toMatchObject({ answers: 2, correct: 1, newWords: 1 })
    expect(streak(act, today)).toBe(2)
    expect(streak(act, studyDay(T0 + DAY_MS))).toBe(2)
    expect(streak(act, studyDay(T0 + 3 * DAY_MS))).toBe(0)
  })

  it('finds the longest streak anywhere in the history', () => {
    const activity = activityByDay([
      ev('2026-09-01'),
      ev('2026-09-02'),
      ev('2026-09-03'),
      ev('2026-09-05'),
      ev('2026-09-06'),
    ])
    expect(bestStreak(activity)).toBe(3)
    expect(bestStreak(new Map())).toBe(0)
  })

  it('accumulates words started, counting days before the window', () => {
    const activity = activityByDay([
      ev('2026-09-01', { kind: 'new', entryId: 'a' }),
      ev('2026-09-03', { kind: 'new', entryId: 'b' }),
      ev('2026-09-03', { kind: 'new', entryId: 'c' }),
    ])
    expect(startedByDay(activity, ['2026-09-02', '2026-09-03', '2026-09-04'])).toEqual([1, 3, 3])
  })
})
