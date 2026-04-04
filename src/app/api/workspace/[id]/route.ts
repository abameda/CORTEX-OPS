import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { createClient } from "@/lib/supabase-server";
import { WorkspaceStatus } from "@/types";

const VALID_STATUSES: WorkspaceStatus[] = ["active", "completed", "archived"];

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const { status } = (await request.json()) as { status?: WorkspaceStatus };

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Valid workspace status is required." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("workspaces")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    return NextResponse.json({ workspace: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update workspace.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
