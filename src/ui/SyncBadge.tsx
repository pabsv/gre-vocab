import { Cloud, CloudAlert, CloudCheck, CloudOff, RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { useSync } from '../sync/sync'

/** Sync state in the header; links to the sync settings. */
export function SyncBadge() {
  const status = useSync((s) => s.status)
  const view = {
    unconfigured: { icon: <CloudOff size={15} />, text: 'This device', tone: 'text-ink-3' },
    'signed-out': { icon: <CloudOff size={15} />, text: 'Not syncing', tone: 'text-ink-3' },
    syncing: { icon: <RefreshCw size={15} className="animate-spin" />, text: 'Syncing', tone: 'text-ink-3' },
    synced: { icon: <CloudCheck size={15} />, text: 'Synced', tone: 'text-ink-3' },
    offline: { icon: <Cloud size={15} />, text: 'Offline', tone: 'text-ink-3' },
    error: { icon: <CloudAlert size={15} />, text: 'Sync problem', tone: 'text-bad' },
  }[status]
  return (
    <Link to="/settings#sync" className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs hover:text-ink ${view.tone}`} title={view.text}>
      {view.icon}
      <span className="hidden sm:inline">{view.text}</span>
    </Link>
  )
}
