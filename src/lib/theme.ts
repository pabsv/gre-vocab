import type { Settings } from '../core/types'

const KEY = 'gre-theme'

export function applyTheme(theme: Settings['theme']) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#0f1115' : '#f3eee3')
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // ignore
  }
}

export function watchSystemTheme(get: () => Settings['theme']) {
  const mq = matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (get() === 'system') applyTheme('system')
  }
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
