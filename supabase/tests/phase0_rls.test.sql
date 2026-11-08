-- Phase 0 RLS tests. Run with: npx supabase test db
-- Simulates PostgREST requests by switching role and JWT claims inside a
-- transaction that is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- Fixtures (as postgres) ------------------------------------------------------
insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-4111-8111-111111111111', 'staff@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'outsider@test.local', 'authenticated', 'authenticated');

insert into public.staff_members (user_id, role)
values ('11111111-1111-4111-8111-111111111111', 'owner');

insert into public.workspaces (id, client_name, tier)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Client A', 'launch'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Client B', 'build');

insert into public.transcripts (workspace_id, raw_transcript)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'secret transcript A');

insert into public.stage_outputs (workspace_id, stage, stage_name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 'discovery_call');

insert into public.call_sessions (workspace_id, token_hash, expires_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hash-a', now() + interval '1 day');

insert into public.webhook_events (provider, event_key) values ('cal', 'evt-1');

-- Anonymous ------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok($$ select count(*) from public.workspaces $$, '42501', null, 'anon cannot read workspaces');
select throws_ok($$ select count(*) from public.transcripts $$, '42501', null, 'anon cannot read transcripts');
select throws_ok($$ select count(*) from public.call_sessions $$, '42501', null, 'anon cannot read call_sessions');
select throws_ok($$ select count(*) from public.webhook_events $$, '42501', null, 'anon cannot read webhook_events');
select throws_ok(
  $$ insert into public.workspaces (client_name, tier) values ('x', 'launch') $$,
  '42501', null, 'anon cannot insert workspaces'
);

-- Signed in, NOT on the staff list (what an open sign-up would create) -------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is((select count(*) from public.workspaces)::int, 0, 'outsider sees no workspaces');
select is((select count(*) from public.transcripts)::int, 0, 'outsider sees no transcripts');
select is((select count(*) from public.stage_outputs)::int, 0, 'outsider sees no stage outputs');
select is((select count(*) from public.call_sessions)::int, 0, 'outsider sees no call sessions');
select is((select count(*) from public.staff_members)::int, 0, 'outsider sees no staff rows');
select is(private.is_staff(), false, 'outsider is not staff');
select throws_ok(
  $$ insert into public.workspaces (client_name, tier) values ('x', 'launch') $$,
  '42501', null, 'outsider cannot insert workspaces'
);
select throws_ok(
  $$ insert into public.transcripts (workspace_id, raw_transcript)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'forged') $$,
  '42501', null, 'outsider cannot insert transcripts'
);
select throws_ok(
  $$ insert into public.staff_members (user_id) values ('22222222-2222-4222-8222-222222222222') $$,
  '42501', null, 'outsider cannot add themselves to staff'
);

update public.workspaces set client_name = 'pwned' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
delete from public.transcripts;
select throws_ok($$ select count(*) from public.webhook_events $$, '42501', null, 'outsider cannot read webhook_events');

-- Staff ------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select is(private.is_staff(), true, 'staff member is staff');
select is((select count(*) from public.workspaces)::int, 2, 'staff sees all workspaces');
select is(
  (select client_name from public.workspaces where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'Client A', 'outsider update did not change workspace A'
);
select is((select count(*) from public.transcripts)::int, 1, 'outsider delete did not remove transcripts');
select is((select count(*) from public.call_sessions)::int, 1, 'staff sees call sessions');
select lives_ok(
  $$ insert into public.workspaces (client_name, tier) values ('Client C', 'scale') $$,
  'staff can create workspaces'
);
select lives_ok(
  $$ update public.workspaces set status = 'completed' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  'staff can update workspaces'
);
select is((select count(*) from public.staff_members)::int, 1, 'staff sees only their own staff row');
select throws_ok(
  $$ insert into public.staff_members (user_id) values ('22222222-2222-4222-8222-222222222222') $$,
  '42501', null, 'staff cannot grant staff membership through the API'
);
select throws_ok($$ select count(*) from public.webhook_events $$, '42501', null, 'staff cannot read webhook_events');

-- Service role (webhooks) ------------------------------------------------------
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is((select count(*) from public.webhook_events)::int, 1, 'service role can use webhook_events');

select * from finish();
rollback;
