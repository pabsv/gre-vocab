import { useLiveQuery } from 'dexie-react-hooks'
import { Flame, Swords } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { confusionPairs, troubleList } from '../core/stats'
import { addDays, studyDay } from '../core/time'
import { getEntry } from '../data/words'
import { db } from '../db/db'
import { useNow } from '../lib/useNow'
import { useStore } from '../state/store'
import { Button } from '../ui/Button'
import { plural } from '../ui/format'

export function MistakesRoute() {
  const navigate = useNavigate()
  const progress = useStore((s) => s.progress)
  const plan = useStore((s) => s.plan)
  const startList = useStore((s) => s.startList)
  const t = useNow()
  const today = studyDay(t)
  const trouble = useMemo(() => troubleList(progress, t), [progress, t])
  const pairs = useMemo(() => confusionPairs(progress).slice(0, 12), [progress])
  const recent = useLiveQuery(async () => {
    const rows = await db.events.where('day').aboveOrEqual(addDays(today, -6)).toArray()
    const misses = new Map<string, { n: number; last: number }>()
    for (const e of rows) {
      if (e.voided || e.ok || !e.mode || e.mode === 'flash') continue
      const m = misses.get(e.entryId) ?? { n: 0, last: 0 }
      m.n++
      m.last = Math.max(m.last, e.at)
      misses.set(e.entryId, m)
    }
    return [...misses.entries()].sort((a, b) => b[1].last - a[1].last)
  }, [today])

  const open = (id: string) => navigate(`/words?id=${encodeURIComponent(id)}`)
  const drill = (ids: string[]) => {
    if (!ids.length) return
    startList('drill', ids)
    navigate('/session')
  }
  const drillTop = () => {
    const due = new Set(plan().dueIds)
    drill(trouble.filter((x) => !due.has(x.id)).slice(0, 20).map((x) => x.id))
  }
  const maxScore = trouble[0]?.score ?? 1

  return (
    <div className="anim-rise flex flex-col gap-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">Mistakes</h1>
          <p className="mt-2 max-w-xl text-ink-2">
            Every miss adds weight to a word; the weight fades over two weeks and shrinks each time you get it right. Heavy words come first in drills and as
            distractors.
          </p>
        </div>
        <Button variant="primary" icon={<Flame size={18} />} onClick={drillTop} disabled={!trouble.length}>
          Drill top {Math.min(20, trouble.length) || ''}
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="small-caps mb-3 text-ink-3">trouble words</h2>
          {trouble.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {trouble.slice(0, 30).map(({ id, score, p }) => {
                const e = getEntry(id)
                return (
                  <li key={id}>
                    <button type="button" onClick={() => open(id)} className="flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-surface-2 sm:px-5">
                      <span className="flex items-baseline gap-3">
                        <span className="font-display text-lg font-semibold">{e.word}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{e.def}</span>
                        <span className="tabular shrink-0 text-xs text-ink-3">{plural(p.wrong, 'miss', 'misses')}</span>
                      </span>
                      <span className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
                        <span className="block h-full rounded-full bg-bad/70" style={{ width: `${Math.max(6, (score / maxScore) * 100)}%` }} />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Empty>No trouble words yet. Misses show up here as you study.</Empty>
          )}
        </section>

        <div className="flex flex-col gap-8">
          <section>
            <h2 className="small-caps mb-3 text-ink-3">confused pairs</h2>
            {pairs.length ? (
              <ul className="grid gap-2.5">
                {pairs.map(({ a, b, count }) => {
                  const ea = getEntry(a)
                  const eb = getEntry(b)
                  return (
                    <li key={`${a}|${b}`} className="rounded-2xl border border-line bg-surface p-4">
                      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                        <PairSide word={ea.word} def={ea.def} onClick={() => open(a)} />
                        <span className="pt-1 text-xs text-ink-3">vs</span>
                        <PairSide word={eb.word} def={eb.def} onClick={() => open(b)} />
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-bad">mixed up {count}x</span>
                        <Button size="sm" variant="ghost" icon={<Swords size={15} />} onClick={() => drill([a, b])}>
                          Drill the pair
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Empty>When you pick one word for another, the pair lands here.</Empty>
            )}
          </section>

          <section>
            <h2 className="small-caps mb-3 text-ink-3">missed in the last 7 days</h2>
            {recent && recent.length ? (
              <ul className="flex flex-wrap gap-2">
                {recent.map(([id, m]) => (
                  <li key={id}>
                    <button type="button" onClick={() => open(id)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm hover:border-line-strong">
                      <span className="font-display font-semibold">{getEntry(id).word}</span>
                      {getEntry(id).senses > 1 && <sup className="ml-0.5 text-[0.65em] text-ink-3">{getEntry(id).sense}</sup>}
                      {m.n > 1 && <span className="ml-1.5 text-xs text-bad">{m.n}x</span>}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No misses this week.</Empty>
            )}
            {recent && recent.length > 0 && (
              <Button size="sm" className="mt-4" onClick={() => drill(recent.slice(0, 25).map(([id]) => id))}>
                Drill this week's misses
              </Button>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function PairSide({ word, def, onClick }: { word: string; def: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <span className="block font-display text-lg font-semibold">{word}</span>
      <span className="block text-sm text-ink-2">{def}</span>
    </button>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center text-sm text-ink-3">{children}</p>
}
