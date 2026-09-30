import raw from './words.json'

export type Tier = 'common' | 'basic' | 'advanced'
export type Pos = 'adjective' | 'verb' | 'noun' | 'adverb'

export interface Entry {
  id: string
  word: string
  /** Magoosh sense label such as "adj.1"; only on multi-sense words. */
  label?: string
  sense: number
  senses: number
  pos: Pos
  def: string
  /** Definition with the headword blanked, for prompts that ask for the word. */
  defMasked?: string
  ex?: string
  /** Character range of the headword (possibly inflected) inside `ex`. */
  exSpan?: [number, number]
  note?: string
  tier: Tier
  /** Magoosh list position: Common 1 to 323, Basic 324 to 699, Advanced 700 to 1066. */
  rank: number
  /** Other entries with (nearly) identical definitions. */
  syn?: string[]
  /** Other entries with overlapping definitions. */
  near?: string[]
  /** Headwords that look alike (spelling). */
  look?: string[]
}

export const ENTRIES: readonly Entry[] = raw as unknown as Entry[]
export const BY_ID: ReadonlyMap<string, Entry> = new Map(ENTRIES.map((e) => [e.id, e]))

const byWord = new Map<string, Entry[]>()
for (const e of ENTRIES) {
  const k = e.word.toLowerCase()
  const list = byWord.get(k)
  if (list) list.push(e)
  else byWord.set(k, [e])
}
export const BY_WORD: ReadonlyMap<string, readonly Entry[]> = byWord

export function getEntry(id: string): Entry {
  const e = BY_ID.get(id)
  if (!e) throw new Error(`unknown entry ${id}`)
  return e
}

export function siblingsOf(id: string): readonly Entry[] {
  const e = getEntry(id)
  return (BY_WORD.get(e.word.toLowerCase()) ?? []).filter((s) => s.id !== id)
}

export function areSiblings(a: string, b: string): boolean {
  if (a === b) return false
  return getEntry(a).word.toLowerCase() === getEntry(b).word.toLowerCase()
}

const relatedCache = new Map<string, ReadonlySet<string>>()
/** Entries whose meaning overlaps this one (synonyms and near synonyms). */
export function relatedIds(id: string): ReadonlySet<string> {
  let set = relatedCache.get(id)
  if (!set) {
    const e = getEntry(id)
    set = new Set([...(e.syn ?? []), ...(e.near ?? [])])
    relatedCache.set(id, set)
  }
  return set
}

/** Entries of look-alike headwords. */
export function lookalikesOf(id: string): readonly Entry[] {
  return (getEntry(id).look ?? []).flatMap((w) => BY_WORD.get(w) ?? [])
}

export const TIER_LABEL: Record<Tier, string> = { common: 'Common', basic: 'Basic', advanced: 'Advanced' }
export const POS_SHORT: Record<Pos, string> = { adjective: 'adj', verb: 'verb', noun: 'noun', adverb: 'adv' }
