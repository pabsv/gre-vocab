import { describe, expect, it } from 'vitest'
import { derive, missScoreAt } from './derive'
import { applyGrade, bucketOf, makeScheduler, recallProbability } from './fsrs'
import { DAY_MS, studyDay } from './time'
import type { GradeValue, StudyEvent } from './types'

const f = makeScheduler(0.9, false)
const T0 = new Date(2026, 8, 1, 10, 0, 0).getTime()

let n = 0
function ev(at: number, over: Partial<StudyEvent> = {}): StudyEvent {
  return {
    id: `e${String(n++).padStart(5, '0')}`,
    entryId: 'abate',
    at,
    day: studyDay(at),
    kind: 'review',
    mode: 'type',
    ok: 1,
    device: 't',
    voided: 0,
    ...over,
  }
}

describe('fsrs wrapper', () => {
  it('gives new-card intervals of 1/2/3/8 days', () => {
    const days = ([1, 2, 3, 4] as GradeValue[]).map((g) => Math.round((applyGrade(f, null, T0, g).due - T0) / DAY_MS))
    expect(days).toEqual([1, 2, 3, 8])
  })

  it('reports recall probability and buckets', () => {
    const c = applyGrade(f, null, T0, 3)
    expect(recallProbability(f, c, T0)).toBeCloseTo(1, 5)
    expect(recallProbability(f, c, T0 + 30 * DAY_MS)).toBeLessThan(0.9)
    expect(bucketOf(null)).toBe('new')
    expect(bucketOf(c)).toBe('learning')
  })
})

describe('derive', () => {
  it('uses one grade per study day and lets the sweep amend it', () => {
    const graduate = ev(T0, { kind: 'new', grade: 3 })
    const sameDayAgain = ev(T0 + 60_000, { kind: 'review', grade: 1, ok: 0 })
    const p1 = derive('abate', [graduate, sameDayAgain], f)
    expect(Math.round((p1.due - T0) / DAY_MS)).toBe(3)

    const sweepFail = ev(T0 + 3_600_000, { kind: 'sweep', mode: 'explain', ok: 0, grade: 1, amend: 1 })
    const p2 = derive('abate', [graduate, sweepFail], f)
    expect(Math.round((p2.due - T0) / DAY_MS)).toBe(1)
    expect(p2.firstDay).toBe(studyDay(T0))
  })

  it('ignores voided events and everything before a reset', () => {
    const a = ev(T0, { kind: 'new', grade: 3 })
    const voided = { ...ev(T0 + DAY_MS * 3, { grade: 1, ok: 0 }), voided: 1 as const }
    expect(derive('abate', [a, voided], f).wrong).toBe(0)
    const reset = ev(T0 + DAY_MS, { kind: 'reset', mode: null })
    const p = derive('abate', [a, reset], f)
    expect(p.card).toBeNull()
    expect(p.firstDay).toBeNull()
  })

  it('tracks mistakes, confusions and directions', () => {
    const miss = ev(T0, { mode: 'type', ok: 0, confusedWith: 'abet' })
    const hit = ev(T0 + 1000, { mode: 'explain', ok: 1 })
    const p = derive('abate', [miss, hit], f)
    expect(p.wrong).toBe(1)
    expect(p.confusions).toEqual({ abet: 1 })
    expect(p.dir.type).toEqual([0, 1])
    expect(p.dir.explain).toEqual([1, 1])
    expect(p.missScore).toBeCloseTo(0.6, 3)
    expect(missScoreAt(p, T0 + 1000 + 14 * DAY_MS)).toBeCloseTo(0.3, 3)
  })
})
