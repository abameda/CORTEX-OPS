import { NextRequest, NextResponse } from "next/server";
import { getElevenLabsConfig } from "@/lib/integrations";
import { createAdminClient } from "@/lib/supabase-admin";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { saveTranscriptAndAdvance } from "@/lib/transcripts";

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

function formatTranscript(transcript: ElevenLabsTranscriptTurn[]) {
  return transcript
    .filter((turn) => typeof turn.message === "string" && turn.message.trim().length > 0)
    .map((turn) => {
      const role = turn.role === "agent" ? "Agent" : turn.role === "user" ? "Client" : "System";
      return `${role}: ${turn.message?.trim()}`;
    })
    .join("\n\n");
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function fetchConversation(conversationId: string) {
  const { apiKey } = getElevenLabsConfig();
  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
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

async function resolveWorkspaceId(
  supabase: ReturnType<typeof createAdminClient>,
  conversation: ElevenLabsConversationPayload
) {
  const dynamicVariables =
    conversation.conversation_initiation_client_data?.dynamic_variables ?? {};

  const explicitWorkspaceId =
    getString(dynamicVariables.workspace_id) || getString(dynamicVariables.workspaceId);
  if (explicitWorkspaceId) {
    return explicitWorkspaceId;
  }

  const calBookingId =
    getString(dynamicVariables.cal_booking_id) || getString(dynamicVariables.calBookingId);
  if (calBookingId) {
    const { data, error } = await supabase
      .from("stage_outputs")
      .select("workspace_id")
      .eq("stage", 1)
      .eq("stage_name", "discovery_call")
      .contains("input_data", { cal_booking_id: calBookingId })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data?.workspace_id) {
      return data.workspace_id as string;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as ElevenLabsWebhookPayload;
    const initialConversation = body.data;
    const webhookType = body.type ?? "unknown";

    if (body.type && body.type !== "post_call_transcription") {
      return NextResponse.json({ received: true, ignored: true, type: webhookType });
    }

    const conversationId = initialConversation?.conversation_id;
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversation_id is required in the ElevenLabs webhook payload." },
        { status: 400 }
      );
    }

    const conversation =
      initialConversation?.transcript && initialConversation.transcript.length > 0
        ? initialConversation
        : await fetchConversation(conversationId);

    const { agentId } = getElevenLabsConfig();
    if (conversation.agent_id !== agentId) {
      return NextResponse.json(
        { error: "Webhook agent_id does not match ELEVENLABS_AGENT_ID." },
        { status: 400 }
      );
    }

    const transcriptText = formatTranscript(conversation.transcript ?? []);
    if (!transcriptText) {
      return NextResponse.json(
        { error: "No transcript content was available for this ElevenLabs conversation." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const workspaceId = await resolveWorkspaceId(supabase, conversation);

    if (!workspaceId) {
      return NextResponse.json(
        {
          error:
            "Unable to resolve workspace. Pass workspace_id or cal_booking_id in ElevenLabs dynamic variables.",
        },
        { status: 400 }
      );
    }

    const transcriptExistsQuery = await supabase
      .from("transcripts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .contains("extracted_data", { conversation_id: conversationId })
      .limit(1)
      .maybeSingle();

    if (transcriptExistsQuery.error) {
      throw transcriptExistsQuery.error;
    }

    if (transcriptExistsQuery.data) {
      return NextResponse.json({
        received: true,
        deduplicated: true,
        workspaceId,
        conversationId,
      });
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
        status: conversation.status ?? null,
        summary: conversation.analysis?.transcript_summary ?? null,
        metadata: conversation.metadata ?? null,
        dynamic_variables:
          conversation.conversation_initiation_client_data?.dynamic_variables ?? null,
      },
    });

    return NextResponse.json({
      ...result,
      received: true,
      workspaceId,
      conversationId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process ElevenLabs webhook.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
