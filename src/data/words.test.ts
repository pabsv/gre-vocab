import { describe, expect, it } from 'vitest'
import { BY_WORD, ENTRIES, areSiblings, getEntry, relatedIds, siblingsOf } from './words'

describe('words.json', () => {
  it('has every Magoosh sense, tiered', () => {
    expect(ENTRIES).toHaveLength(1066)
    expect(BY_WORD.size).toBe(997)
    const tiers = ENTRIES.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.tier]: (acc[e.tier] ?? 0) + 1 }), {})
    expect(tiers).toEqual({ common: 323, basic: 376, advanced: 367 })
  })

  it('keeps sense groups together', () => {
    expect(siblingsOf('austere-adj1').map((e) => e.id)).toEqual(['austere-adj2', 'austere-adj3'])
    expect(areSiblings('qualify-1', 'qualify-2')).toBe(true)
    expect(getEntry('qualify-1').pos).toBe('verb')
  })

  it('has symmetric synonym links and valid spans', () => {
    for (const e of ENTRIES) {
      for (const s of relatedIds(e.id)) expect(relatedIds(s).has(e.id)).toBe(true)
      for (const x of e.exs ?? []) {
        expect(x.span[1]).toBeLessThanOrEqual(x.t.length)
        expect(x.t.slice(x.span[0], x.span[1])).toMatch(/^[A-Za-z][A-Za-z' -]*[a-z]$/)
      }
      expect(e.def).not.toMatch(/&[a-z#0-9]+;/)
    }
  })
})
