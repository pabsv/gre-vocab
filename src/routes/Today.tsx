import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Flame, GraduationCap, ListChecks, Target } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { activityByDay, bucketCounts, recallEstimate, streak, troubleList } from '../core/stats'
import { addDays, daysBetween, parseDay, studyDay } from '../core/time'
import { ENTRIES } from '../data/words'
import { db } from '../db/db'
import { useHotkeys } from '../lib/hotkeys'
import { useNow } from '../lib/useNow'
import { schedulerFor, useStore } from '../state/store'
import { Button } from '../ui/Button'
import { Heatmap, MasteryBar } from '../ui/charts'
import { plural } from '../ui/format'

export function Today() {
  const navigate = useNavigate()
  const progress = useStore((s) => s.progress)
  const settings = useStore((s) => s.settings)
  const meta = useStore((s) => s.meta)
  const session = useStore((s) => s.session)
  const buildPlan = useStore((s) => s.plan)
  const startDaily = useStore((s) => s.startDaily)
  const startList = useStore((s) => s.startList)
  const t = useNow()
  const today = studyDay(t)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => buildPlan(), [buildPlan, progress, settings, meta, today])
  const events = useLiveQuery(() => db.events.where('day').aboveOrEqual(addDays(today, -7 * 17)).toArray(), [today])
  const activity = useMemo(() => activityByDay(events ?? []), [events])
  const counts = useMemo(() => bucketCounts(progress), [progress])
  const recall = useMemo(() => recallEstimate(progress, schedulerFor(settings.retention), t), [progress, settings.retention, t])
  const trouble = useMemo(() => troubleList(progress, t), [progress, t])

  const resumable = !!session && session.day === today && session.phase !== 'done'
  const work = plan.dueIds.length + plan.newIds.length + plan.carryIds.length
  const todayAct = activity.get(today)
  const streakDays = streak(activity, today)
  const introduced = ENTRIES.length - counts.new
  const firstRun = introduced === 0 && !resumable

  const start = () => {
    if (!resumable) startDaily()
    navigate('/session')
  }
  const more = () => {
    startDaily(10)
    navigate('/session')
  }
  const drill = () => {
    const due = new Set(plan.dueIds)
    const ids = trouble.filter((x) => !due.has(x.id)).slice(0, 20).map((x) => x.id)
    if (!ids.length) return
    startList('drill', ids)
    navigate('/session')
  }
  const quickTest = () => {
    const pool = [...progress.values()].filter((p) => p.card).map((p) => p.entryId)
    const picked = pool.sort(() => Math.random() - 0.5).slice(0, 30)
    if (!picked.length) return
    startList('test', picked)
    navigate('/session')
  }
  const baseline = () => {
    const fresh = ENTRIES.filter((e) => !progress.get(e.id)?.firstDay).map((e) => e.id)
    startList('baseline', fresh.sort(() => Math.random() - 0.5).slice(0, 40))
    navigate('/session')
  }

  useHotkeys({ Enter: () => (resumable || work > 0 ? start() : undefined) })

  const dateLine = parseDay(today).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const newTotal = plan.newIds.length + plan.carryIds.length

  let headline: string
  let sub: string
  if (resumable) {
    headline = 'Pick up where you left off'
    sub = 'Your session is saved after every answer.'
  } else if (firstRun) {
    headline = `Your first ${plan.newIds.length} words`
    sub = `About ${plan.estMinutes} minutes. Each word goes flashcard, multiple choice, then you type it; a final sweep asks you to explain each one.`
  } else if (work > 0) {
    const parts = []
    if (plan.dueIds.length) parts.push(plural(plan.dueIds.length, 'review'))
    if (newTotal) parts.push(plural(newTotal, 'new word'))
    headline = parts.join(' and ')
    sub = `About ${plan.estMinutes} minutes.${newTotal ? ' New words end with a quick sweep.' : ''}`
  } else {
    headline = 'All caught up'
    sub = todayAct
      ? `${plural(todayAct.answers, 'answer')} today, ${Math.round((todayAct.correct / Math.max(1, todayAct.answers)) * 100)}% right. The next reviews appear tomorrow.`
      : 'Nothing is due right now.'
  }

  const exam = settings.examDate ? daysBetween(today, settings.examDate) : null
  const daysToIntroduce = Math.ceil(counts.new / Math.max(1, settings.newPerDay))
  const introducedBy = addDays(today, daysToIntroduce)

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
      <section className="anim-rise flex flex-col gap-8">
        <div>
          <p className="small-caps text-ink-3">{dateLine}</p>
          <h1 className="mt-2 font-display text-[clamp(2.4rem,6.5vw,3.9rem)] font-semibold leading-[1.02] tracking-tight">{headline}</h1>
          <p className="mt-4 max-w-xl text-lg text-ink-2">{sub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {resumable || work > 0 ? (
            <Button variant="primary" size="lg" keys={['Enter']} icon={<ArrowRight size={19} />} onClick={start}>
              {resumable ? 'Resume' : 'Start'}
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={more}>
              Learn 10 more
            </Button>
          )}
          {!resumable && work === 0 && introduced > 0 && (
            <Button variant="secondary" size="lg" icon={<ListChecks size={18} />} onClick={quickTest}>
              Quick test
            </Button>
          )}
        </div>

        {(plan.dueIds.length > 0 || newTotal > 0) && !resumable && (
          <dl className="grid max-w-md grid-cols-3 gap-4 border-t border-line pt-6">
            <Figure label="reviews" value={plan.dueIds.length} />
            <Figure label="new" value={newTotal} />
            <Figure label="minutes" value={plan.estMinutes} />
          </dl>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Action
            icon={<Flame size={18} />}
            title="Drill mistakes"
            detail={trouble.length ? `${plural(trouble.length, 'trouble word')}; practice the top 20` : 'No trouble words yet'}
            onClick={drill}
            disabled={!trouble.length}
          />
          {counts.new > 200 ? (
            <Action
              icon={<GraduationCap size={18} />}
              title="Baseline test"
              detail="40 random unseen words. The ones you already know skip the queue."
              onClick={baseline}
            />
          ) : (
            <Action icon={<ListChecks size={18} />} title="Quick test" detail="30 random words you have learned, one try each" onClick={quickTest} disabled={!introduced} />
          )}
        </div>
      </section>

      <section className="anim-rise flex flex-col gap-6 [animation-delay:80ms]">
        <div className="rounded-[22px] border border-line bg-surface p-6 shadow-card sm:p-7">
          <p className="small-caps text-ink-3">words you would recall today</p>
          <p className="mt-1 flex items-baseline gap-3">
            <span className="tabular font-display text-6xl font-semibold leading-none">{Math.round(recall)}</span>
            <span className="text-ink-3">of {ENTRIES.length.toLocaleString()}</span>
          </p>
          <div className="mt-6">
            <MasteryBar counts={counts} />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink-3">
            Mastered means you would still recall it three weeks from now. The number above adds up your chance of recalling each learned word right now.
          </p>
        </div>

        <div className="rounded-[22px] border border-line bg-surface p-6 shadow-card sm:p-7">
          <div className="mb-4 flex items-baseline justify-between">
            <p className="small-caps text-ink-3">streak</p>
            <p className="font-display text-2xl font-semibold">{plural(streakDays, 'day')}</p>
          </div>
          <div className="overflow-x-auto">
            <Heatmap activity={activity} today={today} />
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-[22px] border border-line bg-surface p-6 shadow-card">
          <Target size={18} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-[0.95rem] leading-relaxed text-ink-2">
            {counts.new === 0
              ? 'Every word is introduced. From here it is reviews only.'
              : `At ${settings.newPerDay} a day, every word is introduced by ${parseDay(introducedBy).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}.`}
            {exam !== null && exam >= 0 && ` GRE in ${plural(exam, 'day')}${daysToIntroduce > exam ? '; raise the daily pace in Settings to finish in time.' : '.'}`}
          </p>
        </div>
      </section>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="small-caps text-ink-3">{label}</dt>
      <dd className="tabular font-display text-3xl font-semibold">{value}</dd>
    </div>
  )
}

function Action({ icon, title, detail, onClick, disabled }: { icon: React.ReactNode; title: string; detail: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-4 text-left transition-colors hover:border-line-strong hover:bg-surface-2 disabled:opacity-50"
    >
      <span className="mt-0.5 text-accent">{icon}</span>
      <span>
        <span className="block font-medium text-ink">{title}</span>
        <span className="block text-sm text-ink-3">{detail}</span>
      </span>
    </button>
  )
}
