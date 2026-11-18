#!/usr/bin/env python3
"""
UADUE Phase 2A — Independent Forensic Real-World Examination Audit
Uses PyMuPDF (fitz) as an independent C-engine oracle to audit authentic
examination papers without relying on UADUE's own TypeScript parser.
"""

import os
import sys
import json
import hashlib
import fitz

REAL_EXAMS = [
    {
        "id": "UPSC_2023_GS1",
        "authority": "UPSC",
        "title": "Civil Services Preliminary Examination 2023 — General Studies Paper 1",
        "path": "web/src/data/real_exams/UPSC_CSE_Prelims_2023_GS_Paper_1.pdf",
        "provenance": "https://www.upsc.gov.in/sites/default/files/QP_CS_Pre_Exam_2023_280523.pdf"
    },
    {
        "id": "SSC_CHSL_2023_02AUG_S2",
        "authority": "SSC",
        "title": "Combined Higher Secondary Level (10+2) 2023 Tier 1 — 02 Aug 2023 Shift 2",
        "path": "web/src/data/real_exams/SSC_CHSL_2023_Tier1_02Aug_Shift2.pdf",
        "provenance": "Official TCS iON Candidate Assessment Response Sheet"
    },
    {
        "id": "GATE_2024_CS1",
        "authority": "GATE_IIT",
        "title": "Graduate Aptitude Test in Engineering 2024 — Computer Science & IT (Set 1)",
        "path": "web/src/data/real_exams/GATE_2024_CS_1_Question_Paper.pdf",
        "provenance": "Official IISc Bengaluru Question Paper Portal"
    },
    {
        "id": "JEE_ADV_2023_P1",
        "authority": "NTA_JEE",
        "title": "Joint Entrance Examination (Advanced) 2023 — Paper 1",
        "path": "web/src/data/real_exams/JEE_Advanced_2023_Paper_1.pdf",
        "provenance": "https://jeeadv.ac.in/past_qps/2023_1_English.pdf"
    }
]

def audit_document(doc_info):
    path = doc_info["path"]
    with open(path, "rb") as f:
        bytes_data = f.read()
    
    sha256 = hashlib.sha256(bytes_data).hexdigest()
    size = len(bytes_data)

    # Check header
    header = bytes_data[:20].decode('latin1', errors='ignore').split('\n')[0].strip()
    
    # Check xref structure
    has_traditional_xref = b"\nxref\n" in bytes_data or b"\rxref\r" in bytes_data or b"\r\nxref\r\n" in bytes_data
    has_startxref = b"startxref" in bytes_data
    has_objstm = b"/Type /ObjStm" in bytes_data or b"/Type/ObjStm" in bytes_data
    has_xref_stream = b"/Type /XRef" in bytes_data or b"/Type/XRef" in bytes_data

    # Open with independent fitz oracle
    doc = fitz.open(path)
    page_count = len(doc)
    metadata = doc.metadata

    # Audit pages
    page_geometries = []
    content_stream_samples = []
    total_images = 0
    images_sample = []
    fonts_sample = []
    seen_fonts = set()

    for pno in range(page_count):
        page = doc[pno]
        rect = page.rect
        rot = page.rotation
        page_geometries.append({
            "page": pno + 1,
            "width": rect.width,
            "height": rect.height,
            "rotation": rot
        })

        # Image list
        img_list = page.get_images(full=True)
        total_images += len(img_list)
        if pno < 3:
            for img in img_list:
                xref = img[0]
                base_img = doc.extract_image(xref)
                if base_img:
                    images_sample.append({
                        "page": pno + 1,
                        "xref": xref,
                        "width": base_img["width"],
                        "height": base_img["height"],
                        "colorspace": base_img["colorspace"],
                        "bpc": base_img["bpc"],
                        "ext": base_img["ext"],
                        "stream_len": len(base_img["image"]),
                        "stream_sha256": hashlib.sha256(base_img["image"]).hexdigest()
                    })

        # Fonts
        font_list = page.get_fonts(full=True)
        for f in font_list:
            f_xref, f_ext, f_type, f_name, f_enc = f[0], f[1], f[2], f[3], f[4]
            if f_name not in seen_fonts:
                seen_fonts.add(f_name)
                fonts_sample.append({
                    "xref": f_xref,
                    "name": f_name,
                    "type": f_type,
                    "encoding": f_enc,
                    "has_tounicode": f_ext != ""
                })

    # Total xref length from fitz
    total_xrefs = doc.xref_length()

    return {
        "id": doc_info["id"],
        "authority": doc_info["authority"],
        "title": doc_info["title"],
        "provenance": doc_info["provenance"],
        "path": path,
        "sha256": sha256,
        "file_size_bytes": size,
        "pdf_header": header,
        "metadata": metadata,
        "page_count": page_count,
        "xref_structural_analysis": {
            "has_traditional_xref": has_traditional_xref,
            "has_startxref": has_startxref,
            "has_xref_stream": has_xref_stream,
            "has_compressed_object_streams": has_objstm,
            "total_xref_entries": total_xrefs
        },
        "page_sample_geometries": page_geometries[:5],
        "total_images_in_doc": total_images,
        "images_sample": images_sample[:5],
        "fonts_discovered": fonts_sample[:10]
    }

def main():
    results = []
    print("=== INDEPENDENT FORENSIC AUDIT OF REAL-WORLD ASSESSMENT PAPERS ===")
    for exam in REAL_EXAMS:
        print(f"Auditing: {exam['id']} ({exam['authority']}) ...")
        res = audit_document(exam)
        results.append(res)
        print(f"  Pages: {res['page_count']} | Size: {res['file_size_bytes']} bytes")
        print(f"  SHA-256: {res['sha256']}")
        print(f"  Traditional Xref: {res['xref_structural_analysis']['has_traditional_xref']} | XRef Stream: {res['xref_structural_analysis']['has_xref_stream']} | ObjStm: {res['xref_structural_analysis']['has_compressed_object_streams']}")
        print(f"  Total Images: {res['total_images_in_doc']} | Total Fonts: {len(res['fonts_discovered'])}")

    out_file = "docs/real_world_corpus_independent_ground_truth.json"
    os.makedirs("docs", exist_ok=True)
    with open(out_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nWritten independent ground truth to {out_file}")

if __name__ == "__main__":
    main()
