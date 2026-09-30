import { Check, Eye, EyeOff, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Task } from '../../core/engine'
import { getEntry, type Entry } from '../../data/words'
import { useHotkeys } from '../../lib/hotkeys'
import { useElapsed } from '../../lib/useElapsed'
import { useStore } from '../../state/store'
import { Button } from '../../ui/Button'
import { Example } from '../../ui/Example'
import { Headword } from '../../ui/Headword'
import { Kbd } from '../../ui/Kbd'
import { Card } from './parts'

/**
 * Picking an option shows right or wrong at once but commits nothing: the pick can change freely
 * (switch off a lucky guess, fix a misclick) and only the option picked when Space is pressed is recorded.
 * Meanings can be peeked at any time without a penalty.
 */
export function McqTask({ task }: { task: Task }) {
  const entry = getEntry(task.id)
  const options = (task.options ?? []).map(getEntry)
  const submit = useStore((s) => s.submit)
  const undo = useStore((s) => s.undo)
  const elapsed = useElapsed()
  const byWord = task.mode !== 'mcq-w2d'
  const [picked, setPicked] = useState<string | null>(null)
  /** Options whose meaning is shown. */
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set())
  /** Time to the first pick: how fast the word came to mind, not how long the review took. */
  const firstMs = useRef<number | null>(null)

  const reveal = (k: number) => {
    const opt = options[k]
    if (!opt) return
    setRevealed((prev) => {
      const next = new Set(prev)
      if (!next.delete(opt.id)) next.add(opt.id)
      return next
    })
  }

  const pick = (k: number) => {
    const opt = options[k]
    if (!opt) return
    firstMs.current ??= elapsed()
    setPicked(opt.id)
  }

  const commit = () => {
    if (!picked) return
    const right = picked === entry.id
    submit({ correct: right, confusedWith: right ? undefined : picked, answer: picked, ms: firstMs.current ?? elapsed() })
  }

  useHotkeys({
    Digit1: () => pick(0),
    Digit2: () => pick(1),
    Digit3: () => pick(2),
    Digit4: () => pick(3),
    'Shift+Digit1': () => reveal(0),
    'Shift+Digit2': () => reveal(1),
    'Shift+Digit3': () => reveal(2),
    'Shift+Digit4': () => reveal(3),
    ArrowLeft: undo,
    Enter: commit,
    Space: commit,
  })

  const wrong = picked !== null && picked !== entry.id

  return (
    <Card>
      {task.mode === 'mcq-w2d' && <Headword entry={entry} size="lg" />}
      {task.mode === 'mcq-d2w' && (
        <div className="flex flex-col gap-2">
          <p className="font-display text-[clamp(1.35rem,3.6vw,1.7rem)] leading-snug text-ink">{entry.defMasked ?? entry.def}</p>
          <p className="font-display italic text-ink-3">{entry.pos}</p>
        </div>
      )}
      {task.mode === 'mcq-blank' && <Example entry={entry} index={task.ex} blank className="text-[clamp(1.25rem,3.4vw,1.6rem)] leading-relaxed text-ink" />}

      <ol className="mt-6 grid gap-2.5">
        {options.map((o, k) => (
          <Option
            key={o.id}
            n={k + 1}
            option={o}
            target={entry}
            byWord={byWord}
            explainTarget={task.mode === 'mcq-blank'}
            picked={picked}
            revealed={revealed.has(o.id)}
            onPick={() => pick(k)}
            onReveal={() => reveal(k)}
          />
        ))}
      </ol>

      {picked && (
        <div className="anim-fade mt-5 flex flex-col gap-4">
          {wrong && task.mode !== 'mcq-blank' && <Example entry={entry} className="leading-relaxed text-ink-2" />}
          <Button variant="primary" keys={['Space']} onClick={commit} className="self-start">
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
  explainTarget,
  picked,
  revealed,
  onPick,
  onReveal,
}: {
  n: number
  option: Entry
  target: Entry
  byWord: boolean
  /** After a miss, also show the target's meaning (the prompt did not). */
  explainTarget: boolean
  picked: string | null
  revealed: boolean
  onPick: () => void
  onReveal: () => void
}) {
  const isTarget = option.id === target.id
  const isPicked = picked === option.id
  const wrong = picked !== null && picked !== target.id
  let tone = 'border-line bg-surface hover:border-line-strong hover:bg-surface-2'
  if (picked) {
    if (isTarget) tone = `border-good/60 bg-good-soft ${isPicked ? 'anim-pop' : ''}`
    else if (isPicked) tone = 'border-bad/60 bg-bad-soft anim-shake'
    else tone = `border-line bg-surface hover:border-line-strong ${revealed ? '' : 'opacity-55'}`
  }
  const explained = wrong && (isPicked || (isTarget && explainTarget))
  const label = byWord ? option.word : 'this option'
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onPick}
        aria-pressed={isPicked}
        className={`group flex w-full items-start gap-4 rounded-2xl border py-3 pl-4 text-left transition-colors pr-14 ${tone}`}
      >
        <span className="mt-0.5 flex w-6 shrink-0 justify-center">
          {picked && isTarget ? <Check size={18} className="text-good" /> : isPicked ? <X size={18} className="text-bad" /> : <Kbd>{n}</Kbd>}
        </span>
        <span className="min-w-0 flex-1">
          {byWord ? (
            <span className="font-display text-xl font-semibold text-ink">{option.word}</span>
          ) : (
            <span className="text-[1.02rem] leading-snug text-ink">{option.def}</span>
          )}
          {(explained || revealed) && (
            <span className="mt-0.5 block text-sm text-ink-2">{byWord ? option.def : <b className="font-display font-semibold">{option.word}</b>}</span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onReveal}
        aria-pressed={revealed}
        aria-label={revealed ? `Hide meaning of ${label}` : `Show meaning of ${label}`}
        title={`${revealed ? 'Hide' : 'Show'} meaning (Shift+${n})`}
        className={`absolute right-2 top-2 rounded-xl p-2 transition-colors hover:bg-surface-2 hover:text-ink ${revealed ? 'text-accent' : 'text-ink-3'}`}
      >
        {revealed ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </li>
  )
}
