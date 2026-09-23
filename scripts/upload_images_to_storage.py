#!/usr/bin/env python3
"""
MOCK.AI — Upload All Exam Images to Supabase Storage (Phase 1)
==============================================================
Uploads exam PNGs and JPEGs to the exam-assets Storage bucket.
Features:
- Fast parallel uploads (configurable thread pool)
- Persistent resume manifest (.uploaded_storage_manifest.txt)
- Exponential backoff & network/DNS auto-recovery
- Smart visual validation (rejects empty/blank/monochrome separator lines)
- Safe idempotent upsert

Usage:
  python3 scripts/upload_images_to_storage.py [--exam gate|ssc-chsl] [--year 2025] [--workers 8]
"""

import os
import sys
import time
import glob
import hashlib
import argparse
import datetime
import mimetypes
import threading
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
warnings.filterwarnings("ignore")

from pathlib import Path
from supabase import create_client

CONTENT_URL   = "https://nvvscqxsrechenyqcwli.supabase.co"
STORAGE_BUCKET = "exam-assets"
PUBLIC_ASSETS = Path("/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/public/exam-assets")
MANIFEST_FILE = Path(__file__).resolve().parent / ".uploaded_storage_manifest.txt"
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
        non_white = sum(1 for r, g, b in pixels if not (r > 240 and g > 240 and b > 240))
        if non_white / len(pixels) < 0.005:
            return False, f"blank ({non_white/len(pixels)*100:.2f}% non-white)"
    except Exception as e:
        return False, f"corrupt ({e})"
    return True, "ok"

def upload_single_file(sb, img_path: Path, storage_path: str, data: bytes, mime: str, max_retries: int = 4) -> tuple[bool, str]:
    """Uploads a single file to Supabase storage with exponential backoff on network/DNS errors."""
    for attempt in range(max_retries):
        try:
            sb.storage.from_(STORAGE_BUCKET).upload(
                path=storage_path,
                file=data,
                file_options={"content-type": mime, "upsert": "true"},
            )
            return True, "ok"
        except Exception as e:
            err_str = str(e).lower()
            if "already exists" in err_str or "duplicate" in err_str:
                return True, "already exists"

            # Check for transient network or DNS errors
            if any(term in err_str for term in ["nodename nor servname", "timed out", "connection", "temporary failure", "timeout"]):
                # Exponential backoff with jitter
                sleep_time = (2 ** attempt) * 2
                time.sleep(sleep_time)
            else:
                time.sleep(1 + attempt)

            if attempt == max_retries - 1:
                return False, str(e)
    return False, "max retries exceeded"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exam",    type=str, default=None)
    parser.add_argument("--year",    type=int, default=None)
    parser.add_argument("--workers", type=int, default=8, help="Number of concurrent upload workers")
    args = parser.parse_args()

    service_key = os.environ.get("SUPABASE_CONTENT_SERVICE_KEY", "")
    if not service_key:
        print("ERROR: Set SUPABASE_CONTENT_SERVICE_KEY env var")
        sys.exit(1)

    sb = create_client(CONTENT_URL, service_key)

    # Discover all image files
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

    # Load persistent manifest if exists
    completed_manifest = set()
    if MANIFEST_FILE.exists():
        for line in MANIFEST_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                completed_manifest.add(line)

    print("=" * 70, flush=True)
    print("MOCK.AI — High-Resilience Parallel Image Upload to Supabase Storage", flush=True)
    print("=" * 70, flush=True)
    print(f"  Bucket:               {STORAGE_BUCKET}", flush=True)
    print(f"  Total Images Found:   {len(all_images)}", flush=True)
    print(f"  Already in Manifest:  {len(completed_manifest)}", flush=True)
    print(f"  Worker Threads:       {args.workers}", flush=True)
    print("=" * 70, flush=True)

    manifest_lock = threading.Lock()
    stats_lock = threading.Lock()
    counters = {
        "uploaded": 0,
        "skipped_manifest": 0,
        "skipped_dup_hash": 0,
        "rejected": 0,
        "errors": 0,
        "total_processed": 0
    }
    seen_hashes = set()
    start_time = datetime.datetime.now()

    manifest_fd = open(MANIFEST_FILE, "a", encoding="utf-8")

    def process_image(img_path: Path):
        rel = img_path.relative_to(PUBLIC_ASSETS)
        storage_path = str(rel).replace("\\", "/")

        # Check manifest
        if storage_path in completed_manifest:
            with stats_lock:
                counters["skipped_manifest"] += 1
                counters["total_processed"] += 1
            return ("manifest", storage_path, None)

        try:
            data = img_path.read_bytes()
        except Exception as e:
            with stats_lock:
                counters["errors"] += 1
                counters["total_processed"] += 1
            return ("error", storage_path, f"read error: {e}")

        h = compute_hash(data)
        with stats_lock:
            if h in seen_hashes:
                counters["skipped_dup_hash"] += 1
                counters["total_processed"] += 1
                return ("dup_hash", storage_path, None)
            seen_hashes.add(h)

        valid, reason = is_valid_image(data, str(img_path))
        if not valid:
            with stats_lock:
                counters["rejected"] += 1
                counters["total_processed"] += 1
            return ("rejected", storage_path, reason)

        mime = mimetypes.guess_type(str(img_path))[0] or "image/png"
        ok, err = upload_single_file(sb, img_path, storage_path, data, mime)

        if ok:
            with manifest_lock:
                manifest_fd.write(f"{storage_path}\n")
                manifest_fd.flush()
            with stats_lock:
                counters["uploaded"] += 1
                counters["total_processed"] += 1
            return ("uploaded", storage_path, None)
        else:
            with stats_lock:
                counters["errors"] += 1
                counters["total_processed"] += 1
            return ("error", storage_path, err)

    rejected_samples = []
    error_samples = []

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(process_image, p): p for p in all_images}
        for future in as_completed(futures):
            status, path, msg = future.result()
            if status == "rejected" and len(rejected_samples) < 5:
                rejected_samples.append((path, msg))
                print(f"  ✗ Rejected: {Path(path).name} ({msg})", flush=True)
            elif status == "error" and len(error_samples) < 5:
                error_samples.append((path, msg))
                print(f"  ⚠️  Error: {Path(path).name} ({msg})", flush=True)

            with stats_lock:
                curr = counters["total_processed"]
                up = counters["uploaded"]

            if curr % 500 == 0 or curr == len(all_images):
                elapsed = (datetime.datetime.now() - start_time).total_seconds()
                rate = curr / elapsed if elapsed > 0 else 0
                remaining = (len(all_images) - curr) / rate if rate > 0 else 0
                print(
                    f"  [{curr}/{len(all_images)}] Uploaded: {up} | "
                    f"Skipped: {counters['skipped_manifest'] + counters['skipped_dup_hash']} | "
                    f"Rate: {rate:.0f} img/s | ETA: {remaining/60:.1f}min",
                    flush=True
                )

    manifest_fd.close()
    elapsed = (datetime.datetime.now() - start_time).total_seconds()

    print()
    print("=" * 70, flush=True)
    print("STORAGE UPLOAD COMPLETE", flush=True)
    print("=" * 70, flush=True)
    print(f"  Uploaded to Storage:        {counters['uploaded']}", flush=True)
    print(f"  Skipped (Already Manifest): {counters['skipped_manifest']}", flush=True)
    print(f"  Skipped (Duplicate Hash):   {counters['skipped_dup_hash']}", flush=True)
    print(f"  Rejected (Invalid/Blank):   {counters['rejected']}", flush=True)
    print(f"  Errors:                     {counters['errors']}", flush=True)
    print(f"  Total Duration:             {elapsed:.1f}s ({elapsed/60:.1f}min)", flush=True)
    print("=" * 70, flush=True)

if __name__ == "__main__":
    main()
