import { create } from 'zustand'
import { db } from '../db/db'
import { mergeEvents, mergeMeta, rebuildAll } from '../db/repo'
import { onLocalWrite, schedulerFor, useStore } from '../state/store'
import { afterFilter, eventFromRemote, eventToRemote, metaFromRemote, metaToRemote, type RemoteEvent, type RemoteMeta } from './mapping'
import { supabase } from './supabase'

export type SyncStatus = 'unconfigured' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error'

interface SyncState {
  status: SyncStatus
  email: string | null
  lastSyncAt: number | null
  error: string | null
}

export const useSync = create<SyncState>(() => ({
  status: supabase ? 'signed-out' : 'unconfigured',
  email: null,
  lastSyncAt: null,
  error: null,
}))

const PAGE = 1000
const PUSH_BATCH = 500
/** Pulls re-read a small window before the cursor: covers transactions that commit late. */
const OVERLAP_MS = 2 * 60_000

const messageOf = (err: unknown) => (err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String(err.message) : String(err))

async function kvGet<T>(key: string): Promise<T | null> {
  return ((await db.kv.get(key))?.value as T | undefined) ?? null
}
async function kvSet(key: string, value: unknown) {
  await db.kv.put({ key, value })
}
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : Date.parse(b) > Date.parse(a) ? b : a)

async function pushEvents() {
  const client = supabase!
  for (let round = 0; round < 100; round++) {
    const rows = await db.events.where('pushed').equals(0).limit(PUSH_BATCH).toArray()
    if (!rows.length) return
    const { error } = await client.from('gre_events').upsert(rows.map(eventToRemote), { onConflict: 'id' })
    if (error) throw error
    await db.transaction('rw', db.events, async () => {
      for (const r of rows) {
        const cur = await db.events.get(r.id)
        // Only mark clean if nothing changed locally (an undo) while the push was in flight.
        if (cur && cur.v === r.v) await db.events.update(r.id, { pushed: 1 })
      }
    })
    if (rows.length < PUSH_BATCH) return
  }
}

async function pushMeta() {
  const client = supabase!
  const rows = await db.meta.where('pushed').equals(0).toArray()
  for (let k = 0; k < rows.length; k += PUSH_BATCH) {
    const batch = rows.slice(k, k + PUSH_BATCH)
    const { error } = await client.from('gre_meta').upsert(batch.map(metaToRemote), { onConflict: 'owner_id,key' })
    if (error) throw error
    await db.transaction('rw', db.meta, async () => {
      for (const r of batch) {
        const cur = await db.meta.get(r.key)
        if (cur && cur.updatedAt === r.updatedAt) await db.meta.update(r.key, { pushed: 1 })
      }
    })
  }
}

async function pullEvents(): Promise<Set<string>> {
  const client = supabase!
  const touched = new Set<string>()
  const cursor = await kvGet<string>('cursor:events')
  let newest = cursor
  let after: { at: string; id: string } | null = null
  for (let page = 0; page < 1000; page++) {
    let q = client.from('gre_events').select('*').order('synced_at', { ascending: true }).order('id', { ascending: true }).limit(PAGE)
    if (after) q = q.or(afterFilter(after.at, 'id', after.id))
    else if (cursor) q = q.gt('synced_at', new Date(Date.parse(cursor) - OVERLAP_MS).toISOString())
    const { data, error } = await q
    if (error) throw error
    const rows = (data ?? []) as RemoteEvent[]
    if (!rows.length) break
    for (const id of await mergeEvents(rows.map(eventFromRemote), 1)) touched.add(id)
    const last = rows[rows.length - 1]
    after = { at: last.synced_at!, id: last.id }
    newest = later(newest, last.synced_at!)
    if (rows.length < PAGE) break
  }
  if (newest && newest !== cursor) await kvSet('cursor:events', newest)
  return touched
}

async function pullMeta(): Promise<boolean> {
  const client = supabase!
  const cursor = await kvGet<string>('cursor:meta')
  let newest = cursor
  let changed = false
  let after: { at: string; key: string } | null = null
  for (let page = 0; page < 100; page++) {
    let q = client.from('gre_meta').select('key,value,updated_at,synced_at').order('synced_at', { ascending: true }).order('key', { ascending: true }).limit(PAGE)
    if (after) q = q.or(afterFilter(after.at, 'key', after.key))
    else if (cursor) q = q.gt('synced_at', new Date(Date.parse(cursor) - OVERLAP_MS).toISOString())
    const { data, error } = await q
    if (error) throw error
    const rows = (data ?? []) as RemoteMeta[]
    if (!rows.length) break
    if ((await mergeMeta(rows.map(metaFromRemote), 1)) > 0) changed = true
    const last = rows[rows.length - 1]
    after = { at: last.synced_at!, key: last.key }
    newest = later(newest, last.synced_at!)
    if (rows.length < PAGE) break
  }
  if (newest && newest !== cursor) await kvSet('cursor:meta', newest)
  return changed
}

async function runOnce() {
  const client = supabase!
  if (!navigator.onLine) {
    useSync.setState({ status: 'offline' })
    return
  }
  const { data } = await client.auth.getSession()
  const user = data.session?.user
  if (!user) {
    useSync.setState({ status: 'signed-out', email: null })
    return
  }
  const owner = await kvGet<string>('owner')
  if (owner && owner !== user.id) {
    useSync.setState({
      status: 'error',
      email: user.email ?? null,
      error: 'This device already syncs with a different account. Sign out to keep the two apart.',
    })
    return
  }
  useSync.setState({ status: 'syncing', email: user.email ?? null, error: null })
  try {
    if (!owner) await kvSet('owner', user.id)
    await pushEvents()
    await pushMeta()
    const touched = await pullEvents()
    const metaChanged = await pullMeta()
    if (touched.size) await rebuildAll(schedulerFor(useStore.getState().settings.retention), db, touched)
    if (touched.size || metaChanged) await useStore.getState().reload()
    useSync.setState({ status: 'synced', lastSyncAt: Date.now() })
  } catch (err) {
    useSync.setState({ status: navigator.onLine ? 'error' : 'offline', error: messageOf(err) })
  }
}

let running: Promise<void> | null = null
let again = false

/** Push local changes, then pull remote ones. Calls made while a sync runs are folded into one more pass. */
export function syncNow(): Promise<void> {
  if (!supabase) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        await runOnce()
      } while (again)
    } finally {
      running = null
    }
  })()
  return running
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Sync is not configured')
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
  await syncNow()
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
  useSync.setState({ status: 'signed-out', email: null, error: null })
}

/** Keeps the device in sync: on sign in, focus, reconnect, after local writes, and every few minutes. */
export function startSync(): () => void {
  const client = supabase
  if (!client) return () => {}
  let debounce: ReturnType<typeof setTimeout> | null = null
  let lastFocusSync = 0
  const soon = () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      debounce = null
      void syncNow()
    }, 15_000)
  }
  const flush = () => {
    if (debounce) {
      clearTimeout(debounce)
      debounce = null
      void syncNow()
    }
  }
  const onFocus = () => {
    if (Date.now() - lastFocusSync < 30_000) return
    lastFocusSync = Date.now()
    void syncNow()
  }
  const onVisibility = () => (document.visibilityState === 'visible' ? onFocus() : flush())
  const onOnline = () => void syncNow()

  const { data: sub } = client.auth.onAuthStateChange((event, session) => {
    // Supabase advises against awaiting its own calls inside this callback.
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) setTimeout(() => void syncNow(), 0)
    if (event === 'INITIAL_SESSION' && !session) useSync.setState({ status: 'signed-out', email: null })
    if (event === 'SIGNED_OUT') useSync.setState({ status: 'signed-out', email: null })
  })
  const offWrite = onLocalWrite(soon)
  window.addEventListener('focus', onFocus)
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisibility)
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow()
  }, 5 * 60_000)

  return () => {
    sub.subscription.unsubscribe()
    offWrite()
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisibility)
    clearInterval(interval)
    if (debounce) clearTimeout(debounce)
  }
}
