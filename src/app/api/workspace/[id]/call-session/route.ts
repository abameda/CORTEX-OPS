import { NextRequest, NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/auth";
import { buildCallLink, generateCallToken } from "@/lib/call-sessions";
import { isUuid, notFound, readJsonBody, serverError } from "@/lib/http";
import { getCallPageUrl } from "@/lib/integrations";
import { isSupabaseConfigured } from "@/lib/supabase-config";

const DEFAULT_VALID_HOURS = 72;
const MAX_VALID_HOURS = 14 * 24;
const DEFAULT_MAX_MINUTES = 35;

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? Math.round(value) : NaN;
  return Number.isFinite(numeric) ? Math.min(Math.max(numeric, min), max) : fallback;
}

// Staff-only: issues a single-use discovery-call link bound to this workspace.
// Only the token's SHA-256 is stored; the raw token is returned once.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const auth = await requireStaffApi();
  if (!auth.ok) {
    return auth.response;
  }
  const { supabase, user } = auth.context;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return notFound("Workspace not found.");
  }

  const body = await readJsonBody<{ validHours?: number; maxDurationMinutes?: number }>(request);
  const validHours = clampInteger(body?.validHours, DEFAULT_VALID_HOURS, 1, MAX_VALID_HOURS);
  const maxDurationMinutes = clampInteger(body?.maxDurationMinutes, DEFAULT_MAX_MINUTES, 5, 60);

  try {
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (workspaceError) {
      throw workspaceError;
    }

    if (!workspace) {
      return notFound("Workspace not found.");
    }

    const { token, tokenHash } = generateCallToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + validHours * 3_600_000);

    const { data: session, error: insertError } = await supabase
      .from("call_sessions")
      .insert({
        workspace_id: id,
        token_hash: tokenHash,
        not_before: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        max_duration_seconds: maxDurationMinutes * 60,
        created_by: user.id,
      })
      .select("id, expires_at, max_duration_seconds")
      .single();

    if (insertError) {
      throw insertError;
    }

    const callPageUrl = getCallPageUrl();

    return NextResponse.json(
      {
        callSessionId: session.id,
        expiresAt: session.expires_at,
        maxDurationSeconds: session.max_duration_seconds,
        url: callPageUrl ? buildCallLink(callPageUrl, token) : null,
        token,
      },
      { status: 201 }
    );
  } catch (error) {
    return serverError("workspace.call_session", error);
  }
}
