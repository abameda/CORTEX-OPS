import Link from "next/link";
import { Workspace } from "@/types";

const TIER_LABELS = {
  launch: "Launch",
  build: "Build",
  scale: "Scale",
};

const STATUS_STYLES = {
  active: "border-cortex-accent/30 bg-cortex-accent/10 text-cortex-accent-light",
  completed: "border-cortex-border bg-cortex-base text-cortex-text-secondary",
  archived: "border-cortex-border bg-cortex-base text-cortex-text-muted",
};

export default function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  return (
    <Link
      href={`/workspace/${workspace.id}`}
      className="group relative overflow-hidden rounded-[1.75rem] border border-cortex-border bg-cortex-surface/90 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-cortex-accent/45 hover:bg-cortex-elevated"
    >
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cortex-accent/30 to-transparent opacity-0 transition group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-cortex-text-muted">
            {TIER_LABELS[workspace.tier]}
          </p>
          <h2 className="mt-4 font-display text-xl font-medium uppercase tracking-[0.04em] text-cortex-text-primary">
            {workspace.client_name}
          </h2>
          <p className="mt-2 text-sm leading-6 text-cortex-text-secondary">
            {workspace.business_name || "Business name pending"}
          </p>
        </div>
        <span className="rounded-full border border-cortex-border bg-cortex-base px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cortex-accent-light">
          Stage {workspace.current_stage}
        </span>
      </div>

      <div className="mt-6 grid gap-3 border-t border-cortex-border/80 pt-4 text-sm text-cortex-text-secondary">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.2em] text-cortex-text-muted">
            Workspace status
          </span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-cortex-text-muted">
            Open
          </span>
        </div>
        <span
          className={`w-fit rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${STATUS_STYLES[workspace.status]}`}
        >
          {workspace.status}
        </span>
        <span className="transition group-hover:text-cortex-accent">Open workspace</span>
      </div>
    </Link>
  );
}
