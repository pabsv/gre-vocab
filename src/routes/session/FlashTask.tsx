import { useEffect, useState } from 'react'
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
  const elapsed = useElapsed()
  const [flipped, setFlipped] = useState(false)

  // Pronounce on arrival only. Settings are read at arrival,
  // so toggling auto pronounce mid card does not replay the word.
  useEffect(() => {
    if (useStore.getState().settings.autoSpeak) speak(entry.word)
  }, [entry.word])

  const flip = () => {
    if (flipped) return
    setFlipped(true)
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

  // Buttons read left to right: Knew it (1), Didn't know (2).
  useHotkeys({
    Space: flip,
    Enter: flip,
    Digit1: () => rate(true),
    Digit2: () => rate(false),
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
