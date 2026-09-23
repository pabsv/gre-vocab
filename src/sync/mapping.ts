import type { EventKind, GradeValue, Mode, StudyEvent } from '../core/types'
import type { MetaRow } from '../db/db'

/** Row shape of public.gre_events (owner_id and synced_at are set by the server). */
export interface RemoteEvent {
  id: string
  entry_id: string
  at: string
  day: string
  kind: string
  mode: string | null
  ok: number
  typo: number | null
  hint: number | null
  grade: number | null
  amend: number | null
  confused_with: string | null
  answer: string | null
  ms: number | null
  device: string
  voided: boolean
  synced_at?: string
}

export interface RemoteMeta {
  key: string
  value: unknown
  updated_at: string
  synced_at?: string
}

export function eventToRemote(e: StudyEvent): RemoteEvent {
  return {
    id: e.id,
    entry_id: e.entryId,
    at: new Date(e.at).toISOString(),
    day: e.day,
    kind: e.kind,
    mode: e.mode,
    ok: e.ok,
    typo: e.typo ?? null,
    hint: e.hint ?? null,
    grade: e.grade ?? null,
    amend: e.amend ?? null,
    confused_with: e.confusedWith ?? null,
    answer: e.answer ?? null,
    ms: e.ms ?? null,
    device: e.device,
    voided: !!e.voided,
  }
}

export function eventFromRemote(r: RemoteEvent): StudyEvent {
  const e: StudyEvent = {
    id: r.id,
    entryId: r.entry_id,
    at: Date.parse(r.at),
    day: r.day,
    kind: r.kind as EventKind,
    mode: (r.mode as Mode | null) ?? null,
    ok: r.ok ? 1 : 0,
    device: r.device,
    voided: r.voided ? 1 : 0,
  }
  if (r.typo) e.typo = 1
  if (r.hint) e.hint = r.hint
  if (r.grade) e.grade = r.grade as GradeValue
  if (r.amend) e.amend = 1
  if (r.confused_with) e.confusedWith = r.confused_with
  if (r.answer) e.answer = r.answer
  if (r.ms) e.ms = r.ms
  return e
}

export function metaToRemote(m: MetaRow): RemoteMeta {
  return { key: m.key, value: m.value ?? null, updated_at: new Date(m.updatedAt).toISOString() }
}

export function metaFromRemote(r: RemoteMeta): Omit<MetaRow, 'pushed'> {
  return { key: r.key, value: r.value, updatedAt: Date.parse(r.updated_at) }
}

/** Keyset filter for paging by (synced_at, tiebreak); values quoted for PostgREST. */
export function afterFilter(syncedAt: string, tieColumn: string, tie: string): string {
  return `synced_at.gt."${syncedAt}",and(synced_at.eq."${syncedAt}",${tieColumn}.gt."${tie}")`
}
