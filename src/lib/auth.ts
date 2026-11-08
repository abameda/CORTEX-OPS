import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export type StaffRole = "owner" | "operator";

export interface StaffContext {
  supabase: SupabaseClient;
  user: User;
  role: StaffRole;
}

type StaffResolution =
  | { kind: "staff"; context: StaffContext }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" };

// Authenticates the request from its session cookie (verified with the auth
// server via getUser) and authorizes it against the public.staff_members
// allowlist. The returned client is the user's own client, so every query it
// makes is also subject to RLS.
async function resolveStaff(): Promise<StaffResolution> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;

  if (error || !user) {
    return { kind: "unauthenticated" };
  }

  const { data: staff, error: staffError } = await supabase
    .from("staff_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (staffError) {
    console.error("[auth] staff lookup failed", staffError);
    return { kind: "forbidden" };
  }

  if (!staff) {
    return { kind: "forbidden" };
  }

  return {
    kind: "staff",
    context: { supabase, user, role: staff.role as StaffRole },
  };
}

export async function requireStaffApi(): Promise<
  { ok: true; context: StaffContext } | { ok: false; response: NextResponse }
> {
  const resolution = await resolveStaff();

  if (resolution.kind === "unauthenticated") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (resolution.kind === "forbidden") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, context: resolution.context };
}

export async function requireStaffPage(): Promise<StaffContext> {
  const resolution = await resolveStaff();

  if (resolution.kind === "unauthenticated") {
    redirect("/login");
  }

  if (resolution.kind === "forbidden") {
    redirect("/not-authorized");
  }

  return resolution.context;
}
