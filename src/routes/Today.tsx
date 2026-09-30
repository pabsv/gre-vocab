import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Flame, GraduationCap, ListChecks, Minus, Plus, Target } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { activityByDay, bucketCounts, recallEstimate, streak, troubleList } from '../core/stats'
import { addDays, daysBetween, parseDay, studyDay } from '../core/time'
import { ENTRIES } from '../data/words'
import { db } from '../db/db'
import { useHotkeys } from '../lib/hotkeys'
import { useNow } from '../lib/useNow'
import { SEC_PER_NEW, SEC_PER_REVIEW } from '../core/plan'
import { schedulerFor, useStore } from '../state/store'
import { Button } from '../ui/Button'
import { Heatmap, MasteryBar } from '../ui/charts'
import { plural } from '../ui/format'
import { Panel } from '../ui/Panel'

export function Today() {
  const navigate = useNavigate()
  const progress = useStore((s) => s.progress)
  const settings = useStore((s) => s.settings)
  const meta = useStore((s) => s.meta)
  const session = useStore((s) => s.session)
  const buildPlan = useStore((s) => s.plan)
  const startDaily = useStore((s) => s.startDaily)
  const startList = useStore((s) => s.startList)
  const updateSettings = useStore((s) => s.updateSettings)
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
  const fresh = counts.new - plan.carryIds.length
  // The stepper remembers its last total (synced with Settings), else the daily target; it moves in round steps of 5.
  const dial = settings.lastNew ?? settings.newPerDay
  const newCount = Math.max(0, Math.min(dial - plan.carryIds.length, fresh))
  const step = (d: number) => {
    const total = newCount + plan.carryIds.length
    const next = d > 0 ? Math.floor(total / 5) * 5 + 5 : Math.ceil(total / 5) * 5 - 5
    void updateSettings({ lastNew: Math.max(0, Math.min(fresh + plan.carryIds.length, next)) })
  }
  const work = plan.dueIds.length + plan.sweep.length + newCount + plan.carryIds.length
  const estMinutes = Math.round(((plan.dueIds.length + plan.sweep.length) * SEC_PER_REVIEW + (plan.carryIds.length + newCount) * SEC_PER_NEW) / 60)
  const todayAct = activity.get(today)
  const streakDays = streak(activity, today)
  const introduced = ENTRIES.length - counts.new
  const firstRun = introduced === 0 && !resumable

  const start = () => {
    if (!resumable) startDaily(newCount)
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

  const canPick = !resumable && fresh > 0
  useHotkeys({
    Enter: () => (resumable || work > 0 ? start() : undefined),
    ArrowLeft: () => canPick && step(-5),
    ArrowRight: () => canPick && step(5),
    Minus: () => canPick && step(-5),
    Equal: () => canPick && step(5),
  })

  const dateLine = parseDay(today).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const newTotal = newCount + plan.carryIds.length

  let headline: string
  let sub: string | null = null
  if (resumable) {
    headline = 'Pick up where you left off'
  } else if (firstRun) {
    headline = `Your first ${plural(newCount, 'word')}`
  } else if (work > 0) {
    const parts = []
    if (plan.dueIds.length) parts.push(plural(plan.dueIds.length, 'review'))
    if (newTotal) parts.push(plural(newTotal, 'new word'))
    if (plan.sweep.length) parts.push(`${plural(plan.sweep.length, 'word')} to wrap up`)
    headline = parts.length > 2 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts.join(' and ')
  } else {
    headline = 'All caught up'
    if (todayAct) sub = `${plural(todayAct.answers, 'answer')} today, ${Math.round((todayAct.correct / Math.max(1, todayAct.answers)) * 100)}% right.`
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
          {sub && <p className="mt-4 max-w-xl text-lg text-ink-2">{sub}</p>}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            variant="primary"
            size="lg"
            keys={['Enter']}
            icon={<ArrowRight size={19} />}
            onClick={start}
            disabled={!resumable && work === 0}
            className="w-full sm:w-auto"
          >
            {resumable ? 'Resume' : 'Start'}
          </Button>
          {!resumable && work === 0 && introduced > 0 && (
            <Button variant="secondary" size="lg" icon={<ListChecks size={18} />} onClick={quickTest} className="w-full sm:w-auto">
              Quick test
            </Button>
          )}
        </div>

        {!resumable && (plan.dueIds.length > 0 || plan.sweep.length > 0 || plan.carryIds.length > 0 || fresh > 0) && (
          <dl className="grid max-w-md grid-cols-3 gap-4 border-t border-line pt-6">
            <Figure label="reviews" value={plan.dueIds.length} />
            <div>
              <dt className="small-caps text-ink-3">new</dt>
              <dd className="flex items-center gap-1">
                <StepButton label="Fewer new words (←)" onClick={() => step(-5)} disabled={newCount === 0}>
                  <Minus size={16} />
                </StepButton>
                <span className="tabular min-w-[2ch] text-center font-display text-3xl font-semibold">{newTotal}</span>
                <StepButton label="More new words (→)" onClick={() => step(5)} disabled={newCount >= fresh}>
                  <Plus size={16} />
                </StepButton>
              </dd>
            </div>
            <Figure label="minutes" value={estMinutes} />
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

      <section className="anim-rise flex flex-col gap-4 [animation-delay:80ms]">
        <Panel title="words you would recall today">
          <p className="flex items-baseline gap-3">
            <span className="tabular font-display text-6xl font-semibold leading-none">{Math.round(recall)}</span>
            <span className="text-ink-3">of {ENTRIES.length.toLocaleString()}</span>
          </p>
          <div className="mt-6">
            <MasteryBar counts={counts} />
          </div>
        </Panel>

        <Panel title="streak" aside={<p className="font-display text-2xl font-semibold">{plural(streakDays, 'day')}</p>}>
          <Heatmap activity={activity} today={today} />
        </Panel>

        <Panel className="flex items-start gap-3">
          <Target size={18} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-[0.95rem] leading-relaxed text-ink-2">
            {counts.new === 0
              ? 'Every word is started. From here it is reviews only.'
              : `At ${settings.newPerDay} a day, the last word starts on ${parseDay(introducedBy).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}.`}
            {exam !== null && exam >= 0 && ` GRE in ${plural(exam, 'day')}${daysToIntroduce > exam ? '; raise the daily pace in Settings to finish in time.' : '.'}`}
          </p>
        </Panel>
      </section>
    </div>
  )
}

function StepButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-lg border border-line p-1 text-ink-2 transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
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
