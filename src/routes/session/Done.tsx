import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import type { Session } from '../../core/engine'
import { forecast } from '../../core/stats'
import { getEntry } from '../../data/words'
import { now } from '../../lib/clock'
import { useHotkeys } from '../../lib/hotkeys'
import { useStore } from '../../state/store'
import { syncNow } from '../../sync/sync'
import { Button } from '../../ui/Button'
import { Card, TaskLabel } from './parts'

const TITLE: Record<Session['type'], string> = {
  daily: 'Done for today',
  drill: 'Drill finished',
  test: 'Test finished',
  baseline: 'Baseline finished',
}

export function Done({ session }: { session: Session }) {
  const navigate = useNavigate()
  const endSession = useStore((s) => s.endSession)
  const progress = useStore((s) => s.progress)
  const tomorrow = forecast(progress, now(), 2)[1]
  const finish = () => {
    endSession()
    navigate('/')
  }
  useHotkeys({ Enter: finish, Escape: finish })
  useEffect(() => {
    void syncNow()
  }, [])

  const accuracy = session.answered ? Math.round((session.correct / session.answered) * 100) : 0
  const reviews = session.pool.filter((x) => x.phase === 'review').length
  const learned = session.graduated.length
  const misses = session.type === 'test' || session.type === 'baseline' ? session.pool.filter((x) => x.misses > 0).map((x) => getEntry(x.id)) : []
  const known = session.type === 'baseline' ? session.pool.length - misses.length : 0

  return (
    <Card>
      <TaskLabel tone="accent">{session.type === 'daily' ? 'session complete' : session.type}</TaskLabel>
      <h2 className="font-display text-[clamp(2.2rem,6vw,3.2rem)] font-semibold leading-tight">{TITLE[session.type]}</h2>
      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
        <Stat label="answers" value={session.answered} />
        <Stat label="accuracy" value={`${accuracy}%`} />
        {session.type === 'daily' && <Stat label="new words" value={learned} />}
        {session.type === 'daily' && <Stat label="reviews" value={reviews} />}
        {session.type === 'test' && <Stat label="score" value={`${session.pool.length - misses.length}/${session.pool.length}`} />}
        {session.type === 'baseline' && <Stat label="already known" value={`${known}/${session.pool.length}`} />}
      </dl>
      {session.type === 'daily' && <p className="mt-8 text-ink-2">Tomorrow: {tomorrow} reviews waiting. Come back after 04:00.</p>}
      {misses.length > 0 && (
        <div className="mt-8">
          <p className="small-caps text-ink-3">missed</p>
          <ul className="mt-2 divide-y divide-line">
            {misses.map((e) => (
              <li key={e.id} className="flex items-baseline gap-4 py-2.5">
                <span className="w-36 shrink-0 font-display text-lg font-semibold">{e.word}</span>
                <span className="text-ink-2">{e.def}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Button variant="primary" size="lg" keys={['Enter']} onClick={finish} className="mt-9">
        Back to today
      </Button>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="small-caps text-ink-3">{label}</dt>
      <dd className="tabular font-display text-4xl font-semibold text-ink">{value}</dd>
    </div>
  )
}
