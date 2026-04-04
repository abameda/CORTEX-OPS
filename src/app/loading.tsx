export default function DashboardLoading() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-81px)] w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <section className="h-40 animate-pulse rounded-3xl border border-cortex-border bg-cortex-surface/80" />
      <section className="grid gap-4 md:grid-cols-3">
        <div className="h-28 animate-pulse rounded-3xl border border-cortex-border bg-cortex-surface" />
        <div className="h-28 animate-pulse rounded-3xl border border-cortex-border bg-cortex-surface" />
        <div className="h-28 animate-pulse rounded-3xl border border-cortex-border bg-cortex-surface" />
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-48 animate-pulse rounded-[1.75rem] border border-cortex-border bg-cortex-surface" />
        <div className="h-48 animate-pulse rounded-[1.75rem] border border-cortex-border bg-cortex-surface" />
        <div className="h-48 animate-pulse rounded-[1.75rem] border border-cortex-border bg-cortex-surface" />
      </section>
    </main>
  );
}
