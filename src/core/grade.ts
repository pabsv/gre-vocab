import { BY_WORD, ENTRIES, relatedIds, type Entry } from '../data/words'

export type TypedVerdict =
  | { kind: 'correct' }
  | { kind: 'typo' }
  /** Another deck word with the same meaning: no penalty, try again. */
  | { kind: 'synonym'; entryId: string }
  /** Another deck word: wrong, and recorded as a confusion. */
  | { kind: 'confusion'; entryId: string }
  | { kind: 'wrong' }
  | { kind: 'empty' }

/** Lowercase letters only: strips accents, spaces, hyphens and apostrophes. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

const DOUBLING = /[^aeiou][aeiou][bdgklmnprt]$/

/** Accepted spellings of a headword: the word itself plus common inflections. */
export function forms(word: string): Set<string> {
  const w = normalize(word)
  const out = new Set([w, `${w}s`, `${w}es`, `${w}d`, `${w}ed`, `${w}ing`, `${w}ly`, `${w}er`, `${w}ers`])
  if (w.endsWith('e')) for (const s of ['ing', 'ed', 'er', 'ers', 'ly']) out.add(w.slice(0, -1) + s)
  if (w.endsWith('y')) for (const s of ['ies', 'ied', 'ily', 'iness']) out.add(w.slice(0, -1) + s)
  if (w.length <= 5 && DOUBLING.test(w)) for (const s of ['ed', 'ing', 'er']) out.add(w + w.at(-1) + s)
  if (w.length > 5 && w.endsWith('es')) out.add(w.slice(0, -2))
  if (w.length > 5 && w.endsWith('s')) out.add(w.slice(0, -1))
  if (w.length > 6 && w.endsWith('ly')) out.add(w.slice(0, -2))
  if (w.endsWith('able') || w.endsWith('ible')) out.add(`${w.slice(0, -1)}y`)
  return out
}

/** Optimal string alignment distance: Levenshtein plus adjacent swaps. */
export function osa(a: string, b: string): number {
  const la = a.length
  const lb = b.length
  if (!la) return lb
  if (!lb) return la
  let prev2: number[] = []
  let prev = Array.from({ length: lb + 1 }, (_, j) => j)
  for (let i = 1; i <= la; i++) {
    const cur = [i]
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur.push(v)
    }
    prev2 = prev
    prev = cur
  }
  return prev[lb]
}

let formIndex: Map<string, string> | null = null
/** normalised form -> headword, for every deck word. */
function deckForms(): Map<string, string> {
  if (formIndex) return formIndex
  formIndex = new Map()
  for (const word of BY_WORD.keys()) for (const f of forms(word)) if (!formIndex.has(f)) formIndex.set(f, word)
  // exact headwords win over inflections of other words
  for (const word of BY_WORD.keys()) formIndex.set(normalize(word), word)
  return formIndex
}

const HEADWORDS = [...new Set(ENTRIES.map((e) => normalize(e.word)))]

export function typoAllowance(word: string): number {
  const n = normalize(word).length
  return n >= 9 ? 2 : n >= 5 ? 1 : 0
}

/** Picks the sense of a headword that best stands in for a confusion with `target`. */
function senseFor(word: string, target: Entry): string {
  const senses = BY_WORD.get(word) ?? []
  return (senses.find((s) => s.pos === target.pos) ?? senses[0]).id
}

/**
 * Grades a typed headword. A near miss only counts as a typo when the answer is strictly
 * closer to the target than to every other deck word (ingenious vs ingenuous stays wrong).
 */
export function checkTyped(input: string, target: Entry): TypedVerdict {
  const n = normalize(input)
  if (!n) return { kind: 'empty' }
  const targetWord = target.word.toLowerCase()
  const targetForms = forms(targetWord)
  if (targetForms.has(n)) return { kind: 'correct' }

  const other = deckForms().get(n)
  if (other && other !== targetWord) {
    const id = senseFor(other, target)
    const related = relatedIds(target.id)
    const sameMeaning = (BY_WORD.get(other) ?? []).some((s) => related.has(s.id))
    return sameMeaning ? { kind: 'synonym', entryId: id } : { kind: 'confusion', entryId: id }
  }

  const allowed = typoAllowance(targetWord)
  if (allowed > 0) {
    let dist = Infinity
    for (const f of targetForms) dist = Math.min(dist, osa(n, f))
    if (dist <= allowed) {
      const target_ = normalize(targetWord)
      const ambiguous = HEADWORDS.some(
        (h) => h !== target_ && Math.abs(h.length - n.length) <= 2 && osa(n, h) <= dist,
      )
      if (!ambiguous) return { kind: 'typo' }
    }
  }
  return { kind: 'wrong' }
}

/** First letter and length pattern, e.g. "a _ _ _ _ _". */
export function letterHint(word: string): string {
  return [word[0], ...Array.from(word.slice(1), (c) => (c === ' ' || c === '-' ? c : '_'))].join(' ')
}
