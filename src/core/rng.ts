/**
 * Deterministic, serialisable randomness. The state is a single uint32 so a session
 * stored in IndexedDB replays the same MCQ options and modes after a reload.
 */
export type Rng = number

/** mulberry32 step: returns [value in [0, 1), next state]. */
export function rand(state: Rng): [number, Rng] {
  const next = (state + 0x6d2b79f5) | 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next >>> 0]
}

/** FNV-1a hash of a string, used to derive seeds. */
export function hashSeed(s: string): Rng {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

export function randInt(n: number, state: Rng): [number, Rng] {
  const [r, s] = rand(state)
  return [Math.floor(r * n), s]
}

export function shuffle<T>(items: readonly T[], state: Rng): [T[], Rng] {
  const out = [...items]
  let s = state
  for (let i = out.length - 1; i > 0; i--) {
    let j: number
    ;[j, s] = randInt(i + 1, s)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return [out, s]
}

/** Picks one item by weight; items with weight 0 are never chosen. */
export function pickWeighted<T>(items: readonly (readonly [T, number])[], state: Rng): [T, Rng] {
  const total = items.reduce((sum, [, w]) => sum + Math.max(0, w), 0)
  const [r, s] = rand(state)
  let x = r * total
  for (const [item, w] of items) {
    if (w <= 0) continue
    if (x < w) return [item, s]
    x -= w
  }
  const last = [...items].reverse().find(([, w]) => w > 0) ?? items[items.length - 1]
  return [last[0], s]
}

export function pickOne<T>(items: readonly T[], state: Rng): [T | undefined, Rng] {
  if (!items.length) return [undefined, state]
  const [i, s] = randInt(items.length, state)
  return [items[i], s]
}
