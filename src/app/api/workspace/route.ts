import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { createClient } from "@/lib/supabase-server";
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

  try {
    const body = (await request.json()) as {
      clientName?: string;
      businessName?: string | null;
      tier?: Tier;
      currency?: Currency;
    };

    const clientName = body.clientName?.trim();
    const businessName = body.businessName?.trim() || null;
    const tier = body.tier;
    const currency = body.currency ?? "EGP";

    if (!clientName) {
      return NextResponse.json({ error: "Client name is required." }, { status: 400 });
    }

    if (!tier || !VALID_TIERS.includes(tier)) {
      return NextResponse.json({ error: "Tier must be launch, build, or scale." }, { status: 400 });
    }

    if (!VALID_CURRENCIES.includes(currency)) {
      return NextResponse.json({ error: "Currency must be EGP or USD." }, { status: 400 });
    }

    const supabase = await createClient();

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
    const message = error instanceof Error ? error.message : "Failed to create workspace.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
