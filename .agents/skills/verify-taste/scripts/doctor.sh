#!/usr/bin/env bash
set -euo pipefail

port="${1:-}"
expected_sha="${2:-}"

if [ -z "$port" ]; then
  echo "Usage: $0 <port> [expected-commit-sha]" >&2
  exit 2
fi

base_url="http://127.0.0.1:${port}"

if [ -f .e2e/app.pid ]; then
  pid="$(cat .e2e/app.pid)"
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "FAIL: recorded app PID ${pid} is not running" >&2
    exit 1
  fi
  echo "OK: app process ${pid} is running"
else
  echo "WARN: .e2e/app.pid not found; checking ${base_url} directly"
fi

head_sha="$(git rev-parse HEAD)"
if [ -n "$expected_sha" ] && [ "$head_sha" != "$expected_sha" ]; then
  echo "FAIL: HEAD is ${head_sha}, expected ${expected_sha}" >&2
  exit 1
fi
echo "OK: commit ${head_sha}"

health="$(curl -sf --max-time 5 "${base_url}/api/health")" || {
  echo "FAIL: ${base_url}/api/health did not respond" >&2
  exit 1
}

if ! printf '%s' "$health" | grep -q '"ok":true' || \
   ! printf '%s' "$health" | grep -q '"d1":true' || \
   ! printf '%s' "$health" | grep -q '"r2":true'; then
  echo "FAIL: unhealthy response from /api/health: ${health}" >&2
  exit 1
fi
echo "OK: /api/health -> ${health}"

home_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${base_url}/")"
if [ "$home_status" != "200" ]; then
  echo "FAIL: GET / returned HTTP ${home_status}" >&2
  exit 1
fi
echo "OK: GET / -> HTTP 200"

echo "INFO: non-production test login is pending (#93); only public/signed-out flows can run automatically."
