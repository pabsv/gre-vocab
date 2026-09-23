import { useLiveQuery } from 'dexie-react-hooks'
import { EyeOff, ExternalLink, RotateCcw, Star, Check, X } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { missScoreAt } from '../core/derive'
import { bucketOf } from '../core/fsrs'
import { studyDay } from '../core/time'
import { getEntry, TIER_LABEL } from '../data/words'
import { db } from '../db/db'
import { now } from '../lib/clock'
import { useHotkeys } from '../lib/hotkeys'
import { useStore } from '../state/store'
import { Button } from './Button'
import { Headword } from './Headword'
import { Meaning } from './Meaning'
import { BUCKET_LABEL, dueLabel } from './format'

const MODE_LABEL: Record<string, string> = {
  flash: 'flashcard',
  'mcq-w2d': 'choice: meaning',
  'mcq-d2w': 'choice: word',
  'mcq-blank': 'sentence blank',
  type: 'typed the word',
  explain: 'explained',
}

/** Side sheet with everything about one word: meaning, your history, notes and actions. */
export function WordDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const entry = getEntry(id)
  const p = useStore((s) => s.progress.get(id))
  const meta = useStore((s) => s.meta)
  const setMetaValue = useStore((s) => s.setMetaValue)
  const markKnown = useStore((s) => s.markKnown)
  const resetWord = useStore((s) => s.resetWord)
  const starred = meta.get(`star:${id}`) === true
  const suspended = meta.get(`suspend:${id}`) === true
  const savedHook = (meta.get(`note:${id}`) as string | undefined) ?? ''
  const [hook, setHook] = useState(savedHook)
  const history = useLiveQuery(() => db.events.where('entryId').equals(id).reverse().sortBy('at'), [id])
  useHotkeys({ Escape: onClose })

  const t = now()
  const bucket = bucketOf(p?.card ?? null)
  const accuracy = p && p.seen ? Math.round(((p.seen - p.wrong) / p.seen) * 100) : null
  const confusions = Object.entries(p?.confusions ?? {}).sort((a, b) => b[1] - a[1])
  const saveHook = () => {
    if (hook.trim() !== savedHook) void setMetaValue(`note:${id}`, hook.trim() || null)
  }

  // Portal: animated page containers would otherwise trap the fixed overlay.
  return createPortal(
    <div className="anim-fade fixed inset-0 z-40 flex justify-end bg-ink/25 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        className="anim-rise flex h-full w-full max-w-[560px] flex-col overflow-y-auto border-l border-line bg-surface shadow-card"
        onClick={(e) => e.stopPropagation()}
        aria-label={`Details for ${entry.word}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-5 py-3 backdrop-blur sm:px-7">
          <span className="small-caps text-sm text-ink-3">
            {TIER_LABEL[entry.tier]} · Magoosh #{entry.rank}
          </span>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X size={19} />
          </button>
        </div>

        <div className="flex flex-col gap-7 px-5 py-7 sm:px-7">
          <Headword entry={entry} size="lg" />
          <Meaning entry={entry} />

          <dl className="grid grid-cols-3 gap-4 rounded-2xl bg-surface-2 p-4">
            <Fact label="status" value={suspended ? 'Suspended' : BUCKET_LABEL[bucket]} />
            <Fact label="next review" value={p?.card ? dueLabel(p.card.due, t) : 'not started'} />
            <Fact label="accuracy" value={accuracy === null ? 'none yet' : `${accuracy}%`} />
            <Fact label="answers" value={String(p?.seen ?? 0)} />
            <Fact label="lapses" value={String(p?.card?.lapses ?? 0)} />
            <Fact label="mistake weight" value={p ? missScoreAt(p, t).toFixed(1) : '0'} />
          </dl>

          <label className="flex flex-col gap-2">
            <span className="small-caps text-ink-3">memory hook</span>
            <textarea
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              onBlur={saveHook}
              rows={2}
              placeholder="A picture, a sound-alike, a sentence about your life. It shows on every reveal."
              className="w-full resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-[0.95rem] text-ink outline-none placeholder:text-ink-3/70 focus:border-accent"
            />
          </label>

          {confusions.length > 0 && (
            <div>
              <p className="small-caps mb-2 text-ink-3">you mixed it up with</p>
              <ul className="grid gap-1.5">
                {confusions.map(([other, n]) => (
                  <li key={other} className="text-[0.95rem] text-ink-2">
                    <b className="font-display text-ink">{getEntry(other).word}</b> {getEntry(other).def} <span className="text-xs text-bad">{n}x</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<Star size={15} className={starred ? 'fill-current text-warn' : ''} />} onClick={() => void setMetaValue(`star:${id}`, !starred)}>
              {starred ? 'Starred' : 'Star'}
            </Button>
            {bucket !== 'mastered' && (
              <Button size="sm" icon={<Check size={15} />} onClick={() => void markKnown(id)}>
                Mark as known
              </Button>
            )}
            <Button size="sm" icon={<EyeOff size={15} />} onClick={() => void setMetaValue(`suspend:${id}`, !suspended)}>
              {suspended ? 'Unsuspend' : 'Suspend'}
            </Button>
            {p && (
              <Button size="sm" icon={<RotateCcw size={15} />} onClick={() => void resetWord(id)}>
                Reset progress
              </Button>
            )}
            <a
              href={`https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(entry.word)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-2 rounded-xl px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <ExternalLink size={15} /> Dictionary
            </a>
          </div>

          {history && history.length > 0 && (
            <div>
              <p className="small-caps mb-2 text-ink-3">history</p>
              <ol className="grid gap-1 text-sm">
                {history
                  .filter((e) => !e.voided && e.mode)
                  .slice(0, 40)
                  .map((e) => (
                    <li key={e.id} className="flex items-center gap-3 text-ink-2">
                      <span className="tabular w-24 shrink-0 text-ink-3">{studyDay(e.at)}</span>
                      <span className={`w-4 ${e.ok ? 'text-good' : 'text-bad'}`}>{e.ok ? '✓' : '✗'}</span>
                      <span className="flex-1">{MODE_LABEL[e.mode ?? ''] ?? e.mode}</span>
                      <span className="text-ink-3">{e.kind}</span>
                    </li>
                  ))}
              </ol>
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="small-caps text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-[0.95rem] text-ink">{value}</dd>
    </div>
  )
}
