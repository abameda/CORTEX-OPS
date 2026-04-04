<p align="center">
  <img src="./cortex-logo-primary.svg" alt="Cortex" width="300" />
</p>

<h1 align="center">CORTEX-ops</h1>

<p align="center">
  Internal command surface for Cortex client delivery.
</p>

<p align="center">
  <strong>Your brand, engineered.</strong><br />
  Cortex operates while you sleep.
</p>

---

## Overview

CORTEX-ops is the internal operations dashboard for Cortex, Egypt's first autonomous AI solutions agency. It is not the public website. It is the system used to run client work from intake to delivery.

The product is built around a simple rule: one client, one workspace, one controlled pipeline. Discovery notes come in, prompts are generated, external AI output comes back, and the workspace advances stage by stage until delivery is complete.

This repo follows the Cortex brand identity directly:

- dark and premium
- precise over decorative
- chartreuse as signal, not wallpaper
- direct language, no filler
- autonomous systems as the core product story

## Brand Frame

| Element | Value |
| --- | --- |
| Company | Cortex |
| Positioning | Egypt's first autonomous AI solutions agency |
| Tone | Direct, confident, honest, forward-looking |
| Tagline | Your brand, engineered. |
| Environment | Black-first interface with chartreuse signal states |
| Body font | Inter |
| Display font | Space Grotesk |

### Signal Palette

| Token | Hex | Use |
| --- | --- | --- |
| Base | `#000000` | app background |
| Surface | `#0A0A0A` | cards and panels |
| Elevated | `#141414` | hierarchy and depth |
| Border | `#1A1A1A` | framing and separation |
| Accent Deep | `#7A9900` | restrained emphasis |
| Accent Primary | `#C8FF00` | CTA and active signal |
| Accent Light | `#E8FF80` | secondary signal text |
| Text Primary | `#FFFFFF` | main content |
| Text Secondary | `#888888` | supporting content |
| Text Muted | `#555555` | low-priority support |

## What This Website Does

The dashboard manages client delivery through a workspace pipeline.

- The home screen lists all workspaces and their current stage.
- Operators create workspaces manually with client name, business name, tier, and currency.
- Each workspace has a dedicated detail view with stage controls.
- Stage 1 captures the discovery transcript.
- Stages 2, 3, 4, and 6 generate pre-filled prompts for external AI use.
- Operators paste the model output back into the app and save it.
- The app records the output, marks the stage complete, and unlocks the next valid stage.
- Stage 5 is a manual delivery checkpoint.
- Workspaces can be marked `active`, `completed`, or `archived`.

## Operator Workflow

This is the actual operating model implemented in the codebase:

1. Create a workspace.
2. Open the workspace detail page.
3. Paste the discovery transcript into Stage 1.
4. Save the transcript to unlock Stage 2.
5. Generate the next prompt.
6. Copy the prompt into Claude or another external model.
7. Paste the output back into CORTEX-ops.
8. Save and advance.
9. Repeat until delivery is complete.
10. For `scale` workspaces, continue into ongoing management after delivery.

The system is intentionally manual at the operator layer and automated at the state-management layer. That keeps v1 reliable while preserving the Cortex workflow.

## Pipeline

### Stage 1: Discovery Call

- Input: discovery call transcript or manual notes
- Stored in: `transcripts`
- Result: Stage 1 is completed and Stage 2 is unlocked

### Stage 2: Brand Strategy Analysis

- Input: latest transcript
- Output: structured brand strategy document
- Prompt file: [`src/lib/prompts/stage2-strategy.ts`](src/lib/prompts/stage2-strategy.ts)

### Stage 3: Brand Package Generation

Stage 3 is intentionally split into two outputs:

- `brand_system`
- `guidelines`

The brand-system prompt is generated first. The guidelines prompt is generated second. Stage 3 is only complete when both outputs exist and are saved as completed.

### Stage 4: Website Build

- available for: `build` and `scale`
- input: completed strategy and brand system
- output: deploy-ready website build prompt
- prompt file: [`src/lib/prompts/stage4-website.ts`](src/lib/prompts/stage4-website.ts)

### Stage 5: Package and Deliver

- v1 behavior: manual handoff confirmation
- optional notes can be saved with the delivery record
- marks delivery without ZIP or email automation

### Stage 6: Ongoing Management

- available for: `scale` only
- output: monthly content and ad-support prompt
- follows the same generate, paste, save model as earlier AI-assisted stages

## Tier Logic

| Tier | Included stages |
| --- | --- |
| `launch` | 1, 2, 3, 5 |
| `build` | 1, 2, 3, 4, 5 |
| `scale` | 1, 2, 3, 4, 5, 6 |

The pipeline engine only shows relevant stages for the selected tier and advances to the next valid stage automatically.

## Product Behavior

- The interface is intentionally dark, quiet, and premium.
- Chartreuse is used only for action, completion, and active-state signals.
- Supabase-backed screens fall back to local preview behavior when configuration is missing.
- Middleware protects the app and redirects unauthenticated users to `/login`.
- Authentication uses Supabase email/password.

## Stack

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Supabase SSR helpers
- Supabase Postgres
- Supabase Auth

## System Layout

```text
cortex-ops/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── workspace/
│   │   ├── login/
│   │   ├── workspace/[id]/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   ├── lib/
│   │   ├── prompts/
│   │   ├── pipeline.ts
│   │   ├── supabase.ts
│   │   ├── supabase-config.ts
│   │   └── supabase-server.ts
│   └── types/
├── public/
├── supabase/schema.sql
├── middleware.ts
└── README.md
```

## Database Model

The schema lives in [`supabase/schema.sql`](supabase/schema.sql).

### Tables

- `workspaces`: one record per client project
- `stage_outputs`: output per stage or sub-stage
- `transcripts`: discovery transcript storage
- `assets`: storage references for future generated files

### Security Model

- Row Level Security is enabled on all tables.
- Authenticated users currently have full access.
- The implementation assumes a single-operator internal tool.

## API Surface

### `POST /api/workspace`

Creates a workspace and seeds Stage 1 as `discovery_call`.

```json
{
  "clientName": "Mona El-Sayed",
  "businessName": "Example Co",
  "tier": "build",
  "currency": "EGP"
}
```

### `PATCH /api/workspace/:id`

Updates workspace lifecycle status.

```json
{
  "status": "archived"
}
```

### `POST /api/workspace/:id/transcript`

Saves the transcript, marks Stage 1 complete, creates Stage 2 if needed, and advances the workspace.

### `GET /api/workspace/:id/prompt?stage=N`

Generates the prompt for a requested stage using the latest transcript and previously completed outputs.

### `POST /api/workspace/:id/output`

Saves operator output for a stage and advances the workspace when progression rules are met.

## Prompt Engine

Prompt orchestration lives in [`src/lib/prompts/index.ts`](src/lib/prompts/index.ts).

- Stage 2 uses transcript input to create the strategy prompt.
- Stage 3 handles brand system and guidelines as separate saved outputs.
- Stage 4 composes a website build prompt from strategy and brand data.
- Stage 6 generates ongoing content and ad-support direction.

The prompt layer is separated cleanly from route handlers so workflow logic stays readable and maintainable.

## System Prompts

The app does not call a model directly in v1. It generates structured operator prompts that are copied into Claude or another external model. Those prompts are part of the system design and are implemented in code.

### Prompt Router

[`src/lib/prompts/index.ts`](src/lib/prompts/index.ts) decides which prompt to generate based on:

- current workspace
- requested stage
- latest transcript
- previously completed stage outputs
- Stage 3 sub-stage completion state

### Stage 2 Prompt: Brand Strategy

File: [`src/lib/prompts/stage2-strategy.ts`](src/lib/prompts/stage2-strategy.ts)

This prompt tells the model:

- who it is: a senior brand strategist at Cortex
- what to analyze: the full discovery transcript
- what to return: a comprehensive brand strategy document

The output structure requested by the prompt includes:

- client profile
- brand positioning
- visual direction
- digital strategy
- deliverables checklist

The prompt injects these workspace values directly:

- client name
- business name
- tier
- currency
- raw transcript text

### Stage 3 Prompt A: Brand System

File: [`src/lib/prompts/stage3-brand.ts`](src/lib/prompts/stage3-brand.ts)

The first Stage 3 prompt tells the model it is a Cortex brand designer and asks it to generate a complete brand system from the completed strategy output.

The requested output includes:

- color system
- typography
- brand voice guidelines
- logo brief
- social media kit specs

This prompt injects:

- client name
- business name
- tier
- full Stage 2 strategy output

### Stage 3 Prompt B: Brand Guidelines

File: [`src/lib/prompts/stage3-brand.ts`](src/lib/prompts/stage3-brand.ts)

After the brand system is saved, the second Stage 3 prompt generates the full brand guidelines document.

The requested document includes:

- brand overview
- logo system
- color system
- typography
- brand voice
- digital applications
- quick reference table

This prompt injects:

- client name
- business name
- full strategy output
- full brand-system output

### Stage 4 Prompt: Website Build

File: [`src/lib/prompts/stage4-website.ts`](src/lib/prompts/stage4-website.ts)

This prompt tells the model to build a professional website for the workspace using:

- Next.js 15.5.x
- Tailwind CSS v4
- Motion
- responsive, SEO-ready structure
- deploy-ready Vercel output

It injects:

- the completed brand system
- the completed strategy output
- the business or client name

The prompt also specifies:

- required pages
- design rules
- performance expectations
- asset placement expectations
- final output expectation: complete working codebase

### Stage 6 Prompt: Ongoing Management

File: [`src/lib/prompts/index.ts`](src/lib/prompts/index.ts)

This inline prompt generates ongoing monthly support materials for `scale` workspaces.

It asks for:

- 30 days of content
- platform-by-platform post details
- captions
- visual directions
- hashtags
- posting times
- content pillars
- 3 Meta ad creative concepts

### Prompt Flow Summary

1. Stage 1 saves the transcript.
2. Stage 2 prompt uses that transcript to generate strategy.
3. Stage 3 prompt uses the strategy to generate the brand system.
4. Stage 3 guidelines prompt uses both strategy and brand system.
5. Stage 4 prompt uses strategy and brand system to generate the website build brief.
6. Stage 6 prompt uses the established brand context for ongoing content operations.

## Stage Progression Rules

Pipeline logic lives in [`src/lib/pipeline.ts`](src/lib/pipeline.ts).

- only stages relevant to the tier are shown
- `getNextRelevantStage()` skips inapplicable stages
- Stage 3 requires both `brand_system` and `guidelines`
- saving the first Stage 3 output seeds the second Stage 3 record
- Stage 5 completes the workspace for `launch` and `build`
- Stage 5 keeps `scale` active so Stage 6 can continue

## Authentication

Authentication is enforced through [`middleware.ts`](middleware.ts).

- `/login` is public
- protected routes redirect to `/login`
- session state is read server-side through Supabase SSR cookie handling

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Add environment variables

```bash
cp .env.local.example .env.local
```

Required values:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

The current implementation depends directly on the public URL and anon key. The service role key is included for future operational work.

### 3. Create the database schema

Run the SQL in [`supabase/schema.sql`](supabase/schema.sql) inside Supabase.

### 4. Run the app

```bash
npm run dev
```

Open `http://localhost:3000`.

### 5. Build for production

```bash
npm run build
```

## Key Files

- [`src/app/page.tsx`](src/app/page.tsx): dashboard home
- [`src/app/workspace/[id]/page.tsx`](src/app/workspace/[id]/page.tsx): workspace detail screen
- [`src/components/PipelineView.tsx`](src/components/PipelineView.tsx): stage orchestration UI
- [`src/components/TranscriptUploader.tsx`](src/components/TranscriptUploader.tsx): Stage 1 intake
- [`src/components/DeliveryManager.tsx`](src/components/DeliveryManager.tsx): Stage 5 handoff confirmation
- [`src/components/WorkspaceStatusManager.tsx`](src/components/WorkspaceStatusManager.tsx): lifecycle controls
- [`src/app/api/workspace/[id]/output/route.ts`](src/app/api/workspace/[id]/output/route.ts): save-and-advance logic

## Current Scope

This repo contains planning documents for a larger roadmap. The implemented app currently favors a controlled manual workflow over automation-heavy integrations.

Not yet implemented:

- Cal.com webhook intake
- ElevenLabs webhook ingestion
- Supabase storage bucket workflows
- automated ZIP packaging
- automated delivery email
- direct Anthropic execution mode
- multi-user team workflows

## Reference Docs

- [`cortex-brand-identity.docx`](cortex-brand-identity.docx): source brand identity
- [`cortex-ops-plan.md`](cortex-ops-plan.md): phased implementation plan
- [`cortex-ops-dashboard-build.md`](cortex-ops-dashboard-build.md): source product specification
- [`supabase/schema.sql`](supabase/schema.sql): database schema

## Deployment

The repo is structured for Vercel deployment.

- add the same environment variables in Vercel
- connect the project to the GitHub repo
- create the Supabase schema before first use
- build command: `npm run build`
- start command: `npm run start`

## Build Status

The current codebase builds successfully with:

```bash
npm run build
```
