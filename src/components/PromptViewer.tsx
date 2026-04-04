"use client";

import { useState } from "react";

export default function PromptViewer({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-[1.75rem] border border-cortex-border bg-cortex-surface p-5 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-cortex-text-muted">
            Generated Prompt
          </p>
          <h3 className="mt-3 font-display text-2xl uppercase tracking-[0.04em]">
            Ready to paste into Claude
          </h3>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-full px-4 py-2 text-sm font-semibold text-cortex-base transition"
          style={{
            backgroundColor: copied ? "#7a9900" : "#c8ff00",
          }}
        >
          {copied ? "Copied" : "Copy to clipboard"}
        </button>
      </div>

      <pre className="mt-5 max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-[1.25rem] border border-cortex-border bg-cortex-base p-4 font-mono text-sm leading-7 text-cortex-text-secondary">
        {prompt}
      </pre>
    </section>
  );
}
