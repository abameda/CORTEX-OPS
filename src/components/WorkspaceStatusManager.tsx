"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { readJsonResponse } from "@/lib/api-client";
import { Workspace, WorkspaceStatus } from "@/types";

const STATUSES: WorkspaceStatus[] = ["active", "completed", "archived"];

export default function WorkspaceStatusManager({
  workspace,
}: {
  workspace: Workspace;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleStatusChange(status: WorkspaceStatus) {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/workspace/${workspace.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        });

        const data = await readJsonResponse<{ error?: string }>(response);
        if (!response.ok) {
          throw new Error(data.error || "Failed to update workspace status.");
        }

        setSuccess(`Workspace marked as ${status}.`);
        router.refresh();
      } catch (statusError) {
        setError(
          statusError instanceof Error ? statusError.message : "Failed to update workspace status."
        );
      }
    });
  }

  return (
    <section className="rounded-[1.5rem] border border-cortex-border bg-cortex-surface p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-cortex-text-muted">
            Workspace Status
          </p>
          <h2 className="mt-2 font-display text-xl">Lifecycle controls</h2>
          <p className="mt-2 text-sm leading-6 text-cortex-text-secondary">
            Use this when a workspace is complete, paused, or should be hidden from active work.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => {
            const active = workspace.status === status;

            return (
              <button
                key={status}
                type="button"
                disabled={isPending || active}
                onClick={() => handleStatusChange(status)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "border-cortex-accent bg-cortex-accent text-cortex-base"
                    : "border-cortex-border bg-cortex-base text-cortex-text-secondary hover:border-cortex-accent hover:text-cortex-accent"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {status}
              </button>
            );
          })}
        </div>
      </div>

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
    </section>
  );
}
