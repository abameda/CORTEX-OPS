import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { createAdminClient } from "@/lib/supabase-admin";
import { saveTranscriptAndAdvance } from "@/lib/transcripts";

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

    const supabase = createAdminClient();
    const result = await saveTranscriptAndAdvance(supabase, {
      workspaceId: id,
      rawTranscript,
      durationSeconds: body.durationSeconds ?? null,
      language: body.language ?? "en",
      extractedData: body.extractedData ?? null,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save transcript.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
