import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { badRequest, isUuid, serverError } from "@/lib/http";
import {
  getElevenLabsApiBaseUrl,
  getElevenLabsConfig,
  getElevenLabsWebhookSecret,
} from "@/lib/integrations";
import { createAdminClient } from "@/lib/supabase-admin";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { saveTranscriptAndAdvance } from "@/lib/transcripts";
import {
  claimWebhookEvent,
  completeWebhookEvent,
  releaseWebhookEvent,
  safeCompare,
} from "@/lib/webhook-security";

interface ElevenLabsTranscriptTurn {
  role?: string;
  message?: string;
  time_in_call_secs?: number;
}

interface ElevenLabsConversationPayload {
  agent_id?: string;
  conversation_id?: string;
  status?: string;
  transcript?: ElevenLabsTranscriptTurn[];
  metadata?: {
    call_duration_secs?: number;
    [key: string]: unknown;
  };
  analysis?: {
    transcript_summary?: string;
    [key: string]: unknown;
  } | null;
  conversation_initiation_client_data?: {
    dynamic_variables?: Record<string, unknown>;
    [key: string]: unknown;
  } | null;
}

interface ElevenLabsWebhookPayload {
  type?: string;
  data?: ElevenLabsConversationPayload;
}

const ELEVENLABS_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

function formatTranscript(transcript: ElevenLabsTranscriptTurn[]) {
  return transcript
    .filter((turn) => typeof turn.message === "string" && turn.message.trim().length > 0)
    .map((turn) => {
      const role = turn.role === "agent" ? "Agent" : turn.role === "user" ? "Client" : "System";
      return `${role}: ${turn.message?.trim()}`;
    })
    .join("\n\n");
}

function parseSignatureHeader(signatureHeader: string) {
  const parts = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) ?? null;
  const signatures = parts
    .filter((part) => part.startsWith("v0="))
    .map((part) => part.slice(3))
    .filter(Boolean);

  return { timestamp, signatures };
}

function verifyElevenLabsSignature(rawBody: string, signatureHeader: string, secret: string) {
  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  if (Math.abs(Date.now() - timestampMs) > ELEVENLABS_SIGNATURE_TOLERANCE_MS) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return signatures.some((signature) => safeCompare(signature, expectedSignature));
}

async function fetchConversation(conversationId: string) {
  const { apiKey } = getElevenLabsConfig();
  const response = await fetch(
    `${getElevenLabsApiBaseUrl()}/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
    {
      headers: {
        "xi-api-key": apiKey,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch ElevenLabs conversation ${conversationId}.`);
  }

  return (await response.json()) as ElevenLabsConversationPayload;
}

// Binds the conversation to the call session that was issued server-side and
// consumed by /api/call/start. The session id reaches the client only through
// that endpoint (after a valid single-use token), so it cannot be guessed or
// pointed at another workspace. The previous workspace_id / cal_booking_id
// dynamic variables were client-controlled and are no longer accepted.
async function bindCallSession(
  supabase: SupabaseClient,
  callSessionId: string,
  conversationId: string
) {
  const { data, error } = await supabase
    .from("call_sessions")
    .update({
      conversation_id: conversationId,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", callSessionId)
    .eq("status", "started")
    .is("conversation_id", null)
    .select("workspace_id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return data.workspace_id as string;
  }

  // Retry after a failed save: the session is already bound to this same
  // conversation, so processing may continue. Any other state is rejected.
  const { data: alreadyBound, error: boundError } = await supabase
    .from("call_sessions")
    .select("workspace_id")
    .eq("id", callSessionId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (boundError) {
    throw boundError;
  }

  return (alreadyBound?.workspace_id as string | undefined) ?? null;
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  let secret: string;
  let agentId: string;
  try {
    secret = getElevenLabsWebhookSecret();
    agentId = getElevenLabsConfig().agentId;
  } catch (error) {
    return serverError("webhook.elevenlabs.config", error);
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("ElevenLabs-Signature");

  if (!signatureHeader || !verifyElevenLabsSignature(rawBody, signatureHeader, secret)) {
    return NextResponse.json(
      { error: "Invalid ElevenLabs webhook signature." },
      { status: 401 }
    );
  }

  let body: ElevenLabsWebhookPayload;
  try {
    body = JSON.parse(rawBody) as ElevenLabsWebhookPayload;
  } catch {
    return badRequest("Malformed ElevenLabs webhook payload.");
  }

  const webhookType = body.type ?? "unknown";
  if (body.type && body.type !== "post_call_transcription") {
    return NextResponse.json({ received: true, ignored: true, type: webhookType });
  }

  const conversationId = body.data?.conversation_id;
  if (!conversationId || typeof conversationId !== "string") {
    return badRequest("conversation_id is required in the ElevenLabs webhook payload.");
  }

  const supabase = createAdminClient();
  const eventKey = `post_call_transcription:${conversationId}`;

  try {
    const claim = await claimWebhookEvent(supabase, "elevenlabs", eventKey);
    if (claim === "duplicate") {
      return NextResponse.json({ received: true, duplicate: true, conversationId });
    }
    if (claim === "in_progress") {
      return NextResponse.json(
        { error: "This conversation is already being processed. Retry later." },
        { status: 409 }
      );
    }
  } catch (error) {
    return serverError("webhook.elevenlabs.claim", error);
  }

  try {
    const result = await processConversation(supabase, body.data, conversationId, agentId);
    // Ignored outcomes are final too: retrying them cannot change the result.
    await completeWebhookEvent(supabase, "elevenlabs", eventKey);
    return NextResponse.json(result);
  } catch (error) {
    await releaseWebhookEvent(supabase, "elevenlabs", eventKey);
    return serverError("webhook.elevenlabs", error);
  }
}

async function processConversation(
  supabase: SupabaseClient,
  initialConversation: ElevenLabsConversationPayload | undefined,
  conversationId: string,
  agentId: string
): Promise<Record<string, unknown>> {
  const conversation =
    initialConversation?.transcript && initialConversation.transcript.length > 0
      ? initialConversation
      : await fetchConversation(conversationId);

  if (conversation.agent_id !== agentId) {
    console.warn("[webhook.elevenlabs] agent_id mismatch", { conversationId });
    return { received: true, ignored: "agent_mismatch" };
  }

  const transcriptText = formatTranscript(conversation.transcript ?? []);
  if (!transcriptText) {
    return { received: true, ignored: "empty_transcript" };
  }

  const callSessionId =
    conversation.conversation_initiation_client_data?.dynamic_variables?.call_session_id;
  if (!isUuid(callSessionId)) {
    console.warn("[webhook.elevenlabs] conversation without a call session", {
      conversationId,
    });
    return { received: true, ignored: "unbound_conversation" };
  }

  const workspaceId = await bindCallSession(supabase, callSessionId, conversationId);
  if (!workspaceId) {
    console.warn("[webhook.elevenlabs] call session not active", {
      conversationId,
      callSessionId,
    });
    return { received: true, ignored: "session_not_active" };
  }

  const result = await saveTranscriptAndAdvance(supabase, {
    workspaceId,
    rawTranscript: transcriptText,
    durationSeconds: conversation.metadata?.call_duration_secs ?? null,
    language: "en",
    extractedData: {
      source: "elevenlabs_webhook",
      agent_id: conversation.agent_id ?? null,
      conversation_id: conversation.conversation_id ?? null,
      call_session_id: callSessionId,
      status: conversation.status ?? null,
      summary: conversation.analysis?.transcript_summary ?? null,
      metadata: conversation.metadata ?? null,
    },
  });

  return {
    ...result,
    received: true,
    workspaceId,
    conversationId,
  };
}
