import { useEffect } from 'react'

/**
 * Keeps the screen awake while mounted (Screen Wake Lock API). The browser drops the lock when
 * the page is hidden, so it is requested again whenever the page becomes visible.
 */
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch {
        // Not allowed while hidden; the visibility handler retries.
      }
    }
    const onVisible = () => {
      if (!cancelled && document.visibilityState === 'visible') void request()
    }
    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
      lock = null
    }
  }, [active])
}
