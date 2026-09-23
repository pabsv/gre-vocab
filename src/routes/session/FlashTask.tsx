import { useState } from 'react'
import type { Task } from '../../core/engine'
import { getEntry } from '../../data/words'
import { useHotkeys } from '../../lib/hotkeys'
import { speak } from '../../lib/speech'
import { useElapsed } from '../../lib/useElapsed'
import { useSwipe } from '../../lib/useSwipe'
import { useStore } from '../../state/store'
import { Button } from '../../ui/Button'
import { Headword } from '../../ui/Headword'
import { Meaning } from '../../ui/Meaning'
import { Card } from './parts'

/** New word, pretest style: try to recall, flip, then say honestly whether you knew it. */
export function FlashTask({ task }: { task: Task }) {
  const entry = getEntry(task.id)
  const submit = useStore((s) => s.submit)
  const autoSpeak = useStore((s) => s.settings.autoSpeak)
  const elapsed = useElapsed()
  const [flipped, setFlipped] = useState(false)

  const flip = () => {
    if (flipped) return
    setFlipped(true)
    if (autoSpeak) speak(entry.word)
  }
  const rate = (knew: boolean) => {
    if (!flipped) return
    submit({ correct: knew, knew, ms: elapsed() })
  }
  const swipe = useSwipe(
    () => rate(false),
    () => rate(true),
    flipped,
  )

  // Buttons read left to right: Knew it (1, ←), Didn't know (2, →).
  useHotkeys({
    Space: flip,
    Enter: flip,
    Digit1: () => rate(true),
    ArrowLeft: () => rate(true),
    Digit2: () => rate(false),
    ArrowRight: () => rate(false),
  })

  return (
    <Card {...swipe}>
      <Headword entry={entry} size={flipped ? 'lg' : 'xl'} />
      {!flipped ? (
        <Button variant="primary" size="lg" keys={['Space']} onClick={flip} className="mt-10 self-start">
          Show meaning
        </Button>
      ) : (
        <div className="anim-fade mt-5 flex flex-col gap-5">
          <Meaning entry={entry} />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="good" size="lg" keys={['1']} onClick={() => rate(true)}>
              Knew it
            </Button>
            <Button variant="bad" size="lg" keys={['2']} onClick={() => rate(false)}>
              Didn't know
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
