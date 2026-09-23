import type { ReactNode } from 'react'

/** The index card every task sits on. */
export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={`anim-rise relative rounded-[22px] border border-line bg-surface px-5 py-6 shadow-card sm:px-10 sm:py-8 ${className}`}
    >
      {children}
    </div>
  )
}

export function TaskLabel({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' | 'warn' }) {
  const color = tone === 'accent' ? 'text-accent' : tone === 'warn' ? 'text-warn' : 'text-ink-3'
  return <p className={`small-caps mb-5 text-[0.95rem] ${color}`}>{children}</p>
}
