# arcade-api.sh: source this file. Requires curl and jq.
ARCADE_API_BASE="https://platform.arcade.ai/v1"
ARCADE_USER_AGENT="${ARCADE_USER_AGENT:-arcade-api-test-drive/1.0}"

# arcade_v1 <procedure> [json-body]: POST, print the body, log to .arcade-api/log/.
arcade_v1() {
  local procedure="$1" body="${2:-}" tmp hdr meta http_status seconds stamp log n=1
  [ -n "$body" ] || body='{}'
  [ -n "${ARCADE_API_KEY:-}" ] || { echo "arcade_v1: ARCADE_API_KEY is not set" >&2; return 2; }
  case "$ARCADE_API_KEY" in arcade_sk_live_*) ;; *)
    echo "arcade_v1: that is not an Arcade API key from studio.arcade.ai" >&2; return 2 ;;
  esac
  jq -e 'type == "object"' >/dev/null 2>&1 <<<"$body" ||
    { echo "arcade_v1: body must be a JSON object" >&2; return 2; }
  tmp="$(mktemp)" hdr="$(mktemp)"
  # The key goes to curl on stdin, so it never appears in argv or the log.
  meta="$(printf 'Authorization: Bearer %s\n' "$ARCADE_API_KEY" |
    curl --silent --show-error -X POST "$ARCADE_API_BASE/$procedure" \
      -H @- -H "Content-Type: application/json" -H "User-Agent: $ARCADE_USER_AGENT" \
      --data-binary "$body" -D "$hdr" -o "$tmp" -w '%{http_code} %{time_total}')"
  http_status="${meta%% *}" seconds="${meta##* }"
  ARCADE_LAST_STATUS="$http_status"
  ARCADE_LAST_RETRY_AFTER="$(awk -F': *' 'tolower($1) == "retry-after" {v = $2} END {print v}' "$hdr" | tr -d '\r')"
  mkdir -p .arcade-api/log
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  log=".arcade-api/log/$stamp-${procedure//\//-}.json"
  while [ -e "$log" ]; do log=".arcade-api/log/$stamp-${procedure//\//-}-$n.json"; n=$((n + 1)); done
  jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg procedure "$procedure" \
    --argjson body "$body" --arg ua "$ARCADE_USER_AGENT" --arg status "$http_status" \
    --arg seconds "${seconds:-0}" --rawfile response "$tmp" \
    'def redact: walk(
       if type == "string" and startswith("http") and contains("?") then split("?")[0]
       elif type == "object" and ($procedure | startswith("orders/")) then with_entries(
         if .key | IN("shippingAddress", "name", "email", "phone", "firstName", "lastName",
           "customer", "makerName", "number", "url") then .value = "[redacted]" else . end)
       else . end);
     {ts: $ts, procedure: $procedure}
     + (if $body.requestId then {requestId: $body.requestId} else {} end)
     + {request: {body: ($body | redact), userAgent: $ua}, status: ($status | tonumber),
        durationMs: ($seconds | tonumber * 1000 | round),
        response: ((try ($response | fromjson) catch $response) | redact)}' >"$log"
  cat "$tmp"; echo
  rm -f "$tmp" "$hdr"
  case "$http_status" in 2??) return 0 ;; esac
  echo "arcade_v1: $procedure returned HTTP $http_status (log: $log)" >&2
  return 1
}

# arcade_poll <jobId> [interval=3] [timeoutSeconds=600]: wait for a job to finish.
arcade_poll() {
  local job_id="$1" interval="${2:-3}" timeout="${3:-600}" waited=0 delay out job_status=unknown
  [ "$interval" -ge 2 ] || interval=2
  out="$(mktemp)"
  while :; do
    if arcade_v1 jobs/get "$(jq -nc --arg id "$job_id" '{jobId: $id}')" >"$out"; then
      job_status="$(jq -r .status "$out")"
      case "$job_status" in
        succeeded) cat "$out"; rm -f "$out"; return 0 ;;
        failed) cat "$out"; rm -f "$out"; return 1 ;;
      esac
    else
      case "$ARCADE_LAST_STATUS" in 429 | 5??) ;; *) cat "$out"; rm -f "$out"; return 1 ;; esac
    fi
    delay="$interval"
    case "$ARCADE_LAST_STATUS:$ARCADE_LAST_RETRY_AFTER" in
      429:*[!0-9]* | 429:) ;;
      429:*) [ "$ARCADE_LAST_RETRY_AFTER" -le "$interval" ] || delay="$ARCADE_LAST_RETRY_AFTER" ;;
    esac
    if [ "$waited" -ge "$timeout" ]; then
      cat "$out"; rm -f "$out"; echo "arcade_poll: $job_id still $job_status after ${timeout}s" >&2; return 1
    fi
    sleep "$delay"; waited=$((waited + delay))
  done
}
