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
import { Kbd } from '../../ui/Kbd'
import { Meaning } from '../../ui/Meaning'
import { Card, TaskLabel } from './parts'

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
        setNote(`${getEntry(v.entryId).word} also means that. The word we want is a different one.`)
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
      Space: () => answered?.correct && proceed(),
      'Mod+Enter': () => wrong && override(),
      KeyO: () => wrong && override(),
    },
    { inInput: ['Mod+Enter'] },
  )

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
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
      <TaskLabel tone={isTest ? 'warn' : 'accent'}>{isTest ? 'test' : task.kind === 'relearn' ? 'once more' : 'type the word'}</TaskLabel>
      <div className="flex flex-col gap-2">
        <p className="font-display text-[clamp(1.45rem,4vw,2rem)] leading-snug text-ink">{entry.defMasked ?? entry.def}</p>
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

      <div key={shakeKey} className={`mt-7 ${shakeKey ? 'anim-shake' : ''}`}>
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
          className={`w-full rounded-2xl border-2 px-5 py-4 font-display text-[1.6rem] text-ink outline-none transition-colors placeholder:text-ink-3/60 ${tone}`}
        />
      </div>
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

      {answered && (
        <div className="anim-fade mt-7 flex flex-col gap-5 border-t border-line pt-6">
          {answered.correct ? (
            <>
              {verdict?.kind === 'typo' && (
                <p className="text-sm text-ink-2">
                  Close enough. Spelled <b className="font-display text-base text-ink">{entry.word}</b>
                </p>
              )}
              <Headword entry={entry} size="md" />
              <Example entry={entry} className="text-lg leading-relaxed text-ink-2" />
              <p className="flex items-center gap-2 text-xs text-ink-3">
                Next card in a moment <Kbd>Enter</Kbd>
              </p>
            </>
          ) : (
            <>
              <div>
                <p className="small-caps text-sm text-ink-3">answer</p>
                <Headword entry={entry} size="lg" />
              </div>
              {verdict?.kind === 'confusion' && (
                <p className="rounded-xl bg-surface-2 px-4 py-3 text-[0.95rem] text-ink-2">
                  You wrote <b className="font-display text-ink">{getEntry(verdict.entryId).word}</b>, which means {getEntry(verdict.entryId).def}.
                </p>
              )}
              <Meaning entry={entry} compact showOtherSenses={false} />
              {needsRetype && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-ink-2" htmlFor="retype">
                    Type it once to lock it in
                  </label>
                  <input
                    id="retype"
                    ref={retypeRef}
                    {...INPUT_PROPS}
                    value={retype}
                    onChange={(e) => setRetype(e.target.value)}
                    onKeyDown={onKey}
                    className={`w-full rounded-xl border-2 bg-surface px-4 py-3 font-display text-xl text-ink outline-none ${retypeOk ? 'border-good' : 'border-line-strong focus:border-accent'}`}
                  />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" keys={['Enter']} onClick={next} disabled={needsRetype && !retypeOk}>
                  Continue
                </Button>
                <Button variant="ghost" keys={['Ctrl', 'Enter']} onClick={override}>
                  I was right
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
