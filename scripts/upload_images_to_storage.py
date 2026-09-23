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
MIN_BYTES     = 512

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
        img = Image.open(io.BytesIO(data)).convert("RGB")
        pixels = list(img.getdata())
        if not pixels: return False, "no pixels"
        non_white = sum(1 for r,g,b in pixels if not (r>240 and g>240 and b>240))
        if non_white / len(pixels) < 0.02:
            return False, f"blank ({non_white/len(pixels)*100:.1f}% non-white)"
    except Exception:
        pass
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

    all_pngs = []
    for sp in search_paths:
        base = PUBLIC_ASSETS / sp
        if args.year and sp == "gate":
            base = PUBLIC_ASSETS / "gate" / str(args.year)
        pngs = sorted(base.rglob("*.png")) if base.exists() else []
        all_pngs.extend(pngs)

    print("=" * 70)
    print(f"MOCK.AI — Image Upload to Supabase Storage")
    print("=" * 70)
    print(f"  Bucket: {STORAGE_BUCKET}")
    print(f"  Images found: {len(all_pngs)}")
    print()

    seen_hashes = set()
    uploaded = skipped = rejected = errors = 0
    start = datetime.datetime.now()

    for i, png_path in enumerate(all_pngs, 1):
        # Convert absolute path to storage path
        rel = png_path.relative_to(PUBLIC_ASSETS)
        storage_path = str(rel).replace("\\", "/")

        data = png_path.read_bytes()
        h    = compute_hash(data)

        # Dedup
        if h in seen_hashes:
            skipped += 1
            continue
        seen_hashes.add(h)

        # Validate
        valid, reason = is_valid_image(data, str(png_path))
        if not valid:
            rejected += 1
            if rejected <= 5:
                print(f"  ✗ Rejected: {png_path.name} ({reason})")
            continue

        # Upload
        mime = mimetypes.guess_type(str(png_path))[0] or "image/png"
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
                remaining = (len(all_pngs) - i) / rate if rate > 0 else 0
                print(f"  [{i}/{len(all_pngs)}] Uploaded: {uploaded} | Rate: {rate:.0f}/s | ETA: {remaining/60:.1f}min")
        except Exception as e:
            err_str = str(e).lower()
            if "already exists" in err_str or "duplicate" in err_str:
                skipped += 1
            else:
                errors += 1
                if errors <= 5:
                    print(f"  ⚠️  Upload error {png_path.name}: {str(e)[:60]}")

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
