import { Search, Star } from 'lucide-react'
import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { missScoreAt } from '../core/derive'
import { bucketOf, type Bucket } from '../core/fsrs'
import { normalize } from '../core/text'
import { ENTRIES, TIER_LABEL, type Tier } from '../data/words'
import { useHotkeys } from '../lib/hotkeys'
import { useNow } from '../lib/useNow'
import { suspendedFrom, useStore } from '../state/store'
import { BUCKET_LABEL, dueLabel } from '../ui/format'
import { PageTitle } from '../ui/Panel'
import { WordDetail } from '../ui/WordDetail'

type Filter = 'all' | Bucket | 'starred' | 'trouble' | 'suspended'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'learning', label: 'Learning' },
  { key: 'familiar', label: 'Familiar' },
  { key: 'mastered', label: 'Mastered' },
  { key: 'trouble', label: 'Trouble' },
  { key: 'starred', label: 'Starred' },
  { key: 'suspended', label: 'Suspended' },
]
const DOT: Record<Bucket, string> = {
  new: 'var(--b-new)',
  learning: 'var(--b-learning)',
  familiar: 'var(--b-familiar)',
  mastered: 'var(--b-mastered)',
}

export function WordsRoute() {
  const [params, setParams] = useSearchParams()
  const progress = useStore((s) => s.progress)
  const meta = useStore((s) => s.meta)
  const t = useNow()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const deferred = useDeferredValue(query)
  const filter = (params.get('f') as Filter | null) ?? 'all'
  const tier = (params.get('tier') as Tier | null) ?? null
  const openId = params.get('id')
  const searchRef = useRef<HTMLInputElement>(null)

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: key !== 'id' })
  }

  useHotkeys({ Slash: () => searchRef.current?.focus() })

  const rows = useMemo(() => {
    const suspended = suspendedFrom(meta)
    const q = normalize(deferred)
    const qText = deferred.trim().toLowerCase()
    return ENTRIES.filter((e) => {
      const p = progress.get(e.id)
      if (tier && e.tier !== tier) return false
      if (q && !normalize(e.word).startsWith(q) && !(qText.length > 2 && e.def.toLowerCase().includes(qText))) return false
      switch (filter) {
        case 'all':
          return true
        case 'starred':
          return meta.get(`star:${e.id}`) === true
        case 'suspended':
          return suspended.has(e.id)
        case 'trouble':
          return !!p && missScoreAt(p, t) >= 0.35
        default:
          return bucketOf(p?.card ?? null) === filter
      }
    }).sort((a, b) => (filter === 'trouble' ? missScoreAt(progress.get(b.id)!, t) - missScoreAt(progress.get(a.id)!, t) : a.word.localeCompare(b.word) || a.sense - b.sense))
  }, [progress, meta, deferred, filter, tier, t])

  return (
    <div className="anim-rise flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <PageTitle>Words</PageTitle>
        <label className="relative block max-w-xl">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setParam('q', e.target.value || null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('')
                setParam('q', null)
                e.currentTarget.blur()
              }
            }}
            placeholder="Search a word or a meaning"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-2xl border border-line-strong bg-surface py-3 pl-11 pr-12 text-[1.02rem] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
          />
          <span className="absolute right-4 top-1/2 hidden -translate-y-1/2 sm:flex">
            <kbd className="kbd">/</kbd>
          </span>
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTERS.map((f) => (
            <Chip key={f.key} active={filter === f.key} onClick={() => setParam('f', f.key === 'all' ? null : f.key)}>
              {f.label}
            </Chip>
          ))}
          <span className="mx-1 w-px self-stretch bg-line" />
          {(['common', 'basic', 'advanced'] as Tier[]).map((k) => (
            <Chip key={k} active={tier === k} onClick={() => setParam('tier', tier === k ? null : k)}>
              {TIER_LABEL[k]}
            </Chip>
          ))}
        </div>
      </div>

      <p className="text-sm text-ink-3">{rows.length === ENTRIES.length ? `${rows.length} words` : `${rows.length} of ${ENTRIES.length}`}</p>

      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {rows.map((e) => {
          const p = progress.get(e.id)
          const bucket = bucketOf(p?.card ?? null)
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setParam('id', e.id)}
                className="grid w-full grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-0.5 px-4 py-3 text-left transition-colors hover:bg-surface-2 sm:grid-cols-[minmax(7.5rem,11rem)_1fr_auto] sm:px-5"
              >
                <span className="truncate font-display text-lg font-semibold text-ink">
                  {e.word}
                  {e.senses > 1 && <sup className="ml-0.5 text-[0.6em] font-normal text-ink-3">{e.sense}</sup>}
                  {meta.get(`star:${e.id}`) === true && <Star size={12} className="ml-1.5 inline fill-current align-baseline text-warn" />}
                </span>
                <span className="col-span-2 row-start-2 min-w-0 truncate text-[0.95rem] text-ink-2 sm:col-span-1 sm:row-start-auto">
                  <span className="mr-2 font-display italic text-ink-3">{e.pos.slice(0, 3)}.</span>
                  {e.def}
                </span>
                <span className="flex items-center gap-2 text-xs text-ink-3">
                  <span className="hidden sm:inline">{p?.card ? dueLabel(p.card.due, t) : ''}</span>
                  <span className="flex items-center gap-1.5" title={BUCKET_LABEL[bucket]}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: DOT[bucket], outline: bucket === 'new' ? '1px solid var(--line-strong)' : undefined }} />
                    <span className="hidden md:inline">{BUCKET_LABEL[bucket]}</span>
                  </span>
                </span>
              </button>
            </li>
          )
        })}
        {!rows.length && <li className="px-5 py-10 text-center text-ink-3">Nothing matches.</li>}
      </ul>

      {openId && <WordDetail key={openId} id={openId} onClose={() => setParam('id', null)} />}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors ${active ? 'border-ink bg-ink text-bg' : 'border-line-strong bg-surface text-ink-2 hover:text-ink'}`}
    >
      {children}
    </button>
  )
}
