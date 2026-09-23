import { Keyboard, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { sessionProgress, type Session as SessionState } from '../core/engine'
import { getEntry } from '../data/words'
import { useHotkeys } from '../lib/hotkeys'
import { speak } from '../lib/speech'
import { useSessionLock } from '../lib/useSessionLock'
import { useWakeLock } from '../lib/useWakeLock'
import { useStore } from '../state/store'
import { Button } from '../ui/Button'
import { ShortcutSheet } from '../ui/ShortcutSheet'
import { Checkpoint } from './session/Checkpoint'
import { Done } from './session/Done'
import { Card, TaskLabel } from './session/parts'
import { ExplainTask } from './session/ExplainTask'
import { FlashTask } from './session/FlashTask'
import { McqTask } from './session/McqTask'
import { TypeTask } from './session/TypeTask'

export function SessionRoute() {
  const session = useStore((s) => s.session)
  const feedback = useStore((s) => s.feedback)
  const undo = useStore((s) => s.undo)
  const navigate = useNavigate()
  const [sheet, setSheet] = useState(false)
  useWakeLock(!!session)

  const lock = useSessionLock(!!session)
  const task = feedback?.task ?? session?.cur ?? null
  useHotkeys(
    {
      Escape: () => (sheet ? setSheet(false) : navigate('/')),
      'Mod+KeyZ': () => !lock.blocked && undo(),
      KeyP: () => task && speak(getEntry(task.id).word),
      'Shift+Slash': () => setSheet((v) => !v),
    },
  )

  if (!session) return <Navigate to="/" replace />

  let body: React.ReactNode = null
  if (lock.blocked)
    body = (
      <Card>
        <TaskLabel tone="warn">open in another tab</TaskLabel>
        <p className="text-lg text-ink-2">This session is running in another tab or window. Studying in two places at once would log answers twice.</p>
        <Button variant="primary" className="mt-6" onClick={lock.takeOver}>
          Continue here instead
        </Button>
      </Card>
    )
  else if (session.phase === 'checkpoint') body = <Checkpoint />
  else if (session.phase === 'done') body = <Done session={session} />
  else if (task) {
    const fb = feedback && feedback.task.seq === task.seq ? feedback : null
    if (task.mode === 'flash') body = <FlashTask key={task.seq} task={task} />
    else if (task.mode === 'type') body = <TypeTask key={task.seq} task={task} feedback={fb} />
    else if (task.mode === 'explain') body = <ExplainTask key={task.seq} task={task} />
    else body = <McqTask key={task.seq} task={task} feedback={fb} />
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col px-4 pb-10 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-6">
      <SessionHeader session={session} onClose={() => navigate('/')} onUndo={undo} onKeys={() => setSheet(true)} />
      <main className="flex flex-1 flex-col justify-center py-6 sm:py-10">{body}</main>
      {sheet && <ShortcutSheet onClose={() => setSheet(false)} />}
    </div>
  )
}

function phaseLine(s: SessionState): string {
  const count = (phase: string) => s.pool.filter((x) => x.phase === phase)
  switch (s.phase) {
    case 'review': {
      const items = count('review')
      return `Review · ${items.filter((x) => x.done || x.graded).length} of ${items.length}`
    }
    case 'new':
    case 'checkpoint': {
      const live = s.pool.filter((x) => x.phase === 'new' && !x.done).length
      const total = s.graduated.length + live + s.newQueue.length
      return `New words · ${s.graduated.length} of ${total} learned`
    }
    case 'sweep': {
      const items = count('sweep')
      return `Final sweep · ${items.filter((x) => x.done).length} of ${items.length}`
    }
    case 'list': {
      const done = s.pool.filter((x) => x.done).length
      const name = s.type === 'drill' ? 'Drill' : s.type === 'test' ? 'Quick test' : 'Baseline'
      return `${name} · ${done} of ${s.pool.length}`
    }
    default:
      return 'Finished'
  }
}

function SessionHeader({ session, onClose, onUndo, onKeys }: { session: SessionState; onClose: () => void; onUndo: () => void; onKeys: () => void }) {
  const { done, total } = sessionProgress(session)
  const pct = session.phase === 'done' ? 100 : Math.min(100, Math.round((done / total) * 100))
  return (
    <header className="pb-3 pt-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="-ml-2 rounded-xl p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          aria-label="Pause session"
          title="Pause (Esc)"
        >
          <X size={20} />
        </button>
        <p className="tabular flex-1 truncate text-sm text-ink-2">{phaseLine(session)}</p>
        <button
          type="button"
          onClick={onUndo}
          disabled={!session.undo.length}
          className="rounded-xl p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30"
          aria-label="Undo last answer"
          title="Undo last answer (Ctrl+Z)"
        >
          <Undo2 size={19} />
        </button>
        <button
          type="button"
          onClick={onKeys}
          className="-mr-2 hidden rounded-xl p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink sm:block"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          <Keyboard size={19} />
        </button>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </header>
  )
}
