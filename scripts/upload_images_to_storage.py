#!/usr/bin/env python3
"""
MOCK.AI — Upload All Exam Images to Supabase Storage (Phase 1)
==============================================================
Uploads all 8,597 exam PNGs to the exam-assets Storage bucket.
This runs INDEPENDENTLY of the database schema.
Run this while waiting for the schema to be applied.

After this completes, apply the schema and run the full migration:
  python3 scripts/apply_schema_project2.py YOUR_DB_PASSWORD
  python3 scripts/migrate_to_supabase_content.py

Usage:
  python3 scripts/upload_images_to_storage.py [--exam gate|ssc-chsl] [--year 2025]
"""

import os
import sys
import glob
import hashlib
import argparse
import datetime
import mimetypes
import warnings
warnings.filterwarnings("ignore")

from pathlib import Path
from supabase import create_client

CONTENT_URL   = "https://nvvscqxsrechenyqcwli.supabase.co"
STORAGE_BUCKET = "exam-assets"
PUBLIC_ASSETS = Path("/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/public/exam-assets")
MIN_BYTES     = 100

WATERMARK_PATTERNS = ["watermark", "_wm_", "_bg_"]

def compute_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def is_valid_image(data: bytes, path: str) -> tuple[bool, str]:
    if len(data) < MIN_BYTES:
        return False, f"too small ({len(data)}B)"
    if any(p in path.lower() for p in WATERMARK_PATTERNS):
        return False, "watermark pattern"
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(data))
        w, h = img.size
        if w < 5 or h < 5:
            return False, f"dimension too small ({w}x{h})"

        if (w > 100 and h <= 2) or (h > 100 and w <= 2):
            return False, f"separator line artifact ({w}x{h})"

        ext = img.getextrema()
        if isinstance(ext, tuple) and len(ext) > 0:
            if isinstance(ext[0], tuple):
                if all(c_min == c_max for c_min, c_max in ext[:3]):
                    return False, "solid monochrome rectangle"
            elif ext[0] == ext[1]:
                return False, "solid monochrome rectangle"

        rgb_img = img.convert("RGB")
        pixels = list(rgb_img.getdata())
        if not pixels: return False, "no pixels"
        non_white = sum(1 for r,g,b in pixels if not (r>240 and g>240 and b>240))
        if non_white / len(pixels) < 0.005:
            return False, f"blank ({non_white/len(pixels)*100:.2f}% non-white)"
    except Exception as e:
        return False, f"corrupt ({e})"
    return True, "ok"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exam",  type=str, default=None)
    parser.add_argument("--year",  type=int, default=None)
    args = parser.parse_args()

    service_key = os.environ.get("SUPABASE_CONTENT_SERVICE_KEY", "")
    if not service_key:
        print("ERROR: Set SUPABASE_CONTENT_SERVICE_KEY env var")
        sys.exit(1)

    sb = create_client(CONTENT_URL, service_key)

    # Discover all PNG files
    if args.exam == "gate":
        search_paths = ["gate"]
    elif args.exam == "ssc-chsl":
        search_paths = ["ssc"]
    else:
        search_paths = ["gate", "ssc"]

    all_images = []
    for sp in search_paths:
        base = PUBLIC_ASSETS / sp
        if args.year and sp == "gate":
            base = PUBLIC_ASSETS / "gate" / str(args.year)
        if base.exists():
            files = sorted(
                list(base.rglob("*.png")) +
                list(base.rglob("*.jpeg")) +
                list(base.rglob("*.jpg"))
            )
            all_images.extend(files)

    print("=" * 70, flush=True)
    print("MOCK.AI — Image Upload to Supabase Storage", flush=True)
    print("=" * 70, flush=True)
    print(f"  Bucket: {STORAGE_BUCKET}", flush=True)
    print(f"  Images found: {len(all_images)}", flush=True)
    print(flush=True)

    seen_hashes = set()
    uploaded = skipped = rejected = errors = 0
    start = datetime.datetime.now()

    for i, img_path in enumerate(all_images, 1):
        # Convert absolute path to storage path
        rel = img_path.relative_to(PUBLIC_ASSETS)
        storage_path = str(rel).replace("\\", "/")

        data = img_path.read_bytes()
        h    = compute_hash(data)

        # Dedup
        if h in seen_hashes:
            skipped += 1
            continue
        seen_hashes.add(h)

        # Validate
        valid, reason = is_valid_image(data, str(img_path))
        if not valid:
            rejected += 1
            if rejected <= 5:
                print(f"  ✗ Rejected: {img_path.name} ({reason})", flush=True)
            continue

        # Upload
        mime = mimetypes.guess_type(str(img_path))[0] or "image/png"
        try:
            sb.storage.from_(STORAGE_BUCKET).upload(
                path=storage_path,
                file=data,
                file_options={"content-type": mime, "upsert": "true"},
            )
            uploaded += 1
            if uploaded % 100 == 0 or i <= 5:
                elapsed = (datetime.datetime.now() - start).total_seconds()
                rate = uploaded / elapsed if elapsed > 0 else 0
                remaining = (len(all_images) - i) / rate if rate > 0 else 0
                print(f"  [{i}/{len(all_images)}] Uploaded: {uploaded} | Rate: {rate:.0f}/s | ETA: {remaining/60:.1f}min", flush=True)
        except Exception as e:
            err_str = str(e).lower()
            if "already exists" in err_str or "duplicate" in err_str:
                skipped += 1
            else:
                errors += 1
                if errors <= 5:
                    print(f"  ⚠️  Upload error {img_path.name}: {str(e)[:60]}", flush=True)

    elapsed = (datetime.datetime.now() - start).total_seconds()
    print()
    print("=" * 70)
    print("IMAGE UPLOAD COMPLETE")
    print("=" * 70)
    print(f"  Uploaded:  {uploaded}")
    print(f"  Skipped:   {skipped} (duplicate hash)")
    print(f"  Rejected:  {rejected} (blank/watermark)")
    print(f"  Errors:    {errors}")
    print(f"  Time:      {elapsed:.0f}s ({elapsed/60:.1f}min)")
    print()
    print("Next steps:")
    print("  1. Apply schema: python3 scripts/apply_schema_project2.py YOUR_DB_PASSWORD")
    print("  2. Run migration: python3 scripts/migrate_to_supabase_content.py")
    print("=" * 70)

if __name__ == "__main__":
    main()
