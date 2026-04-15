#!/usr/bin/env bash
# End-to-end smoke test for msfg-docs mounted at https://dashboard.msfgco.com/docs.
#
# Usage:
#   AUTH_TOKEN=<jwt> ./scripts/smoke-test.sh
#   BASE_URL=http://localhost:3001 AUTH_TOKEN=dev ./scripts/smoke-test.sh   # dev mode
#
# In dev mode (no COGNITO_USER_POOL_ID set on the server), any AUTH_TOKEN
# value works because cognito.js short-circuits auth.

set -euo pipefail

BASE_URL="${BASE_URL:-https://dashboard.msfgco.com/docs}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[34m%s\033[0m\n' "$*"; }

fail=0
pass=0

# $1 label   $2 expected_status   rest: curl args
check() {
  local label="$1"; shift
  local expected="$1"; shift
  local body_out; body_out="$(mktemp)"
  local code
  code="$(curl -sS -o "$body_out" -w '%{http_code}' "$@" || echo "000")"
  if [[ "$code" == "$expected" ]]; then
    green "  ✓ $label ($code)"
    pass=$((pass + 1))
  else
    red "  ✗ $label — expected $expected, got $code"
    head -c 400 "$body_out" >&2 || true
    echo >&2
    fail=$((fail + 1))
  fi
  rm -f "$body_out"
}

# $1 label   $2 output_path   rest: curl args — also asserts PDF magic bytes
check_pdf() {
  local label="$1"; shift
  local out="$1"; shift
  local code
  code="$(curl -sS -o "$out" -w '%{http_code}' "$@" || echo "000")"
  if [[ "$code" != "200" ]]; then
    red "  ✗ $label — expected 200, got $code"
    fail=$((fail + 1)); return
  fi
  local magic
  magic="$(head -c 5 "$out")"
  if [[ "$magic" == "%PDF-" ]]; then
    local size; size="$(wc -c < "$out" | tr -d ' ')"
    green "  ✓ $label (${size} bytes)"
    pass=$((pass + 1))
  else
    red "  ✗ $label — response is not a PDF (starts with '$magic')"
    fail=$((fail + 1))
  fi
}

blue "smoke test against $BASE_URL"
echo

blue "— public —"
check "GET /api/health returns 200" 200 "$BASE_URL/api/health"

blue "— unauthenticated —"
if [[ "$BASE_URL" == *dashboard.msfgco.com* ]]; then
  # In prod, auth is enforced — unauthenticated API calls must 401.
  check "POST /api/pdf/form-4506-c without token → 401" 401 \
    -X POST -H 'Content-Type: application/json' -d '{}' \
    "$BASE_URL/api/pdf/form-4506-c"
else
  blue "  (skipped — dev mode lets everything through)"
fi

if [[ -z "$AUTH_TOKEN" ]]; then
  echo
  red "AUTH_TOKEN not set — skipping authenticated checks."
  echo "To run the full suite, paste your auth_token cookie:"
  echo "  AUTH_TOKEN=eyJ... ./scripts/smoke-test.sh"
  [[ $fail -eq 0 ]] && exit 0 || exit 1
fi

echo
blue "— authenticated —"
check "GET / returns 200"                      200  -H "Authorization: Bearer $AUTH_TOKEN" "$BASE_URL/"
check "GET /workspace returns 200"             200  -H "Authorization: Bearer $AUTH_TOKEN" "$BASE_URL/workspace"
check "GET /documents/credit-inquiry returns 200" 200 -H "Authorization: Bearer $AUTH_TOKEN" "$BASE_URL/documents/credit-inquiry"
check "GET /documents/form-4506-c returns 200"   200 -H "Authorization: Bearer $AUTH_TOKEN" "$BASE_URL/documents/form-4506-c"

check_pdf "POST /api/pdf/credit-inquiry returns a PDF" /tmp/msfg-docs-ci.pdf \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{"senderName":"Smoke Test","inquiries":[{"no":1,"inquiryDate":"2026-03-15","creditor":"Test Co","explanation":"Smoke"}]}' \
  "$BASE_URL/api/pdf/credit-inquiry"

check_pdf "POST /api/pdf/form-4506-c returns a PDF" /tmp/msfg-docs-4506c.pdf \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{"f4506TaxpayerName":"John Smith","f4506Ssn":"123-45-6789","f4506TaxYears":"2022, 2023","f4506TranscriptType":"return"}' \
  "$BASE_URL/api/pdf/form-4506-c"

if [[ "$BASE_URL" == *dashboard.msfgco.com* ]]; then
  check "POST /api/pdf/form-4506-c with bogus token → 401" 401 \
    -H "Authorization: Bearer not.a.real.token" \
    -H 'Content-Type: application/json' \
    -X POST -d '{}' \
    "$BASE_URL/api/pdf/form-4506-c"
fi

echo
if [[ $fail -eq 0 ]]; then
  green "all $pass checks passed"
  exit 0
else
  red "$fail failed, $pass passed"
  exit 1
fi
