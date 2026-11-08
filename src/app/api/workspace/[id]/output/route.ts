import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/auth";
import { badRequest, isUuid, notFound, readJsonBody, serverError } from "@/lib/http";
import {
  getDefaultStageName,
  getNextRelevantStage,
  getStageOutputs,
  isStageThreeComplete,
} from "@/lib/pipeline";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { Workspace } from "@/types";

const STAGE_NAME_PATTERN = /^[a-z0-9_]{1,40}$/;

async function ensureStageEntry(
  workspaceId: string,
  stage: number,
  stageName: string,
  supabase: SupabaseClient
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
  supabase: SupabaseClient
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
    stage?: number;
    stageName?: string;
    rawOutput?: string;
    promptUsed?: string | null;
    outputData?: Record<string, unknown> | null;
  }>(request);

  if (!body) {
    return badRequest("A JSON body is required.");
  }

  const stage = Number(body.stage);
  const rawOutput = typeof body.rawOutput === "string" ? body.rawOutput.trim() : "";
  const stageName =
    (typeof body.stageName === "string" ? body.stageName.trim() : "") ||
    getDefaultStageName(stage);

  if (!Number.isInteger(stage) || stage < 1 || stage > 6 || !rawOutput) {
    return badRequest("Stage (1-6) and rawOutput are required.");
  }

  if (!STAGE_NAME_PATTERN.test(stageName)) {
    return badRequest("stageName must be lowercase letters, digits, or underscores.");
  }

  try {
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (workspaceError) {
      throw workspaceError;
    }

    if (!workspace) {
      return notFound("Workspace not found.");
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
    return serverError("workspace.output", error);
  }
}
