import { NextRequest, NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/auth";
import { badRequest, isUuid, notFound, readJsonBody, serverError } from "@/lib/http";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { saveTranscriptAndAdvance } from "@/lib/transcripts";

const MAX_TRANSCRIPT_CHARS = 500_000;
const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  // Previously this route wrote with the service-role key and no authorization
  // check. It now runs as the signed-in staff user, so RLS applies as well.
  const auth = await requireStaffApi();
  if (!auth.ok) {
    return auth.response;
  }
  const { supabase } = auth.context;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return notFound("Workspace not found.");
  }

  const body = await readJsonBody<{
    rawTranscript?: string;
    durationSeconds?: number | null;
    language?: string | null;
    extractedData?: Record<string, unknown> | null;
  }>(request);

  const rawTranscript =
    typeof body?.rawTranscript === "string" ? body.rawTranscript.trim() : "";
  if (!rawTranscript) {
    return badRequest("rawTranscript is required.");
  }

  if (rawTranscript.length > MAX_TRANSCRIPT_CHARS) {
    return NextResponse.json({ error: "Transcript is too long." }, { status: 413 });
  }

  const durationSeconds =
    typeof body?.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
      ? Math.max(0, Math.round(body.durationSeconds))
      : null;
  const language =
    typeof body?.language === "string" && LANGUAGE_PATTERN.test(body.language)
      ? body.language
      : "en";
  const extractedData =
    body?.extractedData && typeof body.extractedData === "object" && !Array.isArray(body.extractedData)
      ? body.extractedData
      : null;

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

    const result = await saveTranscriptAndAdvance(supabase, {
      workspaceId: id,
      rawTranscript,
      durationSeconds,
      language,
      extractedData: { ...(extractedData ?? {}), source: "manual" },
    });

    return NextResponse.json(result);
  } catch (error) {
    return serverError("workspace.transcript", error);
  }
}
