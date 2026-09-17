#!/usr/bin/env python3
"""Generate an image via TT Image 2.5 (lk888) and save it.
Usage: gen_image.py <prompt> <out.png> [size]
Response: {"data":[{"b64_json":"..."}]}"""
import base64, json, sys, urllib.request

KEY = "sk-12abe1c47e78b947329c036d273efc3cfb4e03d06042991b"
prompt, out, size = sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "1024x1024"
body = json.dumps({"model": "tt-image-2.5", "prompt": prompt, "size": size}).encode()
req = urllib.request.Request(
    "https://api.lk888.ai/v1/images/generations",
    data=body,
    headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
)
with urllib.request.urlopen(req, timeout=240) as r:
    data = json.loads(r.read())
b64 = data["data"][0].get("b64_json")
if not b64:
    # Some channels return an image URL instead
    url = data["data"][0].get("url")
    if url:
        with urllib.request.urlopen(url, timeout=240) as ir:
            raw = ir.read()
        open(out, "wb").write(raw)
        print(f"OK {out} ({len(raw)} bytes, via url)")
        sys.exit(0)
    print(json.dumps(data)[:500])
    sys.exit(1)
raw = base64.b64decode(b64)
open(out, "wb").write(raw)
print(f"OK {out} ({len(raw)} bytes)")