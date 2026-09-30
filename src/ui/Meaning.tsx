import type { ReactNode } from 'react'
import { BY_WORD, getEntry, lookalikesOf, type Entry } from '../data/words'
import { useStore } from '../state/store'
import { Examples } from './Example'

/** The answer side: definition, example, note, related words and your memory hook. */
export function Meaning({
  entry,
  compact = false,
  showOtherSenses = true,
  showDef = true,
}: {
  entry: Entry
  compact?: boolean
  showOtherSenses?: boolean
  showDef?: boolean
}) {
  const hook = useStore((s) => s.meta.get(`note:${entry.id}`)) as string | undefined
  const syn = (entry.syn ?? []).map(getEntry)
  const look = dedupe(lookalikesOf(entry.id))
  const others = showOtherSenses ? (BY_WORD.get(entry.word.toLowerCase()) ?? []).filter((e) => e.id !== entry.id) : []
  const hasExtras = !!entry.note || syn.length > 0 || look.length > 0 || others.length > 0
  return (
    <div className="flex flex-col gap-3">
      {showDef && <p className={`font-display leading-snug text-ink ${compact ? 'text-xl' : 'text-[clamp(1.3rem,3.4vw,1.6rem)]'}`}>{entry.def}</p>}
      <Examples entry={entry} className={`leading-relaxed text-ink-2 ${compact ? 'text-base' : 'text-lg'}`} />
      {hook && (
        <p className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-2.5 text-[0.95rem] text-ink">
          <span className="small-caps mr-2 text-warn">memory hook</span>
          {hook}
        </p>
      )}
      {!compact && hasExtras && (
        <dl className="grid gap-1.5 border-t border-line pt-3 text-[0.9rem] text-ink-2">
          {entry.note && <dd className="text-ink-3">{entry.note}</dd>}
          {others.length > 0 && (
            <Row label="other meanings">
              {others.map((o) => (
                <span key={o.id} className="mr-3 inline-block">
                  <span className="italic text-ink-3">{o.pos}</span> {o.def}
                </span>
              ))}
            </Row>
          )}
          {syn.length > 0 && <Row label="also in deck">{syn.map((s) => s.word).join(', ')}</Row>}
          {look.length > 0 && (
            <Row label="don't confuse">
              {look.map((l) => (
                <span key={l.id} className="mr-3 inline-block">
                  <b className="font-display font-semibold text-ink">{l.word}</b> <span className="text-ink-3">{l.def}</span>
                </span>
              ))}
            </Row>
          )}
        </dl>
      )}
    </div>
  )
}

function dedupe(list: readonly Entry[]) {
  const seen = new Set<string>()
  return list.filter((e) => {
    if (seen.has(e.word)) return false
    seen.add(e.word)
    return true
  })
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="small-caps w-28 shrink-0 pt-px text-ink-3">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  )
}
