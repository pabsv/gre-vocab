import type { ReactNode } from 'react'

/** The raised paper card used for every dashboard block. */
export function Panel({ title, aside, className = '', children }: { title?: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`rounded-[22px] border border-line bg-surface p-5 shadow-card sm:p-7 ${className}`}>
      {(title || aside) && (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          {title && <h2 className="small-caps text-ink-3">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

/** Page heading shared by every tab. */
export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-[2.25rem] font-semibold leading-tight tracking-tight sm:text-4xl">{children}</h1>
      {sub && <p className="mt-2 max-w-xl text-ink-2">{sub}</p>}
    </div>
  )
}
