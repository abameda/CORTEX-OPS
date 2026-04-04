"use client";

import { useState } from "react";

export default function OutputEditor({
  onSave,
  disabled = false,
  saving = false,
  stageLabel,
}: {
  onSave: (output: string) => Promise<void> | void;
  disabled?: boolean;
  saving?: boolean;
  stageLabel?: string;
}) {
  const [output, setOutput] = useState("");

  async function handleSave() {
    if (!output.trim() || disabled || saving) {
      return;
    }

    await onSave(output.trim());
    setOutput("");
  }

  return (
    <section className="rounded-[1.75rem] border border-cortex-border bg-cortex-surface p-5 md:p-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-cortex-text-muted">
          Paste Response
        </p>
        <h3 className="mt-3 font-display text-2xl uppercase tracking-[0.04em]">
          Save the {stageLabel || "stage"} output back into the pipeline
        </h3>
      </div>

      <textarea
        value={output}
        onChange={(event) => setOutput(event.target.value)}
        placeholder="Paste the full Claude output here..."
        className="mt-5 min-h-72 w-full resize-y rounded-[1.25rem] border border-cortex-border bg-cortex-base p-4 font-mono text-sm leading-7 text-cortex-text-primary outline-none transition focus:border-cortex-accent"
      />

      <div className="mt-4 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => setOutput("")}
          className="rounded-full border border-cortex-border px-4 py-2 text-sm text-cortex-text-secondary transition hover:border-cortex-accent hover:text-cortex-accent"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={disabled || saving || !output.trim()}
          className="rounded-full bg-cortex-accent px-5 py-2 text-sm font-semibold text-cortex-base transition hover:bg-cortex-accent-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save and advance"}
        </button>
      </div>
    </section>
  );
}
