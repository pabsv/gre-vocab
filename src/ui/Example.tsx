import { inflectionSuffix } from '../core/text'
import type { Entry, ExampleSentence, ExampleSrc } from '../data/words'
import { useStore } from '../state/store'

/**
 * Review aid while the added sentences are being checked: a source tag on every sentence and a flag
 * toggle on the added ones (stored in meta as `exflag:<entry id>:<hash>`, so flags sync). Set to false
 * to hide both once the review is done.
 */
const SHOW_SOURCES = true

const SRC_LABEL: Record<ExampleSrc, string> = { magoosh: 'magoosh', ebook: 'ebook', gen: 'new' }

/** The entry's `k`th example sentence, falling back to the first. */
function exampleOf(entry: Entry, k = 0): ExampleSentence | undefined {
  return entry.exs?.[k] ?? entry.exs?.[0]
}

/** Example sentence with the headword highlighted, or blanked for sentence completion. */
export function Example({
  entry,
  index = 0,
  blank = false,
  className = '',
}: {
  entry: Entry
  index?: number
  blank?: boolean
  className?: string
}) {
  const ex = exampleOf(entry, index)
  if (!ex) return null
  const [a, b] = ex.span
  return (
    <p className={`font-display italic ${className}`}>
      {ex.t.slice(0, a)}
      {blank ? (
        <>
          <span className="blank" aria-label="blank" />
          {inflectionSuffix(entry.word, ex.t.slice(a, b))}
        </>
      ) : (
        <span className="marker font-medium not-italic text-ink">{ex.t.slice(a, b)}</span>
      )}
      {ex.t.slice(b)}
      {SHOW_SOURCES && <SourceTag entryId={entry.id} ex={ex} />}
    </p>
  )
}

/** Every example sentence of the entry, in order. */
export function Examples({ entry, className = '' }: { entry: Entry; className?: string }) {
  if (!entry.exs?.length) return null
  return (
    <div className="flex flex-col gap-2">
      {entry.exs.map((_, k) => (
        <Example key={k} entry={entry} index={k} className={className} />
      ))}
    </div>
  )
}

function SourceTag({ entryId, ex }: { entryId: string; ex: ExampleSentence }) {
  const key = `exflag:${entryId}:${hash(ex.t)}`
  const flagged = useStore((s) => s.meta.get(key)) === true
  const setMetaValue = useStore((s) => s.setMetaValue)
  const label = SRC_LABEL[ex.src]
  if (ex.src === 'magoosh') return <span className="small-caps ml-2 not-italic text-[0.7rem] text-ink-3">{label}</span>
  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation()
        void setMetaValue(key, !flagged)
      }}
      title={flagged ? 'Flagged as a bad sentence; tap to unflag' : 'Tap to flag this sentence as bad'}
      className={`small-caps ml-2 rounded px-1.5 py-px not-italic text-[0.7rem] ${
        flagged ? 'bg-bad-soft text-bad' : 'bg-surface-3 text-ink-3 hover:text-ink'
      }`}
    >
      {flagged ? `${label} · flagged` : label}
    </button>
  )
}

/** Short stable id for a sentence, so a flag survives the sentence list being reordered. */
function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
