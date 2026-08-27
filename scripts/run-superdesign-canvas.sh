#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

CLI="npx --yes @superdesign/cli@latest"
WORKDIR="/workspace"

log() { echo "[superdesign] $*" >&2; }

wait_for_auth() {
  if $CLI 2>&1 | grep -q "auth: authenticated"; then
    log "Already authenticated."
    return 0
  fi

  if [[ -n "${SUPERDESIGN_TOKEN:-}" ]]; then
    log "Using SUPERDESIGN_TOKEN from environment."
    return 0
  fi

  log "Not authenticated. Starting login (headless)…"
  log "Open the URL below in your browser and approve access:"
  $CLI login --no-browser &
  LOGIN_PID=$!

  for _ in $(seq 1 120); do
    if $CLI 2>&1 | grep -q "auth: authenticated"; then
      wait "$LOGIN_PID" 2>/dev/null || true
      log "Authentication successful."
      return 0
    fi
    sleep 5
  done

  kill "$LOGIN_PID" 2>/dev/null || true
  log "ERROR: Authentication timed out after 10 minutes."
  log "Run: npx @superdesign/cli@latest login"
  log "Or set SUPERDESIGN_TOKEN and re-run this script."
  exit 1
}

extract_json_field() {
  local json="$1" field="$2"
  echo "$json" | node -e "
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const keys='$field'.split('.');
    let v=d; for (const k of keys) v=v?.[k];
    if (v==null) process.exit(1);
    console.log(v);
  "
}

wait_for_auth

log "Creating project…"
PROJECT_JSON=$($CLI create-project --title "Meridian UI/UX" --no-open --json)
PROJECT_ID=$(extract_json_field "$PROJECT_JSON" "projectId")
CANVAS_URL=$(extract_json_field "$PROJECT_JSON" "canvas" 2>/dev/null || extract_json_field "$PROJECT_JSON" "canvasUrl" 2>/dev/null || echo "")
log "Project ID: $PROJECT_ID"
[[ -n "$CANVAS_URL" ]] && log "Canvas: ${CANVAS_URL}?live=1"

create_draft() {
  local title="$1" prompt="$2"
  shift 2
  log "Creating draft: $title"
  $CLI create-design-draft \
    --project-id "$PROJECT_ID" \
    --title "$title" \
    --prompt "$prompt" \
    "$@" \
    --json
}

DASHBOARD_JSON=$(create_draft "Dashboard + Shell" \
  "Reproduce Meridian dashboard with sidebar, AI briefing card, pipeline chart, stat grid. Dark ERP theme per design-system.md." \
  --context-file .superdesign/design-system.md \
  --context-file .superdesign/init/theme.md \
  --context-file apps/web/src/app/dashboard/page.tsx \
  --context-file apps/web/src/components/app-shell.tsx)

ENTITY_LIST_JSON=$(create_draft "Entity List" \
  "Reproduce entity list with search, pagination, row selection checkboxes, bulk delete bar, and data table." \
  --context-file .superdesign/design-system.md \
  --context-file apps/web/src/app/entities/[entity]/page.tsx \
  --context-file .superdesign/init/components.md)

ENTITY_DETAIL_JSON=$(create_draft "Entity Detail" \
  "Entity detail page with view/edit form fields and activity audit timeline below." \
  --context-file .superdesign/design-system.md \
  --context-file "apps/web/src/app/entities/[entity]/[id]/page.tsx" \
  --context-file apps/web/src/components/entity-audit-timeline.tsx)

DASHBOARD_DRAFT_ID=$(extract_json_field "$DASHBOARD_JSON" "draftId")
ENTITY_LIST_DRAFT_ID=$(extract_json_field "$ENTITY_LIST_JSON" "draftId")
ENTITY_DETAIL_DRAFT_ID=$(extract_json_field "$ENTITY_DETAIL_JSON" "draftId")

log "Iterating dashboard draft…"
$CLI iterate-design-draft \
  --draft-id "$DASHBOARD_DRAFT_ID" \
  --mode replace \
  -p "Refine dark/light theme support, layered shadows, active nav indicator, professional ERP density. Keep Meridian branding." \
  --json > /tmp/superdesign-iterate.json

node -e "
const fs=require('fs');
const resume={
  version:1,
  projectId:'$PROJECT_ID',
  canvasUrl:'${CANVAS_URL}',
  targets:{
    '/dashboard':{projectId:'$PROJECT_ID',activeDraftId:'$DASHBOARD_DRAFT_ID',status:'ready'},
    '/entities/[entity]':{projectId:'$PROJECT_ID',activeDraftId:'$ENTITY_LIST_DRAFT_ID',status:'ready'},
    '/entities/[entity]/[id]':{projectId:'$PROJECT_ID',activeDraftId:'$ENTITY_DETAIL_DRAFT_ID',status:'ready'},
    '/':{projectId:'$PROJECT_ID',status:'pending'}
  }
};
fs.writeFileSync('.superdesign/resume.json', JSON.stringify(resume,null,2));
"

log "Done. Canvas: ${CANVAS_URL:-https://superdesign.dev}?live=1"
log "Resume state saved to .superdesign/resume.json"
