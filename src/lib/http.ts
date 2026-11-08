import { NextRequest, NextResponse } from "next/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

// Logs the real error server-side and returns a generic message, so database
// and schema details never reach the caller.
export function serverError(context: string, error: unknown) {
  console.error(`[${context}]`, error);
  return NextResponse.json({ error: "Internal server error." }, { status: 500 });
}

export function notFound(message = "Not found.") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function readJsonBody<T>(request: NextRequest): Promise<T | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" ? (body as T) : null;
  } catch {
    return null;
  }
}
