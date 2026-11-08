import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { badRequest, serverError } from "@/lib/http";
import {
  getCalWebhookMaxAgeMs,
  getCalWebhookSecret,
  parseCurrency,
  parseTier,
} from "@/lib/integrations";
import { createAdminClient } from "@/lib/supabase-admin";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import {
  claimWebhookEvent,
  completeWebhookEvent,
  releaseWebhookEvent,
  safeCompare,
  sha256Hex,
} from "@/lib/webhook-security";

type CalPayloadValue =
  | string
  | number
  | boolean
  | null
  | { value?: string | number | boolean | null; label?: string };

interface CalWebhookPayload {
  triggerEvent?: string;
  createdAt?: string;
  payload?: {
    uid?: string;
    rescheduleUid?: string;
    fromReschedule?: string;
    title?: string;
    startTime?: string;
    responses?: Record<string, CalPayloadValue>;
    attendees?: Array<{
      name?: string;
      email?: string;
    }>;
    customInputs?: Record<string, CalPayloadValue>;
    metadata?: Record<string, unknown>;
  };
}

// Hard cap on handler runtime. It must stay well below the webhook claim lease
// in src/lib/webhook-security.ts (5 minutes), so a retry can never take over a
// claim that a still-running handler holds.
export const maxDuration = 60;
const HANDLED_EVENTS = ["BOOKING_CREATED", "BOOKING_REQUESTED", "BOOKING_RESCHEDULED"];
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function getStringValue(value: CalPayloadValue | unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (
    value &&
    typeof value === "object" &&
    "value" in value &&
    typeof value.value === "string"
  ) {
    return value.value.trim();
  }

  return "";
}

async function ensureDiscoveryStage(
  supabase: SupabaseClient,
  workspaceId: string,
  bookingId: string,
  payload: CalWebhookPayload["payload"]
) {
  const { data: existing, error } = await supabase
    .from("stage_outputs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("stage", 1)
    .eq("stage_name", "discovery_call")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const stageInput = {
    source: "cal_webhook",
    cal_booking_id: bookingId,
    booking_title: payload?.title ?? null,
    scheduled_at: payload?.startTime ?? null,
  };

  if (existing) {
    const { error: updateError } = await supabase
      .from("stage_outputs")
      .update({ input_data: stageInput })
      .eq("id", existing.id);

    if (updateError) {
      throw updateError;
    }

    return;
  }

  const { error: insertError } = await supabase.from("stage_outputs").insert({
    workspace_id: workspaceId,
    stage: 1,
    stage_name: "discovery_call",
    status: "pending",
    input_data: stageInput,
  });

  if (insertError) {
    throw insertError;
  }
}

// Binds the booking to a workspace using only Cal.com's own booking UID.
// payload.metadata.workspace_id is deliberately ignored: booking metadata can be
// set by whoever opens the public booking page, so trusting it let anyone
// overwrite any workspace.
async function upsertWorkspaceForBooking(
  supabase: SupabaseClient,
  bookingUid: string,
  payload: NonNullable<CalWebhookPayload["payload"]>
) {
  const candidateUids = Array.from(
    new Set(
      [bookingUid, payload.rescheduleUid, payload.fromReschedule].filter(
        (uid): uid is string => typeof uid === "string" && uid.trim().length > 0
      )
    )
  );

  const { data: existing, error: lookupError } = await supabase
    .from("workspaces")
    .select("id, cal_booking_uid")
    .in("cal_booking_uid", candidateUids)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  if (existing) {
    // A reschedule moves the booking to a new UID. Staff-managed fields
    // (client name, tier, currency) are never overwritten by a booking.
    if (existing.cal_booking_uid !== bookingUid) {
      const { error: updateError } = await supabase
        .from("workspaces")
        .update({ cal_booking_uid: bookingUid, updated_at: new Date().toISOString() })
        .eq("id", existing.id);

      if (updateError) {
        throw updateError;
      }
    }

    return existing.id as string;
  }

  const responses = payload.responses ?? {};
  const customInputs = payload.customInputs ?? {};
  const attendee = payload.attendees?.[0];

  const clientName =
    attendee?.name ||
    getStringValue(responses.name) ||
    getStringValue(responses.email) ||
    "Cal.com intake";
  const businessName =
    getStringValue(customInputs.businessName) ||
    getStringValue(customInputs.business_name) ||
    getStringValue(responses.company) ||
    getStringValue(responses.businessName) ||
    null;

  const { data: created, error: insertError } = await supabase
    .from("workspaces")
    .insert({
      client_name: clientName.slice(0, 200),
      business_name: businessName ? businessName.slice(0, 200) : null,
      tier: parseTier(getStringValue(customInputs.tier)),
      currency: parseCurrency(getStringValue(customInputs.currency)),
      current_stage: 1,
      status: "active",
      cal_booking_uid: bookingUid,
    })
    .select("id")
    .single();

  if (!insertError && created) {
    return created.id as string;
  }

  // Two deliveries for the same booking raced; the other one created it.
  if (insertError?.code === "23505") {
    const { data: raced, error: racedError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("cal_booking_uid", bookingUid)
      .single();

    if (racedError) {
      throw racedError;
    }

    return raced.id as string;
  }

  throw insertError ?? new Error("Failed to create workspace from Cal webhook.");
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  let secret: string;
  try {
    secret = getCalWebhookSecret();
  } catch (error) {
    return serverError("webhook.cal.config", error);
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-cal-signature-256");
  const expectedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  if (!signature || !safeCompare(signature, expectedSignature)) {
    return NextResponse.json({ error: "Invalid Cal webhook signature." }, { status: 401 });
  }

  let body: CalWebhookPayload;
  try {
    body = JSON.parse(rawBody) as CalWebhookPayload;
  } catch {
    return badRequest("Malformed Cal webhook payload.");
  }

  const event = body.triggerEvent?.toUpperCase();
  if (!event || !body.payload) {
    return badRequest("Malformed Cal webhook payload.");
  }

  // Cal.com signs the body but not a timestamp, so freshness is checked on the
  // signed createdAt and exact replays are blocked by the event claim below.
  const createdAtMs = Date.parse(body.createdAt ?? "");
  if (!Number.isFinite(createdAtMs)) {
    return badRequest("Cal webhook payload is missing createdAt.");
  }

  const ageMs = Date.now() - createdAtMs;
  if (ageMs > getCalWebhookMaxAgeMs() || ageMs < -MAX_CLOCK_SKEW_MS) {
    return NextResponse.json({ error: "Stale Cal webhook delivery." }, { status: 401 });
  }

  if (!HANDLED_EVENTS.includes(event)) {
    return NextResponse.json({ received: true, ignored: true, event });
  }

  const bookingUid = typeof body.payload.uid === "string" ? body.payload.uid.trim() : "";
  if (!bookingUid) {
    return badRequest("Cal webhook payload is missing the booking uid.");
  }

  const supabase = createAdminClient();
  const eventKey = sha256Hex(rawBody);

  try {
    const claim = await claimWebhookEvent(supabase, "cal", eventKey);
    if (claim === "duplicate") {
      return NextResponse.json({ received: true, duplicate: true, event });
    }
    if (claim === "in_progress") {
      return NextResponse.json(
        { error: "This delivery is already being processed. Retry later." },
        { status: 409 }
      );
    }
  } catch (error) {
    return serverError("webhook.cal.claim", error);
  }

  try {
    const workspaceId = await upsertWorkspaceForBooking(supabase, bookingUid, body.payload);
    await ensureDiscoveryStage(supabase, workspaceId, bookingUid, body.payload);
    await completeWebhookEvent(supabase, "cal", eventKey);

    return NextResponse.json({ received: true, event, workspaceId });
  } catch (error) {
    await releaseWebhookEvent(supabase, "cal", eventKey);
    return serverError("webhook.cal", error);
  }
}
