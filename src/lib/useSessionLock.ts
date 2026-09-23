import { useCallback, useEffect, useRef, useState } from 'react'

const NAME = 'gre-vocab-session'
/** A lock still held after this long belongs to another tab, not to a remount of this one. */
const GRACE_MS = 600

/**
 * Only one tab runs a study session at a time (two tabs would log the same answers twice).
 * Returns whether this tab holds the lock and a way to take it over from the other tab.
 * A blocked tab keeps waiting and picks the lock up as soon as the other tab lets go.
 */
export function useSessionLock(active: boolean): { blocked: boolean; takeOver: () => void } {
  const [blocked, setBlocked] = useState(false)
  const stop = useRef<(() => void) | null>(null)

  const acquire = useCallback((steal: boolean) => {
    if (!('locks' in navigator)) return
    stop.current?.()
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const abort = new AbortController()
    let got = false
    const timer = setTimeout(() => {
      if (!got) setBlocked(true)
    }, GRACE_MS)
    stop.current = () => {
      clearTimeout(timer)
      if (!got) abort.abort()
      release()
    }
    const options: LockOptions = steal ? { steal: true } : { signal: abort.signal }
    navigator.locks
      .request(NAME, options, async () => {
        got = true
        clearTimeout(timer)
        setBlocked(false)
        await held
      })
      .catch((err: unknown) => {
        // An abort before we got the lock is our own cleanup; after it, another tab stole the lock.
        if (got || !(err instanceof DOMException && err.name === 'AbortError')) setBlocked(true)
      })
  }, [])

  useEffect(() => {
    if (!active) return
    acquire(false)
    return () => {
      stop.current?.()
      stop.current = null
    }
  }, [active, acquire])

  return { blocked, takeOver: () => acquire(true) }
}
