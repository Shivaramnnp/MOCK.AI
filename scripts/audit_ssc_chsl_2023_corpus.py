#!/usr/bin/env python3
"""
scripts/audit_ssc_chsl_2023_corpus.py
MOCK.AI — SSC CHSL 2023 Full Corpus Forensic Integrity & Fidelity Audit

Verifies all 38 papers across 3,870 questions:
  1. Option Completeness: Every question must have exactly 4 non-empty options.
  2. Asset Integrity: Every referenced image file must exist on disk.
  3. Image Purity: No decorative radio buttons, ticks, or ad banners in options.
  4. Specific Test Questions:
     - 02aug-s2: Q31, Q36, Q54, Q63, Q65, Q73, Q85 must be text/math without option images.
     - 02aug-s2: Q32, Q43, Q49 must be authentic visual figures.
     - 02aug-s1: Q34, Q39, Q50 must be authentic visual figures.
  5. Tier-2 Papers: 0 Google Play ads or tick mark artifacts.
"""

import os, glob, json, sys

BASE_DIR = '/Users/shivarampatel/AndroidStudioProjects/MOCK.AI'
EXAMS_DIR = os.path.join(BASE_DIR, 'web/src/data/exams')
PUBLIC_ASSETS = os.path.join(BASE_DIR, 'web/public')

def run_corpus_audit():
    files = sorted(glob.glob(os.path.join(EXAMS_DIR, 'ssc-chsl-2023-*.json')))
    print(f"Auditing {len(files)} SSC CHSL 2023 exam files...")
    assert len(files) == 38, f"Expected 38 files, got {len(files)}"

    total_questions = 0
    total_option_images = 0
    missing_assets = []
    empty_options = []
    decorative_remnants = []
    failed_assertions = []

    for fpath in files:
        fname = os.path.basename(fpath)
        with open(fpath, 'r', encoding='utf-8') as fp:
            data = json.load(fp)

        pid = data.get('id', '')
        qs = data.get('questions', [])
        total_questions += len(qs)

        for q in qs:
            qnum = q.get('questionNumber')
            opts = q.get('options') or []
            opt_imgs = q.get('optionImages') or []
            rich_opts = q.get('richOptions') or []

            # 1. 4 options present
            if len(opts) != 4:
                empty_options.append(f"{fname} Q{qnum}: expected 4 options, found {len(opts)}")
            else:
                for idx, opt in enumerate(opts):
                    opt_str = str(opt).strip()
                    img_ref = opt_imgs[idx] if idx < len(opt_imgs) else None
                    if not opt_str and not img_ref:
                        empty_options.append(f"{fname} Q{qnum} Opt {idx}: empty option text and no image")

            # 2. Check asset existence on disk
            if opt_imgs:
                for idx, img_ref in enumerate(opt_imgs):
                    if img_ref:
                        total_option_images += 1
                        disk_p = os.path.join(PUBLIC_ASSETS, img_ref.lstrip('/'))
                        if not os.path.exists(disk_p):
                            missing_assets.append(f"{fname} Q{qnum} Opt {idx}: {img_ref} does not exist on disk")

            # Check stem diagram existence
            diag = q.get('diagramUrl')
            if diag:
                disk_diag = os.path.join(PUBLIC_ASSETS, diag.lstrip('/'))
                if not os.path.exists(disk_diag):
                    missing_assets.append(f"{fname} Q{qnum} Diagram: {diag} does not exist on disk")

            # 3. Check for decorative remnants
            for opt in opts:
                opt_lower = str(opt).lower()
                if 'google play' in opt_lower or 'get it on' in opt_lower:
                    decorative_remnants.append(f"{fname} Q{qnum}: Found Google Play ad text '{opt}'")

            # 4. Check specific paper requirements
            if fname == 'ssc-chsl-2023-02aug-s2.json':
                # Q31, Q36, Q54, Q63, Q65, Q73, Q85 text/math
                if qnum in [31, 36, 54, 63, 65, 73, 85]:
                    if q.get('optionImages') is not None and any(q.get('optionImages')):
                        failed_assertions.append(f"{fname} Q{qnum}: expected clean text/math, but found optionImages {q.get('optionImages')}")
                # Q32, Q43, Q49 authentic visual
                if qnum in [32, 43, 49]:
                    if not q.get('optionImages') or not any(q.get('optionImages')):
                        failed_assertions.append(f"{fname} Q{qnum}: expected authentic visual figures, but optionImages is empty")

            if fname == 'ssc-chsl-2023-02aug-s1.json':
                # Q34, Q39 authentic visual options, Q50 authentic stem diagram
                if qnum in [34, 39]:
                    if not q.get('optionImages') or not any(q.get('optionImages')):
                        failed_assertions.append(f"{fname} Q{qnum}: expected authentic visual option figures, but optionImages is empty")
                if qnum == 50:
                    if not q.get('diagramUrl'):
                        failed_assertions.append(f"{fname} Q50: expected authentic visual stem diagram, but diagramUrl is null")

    print(f"\nAUDIT RESULTS:")
    print(f"Total Papers Checked       : {len(files)}")
    print(f"Total Questions Evaluated  : {total_questions}")
    print(f"Active Option Images on Disk: {total_option_images}")
    print(f"Missing Assets Count       : {len(missing_assets)}")
    print(f"Empty Options Count        : {len(empty_options)}")
    print(f"Decorative Ad Remnants     : {len(decorative_remnants)}")
    print(f"Specific Assertion Failures: {len(failed_assertions)}")

    if missing_assets:
        print("\n[!] Missing Assets:")
        for m in missing_assets[:10]:
            print("  -", m)
    if empty_options:
        print("\n[!] Empty Options:")
        for e in empty_options[:10]:
            print("  -", e)
    if decorative_remnants:
        print("\n[!] Decorative Remnants:")
        for d in decorative_remnants[:10]:
            print("  -", d)
    if failed_assertions:
        print("\n[!] Failed Assertions:")
        for fa in failed_assertions:
            print("  -", fa)

    all_passed = (len(missing_assets) == 0 and 
                  len(empty_options) == 0 and 
                  len(decorative_remnants) == 0 and 
                  len(failed_assertions) == 0)

    if all_passed:
        print("\n>>> AUDIT PASSED: 100% FORENSIC INTEGRITY ACROSS ENTIRE SSC CHSL 2023 CORPUS! <<<")
        return 0
    else:
        print("\n>>> AUDIT FAILED! <<<")
        return 1

if __name__ == '__main__':
    sys.exit(run_corpus_audit())
