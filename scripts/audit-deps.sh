#!/usr/bin/env bash
# Audit Python and Node dependencies for known vulnerabilities.
# Run from the project root: ./scripts/audit-deps.sh

set -e

echo "=== Python dependency audit ==="
if command -v pip-audit &>/dev/null; then
    pip-audit -r backend/requirements.txt
else
    echo "pip-audit not installed. Install with: pip install pip-audit"
    echo "Falling back to pip check..."
    pip check 2>&1 || true
fi

echo ""
echo "=== Node dependency audit ==="
cd frontend
npm audit --omit=dev 2>&1 || true
cd ..

echo ""
echo "=== Done ==="
