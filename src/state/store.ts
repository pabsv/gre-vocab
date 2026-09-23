import type { FSRS } from 'ts-fsrs'
import { create } from 'zustand'
import {
  applyAnswer,
  continueSession,
  createDailySession,
  createListSession,
  nextTask,
  undoLast,
  type Answer,
  type EngineCtx,
  type Session,
  type SessionType,
  type Task,
} from '../core/engine'
import { makeScheduler } from '../core/fsrs'
import type { TypedVerdict } from '../core/grade'
import { buildOrder } from '../core/order'
import { buildPlan, type DailyPlan } from '../core/plan'
import { studyDay } from '../core/time'
import { DEFAULT_SETTINGS, type OrderMode, type Progress, type Settings, type StudyEvent } from '../core/types'
import * as repo from '../db/repo'
import { now } from '../lib/clock'
import { applyTheme } from '../lib/theme'

export interface Feedback {
  task: Task
  correct: boolean
  /** MCQ: the option picked. */
  picked?: string
  /** Type mode: what was typed and how it was judged. */
  typed?: string
  verdict?: TypedVerdict
  hint?: number
}

const schedulers = new Map<number, FSRS>()
export function schedulerFor(retention: number): FSRS {
  let f = schedulers.get(retention)
  if (!f) {
    f = makeScheduler(retention)
    schedulers.set(retention, f)
  }
  return f
}

const orders = new Map<OrderMode, string[]>()
export function orderFor(mode: OrderMode): string[] {
  let o = orders.get(mode)
  if (!o) {
    o = buildOrder(mode)
    orders.set(mode, o)
  }
  return o
}

const isTouch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

/** Listeners that want to know about local writes (the sync loop). */
const writeListeners = new Set<() => void>()
export function onLocalWrite(fn: () => void) {
  writeListeners.add(fn)
  return () => writeListeners.delete(fn)
}
const notifyWrite = () => writeListeners.forEach((fn) => fn())

export function suspendedFrom(meta: ReadonlyMap<string, unknown>): Set<string> {
  const out = new Set<string>()
  for (const [k, v] of meta) if (k.startsWith('suspend:') && v === true) out.add(k.slice(8))
  return out
}

interface State {
  ready: boolean
  deviceId: string
  progress: Map<string, Progress>
  meta: Map<string, unknown>
  settings: Settings
  session: Session | null
  feedback: Feedback | null
  error: string | null

  init: () => Promise<void>
  ctx: () => EngineCtx
  plan: (extraNew?: number) => DailyPlan
  startDaily: (extraNew?: number) => void
  startList: (type: Exclude<SessionType, 'daily'>, ids: string[]) => void
  submit: (answer: Answer, extra?: Omit<Feedback, 'task' | 'correct'>) => void
  proceed: () => void
  undo: () => void
  override: () => void
  continueCheckpoint: () => void
  endSession: () => void
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  setMetaValue: (key: string, value: unknown) => Promise<void>
  markKnown: (id: string) => Promise<void>
  resetWord: (id: string) => Promise<void>
  resetAll: () => Promise<void>
  reload: () => Promise<void>
  applyProgress: (list: Iterable<Progress>) => void
  clearError: () => void
}

export const useStore = create<State>()((set, get) => {
  const fail = (err: unknown) => {
    console.error(err)
    set({ error: err instanceof Error ? err.message : String(err) })
  }

  const manualEvent = (entryId: string, kind: 'known' | 'reset'): StudyEvent => {
    const at = now()
    const e: StudyEvent = { id: crypto.randomUUID(), entryId, at, day: studyDay(at), kind, mode: null, ok: 1, device: get().deviceId, voided: 0 }
    if (kind === 'known') e.grade = 4
    return e
  }

  return {
    ready: false,
    deviceId: '',
    progress: new Map(),
    meta: new Map(),
    settings: DEFAULT_SETTINGS,
    session: null,
    feedback: null,
    error: null,

    init: async () => {
      const deviceId = await repo.getDeviceId()
      const loaded = await repo.loadState()
      const settings: Settings = { ...DEFAULT_SETTINGS, ...((loaded.meta.get('settings') as Partial<Settings> | undefined) ?? {}) }
      let session = loaded.session
      if (session && (session.day !== studyDay(now()) || session.phase === 'done' || session.v !== 1)) {
        session = null
        await repo.saveSession(null)
      }
      set({ ready: true, deviceId, progress: loaded.progress, meta: loaded.meta, settings, session })
      applyTheme(settings.theme)
      if (session && !session.cur) set({ session: nextTask(session, get().ctx()) })
      void navigator.storage?.persist?.().catch(() => {})
    },

    ctx: () => {
      const t = now()
      const { progress, deviceId } = get()
      return { now: t, day: studyDay(t), device: deviceId, touch: isTouch(), newId: () => crypto.randomUUID(), progress: (id) => progress.get(id) }
    },

    plan: (extraNew = 0) => {
      const { progress, settings, meta } = get()
      return buildPlan({
        progress,
        order: orderFor(settings.order),
        settings: { newPerDay: settings.newPerDay + extraNew, budgetMin: settings.budgetMin + extraNew },
        now: now(),
        suspended: suspendedFrom(meta),
      })
    },

    startDaily: (extraNew = 0) => {
      const st = get()
      const t = now()
      const day = studyDay(t)
      if (!extraNew && st.session && st.session.type === 'daily' && st.session.day === day && st.session.phase !== 'done') return
      const plan = st.plan(extraNew)
      const s = nextTask(
        createDailySession({ day, now: t, dueIds: plan.dueIds, newIds: plan.newIds, carryIds: plan.carryIds, windowSize: st.settings.windowSize }),
        st.ctx(),
      )
      set({ session: s, feedback: null })
      repo.saveSession(s).catch(fail)
    },

    startList: (type, ids) => {
      const t = now()
      const s = nextTask(createListSession(type, ids, studyDay(t), t), get().ctx())
      set({ session: s, feedback: null })
      repo.saveSession(s).catch(fail)
    },

    submit: (answer, extra) => {
      const { session, settings } = get()
      const task = session?.cur
      if (!session || !task) return
      const ctx = get().ctx()
      const { session: applied, event } = applyAnswer(session, answer, ctx)
      const next = nextTask(applied, ctx)
      const showFeedback = task.mode !== 'flash' && task.mode !== 'explain'
      set({ session: next, feedback: showFeedback ? { task, correct: event.ok === 1, ...extra } : null })
      repo
        .recordAnswer(event, next, schedulerFor(settings.retention))
        .then((p) => {
          get().applyProgress([p])
          notifyWrite()
        })
        .catch(fail)
    },

    proceed: () => set({ feedback: null }),

    undo: () => {
      const { session, settings } = get()
      if (!session) return
      const r = undoLast(session)
      if (!r) return
      set({ session: r.session, feedback: null })
      repo
        .voidEvent(r.eventId, r.session, schedulerFor(settings.retention))
        .then((p) => {
          if (p) get().applyProgress([p])
          notifyWrite()
        })
        .catch(fail)
    },

    override: () => {
      const fb = get().feedback
      if (!fb || fb.correct) return
      get().undo()
      get().submit({ correct: true, answer: fb.typed, hint: fb.hint }, { typed: fb.typed, verdict: { kind: 'correct' }, hint: fb.hint })
    },

    continueCheckpoint: () => {
      const s = get().session
      if (!s || s.phase !== 'checkpoint') return
      const next = nextTask(continueSession(s), get().ctx())
      set({ session: next })
      repo.saveSession(next).catch(fail)
    },

    endSession: () => {
      set({ session: null, feedback: null })
      repo.saveSession(null).catch(fail)
    },

    updateSettings: async (patch) => {
      const prev = get().settings
      const settings = { ...prev, ...patch }
      set({ settings })
      if (patch.theme) applyTheme(settings.theme)
      await repo.setMeta('settings', settings)
      notifyWrite()
      if (patch.retention !== undefined && patch.retention !== prev.retention) {
        set({ progress: await repo.rebuildAll(schedulerFor(settings.retention)) })
      }
    },

    setMetaValue: async (key, value) => {
      const meta = new Map(get().meta)
      meta.set(key, value)
      set({ meta })
      await repo.setMeta(key, value)
      notifyWrite()
    },

    markKnown: async (id) => {
      const list = await repo.addEvents([manualEvent(id, 'known')], schedulerFor(get().settings.retention))
      get().applyProgress(list)
      notifyWrite()
    },

    resetWord: async (id) => {
      const list = await repo.addEvents([manualEvent(id, 'reset')], schedulerFor(get().settings.retention))
      get().applyProgress(list)
      notifyWrite()
    },

    resetAll: async () => {
      const ids = [...get().progress.keys()]
      get().endSession()
      if (!ids.length) return
      const list = await repo.addEvents(
        ids.map((id) => manualEvent(id, 'reset')),
        schedulerFor(get().settings.retention),
      )
      get().applyProgress(list)
      notifyWrite()
    },

    reload: async () => {
      const loaded = await repo.loadState()
      const settings: Settings = { ...DEFAULT_SETTINGS, ...((loaded.meta.get('settings') as Partial<Settings> | undefined) ?? {}) }
      const themeChanged = settings.theme !== get().settings.theme
      set({ progress: loaded.progress, meta: loaded.meta, settings })
      if (themeChanged) applyTheme(settings.theme)
    },

    applyProgress: (list) => {
      const progress = new Map(get().progress)
      for (const p of list) progress.set(p.entryId, p)
      set({ progress })
    },

    clearError: () => set({ error: null }),
  }
})
