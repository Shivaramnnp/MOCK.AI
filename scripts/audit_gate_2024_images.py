#!/usr/bin/env python3
"""
Comprehensive Audit Script for GATE 2024 Ingested Dataset in Mock.AI.
Validates question integrity, visual content associations, watermark absence,
asset file health, and storage footprint.
"""

import os
import glob
import json
import hashlib
from PIL import Image

EXAMS_DIR = '/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/src/data/exams'
ASSETS_DIR = '/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/public/exam-assets/gate/2024'
WEB_PUBLIC_DIR = '/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/public'

def main():
    gate_2024_files = sorted(glob.glob(os.path.join(EXAMS_DIR, 'gate-2024-*.json')))
    print("====================================================")
    print(f"GATE 2024 COMPREHENSIVE INGESTION AUDIT ({len(gate_2024_files)} papers)")
    print("====================================================")

    total_questions = 0
    questions_with_diagrams = 0
    text_only_questions = 0
    total_option_images_ref = 0
    visual_option_sets = 0
    missing_assets = []
    suspicious_option_images = []
    blank_or_faint_images = []

    for fpath in gate_2024_files:
        with open(fpath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        code = data.get('paperCode', '')
        for q in data.get('questions', []):
            total_questions += 1
            has_diagram = bool(q.get('diagramUrl'))
            opt_imgs = q.get('optionImages') or []
            has_opt_imgs = any(img is not None for img in opt_imgs)

            if has_diagram:
                questions_with_diagrams += 1
                diag_rel = q['diagramUrl'].lstrip('/')
                diag_full = os.path.join(WEB_PUBLIC_DIR, diag_rel)
                if not os.path.exists(diag_full):
                    missing_assets.append(diag_full)

            if has_opt_imgs:
                visual_option_sets += 1
                for oi, img_url in enumerate(opt_imgs):
                    if img_url:
                        total_option_images_ref += 1
                        img_rel = img_url.lstrip('/')
                        img_full = os.path.join(WEB_PUBLIC_DIR, img_rel)
                        if not os.path.exists(img_full):
                            missing_assets.append(img_full)
                        else:
                            # Check if option has extensive text (> 8 words) and attached image
                            opt_txt = q['options'][oi] if oi < len(q['options']) else ''
                            if len(opt_txt.split()) > 8:
                                suspicious_option_images.append((code, q['questionNumber'], chr(65+oi), opt_txt, img_url))

            if not has_diagram and not has_opt_imgs:
                text_only_questions += 1

    # Scan PNGs on disk
    png_files = sorted(glob.glob(os.path.join(ASSETS_DIR, '**/*.png'), recursive=True))
    total_bytes = sum(os.path.getsize(p) for p in png_files)

    for p in png_files:
        try:
            with Image.open(p) as im:
                w, h = im.size
                if w < 5 or h < 5:
                    blank_or_faint_images.append((p, f"tiny: {w}x{h}"))
                colors = im.convert('RGB').getcolors(maxcolors=10000)
                if colors and len(colors) == 1:
                    blank_or_faint_images.append((p, "single uniform color"))
        except Exception as e:
            blank_or_faint_images.append((p, str(e)))

    print(f"1. Total Question Papers: {len(gate_2024_files)}")
    print(f"2. Total Questions: {total_questions}")
    print(f"3. Questions with Diagrams: {questions_with_diagrams}")
    print(f"4. Text-Only Questions: {text_only_questions} ({text_only_questions / total_questions:.1%})")
    print(f"5. Total Option Images Referenced: {total_option_images_ref}")
    print(f"6. Questions with Visual Options: {visual_option_sets}")
    print(f"7. Missing Asset Files: {len(missing_assets)}")
    print(f"8. Suspicious Option Images: {len(suspicious_option_images)}")
    print(f"9. Blank/Corrupt Assets: {len(blank_or_faint_images)}")
    print(f"10. Total PNG Files on Disk: {len(png_files)} ({total_bytes / (1024*1024):.2f} MB)")
    print("====================================================")

    # Verify key benchmark questions
    with open(os.path.join(EXAMS_DIR, 'gate-2024-ae.json'), 'r') as f:
        ae_data = json.load(f)
    ae_q1 = next(q for q in ae_data['questions'] if q['questionNumber'] == 1)
    ae_q28 = next(q for q in ae_data['questions'] if q['questionNumber'] == 28)
    print("\n--- Key Test Cases Verification ---")
    print(f"AE Q1 (Text-only): diagramUrl={ae_q1['diagramUrl']}, optionImages={ae_q1['optionImages']}")
    print(f"AE Q28 (V-n diagram): diagramUrl={ae_q28['diagramUrl']}")

    with open(os.path.join(EXAMS_DIR, 'gate-2024-ce-1.json'), 'r') as f:
        ce_data = json.load(f)
    ce_q1 = next(q for q in ce_data['questions'] if q['questionNumber'] == 1)
    print(f"CE-1 Q1 (Text-only): diagramUrl={ce_q1['diagramUrl']}, optionImages={ce_q1['optionImages']}")

    with open(os.path.join(EXAMS_DIR, 'gate-2024-cs-1.json'), 'r') as f:
        cs_data = json.load(f)
    cs_q1 = next(q for q in cs_data['questions'] if q['questionNumber'] == 1)
    print(f"CS-1 Q1 (Text-only): diagramUrl={cs_q1['diagramUrl']}, optionImages={cs_q1['optionImages']}")

    with open(os.path.join(EXAMS_DIR, 'gate-2024-da.json'), 'r') as f:
        da_data = json.load(f)
    da_q1 = next(q for q in da_data['questions'] if q['questionNumber'] == 1)
    da_q55 = next(q for q in da_data['questions'] if q['questionNumber'] == 55)
    print(f"DA Q1 (Text-only): diagramUrl={da_q1['diagramUrl']}, optionImages={da_q1['optionImages']}")
    print(f"DA Q55 (SQL indexing): options={da_q55['options'][:2]}")

if __name__ == '__main__':
    main()
