import { describe, expect, it } from 'vitest'
import { areSiblings, ENTRIES, getEntry, relatedIds, siblingsOf } from '../data/words'
import { derive } from './derive'
import {
  applyAnswer,
  CHECKPOINT_EVERY,
  WINDOW_MAX,
  WINDOW_MIN,
  continueSession,
  createDailySession,
  createListSession,
  nextTask,
  undoLast,
  type Answer,
  type EngineCtx,
  type Session,
  type Task,
} from './engine'
import { makeScheduler } from './fsrs'
import { buildOrder } from './order'
import { buildPlan } from './plan'
import { rand, type Rng } from './rng'
import { DAY_MS, studyDay } from './time'
import type { Progress, StudyEvent } from './types'

const f = makeScheduler(0.9, false)
const ORDER = buildOrder('mixed')
const T0 = new Date(2026, 8, 1, 9, 0, 0).getTime()

type Learner = (task: Task, rng: Rng) => [Answer, Rng]
const perfect: Learner = (task, rng) => [task.mode === 'flash' ? { correct: false, knew: false } : { correct: true }, rng]
const knowsAll: Learner = (task, rng) => [task.mode === 'flash' ? { correct: true, knew: true } : { correct: true }, rng]
const shaky =
  (pWrong: number): Learner =>
  (task, rng) => {
    const [r, next] = rand(rng)
    if (task.mode === 'flash') return [{ correct: r > 0.7, knew: r > 0.7 }, next]
    return [{ correct: r >= pWrong }, next]
  }

function run(session: Session, learner: Learner, seed: Rng, now: number, progress = new Map<string, Progress>(), prior: StudyEvent[] = []) {
  const events: StudyEvent[] = []
  const shown: Task[] = []
  let s = session
  let rng = seed
  let n = 0
  const ctx: EngineCtx = {
    now,
    day: studyDay(now),
    device: 'test',
    newId: () => `ev${String(n++).padStart(6, '0')}`,
    progress: (id) => progress.get(id),
  }
  for (let step = 0; step < 5000; step++) {
    s = nextTask(s, ctx)
    if (s.phase === 'checkpoint') {
      s = continueSession(s)
      continue
    }
    if (s.phase === 'done') return { s, events, shown, finished: true, progress }
    const task = s.cur!
    shown.push(task)
    let answer: Answer
    ;[answer, rng] = learner(task, rng)
    const r = applyAnswer(s, answer, ctx)
    s = r.session
    events.push(r.event)
    const all = [...prior, ...events].filter((e) => e.entryId === task.id)
    progress.set(task.id, derive(task.id, all, f))
  }
  return { s, events, shown, finished: false, progress }
}

function newDay(ids: string[], now = T0, windowSize = 8) {
  return createDailySession({ day: studyDay(now), now, dueIds: [], newIds: ids, carryIds: [], windowSize })
}

const backToBack = (shown: Task[]) => shown.filter((t, k) => k > 0 && shown[k - 1].id === t.id).length
const siblingAdjacent = (shown: Task[]) => shown.filter((t, k) => k > 0 && areSiblings(shown[k - 1].id, t.id)).length

describe('engine: new words', () => {
  const ids = ORDER.slice(0, 40)

  it('walks every word through flash, two MCQs, then the sweep', () => {
    const { finished, events, shown } = run(newDay(ids), perfect, 1, T0)
    expect(finished).toBe(true)
    for (const id of ids) {
      const modes = shown.filter((t) => t.id === id && t.kind !== 'filler').map((t) => (t.mode.startsWith('mcq') ? 'mcq' : t.mode))
      expect(modes).toEqual(['flash', 'mcq', 'mcq', 'explain'])
      const grades = events.filter((e) => e.entryId === id && e.grade)
      expect(grades).toHaveLength(1)
      expect(grades[0].grade).toBe(3)
    }
    expect(backToBack(shown)).toBe(0)
  })

  it('fast-tracks words you already know', () => {
    const { finished, events, shown } = run(newDay(ids), knowsAll, 2, T0)
    expect(finished).toBe(true)
    for (const id of ids) {
      expect(shown.filter((t) => t.id === id && t.kind !== 'filler').map((t) => t.mode)).toEqual(['flash', getEntry(id).exs?.length ? 'mcq-blank' : 'mcq-d2w', 'explain'])
      expect(events.find((e) => e.entryId === id && e.grade)?.grade).toBe(4)
    }
  })

  it('always finishes and keeps its promises for a shaky learner (300 seeds)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const start = T0 + seed * 1000
      const { finished, events, shown } = run(newDay(ORDER.slice(seed % 500, (seed % 500) + 30), start), shaky(0.3), seed, start)
      expect(finished).toBe(true)
      expect(backToBack(shown)).toBe(0)
      expect(siblingAdjacent(shown)).toBe(0)
      const perDay = new Map<string, number>()
      for (const e of events) {
        if (!e.grade || e.amend) continue
        const k = `${e.entryId}:${e.day}`
        perDay.set(k, (perDay.get(k) ?? 0) + 1)
      }
      expect([...perDay.values()].every((c) => c === 1)).toBe(true)
      const graduated = new Set(events.filter((e) => e.kind === 'new' && e.grade).map((e) => e.entryId))
      expect(graduated.size).toBe(30)
    }
  }, 60_000)

  it('makes a failed sweep word due tomorrow', () => {
    const failSweep: Learner = (task, rng) => [
      task.mode === 'flash' ? { correct: false, knew: false } : { correct: task.kind !== 'sweep' },
      rng,
    ]
    const { events, progress } = run(newDay(ids.slice(0, 5)), failSweep, 3, T0)
    for (const id of ids.slice(0, 5)) {
      expect(events.some((e) => e.entryId === id && e.amend === 1 && e.grade === 1)).toBe(true)
      expect(Math.round((progress.get(id)!.due - T0) / DAY_MS)).toBe(1)
    }
  })
  it('a Roughly sweep amends the day to Hard', () => {
    const rough: Learner = (task, rng) => [
      task.mode === 'flash' ? { correct: false, knew: false } : { correct: true, rough: task.kind === 'sweep' },
      rng,
    ]
    const { events, progress } = run(newDay(ids.slice(0, 5)), rough, 9, T0)
    for (const id of ids.slice(0, 5)) {
      expect(events.some((e) => e.entryId === id && e.amend === 1 && e.grade === 2 && e.hint === 1)).toBe(true)
      expect(Math.round((progress.get(id)!.due - T0) / DAY_MS)).toBeLessThanOrEqual(2)
    }
  })
})

describe('engine: window of new words', () => {
  const ids = ORDER.slice(0, 40)
  const liveNew = (s: Session) => s.pool.filter((x) => x.phase === 'new' && !x.done).map((x) => x.id)

  it('grows when every recall succeeds, up to the maximum', () => {
    const { s } = run(newDay(ids), perfect, 1, T0)
    expect(s.windowSize).toBeGreaterThan(8)
    expect(s.windowSize).toBeLessThanOrEqual(WINDOW_MAX)
  })

  it('shrinks to the minimum when half the answers miss', () => {
    const { s, finished } = run(newDay(ids), shaky(0.5), 7, T0)
    expect(finished).toBe(true)
    expect(s.windowSize).toBe(WINDOW_MIN)
  })

  it('never has more new words in play than the window allows', () => {
    let s = newDay(ids, T0, 30)
    expect(s.windowSize).toBe(WINDOW_MAX)
    const ctx: EngineCtx = { now: T0, day: studyDay(T0), device: 't', newId: () => crypto.randomUUID(), progress: () => undefined }
    let rng: Rng = 3
    for (let k = 0; k < 400 && s.phase !== 'done'; k++) {
      s = nextTask(s, ctx)
      if (s.phase === 'checkpoint') {
        s = continueSession(s)
        continue
      }
      if (!s.cur) break
      expect(liveNew(s).length).toBeLessThanOrEqual(WINDOW_MAX)
      let a: Answer
      ;[a, rng] = shaky(0.2)(s.cur, rng)
      s = applyAnswer(s, a, ctx).session
    }
  })

  it('recaps every 8 graduations whatever the window size', () => {
    for (const size of [4, 12]) {
      let s = newDay(ids.slice(0, 20), T0, size)
      const ctx: EngineCtx = { now: T0, day: studyDay(T0), device: 't', newId: () => crypto.randomUUID(), progress: () => undefined }
      const recaps: number[] = []
      for (let k = 0; k < 1000 && s.phase !== 'done'; k++) {
        s = nextTask(s, ctx)
        if (s.phase === 'checkpoint') {
          recaps.push(s.recap.length)
          s = continueSession(s)
          continue
        }
        if (!s.cur) break
        s = applyAnswer(s, perfect(s.cur, 0)[0], ctx).session
      }
      expect(recaps).toEqual([CHECKPOINT_EVERY, CHECKPOINT_EVERY, 4])
    }
  })

  it('keeps a near synonym out of the window while its partner is in play', () => {
    const a = ENTRIES.find((e) => e.syn?.length && siblingsOf(e.id).length === 0)!
    const b = a.syn![0]
    const near = new Set([a.id, b, ...relatedIds(a.id), ...relatedIds(b)])
    const fillers = ORDER.filter((id) => !near.has(id) && ![...near].some((n) => areSiblings(n, id) || relatedIds(id).has(n))).slice(0, 12)
    const s = nextTask(newDay([a.id, b, ...fillers]), { now: T0, day: studyDay(T0), device: 't', newId: () => 'x', progress: () => undefined })
    expect(liveNew(s)).toContain(a.id)
    expect(liveNew(s)).not.toContain(b)
    expect(s.newQueue[0].id).toBe(b)
  })
})

describe('engine: reviews', () => {
  it('grades each due word once, relearns misses, and moves due dates forward', () => {
    const ids = ORDER.slice(0, 30)
    const day1 = run(newDay(ids), perfect, 4, T0)
    const later = T0 + 3 * DAY_MS
    const plan = buildPlan({ progress: day1.progress, order: ORDER, settings: { newPerDay: 0, budgetMin: 60 }, now: later, suspended: new Set() })
    expect(plan.dueIds.sort()).toEqual([...ids].sort())
    const session = createDailySession({ day: plan.day, now: later, dueIds: plan.dueIds, newIds: [], carryIds: [], windowSize: 8 })
    const day4 = run(session, shaky(0.3), 5, later, day1.progress, day1.events)
    expect(day4.finished).toBe(true)
    for (const id of ids) {
      const graded = day4.events.filter((e) => e.entryId === id && e.grade)
      expect(graded).toHaveLength(1)
      expect(graded[0].kind).toBe('review')
      if (graded[0].grade === 1) {
        expect(day4.events.filter((e) => e.entryId === id && e.kind === 'relearn').length).toBeGreaterThanOrEqual(2)
      }
      expect(day4.progress.get(id)!.due).toBeGreaterThan(later)
    }
    expect(backToBack(day4.shown)).toBe(0)
    expect(day4.shown.every((t) => t.mode === 'explain' || t.mode.startsWith('mcq'))).toBe(true)
  })

  it('grades a Roughly review as Hard', () => {
    const ids = ORDER.slice(0, 10)
    const day1 = run(newDay(ids), perfect, 10, T0)
    const later = T0 + 3 * DAY_MS
    const session = createDailySession({ day: studyDay(later), now: later, dueIds: ids, newIds: [], carryIds: [], windowSize: 8 })
    const rough: Learner = (task, rng) => [{ correct: true, rough: task.mode === 'explain' }, rng]
    const day4 = run(session, rough, 11, later, day1.progress, day1.events)
    for (const e of day4.events.filter((e) => e.grade)) expect(e.grade).toBe(e.mode === 'explain' ? 2 : 3)
  })

  it('shrinks new words when reviews eat the budget', () => {
    const progress = new Map<string, Progress>()
    const plan = buildPlan({ progress, order: ORDER, settings: { newPerDay: 40, budgetMin: 60 }, now: T0, suspended: new Set() })
    expect(plan.newIds.length).toBeGreaterThanOrEqual(40)
    expect(plan.newIds.length).toBeLessThanOrEqual(43)
    const tight = buildPlan({ progress, order: ORDER, settings: { newPerDay: 40, budgetMin: 10 }, now: T0, suspended: new Set() })
    expect(tight.newIds.length).toBeLessThanOrEqual(17)
  })

  it('honours an explicit session size over target and budget', () => {
    const progress = new Map<string, Progress>()
    const settings = { newPerDay: 30, budgetMin: 10 }
    const more = buildPlan({ progress, order: ORDER, settings, now: T0, suspended: new Set(), newCount: 45 })
    expect(more.newIds.length).toBeGreaterThanOrEqual(45)
    expect(more.newIds.length).toBeLessThanOrEqual(48)
    expect(buildPlan({ progress, order: ORDER, settings, now: T0, suspended: new Set(), newCount: 0 }).newIds).toEqual([])
  })
})

describe('engine: owed sweeps', () => {
  /** Runs a day until the sweep would start, then abandons it (app closed, drill started, other device). */
  function untilSweep(session: Session, now: number) {
    const progress = new Map<string, Progress>()
    const events: StudyEvent[] = []
    let n = 0
    const ctx: EngineCtx = { now, day: studyDay(now), device: 't', newId: () => `ow${String(n++).padStart(6, '0')}`, progress: (id) => progress.get(id) }
    let s = session
    for (let step = 0; step < 5000; step++) {
      s = nextTask(s, ctx)
      if (s.phase === 'checkpoint') {
        s = continueSession(s)
        continue
      }
      if (s.phase === 'sweep') break
      const r = applyAnswer(s, perfect(s.cur!, 1)[0], ctx)
      s = r.session
      events.push(r.event)
      progress.set(r.event.entryId, derive(r.event.entryId, events, f))
    }
    return { progress, events }
  }

  it('sweeps words whose sweep was skipped, amends their day and adds no new words', () => {
    const ids = ORDER.slice(0, 10)
    const day1 = untilSweep(newDay(ids), T0)
    for (const id of ids) expect(day1.progress.get(id)!.sweepDue).toBe(studyDay(T0))

    const later = T0 + 2 * 3600_000
    const plan = buildPlan({ progress: day1.progress, order: ORDER, settings: { newPerDay: 10, budgetMin: 60 }, now: later, suspended: new Set() })
    expect(plan.newIds).toEqual([])
    expect(plan.dueIds).toEqual([])
    expect(plan.sweep.map((x) => x.id).sort()).toEqual([...ids].sort())

    const session = createDailySession({ day: plan.day, now: later, dueIds: [], newIds: [], carryIds: [], sweep: plan.sweep, windowSize: 8 })
    expect(session.phase).toBe('sweep')
    const miss = ids[0]
    const learner: Learner = (task, rng) => [{ correct: !(task.id === miss && task.kind === 'sweep') }, rng]
    const r = run(session, learner, 3, later, day1.progress, day1.events)
    expect(r.finished).toBe(true)
    const swept = r.shown.filter((t) => t.kind === 'sweep')
    expect(swept.map((t) => t.id).sort()).toEqual([...ids].sort())
    const amended = r.events.find((e) => e.entryId === miss && e.amend)!
    expect(amended.grade).toBe(1)
    expect(amended.day).toBe(studyDay(T0))
    for (const id of ids) expect(r.progress.get(id)!.sweepDue).toBeNull()
    expect(buildPlan({ progress: r.progress, order: ORDER, settings: { newPerDay: 10, budgetMin: 60 }, now: later, suspended: new Set() }).sweep).toEqual([])
  })

  it("merges owed sweeps with the day's own sweep without duplicates", () => {
    const owed = ORDER.slice(0, 5)
    const day1 = untilSweep(newDay(owed), T0)
    const later = T0 + 3600_000
    const plan = buildPlan({ progress: day1.progress, order: ORDER.slice(5), settings: { newPerDay: 10, budgetMin: 60 }, now: later, suspended: new Set(), newCount: 5 })
    const session = createDailySession({ day: plan.day, now: later, dueIds: [], newIds: plan.newIds, carryIds: [], sweep: [...plan.sweep, ...plan.sweep], windowSize: 8 })
    const r = run(session, perfect, 4, later, day1.progress, day1.events)
    const swept = r.shown.filter((t) => t.kind === 'sweep').map((t) => t.id)
    expect(new Set(swept).size).toBe(swept.length)
    expect(swept.sort()).toEqual([...owed, ...plan.newIds].sort())
  })

  it('drops the debt once the word has been reviewed', () => {
    const ids = ORDER.slice(0, 5)
    const day1 = untilSweep(newDay(ids), T0)
    const later = T0 + 3 * DAY_MS
    const plan = buildPlan({ progress: day1.progress, order: ORDER, settings: { newPerDay: 0, budgetMin: 60 }, now: later, suspended: new Set() })
    expect(plan.dueIds.sort()).toEqual([...ids].sort())
    expect(plan.sweep).toEqual([])
    const session = createDailySession({ day: plan.day, now: later, dueIds: plan.dueIds, newIds: [], carryIds: [], sweep: plan.sweep, windowSize: 8 })
    const r = run(session, perfect, 5, later, day1.progress, day1.events)
    for (const id of ids) expect(r.progress.get(id)!.sweepDue).toBeNull()
  })
})

describe('engine: undo and list sessions', () => {
  it('undo restores the exact previous state', () => {
    const ctx: EngineCtx = { now: T0, day: studyDay(T0), device: 't', newId: () => 'x', progress: () => undefined }
    const s1 = nextTask(newDay(ORDER.slice(0, 10)), ctx)
    const { session: s2 } = applyAnswer(s1, { correct: false, knew: false }, ctx)
    const undone = undoLast(s2)!
    expect(undone.eventId).toBe('x')
    expect(undone.session).toEqual(s1)
  })

  it('drill never grades, test asks once, baseline passes graduate as known', () => {
    const ids = ORDER.slice(100, 120)
    const drill = run(createListSession('drill', ids, studyDay(T0), T0), shaky(0.3), 6, T0)
    expect(drill.finished).toBe(true)
    expect(drill.events.some((e) => e.grade)).toBe(false)

    const test = run(createListSession('test', ids, studyDay(T0), T0), shaky(0.5), 7, T0)
    expect(test.events.filter((e) => e.kind === 'test')).toHaveLength(20)

    const base = run(createListSession('baseline', ids, studyDay(T0), T0), perfect, 8, T0)
    expect(base.events.filter((e) => e.grade === 4)).toHaveLength(20)
    expect(base.progress.get(ids[0])!.known).toBe(true)
  })
})
