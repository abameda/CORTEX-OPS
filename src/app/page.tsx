import { signOut } from "@/app/actions/auth";
import NewWorkspaceModal from "@/components/NewWorkspaceModal";
import WorkspaceCard from "@/components/WorkspaceCard";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { createClient } from "@/lib/supabase-server";
import { Workspace } from "@/types";

function getUserLabel(user: {
  email?: string | null;
  user_metadata?: { email?: string | null };
  identities?: Array<{
    identity_data?: { email?: string | null };
  }> | null;
} | null) {
  return (
    user?.email ||
    user?.user_metadata?.email ||
    user?.identities?.find((identity) => identity.identity_data?.email)?.identity_data?.email ||
    "Unknown user"
  );
}

export default async function Home() {
  const configured = isSupabaseConfigured();
  let userEmail = "Local preview mode";
  let queryError = false;
  let workspaces: Workspace[] | null = null;

  if (configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    userEmail = getUserLabel(user);

    const { data, error } = await supabase
      .from("workspaces")
      .select("*")
      .order("updated_at", { ascending: false });

    workspaces = data;
    queryError = Boolean(error);
  }

  const activeCount =
    workspaces?.filter((workspace) => workspace.status === "active").length ?? 0;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-84px)] w-full max-w-6xl flex-col gap-8 px-6 py-8 md:py-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-cortex-border bg-cortex-surface/80 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] md:p-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cortex-accent/35 to-transparent" />
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_20rem] md:items-end">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-cortex-accent-light">
              Internal command surface
            </p>
            <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold uppercase tracking-[0.08em] md:text-5xl">
              Workspace dashboard
            </h1>
            <p className="mt-3 text-sm uppercase tracking-[0.22em] text-cortex-text-secondary">
              Cortex operates while you sleep.
            </p>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-cortex-text-secondary">
              Track intake, trigger prompt generation, and move client work through the delivery
              pipeline with a quieter interface and tighter operator focus.
            </p>
          </div>

          <div className="grid gap-3">
            <div className="rounded-[1.5rem] border border-cortex-border bg-cortex-base/70 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-cortex-text-muted">
                Signed in as
              </p>
              <p className="mt-2 text-sm text-cortex-text-primary">{userEmail}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {configured ? (
                <form action={signOut}>
                  <button
                    type="submit"
                    className="rounded-full border border-cortex-border px-4 py-2 text-sm text-cortex-text-primary transition hover:border-cortex-accent hover:text-cortex-accent"
                  >
                    Sign out
                  </button>
                </form>
              ) : null}
              <NewWorkspaceModal disabled={!configured} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[1.75rem] border border-cortex-border bg-cortex-surface/90 p-5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-cortex-text-muted">
            Active workspaces
          </p>
          <p className="mt-5 font-display text-5xl uppercase tracking-[0.06em] text-cortex-accent">
            {activeCount}
          </p>
          <p className="mt-3 text-sm leading-6 text-cortex-text-secondary">
            Live client environments currently moving through the pipeline.
          </p>
        </article>
        <article className="rounded-[1.75rem] border border-cortex-border bg-cortex-surface/90 p-5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-cortex-text-muted">
            Total records
          </p>
          <p className="mt-5 font-display text-5xl uppercase tracking-[0.06em] text-cortex-text-primary">
            {workspaces?.length ?? 0}
          </p>
          <p className="mt-3 text-sm leading-6 text-cortex-text-secondary">
            All workspaces stored across active, completed, and archived states.
          </p>
        </article>
        <article className="rounded-[1.75rem] border border-cortex-border bg-cortex-surface/90 p-5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-cortex-text-muted">
            Data source
          </p>
          <p className="mt-5 text-sm leading-7 text-cortex-text-secondary">
            {!configured
              ? "Supabase keys are not configured. The interface is rendering in local preview mode."
              : queryError
                ? "Supabase is configured, but the current workspace query is failing."
                : "Supabase is configured and returning current workspace records."}
          </p>
        </article>
      </section>

      <section className="rounded-[2rem] border border-cortex-border bg-cortex-base/55 p-6 md:p-7">
        <div>
          <p className="text-[11px] uppercase tracking-[0.26em] text-cortex-accent-light">
            Workspace index
          </p>
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="font-display text-2xl font-medium uppercase tracking-[0.05em]">
                Operator workspace list
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-cortex-text-secondary">
                Open a workspace to manage transcript intake, prompt generation, output capture,
                and delivery from a single stage-by-stage view.
              </p>
            </div>
            <div className="rounded-full border border-cortex-border bg-cortex-surface/90 px-4 py-2">
              <p className="text-[11px] uppercase tracking-[0.24em] text-cortex-text-secondary">
                Black environment. Chartreuse only for signals.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workspaces && workspaces.length > 0 ? (
            workspaces.map((workspace) => <WorkspaceCard key={workspace.id} workspace={workspace} />)
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-cortex-border bg-cortex-surface/80 p-6 text-sm leading-7 text-cortex-text-secondary md:col-span-2 xl:col-span-3">
              No workspaces yet. Create one manually to start the transcript-to-prompt workflow.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
