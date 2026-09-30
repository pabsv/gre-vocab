import { BookOpen, ChartColumn, Flame, Settings, Sun } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { useHotkeys } from '../lib/hotkeys'
import { useStore } from '../state/store'
import { ShortcutSheet } from '../ui/ShortcutSheet'
import { SyncBadge } from '../ui/SyncBadge'
import { UpdateToast } from '../ui/UpdateToast'

export const TABS = [
  { to: '/', label: 'Today', icon: Sun },
  { to: '/words', label: 'Words', icon: BookOpen },
  { to: '/mistakes', label: 'Mistakes', icon: Flame },
  { to: '/stats', label: 'Stats', icon: ChartColumn },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

export function Layout() {
  const navigate = useNavigate()
  const [sheet, setSheet] = useState(false)
  const error = useStore((s) => s.error)
  const clearError = useStore((s) => s.clearError)

  useHotkeys({
    'Alt+Digit1': () => navigate('/'),
    'Alt+Digit2': () => navigate('/words'),
    'Alt+Digit3': () => navigate('/mistakes'),
    'Alt+Digit4': () => navigate('/stats'),
    'Alt+Digit5': () => navigate('/settings'),
    'Shift+Slash': () => setSheet((v) => !v),
    Escape: () => setSheet(false),
  })

  return (
    <div className="min-h-dvh pb-28 sm:pb-6">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:h-16 sm:px-8">
          <NavLink to="/" className="flex items-baseline gap-1.5">
            <span className="marker font-display text-[1.45rem] font-semibold leading-none text-ink">Vocab</span>
            <span className="small-caps text-sm text-ink-3">gre</span>
          </NavLink>
          <nav className="hidden flex-1 items-center gap-1 sm:flex">
            {TABS.map((t, k) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === '/'}
                title={`${t.label} (Alt+${k + 1})`}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-[0.95rem] transition-colors ${isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink'}`
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto sm:ml-0">
            <SyncBadge />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-5 sm:px-8 sm:pt-8">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
        <div className="grid grid-cols-5">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) => `flex flex-col items-center gap-0.5 pb-2 pt-1.5 text-[11px] font-medium ${isActive ? 'text-accent' : 'text-ink-3'}`}
            >
              {({ isActive }) => (
                <>
                  <span className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors ${isActive ? 'bg-accent-soft' : ''}`}>
                    <t.icon size={20} strokeWidth={isActive ? 2.1 : 1.8} />
                  </span>
                  {t.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {error && (
        <div className="anim-rise fixed inset-x-4 bottom-24 z-30 mx-auto max-w-md rounded-xl border border-bad/40 bg-bad-soft px-4 py-3 text-sm text-bad shadow-card sm:bottom-6">
          <div className="flex items-start gap-3">
            <p className="flex-1">Could not save: {error}</p>
            <button type="button" onClick={clearError} className="font-medium underline">
              Dismiss
            </button>
          </div>
        </div>
      )}
      {sheet && <ShortcutSheet onClose={() => setSheet(false)} />}
      <UpdateToast />
    </div>
  )
}
