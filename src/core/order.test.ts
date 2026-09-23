import { describe, expect, it } from 'vitest'
import { ENTRIES, getEntry } from '../data/words'
import { LOOKALIKE_GAP, buildOrder } from './order'

describe('buildOrder', () => {
  const order = buildOrder('mixed')

  it('contains every entry once and is deterministic', () => {
    expect(order).toHaveLength(ENTRIES.length)
    expect(new Set(order).size).toBe(ENTRIES.length)
    expect(buildOrder('mixed')).toEqual(order)
  })

  it('keeps senses of a word adjacent', () => {
    for (let k = 1; k < order.length; k++) {
      const a = getEntry(order[k - 1])
      const b = getEntry(order[k])
      if (b.sense > 1) expect(a.word).toBe(b.word)
    }
  })

  it('mixes tiers in proportion on every 40-word day', () => {
    for (let start = 0; start + 40 <= 1000; start += 40) {
      const common = order.slice(start, start + 40).filter((id) => getEntry(id).tier === 'common').length
      expect(common).toBeGreaterThanOrEqual(7)
      expect(common).toBeLessThanOrEqual(19)
    }
  })

  it('keeps look-alikes on different days', () => {
    const pos = new Map(order.map((id, k) => [getEntry(id).word.toLowerCase(), k]))
    let close = 0
    let pairs = 0
    for (const e of ENTRIES) {
      for (const w of e.look ?? []) {
        pairs++
        if (Math.abs(pos.get(e.word.toLowerCase())! - pos.get(w)!) < LOOKALIKE_GAP) close++
      }
    }
    expect(close / pairs).toBeLessThan(0.03)
  })
})
