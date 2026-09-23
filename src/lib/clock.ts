/**
 * App clock. In development a stored offset lets you jump ahead ("tomorrow") to check reviews.
 * Production always uses the real time.
 */
const KEY = 'gre-dev-clock-offset'

function readOffset(): number {
  if (!import.meta.env.DEV) return 0
  try {
    return Number(localStorage.getItem(KEY)) || 0
  } catch {
    return 0
  }
}

let offset = readOffset()

export function now(): number {
  return Date.now() + offset
}

export function clockOffset(): number {
  return offset
}

export function setClockOffset(ms: number) {
  if (!import.meta.env.DEV) return
  offset = ms
  try {
    localStorage.setItem(KEY, String(ms))
  } catch {
    // storage unavailable: offset lasts until reload
  }
}
