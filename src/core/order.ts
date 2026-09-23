import { ENTRIES, type Entry, type Tier } from '../data/words'
import { hashSeed, shuffle } from './rng'
import type { OrderMode } from './types'

export const ORDER_SEED = 'gre-vocab-v1'
/** Look-alike headwords are kept at least this many entries apart so they land on different days. */
export const LOOKALIKE_GAP = 60

const TIERS: Tier[] = ['common', 'basic', 'advanced']

interface Group {
  word: string
  ids: string[]
  tier: Tier
  look: string[]
}

function toGroups(entries: readonly Entry[]): Group[] {
  const map = new Map<string, Group>()
  for (const e of [...entries].sort((a, b) => a.rank - b.rank)) {
    const word = e.word.toLowerCase()
    const g = map.get(word)
    if (g) g.ids.push(e.id)
    else map.set(word, { word, ids: [e.id], tier: e.tier, look: e.look ?? [] })
  }
  return [...map.values()]
}

/** Moves a group back when a look-alike was placed within the last LOOKALIKE_GAP entries. */
function spaceLookalikes(seq: Group[]): Group[] {
  const out: Group[] = []
  const placedAt = new Map<string, number>()
  let count = 0
  const conflicts = (g: Group) =>
    g.look.some((w) => {
      const at = placedAt.get(w)
      return at !== undefined && count - at < LOOKALIKE_GAP
    })
  const place = (g: Group) => {
    placedAt.set(g.word, count)
    out.push(g)
    count += g.ids.length
  }
  const deferred: Group[] = []
  const flushReady = () => {
    for (let i = 0; i < deferred.length; ) {
      if (!conflicts(deferred[i])) place(deferred.splice(i, 1)[0])
      else i++
    }
  }
  for (const g of seq) {
    flushReady()
    if (conflicts(g)) deferred.push(g)
    else place(g)
  }
  while (deferred.length) {
    const i = deferred.findIndex((g) => !conflicts(g))
    place(deferred.splice(Math.max(i, 0), 1)[0])
  }
  return out
}

/**
 * New-word order. Deterministic from the seed, so every device agrees without syncing.
 * "mixed" interleaves tiers in proportion to their size so all three finish together.
 */
export function buildOrder(mode: OrderMode, entries: readonly Entry[] = ENTRIES, seed = ORDER_SEED): string[] {
  const groups = toGroups(entries)
  if (mode === 'alphabetical') {
    return groups.sort((a, b) => a.word.localeCompare(b.word)).flatMap((g) => g.ids)
  }
  let rng = hashSeed(seed)
  const perTier = new Map<Tier, Group[]>()
  for (const tier of TIERS) {
    let shuffled: Group[]
    ;[shuffled, rng] = shuffle(
      groups.filter((g) => g.tier === tier),
      rng,
    )
    perTier.set(tier, shuffled)
  }
  let seq: Group[]
  if (mode === 'common-first') {
    seq = TIERS.flatMap((t) => perTier.get(t)!)
  } else {
    const total = new Map(TIERS.map((t) => [t, perTier.get(t)!.reduce((n, g) => n + g.ids.length, 0)]))
    const taken = new Map(TIERS.map((t) => [t, 0]))
    const next = new Map(TIERS.map((t) => [t, 0]))
    seq = []
    while (seq.length < groups.length) {
      let best: Tier | null = null
      let bestRatio = Infinity
      for (const t of TIERS) {
        if (next.get(t)! >= perTier.get(t)!.length) continue
        const ratio = (taken.get(t)! + 0.5) / total.get(t)!
        if (ratio < bestRatio) {
          bestRatio = ratio
          best = t
        }
      }
      const g = perTier.get(best!)![next.get(best!)!]
      next.set(best!, next.get(best!)! + 1)
      taken.set(best!, taken.get(best!)! + g.ids.length)
      seq.push(g)
    }
  }
  return spaceLookalikes(seq).flatMap((g) => g.ids)
}
