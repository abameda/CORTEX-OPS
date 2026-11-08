// Phase 0 security integration tests.
//
// Runs against a production build of CORTEX-OPS connected to a LOCAL Supabase
// stack. Never point this at production: it creates users and data.
// See docs/SECURITY-PHASE0.md ("Running the tests") for the full command.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
};

const BASE = env("OPS_BASE_URL");
const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const CAL_SECRET = env("CAL_WEBHOOK_SECRET");
const EL_SECRET = env("ELEVENLABS_WEBHOOK_SECRET");
const EL_AGENT = env("ELEVENLABS_AGENT_ID");
const EL_MOCK_URL = new URL(env("ELEVENLABS_API_BASE_URL"));
const ALLOWED_ORIGIN = env("CALL_ALLOWED_ORIGINS").split(",")[0].trim();

if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(SUPABASE_URL)) {
  throw new Error("Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not a local Supabase stack.");
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const run = crypto.randomBytes(4).toString("hex");
const PASSWORD = `Pw-${crypto.randomBytes(12).toString("hex")}`;
const users = {};
const cookies = {};
let workspaceA;
let workspaceB;

// ---- mock ElevenLabs token API ------------------------------------------------
let mockFail = false;
let mockCalls = 0;
const mock = http.createServer((req, res) => {
  mockCalls += 1;
  const ok =
    !mockFail &&
    req.url.startsWith(`/v1/convai/conversation/token?agent_id=${EL_AGENT}`) &&
    req.headers["xi-api-key"];
  res.writeHead(ok ? 200 : 500, { "content-type": "application/json" });
  res.end(JSON.stringify(ok ? { token: `conv-token-${mockCalls}` } : { error: "mock" }));
});

// ---- helpers -------------------------------------------------------------------
async function signInCookies(email) {
  const jar = new Map();
  const client = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  assert.equal(error, null, `sign in ${email}`);
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function api(path, { method = "GET", body, as, headers = {}, raw } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(as ? { cookie: cookies[as] } : {}),
      ...headers,
    },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: response.status, json, text, headers: response.headers };
}

function calSigned(payloadObject) {
  const raw = JSON.stringify(payloadObject);
  const sig = crypto.createHmac("sha256", CAL_SECRET).update(raw).digest("hex");
  return { raw, sig };
}

function elSigned(payloadObject, { timestamp = Math.floor(Date.now() / 1000), secret = EL_SECRET } = {}) {
  const raw = JSON.stringify(payloadObject);
  const sig = crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return { raw, header: `t=${timestamp},v0=${sig}` };
}

function elEvent(conversationId, dynamicVariables) {
  return {
    type: "post_call_transcription",
    data: {
      agent_id: EL_AGENT,
      conversation_id: conversationId,
      status: "done",
      transcript: [
        { role: "agent", message: "أهلاً، احكيلي عن البراند بتاعك" },
        { role: "user", message: "We sell specialty coffee in Cairo" },
      ],
      metadata: { call_duration_secs: 95 },
      conversation_initiation_client_data: { dynamic_variables: dynamicVariables },
    },
  };
}

async function transcriptsFor(workspaceId) {
  const { data, error } = await admin.from("transcripts").select("id, extracted_data").eq("workspace_id", workspaceId);
  assert.equal(error, null);
  return data;
}

async function createCallLink(workspaceId) {
  const response = await api(`/api/workspace/${workspaceId}/call-session`, {
    method: "POST",
    body: {},
    as: "staff",
  });
  assert.equal(response.status, 201, response.text);
  return response.json;
}

async function startCall(token, origin = ALLOWED_ORIGIN) {
  return api("/api/call/start", { method: "POST", body: { token }, headers: origin ? { origin } : {} });
}

// ---- setup ---------------------------------------------------------------------
before(async () => {
  await new Promise((resolve) => mock.listen(Number(EL_MOCK_URL.port), EL_MOCK_URL.hostname, resolve));

  for (const role of ["staff", "outsider"]) {
    const email = `${role}-${run}@phase0.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    assert.equal(error, null);
    users[role] = data.user;
  }
  const { error: staffError } = await admin
    .from("staff_members")
    .insert({ user_id: users.staff.id, role: "owner" });
  assert.equal(staffError, null);

  const { data: ws, error: wsError } = await admin
    .from("workspaces")
    .insert([
      { client_name: `Client A ${run}`, tier: "launch" },
      { client_name: `Client B ${run}`, tier: "build" },
    ])
    .select("id, client_name");
  assert.equal(wsError, null);
  [workspaceA, workspaceB] = ws;

  cookies.staff = await signInCookies(users.staff.email);
  cookies.outsider = await signInCookies(users.outsider.email);
});

after(async () => {
  mock.close();
  await admin.from("workspaces").delete().in("id", [workspaceA?.id, workspaceB?.id].filter(Boolean));
  for (const user of Object.values(users)) await admin.auth.admin.deleteUser(user.id);
});

// ---- sign-up -------------------------------------------------------------------
test("public sign-up is disabled (local config mirrors required prod setting)", async () => {
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signUp({ email: `new-${run}@phase0.test`, password: PASSWORD });
  assert.ok(error, "sign-up should fail");
  assert.equal(data.user, null);
});

// ---- unauthenticated -------------------------------------------------------------
test("anonymous visitors are redirected away from the dashboard", async () => {
  const res = await api("/");
  assert.equal(res.status, 307);
  assert.match(res.headers.get("location"), /\/login$/);
  const detail = await api(`/workspace/${workspaceA.id}`);
  assert.equal(detail.status, 307);
});

test("anonymous API calls are rejected with 401", async () => {
  const calls = [
    ["/api/workspace", "POST", { clientName: "x", tier: "launch" }],
    [`/api/workspace/${workspaceA.id}`, "PATCH", { status: "archived" }],
    [`/api/workspace/${workspaceA.id}/prompt?stage=2`, "GET"],
    [`/api/workspace/${workspaceA.id}/output`, "POST", { stage: 2, rawOutput: "x" }],
    [`/api/workspace/${workspaceA.id}/transcript`, "POST", { rawTranscript: "forged" }],
    [`/api/workspace/${workspaceA.id}/call-session`, "POST", {}],
  ];
  for (const [path, method, body] of calls) {
    const res = await api(path, { method, body });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
  assert.equal((await transcriptsFor(workspaceA.id)).length, 0);
});

test("the anon key cannot read or write tables directly", async () => {
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const read = await anon.from("transcripts").select("id");
  assert.ok(read.error || read.data.length === 0);
  const write = await anon.from("workspaces").insert({ client_name: "x", tier: "launch" });
  assert.ok(write.error, "anon insert must fail");
});

// ---- signed in but not staff -------------------------------------------------------
test("a signed-in non-staff account is forbidden everywhere", async () => {
  // The dashboard has a loading.tsx boundary, so Next.js streams and delivers
  // the redirect in-band (HTTP 200 + redirect instruction) instead of a 307.
  // What matters: the redirect targets /not-authorized and no data is rendered.
  for (const path of ["/", `/workspace/${workspaceA.id}`]) {
    const page = await api(path, { as: "outsider" });
    if (page.status === 307) {
      assert.match(page.headers.get("location"), /\/not-authorized$/, path);
    } else {
      assert.equal(page.status, 200, path);
      assert.match(page.text, /NEXT_REDIRECT[^"]*\/not-authorized/, path);
    }
    assert.doesNotMatch(page.text, new RegExp(`Client [AB] ${run}`), `${path} leaks no workspace data`);
  }

  const calls = [
    ["/api/workspace", "POST", { clientName: "x", tier: "launch" }],
    [`/api/workspace/${workspaceA.id}`, "PATCH", { status: "archived" }],
    [`/api/workspace/${workspaceA.id}/prompt?stage=2`, "GET"],
    [`/api/workspace/${workspaceA.id}/transcript`, "POST", { rawTranscript: "forged" }],
    [`/api/workspace/${workspaceA.id}/call-session`, "POST", {}],
  ];
  for (const [path, method, body] of calls) {
    const res = await api(path, { method, body, as: "outsider" });
    assert.equal(res.status, 403, `${method} ${path}`);
  }

  const { data: ws } = await admin.from("workspaces").select("status").eq("id", workspaceA.id).single();
  assert.equal(ws.status, "active");
  assert.equal((await transcriptsFor(workspaceA.id)).length, 0);
});

test("a non-staff account's own JWT sees no rows through PostgREST", async () => {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
    email: users.outsider.email,
    password: PASSWORD,
  });
  assert.equal(signInError, null, "outsider sign-in must succeed or this test checks nothing");
  assert.equal(signIn.user?.id, users.outsider.id);
  for (const table of ["workspaces", "transcripts", "stage_outputs", "call_sessions"]) {
    const { data, error } = await client.from(table).select("id");
    assert.ok(error || data.length === 0, table);
  }
  const insert = await client.from("staff_members").insert({ user_id: users.outsider.id });
  assert.ok(insert.error, "cannot self-grant staff");
});

// ---- legitimate staff flow -------------------------------------------------------
test("staff can run the full manual workspace flow", async () => {
  const dashboard = await api("/", { as: "staff" });
  assert.equal(dashboard.status, 200);
  assert.match(dashboard.text, new RegExp(`Client A ${run}`));

  const created = await api("/api/workspace", {
    method: "POST",
    as: "staff",
    body: { clientName: `Staff Created ${run}`, tier: "launch", currency: "EGP" },
  });
  assert.equal(created.status, 201, created.text);
  const newId = created.json.workspace.id;

  const page = await api(`/workspace/${newId}`, { as: "staff" });
  assert.equal(page.status, 200);

  const transcript = await api(`/api/workspace/${newId}/transcript`, {
    method: "POST",
    as: "staff",
    body: { rawTranscript: "Client: we roast coffee in Cairo.", language: "ar-EG" },
  });
  assert.equal(transcript.status, 200, transcript.text);
  assert.equal(transcript.json.nextStage, 2);

  const prompt = await api(`/api/workspace/${newId}/prompt?stage=2`, { as: "staff" });
  assert.equal(prompt.status, 200, prompt.text);
  assert.match(prompt.json.prompt, /we roast coffee in Cairo/);

  const output = await api(`/api/workspace/${newId}/output`, {
    method: "POST",
    as: "staff",
    body: { stage: 2, rawOutput: "Strategy document" },
  });
  assert.equal(output.status, 200, output.text);
  assert.equal(output.json.nextStage, 3);

  const patched = await api(`/api/workspace/${newId}`, {
    method: "PATCH",
    as: "staff",
    body: { status: "archived" },
  });
  assert.equal(patched.status, 200);

  await admin.from("workspaces").delete().eq("id", newId);
});

test("staff routes validate ids and inputs without leaking internals", async () => {
  const missing = crypto.randomUUID();
  assert.equal((await api(`/api/workspace/${missing}/transcript`, { method: "POST", as: "staff", body: { rawTranscript: "x" } })).status, 404);
  assert.equal((await api(`/api/workspace/not-a-uuid/prompt?stage=2`, { as: "staff" })).status, 404);
  assert.equal((await api(`/api/workspace/${missing}/call-session`, { method: "POST", as: "staff", body: {} })).status, 404);
  const badStage = await api(`/api/workspace/${workspaceA.id}/prompt?stage=9`, { as: "staff" });
  assert.equal(badStage.status, 400);
  const badJson = await api(`/api/workspace`, { method: "POST", as: "staff", raw: "{not json", headers: { "content-type": "application/json" } });
  assert.equal(badJson.status, 400);
  for (const res of [badStage, badJson]) {
    assert.doesNotMatch(res.text, /relation|column|violates|PGRST|postgres/i);
  }
});

// ---- Cal.com webhook ---------------------------------------------------------------
test("Cal webhook rejects forged signatures", async () => {
  const { raw } = calSigned({ triggerEvent: "BOOKING_CREATED", createdAt: new Date().toISOString(), payload: { uid: `forged-${run}` } });
  const res = await api("/api/webhooks/cal", { method: "POST", raw, headers: { "x-cal-signature-256": "0".repeat(64) } });
  assert.equal(res.status, 401);
  const missing = await api("/api/webhooks/cal", { method: "POST", raw });
  assert.equal(missing.status, 401);
});

test("Cal webhook ignores client-supplied workspace_id and binds by booking uid", async () => {
  const uid = `booking-${run}`;
  const body = {
    triggerEvent: "BOOKING_CREATED",
    createdAt: new Date().toISOString(),
    payload: {
      uid,
      title: "Discovery call",
      startTime: new Date(Date.now() + 86_400_000).toISOString(),
      attendees: [{ name: "Attacker", email: "a@example.com" }],
      customInputs: { tier: "scale" },
      metadata: { workspace_id: workspaceB.id },
    },
  };
  const { raw, sig } = calSigned(body);
  const res = await api("/api/webhooks/cal", { method: "POST", raw, headers: { "x-cal-signature-256": sig } });
  assert.equal(res.status, 200, res.text);
  assert.notEqual(res.json.workspaceId, workspaceB.id);

  const { data: b } = await admin.from("workspaces").select("client_name, tier").eq("id", workspaceB.id).single();
  assert.equal(b.client_name, `Client B ${run}`);
  assert.equal(b.tier, "build");

  const { data: created } = await admin.from("workspaces").select("id").eq("cal_booking_uid", uid);
  assert.equal(created.length, 1);

  // Exact replay of the same signed delivery is a no-op.
  const replay = await api("/api/webhooks/cal", { method: "POST", raw, headers: { "x-cal-signature-256": sig } });
  assert.equal(replay.status, 200);
  assert.equal(replay.json.duplicate, true);
  const { data: after } = await admin.from("workspaces").select("id").eq("cal_booking_uid", uid);
  assert.equal(after.length, 1);

  // A reschedule (new uid pointing at the old one) updates the same workspace.
  const resched = calSigned({
    triggerEvent: "BOOKING_RESCHEDULED",
    createdAt: new Date().toISOString(),
    payload: { uid: `${uid}-r`, rescheduleUid: uid, title: "Discovery call (moved)" },
  });
  const moved = await api("/api/webhooks/cal", { method: "POST", raw: resched.raw, headers: { "x-cal-signature-256": resched.sig } });
  assert.equal(moved.status, 200, moved.text);
  assert.equal(moved.json.workspaceId, created[0].id);

  await admin.from("workspaces").delete().eq("id", created[0].id);
});

test("Cal webhook rejects stale signed deliveries", async () => {
  const { raw, sig } = calSigned({
    triggerEvent: "BOOKING_CREATED",
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    payload: { uid: `stale-${run}` },
  });
  const res = await api("/api/webhooks/cal", { method: "POST", raw, headers: { "x-cal-signature-256": sig } });
  assert.equal(res.status, 401);
  const { data } = await admin.from("workspaces").select("id").eq("cal_booking_uid", `stale-${run}`);
  assert.equal(data.length, 0);
});

// ---- voice: token-gated call start -----------------------------------------------------
test("call start rejects missing, malformed, unknown and cross-origin tokens", async () => {
  assert.equal((await startCall(undefined)).status, 404);
  assert.equal((await startCall("short")).status, 404);
  assert.equal((await startCall(crypto.randomBytes(32).toString("base64url"))).status, 404);

  const link = await createCallLink(workspaceA.id);
  const evil = await startCall(link.token, "https://evil.example");
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
  const preflight = await api("/api/call/start", { method: "OPTIONS", headers: { origin: ALLOWED_ORIGIN } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
});

test("a call link starts exactly one call and expired links are refused", async () => {
  const link = await createCallLink(workspaceA.id);
  assert.match(link.url, /#t=/);

  const first = await startCall(link.token);
  assert.equal(first.status, 200, first.text);
  assert.match(first.json.conversationToken, /^conv-token-/);
  assert.equal(first.json.callSessionId, link.callSessionId);
  assert.equal(first.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);

  const second = await startCall(link.token);
  assert.equal(second.status, 404, "single use");

  const expired = await createCallLink(workspaceA.id);
  await admin
    .from("call_sessions")
    .update({ not_before: new Date(Date.now() - 7_200_000).toISOString(), expires_at: new Date(Date.now() - 3_600_000).toISOString() })
    .eq("id", expired.callSessionId);
  assert.equal((await startCall(expired.token)).status, 404);
});

test("a provider failure returns the link to the client for retry", async () => {
  const link = await createCallLink(workspaceA.id);
  mockFail = true;
  const failed = await startCall(link.token);
  mockFail = false;
  assert.equal(failed.status, 502);
  const retry = await startCall(link.token);
  assert.equal(retry.status, 200, retry.text);
});

// ---- ElevenLabs webhook ------------------------------------------------------------------
test("ElevenLabs webhook rejects forged and expired signatures", async () => {
  const event = elEvent(`conv-forged-${run}`, { call_session_id: crypto.randomUUID() });
  const forged = elSigned(event, { secret: "wrong-secret" });
  assert.equal((await api("/api/webhooks/elevenlabs", { method: "POST", raw: forged.raw, headers: { "ElevenLabs-Signature": forged.header } })).status, 401);
  const old = elSigned(event, { timestamp: Math.floor(Date.now() / 1000) - 600 });
  assert.equal((await api("/api/webhooks/elevenlabs", { method: "POST", raw: old.raw, headers: { "ElevenLabs-Signature": old.header } })).status, 401);
});

test("ElevenLabs webhook ignores client-controlled workspace ids and unknown sessions", async () => {
  for (const [label, vars] of [
    ["legacy workspace_id", { workspace_id: workspaceB.id }],
    ["unknown session", { call_session_id: crypto.randomUUID() }],
  ]) {
    const signed = elSigned(elEvent(`conv-${label.replace(/\s/g, "-")}-${run}`, vars));
    const res = await api("/api/webhooks/elevenlabs", { method: "POST", raw: signed.raw, headers: { "ElevenLabs-Signature": signed.header } });
    assert.equal(res.status, 200, label);
    assert.ok(res.json.ignored, label);
  }
  assert.equal((await transcriptsFor(workspaceB.id)).length, 0);
});

test("a started call's transcript lands only in its own workspace, once", async () => {
  const link = await createCallLink(workspaceB.id);
  const started = await startCall(link.token);
  assert.equal(started.status, 200, started.text);

  const conversationId = `conv-real-${run}`;
  const signed = elSigned(elEvent(conversationId, { call_session_id: started.json.callSessionId, workspace_id: workspaceA.id }));
  const res = await api("/api/webhooks/elevenlabs", { method: "POST", raw: signed.raw, headers: { "ElevenLabs-Signature": signed.header } });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.workspaceId, workspaceB.id);

  const b = await transcriptsFor(workspaceB.id);
  assert.equal(b.length, 1);
  assert.equal(b[0].extracted_data.call_session_id, started.json.callSessionId);
  assert.equal((await transcriptsFor(workspaceA.id)).length, 0, "no cross-project write");

  // Replay of the same signed event.
  const replay = await api("/api/webhooks/elevenlabs", { method: "POST", raw: signed.raw, headers: { "ElevenLabs-Signature": signed.header } });
  assert.equal(replay.json.duplicate, true);

  // A second conversation reusing the same session id is refused.
  const other = elSigned(elEvent(`conv-second-${run}`, { call_session_id: started.json.callSessionId }));
  const second = await api("/api/webhooks/elevenlabs", { method: "POST", raw: other.raw, headers: { "ElevenLabs-Signature": other.header } });
  assert.equal(second.json.ignored, "session_not_active");
  assert.equal((await transcriptsFor(workspaceB.id)).length, 1);
});

// ---- webhook claim lease --------------------------------------------------------------
test("an abandoned webhook claim is taken over by a later retry; a fresh one returns 409", async () => {
  const link = await createCallLink(workspaceA.id);
  const started = await startCall(link.token);
  assert.equal(started.status, 200, started.text);

  // A run that crashed 10 minutes ago left an unfinished claim behind.
  const abandoned = `conv-abandoned-${run}`;
  await admin.from("webhook_events").insert({
    provider: "elevenlabs",
    event_key: `post_call_transcription:${abandoned}`,
    received_at: new Date(Date.now() - 10 * 60_000).toISOString(),
  });
  const retry = elSigned(elEvent(abandoned, { call_session_id: started.json.callSessionId }));
  const res = await api("/api/webhooks/elevenlabs", { method: "POST", raw: retry.raw, headers: { "ElevenLabs-Signature": retry.header } });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.workspaceId, workspaceA.id, "reclaimed and processed");
  const { data: done } = await admin
    .from("webhook_events")
    .select("processed_at")
    .eq("event_key", `post_call_transcription:${abandoned}`)
    .single();
  assert.ok(done.processed_at, "marked processed");

  // Another request is processing right now: the provider must retry later, not drop it.
  const busy = `conv-busy-${run}`;
  await admin.from("webhook_events").insert({ provider: "elevenlabs", event_key: `post_call_transcription:${busy}` });
  const busyEvent = elSigned(elEvent(busy, { call_session_id: crypto.randomUUID() }));
  const conflict = await api("/api/webhooks/elevenlabs", { method: "POST", raw: busyEvent.raw, headers: { "ElevenLabs-Signature": busyEvent.header } });
  assert.equal(conflict.status, 409);
});
