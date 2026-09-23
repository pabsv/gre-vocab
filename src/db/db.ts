import Dexie, { type EntityTable } from 'dexie'
import type { Session } from '../core/engine'
import type { Progress, StudyEvent } from '../core/types'

/** Local copy of an event. `pushed` and `v` never leave the device. */
export interface EventRow extends StudyEvent {
  pushed: 0 | 1
  /** Bumped on every local change, so a push that raced an undo does not mark the row clean. */
  v: number
}

/** Settings, notes, stars and suspensions: last write wins per key. */
export interface MetaRow {
  key: string
  value: unknown
  updatedAt: number
  pushed: 0 | 1
}

export interface SessionRow {
  id: 'current'
  session: Session
  savedAt: number
}

export interface KvRow {
  key: string
  value: unknown
}

export class GreDb extends Dexie {
  events!: EntityTable<EventRow, 'id'>
  progress!: EntityTable<Progress, 'entryId'>
  meta!: EntityTable<MetaRow, 'key'>
  session!: EntityTable<SessionRow, 'id'>
  kv!: EntityTable<KvRow, 'key'>

  constructor(name = 'gre-vocab') {
    super(name)
    this.version(1).stores({
      events: 'id, entryId, [entryId+at], day, pushed',
      progress: 'entryId, due',
      meta: 'key, pushed',
      session: 'id',
      kv: 'key',
    })
  }
}

export const db = new GreDb()
