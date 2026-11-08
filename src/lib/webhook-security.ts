import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type WebhookProvider = "cal" | "elevenlabs";

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

// Records the event before it is processed. A second delivery of the same event
// (a replay or a provider retry after success) hits the unique constraint and is
// reported as a duplicate, so it can never be applied twice.
export async function claimWebhookEvent(
  supabase: SupabaseClient,
  provider: WebhookProvider,
  eventKey: string
): Promise<"claimed" | "duplicate"> {
  const { error } = await supabase
    .from("webhook_events")
    .insert({ provider, event_key: eventKey });

  if (!error) {
    return "claimed";
  }

  if (error.code === "23505") {
    return "duplicate";
  }

  throw error;
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
