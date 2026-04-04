import Link from "next/link";
import { notFound } from "next/navigation";
import PipelineView from "@/components/PipelineView";
import WorkspaceStatusManager from "@/components/WorkspaceStatusManager";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { createClient } from "@/lib/supabase-server";

export default async function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-84px)] w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <section className="rounded-[2rem] border border-cortex-border bg-cortex-surface p-8">
          <h1 className="font-display text-3xl font-semibold uppercase tracking-[0.06em]">
            Workspace preview unavailable
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-cortex-text-secondary">
            Supabase must be configured to load workspace details, prompts, and transcript data.
          </p>
        </section>
      </main>
    );
  }

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: workspace }, { data: stageOutputs }, { data: transcript }] = await Promise.all([
    supabase.from("workspaces").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("stage_outputs")
      .select("*")
      .eq("workspace_id", id)
      .order("stage", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("transcripts")
      .select("id")
      .eq("workspace_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!workspace) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-84px)] w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <section className="rounded-[2rem] border border-cortex-border bg-cortex-surface/80 p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-cortex-accent-light">
              Workspace detail
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="inline-flex text-sm text-cortex-text-secondary transition hover:text-cortex-accent"
              >
                Back to dashboard
              </Link>
              <Link
                href="/"
                aria-label="Close workspace and return to dashboard"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-cortex-border bg-cortex-base/70 text-base text-cortex-text-secondary transition hover:border-cortex-accent hover:text-cortex-accent"
              >
                X
              </Link>
            </div>
            <h1 className="mt-4 font-display text-4xl font-semibold uppercase tracking-[0.06em]">
              {workspace.client_name}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-cortex-text-secondary">
              {workspace.business_name || "Business name pending"}. {workspace.tier.toUpperCase()}{" "}
              tier. {workspace.currency} pipeline. Stage {workspace.current_stage} is currently in
              focus.
            </p>
          </div>

          <div className="grid gap-3 md:min-w-72">
            <div className="rounded-[1.5rem] border border-cortex-border bg-cortex-base/70 px-5 py-4 text-sm text-cortex-text-secondary">
              Workspace status: <span className="text-cortex-text-primary">{workspace.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[1.25rem] border border-cortex-border bg-cortex-base/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-cortex-text-muted">
                  Tier
                </p>
                <p className="mt-2 text-sm text-cortex-text-primary">{workspace.tier}</p>
              </div>
              <div className="rounded-[1.25rem] border border-cortex-border bg-cortex-base/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-cortex-text-muted">
                  Currency
                </p>
                <p className="mt-2 text-sm text-cortex-text-primary">{workspace.currency}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div>
        <p className="text-[11px] uppercase tracking-[0.24em] text-cortex-text-muted">
          Workspace controls
        </p>
        <div className="mt-3">
          <WorkspaceStatusManager workspace={workspace} />
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.24em] text-cortex-text-muted">
          Pipeline flow
        </p>
        <div className="mt-3">
          <PipelineView
            workspace={workspace}
            stageOutputs={stageOutputs ?? []}
            transcriptExists={Boolean(transcript)}
          />
        </div>
      </div>
    </main>
  );
}
