export function Kbd({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <kbd className={`kbd ${className}`}>{children}</kbd>
}
