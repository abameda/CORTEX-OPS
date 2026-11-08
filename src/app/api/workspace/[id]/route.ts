import { NextRequest, NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/auth";
import { badRequest, isUuid, notFound, readJsonBody, serverError } from "@/lib/http";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { WorkspaceStatus } from "@/types";

const VALID_STATUSES: WorkspaceStatus[] = ["active", "completed", "archived"];

export async function PATCH(
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
  const { supabase } = auth.context;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return notFound("Workspace not found.");
  }

  const body = await readJsonBody<{ status?: WorkspaceStatus }>(request);
  const status = body?.status;

  if (!status || !VALID_STATUSES.includes(status)) {
    return badRequest("Valid workspace status is required.");
  }

  try {
    const { data, error } = await supabase
      .from("workspaces")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return notFound("Workspace not found.");
    }

    return NextResponse.json({ workspace: data });
  } catch (error) {
    return serverError("workspace.update", error);
  }
}
