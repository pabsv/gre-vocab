import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Kbd } from './Kbd'

type Variant = 'primary' | 'secondary' | 'ghost' | 'good' | 'warn' | 'bad'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 active:brightness-95 shadow-sm',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2',
  good: 'bg-good-soft text-good border border-good/30 hover:border-good/60',
  warn: 'bg-warn-soft text-warn border border-warn/30 hover:border-warn/60',
  bad: 'bg-bad-soft text-bad border border-bad/30 hover:border-bad/60',
}

export function Button({
  variant = 'secondary',
  keys,
  icon,
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  /** Shortcut hint shown as keycaps. */
  keys?: string[]
  icon?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizing = size === 'lg' ? 'h-13 px-6 text-base gap-3' : size === 'sm' ? 'h-8 px-3 text-sm gap-2' : 'h-11 px-4 text-[0.95rem] gap-2.5'
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center rounded-xl font-medium transition-[filter,background,border-color,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-40 ${sizing} ${VARIANTS[variant]} ${className}`}
    >
      {icon}
      {children}
      {keys && (
        <span className="ml-1 hidden items-center gap-1 sm:inline-flex">
          {keys.map((k) => (
            <Kbd key={k} className={variant === 'primary' ? '!border-white/30 !bg-white/10 !text-current' : ''}>
              {k}
            </Kbd>
          ))}
        </span>
      )}
    </button>
  )
}
