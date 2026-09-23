import { Check, X } from 'lucide-react'
import { useEffect } from 'react'
import type { Task } from '../../core/engine'
import { getEntry, type Entry } from '../../data/words'
import { useHotkeys } from '../../lib/hotkeys'
import { useElapsed } from '../../lib/useElapsed'
import { useStore, type Feedback } from '../../state/store'
import { Button } from '../../ui/Button'
import { Example } from '../../ui/Example'
import { Headword } from '../../ui/Headword'
import { Kbd } from '../../ui/Kbd'
import { Meaning } from '../../ui/Meaning'
import { Card, TaskLabel } from './parts'

const LABEL: Record<string, string> = {
  'mcq-w2d': 'pick the meaning',
  'mcq-d2w': 'pick the word',
  'mcq-blank': 'which word fits the blank?',
}

export function McqTask({ task, feedback }: { task: Task; feedback: Feedback | null }) {
  const entry = getEntry(task.id)
  const options = (task.options ?? []).map(getEntry)
  const submit = useStore((s) => s.submit)
  const proceed = useStore((s) => s.proceed)
  const elapsed = useElapsed()
  const answered = feedback && feedback.task.seq === task.seq ? feedback : null
  const byWord = task.mode !== 'mcq-w2d'

  const pick = (k: number) => {
    const opt = options[k]
    if (answered || !opt) return
    const correct = opt.id === entry.id
    submit({ correct, confusedWith: correct ? undefined : opt.id, answer: opt.id, ms: elapsed() }, { picked: opt.id })
  }

  useEffect(() => {
    if (!answered?.correct) return
    const t = setTimeout(proceed, 800)
    return () => clearTimeout(t)
  }, [answered, proceed])

  useHotkeys({
    Digit1: () => pick(0),
    Digit2: () => pick(1),
    Digit3: () => pick(2),
    Digit4: () => pick(3),
    Enter: () => answered && proceed(),
    Space: () => answered && proceed(),
  })

  return (
    <Card>
      <TaskLabel tone={task.kind === 'filler' ? 'muted' : 'accent'}>
        {task.kind === 'filler' ? 'quick look back' : task.kind === 'relearn' ? 'once more' : 'multiple choice'} · {LABEL[task.mode]}
      </TaskLabel>

      {task.mode === 'mcq-w2d' && <Headword entry={entry} size="lg" />}
      {task.mode === 'mcq-d2w' && (
        <div className="flex flex-col gap-2">
          <p className="font-display text-[clamp(1.45rem,4vw,2rem)] leading-snug text-ink">{entry.def}</p>
          <p className="font-display italic text-ink-3">{entry.pos}</p>
        </div>
      )}
      {task.mode === 'mcq-blank' && <Example entry={entry} blank className="text-[clamp(1.25rem,3.4vw,1.6rem)] leading-relaxed text-ink" />}

      <ol className="mt-8 grid gap-2.5">
        {options.map((o, k) => (
          <Option key={o.id} n={k + 1} option={o} target={entry} byWord={byWord} answered={answered} onPick={() => pick(k)} />
        ))}
      </ol>

      {answered && !answered.correct && (
        <div className="anim-fade mt-8 flex flex-col gap-6 border-t border-line pt-6">
          {task.mode !== 'mcq-w2d' && <Headword entry={entry} size="md" />}
          <Meaning entry={entry} compact />
          <Button variant="primary" keys={['Enter']} onClick={proceed} className="self-start">
            Continue
          </Button>
        </div>
      )}
    </Card>
  )
}

function Option({
  n,
  option,
  target,
  byWord,
  answered,
  onPick,
}: {
  n: number
  option: Entry
  target: Entry
  byWord: boolean
  answered: Feedback | null
  onPick: () => void
}) {
  const isTarget = option.id === target.id
  const isPicked = answered?.picked === option.id
  let tone = 'border-line bg-surface hover:border-line-strong hover:bg-surface-2'
  if (answered) {
    if (isTarget) tone = 'border-good/60 bg-good-soft anim-pop'
    else if (isPicked) tone = 'border-bad/60 bg-bad-soft anim-shake'
    else tone = 'border-line bg-surface opacity-55'
  }
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={!!answered}
        className={`group flex w-full items-start gap-4 rounded-2xl border px-4 py-3.5 text-left transition-colors ${tone}`}
      >
        <span className="mt-0.5 flex w-6 shrink-0 justify-center">
          {answered && isTarget ? <Check size={18} className="text-good" /> : answered && isPicked ? <X size={18} className="text-bad" /> : <Kbd>{n}</Kbd>}
        </span>
        <span className="min-w-0 flex-1">
          {byWord ? (
            <span className="font-display text-xl font-semibold text-ink">{option.word}</span>
          ) : (
            <span className="text-[1.02rem] leading-snug text-ink">{option.def}</span>
          )}
          {answered && isPicked && !isTarget && (
            <span className="mt-1 block text-sm text-ink-2">
              {byWord ? (
                <>means: {option.def}</>
              ) : (
                <>
                  that is <b className="font-display font-semibold">{option.word}</b>
                </>
              )}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}
