import { Download, Monitor, Moon, Sun, Upload } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { SEC_PER_NEW, SEC_PER_REVIEW } from '../core/plan'
import type { OrderMode, Settings } from '../core/types'
import { exportData, importData, type ExportFile } from '../db/repo'
import { clockOffset, setClockOffset } from '../lib/clock'
import { schedulerFor, useStore } from '../state/store'
import { Button } from '../ui/Button'
import { PageTitle } from '../ui/Panel'
import { SyncPanel } from '../ui/SyncPanel'

export function SettingsRoute() {
  const settings = useStore((s) => s.settings)
  const update = useStore((s) => s.updateSettings)
  const resetAll = useStore((s) => s.resetAll)
  const reload = useStore((s) => s.reload)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<Settings>) => void update(patch)

  const perDayMinutes = Math.round((settings.newPerDay * SEC_PER_NEW + settings.newPerDay * 2.8 * SEC_PER_REVIEW) / 60)

  const doExport = async () => {
    const data = await exportData()
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `gre-vocab-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const doImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as ExportFile
      const r = await importData(data, schedulerFor(settings.retention))
      await reload()
      setMessage(`Imported: ${r.events} words updated, ${r.meta} settings or notes.`)
    } catch (err) {
      setMessage(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  const doReset = async () => {
    if (!confirm('Reset all progress? Your history stays in the log, but every word starts over as new.')) return
    await resetAll()
    setMessage('All progress reset.')
  }

  return (
    <div className="anim-rise flex max-w-3xl flex-col gap-8 sm:gap-10">
      <PageTitle>Settings</PageTitle>

      <Group title="daily pace">
        <Row label="New words per day" detail={`Starting size on Today; changing the stepper there or this slider here, whichever was last, sets the next session. Roughly ${perDayMinutes} minutes a day.`}>
          <Range value={settings.newPerDay} min={10} max={60} step={5} onChange={(v) => set({ newPerDay: v, lastNew: null })} />
        </Row>
        <Row label="Daily time budget" detail="Today starts at your daily target; this budget only applies when no session size is picked.">
          <Range value={settings.budgetMin} min={20} max={150} step={10} suffix=" min" onChange={(v) => set({ budgetMin: v })} />
        </Row>
        <Row label="Words in play at once" detail="Automatic. It grows when new words come back too easy and shrinks when you start missing them.">
          <span className="tabular font-display text-2xl font-semibold text-ink">{settings.windowSize}</span>
        </Row>
        <Row label="GRE date" detail="Shows a countdown and warns when the pace is too slow.">
          <input
            type="date"
            value={settings.examDate ?? ''}
            onChange={(e) => set({ examDate: e.target.value || null })}
            className="rounded-xl border border-line-strong bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
          />
        </Row>
      </Group>

      <Group title="learning">
        <Row label="Order of new words" detail="Mixed deals Common, Basic and Advanced words evenly every day. Changes apply to words not started yet.">
          <Segmented<OrderMode>
            value={settings.order}
            onChange={(v) => set({ order: v })}
            options={[
              ['mixed', 'Mixed'],
              ['common-first', 'Common first'],
              ['alphabetical', 'A to Z'],
            ]}
          />
        </Row>
        <Row label="Auto pronounce" detail="Speak a new word when it appears and again when it is flipped. N pronounces any time.">
          <Toggle checked={settings.autoSpeak} onChange={(v) => set({ autoSpeak: v })} />
        </Row>
        <Row label="Target recall" detail="Higher means more reviews and firmer memory. 90% is the sweet spot for most learners.">
          <Segmented<string>
            value={String(settings.retention)}
            onChange={(v) => set({ retention: Number(v) })}
            options={[
              ['0.85', '85%'],
              ['0.9', '90%'],
              ['0.93', '93%'],
              ['0.95', '95%'],
            ]}
          />
        </Row>
      </Group>

      <Group title="appearance">
        <Row label="Theme">
          <Segmented<Settings['theme']>
            value={settings.theme}
            onChange={(v) => set({ theme: v })}
            options={[
              ['system', 'System', <Monitor key="m" size={15} />],
              ['light', 'Paper', <Sun key="s" size={15} />],
              ['dark', 'Ink', <Moon key="d" size={15} />],
            ]}
          />
        </Row>
      </Group>

      <div id="sync">
        <Group title="sync">
          <SyncPanel />
        </Group>
      </div>

      <Group title="your data">
        <Row label="Backup" detail="Everything (answers, notes, settings) in one JSON file. Import merges; nothing is overwritten.">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<Download size={15} />} onClick={() => void doExport()}>
              Export
            </Button>
            <Button size="sm" icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>
              Import
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void doImport(f)
                e.target.value = ''
              }}
            />
          </div>
        </Row>
        <Row label="Start over" detail="Every word becomes new again. The answer log is kept.">
          <Button size="sm" variant="bad" onClick={() => void doReset()}>
            Reset progress
          </Button>
        </Row>
        {message && <p className="text-sm text-ink-2">{message}</p>}
      </Group>

      {import.meta.env.DEV && <DevClock />}

      <p className="text-xs leading-relaxed text-ink-3">
        Words, definitions and example sentences come from the Magoosh GRE vocabulary deck. Scheduling uses FSRS, the algorithm behind modern Anki.
      </p>
    </div>
  )
}

function DevClock() {
  const [offset, setOffset] = useState(clockOffset())
  const days = Math.round(offset / 86_400_000)
  const shift = (d: number) => {
    const next = d === 0 ? 0 : offset + d * 86_400_000
    setClockOffset(next)
    setOffset(next)
    location.reload()
  }
  return (
    <Group title="developer clock">
      <Row label={`Clock offset: ${days} days`} detail="Only in development. Jump ahead to see tomorrow's reviews.">
        <div className="flex gap-2">
          <Button size="sm" onClick={() => shift(1)}>
            +1 day
          </Button>
          <Button size="sm" onClick={() => shift(0)}>
            Reset
          </Button>
        </div>
      </Row>
    </Group>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="small-caps mb-3 text-ink-3">{title}</h2>
      <div className="flex flex-col divide-y divide-line rounded-[22px] border border-line bg-surface px-5 shadow-card sm:px-6">{children}</div>
    </section>
  )
}

function Row({ label, detail, children }: { label: string; detail?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <p className="font-medium text-ink">{label}</p>
        {detail && <p className="mt-0.5 text-sm text-ink-3">{detail}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Range({ value, min, max, step, suffix = '', onChange }: { value: number; min: number; max: number; step: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-40 accent-[var(--accent)]" />
      <span className="tabular w-16 text-right font-display text-xl font-semibold">
        {value}
        <span className="text-sm font-normal text-ink-3">{suffix}</span>
      </span>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-surface-3'}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-surface shadow transition-[left] ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string, ReactNode?][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-line-strong bg-surface-2 p-1">
      {options.map(([v, label, icon]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${value === v ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
        >
          {icon}
          {label}
        </button>
      ))}
    </div>
  )
}
