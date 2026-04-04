import { Transcript, Workspace } from "@/types";

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
BUSINESS: ${workspace.business_name || "To be determined from transcript"}
TIER: ${workspace.tier.toUpperCase()}
CURRENCY: ${workspace.currency}

--- TRANSCRIPT START ---
${transcript.raw_transcript}
--- TRANSCRIPT END ---`;
}
