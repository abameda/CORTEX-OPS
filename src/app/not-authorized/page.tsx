import { signOut } from "@/app/actions/auth";

export default function NotAuthorizedPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-84px)] w-full max-w-3xl items-center px-6 py-8">
      <section className="w-full rounded-[2rem] border border-cortex-border bg-cortex-surface/80 p-8">
        <p className="text-sm uppercase tracking-[0.22em] text-cortex-accent-light">
          Access not granted
        </p>
        <h1 className="mt-4 font-display text-3xl font-semibold leading-tight">
          This account is not on the CORTEX staff list.
        </h1>
        <p className="mt-4 text-sm leading-7 text-cortex-text-secondary">
          You are signed in, but your account has not been added to Cortex Ops. Ask the
          workspace owner to grant access, then sign in again.
        </p>
        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="rounded-full border border-cortex-border px-4 py-2 text-sm text-cortex-text-primary transition hover:border-cortex-accent hover:text-cortex-accent"
          >
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
