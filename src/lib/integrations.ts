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

export function parseTier(value?: string | null, fallback: Tier = "launch"): Tier {
  return normalizeTier(value) ?? fallback;
}

export function parseCurrency(
  value?: string | null,
  fallback: Currency = "EGP"
): Currency {
  return normalizeCurrency(value) ?? fallback;
}
