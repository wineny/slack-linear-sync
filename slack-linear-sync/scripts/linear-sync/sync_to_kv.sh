#!/bin/bash
set -e

SCRIPT_DIR="/Users/wine_ny/side-project/linear_project/slack-linear-sync/scripts/linear-sync"
LOG_DIR="/Users/wine_ny/Library/Logs/linear-sync"
TEMP_JSON="/tmp/linear-projects.json"
KV_NAMESPACE_ID="7436de4f48264cf398cea9eeb3b89057"
KV_KEY="PROJECT_CACHE:all"
LINEAR_DB="/Users/wine_ny/Library/Application Support/Linear/IndexedDB/https_linear.app_0.indexeddb.leveldb"
PYTHON="/opt/homebrew/bin/python3.11"

export HOME="/Users/wine_ny"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.npm-global/bin:$PATH"

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_DIR/sync.log"
}

log "Starting sync..."

WRANGLER=$(which wrangler 2>/dev/null || echo "")
if [ -z "$WRANGLER" ]; then
    log "ERROR: wrangler not found in PATH"
    exit 1
fi

if ! "$WRANGLER" whoami > /dev/null 2>&1; then
    log "ERROR: wrangler not authenticated"
    exit 1
fi

if [ ! -d "$LINEAR_DB" ]; then
    log "WARNING: Linear IndexedDB not found, skipping sync"
    exit 0
fi

if ! "$PYTHON" "$SCRIPT_DIR/export_projects.py" --output "$TEMP_JSON" 2>> "$LOG_DIR/sync.log"; then
    log "ERROR: Python export failed"
    exit 1
fi

if [ ! -f "$TEMP_JSON" ]; then
    log "ERROR: Export file not created"
    exit 1
fi

PROJECT_COUNT=$("$PYTHON" -c "import json; d=json.load(open('$TEMP_JSON')); print(len(d['projects']))")
log "Exported $PROJECT_COUNT projects"

if [ "$PROJECT_COUNT" -eq 0 ]; then
    log "WARNING: No projects exported, skipping KV upload"
    rm -f "$TEMP_JSON"
    exit 0
fi

if ! "$WRANGLER" kv key put "$KV_KEY" --path "$TEMP_JSON" --namespace-id="$KV_NAMESPACE_ID" --remote 2>> "$LOG_DIR/sync.log"; then
    log "ERROR: KV upload failed"
    rm -f "$TEMP_JSON"
    exit 1
fi

rm -f "$TEMP_JSON"
log "SUCCESS: Uploaded $PROJECT_COUNT projects to KV"
