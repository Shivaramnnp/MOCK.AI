#!/usr/bin/env python3
"""
scripts/audit_exam_assets.py
=============================================================================
MOCK.AI — Universal Exam Asset Auditor & Safe Lifecycle Manager (v3)
=============================================================================
Inventories all visual assets across web/public/exam-assets/, correlates
with all 284 exam JSONs in web/src/data/exams/, classifies assets into:
  - ACTIVE_REFERENCED: Legitimate diagram/option in active use
  - STALE_PROMOTED: Old option image where option has been promoted to text/math
  - ORPHAN_UNREFERENCED: Disk file not referenced in any exam JSON
  - BROKEN_REFERENCE: JSON references an asset that does not exist on disk
  - DUPLICATE_EXACT: Identical SHA-256 payload appearing multiple times
  - CORRUPTED_ZERO_BYTE: File size is 0 or unreadable header

Generates:
  - docs/CHSL_ASSET_CLEANUP_DRY_RUN.md
  - asset-audit-report.json

Usage:
  python3 scripts/audit_exam_assets.py [--dry-run] [--apply]
"""

import os
import sys
import glob
import json
import hashlib
from collections import defaultdict
from pathlib import Path
from PIL import Image

BASE_DIR = '/Users/shivarampatel/AndroidStudioProjects/MOCK.AI'
EXAMS_DATA_DIR = os.path.join(BASE_DIR, 'web/src/data/exams')
PUBLIC_ASSETS_DIR = os.path.join(BASE_DIR, 'web/public/exam-assets')
DOCS_DIR = os.path.join(BASE_DIR, 'docs')


def compute_sha256(filepath):
    try:
        h = hashlib.sha256()
        with open(filepath, 'rb') as f:
            while chunk := f.read(8192):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None


def run_asset_audit(apply_cleanup=False):
    print("=" * 70)
    print("MOCK.AI — EXAM ASSET INVENTORY & LIFECYCLE AUDIT")
    print("=" * 70)

    # 1. Scan all exam JSON files to build reference graph
    json_files = sorted(glob.glob(os.path.join(EXAMS_DATA_DIR, '*.json')))
    print(f"Scanning {len(json_files)} exam JSON files...")

    referenced_assets = defaultdict(list)  # normalized_rel_path -> list of (paper_id, q_num, role)
    broken_references = []

    for jpath in json_files:
        try:
            with open(jpath, 'r', encoding='utf-8') as f:
                pdata = json.load(f)
        except Exception as e:
            print(f"Error loading {jpath}: {e}")
            continue

        paper_id = pdata.get('id', os.path.splitext(os.path.basename(jpath))[0])
        questions = pdata.get('questions', [])

        for q in questions:
            q_num = q.get('questionNumber', 0)

            # Collect candidate URLs
            urls = []

            # diagramUrl & diagramUrls
            if q.get('diagramUrl'):
                urls.append((q['diagramUrl'], 'diagramUrl'))
            for d in q.get('diagramUrls') or []:
                if d and d != q.get('diagramUrl'):
                    urls.append((d, 'diagramUrls'))

            # questionAssets
            for qa in q.get('questionAssets') or []:
                if isinstance(qa, dict) and qa.get('url'):
                    urls.append((qa['url'], 'questionAssets'))

            # optionImages
            for opt_idx, oi in enumerate(q.get('optionImages') or []):
                if oi:
                    letter = ['A', 'B', 'C', 'D'][opt_idx] if opt_idx < 4 else str(opt_idx)
                    urls.append((oi, f'optionImage_{letter}'))

            # richOptions
            for ro in q.get('richOptions') or []:
                if isinstance(ro, dict):
                    opt_id = ro.get('id', '?')
                    if ro.get('imageUrl'):
                        urls.append((ro['imageUrl'], f'richOption_{opt_id}'))
                    for cb in ro.get('contentBlocks') or []:
                        if isinstance(cb, dict) and cb.get('assetUrl'):
                            urls.append((cb['assetUrl'], f'richOptionBlock_{opt_id}'))

            # contentBlocks
            for cb in q.get('contentBlocks') or []:
                if isinstance(cb, dict) and cb.get('assetUrl'):
                    urls.append((cb['assetUrl'], 'contentBlock'))

            # Record normalized paths
            for url, role in urls:
                if not url or not isinstance(url, str):
                    continue
                # Normalize web URL e.g. "/exam-assets/ssc/chsl/2024/..." -> "ssc/chsl/2024/..."
                clean_url = url.strip()
                if clean_url.startswith('/exam-assets/'):
                    rel_p = clean_url[len('/exam-assets/'):]
                elif clean_url.startswith('exam-assets/'):
                    rel_p = clean_url[len('exam-assets/'):]
                elif 'exam-assets/' in clean_url:
                    rel_p = clean_url.split('exam-assets/', 1)[1]
                else:
                    rel_p = clean_url.lstrip('/')

                # Check if file exists on disk
                disk_path = os.path.join(PUBLIC_ASSETS_DIR, rel_p)
                if not os.path.exists(disk_path):
                    broken_references.append({
                        "paperId": paper_id,
                        "questionNumber": q_num,
                        "role": role,
                        "url": url,
                        "expectedPath": disk_path
                    })
                else:
                    referenced_assets[rel_p].append({
                        "paperId": paper_id,
                        "questionNumber": q_num,
                        "role": role
                    })

    # 2. Scan all files on disk in web/public/exam-assets/
    print(f"Scanning disk assets in {PUBLIC_ASSETS_DIR}...")
    disk_files = []
    for root, dirs, files in os.walk(PUBLIC_ASSETS_DIR):
        for f in files:
            if f.startswith('.'):
                continue
            full_p = os.path.join(root, f)
            rel_p = os.path.relpath(full_p, PUBLIC_ASSETS_DIR)
            disk_files.append((rel_p, full_p))

    print(f"Found {len(disk_files)} asset files on disk.")

    # 3. Categorize disk assets
    active_assets = []
    orphan_assets = []
    stale_promoted_assets = []
    corrupted_assets = []
    hash_to_files = defaultdict(list)

    for rel_p, full_p in disk_files:
        size = os.path.getsize(full_p)
        if size == 0:
            corrupted_assets.append({"relPath": rel_p, "fullPath": full_p, "reason": "Zero-byte file"})
            continue

        # Check image validity
        try:
            with Image.open(full_p) as img:
                w, h = img.size
                fmt = img.format
        except Exception as e:
            corrupted_assets.append({"relPath": rel_p, "fullPath": full_p, "reason": f"Corrupted image header: {e}"})
            continue

        sha = compute_sha256(full_p)
        hash_to_files[sha].append(rel_p)

        if rel_p in referenced_assets:
            active_assets.append({
                "relPath": rel_p,
                "sizeBytes": size,
                "dimensions": f"{w}x{h}",
                "format": fmt,
                "references": referenced_assets[rel_p]
            })
        else:
            # Check if this is an option image that was previously created but question options got promoted
            # Pattern: q{N}_opt_{a-d}.png
            fname = os.path.basename(rel_p)
            if '_opt_' in fname:
                stale_promoted_assets.append({
                    "relPath": rel_p,
                    "fullPath": full_p,
                    "sizeBytes": size,
                    "dimensions": f"{w}x{h}"
                })
            else:
                orphan_assets.append({
                    "relPath": rel_p,
                    "fullPath": full_p,
                    "sizeBytes": size,
                    "dimensions": f"{w}x{h}"
                })

    # Duplicates (same hash across different paths)
    duplicate_groups = {h: paths for h, paths in hash_to_files.items() if len(paths) > 1}

    print("\n--- Asset Audit Summary ---")
    print(f"Total disk files:           {len(disk_files)}")
    print(f"Active referenced:          {len(active_assets)}")
    print(f"Stale promoted option PNGs: {len(stale_promoted_assets)}")
    print(f"Orphan unreferenced files:  {len(orphan_assets)}")
    print(f"Corrupted / Zero-byte:      {len(corrupted_assets)}")
    print(f"Broken JSON references:     {len(broken_references)}")
    print(f"Identical duplicate groups: {len(duplicate_groups)}")

    # 4. Generate Machine-Readable Report
    report_data = {
        "timestamp": os.popen('date -u +"%Y-%m-%dT%H:%M:%SZ"').read().strip(),
        "summary": {
            "totalDiskFiles": len(disk_files),
            "activeReferenced": len(active_assets),
            "stalePromotedOptionPngs": len(stale_promoted_assets),
            "orphanUnreferenced": len(orphan_assets),
            "corruptedZeroByte": len(corrupted_assets),
            "brokenReferences": len(broken_references),
            "duplicateGroups": len(duplicate_groups)
        },
        "brokenReferences": broken_references,
        "stalePromotedAssets": stale_promoted_assets,
        "orphanAssets": orphan_assets,
        "corruptedAssets": corrupted_assets,
        "duplicateGroups": {h: paths for h, paths in list(duplicate_groups.items())[:50]}
    }

    report_path = os.path.join(BASE_DIR, 'asset-audit-report.json')
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report_data, f, indent=2)
    print(f"\nWrote machine-readable report to: {report_path}")

    # 5. Generate Markdown Dry-Run Report
    dry_run_path = os.path.join(DOCS_DIR, 'CHSL_ASSET_CLEANUP_DRY_RUN.md')
    md_content = f"""# MOCK.AI — Exam Asset Inventory & Cleanup Dry-Run Report
**Document ID:** `docs/CHSL_ASSET_CLEANUP_DRY_RUN.md`  
**Generated At:** {report_data['timestamp']}  
**Status:** DRY-RUN AUDIT COMPLETE — PENDING CONFIRMATION

---

## 1. Inventory Summary

| Category | Count | Status / Recommended Action |
| :--- | :--- | :--- |
| **Total Disk Files** | **{len(disk_files)}** | Total physical files in `web/public/exam-assets/` |
| **Active Referenced** | **{len(active_assets)}** | **PRESERVE** (Actively used in JSON/UI) |
| **Stale Promoted Option Images** | **{len(stale_promoted_assets)}** | **SAFE DELETE CANDIDATE** (Options promoted to KaTeX) |
| **Orphan Unreferenced Files** | **{len(orphan_assets)}** | **SAFE DELETE CANDIDATE** (Zero references in any exam) |
| **Corrupted / Zero-Byte** | **{len(corrupted_assets)}** | **DELETE CANDIDATE** (Invalid image payload) |
| **Broken JSON References** | **{len(broken_references)}** | **FIX REQUIRED** (Question references missing file) |
| **Duplicate Asset Groups** | **{len(duplicate_groups)}** | **CANONICAL REUSE CANDIDATE** (Identical SHA-256) |

---

## 2. Broken References Audit (Severity: CRITICAL)
{len(broken_references)} references in exam JSON files point to non-existent disk files:
"""
    if not broken_references:
        md_content += "\n> **VERIFIED:** Zero broken references detected. All JSON assets exist on disk.\n"
    else:
        md_content += "\n| Paper ID | Q# | Role | Missing URL |\n| :--- | :--- | :--- | :--- |\n"
        for br in broken_references[:30]:
            md_content += f"| `{br['paperId']}` | {br['questionNumber']} | `{br['role']}` | `{br['url']}` |\n"
        if len(broken_references) > 30:
            md_content += f"\n*...and {len(broken_references) - 30} more.* See `asset-audit-report.json` for full list.\n"

    md_content += f"""
---

## 3. Stale Promoted Option Images (Count: {len(stale_promoted_assets)})
These files are option cutouts from previous ingestions where the option was promoted to native LaTeX math or text. The JSON files no longer reference them.
"""
    if stale_promoted_assets:
        md_content += "\nSample stale promoted assets:\n"
        for s in stale_promoted_assets[:20]:
            md_content += f"- `{s['relPath']}` ({s['dimensions']}, {s['sizeBytes']} bytes)\n"
        if len(stale_promoted_assets) > 20:
            md_content += f"\n*...and {len(stale_promoted_assets) - 20} more.*\n"

    md_content += f"""
---

## 4. Orphan Unreferenced Files (Count: {len(orphan_assets)})
Files on disk that have zero references in any exam JSON:
"""
    if orphan_assets:
        for o in orphan_assets[:20]:
            md_content += f"- `{o['relPath']}` ({o['dimensions']}, {o['sizeBytes']} bytes)\n"
        if len(orphan_assets) > 20:
            md_content += f"\n*...and {len(orphan_assets) - 20} more.*\n"
    else:
        md_content += "\n> **VERIFIED:** Zero orphan assets detected.\n"

    md_content += f"""
---

## 5. Safe Apply Protocol
To execute deletion of verified stale and orphan assets:
```bash
python3 scripts/audit_exam_assets.py --apply
```
The `--apply` command will only remove files classified as `STALE_PROMOTED` or `ORPHAN_UNREFERENCED` that have 0 references across all 284 JSON papers.
"""

    with open(dry_run_path, 'w', encoding='utf-8') as f:
        f.write(md_content)
    print(f"Wrote dry-run report to: {dry_run_path}")

    # 6. Apply cleanup if explicitly requested
    if apply_cleanup:
        print("\n" + "=" * 70)
        print("APPLYING ASSET CLEANUP (Deleting verified stale & orphan files)")
        print("=" * 70)
        deleted_count = 0
        reclaimed_bytes = 0

        candidates = stale_promoted_assets + orphan_assets
        for item in candidates:
            fp = item['fullPath']
            if os.path.exists(fp):
                try:
                    size = os.path.getsize(fp)
                    os.remove(fp)
                    deleted_count += 1
                    reclaimed_bytes += size
                except Exception as e:
                    print(f"Error deleting {fp}: {e}")

        print(f"Successfully deleted {deleted_count} stale/orphan assets.")
        print(f"Reclaimed {reclaimed_bytes / 1024 / 1024:.2f} MB of disk space.")


if __name__ == '__main__':
    apply_flag = '--apply' in sys.argv
    run_asset_audit(apply_cleanup=apply_flag)
