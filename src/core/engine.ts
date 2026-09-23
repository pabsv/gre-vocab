import { areSiblings, getEntry, hasSharedMeaning, type Entry } from '../data/words'
import { pickOptions } from './distractors'
import { hashSeed, pickOne, pickWeighted, shuffle, type Rng } from './rng'
import type { GradeValue, ItemKind, Mode, Progress, Step, StudyEvent } from './types'

export type SessionType = 'daily' | 'drill' | 'test' | 'baseline'
export type WorkPhase = 'review' | 'new' | 'sweep' | 'list'
export type Phase = WorkPhase | 'checkpoint' | 'done'

/** One word inside a session, climbing its path of steps. */
export interface Item {
  id: string
  kind: ItemKind
  phase: WorkPhase
  path: Step[]
  i: number
  /** Turn at which the item is next scheduled; the engine always takes the earliest. */
  readyAt: number
  order: number
  misses: number
  hints: number
  typos: number
  /** "Knew it" on the flashcard: one typed check instead of the full ladder. */
  fast?: boolean
  /** A review already received its FSRS grade in this session. */
  graded?: boolean
  done?: boolean
  /** Study day the word's grade belongs to (sweep amendments target it). */
  day?: string
}

export interface Task {
  seq: number
  id: string
  kind: ItemKind | 'filler'
  mode: Mode
  /** MCQ option entry ids, target included. */
  options?: string[]
  /** Show the first letter up front: the definition is shared with other deck words. */
  firstLetter?: boolean
  /** Show this sense's example as context (multi-sense words in explain mode). */
  context?: boolean
}

export interface Graduate {
  id: string
  misses: number
  day: string
  fast: boolean
}

export interface SessionCore {
  v: 1
  type: SessionType
  day: string
  createdAt: number
  rng: Rng
  /** Turn counter: answers given. */
  t: number
  seq: number
  nextOrder: number
  last: string | null
  phase: Phase
  resume: Phase | null
  pool: Item[]
  newQueue: { id: string; carry: boolean }[]
  windowSize: number
  checkpointEvery: number
  sinceCheckpoint: number
  graduated: Graduate[]
  /** Entry ids shown on the checkpoint recap. */
  recap: string[]
  cur: Task | null
  answered: number
  correct: number
}

export interface Session extends SessionCore {
  undo: { state: SessionCore; eventId: string }[]
}

export interface EngineCtx {
  now: number
  day: string
  device: string
  /** Phones lean on explain and sentence blank instead of typing. */
  touch: boolean
  newId: () => string
  progress: (id: string) => Progress | undefined
}

export interface Answer {
  correct: boolean
  /** Flashcard only: "Knew it". */
  knew?: boolean
  typo?: boolean
  hint?: number
  confusedWith?: string
  answer?: string
  ms?: number
}

const UNDO_DEPTH = 5
/** Cards to wait before a word returns after each successful step. */
const GAPS = [2, 4, 6]
const MISS_GAP = 2
const FULL_LADDER: Step[] = ['flash', 'mcq', 'type']

function blankItem(id: string, kind: ItemKind, phase: WorkPhase, path: Step[], readyAt: number, order: number): Item {
  return { id, kind, phase, path, i: 0, readyAt, order, misses: 0, hints: 0, typos: 0 }
}

function baseSession(type: SessionType, day: string, now: number, windowSize: number): Session {
  return {
    v: 1,
    type,
    day,
    createdAt: now,
    rng: hashSeed(`${type}:${day}:${now}`),
    t: 0,
    seq: 0,
    nextOrder: 0,
    last: null,
    phase: 'done',
    resume: null,
    pool: [],
    newQueue: [],
    windowSize,
    checkpointEvery: windowSize,
    sinceCheckpoint: 0,
    graduated: [],
    recap: [],
    cur: null,
    answered: 0,
    correct: 0,
    undo: [],
  }
}

export function createDailySession(input: {
  day: string
  now: number
  dueIds: readonly string[]
  newIds: readonly string[]
  carryIds: readonly string[]
  windowSize: number
}): Session {
  const s = baseSession('daily', input.day, input.now, input.windowSize)
  let reviews: string[]
  ;[reviews, s.rng] = shuffle(input.dueIds, s.rng)
  s.pool = reviews.map((id, k) => blankItem(id, 'review', 'review', ['recall'], k, k))
  s.nextOrder = reviews.length
  s.newQueue = [...input.carryIds.map((id) => ({ id, carry: true })), ...input.newIds.map((id) => ({ id, carry: false }))]
  s.phase = s.pool.length ? 'review' : s.newQueue.length ? 'new' : 'done'
  return s
}

/** Drill (MCQ, type, explain), test (one attempt) or baseline (explain, then type) over a list. */
export function createListSession(type: Exclude<SessionType, 'daily'>, ids: readonly string[], day: string, now: number): Session {
  const s = baseSession(type, day, now, 8)
  const path: Step[] = type === 'drill' ? ['mcq', 'type', 'explain'] : type === 'test' ? ['quiz'] : ['explain', 'type']
  let order: string[]
  ;[order, s.rng] = shuffle(ids, s.rng)
  s.pool = order.map((id, k) => blankItem(id, type, 'list', path, k, k))
  s.nextOrder = order.length
  s.phase = s.pool.length ? 'list' : 'done'
  return s
}

function stripUndo(s: Session): SessionCore {
  const { undo: _undo, ...core } = s
  void _undo
  return core
}

function cloneWorking(s: Session): Session {
  return { ...s, pool: s.pool.map((x) => ({ ...x, path: [...x.path] })), newQueue: [...s.newQueue], graduated: [...s.graduated] }
}

function isStale(x: Item, ctx: EngineCtx): boolean {
  const p = ctx.progress(x.id)
  if (!p) return false
  if (x.kind === 'review' && !x.graded) return p.lastGradedDay === ctx.day
  if (x.kind === 'new') return p.card !== null
  return false
}

function admit(s: Session) {
  let live = s.pool.filter((x) => x.phase === 'new' && !x.done).length
  while (live < s.windowSize && s.newQueue.length) {
    const [q, ...rest] = s.newQueue
    s.newQueue = rest
    s.pool.push(blankItem(q.id, 'new', 'new', q.carry ? ['mcq', 'type'] : [...FULL_LADDER], s.t, s.nextOrder++))
    live++
  }
}

function enterCheckpoint(s: Session, resume: Phase) {
  s.recap = s.graduated.slice(-s.sinceCheckpoint).map((g) => g.id)
  s.sinceCheckpoint = 0
  s.resume = resume
  s.phase = 'checkpoint'
}

function startSweep(s: Session) {
  const swept = new Set(s.pool.filter((x) => x.phase === 'sweep').map((x) => x.id))
  const todo = s.graduated.filter((g) => !g.fast && !swept.has(g.id))
  if (s.type !== 'daily' || !todo.length) {
    s.phase = 'done'
    return
  }
  let order: Graduate[]
  ;[order, s.rng] = shuffle(todo, s.rng)
  for (const [k, g] of order.entries()) {
    s.pool.push({ ...blankItem(g.id, 'sweep', 'sweep', ['explain'], s.t + k, s.nextOrder++), day: g.day })
  }
  s.phase = 'sweep'
}

function advance(s: Session) {
  switch (s.phase) {
    case 'review':
      s.phase = 'new'
      return
    case 'new':
      if (s.sinceCheckpoint > 0) enterCheckpoint(s, 'sweep')
      else startSweep(s)
      return
    default:
      s.phase = 'done'
  }
}

export function continueSession(s0: Session): Session {
  if (s0.phase !== 'checkpoint') return s0
  const s = cloneWorking(s0)
  const resume = s.resume ?? 'new'
  s.resume = null
  s.recap = []
  if (resume === 'sweep') startSweep(s)
  else s.phase = resume
  return s
}

const hasBlank = (e: Entry) => !!(e.ex && e.exSpan)

const ratio = ([ok, n]: [number, number]) => (ok + 1) / (n + 2)

/** Review mode: weighted toward the weaker direction, each direction kept between 30% and 70%. */
function pickRecall(e: Entry, p: Progress | undefined, touch: boolean, rng: Rng): [Mode, Rng] {
  let wExplain = touch ? 0.5 : 0.45
  let wType = touch ? 0.15 : 0.35
  const wBlank = hasBlank(e) ? (touch ? 0.35 : 0.2) : 0
  if (p) {
    const share = wExplain + wType
    const frac = Math.min(0.7, Math.max(0.3, wExplain / share + (ratio(p.dir.type) - ratio(p.dir.explain)) * 0.5))
    wExplain = share * frac
    wType = share * (1 - frac)
  }
  return pickWeighted<Mode>(
    [
      ['explain', wExplain],
      ['type', wType],
      ['mcq-blank', wBlank],
    ],
    rng,
  )
}

function resolveStep(step: Step, e: Entry, p: Progress | undefined, touch: boolean, rng: Rng): [Mode, Rng] {
  switch (step) {
    case 'mcq':
      return pickWeighted<Mode>(
        [
          ['mcq-w2d', 0.45],
          ['mcq-d2w', 0.35],
          ['mcq-blank', hasBlank(e) ? 0.2 : 0],
        ],
        rng,
      )
    case 'recall':
      return pickRecall(e, p, touch, rng)
    case 'quiz':
      return pickWeighted<Mode>(
        [
          ['type', 0.5],
          ['explain', 0.5],
        ],
        rng,
      )
    case 'mcq-blank':
      return [hasBlank(e) ? 'mcq-blank' : 'mcq-w2d', rng]
    default:
      return [step, rng]
  }
}

function withTask(s: Session, id: string, kind: Task['kind'], step: Step, ctx: EngineCtx): Session {
  const e = getEntry(id)
  const [mode, afterMode] = resolveStep(step, e, ctx.progress(id), ctx.touch, s.rng)
  let rng = afterMode
  let options: string[] | undefined
  if (mode.startsWith('mcq')) {
    const poolIds = s.pool.filter((x) => x.id !== id).map((x) => x.id)
    ;[options, rng] = pickOptions(id, mode, { poolIds, confusions: ctx.progress(id)?.confusions }, rng)
  }
  const task: Task = { seq: s.seq + 1, id, kind, mode }
  if (options) task.options = options
  if (mode === 'type' && hasSharedMeaning(id)) task.firstLetter = true
  if (mode === 'explain' && e.senses > 1) task.context = true
  return { ...s, rng, seq: s.seq + 1, cur: task }
}

/** A finished word from today, shown ungraded to put space between two showings of the same word. */
function fillerTask(s: Session, ctx: EngineCtx, live: readonly Item[]): Session | null {
  const liveWords = new Set(live.map((x) => getEntry(x.id).word))
  const finished = s.pool.filter(
    (x) => x.done && x.id !== s.last && !(s.last && areSiblings(x.id, s.last)) && !liveWords.has(getEntry(x.id).word),
  )
  if (!finished.length) return null
  const [x, rng] = pickOne(finished, s.rng)
  return withTask({ ...s, rng }, x!.id, 'filler', 'mcq', ctx)
}

const cmpItems = (a: Item, b: Item) => a.readyAt - b.readyAt || a.i - b.i || a.order - b.order

/** Picks the next task (pure). Returns the session unchanged at a checkpoint or when done. */
export function nextTask(s0: Session, ctx: EngineCtx): Session {
  if (s0.cur || s0.phase === 'checkpoint' || s0.phase === 'done') return s0
  const s = cloneWorking(s0)
  for (let guard = 0; guard < 8; guard++) {
    if (s.phase === 'checkpoint' || s.phase === 'done') return s
    const phase = s.phase
    if (phase === 'new') admit(s)
    for (const x of s.pool) if (!x.done && x.phase === phase && isStale(x, ctx)) x.done = true
    const live = s.pool.filter((x) => !x.done && x.phase === phase)
    if (!live.length) {
      advance(s)
      continue
    }
    const eligible = live.filter((x) => x.id !== s.last)
    const spaced = eligible.filter((x) => !(s.last && areSiblings(x.id, s.last)))
    let candidates = spaced
    if (!candidates.length) {
      const filler = fillerTask(s, ctx, live)
      if (filler) return filler
      candidates = eligible.length ? eligible : live
    }
    const x = candidates.reduce((a, b) => (cmpItems(a, b) <= 0 ? a : b))
    return withTask(s, x.id, x.kind, x.path[x.i], ctx)
  }
  return s
}

/** The easier MCQ used to relearn a failed mode before trying it again. */
function relearnPath(failed: Mode): Step[] {
  switch (failed) {
    case 'type':
      return ['mcq-d2w', 'type']
    case 'explain':
      return ['mcq-w2d', 'explain']
    case 'mcq-blank':
      return ['mcq-w2d', 'mcq-blank']
    default:
      return ['mcq-w2d', 'explain']
  }
}

function newWordGrade(x: Item): GradeValue {
  if (x.fast) return x.typos || x.hints ? 3 : 4
  return x.misses + (x.hints ? 1 : 0) >= 2 ? 2 : 3
}

/**
 * Records an answer to the current task. Returns the advanced session (without a current task;
 * call nextTask next) and exactly one event.
 */
export function applyAnswer(s0: Session, a: Answer, ctx: EngineCtx): { session: Session; event: StudyEvent } {
  const task = s0.cur
  if (!task) throw new Error('no current task')
  const ok = task.mode === 'flash' ? !!a.knew : a.correct
  const s = cloneWorking(s0)
  s.cur = null
  s.t = s0.t + 1
  s.last = task.id
  s.answered = s0.answered + 1
  s.correct = s0.correct + (ok ? 1 : 0)

  const event: StudyEvent = {
    id: ctx.newId(),
    entryId: task.id,
    at: ctx.now,
    day: ctx.day,
    kind: task.kind,
    mode: task.mode,
    ok: ok ? 1 : 0,
    device: ctx.device,
    voided: 0,
  }
  if (a.typo && ok) event.typo = 1
  if (a.hint) event.hint = a.hint
  if (a.confusedWith && !ok) event.confusedWith = a.confusedWith
  if (a.answer) event.answer = a.answer.slice(0, 300)
  if (a.ms) event.ms = Math.round(Math.min(a.ms, 120_000))

  const x = task.kind === 'filler' ? undefined : s.pool.find((p) => p.id === task.id && !p.done && p.phase === s0.phase)
  if (x) {
    if (task.mode === 'flash') {
      if (a.knew) {
        x.fast = true
        x.path = ['flash', 'type']
      }
      x.i++
    } else if (ok) {
      if (a.hint) x.hints++
      if (a.typo) x.typos++
      if (x.kind === 'review' && !x.graded) {
        event.grade = a.hint ? 2 : 3
        x.graded = true
      }
      x.i++
    } else {
      x.misses++
      if (x.kind === 'test' || x.kind === 'baseline') {
        x.i = x.path.length
      } else if (x.kind === 'review' && !x.graded) {
        event.grade = 1
        x.graded = true
        x.kind = 'relearn'
        x.path = relearnPath(task.mode)
        x.i = 0
      } else if (x.kind === 'sweep') {
        event.grade = 1
        event.amend = 1
        if (x.day) event.day = x.day
        x.kind = 'relearn'
        x.path = relearnPath('explain')
        x.i = 0
      } else if (x.fast) {
        x.fast = false
        x.path = [...FULL_LADDER]
        x.i = 1
      } else {
        const mcqAt = x.path.indexOf('mcq')
        x.i = Math.max(mcqAt >= 0 ? mcqAt : 0, x.i - 1)
      }
    }

    const liveCount = s.pool.filter((p) => !p.done && p.phase === x.phase).length
    const gap = ok || task.mode === 'flash' ? Math.min(Math.max(liveCount - 1, 1), GAPS[Math.min(x.i, GAPS.length) - 1] ?? GAPS[0]) : MISS_GAP
    x.readyAt = s.t + gap

    if (x.i >= x.path.length) {
      x.done = true
      if (x.kind === 'new') {
        event.grade = newWordGrade(x)
        x.day = ctx.day
        s.graduated.push({ id: x.id, misses: x.misses, day: ctx.day, fast: !!x.fast })
        s.sinceCheckpoint++
        if (s.sinceCheckpoint >= s.checkpointEvery) enterCheckpoint(s, 'new')
      } else if (x.kind === 'baseline' && x.misses === 0) {
        event.grade = x.typos ? 3 : 4
      }
    }
  }

  s.undo = [...s0.undo.slice(-(UNDO_DEPTH - 1)), { state: stripUndo(s0), eventId: event.id }]
  return { session: s, event }
}

/** Restores the state before the last answer. The caller voids the returned event. */
export function undoLast(s: Session): { session: Session; eventId: string } | null {
  const u = s.undo.at(-1)
  if (!u) return null
  return { session: { ...u.state, undo: s.undo.slice(0, -1) }, eventId: u.eventId }
}

/** Rough completed/total step counts for the progress bar. */
export function sessionProgress(s: Session): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const x of s.pool) {
    total += x.path.length
    done += x.done ? x.path.length : Math.min(x.i, x.path.length)
  }
  for (const q of s.newQueue) total += q.carry ? 2 : 3
  if (s.type === 'daily') {
    const sweepItems = s.pool.filter((x) => x.phase === 'sweep').length
    const expected =
      s.graduated.filter((g) => !g.fast).length +
      s.pool.filter((x) => x.phase === 'new' && !x.done && !x.fast).length +
      s.newQueue.length
    total += Math.max(0, expected - sweepItems)
  }
  return { done, total: Math.max(total, 1) }
}

export function isFinished(s: Session): boolean {
  return s.phase === 'done'
}
