#!/usr/bin/env python3
"""Generate all product category images and landing page assets for ChinaSuuq.
Uses curl for HTTP calls (macOS SSL fix) + python3 for base64 decode."""

import os
import sys
import time
import json
import base64
import subprocess
import signal

BASE_URL = "https://api.lk888.ai"
API_KEY = "sk-12abe1c47e78b947329c036d273efc3cfb4e03d06042991b"
MODEL = "gpt-image-2"
SIZE = "1024x1024"
BASE_DIR = os.path.expanduser("~/Desktop/chinasuuq/public/images")
TIMEOUT = 120  # seconds per image

def kill_existing():
    """Kill any existing generate_images processes."""
    try:
        result = subprocess.run(["pgrep", "-f", "generate_images"], capture_output=True, text=True)
        pids = result.stdout.strip().split('\n')
        for pid in pids:
            if pid and pid != str(os.getpid()):
                try:
                    os.kill(int(pid), signal.SIGKILL)
                    print(f"Killed existing process {pid}")
                except (ProcessLookupError, ValueError):
                    pass
        time.sleep(1)
    except Exception:
        pass

def generate_one(filename, prompt):
    """Generate a single image using curl + python decode."""
    filepath = os.path.join(BASE_DIR, filename)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    # Escape prompt for shell
    escaped_prompt = prompt.replace('"', '\\"').replace("'", "'\\''")
    
    # Use curl for HTTP call (avoids macOS SSL issues), then python for base64 decode
    cmd = f'''curl -s -X POST "{BASE_URL}/v1/images/generations" \
  -H "Authorization: Bearer {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{{"model": "{MODEL}", "prompt": "{escaped_prompt}", "n": 1, "size": "{SIZE}"}}' \
  --max-time {TIMEOUT} -o /tmp/lk888_result.json -w "HTTP:%{{http_code}}" && \
python3 -c "
import json, base64, sys, os
try:
    d = json.load(open('/tmp/lk888_result.json'))
    b64 = d['data'][0]['b64_json']
    with open('{filepath}', 'wb') as f:
        f.write(base64.b64decode(b64))
    fsize = os.path.getsize('{filepath}')
    print(f'OK:' + str(fsize))
except Exception as e:
    print(f'ERR:' + str(e))
    sys.exit(1)
"'''
    
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=TIMEOUT + 30)
    output = result.stdout.strip()
    
    if "OK:" in output:
        size_str = output.split("OK:")[1].strip()
        size_kb = int(size_str) / 1024
        return True, f"{size_kb:.1f}KB"
    else:
        error = result.stderr.strip() or output
        return False, error[:200]

# Define all images
IMAGES = {
    # Category images (12)
    "categories/electronics.jpg": "Professional product photography of modern consumer electronics: premium over-ear headphones, smartwatch, wireless earbuds arranged on clean white background, studio lighting, commercial catalog style, no text, no Chinese characters",
    "categories/fashion.jpg": "Professional product photography of fashionable items: trendy sneakers, casual jacket, sunglasses arranged on white background, fashion catalog style, studio lighting, no text, no Chinese characters",
    "categories/home-kitchen.jpg": "Professional product photography of modern kitchen appliances: blender, coffee maker, stainless steel pots on white background, clean composition, studio lighting, no text, no Chinese characters",
    "categories/beauty.jpg": "Professional product photography of skincare and cosmetics: glass bottles, cream jars, serum dropper, lipstick arranged on white background, elegant beauty aesthetic, no text, no Chinese characters",
    "categories/baby-toys.jpg": "Professional product photography of colorful children's toys: wooden blocks, stuffed animals, building blocks on white background, bright cheerful colors, no text, no Chinese characters",
    "categories/tools-hardware.jpg": "Professional product photography of power tools and hardware: cordless drill, wrench set, screwdriver kit on white background, industrial quality, no text, no Chinese characters",
    "categories/shoes-bags.jpg": "Professional product photography of sneakers and handbags: stylish athletic shoes, leather handbag on white background, fashion photography, no text, no Chinese characters",
    "categories/automotive.jpg": "Professional product photography of car accessories: phone mount, LED lights, dashcam on white background, auto gadgets, no text, no Chinese characters",
    "categories/machinery.jpg": "Professional product photography of small industrial machinery: CNC parts, welding equipment, compact tools on white background, no text, no Chinese characters",
    "categories/construction.jpg": "Professional product photography of construction equipment: power drill, hard hat, measuring tools on white background, building supplies, no text, no Chinese characters",
    "categories/packaging.jpg": "Professional product photography of packaging materials: cardboard boxes, bubble wrap, shipping tape on white background, clean packaging supplies, no text, no Chinese characters",
    "categories/business-supplies.jpg": "Professional product photography of office supplies: desk organizer, notebooks, pens, calculator on white background, professional office, no text, no Chinese characters",
    
    # Hero assets (2)
    "hero/hero-illustration.jpg": "Commercial 3D illustration of orange shopping bag, smartphone, cardboard boxes, airplane flying above, warm orange gradient background, modern e-commerce concept, clean 3D render, no text, no Chinese characters",
    "hero/phone-mockup.png": "Clean modern smartphone mockup on white background, blank screen, floating at slight angle, soft shadow, minimalist product photography, no text, no Chinese characters",
    
    # How it works icons (6)
    "icons/step-search.jpg": "Simple flat icon illustration of magnifying glass searching products, white background, minimal design, blue and orange accents, search concept, no text, no Chinese characters",
    "icons/step-select.jpg": "Simple flat icon illustration of hand selecting from product catalog, white background, minimal design, blue and orange accents, selection concept, no text, no Chinese characters",
    "icons/step-purchase.jpg": "Simple flat icon illustration of shopping cart with checkmark, white background, minimal design, blue and orange accents, purchase concept, no text, no Chinese characters",
    "icons/step-inspect.jpg": "Simple flat icon illustration of magnifying glass with shield, white background, minimal design, blue and orange accents, quality inspection, no text, no Chinese characters",
    "icons/step-ship.jpg": "Simple flat icon illustration of cargo ship with shipping boxes, white background, minimal design, blue and orange accents, shipping concept, no text, no Chinese characters",
    "icons/step-deliver.jpg": "Simple flat icon illustration of delivery truck with package, white background, minimal design, blue and orange accents, delivery concept, no text, no Chinese characters",
    
    # Marketplace logos (3)
    "markets/1688-logo.png": "Minimalist geometric logo icon for wholesale marketplace, simple orange design on white background, flat style, professional brand icon, no text",
    "markets/taobao-logo.png": "Minimalist geometric logo icon for shopping marketplace, simple orange design on white background, flat style, professional brand icon, no text",
    "markets/yiwugo-logo.png": "Minimalist geometric logo icon for wholesale platform, simple orange design on white background, flat style, professional brand icon, no text",
    
    # App store badges (2)
    "app-store-badge.png": "Professional App Store download badge, dark background with apple logo and text Download on the App Store, standard Apple design, no Chinese characters",
    "google-play-badge.png": "Professional Google Play download badge, white background with Google Play triangle logo and text Get it on Google Play, standard Google design, no Chinese characters",
}

def main():
    print("=" * 60)
    print("ChinaSuuq Image Generator - lk888.ai (curl-based)")
    print("=" * 60)
    
    kill_existing()
    
    print(f"\nOutput: {BASE_DIR}")
    print(f"Images: {len(IMAGES)}")
    print(f"Model: {MODEL}")
    print()
    
    # Split into waves of 3
    items = list(IMAGES.items())
    waves = [items[i:i+3] for i in range(0, len(items), 3)]
    
    downloaded = 0
    failed_list = []
    
    for wave_num, wave in enumerate(waves, 1):
        print(f"\n{'='*50}")
        print(f"Wave {wave_num}/{len(waves)} ({len(wave)} images)")
        print(f"{'='*50}")
        
        for filename, prompt in wave:
            print(f"\n  Generating: {filename}...")
            start = time.time()
            success, info = generate_one(filename, prompt)
            elapsed = time.time() - start
            
            if success:
                print(f"  ✅ {filename} ({info}, {elapsed:.1f}s)")
                downloaded += 1
            else:
                print(f"  ❌ {filename} FAILED: {info}")
                failed_list.append((filename, info))
        
        # Brief pause between waves
        if wave_num < len(waves):
            print(f"\n  Pausing 2s before next wave...")
            time.sleep(2)
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Total:     {len(IMAGES)}")
    print(f"  Downloaded: {downloaded}")
    print(f"  Failed:     {len(failed_list)}")
    print(f"  Output:     {BASE_DIR}")
    
    if failed_list:
        print("\n  Failed images:")
        for fn, err in failed_list:
            print(f"    ❌ {fn}: {err[:80]}")
    
    if downloaded > 0:
        print("\n  Generated files:")
        for filename in IMAGES:
            filepath = os.path.join(BASE_DIR, filename)
            if os.path.exists(filepath):
                size = os.path.getsize(filepath)
                print(f"    📄 {filename} ({size/1024:.1f}KB)")
    
    print("\n🎉 Done!")

if __name__ == "__main__":
    main()
