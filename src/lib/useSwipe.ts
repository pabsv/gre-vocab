import { useRef, type PointerEvent } from 'react'

/** Horizontal swipe on touch screens. Returns pointer handlers for the swipeable element. */
export function useSwipe(onLeft: () => void, onRight: () => void, enabled = true) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (e: PointerEvent) => {
      if (!enabled || e.pointerType === 'mouse') return
      start.current = { x: e.clientX, y: e.clientY }
    },
    onPointerUp: (e: PointerEvent) => {
      const s = start.current
      start.current = null
      if (!enabled || !s) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return
      if (dx < 0) onLeft()
      else onRight()
    },
    onPointerCancel: () => {
      start.current = null
    },
  }
}
