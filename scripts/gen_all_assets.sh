#!/bin/bash
# Generate all missing ChinaSuuq mobile screen assets in parallel
STYLE="clean modern flat vector illustration for a premium mobile shopping app, soft warm cream background (#FFF8F0), warm orange (#FF5A0A) and soft beige palette, gentle rounded shapes, subtle soft shadows, minimal, friendly, professional, no text, no letters, no watermark, centered composition"

run() {
  local name="$1" prompt="$2" size="$3"
  python3 scripts/gen_image.py "$prompt" "apps/mobile/assets/screens/$name.png" "$size" > "/tmp/gen_$name.log" 2>&1 &
}

# 1. Search empty state
run empty_search "A large elegant magnifying glass with a small flying paper plane and shopping bag icons around it, ${STYLE}" "1024x1024"

# 2. Notifications empty state
run empty_notifications "A friendly rounded notification bell with a small checkmark and soft sparkle dots, ${STYLE}" "1024x1024"

# 3. Orders empty state
run empty_orders "A neat stack of three gift boxes or parcels with a small delivery truck, ${STYLE}" "1024x1024"

# 4. Account hero
run account_hero "A happy young shopper character holding a reusable shopping bag and a phone showing a store icon, ${STYLE}" "1024x1024"

# 5. Help/support questions
run help_hero "A large friendly question mark inside a speech bubble with a small headset icon beside it, ${STYLE}" "1024x1024"

# 6. About / brand story
run about_hero "A small friendly warehouse storefront with boxes and a globe with route arrows from China to Africa, ${STYLE}" "1024x1024"

# 7. Returns policy
run returns_hero "A circular refresh arrows icon around a small parcel box with a checkmark, ${STYLE}" "1024x1024"

# 8. Not found / lost package
run not_found "A lost small package with a magnifying glass and question marks floating above it, ${STYLE}" "1024x1024"

wait
echo "=== Results ==="
for f in empty_search empty_notifications empty_orders account_hero help_hero about_hero returns_hero not_found; do
  if [ -s "apps/mobile/assets/screens/$f.png" ]; then
    sz=$(stat -f%z "apps/mobile/assets/screens/$f.png" 2>/dev/null)
    echo "✅ $f.png ($sz bytes)"
  else
    echo "❌ $f.png MISSING — $(cat /tmp/gen_$f.log 2>/dev/null | head -2)"
  fi
done
