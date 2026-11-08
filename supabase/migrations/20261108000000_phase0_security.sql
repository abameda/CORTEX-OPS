-- Phase 0 security hardening (2026-11-08)
--
-- Replaces "any signed-in user can do anything" RLS with an explicit staff
-- allowlist, adds the tables that webhook replay protection and token-gated
-- voice calls need, and records Cal.com bookings by their server-side UID.
--
-- Data-preserving: no existing rows are modified or deleted except the
-- optional cal_booking_uid backfill (additive). Idempotent: safe to re-run.
-- Rollback: supabase/rollback/20261108000000_phase0_security_down.sql
--
-- IMPORTANT: after applying, nobody can read or write CORTEX-OPS data until
-- their auth user is added to public.staff_members (see docs/SECURITY-PHASE0.md).

begin;

-- ---------------------------------------------------------------------------
-- 1. Staff allowlist
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table if not exists public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'operator' check (role in ('owner', 'operator')),
  created_at timestamptz not null default now()
);

alter table public.staff_members enable row level security;
revoke all on public.staff_members from anon;

-- Staff can read their own membership row (used by the app to authorize).
-- There are deliberately no insert/update/delete policies: membership is
-- managed with SQL by the project owner (service role / SQL editor).
drop policy if exists staff_members_read_own on public.staff_members;
create policy staff_members_read_own on public.staff_members
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_members s
    where s.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_staff() from public, anon;
grant execute on function private.is_staff() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Replace the permissive policies on existing tables
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['workspaces', 'stage_outputs', 'transcripts', 'assets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Authenticated access" on public.%I', t);
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format(
      'create policy staff_all on public.%I for all to authenticated '
      || 'using ((select private.is_staff())) with check ((select private.is_staff()))',
      t
    );
    -- Defense in depth: the anon role never needs these tables.
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Cal.com bookings are bound by their server-side booking UID
-- ---------------------------------------------------------------------------
alter table public.workspaces add column if not exists cal_booking_uid text;

create unique index if not exists workspaces_cal_booking_uid_key
  on public.workspaces (cal_booking_uid)
  where cal_booking_uid is not null;

-- Backfill from the existing stage-1 input_data, keeping one workspace per UID.
update public.workspaces w
set cal_booking_uid = x.uid
from (
  select distinct on (so.input_data ->> 'cal_booking_id')
    so.workspace_id,
    so.input_data ->> 'cal_booking_id' as uid
  from public.stage_outputs so
  where so.stage = 1
    and coalesce(so.input_data ->> 'cal_booking_id', '') <> ''
  order by so.input_data ->> 'cal_booking_id', so.created_at
) x
where w.id = x.workspace_id
  and w.cal_booking_uid is null
  and not exists (
    select 1 from public.workspaces w2 where w2.cal_booking_uid = x.uid
  );

-- ---------------------------------------------------------------------------
-- 4. Webhook idempotency / replay protection (service role only)
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_events (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('cal', 'elevenlabs')),
  event_key text not null,
  received_at timestamptz not null default now(),
  -- null while a request is processing the event; an unfinished claim older
  -- than the app's lease (5 minutes) may be taken over by a provider retry.
  processed_at timestamptz,
  unique (provider, event_key)
);

alter table public.webhook_events add column if not exists processed_at timestamptz;

alter table public.webhook_events enable row level security;
revoke all on public.webhook_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Token-gated voice call sessions
-- ---------------------------------------------------------------------------
create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'issued'
    check (status in ('issued', 'started', 'completed', 'revoked')),
  not_before timestamptz not null default now(),
  expires_at timestamptz not null,
  max_duration_seconds integer not null default 2100
    check (max_duration_seconds between 60 and 3600),
  conversation_id text unique,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > not_before)
);

create index if not exists call_sessions_workspace_id_idx
  on public.call_sessions (workspace_id);

alter table public.call_sessions enable row level security;
revoke all on public.call_sessions from anon;

drop policy if exists staff_all on public.call_sessions;
create policy staff_all on public.call_sessions
  for all to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

commit;
