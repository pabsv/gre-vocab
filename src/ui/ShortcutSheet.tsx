import { Kbd } from './Kbd'

const GROUPS: { title: string; rows: [string[], string][] }[] = [
  {
    title: 'Studying',
    rows: [
      [['Enter'], 'Start, check, continue'],
      [['Space'], 'Flip or reveal'],
      [['1', '2', '3', '4'], 'Pick a multiple choice option'],
      [['Shift', '1…4'], "Show an option's meaning (before answering counts as a miss)"],
      [['1'], 'Knew it / right'],
      [['2'], "Didn't know / wrong"],
      [['3'], 'Roughly (got the gist)'],
      [['Space'], 'Continue after a miss'],
      [['P'], 'Pronounce'],
      [['M'], 'Auto pronounce on or off'],
      [['←'], 'Back to the last card (multiple choice)'],
      [['Backspace'], 'Back to the last card (any card)'],
      [['Esc'], 'Pause and leave'],
    ],
  },
  {
    title: 'Anywhere',
    rows: [
      [['←', '→'], 'Fewer or more new words (Today)'],
      [['Alt', '1…5'], 'Today, Words, Mistakes, Stats, Settings'],
      [['/'], 'Search words'],
      [['?'], 'This sheet'],
    ],
  },
]

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="anim-rise w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        {GROUPS.map((g) => (
          <section key={g.title} className="mb-5 last:mb-0">
            <h3 className="small-caps mb-3 text-ink-3">{g.title}</h3>
            <dl className="grid gap-2.5">
              {g.rows.map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <dt className="text-[0.95rem] text-ink-2">{label}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  )
}
