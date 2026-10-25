#!/usr/bin/env bash
# Build preparation script for ChinaSuuq Mobile v1.0.4
# This script runs checks before building the app

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== ChinaSuuq Mobile Build Preparation ==="
echo "Project: $PROJECT_ROOT"
echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# 1. Check version consistency
echo "[1/5] Checking version consistency..."
PKG_VERSION=$(grep '"version"' "$PROJECT_ROOT/package.json" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')
APP_VERSION=$(grep '"version"' "$PROJECT_ROOT/app.json" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')

if [ "$PKG_VERSION" = "$APP_VERSION" ]; then
    echo "  ✓ Versions match: $PKG_VERSION"
else
    echo "  ✗ Version mismatch: package.json=$PKG_VERSION, app.json=$APP_VERSION"
    exit 1
fi
echo ""

# 2. Run TypeScript type check
echo "[2/5] Running TypeScript type check..."
if npx tsc --noEmit 2>&1; then
    echo "  ✓ TypeScript check passed"
else
    echo "  ✗ TypeScript check failed"
    exit 1
fi
echo ""

# 3. Run verification scripts
echo "[3/5] Running verification scripts..."
VERIFICATION_ERRORS=0

for script in verify-cs-runtime.mjs verify-translate-client.mjs verify-translate-inpage.mjs verify-usd-inpage.mjs verify-in-batches.mjs verify-marketplace-session.mjs verify-cart-and-states.mjs; do
    if [ -f "$SCRIPT_DIR/$script" ]; then
        echo "  Running $script..."
        if node --experimental-strip-types "$SCRIPT_DIR/$script" 2>&1; then
            echo "    ✓ $script passed"
        else
            echo "    ✗ $script failed"
            VERIFICATION_ERRORS=$((VERIFICATION_ERRORS + 1))
        fi
    fi
done

if [ $VERIFICATION_ERRORS -gt 0 ]; then
    echo "  ✗ $VERIFICATION_ERRORS verification script(s) failed"
    exit 1
else
    echo "  ✓ All verification scripts passed"
fi
echo ""

# 4. Check for TODO/FIXME comments in source
echo "[4/5] Checking for TODO/FIXME comments..."
TODO_COUNT=$(grep -rn "TODO\|FIXME" "$PROJECT_ROOT/src/" 2>/dev/null | wc -l | tr -d ' ')
if [ "$TODO_COUNT" -eq 0 ]; then
    echo "  ✓ No TODO/FIXME comments found in source"
else
    echo "  ⚠ Found $TODO_COUNT TODO/FIXME comment(s):"
    grep -rn "TODO\|FIXME" "$PROJECT_ROOT/src/" 2>/dev/null | head -10
fi
echo ""

# 5. Check EAS configuration
echo "[5/5] Checking EAS configuration..."
if [ -f "$PROJECT_ROOT/eas.json" ]; then
    echo "  ✓ eas.json exists"
    if grep -q '"android"' "$PROJECT_ROOT/eas.json"; then
        echo "  ✓ Android build configuration found"
    fi
    if grep -q '"ios"' "$PROJECT_ROOT/eas.json"; then
        echo "  ✓ iOS build configuration found"
    fi
else
    echo "  ✗ eas.json not found"
    exit 1
fi
echo ""

echo "=== Build Preparation Complete ==="
echo "Version: $PKG_VERSION"
echo "Status: Ready for build"
