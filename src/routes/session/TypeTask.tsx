import { Lightbulb } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Task } from '../../core/engine'
import { checkTyped, forms, letterHint, normalize } from '../../core/grade'
import { getEntry } from '../../data/words'
import { useHotkeys } from '../../lib/hotkeys'
import { useElapsed } from '../../lib/useElapsed'
import { useStore, type Feedback } from '../../state/store'
import { Button } from '../../ui/Button'
import { Example } from '../../ui/Example'
import { Headword } from '../../ui/Headword'
import { Meaning } from '../../ui/Meaning'
import { Card } from './parts'

const INPUT_PROPS = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'none',
  spellCheck: false,
  enterKeyHint: 'go',
} as const

/** Definition shown, type the headword. */
export function TypeTask({ task, feedback }: { task: Task; feedback: Feedback | null }) {
  const entry = getEntry(task.id)
  const submit = useStore((s) => s.submit)
  const proceed = useStore((s) => s.proceed)
  const override = useStore((s) => s.override)
  const retypeOnMiss = useStore((s) => s.settings.retypeOnMiss)
  const elapsed = useElapsed()
  const [value, setValue] = useState('')
  const [retype, setRetype] = useState('')
  const [hint, setHint] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const retypeRef = useRef<HTMLInputElement>(null)
  const answered = feedback && feedback.task.seq === task.seq ? feedback : null
  const isTest = task.kind === 'test' || task.kind === 'baseline'
  const wrong = answered && !answered.correct
  const needsRetype = !!wrong && retypeOnMiss
  const retypeOk = forms(entry.word).has(normalize(retype))

  const check = () => {
    if (answered) return
    const v = checkTyped(value, entry)
    const ms = elapsed()
    switch (v.kind) {
      case 'empty':
        setShakeKey((k) => k + 1)
        return
      case 'synonym':
        setNote(`${getEntry(v.entryId).word} also means that; another word wanted`)
        inputRef.current?.select()
        return
      case 'correct':
      case 'typo':
        submit({ correct: true, typo: v.kind === 'typo', hint, answer: value, ms }, { typed: value, verdict: v, hint })
        return
      case 'confusion':
        submit({ correct: false, confusedWith: v.entryId, hint, answer: value, ms }, { typed: value, verdict: v, hint })
        return
      default:
        submit({ correct: false, hint, answer: value, ms }, { typed: value, verdict: v, hint })
    }
  }

  const next = () => {
    if (!answered) return
    if (needsRetype && !retypeOk) {
      retypeRef.current?.focus()
      setShakeKey((k) => k + 1)
      return
    }
    proceed()
  }

  const addHint = () => {
    if (answered || isTest) return
    setHint((h) => Math.min(h + 1, entry.ex && entry.exSpan ? 2 : 1))
    inputRef.current?.focus()
  }

  useEffect(() => {
    if (!answered) return
    if (answered.correct) {
      const t = setTimeout(proceed, 1500)
      return () => clearTimeout(t)
    }
    if (retypeOnMiss) retypeRef.current?.focus()
  }, [answered, proceed, retypeOnMiss])

  useHotkeys(
    {
      Enter: next,
      Space: next,
      'Mod+Enter': () => wrong && override(),
      KeyO: () => wrong && override(),
    },
    { inInput: ['Mod+Enter'] },
  )

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // Headwords never contain spaces, so once answered Space means continue.
    if ((e.key === 'Enter' || (e.key === ' ' && answered)) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      if (answered) next()
      else check()
    } else if (e.key === 'Tab' && !answered) {
      e.preventDefault()
      addHint()
    }
  }

  const verdict = answered?.verdict
  const tone = !answered ? 'border-line-strong bg-surface focus:border-accent' : answered.correct ? 'border-good bg-good-soft' : 'border-bad bg-bad-soft'

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <p className="font-display text-[clamp(1.35rem,3.6vw,1.7rem)] leading-snug text-ink">{entry.defMasked ?? entry.def}</p>
        <p className="flex flex-wrap items-center gap-x-3 font-display italic text-ink-3">
          <span>{entry.pos}</span>
          {task.firstLetter && (
            <span className="not-italic">
              <span className="small-caps">starts with</span> <b className="font-display text-ink">{entry.word[0]}</b>
            </span>
          )}
        </p>
      </div>

      {hint > 0 && !answered && (
        <div className="anim-fade mt-5 flex flex-col gap-2 rounded-xl bg-warn-soft px-4 py-3 text-ink">
          <p className="font-mono text-lg tracking-widest">{letterHint(entry.word)}</p>
          {hint > 1 && <Example entry={entry} blank className="text-base text-ink-2" />}
        </div>
      )}

      {!wrong && (
        <div key={shakeKey} className={`mt-6 ${shakeKey ? 'anim-shake' : ''}`}>
          <input
            ref={inputRef}
            {...INPUT_PROPS}
            autoFocus
            value={answered?.typed ?? value}
            readOnly={!!answered}
            onChange={(e) => {
              setValue(e.target.value)
              setNote(null)
            }}
            onKeyDown={onKey}
            placeholder="Type the word"
            aria-label="Your answer"
            className={`w-full rounded-2xl border-2 px-5 py-3.5 font-display text-[1.6rem] text-ink outline-none transition-colors placeholder:text-ink-3/60 ${tone}`}
          />
        </div>
      )}
      {note && <p className="anim-fade mt-3 text-sm text-warn">{note}</p>}

      {!answered && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="primary" keys={['Enter']} onClick={check}>
            Check
          </Button>
          {!isTest && (
            <Button variant="ghost" icon={<Lightbulb size={17} />} keys={['Tab']} onClick={addHint} disabled={hint >= (entry.ex && entry.exSpan ? 2 : 1)}>
              Hint
            </Button>
          )}
        </div>
      )}

      {answered?.correct && (
        <div className="anim-fade mt-5 flex flex-col gap-3">
          <Headword entry={entry} size="md" />
          <Example entry={entry} className="text-lg leading-relaxed text-ink-2" />
        </div>
      )}

      {wrong && (
        <div className="anim-fade mt-6 flex flex-col gap-4">
          <div>
            <Headword entry={entry} size="lg" />
            <p className="mt-1.5 text-sm text-ink-3">
              <s className="decoration-ink-3/60">{answered.typed}</s>
              {verdict?.kind === 'confusion' && <> · {getEntry(verdict.entryId).def}</>}
            </p>
          </div>
          <Meaning entry={entry} compact showDef={false} showOtherSenses={false} />
          {needsRetype && (
            <div key={shakeKey} className={shakeKey ? 'anim-shake' : ''}>
              <input
                ref={retypeRef}
                {...INPUT_PROPS}
                autoFocus
                value={retype}
                onChange={(e) => setRetype(e.target.value.replace(/\s/g, ''))}
                onKeyDown={onKey}
                placeholder="Type it again"
                aria-label="Type the word again"
                className={`w-full rounded-xl border-2 bg-surface px-4 py-3 font-display text-xl text-ink outline-none placeholder:text-ink-3/60 ${retypeOk ? 'border-good' : 'border-line-strong focus:border-accent'}`}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" keys={['Space']} onClick={next} disabled={needsRetype && !retypeOk}>
              Continue
            </Button>
            <Button variant="ghost" keys={['Ctrl', 'Enter']} onClick={override}>
              I was right
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
