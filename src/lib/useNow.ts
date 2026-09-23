import { useEffect, useState } from 'react'
import { now } from './clock'

/** Current app time, refreshed on an interval (dashboards that depend on the study day). */
export function useNow(intervalMs = 60_000): number {
  const [t, setT] = useState(now)
  useEffect(() => {
    const id = setInterval(() => setT(now()), intervalMs)
    const onFocus = () => setT(now())
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [intervalMs])
  return t
}
