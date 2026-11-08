# Phase 0 security hardening: findings, deployment, and rollback

**Branch:** `security/phase-0-hardening` in two repos:
- `abameda/CORTEX-OPS`: this document lives here.
- `abameda/CORTEX`: the marketing site's `/call` page.

**Audited baselines:**
- CORTEX-OPS: commit `a1ccb50`. This is the commit deployed to production at `cortex-ops.vercel.app` (Vercel deployment `dpl_5Y9kC2fhnQ619MHGUm4w1kg451ay`).
- CORTEX: commit `cfba0d1`, deployed at `cortex-pi-sable.vercel.app`.

**Date:** 2026-11-08.

**Scope:** this change hardens what exists today. It deliberately does not include the monorepo, the schema redesign, or the broader architecture work.

---

## 1. Findings

Each finding is labelled with one of three statuses:
- **Confirmed (code):** reproduced against the code, or shown by a failing test.
- **Confirmed (live):** observed on the deployed app, using read-only requests only.
- **Suspected:** cannot be verified without dashboard access.

| # | Severity | Finding | Evidence | Status |
|---|---|---|---|---|
| F1 | Critical | **Auth middleware never ran.** The app lives in `src/app`, but `middleware.ts` sat at the repository root. Next.js only loads middleware placed next to the `app` directory, so every page and API route was served without an auth check. | `middleware.ts:5-69` @ `a1ccb50`. The `next build` route table had no `ƒ Middleware` entry; after moving the file to `src/` it shows `ƒ Middleware 86.4 kB`. Live: an anonymous `GET /` returned 200 with "Signed in as: Unknown user". An anonymous `GET /api/workspace/<uuid>/prompt` reached the handler and returned its 404 rather than a 401. | **Confirmed (code + live)** |
| F2 | Critical | **Any signed-in user had full read and write access to every table.** The policy is `FOR ALL USING (auth.role() = 'authenticated')`. With email sign-up enabled, anyone could create an account using the public anon key and then read or modify every transcript. | `supabase/schema.sql:52-62` @ `a1ccb50`. The new pgTAP suite **fails 20 of 26 checks** against the old policies: a non-staff user could rename workspace A and delete all transcripts. | **Confirmed (code)**. Whether sign-up is enabled in production is **Suspected** (see §4). |
| F3 | Critical | **The transcript endpoint wrote with the service-role key and had no authorization check.** Together with F1, any anonymous caller could write a transcript to any workspace and advance its pipeline stage. | `src/app/api/workspace/[id]/transcript/route.ts:31` @ `a1ccb50` | **Confirmed (code)**. Not exploited live in this review: no write tests were run against production. |
| F4 | High | **Cal.com webhook trusted a booking-controlled `metadata.workspace_id`.** The webhook overwrote `client_name`, `tier` and `currency` on that workspace using the service role. | `src/app/api/webhooks/cal/route.ts:158,176-182` @ `a1ccb50`. Booking metadata is set by whoever opens the public booking page; this is per Cal.com's documented URL metadata and was not re-tested here. | **Confirmed (code)**. Exploitability through Cal.com is **Suspected**. |
| F5 | High | **The ElevenLabs webhook bound transcripts to a client-supplied `workspace_id` or `cal_booking_id`.** Both are dynamic variables set by the browser that starts the call. | `src/app/api/webhooks/elevenlabs/route.ts:126-150` @ `a1ccb50` | **Confirmed (code)** |
| F6 | High | **Anyone could start calls with the public ElevenLabs agent and spend credit.** The site hard-coded a public agent ID and placed no gate in front of `/call`. | CORTEX `app/call/page.tsx:63` @ `cfba0d1` | **Confirmed (code)**. Whether the agent still accepts unauthenticated sessions is **Suspected** (dashboard). |
| F7 | Medium | **Cal.com webhook could be replayed.** It verifies a signature but has no timestamp check and no idempotency, so a captured delivery could be re-sent indefinitely. | `src/app/api/webhooks/cal/route.ts:124` @ `a1ccb50` | **Confirmed (code)** |
| F8 | Medium | **Raw database error messages were returned to callers.** | e.g. `src/app/api/workspace/route.ts:77` @ `a1ccb50` | **Confirmed (code)** |
| F9 | Critical | **Next.js 15.5.14 (Ops) has 25 open advisories.** They include middleware/proxy bypasses (GHSA-267c-6grr-h53f, GHSA-492v-c6pp-mqqv, GHSA-26hh-7cqf-hhc6) and unauthenticated remote code execution (GHSA-2464-fhr4-w9xw, GHSA-2xp9-vwfh-vxw4, GHSA-p293-qw3h-jr36). | GitHub Advisory Database query for `next@15.5.14`, 2026-11-08 | **Confirmed** |
| F10 | Critical | **Next.js 16.2.2 (site) has open critical advisories,** including remote code execution: GHSA-673q-mjm6-r5xr, GHSA-2464-fhr4-w9xw, GHSA-vcvr-r3jv-pc5j, GHSA-p293-qw3h-jr36. | GitHub Advisory Database query for `next@16.2.2`, 2026-11-08 | **Confirmed** |

### Live exposure today

The Supabase project referenced by the deployed Ops bundle, `ddzhrcalttpiowhkgiuu`, **does not resolve in DNS**: Google DNS returns NXDOMAIN. It is most likely paused or deleted. Its consequences:
- The live dashboard is reachable, but no data can currently be read or written through it.
- **If that project is restored, F1–F5 become exploitable immediately.**
- Do not restore or un-pause it until the steps in §3 are in place.

### Accounts, sessions and keys

- **Committed secrets.** The full git history of both repos contains only placeholder values (`.env.local.example`). No committed secrets were found.
- **Exposed keys.** The deployed bundle exposes only the anon key, which is public by design. I saw no evidence that the service-role key or the webhook secrets were exposed.
- **Rotation is therefore a precaution, not a proven necessity.** It is still recommended before data flows again, because sign-up was probably open with permissive RLS, which means unknown accounts may exist. See §3 step 2.
- **Vercel environment variables could not be listed.** The API returned 403, so their contents are unverified.

---

## 2. What this change does

**Next.js and dependencies**
- **Ops:** `next` 15.5.14 → **15.5.29**. This is a patch within 15.5; 15.5.29 is the current backport line and has no open advisories.
- **Ops transitive dependencies:** fixed with `npm audit fix`. `postcss` inside Next is pinned to `^8.5.32` through `overrides`.
- **Ops `npm audit --omit=dev`: 0 vulnerabilities.**
- **Site:** `next` and `eslint-config-next` 16.2.2 → **16.4.5**, a minor update within 16 with no open advisories.
- **Site production dependencies: 0 vulnerabilities.** Eight moderate advisories remain in the ESLint dev toolchain (`minimatch`). They are not shipped. Fixing them requires a breaking `eslint-config-next` downgrade, so they are left as is.

**Authentication and authorization**
- `middleware.ts` moved to `src/middleware.ts` and migrated to the `getAll`/`setAll` cookie API. When Supabase is not configured it fails closed in production with a 503.
- Every page and API route checks for itself that the request has a verified user (`auth.getUser()`) **and** that the user is in `public.staff_members` (`src/lib/auth.ts`). Anonymous requests get 401. Signed-in non-staff requests get 403, or `/not-authorized` for pages.
- Routes use the signed-in user's own Supabase client, so RLS applies a second time.
- The service-role client is used only by the two signature-verified webhooks and by the token-gated `/api/call/start`.
- IDs are validated as UUIDs, inputs are validated, and 500 responses are generic. Details are logged server-side only.

**Database** (migration `supabase/migrations/20261108000000_phase0_security.sql`)
- `public.staff_members` allowlist, plus `private.is_staff()`, a `SECURITY DEFINER` function in a schema the API does not expose.
- The `"Authenticated access"` policies are replaced with `staff_all` policies on `workspaces`, `stage_outputs`, `transcripts`, `assets` and `call_sessions`.
- All grants are revoked from the `anon` role on those tables.
- Staff cannot add staff through the API; membership is managed only with SQL.
- New `workspaces.cal_booking_uid` column with a unique partial index, backfilled from the existing stage-1 `input_data.cal_booking_id`.
- New `webhook_events` table (accessible to the service role only) for idempotency and replay protection.
- New `call_sessions` table holding single-use, time-boxed call tokens. Only their SHA-256 hash is stored.
- The original schema moved unchanged to `supabase/migrations/20260404000000_initial_schema.sql` (see §3 step 3).

**Webhooks**
- **Cal.com**
  - Keeps HMAC verification.
  - Rejects signed deliveries whose `createdAt` is older than 24 hours (configurable through `CAL_WEBHOOK_MAX_AGE_SECONDS`), or more than 5 minutes in the future.
  - Records each delivery by body hash, so an exact replay is a no-op.
  - Binds the booking **only** by Cal.com's own booking `uid`; `metadata.workspace_id` is ignored.
  - Never overwrites staff-managed fields on an existing workspace.
- **ElevenLabs**
  - Keeps HMAC and the 5-minute timestamp tolerance.
  - Is idempotent per `conversation_id`.
  - Binds a transcript **only** to a `call_session_id` that was issued server-side and that `/api/call/start` moved to `started`. Each session accepts one conversation.
  - The old `workspace_id` and `cal_booking_id` dynamic variables are ignored.

**Voice access and spending**
- Staff create a single-use call link per workspace from the workspace page ("Create call link"). The link is valid for 72 hours by default and allows a 35-minute call by default.
- The token travels in the URL fragment (`#t=`), so it never reaches a server or a `Referer` header.
- The site's `/call` page exchanges the token through `POST /api/call/start`. That endpoint has a CORS allowlist, consumes the token atomically, and requests a short-lived **ElevenLabs conversation token for a private agent**. The ElevenLabs API key never reaches the browser.
- A token can start exactly one call.
- The page ends the session client-side at the duration limit. The authoritative limit is the agent setting (§4).

---

## 3. Deployment sequence

Run the steps in this order. Steps marked **[you]** need dashboard access I do not have.

1. **[you] Supabase:**
   - Confirm whether project `ddzhrcalttpiowhkgiuu` is paused, deleted, or replaced by another project.
   - **Do not restore it yet.** If you plan to use a fresh project instead, steps 2–4 apply to that project.
2. **[you] Supabase → Authentication → Providers / Sign In:**
   - Turn **off** "Allow new users to sign up".
   - Then go to **Authentication → Users**. Review every account, delete any you do not recognise, and sign out all sessions ("Sign out user" on each).
   - Recommended once restored: rotate the keys. Create new **publishable** and **secret** API keys, which replace the legacy anon and service-role keys deprecated at the end of 2026, then disable the legacy JWT-based keys.
3. **[you] Apply the migration.**
   - **Existing project:** run `supabase/migrations/20261108000000_phase0_security.sql` in the SQL editor. It is idempotent and keeps all data.
   - **If you will use the Supabase CLI against this project:** first mark the baseline as already applied with `supabase migration repair --status applied 20260404000000`.
   - **New project:** `supabase db push` applies both migrations.
4. **[you] Grant staff access.** Without this step, nobody (including you) can see any data after the migration:
   ```sql
   insert into public.staff_members (user_id, role)
   select id, 'owner' from auth.users where email = 'YOUR_EMAIL'
   on conflict (user_id) do nothing;
   ```
5. **[you] Vercel → cortex-ops → Environment Variables (Production):**
   - Keep the existing variables. If you rotated keys in step 2, update `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` with the new values.
   - Add `CALL_PAGE_URL=https://cortex-pi-sable.vercel.app/call`.
   - Add `CALL_ALLOWED_ORIGINS=https://cortex-pi-sable.vercel.app`.
   - Optional: `CAL_WEBHOOK_MAX_AGE_SECONDS`.
6. **[you] ElevenLabs → Agent → Security:**
   - **Enable authentication** (private agent) so the old public agent ID stops working.
   - Set the **maximum call duration** (about 35 minutes).
   - Set a **concurrency limit**.
   - Set a usage or spend alert.
   - Confirm the post-call webhook still points at `https://cortex-ops.vercel.app/api/webhooks/elevenlabs`.
7. **Deploy CORTEX-OPS** from this branch (merge the PR). Then smoke-test:
   - An anonymous `GET /` must redirect to `/login`.
   - Your account must load the dashboard.
   - "Create call link" must return a link.
   - In Vercel → the deployment → **Functions**, confirm `/api/webhooks/cal` and `/api/webhooks/elevenlabs` show a max duration of **60s**. The routes export `maxDuration = 60`. The webhook claim lease (5 minutes, `src/lib/webhook-security.ts`) is safe only while that limit stays well below it, so recheck after any plan or project setting change.
8. **[you] Vercel → cortex → Environment Variables:** add `NEXT_PUBLIC_OPS_URL=https://cortex-ops.vercel.app`. It is inlined at build time, so set it **before** deploying.
9. **Deploy CORTEX (site)** from its branch. Open a fresh call link and confirm the call connects.
10. Only now restore or connect the Supabase project, if it was paused.

**[you] Optional extras**
- A Vercel Firewall rate-limit rule on `/api/call/start` and `/api/webhooks/*`.
- MFA for staff accounts (Supabase TOTP is free). The code does not require `aal2` yet, to avoid locking you out.

---

## 4. Dashboard actions I could not perform

| Action | Why it matters |
|---|---|
| Check whether Supabase sign-up is enabled, and disable it | F2 is exploitable only while sign-up is open |
| Review existing Supabase users and sessions | Detect accounts created through open sign-up |
| Rotate the Supabase keys | Precaution before data flows again |
| Apply the migration and add staff rows | Required before the new code can show data |
| Set the Vercel environment variables (both projects) | Required for call links and for the site to reach Ops |
| Make the ElevenLabs agent private; set the duration, concurrency and spend limits | F6 is fully closed only when the public agent ID stops working |
| Check the Vercel environment variable contents | The API returned 403 to me |

---

## 5. Rollback

**Preferred: application only.** Use Vercel → cortex-ops → Deployments → promote the previous production deployment (`dpl_5Y9kC2fhnQ619MHGUm4w1kg451ay`). Do the same for the site.
- The pre-Phase-0 code still works on top of the new schema for any user listed in `staff_members`, so the database does not need reverting.
- Reverting the app re-opens F1, F3–F8, but RLS still blocks non-staff accounts.

**Database (emergency only).** Run `supabase/rollback/20261108000000_phase0_security_down.sql`.
- It **restores the insecure policies**. Only run it with sign-up disabled.
- It drops `call_sessions`, `webhook_events` and `staff_members`. These hold operational data only, no client content.
- It keeps `cal_booking_uid`.

**Tested locally:**
- Migration → rollback → migration, with every step succeeding.
- Migration re-run twice: idempotent.
- Migration on a populated database: workspace, stage and transcript counts unchanged, and the backfill applied without unique-index conflicts.

---

## 6. Running the tests

Requires Docker and Node 20+. Everything runs against a **local** Supabase stack with throwaway secrets. The test script refuses to run against a non-local URL.

```bash
bash tests/security/run-local.sh
```

| Suite | Count | Covers |
|---|---|---|
| pgTAP `supabase/tests/phase0_rls.test.sql` | 26 | anon, signed-in non-staff, staff and service-role access on every table, including self-granting staff |
| HTTP `tests/security/phase0.test.mjs` | 18 | see below |

The HTTP suite covers:
- Sign-up disabled.
- Anonymous redirects and 401s.
- Non-staff 403s, with no data rendered.
- Non-staff PostgREST access.
- The full legitimate staff flow: create workspace → transcript → prompt → output → status.
- Input validation without leaking internals.
- Forged, stale and replayed Cal.com deliveries.
- A Cal.com `workspace_id` injection attempt (cross-project).
- Reschedule binding.
- Call-link single use, expiry, CORS, and provider-failure retry.
- Forged and expired ElevenLabs signatures.
- Injected `workspace_id` and unknown sessions.
- Transcripts landing only in the session's own workspace.
- ElevenLabs replay.
- A second conversation on the same session.

**Result on 2026-11-08: 26/26 and 18/18 passing.** The pgTAP suite was also run against the old policies, where 20 checks failed. That confirms the tests detect the original vulnerability.

**Not covered by automated tests**
- A real ElevenLabs call. The token endpoint is mocked: `GET /v1/convai/conversation/token` is the endpoint the official `@elevenlabs/client` SDK uses, but the private-agent response was not exercised against the live API.
- The site's `/call` page UI. It was type-checked, linted and built, but not driven in a browser.
