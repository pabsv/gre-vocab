import { BY_ID, ENTRIES, getEntry, lookalikesOf, relatedIds, type Entry, type Pos } from '../data/words'
import { pickOne, shuffle, type Rng } from './rng'
import type { Mode } from './types'

const byPos = new Map<Pos, Entry[]>()
for (const e of ENTRIES) {
  const list = byPos.get(e.pos)
  if (list) list.push(e)
  else byPos.set(e.pos, [e])
}

const normDef = (d: string) => d.toLowerCase().replace(/[^a-z ]/g, '').trim()

export interface OptionContext {
  /** Words in today's session, preferred as distractors (they are the ones you are juggling). */
  poolIds: readonly string[]
  /** Past confusions for the target: entry id to count. */
  confusions?: Record<string, number>
}

/**
 * Four options (target included, shuffled). Priority: your past confusions, a same-POS word from
 * today, a look-alike spelling, then random same-POS words. Never siblings, synonyms or duplicates.
 */
export function pickOptions(targetId: string, mode: Mode, ctx: OptionContext, rng: Rng): [string[], Rng] {
  const target = getEntry(targetId)
  const related = relatedIds(targetId)
  let samePosOnly = mode === 'mcq-blank'
  const usedWords = new Set([target.word.toLowerCase()])
  const usedDefs = new Set([normDef(target.def)])
  const chosen: Entry[] = []

  const valid = (e: Entry, samePos: boolean) =>
    e.id !== targetId &&
    !usedWords.has(e.word.toLowerCase()) &&
    !related.has(e.id) &&
    !relatedIds(e.id).has(targetId) &&
    !usedDefs.has(normDef(e.def)) &&
    (!(samePos || samePosOnly) || e.pos === target.pos)

  const add = (e: Entry) => {
    chosen.push(e)
    usedWords.add(e.word.toLowerCase())
    usedDefs.add(normDef(e.def))
  }

  const tryPick = (candidates: readonly Entry[], samePos: boolean) => {
    if (chosen.length >= 3) return
    const ok = candidates.filter((e) => valid(e, samePos))
    let e: Entry | undefined
    ;[e, rng] = pickOne(ok, rng)
    if (e) add(e)
  }

  const confused = Object.entries(ctx.confusions ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => BY_ID.get(id))
    .filter((e): e is Entry => !!e)
  const firstConfusion = confused.find((e) => valid(e, false))
  if (firstConfusion) add(firstConfusion)

  tryPick(
    ctx.poolIds.map((id) => BY_ID.get(id)).filter((e): e is Entry => !!e),
    true,
  )
  tryPick(lookalikesOf(targetId), false)
  // Random fill by rejection sampling: cheap, since almost every same-POS word is valid.
  const sample = (candidates: readonly Entry[], samePos: boolean) => {
    for (let tries = 0; chosen.length < 3 && tries < 40; tries++) {
      let e: Entry | undefined
      ;[e, rng] = pickOne(candidates, rng)
      if (e && valid(e, samePos)) add(e)
    }
  }
  sample(byPos.get(target.pos) ?? [], true)
  for (let pass = 0; pass < 2 && chosen.length < 3; pass++) {
    // Second pass: rare parts of speech (6 adverbs) cannot fill a sentence blank on their own.
    if (pass === 1) samePosOnly = false
    while (chosen.length < 3) {
      const before = chosen.length
      tryPick(ENTRIES, false)
      if (chosen.length === before) break
    }
  }

  return shuffle([targetId, ...chosen.map((e) => e.id)], rng)
}
