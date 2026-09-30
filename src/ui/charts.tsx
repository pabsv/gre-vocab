import { useEffect, useRef, useState } from 'react'
import type { BucketCounts } from '../core/stats'
import { addDays, parseDay } from '../core/time'

const BUCKETS: { key: keyof BucketCounts; label: string; color: string }[] = [
  { key: 'mastered', label: 'Mastered', color: 'var(--b-mastered)' },
  { key: 'familiar', label: 'Familiar', color: 'var(--b-familiar)' },
  { key: 'learning', label: 'Learning', color: 'var(--b-learning)' },
  { key: 'new', label: 'New', color: 'var(--b-new)' },
]

/** Stacked bar over the whole deck: mastered first, the untouched rest is the track. */
export function MasteryBar({ counts, height = 14, legend = true }: { counts: BucketCounts; height?: number; legend?: boolean }) {
  const total = counts.new + counts.learning + counts.familiar + counts.mastered
  return (
    <div className="flex flex-col gap-3">
      <div className="flex w-full gap-[2px] overflow-hidden rounded-[4px]" style={{ height }} role="img" aria-label={BUCKETS.map((b) => `${b.label} ${counts[b.key]}`).join(', ')}>
        {BUCKETS.map((b) =>
          counts[b.key] > 0 ? (
            <div
              key={b.key}
              title={`${b.label}: ${counts[b.key]} of ${total}`}
              className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
              style={{ width: `${(counts[b.key] / total) * 100}%`, background: b.color, minWidth: 3 }}
            />
          ) : null,
        )}
      </div>
      {legend && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-2">
          {BUCKETS.map((b) => (
            <li key={b.key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: b.color, outline: b.key === 'new' ? '1px solid var(--line-strong)' : undefined }} />
              {b.label}
              <span className="tabular text-ink">{counts[b.key]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const HEAT = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)', 'var(--heat-5)']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function heatLevel(n: number): number {
  if (n <= 0) return 0
  if (n < 40) return 1
  if (n < 100) return 2
  if (n < 180) return 3
  if (n < 280) return 4
  return 5
}

/** Study calendar: one cell per day, weeks as columns, ending today. */
export function Heatmap({
  activity,
  today,
  weeks = 16,
}: {
  activity: ReadonlyMap<string, { answers: number; correct: number }>
  today: string
  weeks?: number
}) {
  const [hover, setHover] = useState<string | null>(null)
  const [ref, width] = useWidth<HTMLDivElement>()
  // Show as many whole weeks as fit, so the latest week is always in view without scrolling.
  const shown = width ? Math.max(4, Math.min(weeks, Math.floor((width + 3) / 16))) : weeks
  const todayDate = parseDay(today)
  const mondayOffset = (todayDate.getDay() + 6) % 7
  const start = addDays(today, -(shown - 1) * 7 - mondayOffset)
  const cols: string[][] = []
  for (let w = 0; w < shown; w++) cols.push(Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)))
  const hovered = hover ? activity.get(hover) : undefined
  return (
    <div ref={ref} className="flex flex-col gap-2">
      <div className="flex gap-[3px]" onMouseLeave={() => setHover(null)}>
        {cols.map((days, w) => (
          <div key={w} className="flex flex-col gap-[3px]">
            <span className="h-4 w-[13px] whitespace-nowrap text-[10px] leading-4 text-ink-3">{parseDay(days[0]).getDate() <= 7 ? MONTHS[parseDay(days[0]).getMonth()] : ''}</span>
            {days.map((d) => {
              const a = activity.get(d)
              const future = d > today
              return (
                <button
                  type="button"
                  key={d}
                  aria-label={`${d}: ${a?.answers ?? 0} answers`}
                  onMouseEnter={() => setHover(d)}
                  onFocus={() => setHover(d)}
                  onClick={() => setHover(d)}
                  className={`h-[13px] w-[13px] rounded-[3px] ${d === today ? 'ring-1 ring-ink-3 ring-offset-1 ring-offset-surface' : ''}`}
                  style={{ background: future ? 'transparent' : HEAT[heatLevel(a?.answers ?? 0)] }}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="flex min-h-5 items-center justify-between gap-3 text-xs text-ink-3">
        <span className="tabular">
          {hover
            ? `${parseDay(hover).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}: ${hovered?.answers ?? 0} answers${hovered?.answers ? `, ${Math.round((hovered.correct / hovered.answers) * 100)}% right` : ''}`
            : 'Answers per day'}
        </span>
        <span className="flex items-center gap-1">
          less
          {HEAT.map((c) => (
            <span key={c} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} />
          ))}
          more
        </span>
      </div>
    </div>
  )
}

/** Simple column chart; one series, or two stacked with a legend. Drag across it on touch to read values. */
export function Columns({
  data,
  labels,
  series,
  height = 120,
  highlightFirst = false,
}: {
  data: number[][]
  labels: string[]
  series: { name: string; color: string }[]
  height?: number
  highlightFirst?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const totals = data.map((d) => d.reduce((a, b) => a + b, 0))
  const max = Math.max(1, ...totals)
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHover(Math.max(0, Math.min(data.length - 1, Math.floor(((e.clientX - r.left) / r.width) * data.length))))
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-5 items-center justify-between gap-3 text-xs text-ink-2">
        {hover !== null ? (
          <span className="tabular">
            <span className="text-ink">{labels[hover]}</span>
            {': '}
            {data[hover].map((v, i) => `${v} ${series[i].name.toLowerCase()}`).join(', ')}
          </span>
        ) : series.length > 1 ? (
          <ul className="flex gap-4">
            {series.map((s) => (
              <li key={s.name} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
                {s.name}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-ink-3">{series[0].name}</span>
        )}
        <span className="tabular text-ink-3">max {max}</span>
      </div>
      <div
        className="relative flex touch-pan-y items-end gap-[2px] border-b border-line"
        style={{ height }}
        onPointerDown={pick}
        onPointerMove={pick}
        onPointerLeave={() => setHover(null)}
      >
        {data.map((d, k) => (
          <div key={k} className="relative flex h-full flex-1 flex-col justify-end">
            <div className="flex flex-col-reverse gap-[2px]" style={{ height: `${(totals[k] / max) * 100}%` }}>
              {d.map((v, i) =>
                v > 0 ? (
                  <div
                    key={i}
                    className="w-full last:rounded-t-[3px]"
                    style={{
                      flexGrow: v,
                      minHeight: 2,
                      background: series[i].color,
                      opacity: hover === null ? (highlightFirst && k !== 0 ? 0.8 : 1) : hover === k ? 1 : 0.4,
                    }}
                  />
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-ink-3">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  )
}

/** Running total as a filled line; `goal` is only printed, the scale fits the data. */
export function Growth({ values, labels, goal, height = 120 }: { values: number[]; labels: string[]; goal?: number; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const top = Math.max(1, ...values)
  const n = values.length
  const x = (k: number) => (n > 1 ? (k / (n - 1)) * 100 : 50)
  const y = (v: number) => 100 - (v / top) * 100
  const line = values.map((v, k) => `${k ? 'L' : 'M'}${x(k)} ${y(v)}`).join('')
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))))
  }
  const k = hover ?? n - 1
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-5 items-center justify-between gap-3 text-xs text-ink-2">
        <span className="tabular">
          <span className="text-ink">{hover === null ? 'Now' : labels[k]}</span>
          {`: ${values[k] ?? 0} words started`}
        </span>
        {goal !== undefined && <span className="tabular text-ink-3">of {goal.toLocaleString()}</span>}
      </div>
      <div className="relative touch-pan-y border-b border-line" style={{ height }} onPointerDown={pick} onPointerMove={pick} onPointerLeave={() => setHover(null)}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <path d={`${line}L100 100L0 100Z`} fill="var(--series-1)" opacity={0.14} />
          <path d={line} fill="none" stroke="var(--series-1)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {hover !== null && <line x1={x(k)} x2={x(k)} y1={0} y2={100} stroke="var(--ink-3)" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />}
        </svg>
        <span
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-[var(--series-1)]"
          style={{ left: `${x(k)}%`, top: `${y(values[k] ?? 0)}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-ink-3">
        <span>{labels[0]}</span>
        <span>{labels[n - 1]}</span>
      </div>
    </div>
  )
}

/** Width of an element, kept up to date. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}
