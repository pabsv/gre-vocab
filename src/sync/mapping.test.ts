import { describe, expect, it } from 'vitest'
import type { StudyEvent } from '../core/types'
import { afterFilter, eventFromRemote, eventToRemote, metaFromRemote, metaToRemote } from './mapping'

describe('sync mapping', () => {
  it('round-trips events without losing fields', () => {
    const e: StudyEvent = {
      id: '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
      entryId: 'austere-adj2',
      at: Date.UTC(2026, 8, 23, 18, 30, 5, 250),
      day: '2026-09-23',
      kind: 'sweep',
      mode: 'explain',
      ok: 0,
      grade: 1,
      amend: 1,
      confusedWith: 'ascetic-adj',
      answer: 'plain',
      ms: 4200,
      device: 'dev-a',
      voided: 0,
    }
    expect(eventFromRemote(eventToRemote(e))).toEqual(e)
    const minimal: StudyEvent = { ...e, grade: undefined, amend: undefined, confusedWith: undefined, answer: undefined, ms: undefined }
    for (const k of ['grade', 'amend', 'confusedWith', 'answer', 'ms'] as const) delete minimal[k]
    expect(eventFromRemote(eventToRemote(minimal))).toEqual(minimal)
  })

  it('round-trips meta rows', () => {
    const row = { key: 'note:abjure', value: 'ab = away, jure = swear', updatedAt: Date.UTC(2026, 8, 23), pushed: 0 as const }
    const { pushed: _p, ...rest } = row
    void _p
    expect(metaFromRemote(metaToRemote(row))).toEqual(rest)
  })

  it('builds a quoted keyset filter', () => {
    expect(afterFilter('2026-09-23T18:00:00.123456+00:00', 'id', 'abc')).toBe(
      'synced_at.gt."2026-09-23T18:00:00.123456+00:00",and(synced_at.eq."2026-09-23T18:00:00.123456+00:00",id.gt."abc")',
    )
  })
})
