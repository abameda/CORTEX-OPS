import { StageOutput, Workspace } from "@/types";

function getOutputText(output: StageOutput): string {
  return output.raw_output || JSON.stringify(output.output_data, null, 2);
}

export function generateBrandPackagePrompt(
  workspace: Workspace,
  strategyOutput: StageOutput
): string {
  const strategy = getOutputText(strategyOutput);

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
BUSINESS: ${workspace.business_name || "See strategy document"}
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
  const strategy = getOutputText(strategyOutput);
  const brand = getOutputText(brandOutput);

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

CLIENT: ${workspace.client_name}
BUSINESS: ${workspace.business_name || "See strategy and brand system"}

--- BRAND STRATEGY ---
${strategy}
--- END STRATEGY ---

--- BRAND SYSTEM ---
${brand}
--- END BRAND SYSTEM ---`;
}
