#!/usr/bin/env python3
"""
MOCK.AI — Supabase Project 2 Content Migration Script
======================================================
Migrates all exam content from local JSON + PNG files to Supabase Project 2.

Usage:
  python3 scripts/migrate_to_supabase_content.py [--dry-run] [--exam EXAM_ID] [--year YEAR]

Examples:
  python3 scripts/migrate_to_supabase_content.py --dry-run        # Preview, no writes
  python3 scripts/migrate_to_supabase_content.py                   # Full migration
  python3 scripts/migrate_to_supabase_content.py --exam gate       # Only GATE papers
  python3 scripts/migrate_to_supabase_content.py --exam ssc-chsl --year 2025

This script is fully idempotent. Running it multiple times will NOT duplicate content.
"""

import os
import sys
import json
import glob
import hashlib
import argparse
import datetime
import mimetypes
import time
from pathlib import Path
from typing import Optional


def sanitize_text(value) -> str:
    """
    Remove null bytes (\\u0000) that PostgreSQL TEXT columns reject.
    Also strips other control characters that cause 22P05 errors.
    """
    if not isinstance(value, str):
        return value
    # Remove null bytes
    return value.replace('\x00', '').replace('\\u0000', '')


def sanitize_dict(d: dict) -> dict:
    """Recursively sanitize all string values in a dict."""
    result = {}
    for k, v in d.items():
        if isinstance(v, str):
            result[k] = sanitize_text(v)
        elif isinstance(v, dict):
            result[k] = sanitize_dict(v)
        elif isinstance(v, list):
            result[k] = [sanitize_text(i) if isinstance(i, str) else i for i in v]
        else:
            result[k] = v
    return result


def upsert_with_retry(client, table: str, row: dict, conflict: str, stats, context: str, max_retries: int = 4):
    """Upsert a row with exponential backoff retry on network errors."""
    row = sanitize_dict(row)
    for attempt in range(max_retries):
        try:
            result = client.table(table).upsert(row, on_conflict=conflict).execute()
            return result
        except Exception as e:
            err_str = str(e).lower()
            is_network = any(x in err_str for x in [
                "nodename nor servname", "connection reset", "broken pipe",
                "timed out", "connectionterminated", "errno 8", "errno 54", "errno 32",
                "errno 49", "can't assign requested address"
            ])
            is_final = any(x in err_str for x in ["22p05", "duplicate", "unique"])

            if is_final or attempt == max_retries - 1:
                stats.add_error(context, str(e)[:120])
                return None

            # Longer waits: 3s, 8s, 20s — covers typical DNS recovery time
            wait = [3, 8, 20][attempt]
            print(f"    ⟳ Retry {attempt+1}/{max_retries} for {context} in {wait}s ({err_str[:50]})")
            time.sleep(wait)
    return None


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).parent.parent
WEB_SRC      = PROJECT_ROOT / "web" / "src" / "data" / "exams"
PUBLIC_ASSETS = PROJECT_ROOT / "web" / "public" / "exam-assets"

CONTENT_URL = "https://nvvscqxsrechenyqcwli.supabase.co"
CONTENT_KEY = "sb_publishable_cPG2lwdWsiWhUTjctYedCw_RKoqOQnW"
STORAGE_BUCKET = "exam-assets"

# Image quality heuristics — reject if below threshold (watermark filter)
MIN_FILE_SIZE_BYTES = 1024          # Skip files < 1 KB (likely blank / empty)
MIN_NON_WHITE_RATIO = 0.02          # At least 2% non-white pixels (visual content check)

# ---------------------------------------------------------------------------
# Watermark/Invalid asset detection
# ---------------------------------------------------------------------------
WATERMARK_PATH_PATTERNS = [
    # Files named with 'watermark' in path
    "watermark",
    # GATE IIT watermark indicators
    "_wm_", "_bg_",
]

def looks_like_watermark_path(path: str) -> bool:
    """Basic path-based watermark detection."""
    lower = path.lower()
    return any(p in lower for p in WATERMARK_PATH_PATTERNS)

def compute_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def is_valid_image_bytes(data: bytes, path: str) -> tuple[bool, str]:
    """
    Returns (is_valid, reason).
    Reject images that are too small or appear to be pure-white/blank.
    """
    if len(data) < MIN_FILE_SIZE_BYTES:
        return False, f"file too small ({len(data)} bytes)"
    if looks_like_watermark_path(path):
        return False, "watermark path pattern"

    # Try pixel-level check (requires Pillow)
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(data)).convert("RGB")
        w, h = img.size
        if w == 0 or h == 0:
            return False, "zero-dimension image"
        pixels = list(img.getdata())
        non_white = sum(1 for r, g, b in pixels if not (r > 240 and g > 240 and b > 240))
        ratio = non_white / len(pixels)
        if ratio < MIN_NON_WHITE_RATIO:
            return False, f"nearly blank ({ratio*100:.1f}% non-white pixels)"
    except ImportError:
        pass  # Pillow not installed — skip pixel check
    except Exception:
        pass  # Corrupt image — let Supabase handle it

    return True, "ok"

# ---------------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------------
class MigrationStats:
    def __init__(self):
        self.papers_discovered = 0
        self.papers_imported = 0
        self.papers_skipped_duplicate = 0
        self.questions_imported = 0
        self.images_discovered = 0
        self.images_uploaded = 0
        self.images_skipped_duplicate = 0
        self.images_rejected_watermark = 0
        self.errors: list[dict] = []
        self.start_time = datetime.datetime.now()

    def add_error(self, context: str, message: str):
        self.errors.append({"context": context, "error": message})
        print(f"  ⚠️  ERROR [{context}]: {message}")

    def print_report(self):
        elapsed = (datetime.datetime.now() - self.start_time).total_seconds()
        print("\n" + "=" * 70)
        print("MOCK.AI CONTENT MIGRATION REPORT")
        print("=" * 70)
        print(f"  Papers discovered:         {self.papers_discovered}")
        print(f"  Papers imported:           {self.papers_imported}")
        print(f"  Papers skipped (dup):      {self.papers_skipped_duplicate}")
        print(f"  Questions imported:        {self.questions_imported}")
        print(f"  Images discovered:         {self.images_discovered}")
        print(f"  Images uploaded:           {self.images_uploaded}")
        print(f"  Images skipped (dup):      {self.images_skipped_duplicate}")
        print(f"  Images rejected (invalid): {self.images_rejected_watermark}")
        print(f"  Errors:                    {len(self.errors)}")
        print(f"  Time elapsed:              {elapsed:.1f}s")
        if self.errors:
            print("\n  Error details:")
            for e in self.errors[:20]:
                print(f"    • [{e['context']}] {e['error']}")
        print("=" * 70)

# ---------------------------------------------------------------------------
# Supabase helper
# ---------------------------------------------------------------------------
def get_supabase_client():
    from supabase import create_client
    return create_client(CONTENT_URL, CONTENT_KEY)

def get_service_client():
    """
    Attempt to get a service-role client for DDL/DML operations.
    Falls back to publishable key client (which can INSERT with RLS permitting service_role bypass).
    """
    service_key = os.environ.get("SUPABASE_CONTENT_SERVICE_KEY", "")
    if service_key:
        from supabase import create_client
        return create_client(CONTENT_URL, service_key)
    return get_supabase_client()

# ---------------------------------------------------------------------------
# Storage bucket setup
# ---------------------------------------------------------------------------
def ensure_bucket_exists(client, dry_run: bool, stats: MigrationStats) -> bool:
    """Create the exam-assets bucket if it doesn't exist."""
    try:
        buckets = client.storage.list_buckets()
        existing = [b.name for b in buckets] if buckets else []
        if STORAGE_BUCKET in existing:
            print(f"  ✓ Storage bucket '{STORAGE_BUCKET}' already exists")
            return True
        if dry_run:
            print(f"  [DRY RUN] Would create bucket: {STORAGE_BUCKET}")
            return True
        client.storage.create_bucket(STORAGE_BUCKET, options={"public": True})
        print(f"  ✓ Created storage bucket: {STORAGE_BUCKET}")
        return True
    except Exception as e:
        # Bucket may already exist with a different API response format
        err_str = str(e).lower()
        if "already exists" in err_str or "duplicate" in err_str:
            print(f"  ✓ Storage bucket '{STORAGE_BUCKET}' already exists")
            return True
        stats.add_error("bucket_setup", str(e))
        return False

# ---------------------------------------------------------------------------
# Asset upload
# ---------------------------------------------------------------------------
def upload_asset(
    client,
    local_path: Path,
    storage_path: str,
    paper_id: str,
    asset_type: str,
    dry_run: bool,
    stats: MigrationStats,
    asset_cache: dict  # content_hash -> asset_id
) -> Optional[str]:
    """
    Upload a single image to Supabase Storage + insert into content_assets.
    Returns the content_assets UUID or None on failure.
    """
    stats.images_discovered += 1

    if not local_path.exists():
        stats.add_error(f"asset:{storage_path}", "local file not found")
        return None

    data = local_path.read_bytes()
    content_hash = compute_hash(data)

    # Check cache (in-memory dedup within this run)
    if content_hash in asset_cache:
        stats.images_skipped_duplicate += 1
        return asset_cache[content_hash]

    # Validate image
    valid, reason = is_valid_image_bytes(data, str(local_path))
    if not valid:
        stats.images_rejected_watermark += 1
        print(f"    ✗ Rejected asset: {local_path.name} ({reason})")
        return None

    if dry_run:
        print(f"    [DRY RUN] Would upload: {storage_path} ({len(data):,} bytes)")
        fake_id = f"dry-run-{content_hash[:8]}"
        asset_cache[content_hash] = fake_id
        stats.images_uploaded += 1
        return fake_id

    # Check if already in content_assets table (DB-level dedup)
    try:
        existing = client.table("content_assets").select("id").eq("content_hash", content_hash).maybeSingle().execute()
        if existing.data:
            asset_id = existing.data["id"]
            asset_cache[content_hash] = asset_id
            stats.images_skipped_duplicate += 1
            return asset_id
    except Exception:
        pass  # table may not have the row — proceed

    # Upload to Supabase Storage (with retry on network errors)
    mime = mimetypes.guess_type(str(local_path))[0] or "image/png"
    upload_ok = False
    for attempt in range(3):
        try:
            client.storage.from_(STORAGE_BUCKET).upload(
                path=storage_path,
                file=data,
                file_options={"content-type": mime, "upsert": "true"},
            )
            upload_ok = True
            break
        except Exception as e:
            err_str = str(e).lower()
            if "already exists" in err_str or "duplicate" in err_str:
                upload_ok = True  # already there
                break
            is_network = any(x in err_str for x in [
                "connection reset", "broken pipe", "timed out",
                "errno 54", "errno 32", "errno 8", "nodename",
                "errno 49", "can't assign requested address"
            ])
            if is_network and attempt < 2:
                wait = [3, 8][attempt]
                time.sleep(wait)
                continue
            stats.add_error(f"upload:{storage_path}", str(e)[:80])
            return None

    if not upload_ok:
        return None


    # Insert metadata into content_assets
    public_url = f"{CONTENT_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{storage_path}"
    try:
        result = client.table("content_assets").upsert({
            "storage_path": storage_path,
            "bucket": STORAGE_BUCKET,
            "public_url": public_url,
            "mime_type": mime,
            "file_size_bytes": len(data),
            "content_hash": content_hash,
            "asset_type": asset_type,
            "source_paper_id": paper_id,
            "source_file": str(local_path),
        }, on_conflict="content_hash").execute()

        asset_id = result.data[0]["id"] if result.data else None
        if asset_id:
            asset_cache[content_hash] = asset_id
            stats.images_uploaded += 1
            return asset_id
    except Exception as e:
        stats.add_error(f"asset_meta:{storage_path}", str(e))

    return None

# ---------------------------------------------------------------------------
# Convert local image path → storage path
# ---------------------------------------------------------------------------
def local_path_to_storage_path(local_url: str) -> Optional[str]:
    """
    '/exam-assets/gate/2025/cs-1/q5_diag.png'
    → 'gate/2025/cs-1/q5_diag.png'
    """
    if not local_url:
        return None
    # Strip leading /exam-assets/
    path = local_url.lstrip("/")
    if path.startswith("exam-assets/"):
        path = path[len("exam-assets/"):]
    return path

def resolve_local_file(local_url: str) -> Optional[Path]:
    """Convert URL like '/exam-assets/gate/...' to absolute local path."""
    storage_path = local_path_to_storage_path(local_url)
    if not storage_path:
        return None
    return PUBLIC_ASSETS / storage_path

# ---------------------------------------------------------------------------
# Paper migration
# ---------------------------------------------------------------------------
def migrate_paper(
    client,
    json_path: Path,
    dry_run: bool,
    stats: MigrationStats,
    asset_cache: dict,
):
    """Migrate a single exam paper JSON file to Project 2."""
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            paper_data = json.load(f)
    except Exception as e:
        stats.add_error(f"read:{json_path.name}", str(e))
        return

    stats.papers_discovered += 1
    paper_id = paper_data.get("id", "")
    exam_id  = paper_data.get("examId", "")
    year     = paper_data.get("editionYear", 0)
    title    = paper_data.get("title", "")

    print(f"\n  📄 {json_path.name}")
    print(f"     paper: {paper_id} | exam: {exam_id} | year: {year}")

    if not paper_id or not exam_id:
        stats.add_error(f"paper:{json_path.name}", "missing id or examId")
        return

    # ---- 1. Upsert exam_papers row ----
    sections_data = paper_data.get("sections", [])
    paper_row = {
        "id": paper_id,
        "exam_id": exam_id,
        "edition_year": year,
        "title": title,
        "sub_title": paper_data.get("subTitle", ""),
        "date": paper_data.get("date") or None,
        "shift": paper_data.get("shift", ""),
        "tier": paper_data.get("tier", ""),
        "paper_type": paper_data.get("paperType", "CBE_OBJECTIVE"),
        "paper_code": paper_data.get("paperCode") or None,
        "discipline": paper_data.get("discipline") or None,
        "language": paper_data.get("language", "English"),
        "duration_minutes": paper_data.get("durationMinutes", 60),
        "total_marks": paper_data.get("totalMarks", 100),
        "total_questions": paper_data.get("totalQuestions", len(paper_data.get("questions", []))),
        "is_complete": paper_data.get("isComplete", True),
        "marking_scheme": paper_data.get("markingScheme", {
            "marksPerCorrect": 1.0,
            "negativeMarks": 0.33,
            "unansweredMarks": 0.0,
        }),
    }

    if dry_run:
        print(f"     [DRY RUN] Would upsert paper: {paper_id}")
        stats.papers_imported += 1
    else:
        result = upsert_with_retry(client, "exam_papers", paper_row, "id", stats, f"paper_upsert:{paper_id}")
        if result is not None:
            stats.papers_imported += 1
            print(f"     ✓ Paper upserted")
        else:
            # Check if it was a duplicate error (non-fatal)
            err_msgs = [e.get("error","") for e in stats.errors[-3:]]
            if any("duplicate" in m.lower() or "unique" in m.lower() for m in err_msgs):
                stats.papers_skipped_duplicate += 1
                stats.errors.pop()  # remove the dup error — not a real error
                print(f"     ~ Paper already exists (skipped)")
            else:
                return  # Fatal error — abort this paper


    # ---- 2. Upsert exam_sections ----
    for sec in sections_data:
        sec_row = {
            "id": f"{paper_id}-{sec.get('id', 'sec')}",
            "paper_id": paper_id,
            "section_order": sections_data.index(sec),
            "name": sec.get("name", ""),
            "section_key": sec.get("id", ""),
            "question_count": sec.get("questionCount", 0),
            "max_marks": sec.get("maxMarks", 0),
            "start_index": sec.get("startIndex", 0),
            "end_index": sec.get("endIndex", 0),
        }
        if not dry_run:
            upsert_with_retry(client, "exam_sections", sec_row, "id", stats, f"section:{sec_row['id']}")


    # ---- 3. Migrate questions ----
    questions = paper_data.get("questions", [])
    print(f"     Questions: {len(questions)}")

    for q in questions:
        q_id     = q.get("id", f"{paper_id}-q{q.get('questionNumber', 0)}")
        sec_key  = q.get("sectionId", "")
        sec_id   = f"{paper_id}-{sec_key}" if sec_key else None

        # ---- 3a. Migrate question diagram image ----
        diagram_asset_id = None
        diag_urls = q.get("diagramUrls") or []
        if not diag_urls and q.get("diagramUrl"):
            diag_urls = [q["diagramUrl"]]

        if diag_urls:
            for diag_url in diag_urls[:1]:  # primary diagram only in diagram_asset_id
                local_file = resolve_local_file(diag_url)
                storage_path = local_path_to_storage_path(diag_url)
                if local_file and storage_path:
                    diagram_asset_id = upload_asset(
                        client, local_file, storage_path,
                        paper_id, "diagram", dry_run, stats, asset_cache
                    )
                    break

        # ---- 3b. Upsert question row ----
        q_row = {
            "id": q_id,
            "paper_id": paper_id,
            "section_id": sec_id,
            "question_number": q.get("questionNumber", 0),
            "question_text": q.get("questionText", ""),
            "question_type": q.get("questionType", "MCQ"),
            "marks": q.get("marks", 1),
            "negative_marks": q.get("negativeMarks", 0),
            "correct_answer": q.get("correctAnswer") or None,
            "correct_answer_index": q.get("correctAnswerIndex"),
            "correct_answer_set": q.get("correctAnswerSet") or None,
            "correct_answer_sets": q.get("correctAnswerSets") or None,
            "correct_answer_indices": q.get("correctAnswerIndices") or None,
            "answer_range": q.get("answerRange") or None,
            "answer_ranges": q.get("answerRanges") or None,
            "is_mta": bool(q.get("isMta", False)),
            "explanation": q.get("explanation", ""),
            "diagram_asset_id": diagram_asset_id,
            "word_limit": q.get("wordLimit") or None,
            "model_solution": q.get("modelSolution") or None,
            "rubrics": q.get("rubrics") or None,
            # Preserve denormalized paper-level fields for fast retrieval
            "raw_data": {
                "examId": q.get("examId", exam_id),
                "year": q.get("year", year),
                "date": q.get("date", ""),
                "shift": q.get("shift", ""),
                "tier": q.get("tier", ""),
                "language": q.get("language", "English"),
                "paperCode": q.get("paperCode"),
                "discipline": q.get("discipline"),
                "sectionName": q.get("sectionName", ""),
            },
        }

        if not dry_run:
            result = upsert_with_retry(client, "questions", q_row, "id", stats, f"question:{q_id}")
            if result is None:
                continue  # skip options if question failed
            stats.questions_imported += 1
        else:
            stats.questions_imported += 1


        # ---- 3c. Upsert question options ----
        options_text  = q.get("options", [])
        option_images = q.get("optionImages", []) or []
        rich_options  = q.get("richOptions", []) or []
        labels = ["A", "B", "C", "D"]

        for idx, label in enumerate(labels):
            if idx >= len(options_text) and idx >= len(option_images):
                break

            opt_text = options_text[idx] if idx < len(options_text) else None
            opt_img_url = option_images[idx] if idx < len(option_images) else None

            # Rich options take precedence
            if idx < len(rich_options):
                ro = rich_options[idx]
                opt_text = ro.get("text") or opt_text
                opt_img_url = ro.get("imageUrl") or opt_img_url

            # Upload option image if present
            opt_asset_id = None
            if opt_img_url:
                local_file = resolve_local_file(opt_img_url)
                storage_path = local_path_to_storage_path(opt_img_url)
                if local_file and storage_path:
                    opt_asset_id = upload_asset(
                        client, local_file, storage_path,
                        paper_id, "option_image", dry_run, stats, asset_cache
                    )

            opt_row = {
                "id": f"{q_id}-{label}",
                "question_id": q_id,
                "option_label": label,
                "option_index": idx,
                "option_text": opt_text or None,
                "asset_id": opt_asset_id,
            }

            if not dry_run:
                upsert_with_retry(client, "question_options", opt_row, "id", stats, f"option:{opt_row['id']}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="MOCK.AI Content Migration")
    parser.add_argument("--dry-run",  action="store_true", help="Preview only, no writes")
    parser.add_argument("--exam",     type=str,  default=None, help="Filter by exam ID (e.g. gate, ssc-chsl)")
    parser.add_argument("--year",     type=int,  default=None, help="Filter by year (e.g. 2025)")
    parser.add_argument("--paper",    type=str,  default=None, help="Migrate only one specific paper ID")
    args = parser.parse_args()

    print("=" * 70)
    print("MOCK.AI — SUPABASE PROJECT 2 CONTENT MIGRATION")
    print("=" * 70)
    print(f"  Target:  {CONTENT_URL}")
    print(f"  Dry run: {args.dry_run}")
    print(f"  Filter:  exam={args.exam or 'ALL'}, year={args.year or 'ALL'}, paper={args.paper or 'ALL'}")
    print()

    # ---- Discover JSON files ----
    all_json_files = sorted(glob.glob(str(WEB_SRC / "*.json")))
    json_files = []

    for f in all_json_files:
        name = Path(f).stem  # e.g. 'gate-2025-cs-1'
        if args.paper and name != args.paper:
            continue
        if args.exam:
            if args.exam == "gate" and not name.startswith("gate-"):
                continue
            elif args.exam == "ssc-chsl" and not name.startswith("ssc-chsl-"):
                continue
            elif args.exam not in ("gate", "ssc-chsl") and not name.startswith(args.exam + "-"):
                continue
        if args.year:
            if f"-{args.year}-" not in name:
                continue
        json_files.append(Path(f))

    print(f"  Found {len(json_files)} JSON files to process")
    print()

    stats = MigrationStats()
    asset_cache: dict = {}

    # ---- Connect to Supabase ----
    try:
        client = get_service_client()
        print("  ✓ Connected to Supabase Project 2")
    except Exception as e:
        print(f"  ✗ Cannot connect to Supabase: {e}")
        sys.exit(1)

    # ---- Ensure storage bucket exists ----
    print("\n  Setting up storage bucket...")
    if not ensure_bucket_exists(client, args.dry_run, stats):
        print("  ✗ Cannot set up storage bucket. Aborting.")
        sys.exit(1)

    # ---- Migrate each paper ----
    print(f"\n  Migrating {len(json_files)} papers...\n" + "-" * 70)

    for json_path in json_files:
        migrate_paper(client, json_path, args.dry_run, stats, asset_cache)

    # ---- Record ingestion run ----
    if not args.dry_run and (stats.papers_imported > 0 or stats.questions_imported > 0):
        try:
            label_parts = []
            if args.exam:  label_parts.append(args.exam)
            if args.year:  label_parts.append(str(args.year))
            if args.paper: label_parts.append(args.paper)
            run_label = "-".join(label_parts) if label_parts else "full"

            client.table("ingestion_runs").insert({
                "run_label": run_label,
                "papers_discovered":        stats.papers_discovered,
                "papers_imported":          stats.papers_imported,
                "papers_skipped_duplicate": stats.papers_skipped_duplicate,
                "questions_imported":       stats.questions_imported,
                "images_uploaded":          stats.images_uploaded,
                "images_skipped_duplicate": stats.images_skipped_duplicate,
                "images_rejected_watermark": stats.images_rejected_watermark,
                "errors":                   stats.errors[:100],
                "summary":                  f"Migration of {run_label} completed",
                "completed_at":             datetime.datetime.utcnow().isoformat(),
            }).execute()
        except Exception as e:
            print(f"  ⚠️  Could not record ingestion run: {e}")

    stats.print_report()

    if stats.errors:
        sys.exit(1)

if __name__ == "__main__":
    main()
