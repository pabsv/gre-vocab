-- GRE Vocab sync. Lives in the Life OS Supabase project but touches nothing of Life OS:
-- two new tables, their own trigger functions, owner-only row level security.
-- Applied through the Supabase MCP as migration "gre_vocab_init". Undo with supabase/teardown.sql.

-- Answer log: append only. The one allowed change is voiding (undo).
create table if not exists public.gre_events (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id text not null,
  at timestamptz not null,
  day date not null,
  kind text not null,
  mode text,
  ok smallint not null,
  typo smallint,
  hint smallint,
  grade smallint check (grade between 1 and 4),
  amend smallint,
  confused_with text,
  answer text,
  ms integer,
  device text not null,
  voided boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);
create index if not exists gre_events_owner_synced on public.gre_events (owner_id, synced_at, id);

-- Settings, notes, stars, suspensions: last write wins per key.
create table if not exists public.gre_meta (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz not null,
  synced_at timestamptz not null default clock_timestamp(),
  primary key (owner_id, key)
);
create index if not exists gre_meta_owner_synced on public.gre_meta (owner_id, synced_at, key);

create or replace function public.gre_events_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.voided or not new.voided then
      return null; -- events never change, except to become voided
    end if;
    new := old;
    new.voided := true;
  end if;
  new.synced_at := clock_timestamp(); -- server time drives every pull cursor
  return new;
end
$$;

drop trigger if exists gre_events_guard on public.gre_events;
create trigger gre_events_guard before insert or update on public.gre_events
  for each row execute function public.gre_events_guard();

create or replace function public.gre_meta_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at <= old.updated_at then
    return null; -- keep the newer value
  end if;
  new.synced_at := clock_timestamp();
  return new;
end
$$;

drop trigger if exists gre_meta_guard on public.gre_meta;
create trigger gre_meta_guard before insert or update on public.gre_meta
  for each row execute function public.gre_meta_guard();

alter table public.gre_events enable row level security;
alter table public.gre_meta enable row level security;

create policy gre_events_select on public.gre_events for select to authenticated using (owner_id = (select auth.uid()));
create policy gre_events_insert on public.gre_events for insert to authenticated with check (owner_id = (select auth.uid()));
create policy gre_events_update on public.gre_events for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy gre_meta_select on public.gre_meta for select to authenticated using (owner_id = (select auth.uid()));
create policy gre_meta_insert on public.gre_meta for insert to authenticated with check (owner_id = (select auth.uid()));
create policy gre_meta_update on public.gre_meta for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

revoke all on public.gre_events, public.gre_meta from anon;
grant select, insert, update on public.gre_events, public.gre_meta to authenticated;
