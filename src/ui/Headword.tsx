import { Volume2 } from 'lucide-react'
import { TIER_LABEL, type Entry } from '../data/words'
import { canSpeak, speak } from '../lib/speech'

const SUPERSCRIPT = ['', '¹', '²', '³', '⁴']

/** Dictionary-style headword: serif word, superscript sense number, italic part of speech. */
export function Headword({
  entry,
  size = 'xl',
  showTier = false,
  showSense = true,
}: {
  entry: Entry
  size?: 'md' | 'lg' | 'xl'
  showTier?: boolean
  showSense?: boolean
}) {
  const text = size === 'xl' ? 'text-[clamp(2.6rem,8vw,4.4rem)]' : size === 'lg' ? 'text-[clamp(2rem,6vw,2.9rem)]' : 'text-2xl'
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className={`font-display font-semibold leading-[1.02] text-ink ${text}`}>
        {entry.word}
        {showSense && entry.senses > 1 && (
          <sup className="ml-0.5 align-super text-[0.42em] font-normal text-ink-3">{SUPERSCRIPT[entry.sense] ?? entry.sense}</sup>
        )}
      </h2>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-3">
        <span className="font-display text-lg italic text-ink-2">{entry.pos}</span>
        {showSense && entry.senses > 1 && (
          <span className="small-caps text-sm">
            meaning {entry.sense} of {entry.senses}
          </span>
        )}
        {showTier && <span className="small-caps text-sm">{TIER_LABEL[entry.tier]}</span>}
        {canSpeak() && (
          <button
            type="button"
            onClick={() => speak(entry.word)}
            className="-m-1.5 rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label={`Pronounce ${entry.word}`}
            title="Pronounce (P)"
          >
            <Volume2 size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
