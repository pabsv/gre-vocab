/** A study day runs from 04:00 to 04:00 local time, so late night sessions count for the evening before. */
export const ROLLOVER_HOUR = 4
export const DAY_MS = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

export function formatDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Study day key ("YYYY-MM-DD") for a timestamp. */
export function studyDay(ms: number): string {
  const d = new Date(ms)
  if (d.getHours() < ROLLOVER_HOUR) d.setDate(d.getDate() - 1)
  return formatDay(d)
}

/** Local 04:00 that starts the study day containing `ms`. */
export function dayStart(ms: number): number {
  const d = new Date(ms)
  if (d.getHours() < ROLLOVER_HOUR) d.setDate(d.getDate() - 1)
  d.setHours(ROLLOVER_HOUR, 0, 0, 0)
  return d.getTime()
}

/** Local 04:00 that ends the study day containing `ms`. */
export function nextRollover(ms: number): number {
  const d = new Date(dayStart(ms))
  d.setDate(d.getDate() + 1)
  return d.getTime()
}

export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day)
  d.setDate(d.getDate() + n)
  return formatDay(d)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / DAY_MS)
}
