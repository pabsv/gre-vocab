import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './Button'

/** Shown outside study sessions when a new version is ready. */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new version every hour while the app stays open.
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000)
    },
  })
  if (!needRefresh) return null
  return (
    <div className="anim-rise fixed inset-x-4 bottom-24 z-30 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card sm:bottom-6">
      <p className="flex-1 text-sm text-ink">A new version is ready.</p>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        Later
      </Button>
      <Button size="sm" variant="primary" onClick={() => void updateServiceWorker(true)}>
        Update
      </Button>
    </div>
  )
}
