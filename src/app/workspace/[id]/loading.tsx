export default function WorkspaceLoading() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-81px)] w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <section className="h-32 animate-pulse rounded-[2rem] border border-cortex-border bg-cortex-surface" />
      <section className="h-72 animate-pulse rounded-[2rem] border border-cortex-border bg-cortex-surface" />
      <section className="h-72 animate-pulse rounded-[2rem] border border-cortex-border bg-cortex-surface" />
    </main>
  );
}
