export const BUCKET_LABEL = { new: 'New', learning: 'Learning', familiar: 'Familiar', mastered: 'Mastered' } as const

export function dueLabel(due: number | undefined, t: number): string {
  if (!due || due >= Number.MAX_SAFE_INTEGER) return 'not started'
  const days = Math.round((due - t) / 86_400_000)
  if (days <= 0) return 'due now'
  if (days === 1) return 'tomorrow'
  if (days < 30) return `in ${days} days`
  return `in ${Math.round(days / 30)} months`
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
