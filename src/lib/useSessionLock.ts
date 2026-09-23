import { useCallback, useEffect, useRef, useState } from 'react'

const NAME = 'gre-vocab-session'

/**
 * Only one tab runs a study session at a time (two tabs would log the same answers twice).
 * Returns whether this tab holds the lock and a way to take it over from the other tab.
 */
export function useSessionLock(active: boolean): { blocked: boolean; takeOver: () => void } {
  const [blocked, setBlocked] = useState(false)
  const release = useRef<(() => void) | null>(null)

  const acquire = useCallback((steal: boolean) => {
    if (!('locks' in navigator)) return
    release.current?.()
    const held = new Promise<void>((resolve) => {
      release.current = resolve
    })
    const options: LockOptions = steal ? { steal: true } : { ifAvailable: true }
    navigator.locks
      .request(NAME, options, async (lock) => {
        if (!lock) {
          setBlocked(true)
          return
        }
        setBlocked(false)
        await held
      })
      .catch(() => setBlocked(true)) // another tab took the session over
  }, [])

  useEffect(() => {
    if (!active) return
    acquire(false)
    return () => {
      release.current?.()
      release.current = null
    }
  }, [active, acquire])

  return { blocked, takeOver: () => acquire(true) }
}
