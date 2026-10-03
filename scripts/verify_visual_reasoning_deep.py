#!/usr/bin/env python3
"""
scripts/verify_visual_reasoning_deep.py

Deep Forensic Verification and Adversarial Probing:
1. Check Single-Ownership Invariance across all 37 papers.
2. Validate Image Headers (Magic Bytes) on disk for all option & diagram assets.
3. Validate Visual Reasoning Types across Representative Papers:
   - 01 Jul Shift 1
   - 01 Jul Shift 2
   - 02 Jul Shift 1
   - 05 Jul Shift 3
   - 10 Jul Shift 2
   - 18 Nov Shift 1 (Tier 2)
4. Confirm zero OCR contamination underneath IMAGE_ONLY options.
"""

import os
import sys
import glob
import json
import re

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA_DIR = os.path.join(REPO_ROOT, 'web', 'src', 'data', 'exams')
PUBLIC_DIR = os.path.join(REPO_ROOT, 'web', 'public')

def is_valid_image(filepath):
    if not os.path.exists(filepath):
        return False, "File not found"
    size = os.path.getsize(filepath)
    if size == 0:
        return False, "0 bytes file"
    with open(filepath, 'rb') as f:
        header = f.read(16)
    if header.startswith(b'\x89PNG\r\n\x1a\n'):
        return True, f"PNG ({size} bytes)"
    elif header.startswith(b'\xff\xd8\xff'):
        return True, f"JPEG ({size} bytes)"
    elif header.startswith(b'RIFF') and b'WEBP' in header:
        return True, f"WebP ({size} bytes)"
    return False, f"Unknown header: {header[:8]!r}"

def run_deep_verification():
    files = sorted(glob.glob(os.path.join(DATA_DIR, 'ssc-chsl-2024-*.json')))
    print(f"Loaded {len(files)} SSC CHSL 2024 exam files.")

    total_questions = 0
    total_image_only_options = 0
    total_text_only_options = 0
    total_text_and_image_options = 0
    total_stem_diagrams = 0
    total_assets_verified = 0

    ownership_violations = []
    ocr_contamination_violations = []
    broken_assets = []

    for fpath in files:
        pid = os.path.basename(fpath).replace('.json', '')
        with open(fpath, 'r', encoding='utf-8') as jf:
            paper = json.load(jf)

        for q in paper.get('questions', []):
            total_questions += 1
            qnum = q.get('questionNumber')

            # 1. Stem assets
            stem_assets = set()
            if q.get('diagramUrl'):
                stem_assets.add(q.get('diagramUrl'))
            if q.get('diagramUrls'):
                stem_assets.update(q.get('diagramUrls'))
            if q.get('questionAssets'):
                for qa in q.get('questionAssets'):
                    if isinstance(qa, dict) and qa.get('url'):
                        stem_assets.add(qa.get('url'))

            # Check stem asset files
            for sa in stem_assets:
                total_stem_diagrams += 1
                disk_path = os.path.join(PUBLIC_DIR, sa.lstrip('/'))
                ok, msg = is_valid_image(disk_path)
                if not ok:
                    broken_assets.append((pid, qnum, 'stem', sa, msg))
                else:
                    total_assets_verified += 1

            # 2. Option assets
            opt_assets = set()
            opt_imgs = q.get('optionImages') or [None, None, None, None]
            for u in opt_imgs:
                if u:
                    opt_assets.add(u)

            rich_opts = q.get('richOptions') or []
            raw_opts = q.get('options') or []

            if rich_opts:
                for idx, ro in enumerate(rich_opts):
                    mode = ro.get('displayMode', 'TEXT_ONLY')
                    img_url = ro.get('imageUrl')
                    if img_url:
                        opt_assets.add(img_url)

                    if mode == 'IMAGE_ONLY':
                        total_image_only_options += 1
                        raw_val = raw_opts[idx] if idx < len(raw_opts) else ""
                        if raw_val != "":
                            ocr_contamination_violations.append((pid, qnum, idx, 'raw_options', raw_val))
                        if ro.get('text') != "":
                            ocr_contamination_violations.append((pid, qnum, idx, 'richOptions.text', ro.get('text')))
                        if not img_url:
                            broken_assets.append((pid, qnum, f'opt_{idx}', 'NONE', 'Missing imageUrl on IMAGE_ONLY'))
                    elif mode == 'TEXT_ONLY':
                        total_text_only_options += 1
                        if img_url:
                            broken_assets.append((pid, qnum, f'opt_{idx}', img_url, 'Unexpected imageUrl on TEXT_ONLY'))
                    elif mode == 'TEXT_AND_IMAGE':
                        total_text_and_image_options += 1
            else:
                total_text_only_options += len(raw_opts)

            for oa in opt_assets:
                disk_path = os.path.join(PUBLIC_DIR, oa.lstrip('/'))
                ok, msg = is_valid_image(disk_path)
                if not ok:
                    broken_assets.append((pid, qnum, 'option', oa, msg))
                else:
                    total_assets_verified += 1

            # 3. Single Ownership: Assets_stem ∩ Assets_option = ∅
            overlap = stem_assets.intersection(opt_assets)
            if overlap:
                ownership_violations.append((pid, qnum, overlap))

    print("\n--- CORPUS VERIFICATION SUMMARY ---")
    print(f"Total Papers: {len(files)}")
    print(f"Total Questions: {total_questions}")
    print(f"Total Stem Diagrams: {total_stem_diagrams}")
    print(f"Total IMAGE_ONLY Option Choices: {total_image_only_options}")
    print(f"Total TEXT_ONLY Option Choices: {total_text_only_options}")
    print(f"Total TEXT_AND_IMAGE Option Choices: {total_text_and_image_options}")
    print(f"Total Valid Physical Assets Verified on Disk: {total_assets_verified}")
    print(f"Single-Ownership Invariant Violations: {len(ownership_violations)}")
    print(f"OCR Contamination Violations: {len(ocr_contamination_violations)}")
    print(f"Broken Physical Assets: {len(broken_assets)}")

    assert len(ownership_violations) == 0, f"Single-ownership violations: {ownership_violations[:5]}"
    assert len(ocr_contamination_violations) == 0, f"OCR contamination violations: {ocr_contamination_violations[:5]}"
    assert len(broken_assets) == 0, f"Broken assets: {broken_assets[:5]}"
    print("\n[ALL CORPUS INVARIANTS PASS]")

    # Deep inspection of representative papers
    rep_papers = [
        'ssc-chsl-2024-01jul-s1',
        'ssc-chsl-2024-01jul-s2',
        'ssc-chsl-2024-02jul-s1',
        'ssc-chsl-2024-05jul-s3',
        'ssc-chsl-2024-10jul-s2',
        'ssc-chsl-2024-18nov-s1-tier2'
    ]

    print("\n--- REPRESENTATIVE PAPERS DEEP INSPECTION ---")
    for rpid in rep_papers:
        fpath = os.path.join(DATA_DIR, f"{rpid}.json")
        with open(fpath, 'r', encoding='utf-8') as jf:
            p = json.load(jf)

        visual_qs = [q for q in p.get('questions', []) if any(ro.get('displayMode') == 'IMAGE_ONLY' for ro in (q.get('richOptions') or []))]
        stem_diag_qs = [q for q in p.get('questions', []) if q.get('diagramUrl')]
        print(f"\nPaper: {rpid}")
        print(f"  Total Questions: {len(p.get('questions', []))}")
        print(f"  Stem Diagram Questions: {len(stem_diag_qs)}")
        print(f"  Visual Option Questions: {len(visual_qs)}")

        # Sample up to 3 visual questions from this paper
        for vq in visual_qs[:3]:
            qn = vq.get('questionNumber')
            qtext = (vq.get('questionText') or '')[:60].replace('\n', ' ')
            opt_imgs = vq.get('optionImages') or []
            raw_opts = vq.get('options') or []
            print(f"    Q{qn:02d}: stem='{qtext}...' | raw_opts={raw_opts} | opt_imgs={[os.path.basename(u) if u else None for u in opt_imgs]}")

if __name__ == '__main__':
    run_deep_verification()
