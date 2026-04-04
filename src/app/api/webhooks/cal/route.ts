import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCalWebhookSecret, parseCurrency, parseTier } from "@/lib/integrations";
import { createAdminClient } from "@/lib/supabase-admin";
import { isSupabaseConfigured } from "@/lib/supabase-config";

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

function safeCompare(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

async function ensureDiscoveryStage(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  bookingId: string | null,
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

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-cal-signature-256");
    const expectedSignature = crypto
      .createHmac("sha256", getCalWebhookSecret())
      .update(rawBody)
      .digest("hex");

    if (!signature || !safeCompare(signature, expectedSignature)) {
      return NextResponse.json({ error: "Invalid Cal webhook signature." }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as CalWebhookPayload;
    const event = body.triggerEvent?.toUpperCase();

    if (!event || !body.payload) {
      return NextResponse.json({ error: "Malformed Cal webhook payload." }, { status: 400 });
    }

    if (!["BOOKING_CREATED", "BOOKING_REQUESTED", "BOOKING_RESCHEDULED"].includes(event)) {
      return NextResponse.json({ received: true, ignored: true, event });
    }

    const payload = body.payload;
    const responses = payload.responses ?? {};
    const customInputs = payload.customInputs ?? {};
    const metadata = payload.metadata ?? {};
    const attendee = payload.attendees?.[0];
    const metadataRecord = metadata as Record<string, unknown>;

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
    const workspaceId =
      typeof metadataRecord.workspace_id === "string" ? metadataRecord.workspace_id : null;
    const bookingId = payload.uid ?? null;
    const tier = parseTier(
      getStringValue(customInputs.tier) ||
        (typeof metadataRecord.tier === "string" ? metadataRecord.tier : null)
    );
    const currency = parseCurrency(
      getStringValue(customInputs.currency) ||
        (typeof metadataRecord.currency === "string" ? metadataRecord.currency : null)
    );

    const supabase = createAdminClient();
    let resolvedWorkspaceId = workspaceId;

    if (workspaceId) {
      const { error: updateError } = await supabase
        .from("workspaces")
        .update({
          client_name: clientName,
          business_name: businessName,
          tier,
          currency,
          updated_at: new Date().toISOString(),
        })
        .eq("id", workspaceId);

      if (updateError) {
        throw updateError;
      }
    } else {
      const { data: workspace, error: insertError } = await supabase
        .from("workspaces")
        .insert({
          client_name: clientName,
          business_name: businessName,
          tier,
          currency,
          current_stage: 1,
          status: "active",
        })
        .select("id")
        .single();

      if (insertError || !workspace) {
        throw insertError ?? new Error("Failed to create workspace from Cal webhook.");
      }

      resolvedWorkspaceId = workspace.id;
    }

    if (!resolvedWorkspaceId) {
      throw new Error("Unable to resolve workspace for Cal webhook.");
    }

    await ensureDiscoveryStage(supabase, resolvedWorkspaceId, bookingId, payload);

    return NextResponse.json({
      received: true,
      event,
      workspaceId: resolvedWorkspaceId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process Cal webhook.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
