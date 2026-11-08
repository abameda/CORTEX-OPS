import { NextRequest, NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/auth";
import { badRequest, readJsonBody, serverError } from "@/lib/http";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { Currency, Tier } from "@/types";

const VALID_TIERS: Tier[] = ["launch", "build", "scale"];
const VALID_CURRENCIES: Currency[] = ["EGP", "USD"];

export async function POST(request: NextRequest) {
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

  const body = await readJsonBody<{
    clientName?: string;
    businessName?: string | null;
    tier?: Tier;
    currency?: Currency;
  }>(request);

  if (!body) {
    return badRequest("A JSON body is required.");
  }

  const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
  const businessName =
    typeof body.businessName === "string" ? body.businessName.trim() || null : null;
  const tier = body.tier;
  const currency = body.currency ?? "EGP";

  if (!clientName || clientName.length > 200) {
    return badRequest("Client name is required (max 200 characters).");
  }

  if (!tier || !VALID_TIERS.includes(tier)) {
    return badRequest("Tier must be launch, build, or scale.");
  }

  if (!VALID_CURRENCIES.includes(currency)) {
    return badRequest("Currency must be EGP or USD.");
  }

  try {
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .insert({
        client_name: clientName,
        business_name: businessName,
        tier,
        currency,
        current_stage: 1,
        status: "active",
      })
      .select("*")
      .single();

    if (workspaceError) {
      throw workspaceError;
    }

    const { error: stageError } = await supabase.from("stage_outputs").insert({
      workspace_id: workspace.id,
      stage: 1,
      stage_name: "discovery_call",
      status: "pending",
      input_data: {
        source: "manual_workspace_creation",
      },
    });

    if (stageError) {
      throw stageError;
    }

    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    return serverError("workspace.create", error);
  }
}
