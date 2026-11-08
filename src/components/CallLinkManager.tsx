"use client";

import { useState, useTransition } from "react";
import { readJsonResponse } from "@/lib/api-client";

interface CallLinkResponse {
  error?: string;
  url?: string | null;
  token?: string;
  expiresAt?: string;
  maxDurationSeconds?: number;
}

export default function CallLinkManager({ workspaceId }: { workspaceId: string }) {
  const [link, setLink] = useState<CallLinkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function createLink() {
    setError(null);
    setCopied(false);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/workspace/${workspaceId}/call-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await readJsonResponse<CallLinkResponse>(response);
        if (!response.ok) {
          throw new Error(data.error || "Failed to create a call link.");
        }
        setLink(data);
      } catch (linkError) {
        setError(linkError instanceof Error ? linkError.message : "Failed to create a call link.");
      }
    });
  }

  async function copyLink() {
    const value = link?.url ?? link?.token;
    if (!value) {
      return;
    }
    await navigator.clipboard.writeText(value);
    setCopied(true);
  }

  return (
    <section className="rounded-[1.5rem] border border-cortex-border bg-cortex-surface p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-cortex-text-muted">
            Discovery call
          </p>
          <h2 className="mt-2 font-display text-xl">Single-use call link</h2>
          <p className="mt-2 text-sm leading-6 text-cortex-text-secondary">
            Creates a private link for this client. It starts one call, expires after 72 hours,
            and attaches the transcript to this workspace automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={createLink}
          disabled={isPending}
          className="rounded-full bg-cortex-accent px-5 py-3 text-sm font-semibold text-cortex-base transition hover:bg-cortex-accent-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Creating..." : "Create call link"}
        </button>
      </div>

      {link ? (
        <div className="mt-4 rounded-2xl border border-cortex-border bg-cortex-base p-4 text-sm">
          <p className="break-all text-cortex-text-primary">
            {link.url ?? `Token: ${link.token} (set CALL_PAGE_URL to get a full link)`}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-cortex-text-secondary">
            <span>
              Expires {link.expiresAt ? new Date(link.expiresAt).toLocaleString() : "soon"}. Shown
              once: copy it now.
            </span>
            <button
              type="button"
              onClick={copyLink}
              className="rounded-full border border-cortex-border px-3 py-1 text-cortex-text-primary transition hover:border-cortex-accent hover:text-cortex-accent"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}
    </section>
  );
}
