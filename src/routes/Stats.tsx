import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { activityByDay, bucketCounts, forecast, reviewRecallRate, streak } from '../core/stats'
import { addDays, parseDay, studyDay } from '../core/time'
import { TIER_LABEL, type Tier } from '../data/words'
import { db } from '../db/db'
import { useNow } from '../lib/useNow'
import { useStore } from '../state/store'
import { Columns, Heatmap, MasteryBar } from '../ui/charts'
import { plural } from '../ui/format'

const short = (day: string) => parseDay(day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export function StatsRoute() {
  const progress = useStore((s) => s.progress)
  const t = useNow()
  const today = studyDay(t)
  const events = useLiveQuery(() => db.events.toArray(), [])
  const activity = useMemo(() => activityByDay(events ?? []), [events])

  const last30 = Array.from({ length: 30 }, (_, k) => addDays(today, k - 29))
  const recent = last30.map((d) => activity.get(d))
  const answers30 = recent.reduce((n, a) => n + (a?.answers ?? 0), 0)
  const correct30 = recent.reduce((n, a) => n + (a?.correct ?? 0), 0)
  const minutes30 = Math.round(recent.reduce((n, a) => n + (a?.ms ?? 0), 0) / 60_000)

  const since = addDays(today, -29)
  const reviewRetention = reviewRecallRate(events ?? [], since)

  const byMode = useMemo(() => {
    const acc = { explain: [0, 0], type: [0, 0], blank: [0, 0], mcq: [0, 0] } as Record<string, [number, number]>
    for (const p of progress.values()) for (const [k, [ok, n]] of Object.entries(p.dir)) {
      acc[k][0] += ok
      acc[k][1] += n
    }
    return acc
  }, [progress])

  const due = forecast(progress, t, 14)
  const dueLabels = due.map((_, k) => (k === 0 ? 'Today' : short(addDays(today, k))))

  return (
    <div className="anim-rise flex flex-col gap-10">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Stats</h1>

      <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Big label="streak" value={`${streak(activity, today)}`} unit="days" />
        <Big label="answers, 30 days" value={answers30.toLocaleString()} />
        <Big label="accuracy, 30 days" value={answers30 ? `${Math.round((correct30 / answers30) * 100)}%` : 'none'} />
        <Big label="reviews recalled" value={reviewRetention === null ? 'none' : `${reviewRetention}%`} unit={reviewRetention === null ? '' : 'target 90%'} />
      </dl>

      <Panel title="study calendar">
        <div className="overflow-x-auto">
          <Heatmap activity={activity} today={today} weeks={26} />
        </div>
        <p className="mt-3 text-sm text-ink-3">{plural(minutes30, 'minute')} of answering in the last 30 days.</p>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="last 30 days">
          <Columns
            data={recent.map((a) => [a?.reviews ?? 0, a?.newWords ?? 0])}
            labels={last30.map(short)}
            series={[
              { name: 'Reviews', color: 'var(--series-1)' },
              { name: 'New words', color: 'var(--series-2)' },
            ]}
          />
        </Panel>
        <Panel title="reviews coming up">
          <Columns data={due.map((n) => [n])} labels={dueLabels} series={[{ name: 'Due', color: 'var(--series-1)' }]} highlightFirst />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="mastery by Magoosh section">
          <div className="flex flex-col gap-5">
            {(['common', 'basic', 'advanced'] as Tier[]).map((tier) => (
              <div key={tier}>
                <p className="mb-2 text-sm text-ink-2">{TIER_LABEL[tier]}</p>
                <MasteryBar counts={bucketCounts(progress, tier)} height={10} legend={tier === 'advanced'} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="accuracy by task">
          <table className="w-full text-left text-[0.95rem]">
            <thead>
              <tr className="text-xs text-ink-3">
                <th className="small-caps pb-2 font-normal">task</th>
                <th className="small-caps pb-2 text-right font-normal">answers</th>
                <th className="small-caps pb-2 text-right font-normal">right</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[
                ['Explain the meaning', byMode.explain],
                ['Type the word', byMode.type],
                ['Sentence blank', byMode.blank],
                ['Multiple choice', byMode.mcq],
              ].map(([label, [ok, n]]) => (
                <tr key={label as string}>
                  <td className="py-2.5 text-ink">{label as string}</td>
                  <td className="tabular py-2.5 text-right text-ink-2">{n as number}</td>
                  <td className="tabular py-2.5 text-right text-ink">{(n as number) ? `${Math.round(((ok as number) / (n as number)) * 100)}%` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  )
}

function Big({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <dt className="small-caps text-ink-3">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span className="tabular font-display text-4xl font-semibold">{value}</span>
        {unit && <span className="text-sm text-ink-3">{unit}</span>}
      </dd>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] border border-line bg-surface p-6 shadow-card">
      <h2 className="small-caps mb-5 text-ink-3">{title}</h2>
      {children}
    </section>
  )
}
