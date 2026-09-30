import type { FSRS } from 'ts-fsrs'
import { DERIVE_VERSION, derive } from '../core/derive'
import type { Session } from '../core/engine'
import type { Progress, StudyEvent } from '../core/types'
import { db as defaultDb, type EventRow, type GreDb, type MetaRow } from './db'

const stripLocal = ({ pushed: _p, v: _v, ...e }: EventRow): StudyEvent => {
  void _p
  void _v
  return e
}

export async function getDeviceId(db: GreDb = defaultDb): Promise<string> {
  const row = await db.kv.get('deviceId')
  if (row && typeof row.value === 'string') return row.value
  const id = crypto.randomUUID()
  await db.kv.put({ key: 'deviceId', value: id })
  return id
}

export async function loadState(db: GreDb = defaultDb) {
  const [progress, meta, sessionRow] = await Promise.all([db.progress.toArray(), db.meta.toArray(), db.session.get('current')])
  return {
    progress: new Map(progress.map((p) => [p.entryId, p])),
    meta: new Map(meta.map((m) => [m.key, m.value])),
    session: sessionRow?.session ?? null,
  }
}

async function rederiveEntry(db: GreDb, entryId: string, f: FSRS): Promise<Progress> {
  const rows = await db.events.where('entryId').equals(entryId).toArray()
  const p = derive(entryId, rows, f)
  await db.progress.put(p)
  return p
}

/** Writes the answer, the entry's new progress and the session in one transaction. */
export async function recordAnswer(event: StudyEvent, session: Session | null, f: FSRS, db: GreDb = defaultDb): Promise<Progress> {
  return db.transaction('rw', db.events, db.progress, db.session, async () => {
    await db.events.add({ ...event, pushed: 0, v: 1 })
    if (session) await db.session.put({ id: 'current', session, savedAt: Date.now() })
    return rederiveEntry(db, event.entryId, f)
  })
}

/** Voids an event (undo) and restores the session. Returns the entry's new progress. */
export async function voidEvent(eventId: string, session: Session | null, f: FSRS, db: GreDb = defaultDb): Promise<Progress | null> {
  return db.transaction('rw', db.events, db.progress, db.session, async () => {
    const row = await db.events.get(eventId)
    if (session) await db.session.put({ id: 'current', session, savedAt: Date.now() })
    else await db.session.delete('current')
    if (!row) return null
    await db.events.put({ ...row, voided: 1, pushed: 0, v: row.v + 1 })
    return rederiveEntry(db, row.entryId, f)
  })
}

export async function saveSession(session: Session | null, db: GreDb = defaultDb): Promise<void> {
  if (session) await db.session.put({ id: 'current', session, savedAt: Date.now() })
  else await db.session.delete('current')
}

/** Adds manual events (mark known, reset) and re-derives the touched entries. */
export async function addEvents(events: StudyEvent[], f: FSRS, db: GreDb = defaultDb): Promise<Progress[]> {
  return db.transaction('rw', db.events, db.progress, async () => {
    await db.events.bulkAdd(events.map((e) => ({ ...e, pushed: 0 as const, v: 1 })))
    const ids = [...new Set(events.map((e) => e.entryId))]
    const out: Progress[] = []
    for (const id of ids) out.push(await rederiveEntry(db, id, f))
    return out
  })
}

export async function setMeta(key: string, value: unknown, db: GreDb = defaultDb, updatedAt = Date.now()): Promise<MetaRow> {
  const row: MetaRow = { key, value, updatedAt, pushed: 0 }
  await db.meta.put(row)
  return row
}

/** Re-derives every entry from its events (after a sync pull, an import or a retention change). */
export async function rebuildAll(f: FSRS, db: GreDb = defaultDb, only?: Iterable<string>): Promise<Map<string, Progress>> {
  return db.transaction('rw', db.events, db.progress, async () => {
    const rows = only ? await db.events.where('entryId').anyOf([...only]).toArray() : await db.events.toArray()
    const byEntry = new Map<string, EventRow[]>()
    for (const r of rows) {
      const list = byEntry.get(r.entryId)
      if (list) list.push(r)
      else byEntry.set(r.entryId, [r])
    }
    const out = new Map<string, Progress>()
    for (const [id, list] of byEntry) out.set(id, derive(id, list, f))
    if (!only) await db.progress.clear()
    await db.progress.bulkPut([...out.values()])
    return out
  })
}

/** Rebuilds cached progress when it was derived by an older version. Returns null when current. */
export async function ensureDerived(f: FSRS, db: GreDb = defaultDb): Promise<Map<string, Progress> | null> {
  const row = await db.kv.get('deriveVersion')
  if (row?.value === DERIVE_VERSION) return null
  const out = await rebuildAll(f, db)
  await db.kv.put({ key: 'deriveVersion', value: DERIVE_VERSION })
  return out
}

export interface ExportFile {
  app: 'gre-vocab'
  version: 1
  exportedAt: string
  events: StudyEvent[]
  meta: Omit<MetaRow, 'pushed'>[]
}

export async function exportData(db: GreDb = defaultDb): Promise<ExportFile> {
  const [events, meta] = await Promise.all([db.events.toArray(), db.meta.toArray()])
  return {
    app: 'gre-vocab',
    version: 1,
    exportedAt: new Date().toISOString(),
    events: events.map(stripLocal),
    meta: meta.map(({ pushed: _p, ...m }) => {
      void _p
      return m
    }),
  }
}

/**
 * Merges events by id (a void on either side wins) and meta by newest `updatedAt`.
 * Returns the number of events that were new or changed.
 */
export async function mergeEvents(incoming: StudyEvent[], pushed: 0 | 1, db: GreDb = defaultDb): Promise<string[]> {
  return db.transaction('rw', db.events, async () => {
    const existing = await db.events.bulkGet(incoming.map((e) => e.id))
    const writes: EventRow[] = []
    const touched = new Set<string>()
    incoming.forEach((e, k) => {
      const cur = existing[k]
      if (!cur) {
        writes.push({ ...e, voided: e.voided ? 1 : 0, pushed, v: 1 })
        touched.add(e.entryId)
      } else if (e.voided && !cur.voided) {
        writes.push({ ...cur, voided: 1, v: cur.v + 1, pushed: cur.pushed })
        touched.add(e.entryId)
      }
    })
    if (writes.length) await db.events.bulkPut(writes)
    return [...touched]
  })
}

export async function mergeMeta(incoming: Omit<MetaRow, 'pushed'>[], pushed: 0 | 1, db: GreDb = defaultDb): Promise<number> {
  return db.transaction('rw', db.meta, async () => {
    const existing = await db.meta.bulkGet(incoming.map((m) => m.key))
    const writes: MetaRow[] = []
    incoming.forEach((m, k) => {
      const cur = existing[k]
      if (!cur || cur.updatedAt < m.updatedAt) writes.push({ ...m, pushed })
    })
    if (writes.length) await db.meta.bulkPut(writes)
    return writes.length
  })
}

export async function importData(file: ExportFile, f: FSRS, db: GreDb = defaultDb): Promise<{ events: number; meta: number }> {
  if (file.app !== 'gre-vocab' || file.version !== 1) throw new Error('Not a GRE Vocab export')
  const touched = await mergeEvents(file.events, 0, db)
  const meta = await mergeMeta(file.meta, 0, db)
  await rebuildAll(f, db)
  return { events: touched.length, meta }
}
