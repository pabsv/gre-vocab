import { useState } from 'react'
import type { Task } from '../../core/engine'
import { getEntry } from '../../data/words'
import { useHotkeys } from '../../lib/hotkeys'
import { useElapsed } from '../../lib/useElapsed'
import { useSwipe } from '../../lib/useSwipe'
import { useStore } from '../../state/store'
import { Button } from '../../ui/Button'
import { Example } from '../../ui/Example'
import { Headword } from '../../ui/Headword'
import { Meaning } from '../../ui/Meaning'
import { Card } from './parts'

/** Word shown, recall the meaning in your head, reveal and grade yourself honestly. */
export function ExplainTask({ task }: { task: Task }) {
  const entry = getEntry(task.id)
  const submit = useStore((s) => s.submit)
  const elapsed = useElapsed()
  const [revealed, setRevealed] = useState(false)

  const reveal = () => setRevealed(true)
  const grade = (ok: boolean, rough = false) => {
    if (!revealed) return
    submit({ correct: ok, rough: rough || undefined, ms: elapsed() })
  }
  const swipe = useSwipe(
    () => grade(false),
    () => grade(true),
    revealed,
  )

  // In reading order: Right (1), Roughly (2), Wrong (3).
  useHotkeys({
    Space: reveal,
    Enter: reveal,
    Digit1: () => grade(true),
    Digit2: () => grade(true, true),
    Digit3: () => grade(false),
  })

  return (
    <Card {...swipe}>
      <Headword entry={entry} size={revealed ? 'lg' : 'xl'} />
      {task.context && (
        <Example entry={entry} index={task.ex} className="mt-5 text-lg leading-relaxed text-ink-2" />
      )}

      {!revealed ? (
        <Button variant="primary" size="lg" keys={['Space']} onClick={reveal} className="mt-8 self-start">
          Reveal
        </Button>
      ) : (
        <div className="anim-fade mt-5 flex flex-col gap-5">
          <Meaning entry={entry} />
          <div className="grid grid-cols-3 gap-3">
            <Button variant="good" size="lg" keys={['1']} onClick={() => grade(true)}>
              Right
            </Button>
            <Button variant="warn" size="lg" keys={['2']} onClick={() => grade(true, true)}>
              Roughly
            </Button>
            <Button variant="bad" size="lg" keys={['3']} onClick={() => grade(false)}>
              Wrong
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
