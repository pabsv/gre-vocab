import { useNavigate } from 'react-router'
import { getEntry } from '../../data/words'
import { useHotkeys } from '../../lib/hotkeys'
import { useStore } from '../../state/store'
import { Button } from '../../ui/Button'
import { Card, TaskLabel } from './parts'

/** Recap after every batch of graduated words. */
export function Checkpoint() {
  const session = useStore((s) => s.session)
  const next = useStore((s) => s.continueCheckpoint)
  const navigate = useNavigate()
  useHotkeys({ Enter: next, Space: next })
  if (!session) return null
  const misses = new Map(session.graduated.map((g) => [g.id, g.misses]))
  const learned = session.graduated.length
  const words = session.recap.map(getEntry)
  return (
    <Card>
      <TaskLabel tone="accent">{learned} learned</TaskLabel>
      <ul className="divide-y divide-line">
        {words.map((e) => (
          <li key={e.id} className="flex items-baseline gap-4 py-2.5">
            <span className="w-40 shrink-0 font-display text-xl font-semibold text-ink">
              {e.word}
              {e.senses > 1 && <sup className="ml-0.5 text-[0.55em] font-normal text-ink-3">{e.sense}</sup>}
            </span>
            <span className="min-w-0 flex-1 text-ink-2">{e.def}</span>
            {(misses.get(e.id) ?? 0) > 0 && <span className="shrink-0 text-xs text-bad">missed {misses.get(e.id)}x</span>}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="primary" size="lg" keys={['Enter']} onClick={next}>
          Continue
        </Button>
        {/* Stopping loses nothing: unfinished words carry over and owed sweeps run next session. */}
        <Button variant="secondary" size="lg" keys={['Esc']} onClick={() => navigate('/')}>
          Stop here
        </Button>
      </div>
    </Card>
  )
}
