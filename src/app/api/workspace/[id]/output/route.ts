import { NextRequest, NextResponse } from "next/server";
import {
  getDefaultStageName,
  getNextRelevantStage,
  getStageOutputs,
  isStageThreeComplete,
} from "@/lib/pipeline";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { createClient } from "@/lib/supabase-server";
import { Workspace } from "@/types";

async function ensureStageEntry(
  workspaceId: string,
  stage: number,
  stageName: string,
  supabase: Awaited<ReturnType<typeof createClient>>
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

  if (!existing) {
    const { error: insertError } = await supabase.from("stage_outputs").insert({
      workspace_id: workspaceId,
      stage,
      stage_name: stageName,
      status: "pending",
    });

    if (insertError) {
      throw insertError;
    }
  }
}

async function advanceWorkspaceIfNeeded(
  workspace: Workspace,
  stage: number,
  allOutputs: Parameters<typeof isStageThreeComplete>[0],
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  let nextStage: number | null = null;

  if (stage === 3) {
    if (isStageThreeComplete(allOutputs)) {
      nextStage = getNextRelevantStage(3, workspace.tier);
    }
  } else {
    nextStage = getNextRelevantStage(stage, workspace.tier);
  }

  if (!nextStage || workspace.current_stage >= nextStage) {
    if (stage >= 5) {
      const { error: completionError } = await supabase
        .from("workspaces")
        .update({
          status: workspace.tier === "scale" && stage === 5 ? workspace.status : "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", workspace.id);

      if (completionError) {
        throw completionError;
      }
    }

    return { nextStage: null };
  }

  const { error: workspaceError } = await supabase
    .from("workspaces")
    .update({
      current_stage: nextStage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspace.id);

  if (workspaceError) {
    throw workspaceError;
  }

  if (stage === 5) {
    const { error: statusError } = await supabase
      .from("workspaces")
      .update({
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspace.id);

    if (statusError) {
      throw statusError;
    }
  }

  await ensureStageEntry(workspace.id, nextStage, getDefaultStageName(nextStage), supabase);

  return { nextStage };
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
      stage?: number;
      stageName?: string;
      rawOutput?: string;
      promptUsed?: string | null;
      outputData?: Record<string, unknown> | null;
    };

    const stage = Number(body.stage);
    const rawOutput = body.rawOutput?.trim();
    const stageName = body.stageName?.trim() || getDefaultStageName(stage);

    if (!stage || !rawOutput) {
      return NextResponse.json(
        { error: "Stage and rawOutput are required." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", id)
      .single();

    if (workspaceError || !workspace) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("stage_outputs")
      .select("id")
      .eq("workspace_id", id)
      .eq("stage", stage)
      .eq("stage_name", stageName)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    const payload = {
      raw_output: rawOutput,
      prompt_used: body.promptUsed ?? null,
      output_data: body.outputData ?? null,
      status: "completed" as const,
      completed_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await supabase
        .from("stage_outputs")
        .update(payload)
        .eq("id", existing.id);

      if (error) {
        throw error;
      }
    } else {
      const { error } = await supabase.from("stage_outputs").insert({
        workspace_id: id,
        stage,
        stage_name: stageName,
        ...payload,
      });

      if (error) {
        throw error;
      }
    }

    const { data: refreshedOutputs, error: outputsError } = await supabase
      .from("stage_outputs")
      .select("*")
      .eq("workspace_id", id)
      .order("stage", { ascending: true })
      .order("created_at", { ascending: true });

    if (outputsError) {
      throw outputsError;
    }

    if (stage === 3) {
      const stageThreeOutputs = getStageOutputs(refreshedOutputs ?? [], 3);
      if (stageThreeOutputs.length === 1 && stageName === "brand_system") {
        await ensureStageEntry(id, 3, "guidelines", supabase);
      }
    }

    const updatedOutputsQuery = await supabase
      .from("stage_outputs")
      .select("*")
      .eq("workspace_id", id)
      .order("stage", { ascending: true })
      .order("created_at", { ascending: true });

    if (updatedOutputsQuery.error) {
      throw updatedOutputsQuery.error;
    }

    const { nextStage } = await advanceWorkspaceIfNeeded(
      workspace,
      stage,
      updatedOutputsQuery.data ?? [],
      supabase
    );

    return NextResponse.json({
      success: true,
      nextStage,
      stageName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save output.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
