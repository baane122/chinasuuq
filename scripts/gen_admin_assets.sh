#!/bin/bash
# Generate admin dashboard illustration assets (TT Image 2.5)
STYLE="premium flat vector illustration, warm orange (#FF5A0A) and soft cream (#FFF8F0) palette with deep charcoal (#111111) accents, gentle rounded shapes, soft shadows, minimal modern tech aesthetic, no text, no letters, no watermark, centered composition"

run() {
  local name="$1" prompt="$2" size="$3"
  python3 scripts/gen_image.py "$prompt" "apps/web/public/admin/$name.png" "$size" > "/tmp/genadm_$name.log" 2>&1 &
}

# 1. Login hero — mission control themed (dark, sits on brand gradient panel)
run login_hero "A sleek isometric mission control dashboard floating in space with charts, packages, a cargo ship and a delivery plane flying along a dotted route from a Chinese pagoda to an African acacia tree, dark charcoal background, glowing warm orange accents, ${STYLE}" "1024x1024"

# 2. Empty states (light, sit on white cards)
run empty_orders "An open cardboard box with a dotted delivery route and small location pin floating above it, ${STYLE}" "1024x1024"
run empty_products "A neat shelf with three minimal shopping product silhouettes and a sparkle, ${STYLE}" "1024x1024"
run empty_customers "Two friendly abstract user avatars in circles with a small heart between them, ${STYLE}" "1024x1024"
run empty_shipments "A cargo ship on gentle waves pulling small containers with a plane above, ${STYLE}" "1024x1024"
run empty_sourcing "A clipboard with a magnifying glass and a small shopping bag, ${STYLE}" "1024x1024"
run empty_payments "A credit card and mobile phone with a coin and a checkmark shield, ${STYLE}" "1024x1024"
run empty_generic "A friendly compass with a soft glow and small stars around it, ${STYLE}" "1024x1024"

wait
echo "=== Results ==="
for f in login_hero empty_orders empty_products empty_customers empty_shipments empty_sourcing empty_payments empty_generic; do
  if [ -s "apps/web/public/admin/$f.png" ]; then
    echo "OK $f.png ($(stat -f%z apps/web/public/admin/$f.png) bytes)"
  else
    echo "FAIL $f — $(cat /tmp/genadm_$f.log 2>/dev/null | tail -2)"
  fi
done
