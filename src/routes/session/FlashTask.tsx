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
import { Card, Hint, TaskLabel } from './parts'

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

  useHotkeys({
    Space: flip,
    Enter: flip,
    Digit1: () => rate(false),
    ArrowLeft: () => rate(false),
    Digit2: () => rate(true),
    ArrowRight: () => rate(true),
  })

  return (
    <Card {...swipe}>
      <TaskLabel tone="accent">new word</TaskLabel>
      <Headword entry={entry} showTier />
      {!flipped ? (
        <div className="mt-10 flex flex-col items-start gap-5">
          <p className="max-w-md text-ink-2">Say what you think it means, then flip. Guessing first helps it stick, even when you are wrong.</p>
          <Button variant="primary" size="lg" keys={['Space']} onClick={flip}>
            Show meaning
          </Button>
        </div>
      ) : (
        <div className="anim-fade mt-7 flex flex-col gap-7">
          <Meaning entry={entry} />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="bad" size="lg" keys={['1']} onClick={() => rate(false)}>
              Didn't know
            </Button>
            <Button variant="good" size="lg" keys={['2']} onClick={() => rate(true)}>
              Knew it
            </Button>
          </div>
        </div>
      )}
      {flipped && <Hint>"Knew it" skips the multiple choice and checks you with one typed answer. Swipe left or right on a phone.</Hint>}
    </Card>
  )
}
