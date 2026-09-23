import type { CardRow } from './fsrs'

/** What the learner sees for one task. */
export type Mode = 'flash' | 'mcq-w2d' | 'mcq-d2w' | 'mcq-blank' | 'type' | 'explain'

/**
 * A rung on an item's path. Concrete modes are shown as is; `mcq` picks a direction,
 * `recall` picks a review mode (explain, type or sentence blank), `quiz` picks type or explain.
 */
export type Step = Mode | 'mcq' | 'recall' | 'quiz'

export type ItemKind = 'new' | 'review' | 'relearn' | 'sweep' | 'drill' | 'test' | 'baseline'
export type EventKind = ItemKind | 'filler' | 'known' | 'reset'

/** FSRS grade: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type GradeValue = 1 | 2 | 3 | 4

/** One answer (or manual action). Append only; the source of truth for all progress. */
export interface StudyEvent {
  id: string
  entryId: string
  /** Device clock, ms. */
  at: number
  /** Study day the event (and its grade) belongs to. */
  day: string
  kind: EventKind
  mode: Mode | null
  /** 1 right, 0 wrong. For a flashcard: 1 "knew it", 0 "didn't know". */
  ok: 0 | 1
  typo?: 1
  hint?: number
  grade?: GradeValue
  /** Sweep result that replaces the day's grade. */
  amend?: 1
  confusedWith?: string
  answer?: string
  ms?: number
  device: string
  voided: 0 | 1
}

export type DirKey = 'explain' | 'type' | 'blank' | 'mcq'

/** Derived per entry; rebuilt from events, never synced. */
export interface Progress {
  entryId: string
  card: CardRow | null
  /** card.due or Number.MAX_SAFE_INTEGER when not scheduled (keeps the Dexie index usable). */
  due: number
  /** First study day the word was started in the learn flow (or marked known). */
  firstDay: string | null
  lastGradedDay: string | null
  lastSeen: number | null
  seen: number
  wrong: number
  /** Decaying mistake weight, valid at `missAt`. Use `missScoreAt` to read it. */
  missScore: number
  missAt: number | null
  lastMissDay: string | null
  confusions: Record<string, number>
  dir: Record<DirKey, [number, number]>
  known: boolean
}

export type OrderMode = 'mixed' | 'common-first' | 'alphabetical'

export interface Settings {
  newPerDay: number
  budgetMin: number
  windowSize: number
  order: OrderMode
  retypeOnMiss: boolean
  autoSpeak: boolean
  retention: number
  examDate: string | null
  theme: 'system' | 'light' | 'dark'
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 30,
  budgetMin: 60,
  windowSize: 8,
  order: 'mixed',
  retypeOnMiss: true,
  autoSpeak: false,
  retention: 0.9,
  examDate: null,
  theme: 'system',
}
