import crypto from "node:crypto";
import { sha256Hex } from "@/lib/webhook-security";

// 32 random bytes, base64url: 43 characters, 256 bits of entropy.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateCallToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256Hex(token) };
}

export function hashCallToken(token: unknown) {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    return null;
  }

  return sha256Hex(token);
}

// The token travels in the URL fragment (#t=...), which browsers never send to
// servers or in Referer headers.
export function buildCallLink(callPageUrl: string, token: string) {
  return `${callPageUrl.replace(/#.*$/, "")}#t=${token}`;
}
