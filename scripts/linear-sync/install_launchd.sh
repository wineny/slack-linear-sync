#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.linear-sync.plist"
PLIST_SRC="$SCRIPT_DIR/$PLIST_NAME"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME"

mkdir -p "$HOME/Library/Logs/linear-sync"

launchctl bootout gui/$(id -u)/$PLIST_NAME 2>/dev/null || true

cp "$PLIST_SRC" "$PLIST_DST"

launchctl bootstrap gui/$(id -u) "$PLIST_DST"

echo "Installed and started: $PLIST_NAME"
echo "Check status: launchctl list | grep linear-sync"
