# Cortex Ops Dashboard — Build Plan

> **Source spec:** `~/Downloads/cortex-ops-dashboard-build.md`
> **Status:** Phase 1 — not started
> **Next.js version:** 15.5.x (latest stable 15 — native Tailwind v4 support, async params/cookies)
> **Deploy target:** Vercel
> **Database:** Supabase (free tier — provide keys before Phase 2)

---

## Decision Log

| # | Decision | Alternatives considered | Why |
|---|----------|------------------------|-----|
| 1 | Next.js 15.5.x (not 14 or 16) | 14.2.x (spec default), 16.2.x (latest) | 15 has native Tailwind v4 integration, stable async params/cookies. 16 has breaking changes beyond what we need. 14 requires manual PostCSS setup for Tailwind v4. |
| 2 | Skip webhooks for v1 | Build Cal.com + ElevenLabs webhooks | Core value is prompt orchestration. Manual workspace creation + transcript paste covers the flow. Webhooks add fragile matching logic. |
| 3 | Skip storage buckets for v1 | Create brand-assets, transcripts, deliverables buckets | All data is text in Postgres. No file upload/download needed yet. |
| 4 | Skip ZIP/email delivery for v1 | Build delivery.ts + DeliveryManager.tsx | Stage 5 = manual mark-as-complete. Automation later. |
| 5 | Single transcript save endpoint | Reuse webhook handler (spec's TranscriptUploader) | Spec's approach double-saves and double-advances. Dedicated endpoint is cleaner. |
| 6 | Stage 3 auto-advancement | Leave manual | After both brand_system + guidelines are saved, auto-advance to Stage 4. |
| 7 | Drop stage3-social.ts | Keep as separate sub-stage | Social media kit specs are already part of brand package prompt output. No separate step needed. |

---

## Phase 1 — Foundation

**Goal:** Empty Next.js app with Cortex theme, types, and Supabase client stubs. Runs locally.

**Tasks:**
- [ ] 1.1 — Scaffold: `npx create-next-app@15 cortex-ops` (TypeScript, Tailwind, App Router, src dir)
- [ ] 1.2 — Tailwind v4 globals.css: `@import "tailwindcss"` + `@theme` block with all Cortex design tokens (colors, fonts)
- [ ] 1.3 — Google Fonts: Import Inter + Space Grotesk in `layout.tsx`
- [ ] 1.4 — Root layout: dark theme shell, `font-body` base, minimal header with "Cortex Ops" title
- [ ] 1.5 — Type definitions: `src/types/index.ts` — all types + `PIPELINE_STAGES` constant
- [ ] 1.6 — Supabase clients: `src/lib/supabase.ts` (browser) + `src/lib/supabase-server.ts` (server) — using `@supabase/ssr` with Next.js 15 async cookies
- [ ] 1.7 — `.env.local.example` with all required env var placeholders
- [ ] 1.8 — Verify: `npm run dev` works, dark theme renders, fonts load

**Dependencies:** None — no Supabase keys needed yet (clients are stubs until Phase 2).

**What to read before starting:** The Tailwind v4 theme tokens section and TypeScript types section from the spec.

---

## Phase 2 — Database + Auth

**Goal:** Supabase connected, tables created, auth working (login page + middleware).

**Prereq:** You provide Supabase project URL + anon key + service role key.

**Tasks:**
- [ ] 2.1 — SQL schema: provide the full CREATE TABLE + RLS SQL for you to run in Supabase dashboard
- [ ] 2.2 — Wire `.env.local` with real Supabase keys
- [ ] 2.3 — Login page: `src/app/login/page.tsx` — simple email/password form using Supabase auth
- [ ] 2.4 — Auth middleware: `middleware.ts` at project root — redirect unauthenticated users to `/login`, exclude `/login` and `/api/webhooks/*` from protection
- [ ] 2.5 — Verify: sign in, see empty dashboard, sign out redirects to login

**What to read before starting:** Auth setup and RLS sections from the spec.

---

## Phase 3 — Core Logic (Prompts + API)

**Goal:** Prompt templates generate correctly. API routes create workspaces, generate prompts, save outputs, save transcripts. Pipeline stage progression works end-to-end in the API layer.

**Tasks:**
- [ ] 3.1 — Prompt templates: `src/lib/prompts/stage2-strategy.ts`, `stage3-brand.ts` (includes guidelines), `stage4-website.ts`
- [ ] 3.2 — Prompt orchestrator: `src/lib/prompts/index.ts` — stage routing + Stage 3 sub-stage logic + Stage 6 inline prompt
- [ ] 3.3 — Pipeline logic: `src/lib/pipeline.ts` — stage advancement helper with Stage 3 auto-advance fix
- [ ] 3.4 — API: `POST /api/workspace` — create workspace
- [ ] 3.5 — API: `GET /api/workspace/[id]/prompt?stage=N` — generate prompt for a stage (async params)
- [ ] 3.6 — API: `POST /api/workspace/[id]/output` — save stage output + advance (with Stage 3 fix)
- [ ] 3.7 — API: `POST /api/workspace/[id]/transcript` — dedicated transcript save (replaces the broken double-save pattern)
- [ ] 3.8 — Verify: use curl/Postman to create workspace → save transcript → generate Stage 2 prompt → save output → see Stage 3 unlock

**What to read before starting:** Prompt templates, API routes, and pipeline logic sections from the spec. Apply async params pattern for Next.js 15 route handlers.

---

## Phase 4 — UI

**Goal:** Full working dashboard UI. Create workspace → paste transcript → generate prompt → copy → paste output back → advance through all stages.

**Tasks:**
- [ ] 4.1 — Dashboard home: `src/app/page.tsx` — workspace list (server component) + "New Workspace" button
- [ ] 4.2 — `WorkspaceCard.tsx` — card showing client name, tier badge, current stage, status
- [ ] 4.3 — `NewWorkspaceModal.tsx` — form: client name, business name (optional), tier select, currency select
- [ ] 4.4 — Workspace detail page: `src/app/workspace/[id]/page.tsx` — fetch workspace + stage outputs, render pipeline
- [ ] 4.5 — `PipelineView.tsx` — renders stage rows, manages active stage state
- [ ] 4.6 — `StageRow.tsx` — stage name, status indicator (locked/pending/current/completed), "Generate Prompt" button
- [ ] 4.7 — `PromptViewer.tsx` — shows generated prompt + "Copy to Clipboard" button
- [ ] 4.8 — `OutputEditor.tsx` — textarea to paste Claude's response + "Save & Advance" button
- [ ] 4.9 — `TranscriptUploader.tsx` — paste transcript + save (uses the dedicated /transcript endpoint, not the webhook)
- [ ] 4.10 — Verify: full manual flow end-to-end in the browser

**What to read before starting:** UI components section from the spec. Adapt all components to use Tailwind v4 token classes (`bg-cortex-base`, `text-cortex-accent`, etc).

---

## Phase 5 — Polish + Deploy

**Goal:** App is deployed on Vercel, auth-protected, and usable for real client work.

**Tasks:**
- [ ] 5.1 — Stage 5 UI: simple "Mark as Delivered" button (no ZIP/email)
- [ ] 5.2 — Stage 6 UI: same prompt-copy-paste flow as Stages 2-4
- [ ] 5.3 — Empty states: no workspaces yet, no transcript yet, etc.
- [ ] 5.4 — Loading states: skeleton/spinner for prompt generation, workspace loading
- [ ] 5.5 — Error handling: toast or inline errors for API failures
- [ ] 5.6 — Workspace status: ability to archive/complete a workspace from the detail page
- [ ] 5.7 — Deploy: push to GitHub, connect to Vercel, set env vars
- [ ] 5.8 — Verify: full flow on production URL

**What to read before starting:** Nothing new from spec — this is fit-and-finish.

---

## How to Use This Plan

**Start each phase by saying:** "Let's do Phase N"

I'll work through the tasks in order. Each phase is scoped to fit in a single conversation without context overflow. At the end of each phase, we verify it works before moving on.

**If you need to resume in a new conversation:** just say "Continue from Phase N, task N.X" and point me at this plan file + the spec.

---

## What's Deferred to v2

- Cal.com webhook (auto-create workspace on booking)
- ElevenLabs webhook (auto-save transcript after call)
- Supabase storage buckets (brand-assets, transcripts, deliverables)
- Stage 5 automation (ZIP packaging + delivery email)
- Claude API mode toggle (direct API calls instead of copy-paste)
- Workspace search/filter on dashboard
- Multi-user support / team access
