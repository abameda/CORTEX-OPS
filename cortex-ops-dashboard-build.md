# Cortex Ops Dashboard — Full Build Document

## Project Overview

Build an internal operations dashboard for Cortex (AI branding agency). This is a **separate Next.js application** — NOT part of the public Cortex website. It's an internal tool where the founder manages client brand projects through a 6-stage pipeline.

**Core concept:** Each client project is a "brand workspace." Each workspace progresses through pipeline stages. For each stage, the dashboard generates a pre-filled prompt (with all client data injected), copies it to clipboard, and the operator pastes it into Claude chat. The output is pasted back, saved to the workspace, and the next stage unlocks.

**Tech stack:** Next.js 14+ (App Router), Tailwind CSS v4, Supabase (free tier — auth + database + storage), TypeScript.

**Design:** Dark theme matching Cortex brand — black (#000000) base, chartreuse (#C8FF00) accents, Inter font body, Space Grotesk headings. This is an internal tool so prioritize function over polish, but it should still feel premium.

---

## Database Schema (Supabase / PostgreSQL)

Create these tables in Supabase:

```sql
-- Workspaces: one per client project
CREATE TABLE workspaces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,
  business_name TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('launch', 'build', 'scale')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  current_stage INTEGER DEFAULT 1,
  currency TEXT DEFAULT 'EGP' CHECK (currency IN ('EGP', 'USD')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stage outputs: stores the result of each pipeline stage
CREATE TABLE stage_outputs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 6),
  stage_name TEXT NOT NULL,
  input_data JSONB,        -- what was fed into this stage
  output_data JSONB,       -- the result (strategy doc, brand system, etc.)
  raw_output TEXT,         -- raw text output from Claude (pasted back)
  prompt_used TEXT,        -- the exact prompt that was generated
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'needs_review')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transcripts: discovery call transcripts from ElevenLabs
CREATE TABLE transcripts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  raw_transcript TEXT NOT NULL,
  duration_seconds INTEGER,
  language TEXT DEFAULT 'en',
  extracted_data JSONB,    -- parsed data points from transcript
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assets: files generated during the pipeline
CREATE TABLE assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,  -- 'logo_svg', 'logo_png', 'guidelines_pdf', 'social_kit', etc.
  storage_path TEXT NOT NULL, -- Supabase storage path
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- Simple policy: authenticated users can do everything (single-user app)
CREATE POLICY "Authenticated access" ON workspaces FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated access" ON stage_outputs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated access" ON transcripts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated access" ON assets FOR ALL USING (auth.role() = 'authenticated');
```

**Supabase Storage Buckets:**
- `brand-assets` — logos, social media kit files, guidelines PDFs
- `transcripts` — raw transcript files
- `deliverables` — final ZIP packages for clients

---

## Project Structure

```
cortex-ops/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout (dark theme, auth check)
│   │   ├── page.tsx                # Dashboard home (workspace list)
│   │   ├── login/
│   │   │   └── page.tsx            # Simple auth page
│   │   ├── workspace/
│   │   │   └── [id]/
│   │   │       ├── page.tsx        # Workspace detail (pipeline view)
│   │   │       ├── transcript/
│   │   │       │   └── page.tsx    # View/edit transcript
│   │   │       └── stage/
│   │   │           └── [num]/
│   │   │               └── page.tsx # Stage detail (prompt + output)
│   │   └── api/
│   │       ├── webhooks/
│   │       │   ├── cal/route.ts    # Cal.com webhook handler
│   │       │   └── elevenlabs/route.ts # ElevenLabs transcript webhook
│   │       └── workspace/
│   │           ├── route.ts        # CRUD workspaces
│   │           └── [id]/
│   │               ├── prompt/route.ts   # Generate prompts for stages
│   │               └── output/route.ts   # Save stage outputs
│   ├── components/
│   │   ├── WorkspaceCard.tsx       # Card for workspace list
│   │   ├── PipelineView.tsx        # The 6-stage pipeline UI
│   │   ├── StageRow.tsx            # Individual stage row
│   │   ├── PromptViewer.tsx        # Shows generated prompt + copy button
│   │   ├── OutputEditor.tsx        # Paste output back area
│   │   ├── TranscriptViewer.tsx    # View transcript with highlights
│   │   ├── NewWorkspaceModal.tsx   # Create workspace form
│   │   └── DeliveryManager.tsx     # Stage 5 — package + send
│   ├── lib/
│   │   ├── supabase.ts             # Supabase client setup
│   │   ├── prompts/
│   │   │   ├── stage2-strategy.ts  # Brand strategy prompt template
│   │   │   ├── stage3-brand.ts     # Brand package prompt template
│   │   │   ├── stage3-guidelines.ts # Guidelines doc prompt template
│   │   │   ├── stage3-social.ts    # Social media kit prompt template
│   │   │   ├── stage4-website.ts   # Website build prompt template
│   │   │   └── index.ts            # Prompt generator orchestrator
│   │   ├── pipeline.ts             # Stage progression logic
│   │   └── delivery.ts             # ZIP packaging + email helpers
│   └── types/
│       └── index.ts                # TypeScript types
├── globals.css                     # Tailwind v4 + Cortex design tokens
├── package.json
└── .env.local                      # Supabase keys
```

---

## Environment Variables (.env.local)

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Cal.com webhook secret (for verifying webhook signatures)
CAL_WEBHOOK_SECRET=your_cal_webhook_secret

# ElevenLabs (for fetching transcripts via API)
ELEVENLABS_API_KEY=your_api_key
ELEVENLABS_AGENT_ID=agent_6901kn9bk199e2gb9ygpjtgt7kv1

# Optional: Claude API key (for future API mode)
ANTHROPIC_API_KEY=your_key_when_ready
```

---

## Tailwind CSS v4 Config (globals.css)

```css
@import "tailwindcss";

@theme {
  --color-cortex-base: #000000;
  --color-cortex-surface: #0A0A0A;
  --color-cortex-elevated: #141414;
  --color-cortex-border: #1A1A1A;
  --color-cortex-accent-deep: #7A9900;
  --color-cortex-accent: #C8FF00;
  --color-cortex-accent-light: #E8FF80;
  --color-cortex-text-primary: #FFFFFF;
  --color-cortex-text-secondary: #888888;
  --color-cortex-text-muted: #555555;
  --color-cortex-text-subtle: #333333;
  --font-display: "Space Grotesk", sans-serif;
  --font-body: "Inter", sans-serif;
}
```

---

## TypeScript Types (src/types/index.ts)

```typescript
export type Tier = 'launch' | 'build' | 'scale';
export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'needs_review';
export type WorkspaceStatus = 'active' | 'completed' | 'archived';
export type Currency = 'EGP' | 'USD';
export type ExecutionMode = 'manual' | 'api';

export interface Workspace {
  id: string;
  client_name: string;
  business_name: string | null;
  tier: Tier;
  status: WorkspaceStatus;
  current_stage: number;
  currency: Currency;
  created_at: string;
  updated_at: string;
}

export interface StageOutput {
  id: string;
  workspace_id: string;
  stage: number;
  stage_name: string;
  input_data: Record<string, any> | null;
  output_data: Record<string, any> | null;
  raw_output: string | null;
  prompt_used: string | null;
  status: StageStatus;
  completed_at: string | null;
  created_at: string;
}

export interface Transcript {
  id: string;
  workspace_id: string;
  raw_transcript: string;
  duration_seconds: number | null;
  language: string;
  extracted_data: Record<string, any> | null;
  created_at: string;
}

export interface Asset {
  id: string;
  workspace_id: string;
  stage: number;
  file_name: string;
  file_type: string;
  storage_path: string;
  created_at: string;
}

// Pipeline stage definition
export interface StageDefinition {
  number: number;
  name: string;
  description: string;
  requiredTiers: Tier[];  // which tiers include this stage
  autoGenPrompt: boolean; // can we auto-generate a prompt for this?
  requiresInput: string;  // what input does this stage need
  produces: string;       // what does this stage output
}

export const PIPELINE_STAGES: StageDefinition[] = [
  {
    number: 1,
    name: 'Discovery call',
    description: 'ElevenLabs voice agent conducts discovery session',
    requiredTiers: ['launch', 'build', 'scale'],
    autoGenPrompt: false,
    requiresInput: 'Cal.com booking',
    produces: 'Call transcript'
  },
  {
    number: 2,
    name: 'Brand strategy analysis',
    description: 'Analyze transcript → brand strategy document',
    requiredTiers: ['launch', 'build', 'scale'],
    autoGenPrompt: true,
    requiresInput: 'Transcript from Stage 1',
    produces: 'Brand strategy document'
  },
  {
    number: 3,
    name: 'Brand package generation',
    description: 'Logo, colors, typography, guidelines, social media kit',
    requiredTiers: ['launch', 'build', 'scale'],
    autoGenPrompt: true,
    requiresInput: 'Strategy from Stage 2',
    produces: 'Complete brand package'
  },
  {
    number: 4,
    name: 'Website build',
    description: 'Generate Claude Code prompt → build site → deploy',
    requiredTiers: ['build', 'scale'],
    autoGenPrompt: true,
    requiresInput: 'Strategy + brand package from Stages 2-3',
    produces: 'Live website on Vercel'
  },
  {
    number: 5,
    name: 'Package & deliver',
    description: 'ZIP assets, generate password, send delivery email',
    requiredTiers: ['launch', 'build', 'scale'],
    autoGenPrompt: false,
    requiresInput: 'All completed stage outputs',
    produces: 'Delivered brand package'
  },
  {
    number: 6,
    name: 'Ongoing management',
    description: 'Social media, ads, monthly analytics',
    requiredTiers: ['scale'],
    autoGenPrompt: true,
    requiresInput: 'Completed brand + live website',
    produces: 'Monthly content + reports'
  }
];
```

---

## Prompt Templates

These are the core of the system. Each template is a function that takes workspace data and returns a complete, ready-to-paste prompt.

### Stage 2: Brand Strategy Analysis (src/lib/prompts/stage2-strategy.ts)

```typescript
import { Workspace, Transcript } from '@/types';

export function generateStrategyPrompt(
  workspace: Workspace,
  transcript: Transcript
): string {
  return `You are a senior brand strategist at Cortex, an AI solutions agency.

I'm going to give you a discovery call transcript from a new client. Analyze the transcript and produce a comprehensive Brand Strategy Document with the following sections:

1. CLIENT PROFILE
   - Business name, industry, location, size
   - Key products/services
   - Target audience (demographics, psychographics)
   - Competitors mentioned

2. BRAND POSITIONING
   - Unique value proposition
   - Market positioning statement
   - Brand personality traits (3-5 adjectives)
   - Tone of voice direction

3. VISUAL DIRECTION
   - Recommended color palette (primary, secondary, accent) with hex codes and reasoning
   - Typography recommendations (display + body font pairing)
   - Logo direction (style, mood, concepts to explore)
   - Overall aesthetic (modern/classic, minimal/detailed, dark/light, etc.)

4. DIGITAL STRATEGY
   - Website structure recommendation (key pages, features)
   - Social media platform priority ranking
   - Content pillars (3-5 themes for ongoing content)
   - SEO keyword targets (10-15 primary keywords)

5. DELIVERABLES CHECKLIST
   - Based on their tier [${workspace.tier.toUpperCase()}], list every specific deliverable to be created
   - Include specifications for each (dimensions, formats, quantities)

Be specific and actionable. Every recommendation should be directly buildable by the next stage of our pipeline.

CLIENT: ${workspace.client_name}
BUSINESS: ${workspace.business_name || 'To be determined from transcript'}
TIER: ${workspace.tier.toUpperCase()}
CURRENCY: ${workspace.currency}

--- TRANSCRIPT START ---
${transcript.raw_transcript}
--- TRANSCRIPT END ---`;
}
```

### Stage 3: Brand Package Generation (src/lib/prompts/stage3-brand.ts)

```typescript
import { Workspace, StageOutput } from '@/types';

export function generateBrandPackagePrompt(
  workspace: Workspace,
  strategyOutput: StageOutput
): string {
  const strategy = strategyOutput.raw_output || JSON.stringify(strategyOutput.output_data);

  return `You are a brand designer at Cortex. Using the brand strategy below, generate a complete brand system.

Output the following in a structured format:

1. COLOR SYSTEM
   - Primary color + hex
   - Secondary color + hex
   - Accent color + hex
   - Background tones (3 levels: base, surface, elevated) with hex codes
   - Text hierarchy (primary, secondary, muted) with hex codes
   - Usage rules for each color

2. TYPOGRAPHY
   - Display font (for headlines) — must be a Google Font
   - Body font (for text) — must be a Google Font
   - Type scale (heading sizes, body size, caption size) in px
   - Weight usage (when to use regular, medium, bold)
   - Letter spacing rules

3. BRAND VOICE GUIDELINES
   - Voice attributes (3-5 descriptors)
   - Do's and Don'ts (5 each)
   - Example copy in brand voice:
     * Tagline
     * About section (2-3 sentences)
     * Social media bio
     * CTA button text variations

4. LOGO BRIEF
   - Style direction (geometric, organic, typographic, abstract, etc.)
   - Mood keywords (5-7 words)
   - Things to avoid
   - Recommended Midjourney/Ideogram prompt for logo generation
   - Color variants needed (primary on dark, inverse on light, monochrome)

5. SOCIAL MEDIA KIT SPECS
   - Profile photo: 400x400px — describe what it should contain
   - Facebook cover: 1640x924px
   - Instagram post template: 1080x1080px
   - Instagram story template: 1080x1920px
   - LinkedIn banner: 1584x396px
   - Twitter/X header: 1500x500px
   - For each: describe layout, text placement, color usage

CLIENT: ${workspace.client_name}
BUSINESS: ${workspace.business_name || 'See strategy document'}
TIER: ${workspace.tier.toUpperCase()}

--- BRAND STRATEGY ---
${strategy}
--- END STRATEGY ---`;
}

export function generateGuidelinesPrompt(
  workspace: Workspace,
  strategyOutput: StageOutput,
  brandOutput: StageOutput
): string {
  const strategy = strategyOutput.raw_output || JSON.stringify(strategyOutput.output_data);
  const brand = brandOutput.raw_output || JSON.stringify(brandOutput.output_data);

  return `You are a brand designer at Cortex. Create a complete Brand Guidelines Document for ${workspace.client_name}.

This should be a professional, comprehensive document similar to what a top agency would deliver. Structure it exactly like this:

1. BRAND OVERVIEW
   - Who they are (2-3 paragraphs)
   - Brand personality (core attributes)
   - Mission/vision statement

2. LOGO SYSTEM
   - Logo versions (primary, icon only, wordmark only)
   - Color applications (primary treatment, inverse, alternate)
   - Clear space rules
   - Minimum sizes (digital + print)
   - Logo misuse examples (what NOT to do)

3. COLOR SYSTEM
   - Full color palette with hex codes, RGB, and CMYK
   - Usage rules and ratios
   - Background tones
   - Text hierarchy

4. TYPOGRAPHY
   - Complete type system with specimens
   - Type scale table
   - Usage examples

5. BRAND VOICE
   - Voice principles
   - Tagline and alternates
   - Writing examples

6. DIGITAL APPLICATIONS
   - Website guidelines
   - Social media guidelines
   - Email guidelines

7. QUICK REFERENCE TABLE
   - All key brand info in one table

Write the FULL document content — not an outline. This will be converted directly to a brand guidelines PDF.

--- BRAND STRATEGY ---
${strategy}
--- END STRATEGY ---

--- BRAND SYSTEM ---
${brand}
--- END BRAND SYSTEM ---`;
}
```

### Stage 4: Website Build (src/lib/prompts/stage4-website.ts)

```typescript
import { Workspace, StageOutput } from '@/types';

export function generateWebsitePrompt(
  workspace: Workspace,
  strategyOutput: StageOutput,
  brandOutput: StageOutput
): string {
  const strategy = strategyOutput.raw_output || JSON.stringify(strategyOutput.output_data);
  const brand = brandOutput.raw_output || JSON.stringify(brandOutput.output_data);

  return `Build a professional website for ${workspace.business_name || workspace.client_name} using Next.js + Tailwind CSS v4 + Motion (Framer Motion).

This is a client project for Cortex AI agency. Build a complete, deploy-ready website.

BRAND SYSTEM (use these exact values):
--- paste from brand package output ---
${brand}
--- end brand system ---

WEBSITE REQUIREMENTS (from strategy):
--- paste from strategy output ---
${strategy}
--- end strategy ---

TECHNICAL REQUIREMENTS:
- Next.js 14+ with App Router
- Tailwind CSS v4 (CSS-based config in globals.css using @theme, NOT tailwind.config.ts)
- Motion (framer-motion) for scroll animations — subtle fade-up transitions, nothing dramatic
- Responsive (mobile-first)
- SEO: meta tags, OG images, sitemap.xml, robots.txt, structured data (JSON-LD)
- Contact form (use Formspree or similar — no backend needed)
- Deploy-ready for Vercel
- Fast loading: optimize images, lazy load below-fold, minimal JS bundle

PAGES TO BUILD:
- Home (hero section, about preview, services overview, testimonials/social proof, CTA)
- About (company story, team/founder, values)
- Services (what they offer, detailed breakdowns)
- Contact (form + map/location + social links)
- Additional pages as specified in the strategy document

DESIGN RULES:
- Use the exact colors from the brand system — define them as CSS custom properties in @theme
- Use the exact fonts specified — import from Google Fonts
- Follow the visual direction (dark/light, minimal/detailed, etc.)
- CTAs should use the primary accent color
- Consistent spacing: use 4px/8px/16px/24px/32px/48px/64px scale
- All images should have alt text
- Logo and brand assets go in /public/assets/

OUTPUT: Complete, working codebase. Every file. Ready to deploy.`;
}
```

### Prompt Generator Orchestrator (src/lib/prompts/index.ts)

```typescript
import { Workspace, StageOutput, Transcript } from '@/types';
import { generateStrategyPrompt } from './stage2-strategy';
import { generateBrandPackagePrompt, generateGuidelinesPrompt } from './stage3-brand';
import { generateWebsitePrompt } from './stage4-website';

export async function generatePromptForStage(
  workspace: Workspace,
  stage: number,
  transcript: Transcript | null,
  previousOutputs: StageOutput[]
): Promise<{ prompt: string; subStage?: string }> {

  const getOutput = (stageNum: number) =>
    previousOutputs.find(o => o.stage === stageNum && o.status === 'completed');

  switch (stage) {
    case 1:
      return {
        prompt: 'Stage 1 is handled by ElevenLabs voice agent. No prompt needed — the transcript will be saved automatically when the call completes.'
      };

    case 2: {
      if (!transcript) throw new Error('No transcript found. Complete Stage 1 first.');
      return {
        prompt: generateStrategyPrompt(workspace, transcript)
      };
    }

    case 3: {
      const strategy = getOutput(2);
      if (!strategy) throw new Error('Stage 2 (Brand Strategy) must be completed first.');

      // Stage 3 has sub-steps. Check what's been done.
      const brandOutput = previousOutputs.find(
        o => o.stage === 3 && o.stage_name === 'brand_system' && o.status === 'completed'
      );

      if (!brandOutput) {
        return {
          prompt: generateBrandPackagePrompt(workspace, strategy),
          subStage: 'brand_system'
        };
      }

      const guidelinesOutput = previousOutputs.find(
        o => o.stage === 3 && o.stage_name === 'guidelines' && o.status === 'completed'
      );

      if (!guidelinesOutput) {
        return {
          prompt: generateGuidelinesPrompt(workspace, strategy, brandOutput),
          subStage: 'guidelines'
        };
      }

      return {
        prompt: 'Stage 3 complete. All brand package components generated. Proceed to Stage 4 or Stage 5.',
        subStage: 'complete'
      };
    }

    case 4: {
      const strategy = getOutput(2);
      const brand = previousOutputs.find(
        o => o.stage === 3 && o.stage_name === 'brand_system' && o.status === 'completed'
      );
      if (!strategy || !brand) {
        throw new Error('Stages 2 and 3 must be completed first.');
      }
      return {
        prompt: generateWebsitePrompt(workspace, strategy, brand)
      };
    }

    case 5:
      return {
        prompt: 'Stage 5 is automated. Click "Generate Delivery Package" to create the ZIP file and delivery email.'
      };

    case 6:
      return {
        prompt: `Generate a monthly social media content plan for ${workspace.business_name || workspace.client_name}.

Create 30 days of content across their priority platforms. For each post include:
- Platform (Instagram, Facebook, LinkedIn, Twitter/X)
- Post type (image, carousel, story, reel, text)
- Caption (in brand voice)
- Visual description (what the image/graphic should show)
- Hashtags (5-10 relevant)
- Best posting time
- Content pillar it belongs to

Also generate 3 ad creative concepts for Meta Ads:
- Headline
- Primary text
- Description
- Visual concept
- Target audience
- Suggested budget range

Use the brand voice and visual style established in the brand guidelines.`
      };

    default:
      throw new Error(`Unknown stage: ${stage}`);
  }
}
```

---

## Webhook Handlers

### Cal.com Webhook (src/app/api/webhooks/cal/route.ts)

When a client books a discovery call, Cal.com fires a webhook. This auto-creates a workspace.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // Cal.com sends different event types
    if (payload.triggerEvent !== 'BOOKING_CREATED') {
      return NextResponse.json({ received: true });
    }

    const booking = payload.payload;

    // Extract client info from booking
    const clientName = booking.attendees?.[0]?.name || 'Unknown Client';
    const clientEmail = booking.attendees?.[0]?.email || '';
    const language = booking.responses?.language?.value || 'en';

    // Create workspace
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .insert({
        client_name: clientName,
        tier: 'launch', // default, updated after discovery call
        current_stage: 1,
        currency: 'EGP', // default, can be updated
      })
      .select()
      .single();

    if (error) throw error;

    // Create Stage 1 entry
    await supabase.from('stage_outputs').insert({
      workspace_id: workspace.id,
      stage: 1,
      stage_name: 'discovery_call',
      status: 'in_progress',
      input_data: {
        booking_id: booking.uid,
        client_name: clientName,
        client_email: clientEmail,
        language,
        scheduled_time: booking.startTime,
      }
    });

    console.log(`Workspace created for ${clientName}: ${workspace.id}`);

    return NextResponse.json({
      success: true,
      workspace_id: workspace.id
    });

  } catch (error) {
    console.error('Cal.com webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
```

### ElevenLabs Transcript Webhook (src/app/api/webhooks/elevenlabs/route.ts)

After a discovery call ends, ElevenLabs can send the transcript via webhook (or you can poll for it).

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // Find the most recent in-progress workspace
    // In production, match by session ID or booking reference
    const { data: activeStage } = await supabase
      .from('stage_outputs')
      .select('workspace_id')
      .eq('stage', 1)
      .eq('status', 'in_progress')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!activeStage) {
      console.error('No active workspace found for transcript');
      return NextResponse.json({ error: 'No active workspace' }, { status: 404 });
    }

    const workspaceId = activeStage.workspace_id;

    // Save transcript
    await supabase.from('transcripts').insert({
      workspace_id: workspaceId,
      raw_transcript: payload.transcript || payload.text || JSON.stringify(payload),
      duration_seconds: payload.duration || null,
      language: payload.language || 'en',
    });

    // Update Stage 1 to completed
    await supabase
      .from('stage_outputs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data: { transcript_received: true }
      })
      .eq('workspace_id', workspaceId)
      .eq('stage', 1);

    // Advance workspace to Stage 2
    await supabase
      .from('workspaces')
      .update({
        current_stage: 2,
        updated_at: new Date().toISOString()
      })
      .eq('id', workspaceId);

    // Create Stage 2 entry
    await supabase.from('stage_outputs').insert({
      workspace_id: workspaceId,
      stage: 2,
      stage_name: 'brand_strategy',
      status: 'pending',
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('ElevenLabs webhook error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
```

---

## Core API Routes

### Generate Prompt (src/app/api/workspace/[id]/prompt/route.ts)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generatePromptForStage } from '@/lib/prompts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const stage = parseInt(req.nextUrl.searchParams.get('stage') || '0');
  if (!stage) return NextResponse.json({ error: 'Stage required' }, { status: 400 });

  try {
    // Fetch workspace
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', params.id)
      .single();

    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Fetch transcript (for Stage 2)
    const { data: transcript } = await supabase
      .from('transcripts')
      .select('*')
      .eq('workspace_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Fetch all completed outputs
    const { data: outputs } = await supabase
      .from('stage_outputs')
      .select('*')
      .eq('workspace_id', params.id)
      .order('stage', { ascending: true });

    const result = await generatePromptForStage(
      workspace,
      stage,
      transcript,
      outputs || []
    );

    return NextResponse.json(result);

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
```

### Save Output (src/app/api/workspace/[id]/output/route.ts)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { stage, stageName, rawOutput } = await req.json();

  try {
    // Update or create stage output
    const { data: existing } = await supabase
      .from('stage_outputs')
      .select('id')
      .eq('workspace_id', params.id)
      .eq('stage', stage)
      .eq('stage_name', stageName || `stage_${stage}`)
      .single();

    if (existing) {
      await supabase
        .from('stage_outputs')
        .update({
          raw_output: rawOutput,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('stage_outputs').insert({
        workspace_id: params.id,
        stage,
        stage_name: stageName || `stage_${stage}`,
        raw_output: rawOutput,
        status: 'completed',
        completed_at: new Date().toISOString(),
      });
    }

    // Check if we should advance the workspace stage
    // Stage 3 has sub-stages, so only advance when all are done
    if (stage !== 3) {
      const nextStage = stage + 1;
      await supabase
        .from('workspaces')
        .update({ current_stage: nextStage, updated_at: new Date().toISOString() })
        .eq('id', params.id);

      // Create next stage entry
      await supabase.from('stage_outputs').insert({
        workspace_id: params.id,
        stage: nextStage,
        stage_name: getDefaultStageName(nextStage),
        status: 'pending',
      });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function getDefaultStageName(stage: number): string {
  const names: Record<number, string> = {
    1: 'discovery_call',
    2: 'brand_strategy',
    3: 'brand_system',
    4: 'website_build',
    5: 'delivery',
    6: 'ongoing_management',
  };
  return names[stage] || `stage_${stage}`;
}
```

---

## Key UI Components

### PipelineView (src/components/PipelineView.tsx)

This is the main workspace view — shows all 6 stages as rows with status indicators and action buttons.

```typescript
'use client';

import { useState } from 'react';
import { Workspace, StageOutput, PIPELINE_STAGES } from '@/types';
import StageRow from './StageRow';
import PromptViewer from './PromptViewer';
import OutputEditor from './OutputEditor';

interface Props {
  workspace: Workspace;
  stageOutputs: StageOutput[];
  onStageComplete: (stage: number, output: string, stageName?: string) => void;
}

export default function PipelineView({ workspace, stageOutputs, onStageComplete }: Props) {
  const [activeStage, setActiveStage] = useState<number | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Filter stages by tier
  const relevantStages = PIPELINE_STAGES.filter(
    s => s.requiredTiers.includes(workspace.tier)
  );

  const getStageStatus = (stageNum: number) => {
    if (stageNum < workspace.current_stage) return 'completed';
    if (stageNum === workspace.current_stage) return 'current';
    return 'locked';
  };

  const handleGeneratePrompt = async (stageNum: number) => {
    setLoading(true);
    setActiveStage(stageNum);
    try {
      const res = await fetch(`/api/workspace/${workspace.id}/prompt?stage=${stageNum}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPrompt(data.prompt);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOutput = async (rawOutput: string) => {
    if (!activeStage) return;
    await onStageComplete(activeStage, rawOutput);
    setActiveStage(null);
    setPrompt(null);
  };

  return (
    <div className="space-y-3">
      {relevantStages.map(stage => (
        <StageRow
          key={stage.number}
          stage={stage}
          status={getStageStatus(stage.number)}
          output={stageOutputs.find(o => o.stage === stage.number)}
          onGeneratePrompt={() => handleGeneratePrompt(stage.number)}
          isActive={activeStage === stage.number}
          loading={loading && activeStage === stage.number}
        />
      ))}

      {/* Prompt viewer + output editor panel */}
      {activeStage && prompt && (
        <div className="mt-6 space-y-4">
          <PromptViewer prompt={prompt} />
          <OutputEditor onSave={handleSaveOutput} />
        </div>
      )}
    </div>
  );
}
```

### PromptViewer (src/components/PromptViewer.tsx)

Shows the generated prompt with a one-click copy button.

```typescript
'use client';

import { useState } from 'react';

export default function PromptViewer({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-cortex-border rounded-xl bg-cortex-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-cortex-text-secondary uppercase tracking-wider">
          Generated prompt
        </h3>
        <button
          onClick={handleCopy}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: copied ? '#7A9900' : '#C8FF00',
            color: '#000000',
          }}
        >
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </button>
      </div>
      <pre className="text-sm text-cortex-text-secondary font-mono whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
        {prompt}
      </pre>
    </div>
  );
}
```

### OutputEditor (src/components/OutputEditor.tsx)

Where the operator pastes Claude's response back into the system.

```typescript
'use client';

import { useState } from 'react';

export default function OutputEditor({
  onSave,
}: {
  onSave: (output: string) => void;
}) {
  const [output, setOutput] = useState('');

  return (
    <div className="border border-cortex-border rounded-xl bg-cortex-surface p-5">
      <h3 className="text-sm font-medium text-cortex-text-secondary uppercase tracking-wider mb-3">
        Paste Claude's response
      </h3>
      <textarea
        value={output}
        onChange={(e) => setOutput(e.target.value)}
        placeholder="Paste the full output from Claude here..."
        className="w-full h-64 bg-cortex-elevated border border-cortex-border rounded-lg p-4 text-sm text-cortex-text-primary font-mono resize-y focus:outline-none focus:border-cortex-accent"
      />
      <div className="flex justify-end mt-3 gap-3">
        <button
          onClick={() => setOutput('')}
          className="px-4 py-2 rounded-lg text-sm text-cortex-text-secondary border border-cortex-border hover:bg-cortex-elevated transition-colors"
        >
          Clear
        </button>
        <button
          onClick={() => {
            if (output.trim()) onSave(output);
          }}
          disabled={!output.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-30"
          style={{ background: '#C8FF00', color: '#000000' }}
        >
          Save & advance to next stage
        </button>
      </div>
    </div>
  );
}
```

---

## Dashboard Home Page (src/app/page.tsx)

```typescript
import { createClient } from '@/lib/supabase-server';
import WorkspaceCard from '@/components/WorkspaceCard';
import NewWorkspaceModal from '@/components/NewWorkspaceModal';

export default async function Dashboard() {
  const supabase = createClient();

  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('*')
    .order('updated_at', { ascending: false });

  const activeCount = workspaces?.filter(w => w.status === 'active').length || 0;

  return (
    <div className="min-h-screen bg-cortex-base text-cortex-text-primary p-6 font-body">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-display font-bold">Cortex Ops</h1>
            <p className="text-sm text-cortex-text-muted mt-1">
              {activeCount} active project{activeCount !== 1 ? 's' : ''}
            </p>
          </div>
          <NewWorkspaceModal />
        </div>

        {/* Workspace grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces?.map(ws => (
            <WorkspaceCard key={ws.id} workspace={ws} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## Manual Transcript Upload

Since ElevenLabs webhooks might not be set up initially, provide a manual way to upload transcripts.

### In the workspace page, add a transcript upload section:

```typescript
// Component for manually pasting/uploading a transcript
'use client';

import { useState } from 'react';

export default function TranscriptUploader({
  workspaceId,
  onUploaded,
}: {
  workspaceId: string;
  onUploaded: () => void;
}) {
  const [transcript, setTranscript] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save transcript
      await fetch(`/api/workspace/${workspaceId}/output`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 1,
          stageName: 'discovery_call',
          rawOutput: transcript,
        }),
      });

      // Also save to transcripts table directly
      const res = await fetch('/api/webhooks/elevenlabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          workspace_id: workspaceId,
        }),
      });

      onUploaded();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-dashed border-cortex-border rounded-xl bg-cortex-surface p-5">
      <h3 className="text-sm font-medium text-cortex-text-secondary mb-3">
        Paste discovery call transcript
      </h3>
      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Paste the ElevenLabs transcript here, or type notes from a manual discovery session..."
        className="w-full h-48 bg-cortex-elevated border border-cortex-border rounded-lg p-4 text-sm text-cortex-text-primary resize-y focus:outline-none focus:border-cortex-accent"
      />
      <button
        onClick={handleSave}
        disabled={!transcript.trim() || saving}
        className="mt-3 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-30"
        style={{ background: '#C8FF00', color: '#000000' }}
      >
        {saving ? 'Saving...' : 'Save transcript & unlock Stage 2'}
      </button>
    </div>
  );
}
```

---

## Auth Setup

Simple Supabase auth — you're the only user, so email/password is fine.

```typescript
// src/lib/supabase.ts (client-side)
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

```typescript
// src/lib/supabase-server.ts (server-side)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
        set(name, value, options) { cookieStore.set({ name, value, ...options }); },
        remove(name, options) { cookieStore.set({ name, value: '', ...options }); },
      },
    }
  );
}
```

Login page: simple email/password form. Create your account once via Supabase dashboard.

---

## Deployment

1. Deploy on Vercel (same as main site, but different project)
2. Set environment variables in Vercel dashboard
3. Domain: ops.cortexagency.ai or cortex-ops.vercel.app (internal, not public)
4. Set up Cal.com webhook pointing to: https://your-domain/api/webhooks/cal

---

## Build Order for Claude Code

Follow this exact sequence:

### Phase 1: Foundation
1. `npx create-next-app@latest cortex-ops --typescript --tailwind --app --src-dir`
2. Install dependencies: `npm install @supabase/supabase-js @supabase/ssr`
3. Set up Tailwind v4 config with Cortex design tokens in globals.css
4. Import Google Fonts (Inter + Space Grotesk) in layout.tsx
5. Create all type definitions in src/types/index.ts
6. Set up Supabase clients (browser + server)

### Phase 2: Database
7. Create Supabase project (free tier)
8. Run the SQL schema (tables + RLS policies)
9. Create storage buckets
10. Set up .env.local with keys

### Phase 3: Core Logic
11. Build all prompt templates (src/lib/prompts/*)
12. Build the prompt generator orchestrator
13. Build the API routes (prompt generation, output saving)
14. Build webhook handlers (Cal.com, ElevenLabs)

### Phase 4: UI
15. Build the dashboard home page (workspace list)
16. Build NewWorkspaceModal (manual workspace creation)
17. Build WorkspaceCard component
18. Build workspace detail page with PipelineView
19. Build StageRow component
20. Build PromptViewer (with copy button)
21. Build OutputEditor (paste-back area)
22. Build TranscriptUploader (manual transcript paste)

### Phase 5: Auth + Polish
23. Set up Supabase auth (login page)
24. Add auth middleware (protect all routes)
25. Test full flow: create workspace → paste transcript → generate prompt → copy → paste back → advance
26. Deploy to Vercel

---

## How It Works (User Flow)

**Normal flow (with webhooks):**
1. Client books on Cal.com → webhook creates workspace automatically
2. Client does discovery call → transcript saved automatically → Stage 2 unlocks
3. You open dashboard → see workspace at Stage 2
4. Click "Generate Prompt" → prompt appears with all client data
5. Click "Copy to Clipboard" → paste into Claude chat
6. Copy Claude's response → paste into "Output" area → click "Save & advance"
7. Stage 3 unlocks → repeat for brand package, guidelines
8. Stage 4 (if Build/Scale) → get Claude Code prompt → paste into Superpowers
9. Stage 5 → click "Generate Delivery Package" → sends email

**Manual flow (no webhooks yet):**
1. Click "New Workspace" → enter client name, tier
2. Paste transcript manually into the transcript uploader
3. Continue from step 3 above

**The key insight:** The dashboard doesn't DO the AI work — it ORCHESTRATES it. It handles data flow, prompt assembly, and state management. The actual intelligence comes from your Claude subscription (manual) or Claude API (future toggle).
