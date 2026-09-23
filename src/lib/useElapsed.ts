import { useCallback, useEffect, useRef } from 'react'

/** Milliseconds since the component mounted, read in event handlers (answer timing). */
export function useElapsed(): () => number {
  const start = useRef(0)
  useEffect(() => {
    start.current = performance.now()
  }, [])
  return useCallback(() => (start.current ? performance.now() - start.current : 0), [])
}
