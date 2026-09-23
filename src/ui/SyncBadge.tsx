import { CloudOff } from 'lucide-react'
import { Link } from 'react-router'

/** Sync state in the header. Replaced by the live status once sync is configured. */
export function SyncBadge() {
  return (
    <Link to="/settings#sync" className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-ink-3 hover:text-ink" title="Progress is saved on this device">
      <CloudOff size={15} />
      <span className="hidden sm:inline">This device</span>
    </Link>
  )
}
