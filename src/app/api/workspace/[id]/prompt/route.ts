import { NextRequest, NextResponse } from "next/server";
import { generatePromptForStage } from "@/lib/prompts";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { createClient } from "@/lib/supabase-server";

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

  const stage = Number(request.nextUrl.searchParams.get("stage"));
  if (!stage) {
    return NextResponse.json({ error: "Stage query param is required." }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const supabase = await createClient();

    const [{ data: workspace, error: workspaceError }, { data: transcript }, { data: outputs, error: outputsError }] =
      await Promise.all([
        supabase.from("workspaces").select("*").eq("id", id).single(),
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

    if (workspaceError || !workspace) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    if (outputsError) {
      throw outputsError;
    }

    const result = await generatePromptForStage(workspace, stage, transcript ?? null, outputs ?? []);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate prompt.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
