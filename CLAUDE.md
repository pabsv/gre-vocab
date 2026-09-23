# GRE Vocab

Personal trainer for the Magoosh 1000 GRE words. Vite 8, React 19, TS, Tailwind 4, Dexie (local-first), ts-fsrs, Supabase sync, installable PWA on Vercel. Why things are the way they are: `docs/DECISIONS.md`.

## Commands

* `npm run dev` (port 5174), `npm test`, `npm run lint`, `npm run build`, `npm run preview` (port 4174, service worker active)
* `npm run words` rebuilds `src/data/words.json` from `data/magoosh-1000.apkg` and prints a cleaning report. Fix data in `data/overrides.json`, never by hand in `words.json`.
* `npx pwa-assets-generator` regenerates icons from `public/icon.svg`.

## Rules and gotchas

* Local Node is 20.20: keep vitest on ^4 and react-router on ^7 (their next majors need Node 22+). `ts-fsrs` is pinned to exactly 5.4.2.
* Answer events are the source of truth. `progress` is derived (`src/core/derive.ts`) and never synced. An event is never edited, only voided (undo). One FSRS grade per word per study day; the final sweep may amend it.
* `src/core` stays pure (rng and clock injected) and tested. Session and app state live in `src/state/store.ts`.
* Study days roll over at 04:00 local (`src/core/time.ts`).
* ts-fsrs `get_retrievability` returns a string unless its third argument is `false`; use `recallProbability` from `src/core/fsrs.ts`.
* Dev only: `window.__store` in the console, and Settings has a clock offset to jump to tomorrow.
* Supabase is the Life OS project (`qhvmpbkgzbnislbfjlue`). GRE owns only `gre_events`, `gre_meta` and their two trigger functions; never touch anything else there. Migrations live in `supabase/migrations/` and go in through the Supabase MCP `apply_migration` with a `gre_` name. `supabase/teardown.sql` removes it all. Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (`.env.local` and Vercel).
* Vercel project `gre-vocab` (team `pablos-projects-38f708cc`) deploys from GitHub `main`. Use the token, never `vercel login`.
* Chart and mastery colours in `src/index.css` are validated palettes; re-run the dataviz validator before changing them.
* PWA uses `registerType: 'prompt'` so an update never reloads a running session.
