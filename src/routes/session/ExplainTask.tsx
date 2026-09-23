import { useRef, useState } from 'react'
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
import { Card, Hint, TaskLabel } from './parts'

const finePointer = typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches

const LABEL: Partial<Record<Task['kind'], string>> = {
  sweep: 'final sweep · explain the meaning',
  test: 'test · explain the meaning',
  baseline: 'baseline · explain the meaning',
  relearn: 'once more · explain the meaning',
  drill: 'drill · explain the meaning',
}

/** Word shown, recall the meaning, reveal and grade yourself honestly. */
export function ExplainTask({ task }: { task: Task }) {
  const entry = getEntry(task.id)
  const submit = useStore((s) => s.submit)
  const elapsed = useElapsed()
  const [revealed, setRevealed] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const reveal = () => {
    if (revealed) return
    setRevealed(true)
    inputRef.current?.blur()
  }
  const grade = (ok: boolean) => {
    if (!revealed) return
    submit({ correct: ok, answer: value.trim() || undefined, ms: elapsed() })
  }
  const swipe = useSwipe(
    () => grade(false),
    () => grade(true),
    revealed,
  )

  useHotkeys({
    Space: reveal,
    Enter: reveal,
    Digit1: () => grade(false),
    ArrowLeft: () => grade(false),
    Digit2: () => grade(true),
    ArrowRight: () => grade(true),
  })

  const tone = task.kind === 'test' || task.kind === 'baseline' ? 'warn' : 'accent'
  return (
    <Card {...swipe}>
      <TaskLabel tone={tone}>{LABEL[task.kind] ?? 'explain the meaning'}</TaskLabel>
      <Headword entry={entry} />
      {task.context && entry.ex && (
        <Example entry={entry} className="mt-5 text-lg leading-relaxed text-ink-2" />
      )}

      {!revealed ? (
        <div className="mt-8 flex flex-col gap-4">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                reveal()
              }
            }}
            autoFocus={finePointer}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="What does it mean? (optional)"
            aria-label="Your meaning"
            className="w-full rounded-2xl border-2 border-line-strong bg-surface px-5 py-3.5 text-lg text-ink outline-none placeholder:text-ink-3/70 focus:border-accent"
          />
          <Button variant="primary" size="lg" keys={['Enter']} onClick={reveal} className="self-start">
            Reveal
          </Button>
        </div>
      ) : (
        <div className="anim-fade mt-7 flex flex-col gap-6">
          {value.trim() && (
            <p className="rounded-xl bg-surface-2 px-4 py-3 text-ink-2">
              <span className="small-caps mr-2 text-ink-3">you said</span>
              {value.trim()}
            </p>
          )}
          <Meaning entry={entry} />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="bad" size="lg" keys={['1']} onClick={() => grade(false)}>
              Wrong
            </Button>
            <Button variant="good" size="lg" keys={['2']} onClick={() => grade(true)}>
              Right
            </Button>
          </div>
        </div>
      )}
      {revealed && <Hint>Call it right only if you had the gist before revealing. When unsure, call it wrong: the word just comes back sooner.</Hint>}
    </Card>
  )
}
