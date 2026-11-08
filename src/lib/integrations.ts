import { Currency, Tier } from "@/types";

const VALID_TIERS: Tier[] = ["launch", "build", "scale"];
const VALID_CURRENCIES: Currency[] = ["EGP", "USD"];

function normalizeTier(value?: string | null): Tier | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return VALID_TIERS.includes(normalized as Tier) ? (normalized as Tier) : null;
}

function normalizeCurrency(value?: string | null): Currency | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return VALID_CURRENCIES.includes(normalized as Currency)
    ? (normalized as Currency)
    : null;
}

export function getCalWebhookSecret() {
  const secret = process.env.CAL_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing CAL_WEBHOOK_SECRET.");
  }

  return secret;
}

// How old a signed Cal.com delivery may be before it is rejected as a replay.
// Cal.com signatures carry no timestamp, so the signed body's createdAt is used.
export function getCalWebhookMaxAgeMs() {
  const seconds = Number(process.env.CAL_WEBHOOK_MAX_AGE_SECONDS ?? 86_400);
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 86_400) * 1000;
}

export function getOptionalElevenLabsConfig() {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const agentId = process.env.ELEVENLABS_AGENT_ID?.trim();

  if (!apiKey || !agentId) {
    return null;
  }

  return { apiKey, agentId };
}

export function getElevenLabsConfig() {
  const config = getOptionalElevenLabsConfig();
  if (!config) {
    throw new Error("Missing ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID.");
  }

  return config;
}

export function getElevenLabsWebhookSecret() {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing ELEVENLABS_WEBHOOK_SECRET.");
  }

  return secret;
}

// Overridable only so the security test suite can point at a local mock.
export function getElevenLabsApiBaseUrl() {
  return (process.env.ELEVENLABS_API_BASE_URL?.trim() || "https://api.elevenlabs.io").replace(
    /\/+$/,
    ""
  );
}

// Browser origins allowed to call the public /api/call/start endpoint
// (the marketing site that hosts the /call page).
export function getCallAllowedOrigins() {
  return (process.env.CALL_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

// Public URL of the call page, e.g. https://cortex-pi-sable.vercel.app/call
export function getCallPageUrl() {
  return process.env.CALL_PAGE_URL?.trim() || null;
}

export function parseTier(value?: string | null, fallback: Tier = "launch"): Tier {
  return normalizeTier(value) ?? fallback;
}

export function parseCurrency(
  value?: string | null,
  fallback: Currency = "EGP"
): Currency {
  return normalizeCurrency(value) ?? fallback;
}
