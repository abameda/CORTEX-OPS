import { getDefaultStageName } from "@/lib/pipeline";
import { createAdminClient } from "@/lib/supabase-admin";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

async function ensureStageRecord(
  workspaceId: string,
  stage: number,
  stageName: string,
  supabase: SupabaseAdminClient,
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

export interface SaveTranscriptInput {
  workspaceId: string;
  rawTranscript: string;
  durationSeconds?: number | null;
  language?: string | null;
  extractedData?: Record<string, unknown> | null;
}

export async function saveTranscriptAndAdvance(
  supabase: SupabaseAdminClient,
  input: SaveTranscriptInput
) {
  const rawTranscript = input.rawTranscript.trim();
  if (!rawTranscript) {
    throw new Error("rawTranscript is required.");
  }

  const existingTranscriptQuery = await supabase
    .from("transcripts")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("raw_transcript", rawTranscript)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingTranscriptQuery.error) {
    throw existingTranscriptQuery.error;
  }

  if (!existingTranscriptQuery.data) {
    const { error: transcriptError } = await supabase.from("transcripts").insert({
      workspace_id: input.workspaceId,
      raw_transcript: rawTranscript,
      duration_seconds: input.durationSeconds ?? null,
      language: input.language ?? "en",
      extracted_data: input.extractedData ?? null,
    });

    if (transcriptError) {
      throw transcriptError;
    }
  }

  await ensureStageRecord(input.workspaceId, 1, "discovery_call", supabase, {
    raw_output: rawTranscript,
    output_data: {
      transcript_saved: true,
      source: input.extractedData?.source ?? "manual",
    },
    status: "completed",
    completed_at: new Date().toISOString(),
  });

  await ensureStageRecord(input.workspaceId, 2, getDefaultStageName(2), supabase, {
    status: "pending",
  });

  const { error: workspaceError } = await supabase
    .from("workspaces")
    .update({
      current_stage: 2,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.workspaceId);

  if (workspaceError) {
    throw workspaceError;
  }

  return { success: true, nextStage: 2 };
}
