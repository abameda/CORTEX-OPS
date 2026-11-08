import { NextRequest, NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/auth";
import { badRequest, isUuid, notFound, serverError } from "@/lib/http";
import { generatePromptForStage } from "@/lib/prompts";
import { isSupabaseConfigured } from "@/lib/supabase-config";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const auth = await requireStaffApi();
  if (!auth.ok) {
    return auth.response;
  }
  const { supabase } = auth.context;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return notFound("Workspace not found.");
  }

  const stage = Number(request.nextUrl.searchParams.get("stage"));
  if (!Number.isInteger(stage) || stage < 1 || stage > 6) {
    return badRequest("Stage query param must be an integer from 1 to 6.");
  }

  const [workspaceResult, transcriptResult, outputsResult] = await Promise.all([
    supabase.from("workspaces").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("transcripts")
      .select("*")
      .eq("workspace_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("stage_outputs")
      .select("*")
      .eq("workspace_id", id)
      .order("stage", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const queryError = workspaceResult.error || transcriptResult.error || outputsResult.error;
  if (queryError) {
    return serverError("workspace.prompt", queryError);
  }

  if (!workspaceResult.data) {
    return notFound("Workspace not found.");
  }

  try {
    const result = await generatePromptForStage(
      workspaceResult.data,
      stage,
      transcriptResult.data ?? null,
      outputsResult.data ?? []
    );
    return NextResponse.json(result);
  } catch (error) {
    // generatePromptForStage only throws precondition messages written for
    // operators ("Complete Stage 1 first."), never database errors.
    const message = error instanceof Error ? error.message : "Failed to generate prompt.";
    return badRequest(message);
  }
}
