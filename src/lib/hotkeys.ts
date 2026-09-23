import { useEffect, useRef } from 'react'

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>

const CODE_ALIASES: Record<string, string> = {
  NumpadEnter: 'Enter',
  Numpad1: 'Digit1',
  Numpad2: 'Digit2',
  Numpad3: 'Digit3',
  Numpad4: 'Digit4',
  Numpad5: 'Digit5',
}

/** "Mod+KeyZ", "Alt+Digit1", "Shift+Slash", "Enter". Matched by physical key so any layout works. */
export function comboOf(e: KeyboardEvent): string {
  const code = CODE_ALIASES[e.code] ?? e.code
  return `${e.ctrlKey || e.metaKey ? 'Mod+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${code}`
}

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

/**
 * Window-level shortcuts. Ignored while typing, except combos listed in `inInput`.
 * Handlers are read from a ref, so the map can change every render.
 */
export function useHotkeys(map: HotkeyMap, opts: { enabled?: boolean; inInput?: string[] } = {}) {
  const ref = useRef(map)
  const optsRef = useRef(opts)
  useEffect(() => {
    ref.current = map
    optsRef.current = opts
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (optsRef.current.enabled === false || e.isComposing) return
      const combo = comboOf(e)
      const handler = ref.current[combo]
      if (!handler) return
      if (isTyping(e.target) && !optsRef.current.inInput?.includes(combo)) return
      if (e.repeat && (combo === 'Enter' || combo === 'Space')) {
        e.preventDefault()
        return
      }
      e.preventDefault()
      handler(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
