-- ROLLBACK for 20261108000000_phase0_security.sql
--
-- Prefer rolling back the APPLICATION deployment only. The pre-Phase-0 app
-- code keeps working on top of this migration for any user listed in
-- public.staff_members, so the database change rarely needs reverting.
--
-- Running this script RESTORES THE INSECURE POLICIES (any signed-in user can
-- read and write every table). Only run it with public sign-up disabled, and
-- only if the migration itself is causing an outage.
--
-- Data impact: drops call_sessions and webhook_events (operational tables,
-- no client content) and the staff allowlist. workspaces.cal_booking_uid is
-- kept (harmless, additive) unless you uncomment the last statement.

begin;

do $$
declare
  t text;
begin
  foreach t in array array['workspaces', 'stage_outputs', 'transcripts', 'assets'] loop
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format('drop policy if exists "Authenticated access" on public.%I', t);
    execute format(
      'create policy "Authenticated access" on public.%I for all using (auth.role() = ''authenticated'')',
      t
    );
    execute format('grant all on public.%I to anon', t);
  end loop;
end $$;

drop table if exists public.call_sessions;
drop table if exists public.webhook_events;
drop function if exists private.is_staff();
drop table if exists public.staff_members;

-- alter table public.workspaces drop column if exists cal_booking_uid;

commit;
