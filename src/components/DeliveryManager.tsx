"use client";

import { useState, useTransition } from "react";

export default function DeliveryManager({
  workspaceId,
  enabled,
  alreadyDelivered,
  onDelivered,
}: {
  workspaceId: string;
  enabled: boolean;
  alreadyDelivered: boolean;
  onDelivered?: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelivery() {
    if (!enabled || alreadyDelivered) {
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/workspace/${workspaceId}/output`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stage: 5,
            stageName: "delivery",
            rawOutput:
              notes.trim() ||
              "Delivery confirmed manually in Cortex Ops. Assets packaged and handed off to client.",
          }),
        });

        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error || "Failed to mark delivery.");
        }

        setSuccess("Stage 5 marked as delivered.");
        setNotes("");
        onDelivered?.();
      } catch (deliveryError) {
        setError(deliveryError instanceof Error ? deliveryError.message : "Failed to mark delivery.");
      }
    });
  }

  return (
    <section className="rounded-[1.5rem] border border-cortex-border bg-cortex-surface p-5">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-cortex-accent-light">Stage 5</p>
        <h3 className="mt-2 font-display text-xl">Mark package as delivered</h3>
        <p className="mt-2 text-sm leading-6 text-cortex-text-secondary">
          v1 uses a manual delivery checkpoint instead of ZIP/email automation. Add optional notes and confirm handoff here.
        </p>
      </div>

      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Optional delivery notes, links, or handoff details..."
        disabled={!enabled || alreadyDelivered}
        className="mt-5 min-h-36 w-full resize-y rounded-[1.25rem] border border-cortex-border bg-cortex-base p-4 text-sm leading-6 text-cortex-text-primary outline-none transition focus:border-cortex-accent disabled:opacity-60"
      />

      {success ? (
        <p className="mt-4 rounded-2xl border border-cortex-accent/30 bg-cortex-accent/10 px-4 py-3 text-sm text-cortex-accent-light">
          {success}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleDelivery}
          disabled={!enabled || alreadyDelivered || isPending}
          className="rounded-full bg-cortex-accent px-5 py-3 text-sm font-semibold text-cortex-base transition hover:bg-cortex-accent-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          {alreadyDelivered ? "Already delivered" : isPending ? "Saving..." : "Mark as delivered"}
        </button>
      </div>
    </section>
  );
}
