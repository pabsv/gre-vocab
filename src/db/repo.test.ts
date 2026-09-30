import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { applyAnswer, createDailySession, nextTask, type EngineCtx } from '../core/engine'
import { makeScheduler } from '../core/fsrs'
import { buildOrder } from '../core/order'
import { studyDay } from '../core/time'
import type { StudyEvent } from '../core/types'
import { GreDb } from './db'
import { addEvents, ensureDerived, exportData, importData, loadState, mergeEvents, recordAnswer, voidEvent } from './repo'

const f = makeScheduler(0.9, false)
const T0 = new Date(2026, 8, 1, 9, 0, 0).getTime()
const freshDb = () => new GreDb(`test-${crypto.randomUUID()}`)

function event(over: Partial<StudyEvent>): StudyEvent {
  return { id: crypto.randomUUID(), entryId: 'abate', at: T0, day: studyDay(T0), kind: 'new', mode: 'type', ok: 1, device: 'd', voided: 0, ...over }
}

describe('repo', () => {
  it('persists answer, progress and session together, and resumes the same task', async () => {
    const db = freshDb()
    const ctx: EngineCtx = { now: T0, day: studyDay(T0), device: 'd', newId: () => crypto.randomUUID(), progress: () => undefined }
    const ids = buildOrder('mixed').slice(0, 8)
    let s = nextTask(createDailySession({ day: ctx.day, now: T0, dueIds: [], newIds: ids, carryIds: [], windowSize: 8 }), ctx)
    const r = applyAnswer(s, { correct: false, knew: false }, ctx)
    s = nextTask(r.session, ctx)
    await recordAnswer(r.event, s, f, db)
    const loaded = await loadState(db)
    expect(loaded.session?.cur).toEqual(s.cur)
    expect(loaded.progress.get(r.event.entryId)?.firstDay).toBe(ctx.day)
    expect(await db.events.count()).toBe(1)
  })

  it('rebuilds progress cached by an older derive once, keeping every event', async () => {
    const db = freshDb()
    const e = event({ grade: 3, mode: 'mcq-blank' })
    const p = await recordAnswer(e, null, f, db)
    const { sweepDue: _s, ...stale } = p
    void _s
    await db.progress.put(stale as typeof p)
    const rebuilt = await ensureDerived(f, db)
    expect(rebuilt?.get('abate')?.sweepDue).toBe(e.day)
    expect((await loadState(db)).progress.get('abate')?.sweepDue).toBe(e.day)
    expect(await db.events.count()).toBe(1)
    expect(await ensureDerived(f, db)).toBeNull()
  })

  it('undo voids the event and re-derives progress', async () => {
    const db = freshDb()
    const e = event({ grade: 3 })
    const p1 = await recordAnswer(e, null, f, db)
    expect(p1.card).not.toBeNull()
    const p2 = await voidEvent(e.id, null, f, db)
    expect(p2?.card).toBeNull()
    expect((await db.events.get(e.id))?.voided).toBe(1)
  })

  it('round-trips through export and import', async () => {
    const a = freshDb()
    await addEvents([event({ grade: 3 }), event({ entryId: 'abjure', grade: 4 })], f, a)
    const file = await exportData(a)
    const b = freshDb()
    await importData(JSON.parse(JSON.stringify(file)), f, b)
    const [pa, pb] = await Promise.all([loadState(a), loadState(b)])
    expect([...pb.progress.keys()].sort()).toEqual([...pa.progress.keys()].sort())
    expect(pb.progress.get('abjure')?.due).toBe(pa.progress.get('abjure')?.due)
  })

  it('merges events: unknown ids are added, a remote void wins', async () => {
    const db = freshDb()
    const e = event({ grade: 3 })
    await addEvents([e], f, db)
    const touched = await mergeEvents([{ ...e, voided: 1 }, event({ entryId: 'abjure' })], 1, db)
    expect(touched.sort()).toEqual(['abate', 'abjure'])
    expect((await db.events.get(e.id))?.voided).toBe(1)
  })
})
