import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type WebhookProvider = "cal" | "elevenlabs";
export type WebhookClaim = "claimed" | "duplicate" | "in_progress";

// How long an unfinished claim blocks retries. A run that crashed or timed out
// between claim and completion leaves processed_at null; after this lease the
// next provider retry may take the claim over. It must stay well above the
// webhook routes' maxDuration (60s), so a live handler's claim is never taken.
const CLAIM_LEASE_MS = 5 * 60 * 1000;

export function safeCompare(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

export function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// Records the event before it is processed:
// - "claimed":     this request owns the event and must call completeWebhookEvent
//                  on success or releaseWebhookEvent on failure.
// - "duplicate":   the event was already processed (a replay or a retry after
//                  success), so it must not be applied again.
// - "in_progress": another request holds a fresh claim. Respond with a non-2xx
//                  status so the provider retries later instead of dropping it.
export async function claimWebhookEvent(
  supabase: SupabaseClient,
  provider: WebhookProvider,
  eventKey: string
): Promise<WebhookClaim> {
  const { error } = await supabase
    .from("webhook_events")
    .insert({ provider, event_key: eventKey });

  if (!error) {
    return "claimed";
  }

  if (error.code !== "23505") {
    throw error;
  }

  // Take over a claim abandoned by a crashed run (single atomic UPDATE).
  const staleBefore = new Date(Date.now() - CLAIM_LEASE_MS).toISOString();
  const { data: reclaimed, error: reclaimError } = await supabase
    .from("webhook_events")
    .update({ received_at: new Date().toISOString() })
    .eq("provider", provider)
    .eq("event_key", eventKey)
    .is("processed_at", null)
    .lt("received_at", staleBefore)
    .select("id")
    .maybeSingle();

  if (reclaimError) {
    throw reclaimError;
  }

  if (reclaimed) {
    console.warn("[webhook] reclaimed an abandoned event claim", { provider, eventKey });
    return "claimed";
  }

  const { data: existing, error: readError } = await supabase
    .from("webhook_events")
    .select("processed_at")
    .eq("provider", provider)
    .eq("event_key", eventKey)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  return existing?.processed_at ? "duplicate" : "in_progress";
}

// Marks a claimed event as handled, so later deliveries are duplicates.
export async function completeWebhookEvent(
  supabase: SupabaseClient,
  provider: WebhookProvider,
  eventKey: string
) {
  const { error } = await supabase
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider", provider)
    .eq("event_key", eventKey);

  if (error) {
    // Non-fatal: the work is done. A retry after the lease would be applied
    // idempotently (transcripts dedupe, workspaces bind by booking uid).
    console.error("[webhook] failed to mark event processed", { provider, eventKey, error });
  }
}

// Releases a claim when processing failed, so the provider's retry can succeed.
export async function releaseWebhookEvent(
  supabase: SupabaseClient,
  provider: WebhookProvider,
  eventKey: string
) {
  const { error } = await supabase
    .from("webhook_events")
    .delete()
    .eq("provider", provider)
    .eq("event_key", eventKey);

  if (error) {
    console.error("[webhook] failed to release event claim", { provider, eventKey, error });
  }
}
