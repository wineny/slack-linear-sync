#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMP_JSON="/tmp/test-linear-projects-$(date +%s).json"
PYTHON="/opt/homebrew/bin/python3.11"

echo "=== Linear Sync Test Suite ==="
FAILED=0

echo -n "Test 1: Python export... "
if "$PYTHON" "$SCRIPT_DIR/export_projects.py" --output "$TEMP_JSON" 2>/dev/null; then
    echo "OK"
else
    echo "FAIL (exit code $?)"
    FAILED=1
fi

echo -n "Test 2: JSON schema... "
SCHEMA_RESULT=$("$PYTHON" -c "
import json, sys
with open('$TEMP_JSON') as f:
    d = json.load(f)
assert d.get('version') == 2, 'version != 2'
assert 'updatedAt' in d, 'no updatedAt'
assert isinstance(d.get('projects'), list), 'projects not list'
print('OK')
" 2>&1)
if [ "$SCHEMA_RESULT" = "OK" ]; then
    echo "OK"
else
    echo "FAIL: $SCHEMA_RESULT"
    FAILED=1
fi

echo -n "Test 3: Project fields... "
FIELDS_RESULT=$("$PYTHON" -c "
import json
with open('$TEMP_JSON') as f:
    d = json.load(f)
if d['projects']:
    p = d['projects'][0]
    for k in ['id','name','teamId','teamName','state','keywords','recentIssueTitles']:
        assert k in p, f'missing {k}'
print('OK')
" 2>&1)
if [ "$FIELDS_RESULT" = "OK" ]; then
    echo "OK"
else
    echo "FAIL: $FIELDS_RESULT"
    FAILED=1
fi

echo -n "Test 4: recentIssueTitles <= 10... "
LIMIT_RESULT=$("$PYTHON" -c "
import json
with open('$TEMP_JSON') as f:
    d = json.load(f)
for p in d['projects']:
    assert len(p.get('recentIssueTitles',[])) <= 10, f'{p[\"name\"]} has >10 issues'
print('OK')
" 2>&1)
if [ "$LIMIT_RESULT" = "OK" ]; then
    echo "OK"
else
    echo "FAIL: $LIMIT_RESULT"
    FAILED=1
fi

echo -n "Test 5: wrangler auth... "
if wrangler whoami > /dev/null 2>&1; then
    echo "OK"
else
    echo "FAIL (not authenticated)"
    FAILED=1
fi

echo "Test 6: Dry-run (skipped - use sync_to_kv.sh for actual upload)"

rm -f "$TEMP_JSON"

echo ""
if [ $FAILED -eq 0 ]; then
    echo "=== All tests PASSED ==="
    exit 0
else
    echo "=== Some tests FAILED ==="
    exit 1
fi
