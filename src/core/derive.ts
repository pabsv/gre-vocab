import type { FSRS, Grade } from 'ts-fsrs'
import { applyGrade } from './fsrs'
import { DAY_MS } from './time'
import type { DirKey, Mode, Progress, StudyEvent } from './types'

/** Bump when `derive` or `Progress` changes; each device then rebuilds its cached progress once. */
export const DERIVE_VERSION = 2

/** Mistake weight halves every 14 days without new misses. */
export const MISS_HALF_LIFE_MS = 14 * DAY_MS
/** A clean correct answer shrinks the weight. */
export const MISS_CORRECT_FACTOR = 0.6

export function emptyProgress(entryId: string): Progress {
  return {
    entryId,
    card: null,
    due: Number.MAX_SAFE_INTEGER,
    firstDay: null,
    lastGradedDay: null,
    lastSeen: null,
    seen: 0,
    wrong: 0,
    missScore: 0,
    missAt: null,
    lastMissDay: null,
    sweepDue: null,
    confusions: {},
    dir: { explain: [0, 0], type: [0, 0], blank: [0, 0], mcq: [0, 0] },
    known: false,
  }
}

export function dirOf(mode: Mode | null): DirKey | null {
  switch (mode) {
    case 'explain':
      return 'explain'
    case 'type':
      return 'type'
    case 'mcq-blank':
      return 'blank'
    case 'mcq-w2d':
    case 'mcq-d2w':
      return 'mcq'
    default:
      return null
  }
}

const decay = (score: number, from: number | null, to: number) =>
  from === null ? score : score * Math.pow(0.5, Math.max(0, to - from) / MISS_HALF_LIFE_MS)

/** Mistake weight at time `now`. */
export function missScoreAt(p: Progress, now: number): number {
  return decay(p.missScore, p.missAt, now)
}

const byTime = (a: StudyEvent, b: StudyEvent) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Rebuilds one entry's progress from its events. One FSRS grade per study day:
 * the first graded event decides, unless a sweep amended it later.
 */
export function derive(entryId: string, events: readonly StudyEvent[], f: FSRS, resetAt = 0): Progress {
  let list = events.filter((e) => e.entryId === entryId && !e.voided && e.at >= resetAt).sort(byTime)
  const lastReset = list.map((e) => e.kind).lastIndexOf('reset')
  if (lastReset >= 0) list = list.slice(lastReset + 1)

  const p = emptyProgress(entryId)

  const graded = new Map<string, StudyEvent[]>()
  for (const e of list) {
    if (!e.grade) continue
    const g = graded.get(e.day)
    if (g) g.push(e)
    else graded.set(e.day, [e])
  }
  for (const day of [...graded.keys()].sort()) {
    const g = graded.get(day)!
    const base = g.find((e) => !e.amend) ?? g[0]
    const amended = [...g].reverse().find((e) => e.amend)
    const grade = (amended ?? base).grade as Grade
    p.card = applyGrade(f, p.card, base.at, grade)
    p.lastGradedDay = day
  }
  if (p.card) p.due = p.card.due

  let missScore = 0
  let scoreAt: number | null = null
  for (const e of list) {
    if (e.kind === 'new' && e.grade && !e.amend) p.sweepDue = e.day
    else if (e.kind === 'sweep' || e.kind === 'known' || e.grade) p.sweepDue = null
    if (e.kind === 'known' || (e.kind === 'baseline' && e.grade)) p.known = true
    if (p.firstDay === null && (e.kind === 'new' || e.kind === 'known' || e.grade)) p.firstDay = e.day
    if (e.kind === 'known' || e.kind === 'reset' || e.mode === 'flash' || e.mode === null) continue
    p.lastSeen = e.at
    p.seen++
    const dir = dirOf(e.mode)
    if (dir) {
      p.dir[dir][1]++
      if (e.ok) p.dir[dir][0]++
    }
    if (e.ok) {
      if (!e.hint && !e.typo) missScore = decay(missScore, scoreAt, e.at) * MISS_CORRECT_FACTOR
      else missScore = decay(missScore, scoreAt, e.at)
      scoreAt = e.at
    } else {
      p.wrong++
      missScore = decay(missScore, scoreAt, e.at) + 1
      scoreAt = e.at
      p.missAt = e.at
      p.lastMissDay = e.day
      if (e.confusedWith) p.confusions[e.confusedWith] = (p.confusions[e.confusedWith] ?? 0) + 1
    }
  }
  p.missScore = missScore
  p.missAt = scoreAt
  return p
}
