#!/usr/bin/env bash
# Runs the Phase 0 security suite end to end against LOCAL services only:
#   1. local Supabase (Docker) with all migrations applied from scratch
#   2. database RLS tests (pgTAP)
#   3. a production build of the app on port 3107
#   4. HTTP integration tests (forged/replayed webhooks, auth, cross-project)
# Requires: Docker, Node 20+, npm deps installed. Uses only throwaway test secrets.
set -euo pipefail
cd "$(dirname "$0")/../.."

npx supabase start >/dev/null
npx supabase db reset >/dev/null
echo "== Database RLS tests (pgTAP)"
npx supabase test db

eval "$(npx supabase status -o env | sed -E 's/^([A-Z_]+)=/export SB_\1=/')"

export NEXT_PUBLIC_SUPABASE_URL="$SB_API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$SB_ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SB_SERVICE_ROLE_KEY"
export CAL_WEBHOOK_SECRET="test-cal-secret"
export ELEVENLABS_API_KEY="test-elevenlabs-key"
export ELEVENLABS_AGENT_ID="agent_test_phase0"
export ELEVENLABS_WEBHOOK_SECRET="test-elevenlabs-webhook-secret"
export ELEVENLABS_API_BASE_URL="http://127.0.0.1:3199"
export CALL_ALLOWED_ORIGINS="http://localhost:3100"
export CALL_PAGE_URL="http://localhost:3100/call"
export OPS_BASE_URL="http://127.0.0.1:3107"

echo "== Building app"
npx next build >/dev/null

echo "== Starting app on :3107"
npx next start -p 3107 >/tmp/cortex-ops-phase0.log 2>&1 &
APP_PID=$!
trap 'kill $APP_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -s -o /dev/null "$OPS_BASE_URL/login" && break
  sleep 1
done

echo "== HTTP integration tests"
node --test tests/security/*.test.mjs
