import { NextRequest, NextResponse } from "next/server";
import { getDefaultStageName } from "@/lib/pipeline";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { createClient } from "@/lib/supabase-server";

async function ensureStageRecord(
  workspaceId: string,
  stage: number,
  stageName: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  values?: Record<string, unknown>
) {
  const { data: existing, error } = await supabase
    .from("stage_outputs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("stage", stage)
    .eq("stage_name", stageName)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from("stage_outputs")
      .update(values ?? {})
      .eq("id", existing.id);

    if (updateError) {
      throw updateError;
    }

    return;
  }

  const { error: insertError } = await supabase.from("stage_outputs").insert({
    workspace_id: workspaceId,
    stage,
    stage_name: stageName,
    ...(values ?? {}),
  });

  if (insertError) {
    throw insertError;
  }
}

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

  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      rawTranscript?: string;
      durationSeconds?: number | null;
      language?: string | null;
      extractedData?: Record<string, unknown> | null;
    };

    const rawTranscript = body.rawTranscript?.trim();
    if (!rawTranscript) {
      return NextResponse.json({ error: "rawTranscript is required." }, { status: 400 });
    }

    const supabase = await createClient();

    const { error: transcriptError } = await supabase.from("transcripts").insert({
      workspace_id: id,
      raw_transcript: rawTranscript,
      duration_seconds: body.durationSeconds ?? null,
      language: body.language ?? "en",
      extracted_data: body.extractedData ?? null,
    });

    if (transcriptError) {
      throw transcriptError;
    }

    await ensureStageRecord(id, 1, "discovery_call", supabase, {
      raw_output: rawTranscript,
      output_data: {
        transcript_saved: true,
      },
      status: "completed",
      completed_at: new Date().toISOString(),
    });

    await ensureStageRecord(id, 2, getDefaultStageName(2), supabase, {
      status: "pending",
    });

    const { error: workspaceError } = await supabase
      .from("workspaces")
      .update({
        current_stage: 2,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (workspaceError) {
      throw workspaceError;
    }

    return NextResponse.json({ success: true, nextStage: 2 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save transcript.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
