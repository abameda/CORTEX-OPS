"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { Currency, Tier } from "@/types";

const TIERS: Array<{ value: Tier; label: string }> = [
  { value: "launch", label: "Launch" },
  { value: "build", label: "Build" },
  { value: "scale", label: "Scale" },
];

const CURRENCIES: Currency[] = ["EGP", "USD"];

export default function NewWorkspaceModal({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [tier, setTier] = useState<Tier>("launch");
  const [currency, setCurrency] = useState<Currency>("EGP");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName,
        businessName,
        tier,
        currency,
      }),
    });

    const data = (await response.json()) as { error?: string; workspace?: { id: string } };

    if (!response.ok || !data.workspace) {
      setError(data.error || "Failed to create workspace.");
      return;
    }

    setOpen(false);
    setClientName("");
    setBusinessName("");
    setTier("launch");
    setCurrency("EGP");

    startTransition(() => {
      router.push(`/workspace/${data.workspace!.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => setOpen(true)}
        className="rounded-full bg-cortex-accent px-5 py-3 text-sm font-semibold text-cortex-base transition hover:bg-cortex-accent-light disabled:cursor-not-allowed disabled:opacity-60"
      >
        New Workspace
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-xl rounded-[2rem] border border-cortex-border bg-cortex-surface p-6 shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-cortex-accent-light">
                  Manual Intake
                </p>
                <h2 className="mt-3 font-display text-2xl font-medium uppercase tracking-[0.04em]">
                  Create workspace
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-cortex-border px-3 py-1 text-sm text-cortex-text-secondary transition hover:border-cortex-accent hover:text-cortex-accent"
              >
                Close
              </button>
            </div>

            <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
              <label className="grid gap-2">
                <span className="text-sm text-cortex-text-secondary">Client name</span>
                <input
                  required
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                  className="rounded-2xl border border-cortex-border bg-cortex-base px-4 py-3 text-sm text-cortex-text-primary outline-none transition focus:border-cortex-accent"
                  placeholder="Mona El-Sayed"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm text-cortex-text-secondary">Business name</span>
                <input
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  className="rounded-2xl border border-cortex-border bg-cortex-base px-4 py-3 text-sm text-cortex-text-primary outline-none transition focus:border-cortex-accent"
                  placeholder="Optional"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm text-cortex-text-secondary">Tier</span>
                  <select
                    value={tier}
                    onChange={(event) => setTier(event.target.value as Tier)}
                    className="rounded-2xl border border-cortex-border bg-cortex-base px-4 py-3 text-sm text-cortex-text-primary outline-none transition focus:border-cortex-accent"
                  >
                    {TIERS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm text-cortex-text-secondary">Currency</span>
                  <select
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value as Currency)}
                    className="rounded-2xl border border-cortex-border bg-cortex-base px-4 py-3 text-sm text-cortex-text-primary outline-none transition focus:border-cortex-accent"
                  >
                    {CURRENCIES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {error ? (
                <p className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-cortex-border px-5 py-3 text-sm text-cortex-text-secondary transition hover:border-cortex-accent hover:text-cortex-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-full bg-cortex-accent px-5 py-3 text-sm font-semibold text-cortex-base transition hover:bg-cortex-accent-light disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? "Creating..." : "Create workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
