import { LogIn, LogOut, RefreshCw } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { signIn, signOut, syncNow, useSync } from '../sync/sync'
import { Button } from './Button'

function ago(ms: number | null): string {
  if (!ms) return 'not yet'
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** Sign in with the Life OS account to share progress between laptop and phone. */
export function SyncPanel() {
  const { status, email, lastSyncAt, error } = useSync()
  const [form, setForm] = useState({ email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  if (status === 'unconfigured') {
    return (
      <div className="py-4">
        <p className="font-medium text-ink">This device only</p>
        <p className="mt-0.5 text-sm text-ink-3">Sync is not configured in this build. Use Export and Import to move progress.</p>
      </div>
    )
  }

  if (status === 'signed-out') {
    const submit = async (e: FormEvent) => {
      e.preventDefault()
      setBusy(true)
      setFormError(null)
      try {
        await signIn(form.email, form.password)
        setForm({ email: '', password: '' })
      } catch (err) {
        setFormError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    }
    return (
      <form onSubmit={submit} className="flex flex-col gap-3 py-4">
        <div>
          <p className="font-medium text-ink">Sync laptop and phone</p>
          <p className="mt-0.5 text-sm text-ink-3">Sign in with your Life OS account. Progress stays on this device too, and the app keeps working offline.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="email"
            autoComplete="username"
            required
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-ink outline-none focus:border-accent"
          />
          <input
            type="password"
            autoComplete="current-password"
            required
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-ink outline-none focus:border-accent"
          />
        </div>
        {formError && <p className="text-sm text-bad">{formError}</p>}
        <Button type="submit" variant="primary" size="sm" icon={<LogIn size={15} />} disabled={busy} className="self-start">
          {busy ? 'Signing in' : 'Sign in and sync'}
        </Button>
      </form>
    )
  }

  const label: Record<string, string> = {
    syncing: 'Syncing now',
    synced: `Synced ${ago(lastSyncAt)}`,
    offline: 'Offline: changes wait on this device',
    error: 'Sync problem',
  }
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-ink">{label[status] ?? 'Sync'}</p>
        <p className="mt-0.5 truncate text-sm text-ink-3">{email ? `Signed in as ${email}` : 'Signed in'}</p>
        {error && <p className="mt-1 text-sm text-bad">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" icon={<RefreshCw size={15} className={status === 'syncing' ? 'animate-spin' : ''} />} onClick={() => void syncNow()} disabled={status === 'syncing'}>
          Sync now
        </Button>
        <Button size="sm" variant="ghost" icon={<LogOut size={15} />} onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  )
}
