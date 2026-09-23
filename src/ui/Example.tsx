import type { Entry } from '../data/words'

/** Example sentence with the headword highlighted, or blanked for sentence completion. */
export function Example({ entry, blank = false, className = '' }: { entry: Entry; blank?: boolean; className?: string }) {
  if (!entry.ex) return null
  const span = entry.exSpan
  if (!span) return <p className={`font-display italic ${className}`}>{entry.ex}</p>
  const [a, b] = span
  return (
    <p className={`font-display italic ${className}`}>
      {entry.ex.slice(0, a)}
      {blank ? (
        <span className="blank" aria-label="blank" />
      ) : (
        <span className="marker font-medium not-italic text-ink">{entry.ex.slice(a, b)}</span>
      )}
      {entry.ex.slice(b)}
    </p>
  )
}
