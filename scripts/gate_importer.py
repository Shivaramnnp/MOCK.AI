#!/usr/bin/env python3
"""
GATE Multi-Year (2024 & 2025) Production-Grade Ingestion Pipeline for Mock.AI.
Parses official GATE Question Papers and Official Answer Keys.
Extracts questions, text, diagrams, circuit schematics, vector drawings,
option images, and answer keys (MCQ, MSQ, NAT, MTA).
Supports both table-grid and text-flow PDF layouts with zero watermark contamination.
Outputs standardized JSON test definitions into `web/src/data/exams/`
and visual assets into `web/public/exam-assets/gate/<year>/`.
"""

import os
import re
import csv
import json
import shutil
import argparse
import fitz  # PyMuPDF

EXAMS_DATA_DIR = '/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/src/data/exams'

YEAR_CONFIGS = {
    2024: {
        'year': 2024,
        'organizingInstitute': 'IISc Bengaluru',
        'manifestPath': '/Users/shivarampatel/Downloads/GATE 2024/GATE_2024_manifest.csv',
        'assetsBaseDir': '/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/public/exam-assets/gate/2024',
        'sessionSchedule': {
            1: ('2024-02-03', 'Shift 1 (Forenoon: 09:30 - 12:30)'),
            2: ('2024-02-03', 'Shift 2 (Afternoon: 14:30 - 17:30)'),
            3: ('2024-02-04', 'Shift 1 (Forenoon: 09:30 - 12:30)'),
            4: ('2024-02-04', 'Shift 2 (Afternoon: 14:30 - 17:30)'),
            5: ('2024-02-10', 'Shift 1 (Forenoon: 09:30 - 12:30)'),
            6: ('2024-02-10', 'Shift 2 (Afternoon: 14:30 - 17:30)'),
            7: ('2024-02-11', 'Shift 1 (Forenoon: 09:30 - 12:30)'),
            8: ('2024-02-11', 'Shift 2 (Afternoon: 14:30 - 17:30)'),
        }
    },
    2025: {
        'year': 2025,
        'organizingInstitute': 'IIT Roorkee',
        'manifestPath': '/Users/shivarampatel/Downloads/GATE 2025/GATE_2025_manifest.csv',
        'assetsBaseDir': '/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/public/exam-assets/gate/2025',
        'sessionSchedule': {}
    }
}

SECTION_METADATA = {
    'GA': {'id': 'ga', 'name': 'General Aptitude'},
    'AE': {'id': 'ae_core', 'name': 'Aerospace Engineering'},
    'AG': {'id': 'ag_core', 'name': 'Agricultural Engineering'},
    'AR': {'id': 'ar_common', 'name': 'Architecture and Planning (Part A - Common)'},
    'AR-B1': {'id': 'ar_b1', 'name': 'Part B1: Architecture'},
    'AR-B2': {'id': 'ar_b2', 'name': 'Part B2: Planning'},
    'BM': {'id': 'bm_core', 'name': 'Biomedical Engineering'},
    'BT': {'id': 'bt_core', 'name': 'Biotechnology'},
    'CE-1': {'id': 'ce1_core', 'name': 'Civil Engineering (Session 1)'},
    'CE-2': {'id': 'ce2_core', 'name': 'Civil Engineering (Session 2)'},
    'CH': {'id': 'ch_core', 'name': 'Chemical Engineering'},
    'CS-1': {'id': 'cs1_core', 'name': 'Computer Science & IT (Session 1)'},
    'CS-2': {'id': 'cs2_core', 'name': 'Computer Science & IT (Session 2)'},
    'CY': {'id': 'cy_core', 'name': 'Chemistry'},
    'DA': {'id': 'da_core', 'name': 'Data Science & Artificial Intelligence'},
    'EC': {'id': 'ec_core', 'name': 'Electronics & Communication Engineering'},
    'EE': {'id': 'ee_core', 'name': 'Electrical Engineering'},
    'ES': {'id': 'es_core', 'name': 'Environmental Science & Engineering'},
    'EY': {'id': 'ey_core', 'name': 'Ecology and Evolution'},
    'GE': {'id': 'ge_core', 'name': 'Geomatics Engineering'},
    'GE-A': {'id': 'ge_a', 'name': 'Part A: Common'},
    'GE-B-SI': {'id': 'ge_b_s1', 'name': 'Part B: Section I (Surveying and Mapping)'},
    'GE-B-SII': {'id': 'ge_b_s2', 'name': 'Part B: Section II (Image Processing and Analysis)'},
    'GG': {'id': 'gg_common', 'name': 'Part A: Common (Geology and Geophysics)'},
    'GG1': {'id': 'gg1_core', 'name': 'Part B: Section 1 (Geology)'},
    'GG2': {'id': 'gg2_core', 'name': 'Part B: Section 2 (Geophysics)'},
    'IN': {'id': 'in_core', 'name': 'Instrumentation Engineering'},
    'MA': {'id': 'ma_core', 'name': 'Mathematics'},
    'ME': {'id': 'me_core', 'name': 'Mechanical Engineering'},
    'MN': {'id': 'mn_core', 'name': 'Mining Engineering'},
    'MT': {'id': 'mt_core', 'name': 'Metallurgical Engineering'},
    'NM': {'id': 'nm_core', 'name': 'Naval Architecture & Marine Engineering'},
    'PE': {'id': 'pe_core', 'name': 'Petroleum Engineering'},
    'PH': {'id': 'ph_core', 'name': 'Physics'},
    'PI': {'id': 'pi_core', 'name': 'Production and Industrial Engineering'},
    'ST': {'id': 'st_core', 'name': 'Statistics'},
    'TF': {'id': 'tf_core', 'name': 'Textile Engineering & Fibre Science'},
    'XE-A': {'id': 'xe_a', 'name': 'Section A: Engineering Mathematics (Compulsory)'},
    'XE-B': {'id': 'xe_b', 'name': 'Section B: Fluid Mechanics'},
    'XE-C': {'id': 'xe_c', 'name': 'Section C: Materials Science'},
    'XE-D': {'id': 'xe_d', 'name': 'Section D: Solid Mechanics'},
    'XE-E': {'id': 'xe_e', 'name': 'Section E: Thermodynamics'},
    'XE-F': {'id': 'xe_f', 'name': 'Section F: Polymer Science & Engineering'},
    'XE-G': {'id': 'xe_g', 'name': 'Section G: Food Technology'},
    'XE-H': {'id': 'xe_h', 'name': 'Section H: Atmospheric and Oceanic Sciences'},
    'XH-B1': {'id': 'xh_b1', 'name': 'Section B1: Reasoning and Comprehension (Compulsory)'},
    'XH-C1': {'id': 'xh_c1', 'name': 'Section C1: Economics'},
    'XH-C2': {'id': 'xh_c2', 'name': 'Section C2: English'},
    'XH-C3': {'id': 'xh_c3', 'name': 'Section C3: Linguistics'},
    'XH-C4': {'id': 'xh_c4', 'name': 'Section C4: Philosophy'},
    'XH-C5': {'id': 'xh_c5', 'name': 'Section C5: Psychology'},
    'XH-C6': {'id': 'xh_c6', 'name': 'Section C6: Sociology'},
    'XL-P': {'id': 'xl_p', 'name': 'Section P: Chemistry (Compulsory)'},
    'XL-Q': {'id': 'xl_q', 'name': 'Section Q: Biochemistry'},
    'XL-R': {'id': 'xl_r', 'name': 'Section R: Botany'},
    'XL-S': {'id': 'xl_s', 'name': 'Section S: Microbiology'},
    'XL-T': {'id': 'xl_t', 'name': 'Section T: Zoology'},
    'XL-U': {'id': 'xl_u', 'name': 'Section U: Food Technology'},
}

def parse_answer_key(ak_pdf_path):
    """Parses official GATE answer key PDF with high precision."""
    doc = fitz.open(ak_pdf_path)
    ak_dict = {}
    for page in doc:
        for t in page.find_tables().tables:
            for r in t.extract():
                if r and r[0] and str(r[0]).strip().isdigit():
                    q_no = int(str(r[0]).strip())
                    session = str(r[1]).strip() if len(r) > 1 and r[1] else '1'
                    q_type = str(r[2]).strip().upper() if len(r) > 2 and r[2] else 'MCQ'
                    section = str(r[3]).strip() if len(r) > 3 and r[3] else 'Subject'
                    key_range = str(r[4]).strip() if len(r) > 4 and r[4] else ''
                    marks_str = str(r[5]).strip() if len(r) > 5 and r[5] else '1'
                    marks = 2.0 if '2' in marks_str else 1.0

                    ak_dict[q_no] = {
                        'q_no': q_no,
                        'session': session,
                        'q_type': q_type,
                        'section': section,
                        'key_range': key_range,
                        'marks': marks,
                    }
    return ak_dict

def neutralize_page_watermarks(doc, page, year=2024):
    """
    Neutralizes page watermarks dynamically before rasterization.
    Supports both vector watermarks (2024 gray glyphs) and bitmap watermarks (2025/2024 XH-C6).
    """
    # 1. Neutralize vector watermark drawing streams in memory
    for xref in page.get_contents():
        try:
            stream = doc.xref_stream(xref)
            modified = False
            # Check 0.753 g (GATE 2024 grayscale vector watermark)
            idx = stream.find(b'0.753 g')
            if idx != -1:
                next_g = stream.find(b'\n0 g', idx)
                if next_g != -1:
                    stream = stream[:idx] + b'1 g ' + b' ' * (next_g - idx - 4) + stream[next_g:]
                    modified = True
            # Check 0.7529412 sc (GATE 2024 RGB vector watermark e.g. XH-C6)
            idx_sc = stream.find(b'0.7529412 0.7529412 0.7529412 sc')
            if idx_sc != -1:
                next_gs = stream.find(b'\n0 g', idx_sc)
                if next_gs != -1:
                    stream = stream[:idx_sc] + b'1 g ' + b' ' * (next_gs - idx_sc - 4) + stream[next_gs:]
                    modified = True
            if modified:
                doc.update_stream(xref, stream)
        except Exception:
            pass

    # 2. Neutralize bitmap watermarks (GATE 2025 full-page bitmaps & GATE 2024 XH-C6 background)
    blank_rgb = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 1, 1), 0)
    blank_rgb.clear_with(255)
    blank_gray = fitz.Pixmap(fitz.csGRAY, fitz.IRect(0, 0, 1, 1), 0)
    blank_gray.clear_with(0)

    for img in page.get_images():
        xref = img[0]
        rects = page.get_image_rects(xref)
        is_watermark = any(r.width > 380 and r.height > 320 for r in rects)

        if is_watermark:
            try:
                page.replace_image(xref, pixmap=blank_rgb)
            except Exception:
                pass
            try:
                obj_str = doc.xref_object(xref)
                m = re.search(r'/SMask\s+(\d+)\s+0\s+R', obj_str)
                if m:
                    page.replace_image(int(m.group(1)), pixmap=blank_gray)
            except Exception:
                pass

def is_meaningful_visual(pix):
    """Checks if a pixmap contains real non-white graphical content."""
    if pix.width < 10 or pix.height < 10:
        return False
    samples = pix.samples
    non_white = sum(1 for b in samples if b < 240)
    return non_white > 100

def extract_paper(paper_info, assets_base_dir, year_config):
    """
    Extracts all questions, options, and diagrams for a given paper using
    Unified Semantic Visual Extraction across both table-grid and text-flow layouts.
    """
    code = paper_info['code']
    name = paper_info['name']
    session = paper_info['session']
    qp_path = paper_info['qp']
    ak_path = paper_info['ak']
    year = year_config['year']
    org_institute = year_config['organizingInstitute']

    ak_dict = parse_answer_key(ak_path)
    doc = fitz.open(qp_path)

    paper_assets_dir = os.path.join(assets_base_dir, code.lower())
    shutil.rmtree(paper_assets_dir, ignore_errors=True)
    os.makedirs(paper_assets_dir, exist_ok=True)

    # Determine layout strategy: check if document uses tables across majority of pages
    pages_with_tables = sum(1 for p in doc if len(p.find_tables().tables) > 0)
    use_tables = pages_with_tables > (len(doc) // 2)

    extracted_qs = {}

    for pno, page in enumerate(doc):
        # 1. Neutralize watermarks
        neutralize_page_watermarks(doc, page, year=year)

        # 2. Pre-fetch genuine page images and vector drawings
        page_images = []
        for img in page.get_images():
            xref = img[0]
            w, h = img[2], img[3]
            if w <= 1 and h <= 1:
                continue
            rects = page.get_image_rects(xref)
            if any(r.y1 < 75 for r in rects):
                continue
            if any(r.width > 380 and r.height > 320 for r in rects):
                continue
            for r in rects:
                if r.y1 > 75 and r.y0 < 765:
                    page_images.append((xref, r, w, h))

        page_drawings = []
        for d in page.get_drawings():
            dr = fitz.Rect(d['rect'])
            if dr.width <= 2.5 or dr.height <= 2.5:
                continue
            if dr.width > 350 and dr.height > 350:
                continue
            if dr.y1 < 75 or dr.y0 > 765:
                continue
            # Exclude pure white background fill rectangles
            if d.get('fill') and all(c >= 0.99 for c in d['fill'][:3]) and not d.get('color'):
                continue
            # Exclude GATE 2024 gray vector watermark glyphs
            if d.get('fill') and len(d['fill']) >= 3 and all(abs(c - 0.7529) < 0.05 for c in d['fill'][:3]):
                continue
            page_drawings.append(dr)

        # 3A. Layout Strategy: Table Grid
        if use_tables:
            tabs = page.find_tables()
            if tabs.tables:
                for t in tabs.tables:
                    df = t.extract()
                    col0_x1 = t.bbox[0] + 42.4
                    if t.header and hasattr(t.header, 'cells') and t.header.cells and t.header.cells[0]:
                        try:
                            col0_x1 = t.header.cells[0][2]
                        except Exception:
                            pass
                    current_q = None

                    for ri, row in enumerate(df):
                        if not row:
                            continue
                        label = (row[0] or '').strip()
                        val = (row[1] or '').strip() if len(row) > 1 and row[1] else ''

                        r_bbox = None
                        if hasattr(t, 'rows') and ri < len(t.rows) and t.rows[ri]:
                            try:
                                r_bbox = t.rows[ri].bbox
                            except Exception:
                                pass
                        row_rect = fitz.Rect(col0_x1 + 1.5, r_bbox[1] + 1.5, t.bbox[2] - 1.5, r_bbox[3] - 1.5) if r_bbox else None

                        cell_imgs = []
                        cell_drws = []
                        if row_rect:
                            for im in page_images:
                                if row_rect.intersects(im[1]) and (row_rect & im[1]).width > 12 and (row_rect & im[1]).height > 12:
                                    cell_imgs.append(im[1])
                            for dr in page_drawings:
                                if row_rect.intersects(dr) and (row_rect & dr).width > 12 and (row_rect & dr).height > 12:
                                    cell_drws.append(dr)

                        q_match = re.match(r'^Q\s*\.?\s*(\d+)[\.\s]*$', label)
                        if q_match:
                            num = int(q_match.group(1))
                            if num in ak_dict:
                                current_q = num
                                diag_url = None
                                if cell_imgs or cell_drws:
                                    visual_rects = cell_imgs + cell_drws
                                    union_rect = visual_rects[0]
                                    for vr in visual_rects[1:]:
                                        union_rect = union_rect | vr
                                    if union_rect.height >= 20 and union_rect.width >= 30:
                                        crop_rect = fitz.Rect(
                                            max(row_rect.x0, union_rect.x0 - 4),
                                            max(row_rect.y0, union_rect.y0 - 4),
                                            min(row_rect.x1, union_rect.x1 + 4),
                                            min(row_rect.y1, union_rect.y1 + 4)
                                        )
                                        if crop_rect.width > 20 and crop_rect.height > 20:
                                            pix = page.get_pixmap(clip=crop_rect, dpi=200)
                                            if is_meaningful_visual(pix):
                                                img_filename = f'q{current_q}_diag.png'
                                                img_filepath = os.path.join(paper_assets_dir, img_filename)
                                                pix.save(img_filepath)
                                                diag_url = f'/exam-assets/gate/{year}/{code.lower()}/{img_filename}'

                                extracted_qs[current_q] = {
                                    'questionNumber': current_q,
                                    'prompt': val,
                                    'options': [],
                                    'option_images': [],
                                    'diagram_url': diag_url,
                                    'type': ak_dict[current_q]['q_type'],
                                    'page': pno + 1,
                                }
                                continue

                        if current_q is not None:
                            q_data = extracted_qs[current_q]
                            opt_match = re.match(r'^(?:\(([A-D])\)|([A-D])(?:\s+|$)|(©))', label)

                            if opt_match:
                                opt_letter = opt_match.group(1) or opt_match.group(2) or ('C' if opt_match.group(3) else None)
                                has_opt_img = False

                                if cell_imgs or cell_drws:
                                    visual_rects = cell_imgs + cell_drws
                                    union_rect = visual_rects[0]
                                    for vr in visual_rects[1:]:
                                        union_rect = union_rect | vr

                                    if union_rect.height >= 18 and union_rect.width >= 25:
                                        crop_rect = fitz.Rect(
                                            max(row_rect.x0, union_rect.x0 - 4),
                                            max(row_rect.y0, union_rect.y0 - 4),
                                            min(row_rect.x1, union_rect.x1 + 4),
                                            min(row_rect.y1, union_rect.y1 + 4)
                                        )
                                        if crop_rect.width > 15 and crop_rect.height > 15:
                                            pix = page.get_pixmap(clip=crop_rect, dpi=200)
                                            if is_meaningful_visual(pix):
                                                img_filename = f'q{current_q}_opt_{opt_letter.lower()}.png'
                                                img_filepath = os.path.join(paper_assets_dir, img_filename)
                                                pix.save(img_filepath)
                                                q_data['option_images'].append(f'/exam-assets/gate/{year}/{code.lower()}/{img_filename}')
                                                has_opt_img = True

                                if not has_opt_img:
                                    q_data['option_images'].append(None)
                                q_data['options'].append(val)

                            elif len(q_data['options']) == 0 and not q_data['diagram_url']:
                                if cell_imgs or cell_drws:
                                    visual_rects = cell_imgs + cell_drws
                                    union_rect = visual_rects[0]
                                    for vr in visual_rects[1:]:
                                        union_rect = union_rect | vr

                                    if union_rect.height >= 20 and union_rect.width >= 30:
                                        crop_rect = fitz.Rect(
                                            max(row_rect.x0, union_rect.x0 - 4),
                                            max(row_rect.y0, union_rect.y0 - 4),
                                            min(row_rect.x1, union_rect.x1 + 4),
                                            min(row_rect.y1, union_rect.y1 + 4)
                                        )
                                        if crop_rect.width > 20 and crop_rect.height > 20:
                                            pix = page.get_pixmap(clip=crop_rect, dpi=200)
                                            if is_meaningful_visual(pix):
                                                img_filename = f'q{current_q}_diag.png'
                                                img_filepath = os.path.join(paper_assets_dir, img_filename)
                                                pix.save(img_filepath)
                                                q_data['diagram_url'] = f'/exam-assets/gate/{year}/{code.lower()}/{img_filename}'
                                if val:
                                    q_data['prompt'] = (q_data['prompt'] + '\n' + val).strip() if q_data['prompt'] else val

        # 3B. Layout Strategy: Text Flow (or supplementary pass for missed questions)
        blocks = page.get_text('blocks')
        content_blocks = [b for b in blocks if b[1] > 65 and b[3] < 770 and b[4].strip()]
        content_blocks.sort(key=lambda b: (round(b[1], 1), round(b[0], 1)))

        headers = []
        for b in content_blocks:
            if b[0] < 100:
                qm = re.match(r'^(?:Q\s*\.?\s*(\d+)|(\d+)\s*\.)(?:\s+|–|-|\.|$)', b[4].strip())
                if qm and 'Carry' not in b[4] and '–' not in b[4][:15]:
                    qnum = int(qm.group(1) or qm.group(2))
                    if qnum in ak_dict and (not use_tables or qnum not in extracted_qs):
                        headers.append((qnum, b[1], b[3], b))

        for hi, (qnum, q_y0, q_y1, q_block) in enumerate(headers):
            next_q_y0 = headers[hi+1][1] if hi+1 < len(headers) else 765.0
            q_opts = {}  # letter -> (y0, y1, text, block)
            for ob in content_blocks:
                if ob[1] >= q_y0 and ob[1] < next_q_y0 and ob[0] < 130:
                    txt = ob[4].strip()
                    optm = re.match(r'^(?:\(([A-D])\)|([A-D])(?:\s+|$)|(©))(?:\s*|\n)(.*)', txt, re.DOTALL)
                    if optm:
                        letter = optm.group(1) or optm.group(2) or ('C' if optm.group(3) else None)
                        val = (optm.group(4) or '').strip()
                        if letter and letter not in q_opts:
                            q_opts[letter] = (ob[1], ob[3], val, ob)

            first_opt_y = min([o[0] for o in q_opts.values()]) if q_opts else next_q_y0
            prompt_texts = []
            for pb in content_blocks:
                if pb[1] >= q_y0 - 2 and pb[3] <= first_opt_y + 2:
                    p_txt = pb[4].strip()
                    if pb == q_block:
                        p_txt = re.sub(r'^(?:Q\s*\.?\s*\d+|\d+\s*\.)[\s\.\–\-]*', '', p_txt).strip()
                    if p_txt:
                        prompt_texts.append(p_txt)

            # Check question diagram
            prompt_rect = fitz.Rect(70, q_y0, 530, first_opt_y)
            prompt_imgs = [im[1] for im in page_images if prompt_rect.intersects(im[1]) and (prompt_rect & im[1]).width > 12 and (prompt_rect & im[1]).height > 12]
            prompt_drws = [dr for dr in page_drawings if prompt_rect.intersects(dr) and (prompt_rect & dr).width > 12 and (prompt_rect & dr).height > 12]

            diagram_url = None
            if prompt_imgs or prompt_drws:
                visuals = prompt_imgs + prompt_drws
                union_rect = visuals[0]
                for v in visuals[1:]:
                    union_rect = union_rect | v
                if union_rect.height >= 20 and union_rect.width >= 30:
                    crop_rect = fitz.Rect(
                        max(70, union_rect.x0 - 4),
                        max(q_y0, union_rect.y0 - 4),
                        min(530, union_rect.x1 + 4),
                        min(first_opt_y, union_rect.y1 + 4)
                    )
                    if crop_rect.width > 20 and crop_rect.height > 20:
                        pix = page.get_pixmap(clip=crop_rect, dpi=200)
                        if is_meaningful_visual(pix):
                            img_filename = f'q{qnum}_diag.png'
                            img_filepath = os.path.join(paper_assets_dir, img_filename)
                            pix.save(img_filepath)
                            diagram_url = f'/exam-assets/gate/{year}/{code.lower()}/{img_filename}'

            # Check option images
            opt_texts = []
            opt_images = []
            letters = ['A', 'B', 'C', 'D']
            for li, let in enumerate(letters):
                if let in q_opts:
                    val = q_opts[let][2]
                    opt_y0 = q_opts[let][0]
                    opt_y1 = q_opts[letters[li+1]][0] if li+1 < len(letters) and letters[li+1] in q_opts else next_q_y0
                    opt_rect = fitz.Rect(70, opt_y0, 530, opt_y1)
                    o_imgs = [im[1] for im in page_images if opt_rect.intersects(im[1]) and (opt_rect & im[1]).width > 12 and (opt_rect & im[1]).height > 12]
                    o_drws = [dr for dr in page_drawings if opt_rect.intersects(dr) and (opt_rect & dr).width > 12 and (opt_rect & dr).height > 12]
                    has_img = False
                    if o_imgs or o_drws:
                        visuals = o_imgs + o_drws
                        union_rect = visuals[0]
                        for v in visuals[1:]:
                            union_rect = union_rect | v
                        if union_rect.height >= 18 and union_rect.width >= 25:
                            crop_rect = fitz.Rect(
                                max(70, union_rect.x0 - 4),
                                max(opt_y0, union_rect.y0 - 4),
                                min(530, union_rect.x1 + 4),
                                min(opt_y1, union_rect.y1 + 4)
                            )
                            if crop_rect.width > 15 and crop_rect.height > 15:
                                pix = page.get_pixmap(clip=crop_rect, dpi=200)
                                if is_meaningful_visual(pix):
                                    img_filename = f'q{qnum}_opt_{let.lower()}.png'
                                    img_filepath = os.path.join(paper_assets_dir, img_filename)
                                    pix.save(img_filepath)
                                    opt_images.append(f'/exam-assets/gate/{year}/{code.lower()}/{img_filename}')
                                    has_img = True
                    if not has_img:
                        opt_images.append(None)
                    opt_texts.append(val)
                else:
                    opt_texts.append('')
                    opt_images.append(None)

            extracted_qs[qnum] = {
                'questionNumber': qnum,
                'prompt': ' '.join(prompt_texts),
                'options': opt_texts,
                'option_images': opt_images,
                'diagram_url': diagram_url,
                'type': ak_dict[qnum]['q_type'],
                'page': pno + 1,
            }

    # Verify all expected questions exist
    missing_qs = [q for q in ak_dict if q not in extracted_qs]
    if missing_qs:
        raise ValueError(f"Missing {len(missing_qs)} questions in {code} ({year}): {missing_qs}")

    # Determine exam date and shift
    session_num_match = re.search(r'S(\d+)\.pdf', paper_info.get('url', ''))
    session_int = int(session_num_match.group(1)) if session_num_match else 1
    sched = year_config.get('sessionSchedule', {}).get(session_int, ('2024-02-03', session))
    exam_date = sched[0] if year == 2024 else '2025-02-01'
    exam_shift = sched[1] if year == 2024 else session

    # Build standardized questions
    questions = []
    paper_id = f"gate-{year}-{code.lower().replace('_', '-')}"

    for q_no in sorted(ak_dict.keys()):
        ak_item = ak_dict[q_no]
        extracted = extracted_qs[q_no]
        sec_code = ak_item['section']
        sec_meta = SECTION_METADATA.get(sec_code, {
            'id': sec_code.lower().replace('-', '_'),
            'name': sec_code
        })

        q_type = ak_item['q_type']
        key_range = ak_item['key_range']
        marks = ak_item['marks']
        is_mta = ('MTA' in key_range)

        correct_answer = key_range
        correct_answer_index = -1
        correct_answer_set = None
        correct_answer_sets = None
        correct_answer_indices = None
        answer_range = None
        answer_ranges = None
        negative_marks = 0.0

        if is_mta:
            correct_answer = 'MTA'
            explanation = f"Marks to All (MTA) awarded by official GATE {year} committee."
        elif q_type == 'MCQ':
            negative_marks = 0.33 if marks == 1.0 else 0.66
            opt_letter = key_range.strip()
            correct_answer = opt_letter
            correct_answer_index = {'A': 0, 'B': 1, 'C': 2, 'D': 3}.get(opt_letter, -1)
            explanation = f"The official answer key provided by {org_institute} is Option ({correct_answer})."
        elif q_type == 'MSQ':
            negative_marks = 0.0  # Zero negative marks for MSQ
            if ' OR ' in key_range:
                alt_parts = key_range.split(' OR ')
                correct_answer_sets = []
                for alt in alt_parts:
                    opts = [o.strip() for o in alt.split(';') if o.strip()]
                    correct_answer_sets.append(opts)
                correct_answer_set = correct_answer_sets[0]
            else:
                opts = [o.strip() for o in key_range.split(';') if o.strip()]
                correct_answer_set = opts

            letter_to_idx = {'A': 0, 'B': 1, 'C': 2, 'D': 3}
            correct_answer_indices = [letter_to_idx[o] for o in correct_answer_set if o in letter_to_idx]
            explanation = f"The official answer key provided by {org_institute} for this MSQ is {key_range}."
        elif q_type == 'NAT':
            negative_marks = 0.0  # Zero negative marks for NAT
            if ' OR ' in key_range:
                alt_ranges = key_range.split(' OR ')
                answer_ranges = []
                for alt in alt_ranges:
                    m = re.match(r'^(-?[\d\.]+)\s+to\s+(-?[\d\.]+)$', alt.strip())
                    if m:
                        answer_ranges.append({'min': float(m.group(1)), 'max': float(m.group(2))})
                if answer_ranges:
                    answer_range = answer_ranges[0]
            else:
                m = re.match(r'^(-?[\d\.]+)\s+to\s+(-?[\d\.]+)$', key_range.strip())
                if m:
                    answer_range = {'min': float(m.group(1)), 'max': float(m.group(2))}
            explanation = f"The official accepted numerical range provided by {org_institute} is {key_range}."

        options = extracted['options']
        option_images = extracted['option_images']
        if q_type == 'NAT':
            options = []
            option_images = None
        else:
            while len(options) < 4:
                options.append('')
                if option_images is not None:
                    option_images.append(None)

        has_any_opt_img = option_images and any(img is not None for img in option_images)
        rich_options = None
        if q_type != 'NAT':
            rich_options = []
            opt_ids = ['A', 'B', 'C', 'D']
            for oi in range(len(options)):
                rich_options.append({
                    'id': opt_ids[oi] if oi < len(opt_ids) else f'OPT_{oi+1}',
                    'text': options[oi],
                    'imageUrl': option_images[oi] if has_any_opt_img else None,
                })

        q_obj = {
            'id': f"{paper_id}-q{q_no}",
            'questionNumber': q_no,
            'sectionId': sec_meta['id'],
            'sectionName': sec_meta['name'],
            'questionText': extracted['prompt'],
            'questionType': q_type,
            'options': options,
            'optionImages': option_images if has_any_opt_img else None,
            'richOptions': rich_options,
            'correctAnswer': correct_answer,
            'correctAnswerIndex': correct_answer_index,
            'correctAnswerSet': correct_answer_set,
            'correctAnswerSets': correct_answer_sets,
            'correctAnswerIndices': correct_answer_indices,
            'answerRange': answer_range,
            'answerRanges': answer_ranges,
            'isMta': is_mta,
            'explanation': explanation,
            'diagramUrl': extracted['diagram_url'],
            'diagramUrls': [extracted['diagram_url']] if extracted['diagram_url'] else None,
            'marks': marks,
            'negativeMarks': negative_marks,
            'examId': 'gate',
            'year': year,
            'date': exam_date,
            'shift': exam_shift,
            'tier': 'Single Stage',
            'paperCode': code,
            'discipline': name,
            'language': 'English',
        }
        questions.append(q_obj)

    # Build sections metadata
    sections = []
    sec_order = []
    sec_grouped = {}
    for idx, q in enumerate(questions):
        sid = q['sectionId']
        if sid not in sec_grouped:
            sec_grouped[sid] = {
                'id': sid,
                'name': q['sectionName'],
                'questionCount': 0,
                'startIndex': idx,
                'endIndex': idx,
                'maxMarks': 0.0,
            }
            sec_order.append(sid)
        g = sec_grouped[sid]
        g['questionCount'] += 1
        g['endIndex'] = idx
        g['maxMarks'] += q['marks']

    for sid in sec_order:
        sections.append(sec_grouped[sid])

    total_marks = sum(q['marks'] for q in questions)
    session_label = f"Session: {session}" if session != 'General' else 'Single Session'

    paper_json = {
        'id': paper_id,
        'examId': 'gate',
        'examName': 'GATE',
        'editionYear': year,
        'title': f"GATE {year} — {name} ({code})",
        'subTitle': f"Official {org_institute} Question Paper ({session_label})",
        'date': exam_date,
        'shift': exam_shift,
        'tier': 'Single Stage',
        'paperType': 'CBE_OBJECTIVE',
        'paperCode': code,
        'discipline': name,
        'language': 'English',
        'durationMinutes': 180,
        'totalMarks': total_marks,
        'totalQuestions': len(questions),
        'isComplete': True,
        'markingScheme': {
            'marksPerCorrect': 1.0,
            'negativeMarks': 0.33,
            'unansweredMarks': 0.0,
        },
        'sections': sections,
        'questions': questions,
    }

    out_file = os.path.join(EXAMS_DATA_DIR, f"{paper_id}.json")
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(paper_json, f, indent=2, ensure_ascii=False)

    diagram_count = sum(1 for q in questions if q['diagramUrl'])
    opt_img_count = sum(1 for q in questions if q['optionImages'])
    return {
        'code': code,
        'totalQuestions': len(questions),
        'totalMarks': total_marks,
        'sections': len(sections),
        'diagrams': diagram_count,
        'visualOptions': opt_img_count,
        'out_file': out_file,
    }

def process_year(year):
    cfg = YEAR_CONFIGS[year]
    manifest_path = cfg['manifestPath']
    assets_dir = cfg['assetsBaseDir']

    papers = {}
    with open(manifest_path, 'r', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            code = r['paper_code']
            if code not in papers:
                papers[code] = {
                    'code': code,
                    'name': r['paper_name'],
                    'session': r['session'],
                    'url': r.get('source_url', '')
                }
            if r['file_type'] == 'Question Paper':
                papers[code]['qp'] = r['local_path']
            elif r['file_type'] == 'Answer Key':
                papers[code]['ak'] = r['local_path']

    print(f"\n==========================================")
    print(f"STARTING GATE {year} SEMANTIC INGESTION ({len(papers)} papers)")
    print(f"==========================================")
    results = []
    for code, p_info in sorted(papers.items()):
        print(f"-> Processing {code} ({p_info['name']})...", flush=True)
        res = extract_paper(p_info, assets_dir, cfg)
        results.append(res)
        print(f"   [DONE] {code}: {res['totalQuestions']} Qs, {res['totalMarks']} Marks, {res['diagrams']} Diagrams, {res['visualOptions']} Visual Option Sets", flush=True)

    print(f"\n==========================================")
    print(f"GATE {year} SEMANTIC INGESTION COMPLETE")
    print(f"Successfully processed {len(results)} / {len(papers)} papers.")
    total_q = sum(r['totalQuestions'] for r in results)
    total_diag = sum(r['diagrams'] for r in results)
    total_opt = sum(r['visualOptions'] for r in results)
    print(f"Total Questions Ingested: {total_q}")
    print(f"Total Diagrams Extracted: {total_diag}")
    print(f"Total Visual Option Sets Extracted: {total_opt}")
    print(f"==========================================")

def main():
    parser = argparse.ArgumentParser(description="GATE Question Paper and Answer Key Ingestion Pipeline")
    parser.add_argument('--year', type=int, default=2024, choices=[2024, 2025], help="Target GATE edition year (default: 2024)")
    parser.add_argument('--all', action='store_true', help="Process both 2024 and 2025")
    args = parser.parse_args()

    if args.all:
        process_year(2024)
        process_year(2025)
    else:
        process_year(args.year)

if __name__ == '__main__':
    main()
