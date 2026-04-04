"use client";

import { StageDefinition, StageOutput } from "@/types";

const STATUS_STYLES = {
  locked: "border-cortex-border text-cortex-text-muted bg-cortex-base",
  pending: "border-cortex-border text-cortex-text-secondary bg-cortex-base",
  current: "border-cortex-accent/40 text-cortex-accent-light bg-cortex-accent/10",
  completed: "border-cortex-accent/40 text-cortex-accent bg-cortex-accent/10",
};

const STATUS_LABELS = {
  locked: "Locked",
  pending: "Pending",
  current: "Current",
  completed: "Completed",
};

export default function StageRow({
  stage,
  status,
  summary,
  output,
  isActive,
  loading,
  onGeneratePrompt,
  actionSlot,
}: {
  stage: StageDefinition;
  status: keyof typeof STATUS_STYLES;
  summary?: string;
  output?: StageOutput | null;
  isActive?: boolean;
  loading?: boolean;
  onGeneratePrompt?: () => void;
  actionSlot?: React.ReactNode;
}) {
  const canGenerate = stage.autoGenPrompt && status !== "locked";

  return (
    <article className="relative overflow-hidden rounded-[1.5rem] border border-cortex-border bg-cortex-surface/95 p-5 md:p-6">
      <div
        className={`pointer-events-none absolute left-0 top-6 h-20 w-px ${
          status === "current" || status === "completed" ? "bg-cortex-accent/70" : "bg-cortex-border"
        }`}
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl pl-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-cortex-border bg-cortex-base px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cortex-text-muted">
              Stage {stage.number}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${STATUS_STYLES[status]}`}
            >
              {STATUS_LABELS[status]}
            </span>
            {isActive ? (
              <span className="rounded-full border border-cortex-accent/40 bg-cortex-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cortex-accent">
                Active panel
              </span>
            ) : null}
          </div>

          <h3 className="mt-4 font-display text-2xl font-medium uppercase tracking-[0.04em] text-cortex-text-primary">
            {stage.name}
          </h3>
          <p className="mt-2 text-sm leading-6 text-cortex-text-secondary">
            {stage.description}
          </p>
          <p className="mt-3 text-sm leading-6 text-cortex-text-muted">
            Needs: {stage.requiresInput} | Produces: {stage.produces}
          </p>
          {summary ? (
            <p className="mt-4 text-sm leading-6 text-cortex-accent-light">{summary}</p>
          ) : null}
          {output?.completed_at ? (
            <p className="mt-3 text-xs uppercase tracking-[0.16em] text-cortex-text-muted">
              Last saved {new Date(output.completed_at).toLocaleString()}
            </p>
          ) : null}
        </div>

        {!actionSlot && canGenerate ? (
          <div className="flex min-w-52 flex-col items-stretch gap-3 lg:max-w-64">
            <div className="rounded-[1.25rem] border border-cortex-border bg-cortex-base/70 px-4 py-4 text-sm leading-6 text-cortex-text-secondary">
              Generate the operator prompt when the upstream input is ready.
            </div>
            <button
              type="button"
              onClick={onGeneratePrompt}
              disabled={loading}
              className="rounded-full bg-cortex-accent px-4 py-3 text-sm font-semibold text-cortex-base transition hover:bg-cortex-accent-light disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Generating..." : "Generate prompt"}
            </button>
          </div>
        ) : null}

        {!actionSlot && !canGenerate ? (
          <div className="flex min-w-52 flex-col items-stretch gap-3 lg:max-w-64">
            <div className="rounded-[1.25rem] border border-cortex-border bg-cortex-base/70 px-4 py-4 text-sm leading-6 text-cortex-text-secondary">
              {stage.number === 1
                ? "Use the transcript uploader below."
                : "This stage is unavailable until prior steps are complete."}
            </div>
          </div>
        ) : null}
      </div>

      {actionSlot ? <div className="mt-5">{actionSlot}</div> : null}
    </article>
  );
}
