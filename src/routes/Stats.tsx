import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { activityByDay, bestStreak, bucketCounts, forecast, recallEstimate, reviewRecallRate, startedByDay, streak } from '../core/stats'
import { addDays, daysBetween, parseDay, studyDay } from '../core/time'
import { ENTRIES, TIER_LABEL, type Tier } from '../data/words'
import { db } from '../db/db'
import { useNow } from '../lib/useNow'
import { schedulerFor, useStore } from '../state/store'
import { Columns, Growth, Heatmap, MasteryBar } from '../ui/charts'
import { plural } from '../ui/format'
import { PageTitle, Panel } from '../ui/Panel'

const short = (day: string) => parseDay(day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const pct = (ok: number, n: number) => (n ? `${Math.round((ok / n) * 100)}%` : 'none')

const TASKS = [
  ['Explain the meaning', 'explain'],
  ['Sentence blank', 'blank'],
  ['Multiple choice', 'mcq'],
] as const

export function StatsRoute() {
  const progress = useStore((s) => s.progress)
  const settings = useStore((s) => s.settings)
  const t = useNow()
  const today = studyDay(t)
  const events = useLiveQuery(() => db.events.toArray(), [])
  const activity = useMemo(() => activityByDay(events ?? []), [events])
  const counts = useMemo(() => bucketCounts(progress), [progress])
  const recall = useMemo(() => recallEstimate(progress, schedulerFor(settings.retention), t), [progress, settings.retention, t])

  const last30 = Array.from({ length: 30 }, (_, k) => addDays(today, k - 29))
  const recent = last30.map((d) => activity.get(d))
  const answers30 = recent.reduce((n, a) => n + (a?.answers ?? 0), 0)
  const correct30 = recent.reduce((n, a) => n + (a?.correct ?? 0), 0)
  const week = recent.slice(-7)
  const minutes7 = Math.round(week.reduce((n, a) => n + (a?.ms ?? 0), 0) / 60_000)
  const days7 = week.filter((a) => (a?.answers ?? 0) > 0).length
  const reviewRetention = reviewRecallRate(events ?? [], addDays(today, -29))

  const last60 = Array.from({ length: 60 }, (_, k) => addDays(today, k - 59))
  const started = startedByDay(activity, last60)

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

  const introduced = ENTRIES.length - counts.new
  const doneBy = addDays(today, Math.ceil(counts.new / Math.max(1, settings.newPerDay)))
  const exam = settings.examDate ? daysBetween(today, settings.examDate) : null
  const target = Math.round(settings.retention * 100)
  const streakDays = streak(activity, today)

  return (
    <div className="anim-rise flex flex-col gap-6 sm:gap-8">
      <PageTitle>Stats</PageTitle>

      <Panel title="progress">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <p className="flex items-baseline gap-2.5">
            <span className="tabular font-display text-6xl font-semibold leading-none">{introduced}</span>
            <span className="text-ink-3">of {ENTRIES.length.toLocaleString()} words started</span>
          </p>
          <p className="text-sm text-ink-2">
            You would recall about <span className="tabular font-medium text-ink">{Math.round(recall)}</span> today
          </p>
        </div>
        <div className="mt-5">
          <MasteryBar counts={counts} />
        </div>
        <p className="mt-5 border-t border-line pt-4 text-sm text-ink-2">
          {counts.new === 0
            ? 'Every word is started. From here it is reviews only.'
            : `At ${settings.newPerDay} a day, the last word starts on ${parseDay(doneBy).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}.`}
          {exam !== null && exam >= 0 && ` GRE in ${plural(exam, 'day')}.`}
        </p>
      </Panel>

      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Tile label="streak" value={streakDays} unit={streakDays === 1 ? 'day' : 'days'} note={`best ${plural(bestStreak(activity), 'day')}`} />
        <Tile label="this week" value={minutes7} unit="min" note={`${days7} of 7 days studied`} />
        <Tile label="accuracy" value={pct(correct30, answers30)} note={`${answers30.toLocaleString()} answers, 30 days`} />
        <Tile
          label="reviews recalled"
          value={reviewRetention === null ? 'none' : `${reviewRetention}%`}
          note={`target ${target}%`}
          tone={reviewRetention === null ? undefined : reviewRetention >= target - 5 ? 'good' : 'warn'}
        />
      </dl>

      <Panel title="study calendar">
        <Heatmap activity={activity} today={today} weeks={26} />
      </Panel>

      <div className="grid gap-6 sm:gap-8 lg:grid-cols-2">
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
        <Panel title="words started, 60 days">
          <Growth values={started} labels={last60.map(short)} goal={ENTRIES.length} />
        </Panel>
        <Panel title="accuracy by task">
          <ul className="flex flex-col gap-4">
            {TASKS.map(([label, key]) => {
              const [ok, n] = byMode[key]
              return (
                <li key={key}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[0.95rem]">
                    <span className="text-ink">{label}</span>
                    <span className="tabular text-sm text-ink-3">
                      {n ? (
                        <>
                          <span className="font-medium text-ink">{pct(ok, n)}</span> of {n}
                        </>
                      ) : (
                        'no answers yet'
                      )}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: n ? `${(ok / n) * 100}%` : 0 }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>
      </div>

      <Panel title="mastery by Magoosh section">
        <div className="grid gap-5 lg:grid-cols-3">
          {(['common', 'basic', 'advanced'] as Tier[]).map((tier) => {
            const c = bucketCounts(progress, tier)
            const total = c.new + c.learning + c.familiar + c.mastered
            return (
              <div key={tier}>
                <p className="mb-2 flex items-baseline justify-between text-sm">
                  <span className="text-ink">{TIER_LABEL[tier]}</span>
                  <span className="tabular text-ink-3">
                    {total - c.new} of {total} started
                  </span>
                </p>
                <MasteryBar counts={c} height={10} legend={false} />
              </div>
            )
          })}
        </div>
      </Panel>
    </div>
  )
}

function Tile({ label, value, unit, note, tone }: { label: string; value: string | number; unit?: string; note?: string; tone?: 'good' | 'warn' }) {
  const color = tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : ''
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-4 sm:px-5">
      <dt className="small-caps text-ink-3">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1.5">
        <span className={`tabular font-display text-[2.1rem] font-semibold leading-tight ${color}`}>{value}</span>
        {unit && <span className="text-sm text-ink-3">{unit}</span>}
      </dd>
      {note && <dd className="mt-0.5 text-xs text-ink-3">{note}</dd>}
    </div>
  )
}
