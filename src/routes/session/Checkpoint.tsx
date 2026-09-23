import { getEntry } from '../../data/words'
import { useHotkeys } from '../../lib/hotkeys'
import { useStore } from '../../state/store'
import { Button } from '../../ui/Button'
import { Card, TaskLabel } from './parts'

/** Recap after every batch of graduated words. */
export function Checkpoint() {
  const session = useStore((s) => s.session)
  const next = useStore((s) => s.continueCheckpoint)
  useHotkeys({ Enter: next, Space: next })
  if (!session) return null
  const misses = new Map(session.graduated.map((g) => [g.id, g.misses]))
  const learned = session.graduated.length
  const words = session.recap.map(getEntry)
  return (
    <Card>
      <TaskLabel tone="accent">checkpoint · {learned} learned so far</TaskLabel>
      <h2 className="font-display text-[clamp(1.9rem,5vw,2.6rem)] font-semibold leading-tight">
        {words.length} {words.length === 1 ? 'word' : 'words'} in the bag
      </h2>
      <p className="mt-2 text-ink-2">Read them once more before the next batch.</p>
      <ul className="mt-7 divide-y divide-line">
        {words.map((e) => (
          <li key={e.id} className="flex items-baseline gap-4 py-3">
            <span className="w-40 shrink-0 font-display text-xl font-semibold text-ink">
              {e.word}
              {e.senses > 1 && <sup className="ml-0.5 text-[0.55em] font-normal text-ink-3">{e.sense}</sup>}
            </span>
            <span className="min-w-0 flex-1 text-ink-2">{e.def}</span>
            {(misses.get(e.id) ?? 0) > 0 && <span className="shrink-0 text-xs text-bad">missed {misses.get(e.id)}x</span>}
          </li>
        ))}
      </ul>
      <Button variant="primary" size="lg" keys={['Enter']} onClick={next} className="mt-8">
        Continue
      </Button>
    </Card>
  )
}
