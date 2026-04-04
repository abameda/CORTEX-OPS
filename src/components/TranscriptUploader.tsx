"use client";

import { useState } from "react";
import { readJsonResponse } from "@/lib/api-client";

export default function TranscriptUploader({
  workspaceId,
  disabled = false,
  onUploaded,
}: {
  workspaceId: string;
  disabled?: boolean;
  onUploaded?: () => void;
}) {
  const [transcript, setTranscript] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!transcript.trim() || disabled || saving) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/workspace/${workspaceId}/transcript`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rawTranscript: transcript,
        }),
      });

      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data.error || "Failed to save transcript.");
      }

      setTranscript("");
      onUploaded?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save transcript.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[1.75rem] border border-dashed border-cortex-border bg-cortex-surface/80 p-5 md:p-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-cortex-accent-light">
          Stage 1
        </p>
        <h3 className="mt-3 font-display text-2xl uppercase tracking-[0.04em]">
          Paste discovery transcript
        </h3>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-cortex-text-secondary">
          Manual intake replaces the webhook flow for v1. Save the discovery call transcript here
          to unlock Stage 2 and start the operator workflow.
        </p>
      </div>

      <textarea
        value={transcript}
        onChange={(event) => setTranscript(event.target.value)}
        placeholder="Paste the ElevenLabs transcript or manual discovery notes..."
        className="mt-5 min-h-56 w-full resize-y rounded-[1.25rem] border border-cortex-border bg-cortex-base p-4 text-sm leading-7 text-cortex-text-primary outline-none transition focus:border-cortex-accent"
      />

      {error ? (
        <p className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={disabled || saving || !transcript.trim()}
          className="rounded-full bg-cortex-accent px-5 py-3 text-sm font-semibold text-cortex-base transition hover:bg-cortex-accent-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save transcript and unlock Stage 2"}
        </button>
      </div>
    </section>
  );
}
