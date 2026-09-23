#!/usr/bin/env python3
"""
MOCK.AI — Forensic Repair & Verification for SSC CHSL Tier 1: 20 Nov 2025 Shift 1
==================================================================================
Eliminates all 21 broken questions, restores missing options from source PDF,
fixes scrambled diagram associations, extracts true option images (A, B, C, D),
removes phantom diagrams from text questions, and formats LaTeX math.
"""

import os
import re
import json
import shutil
from pathlib import Path
import fitz
from PIL import Image

PROJECT_ROOT = Path("/Users/shivarampatel/AndroidStudioProjects/MOCK.AI")
PDF_PATH = Path("/Users/shivarampatel/Downloads/exam ssc/question paper 2025/SSC-CHSL-T-I-Similar-Paper-Held-on-20-Nov-2025-Shift-1.pdf")
JSON_PATH = PROJECT_ROOT / "web" / "src" / "data" / "exams" / "ssc-chsl-2025-20nov-s1.json"
ASSET_DIR = PROJECT_ROOT / "web" / "public" / "exam-assets" / "ssc" / "chsl" / "2025" / "ssc-chsl-2025-20nov-s1"

WEB_BASE_URL = "/exam-assets/ssc/chsl/2025/ssc-chsl-2025-20nov-s1"

def save_pdf_image(doc, xref, dest_filename):
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    meta = doc.extract_image(xref)
    dest_path = ASSET_DIR / dest_filename
    with open(dest_path, "wb") as f:
        f.write(meta["image"])
    print(f"  ✓ Extracted xref {xref} ({meta['width']}x{meta['height']}) -> {dest_filename}")
    return f"{WEB_BASE_URL}/{dest_filename}"

def main():
    print("=" * 70)
    print("MOCK.AI FORENSIC REPAIR: 20 Nov 2025 Shift 1")
    print("=" * 70)

    assert PDF_PATH.exists(), f"Source PDF missing: {PDF_PATH}"
    assert JSON_PATH.exists(), f"Target JSON missing: {JSON_PATH}"

    doc = fitz.open(PDF_PATH)
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    questions = data["questions"]
    q_map = {q["questionNumber"]: q for q in questions}

    # 1. Clean out the directory of misassigned diagrams
    if ASSET_DIR.exists():
        for old_file in ASSET_DIR.glob("*"):
            if old_file.is_file():
                old_file.unlink()

    # 2. Extract and associate verified visual assets with high-precision xref mapping
    print("\n--- [1] Extracting & Mapping Verified Visual Assets ---")
    
    # Q29: Triangle figure (Page 8, xref 67)
    q29_url = save_pdf_image(doc, 67, "q29_diag.jpeg")
    q_map[29]["diagramUrl"] = q29_url
    q_map[29]["diagramUrls"] = [q29_url]
    q_map[29]["questionAssets"] = [{"type": "image", "url": q29_url}]

    # Q40: Triangle figure (Page 10, xref 74)
    q40_url = save_pdf_image(doc, 74, "q40_diag.jpeg")
    q_map[40]["diagramUrl"] = q40_url
    q_map[40]["diagramUrls"] = [q40_url]
    q_map[40]["questionAssets"] = [{"type": "image", "url": q40_url}]

    # Q43: Triangle figure (Page 10, xref 75)
    q43_url = save_pdf_image(doc, 75, "q43_diag.png")
    q_map[43]["diagramUrl"] = q43_url
    q_map[43]["diagramUrls"] = [q43_url]
    q_map[43]["questionAssets"] = [{"type": "image", "url": q43_url}]

    # Q46: Embedded figure diagram (Page 11, xref 79) + 4 option images (xrefs 80, 81, 82, 83)
    q46_url = save_pdf_image(doc, 79, "q46_diag.png")
    q_map[46]["diagramUrl"] = q46_url
    q_map[46]["diagramUrls"] = [q46_url]
    q_map[46]["questionAssets"] = [{"type": "image", "url": q46_url}]
    q46_opts = [
        save_pdf_image(doc, 80, "q46_opt_a.jpeg"),
        save_pdf_image(doc, 81, "q46_opt_b.jpeg"),
        save_pdf_image(doc, 82, "q46_opt_c.jpeg"),
        save_pdf_image(doc, 83, "q46_opt_d.jpeg")
    ]
    q_map[46]["optionImages"] = q46_opts
    q_map[46]["options"] = ["", "", "", ""]
    q_map[46]["richOptions"] = [
        {"id": "A", "text": "", "imageUrl": q46_opts[0]},
        {"id": "B", "text": "", "imageUrl": q46_opts[1]},
        {"id": "C", "text": "", "imageUrl": q46_opts[2]},
        {"id": "D", "text": "", "imageUrl": q46_opts[3]},
    ]

    # Q47: Embedded figure diagram (Page 11, xref 84) + 4 option images (xref 85 [p11], 89, 90, 91 [p12])
    q47_url = save_pdf_image(doc, 84, "q47_diag.png")
    q_map[47]["diagramUrl"] = q47_url
    q_map[47]["diagramUrls"] = [q47_url]
    q_map[47]["questionAssets"] = [{"type": "image", "url": q47_url}]
    q47_opts = [
        save_pdf_image(doc, 85, "q47_opt_a.jpeg"),
        save_pdf_image(doc, 89, "q47_opt_b.jpeg"),
        save_pdf_image(doc, 90, "q47_opt_c.jpeg"),
        save_pdf_image(doc, 91, "q47_opt_d.jpeg")
    ]
    q_map[47]["optionImages"] = q47_opts
    q_map[47]["options"] = ["", "", "", ""]
    q_map[47]["richOptions"] = [
        {"id": "A", "text": "", "imageUrl": q47_opts[0]},
        {"id": "B", "text": "", "imageUrl": q47_opts[1]},
        {"id": "C", "text": "", "imageUrl": q47_opts[2]},
        {"id": "D", "text": "", "imageUrl": q47_opts[3]},
    ]

    # Q48: Odd figure pair (Page 12, xrefs 92, 93, 94, 95)
    q48_opts = [
        save_pdf_image(doc, 92, "q48_opt_a.jpeg"),
        save_pdf_image(doc, 93, "q48_opt_b.jpeg"),
        save_pdf_image(doc, 94, "q48_opt_c.jpeg"),
        save_pdf_image(doc, 95, "q48_opt_d.jpeg")
    ]
    q_map[48]["optionImages"] = q48_opts
    q_map[48]["options"] = ["", "", "", ""]
    q_map[48]["diagramUrl"] = None
    q_map[48]["diagramUrls"] = None
    q_map[48]["questionAssets"] = None
    q_map[48]["richOptions"] = [
        {"id": "A", "text": "", "imageUrl": q48_opts[0]},
        {"id": "B", "text": "", "imageUrl": q48_opts[1]},
        {"id": "C", "text": "", "imageUrl": q48_opts[2]},
        {"id": "D", "text": "", "imageUrl": q48_opts[3]},
    ]

    # Q49: Odd figure pair (Page 12, xrefs 96, 97, 98, 99)
    q49_opts = [
        save_pdf_image(doc, 96, "q49_opt_a.jpeg"),
        save_pdf_image(doc, 97, "q49_opt_b.jpeg"),
        save_pdf_image(doc, 98, "q49_opt_c.jpeg"),
        save_pdf_image(doc, 99, "q49_opt_d.jpeg")
    ]
    q_map[49]["optionImages"] = q49_opts
    q_map[49]["options"] = ["", "", "", ""]
    q_map[49]["diagramUrl"] = None
    q_map[49]["diagramUrls"] = None
    q_map[49]["questionAssets"] = None
    q_map[49]["richOptions"] = [
        {"id": "A", "text": "", "imageUrl": q49_opts[0]},
        {"id": "B", "text": "", "imageUrl": q49_opts[1]},
        {"id": "C", "text": "", "imageUrl": q49_opts[2]},
        {"id": "D", "text": "", "imageUrl": q49_opts[3]},
    ]

    # Q50: Series diagram (Page 12, xref 100) + 4 option images (Page 13, xrefs 104, 105, 106, 107)
    q50_url = save_pdf_image(doc, 100, "q50_diag.jpeg")
    q_map[50]["diagramUrl"] = q50_url
    q_map[50]["diagramUrls"] = [q50_url]
    q_map[50]["questionAssets"] = [{"type": "image", "url": q50_url}]
    q50_opts = [
        save_pdf_image(doc, 104, "q50_opt_a.jpeg"),
        save_pdf_image(doc, 105, "q50_opt_b.jpeg"),
        save_pdf_image(doc, 106, "q50_opt_c.jpeg"),
        save_pdf_image(doc, 107, "q50_opt_d.jpeg")
    ]
    q_map[50]["optionImages"] = q50_opts
    q_map[50]["options"] = ["", "", "", ""]
    q_map[50]["richOptions"] = [
        {"id": "A", "text": "", "imageUrl": q50_opts[0]},
        {"id": "B", "text": "", "imageUrl": q50_opts[1]},
        {"id": "C", "text": "", "imageUrl": q50_opts[2]},
        {"id": "D", "text": "", "imageUrl": q50_opts[3]},
    ]

    # 3. Remove phantom diagrams from text questions that were corrupted by PyMuPDF block shifts
    print("\n--- [2] Removing Phantom Diagrams from Text Questions ---")
    for q_no in [26, 38, 41, 44]:
        q_map[q_no]["diagramUrl"] = None
        q_map[q_no]["diagramUrls"] = None
        q_map[q_no]["questionAssets"] = None
        print(f"  ✓ Removed misassigned diagram from Q{q_no}")

    # 4. Restore exact verified options from source PDF for all numeric & corrupted questions
    print("\n--- [3] Restoring Exact Options from Source PDF ---")
    restorations = {
        29: (['11', '12', '13', '14'], 'B'),
        31: (['5', '10', '15', '20'], 'B'),
        36: (['10', '12', '14', '9'], 'C'),
        37: (['54', '58', '56', '50'], 'A'),
        38: (['343', '512', '729', '400'], 'D'),
        40: (['10', '11', '12', '13'], 'A'),
        42: (['68', '70', '72', '74'], 'C'),
        43: (['7', '8', '9', '10'], 'D'),
        51: (['3240', '2484', '3600', '3888'], 'B'),
        55: (['4', '5', '6', '3'], 'C'),
        57: (['16', '18', '20', '24'], 'B'),
        70: (['1', '2', '3', '4'], 'C'),
        72: (['1200', '1400', '1600', '1500'], 'B'),
        77: (['1764', '1765', '1772', '1757'], 'B'),
        79: (['4', '5', '6', '7'], 'B'),
        82: (['2005', '2008', '2010', '2012'], 'B'),
    }

    ans_map = {'A': 0, 'B': 1, 'C': 2, 'D': 3}
    for q_no, (opts, ans) in restorations.items():
        q = q_map[q_no]
        q["options"] = opts
        q["correctAnswer"] = ans
        q["correctAnswerIndex"] = ans_map[ans]
        q["richOptions"] = [{"id": l, "text": opts[i], "imageUrl": None} for i, l in enumerate(["A", "B", "C", "D"])]
        print(f"  ✓ Restored Q{q_no} options: {opts} (Ans: {ans})")

    # 5. Format Mathematics with KaTeX delimiters
    print("\n--- [4] Formatting Mathematical Notation with KaTeX ---")
    q_map[51]["questionText"] = "If, \\(a + b = 18\\) and \\(a^2 + b^2 = 200\\), then find the value of \\((a^3 + b^3)\\)."
    q_map[55]["questionText"] = "In a triangle PQR, points M and N lie on QR such that PM = PN and \\(\\angle QPM = \\angle RPN\\). If PQ = \\((3x + 2)\\) units, QM = \\(x\\) units, PR = \\((2y + 5)\\) units, RN = \\(y\\) units, find the value of \\((x + y)\\)."
    q_map[56]["options"] = ["\\(240\\text{ m}^2\\)", "\\(210\\text{ m}^2\\)", "\\(180\\text{ m}^2\\)", "\\(270\\text{ m}^2\\)"]
    q_map[59]["options"] = ["\\(75\\text{ cm}^2\\)", "\\(100\\text{ cm}^2\\)", "\\(125\\text{ cm}^2\\)", "\\(50\\text{ cm}^2\\)"]
    q_map[62]["options"] = ["\\(1728\\text{ cm}^3\\)", "\\(1800\\text{ cm}^3\\)", "\\(1650\\text{ cm}^3\\)", "\\(1750\\text{ cm}^3\\)"]
    q_map[65]["options"] = ["\\(1568\\pi\\text{ cm}^2\\)", "\\(2352\\pi\\text{ cm}^2\\)", "\\(3136\\pi\\text{ cm}^2\\)", "\\(784\\pi\\text{ cm}^2\\)"]
    q_map[68]["options"] = ["\\(-3/4\\)", "\\(4/3\\)", "\\(3/4\\)", "\\(-4/3\\)"]

    for q_no in [56, 59, 62, 65, 68]:
        opts = q_map[q_no]["options"]
        q_map[q_no]["richOptions"] = [{"id": l, "text": opts[i], "imageUrl": None} for i, l in enumerate(["A", "B", "C", "D"])]

    # 6. Save verified JSON
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"\n✓ Successfully updated authoritative JSON: {JSON_PATH}")

    # 7. Verification Assertions
    print("\n--- [5] Running Verification Assertions ---")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        verified_data = json.load(f)
    
    assert len(verified_data["questions"]) == 100, f"Expected 100 questions, got {len(verified_data['questions'])}"
    for q in verified_data["questions"]:
        q_num = q["questionNumber"]
        opts = q["options"]
        opt_imgs = q.get("optionImages")
        # Check no option is generic "Option (A)"
        for o in opts:
            assert not re.match(r"^Option\s*\([A-D]\)$", str(o).strip(), re.IGNORECASE), f"Q{q_num} still has generic placeholder option: {o}"
        # Check if option is empty, it MUST have an optionImage
        for idx, o in enumerate(opts):
            if not str(o).strip():
                assert opt_imgs and opt_imgs[idx], f"Q{q_num} has empty text without an optionImage at index {idx}"
        # Check diagramUrl exists if specified
        if q.get("diagramUrl"):
            rel_path = q["diagramUrl"].lstrip("/")
            local_file = PROJECT_ROOT / "web" / "public" / rel_path
            assert local_file.exists(), f"Q{q_num} diagram file does not exist: {local_file}"

    print("✅ All 100 questions in 20 Nov 2025 Shift 1 verified and passed all assertions!")

if __name__ == "__main__":
    main()
