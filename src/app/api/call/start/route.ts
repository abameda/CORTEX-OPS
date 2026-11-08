import { NextRequest, NextResponse } from "next/server";
import { hashCallToken } from "@/lib/call-sessions";
import { readJsonBody, serverError } from "@/lib/http";
import {
  getCallAllowedOrigins,
  getElevenLabsApiBaseUrl,
  getOptionalElevenLabsConfig,
} from "@/lib/integrations";
import { createAdminClient } from "@/lib/supabase-admin";
import { isSupabaseConfigured } from "@/lib/supabase-config";

// Public endpoint used by the marketing site's /call page. It is excluded from
// the auth middleware: the single-use call token IS the credential. A valid,
// unused, in-window token is consumed atomically and exchanged for a short-lived
// ElevenLabs conversation token for the private agent, so the ElevenLabs API key
// never reaches the browser and nobody can start a call without a link.

const INVALID_LINK = "This call link is invalid, already used, or expired.";

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !getCallAllowedOrigins().includes(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function originAllowed(origin: string | null) {
  // Non-browser callers send no Origin; they still need a valid token.
  return !origin || getCallAllowedOrigins().includes(origin);
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!originAllowed(origin)) {
    return new NextResponse(null, { status: 403 });
  }

  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!originAllowed(origin)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  const headers = corsHeaders(origin);
  const elevenLabs = getOptionalElevenLabsConfig();

  if (!isSupabaseConfigured() || !elevenLabs) {
    return NextResponse.json(
      { error: "Calls are not available right now." },
      { status: 503, headers }
    );
  }

  const body = await readJsonBody<{ token?: string }>(request);
  const tokenHash = hashCallToken(body?.token);
  if (!tokenHash) {
    return NextResponse.json({ error: INVALID_LINK }, { status: 404, headers });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Single atomic UPDATE: only one request can move a session from issued to
  // started, so a link can never start two calls.
  const { data: session, error: consumeError } = await supabase
    .from("call_sessions")
    .update({ status: "started", started_at: now })
    .eq("token_hash", tokenHash)
    .eq("status", "issued")
    .lte("not_before", now)
    .gt("expires_at", now)
    .select("id, max_duration_seconds")
    .maybeSingle();

  if (consumeError) {
    return serverError("call.start.consume", consumeError);
  }

  if (!session) {
    return NextResponse.json({ error: INVALID_LINK }, { status: 404, headers });
  }

  try {
    const response = await fetch(
      `${getElevenLabsApiBaseUrl()}/v1/convai/conversation/token?agent_id=${encodeURIComponent(
        elevenLabs.agentId
      )}`,
      {
        headers: { "xi-api-key": elevenLabs.apiKey },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }
    );

    const data = response.ok ? ((await response.json()) as { token?: unknown }) : null;
    if (!data || typeof data.token !== "string" || !data.token) {
      throw new Error(`ElevenLabs token request failed (${response.status}).`);
    }

    return NextResponse.json(
      {
        conversationToken: data.token,
        callSessionId: session.id,
        maxDurationSeconds: session.max_duration_seconds,
      },
      { headers }
    );
  } catch (error) {
    // Give the link back so the client can retry after a provider outage.
    await supabase
      .from("call_sessions")
      .update({ status: "issued", started_at: null })
      .eq("id", session.id)
      .eq("status", "started");

    console.error("[call.start] conversation token request failed", error);
    return NextResponse.json(
      { error: "Could not start the call. Please try again in a moment." },
      { status: 502, headers }
    );
  }
}
