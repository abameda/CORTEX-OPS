import { StageOutput, Workspace } from "@/types";

function getOutputText(output: StageOutput): string {
  return output.raw_output || JSON.stringify(output.output_data, null, 2);
}

export function generateWebsitePrompt(
  workspace: Workspace,
  strategyOutput: StageOutput,
  brandOutput: StageOutput
): string {
  const strategy = getOutputText(strategyOutput);
  const brand = getOutputText(brandOutput);

  return `Build a professional website for ${workspace.business_name || workspace.client_name} using Next.js 15.5.x + Tailwind CSS v4 + Motion.

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
- Next.js 15.5.x with App Router
- Tailwind CSS v4 (CSS-based config in globals.css using @theme, NOT tailwind.config.ts)
- Motion for scroll animations — subtle fade-up transitions, nothing dramatic
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
