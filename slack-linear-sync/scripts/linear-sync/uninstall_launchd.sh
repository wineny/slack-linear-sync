#!/bin/bash
set -e

PLIST_NAME="com.linear-sync.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME"

launchctl bootout gui/$(id -u)/$PLIST_NAME 2>/dev/null || true

rm -f "$PLIST_DST"

echo "Uninstalled: $PLIST_NAME"
