"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const supabase = useMemo(() => {
    if (!configured) {
      return null;
    }

    return createClient();
  }, [configured]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (!supabase) {
      setError("Add Supabase environment variables before signing in.");
      setIsSubmitting(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setIsSubmitting(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-81px)] w-full max-w-6xl items-center px-6 py-8">
      <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[2rem] border border-cortex-border bg-cortex-surface/80 p-8">
          <p className="text-sm uppercase tracking-[0.22em] text-cortex-accent-light">
            Internal access
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight">
            Sign in to manage brand workspaces.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-cortex-text-secondary">
            This phase keeps auth intentionally narrow: a single authenticated operator,
            protected routes, and the minimum UI required to get into the dashboard safely.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-cortex-border bg-cortex-elevated p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-cortex-text-muted">
                Auth
              </p>
              <p className="mt-3 text-sm text-cortex-text-primary">Supabase email/password</p>
            </article>
            <article className="rounded-2xl border border-cortex-border bg-cortex-elevated p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-cortex-text-muted">
                Access
              </p>
              <p className="mt-3 text-sm text-cortex-text-primary">
                Middleware protects the app shell
              </p>
            </article>
            <article className="rounded-2xl border border-cortex-border bg-cortex-elevated p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-cortex-text-muted">
                Next
              </p>
              <p className="mt-3 text-sm text-cortex-text-primary">
                Workspace CRUD and pipeline APIs
              </p>
            </article>
          </div>
        </section>

        <section className="rounded-[2rem] border border-cortex-border bg-cortex-base/70 p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.18em] text-cortex-text-muted">
              Login
            </p>
            <h2 className="mt-3 font-display text-2xl font-medium text-cortex-text-primary">
              Founder access
            </h2>
          </div>

          <form className="grid gap-5" onSubmit={handleSubmit}>
            {!configured ? (
              <p className="rounded-2xl border border-cortex-accent/30 bg-cortex-accent/10 px-4 py-3 text-sm text-cortex-accent-light">
                Supabase is not configured yet. Copy `.env.local.example` to `.env.local`,
                add your keys, then sign in.
              </p>
            ) : null}

            <label className="grid gap-2">
              <span className="text-sm text-cortex-text-secondary">Email</span>
              <input
                required
                autoComplete="email"
                className="rounded-2xl border border-cortex-border bg-cortex-surface px-4 py-3 text-sm text-cortex-text-primary outline-none transition placeholder:text-cortex-text-subtle focus:border-cortex-accent"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="founder@cortexagency.ai"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-cortex-text-secondary">Password</span>
              <input
                required
                autoComplete="current-password"
                className="rounded-2xl border border-cortex-border bg-cortex-surface px-4 py-3 text-sm text-cortex-text-primary outline-none transition placeholder:text-cortex-text-subtle focus:border-cortex-accent"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
              />
            </label>

            {error ? (
              <p className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 rounded-full bg-cortex-accent px-5 py-3 text-sm font-semibold text-cortex-base transition hover:bg-cortex-accent-light disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
