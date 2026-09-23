#!/usr/bin/env python3
"""
universal_visual_extractor.py
Robust layout-aware visual content extractor for SSC CHSL papers (2023, 2024, 2025).
Extracts question diagrams and option images directly from PDF XObjects,
associates them with each question in web/src/data/exams/*.json,
saves high-resolution web-ready PNG assets into web/public/exam-assets/,
and replaces generic placeholder text ('Option (A)' etc.) with genuine visual choices.
"""

import os, glob, re, json, hashlib, io
import fitz
from PIL import Image

BASE_DIR = '/Users/shivarampatel/AndroidStudioProjects/MOCK.AI'
EXAMS_DATA_DIR = os.path.join(BASE_DIR, 'web/src/data/exams')
PUBLIC_ASSETS_DIR = os.path.join(BASE_DIR, 'web/public/exam-assets')

# Watermark, publisher ads, and promotional banner dimensions to ignore
AD_SIZES = {
    (464, 137),   # Adda247 header logo
    (2022, 423),  # Adda247 top banner
    (834, 719),   # Adda247 background watermark
    (833, 719),
    (835, 719),
    (143, 98),    # 2025 banner logo
    (200, 95),    # 2025 banner logo
    (523, 451),   # 2025 watermark/banner
    (1023, 1537), # 2025 full-page promo
    (596, 842),   # 2025 page background
    (466, 149),
    (423, 142),
}

# Status icons to ignore (green ticks, red crosses, status markers)
ICON_SIZES = {
    (16, 16),     # Standard green tick
    (31, 21),     # Standard red cross
    (23, 22),     # 2023 tick
    (23, 23),     # 2023 tick
    (18, 21),
    (19, 22),
}

# Global content-hash cache for deduplication
content_hash_map = {}

def get_or_save_asset(img_bytes, ext, dest_path, web_url):
    """
    Saves image bytes to dest_path (converting to PNG if necessary),
    deduplicating by SHA256. Returns the web-accessible URL.
    """
    h = hashlib.sha256(img_bytes).hexdigest()
    if h in content_hash_map:
        return content_hash_map[h]
    
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    
    # Standardize on PNG or JPEG for browser compatibility
    if ext.lower() in ('png', 'jpeg', 'jpg'):
        with open(dest_path, 'wb') as f:
            f.write(img_bytes)
    else:
        pil_img = Image.open(io.BytesIO(img_bytes))
        dest_path = os.path.splitext(dest_path)[0] + '.png'
        web_url = os.path.splitext(web_url)[0] + '.png'
        pil_img.save(dest_path, format='PNG')
        
    content_hash_map[h] = web_url
    return web_url

def process_cbt_paper(doc, paper_data, year, paper_id):
    """
    Extracts diagrams and option images for CBT response sheet format (2024 and 2023).
    Accurately maps Section 1 (English: 1-25), Section 2 (Reasoning: 26-50),
    Section 3 (Quant: 51-75), Section 4 (GA: 76-100).
    """
    asset_dir = os.path.join(PUBLIC_ASSETS_DIR, 'ssc/chsl', str(year), paper_id)
    web_base_url = f"/exam-assets/ssc/chsl/{year}/{paper_id}"
    
    questions = paper_data['questions']
    
    diag_count = 0
    opt_img_count = 0
    visual_q_count = 0
    
    section_offset = 0
    last_local_q = 0

    for p_idx, page in enumerate(doc):
        # Discard header/footer banner images and ads
        page_imgs = []
        for info in page.get_images():
            xref = info[0]
            meta = doc.extract_image(xref)
            w, h = meta['width'], meta['height']
            if (w, h) in AD_SIZES or (w, h) in ICON_SIZES:
                continue
            
            rects = page.get_image_rects(xref)
            for r in rects:
                if r.y1 < 50 or r.y0 > page.rect.height - 30:
                    continue
                # Discard status tick/cross icons placed in left margins
                if r.x1 < 78 and (w <= 35 or h <= 35):
                    continue
                page_imgs.append({
                    'xref': xref,
                    'rect': r,
                    'meta': meta,
                    'w': w,
                    'h': h
                })
        
        # Extract text blocks
        blocks = page.get_text('blocks')
        blocks.sort(key=lambda b: b[1])
        
        # Identify section titles and question headers in layout order
        items = []
        for b in blocks:
            t = b[4].strip()
            if 'Section :' in t or 'Section:' in t:
                items.append(('section', b[1], t))
            else:
                m = re.search(r'(?:^|\n)\s*Q\.?\s*(\d+)', t)
                if m:
                    items.append(('question', b[1], int(m.group(1)), b[4]))
        
        for idx_item, item in enumerate(items):
            if item[0] == 'section':
                sec_t = item[2]
                if 'General Intelligence' in sec_t:
                    section_offset = 25
                elif 'Quantitative Aptitude' in sec_t:
                    section_offset = 50
                elif 'General Awareness' in sec_t:
                    section_offset = 75
                elif 'English' in sec_t:
                    section_offset = 0
                last_local_q = 0
            elif item[0] == 'question':
                q_local = item[2]
                q_y = item[1]
                
                # If question number rolled over without an explicit section header
                if q_local < last_local_q and last_local_q >= 20:
                    section_offset += 25
                last_local_q = q_local
                
                global_q_idx = section_offset + q_local - 1
                if not (0 <= global_q_idx < len(questions)):
                    continue
                    
                curr_q = questions[global_q_idx]
                
                # Vertical boundary for this question
                next_y = items[idx_item+1][1] if idx_item+1 < len(items) else page.rect.height
                
                # Find Ans marker to delineate question diagram vs option images
                ans_y = None
                for b in blocks:
                    if q_y <= b[1] < next_y and 'Ans' in b[4]:
                        ans_y = b[1]
                        break
                
                q_imgs = [img for img in page_imgs if q_y <= img['rect'].y0 < next_y]
                if not q_imgs:
                    continue
                
                if ans_y:
                    diag_imgs = [img for img in q_imgs if img['rect'].y0 < ans_y]
                    opt_imgs = [img for img in q_imgs if img['rect'].y0 >= ans_y]
                else:
                    diag_imgs = q_imgs
                    opt_imgs = []
                
                # Filter out any left margin status icons that slipped through
                diag_imgs = [img for img in diag_imgs if not (img['rect'].x1 < 78 and (img['w'] <= 35 or img['h'] <= 35))]
                opt_imgs = [img for img in opt_imgs if not (img['rect'].x1 < 78 and (img['w'] <= 35 or img['h'] <= 35))]
                
                opt_imgs.sort(key=lambda img: img['rect'].y0)
                
                # 1. Process Question Diagram(s)
                diag_urls = []
                for d_i, d in enumerate(diag_imgs):
                    ext = d['meta']['ext']
                    fname = f"q{curr_q['questionNumber']}_diag_{d_i+1}.{ext}" if len(diag_imgs) > 1 else f"q{curr_q['questionNumber']}_diag.{ext}"
                    dest_path = os.path.join(asset_dir, fname)
                    web_url = f"{web_base_url}/{fname}"
                    saved_url = get_or_save_asset(d['meta']['image'], ext, dest_path, web_url)
                    diag_urls.append(saved_url)
                    diag_count += 1
                
                if diag_urls:
                    curr_q['diagramUrl'] = diag_urls[0]
                    curr_q['diagramUrls'] = diag_urls
                    curr_q['questionAssets'] = [{'type': 'image', 'url': u} for u in diag_urls]
                    # If questionText is placeholder like "Question 26", clear it so diagram speaks for itself
                    if re.match(r'^Question\s*\d+$', curr_q.get('questionText', '').strip(), re.IGNORECASE):
                        curr_q['questionText'] = ""
                
                # 2. Process Option Images
                option_images = [None, None, None, None]
                if len(opt_imgs) == 4:
                    for opt_i in range(4):
                        opt_meta = opt_imgs[opt_i]['meta']
                        ext = opt_meta['ext']
                        letter = ['a', 'b', 'c', 'd'][opt_i]
                        fname = f"q{curr_q['questionNumber']}_opt_{letter}.{ext}"
                        dest_path = os.path.join(asset_dir, fname)
                        web_url = f"{web_base_url}/{fname}"
                        saved_url = get_or_save_asset(opt_meta['image'], ext, dest_path, web_url)
                        option_images[opt_i] = saved_url
                        opt_img_count += 1
                elif 0 < len(opt_imgs) < 4:
                    for opt_i, img in enumerate(opt_imgs):
                        ext = img['meta']['ext']
                        letter = ['a', 'b', 'c', 'd'][opt_i]
                        fname = f"q{curr_q['questionNumber']}_opt_{letter}.{ext}"
                        dest_path = os.path.join(asset_dir, fname)
                        web_url = f"{web_base_url}/{fname}"
                        saved_url = get_or_save_asset(img['meta']['image'], ext, dest_path, web_url)
                        option_images[opt_i] = saved_url
                        opt_img_count += 1
                
                if any(option_images):
                    curr_q['optionImages'] = option_images
                    rich_opts = []
                    for idx_opt in range(4):
                        lbl = ['A', 'B', 'C', 'D'][idx_opt]
                        img_u = option_images[idx_opt]
                        orig_txt = curr_q['options'][idx_opt] if idx_opt < len(curr_q['options']) else ""
                        is_placeholder = bool(re.match(r'^Option\s*\([A-D]\)$', orig_txt.strip(), re.IGNORECASE))
                        cleaned_txt = "" if (is_placeholder and img_u) else orig_txt
                        curr_q['options'][idx_opt] = cleaned_txt
                        rich_opts.append({
                            'id': lbl,
                            'text': cleaned_txt,
                            'imageUrl': img_u
                        })
                    curr_q['richOptions'] = rich_opts
                
                if diag_urls or any(option_images):
                    visual_q_count += 1

    return visual_q_count, diag_count, opt_img_count

def process_2025_paper(doc, paper_data, paper_id):
    """
    Extracts diagrams for 2025 papers where questions are numbered 1-100 continuously.
    """
    asset_dir = os.path.join(PUBLIC_ASSETS_DIR, 'ssc/chsl/2025', paper_id)
    web_base_url = f"/exam-assets/ssc/chsl/2025/{paper_id}"
    
    questions = paper_data['questions']
    diag_count = 0
    opt_img_count = 0
    visual_q_count = 0
    
    for p_idx, page in enumerate(doc):
        page_imgs = []
        for info in page.get_images():
            xref = info[0]
            meta = doc.extract_image(xref)
            w, h = meta['width'], meta['height']
            if (w, h) in AD_SIZES or (w, h) in ICON_SIZES:
                continue
            for r in page.get_image_rects(xref):
                if r.y1 < 50 or r.y0 > page.rect.height - 30:
                    continue
                page_imgs.append({'xref': xref, 'rect': r, 'meta': meta, 'w': w, 'h': h})
        
        if not page_imgs:
            continue
        
        blocks = page.get_text('blocks')
        blocks.sort(key=lambda b: b[1])
        
        q_blocks = []
        for b in blocks:
            t = b[4].strip()
            m = re.search(r'(?:^|\n)\s*Q\.?\s*(\d+)', t)
            if m:
                q_blocks.append((int(m.group(1)), b[1], b[4]))
        
        if not q_blocks:
            continue
            
        for i, (q_num, q_y, q_txt) in enumerate(q_blocks):
            if not (1 <= q_num <= len(questions)):
                continue
            curr_q = questions[q_num - 1]
            next_y = q_blocks[i+1][1] if i+1 < len(q_blocks) else page.rect.height
            
            q_imgs = [img for img in page_imgs if q_y <= img['rect'].y0 < next_y]
            if not q_imgs:
                continue
                
            diag_urls = []
            for d_i, d in enumerate(q_imgs):
                ext = d['meta']['ext']
                fname = f"q{q_num}_diag_{d_i+1}.{ext}" if len(q_imgs) > 1 else f"q{q_num}_diag.{ext}"
                dest_path = os.path.join(asset_dir, fname)
                web_url = f"{web_base_url}/{fname}"
                saved_url = get_or_save_asset(d['meta']['image'], ext, dest_path, web_url)
                diag_urls.append(saved_url)
                diag_count += 1
                
            if diag_urls:
                curr_q['diagramUrl'] = diag_urls[0]
                curr_q['diagramUrls'] = diag_urls
                curr_q['questionAssets'] = [{'type': 'image', 'url': u} for u in diag_urls]
                if re.match(r'^Question\s*\d+$', curr_q.get('questionText', '').strip(), re.IGNORECASE):
                    curr_q['questionText'] = ""
                visual_q_count += 1
                
    return visual_q_count, diag_count, opt_img_count

def run_universal_extraction():
    print("=" * 70)
    print("STARTING UNIVERSAL VISUAL CONTENT EXTRACTION & RENDERING PIPELINE")
    print("=" * 70)
    
    total_papers = 0
    total_visual_questions = 0
    total_diagrams = 0
    total_option_images = 0
    
    # ── 1. Process SSC CHSL 2024 (36 Papers) ──────────────────────────
    folder_2024 = '/Users/shivarampatel/Downloads/exam ssc/qp 2024'
    json_2024_files = sorted(glob.glob(os.path.join(EXAMS_DATA_DIR, 'ssc-chsl-2024-*.json')))
    print(f"\n[1/3] Processing SSC CHSL 2024 ({len(json_2024_files)} papers)...")
    
    shift_time_terms = {
        '1': ['9-00-AM', '9:00 AM'],
        '2': ['11-45-AM', '11:45 AM'],
        '3': ['2-30-PM', '2:30 PM'],
        '4': ['5-15-PM', '5:15 PM']
    }
    
    for j_path in json_2024_files:
        with open(j_path, 'r', encoding='utf-8') as f:
            paper_data = json.load(f)
        
        p_id = paper_data['id']
        m = re.search(r'ssc-chsl-2024-(\d{2})([a-z]+)-s(\d+)', p_id)
        if not m:
            continue
        day, month_str, shift_num = m.groups()
        
        pdf_pattern = os.path.join(folder_2024, f"*{day}-07-2024*")
        candidates = glob.glob(pdf_pattern)
        
        matching_pdf = None
        for cand in candidates:
            if '(1)' in cand:
                continue
            for term in shift_time_terms.get(shift_num, []):
                if term in cand:
                    matching_pdf = cand
                    break
            if matching_pdf:
                break
        
        if not matching_pdf and candidates:
            matching_pdf = [c for c in candidates if '(1)' not in c][0]
            
        if matching_pdf:
            doc = fitz.open(matching_pdf)
            v_q, d_c, opt_c = process_cbt_paper(doc, paper_data, 2024, p_id)
            total_papers += 1
            total_visual_questions += v_q
            total_diagrams += d_c
            total_option_images += opt_c
            print(f"  {p_id}: {v_q} visual Qs ({d_c} diags, {opt_c} opt images)")
            
            with open(j_path, 'w', encoding='utf-8') as f:
                json.dump(paper_data, f, indent=2, ensure_ascii=False)
        else:
            print(f"  WARNING: No PDF found for {p_id}")

    # ── 2. Process SSC CHSL 2023 (36 Papers) ──────────────────────────
    folder_2023 = '/Users/shivarampatel/Downloads/exam ssc/qp 2023'
    json_2023_files = sorted(glob.glob(os.path.join(EXAMS_DATA_DIR, 'ssc-chsl-2023-*.json')))
    print(f"\n[2/3] Processing SSC CHSL 2023 ({len(json_2023_files)} papers)...")
    
    for j_path in json_2023_files:
        with open(j_path, 'r', encoding='utf-8') as f:
            paper_data = json.load(f)
        
        p_id = paper_data['id']
        m = re.search(r'ssc-chsl-2023-(\d{2})([a-z]+)-s(\d+)', p_id)
        if not m:
            continue
        day, month_str, shift_num = m.groups()
        shift_roman = {'1': 'I', '2': 'II', '3': 'III', '4': 'IV'}[shift_num]
        
        pdf_pattern = os.path.join(folder_2023, f"*{day}-08-2023*Shift-{shift_roman}*.pdf")
        candidates = [c for c in glob.glob(pdf_pattern) if '(1)' not in c]
        if not candidates:
            candidates = glob.glob(pdf_pattern)
            if not candidates:
                # Fallback pattern without 'Shift-' prefix
                pdf_pattern2 = os.path.join(folder_2023, f"*{day}-08-2023*Shift*{shift_roman}*.pdf")
                candidates = glob.glob(pdf_pattern2)
        
        if candidates:
            doc = fitz.open(candidates[0])
            v_q, d_c, opt_c = process_cbt_paper(doc, paper_data, 2023, p_id)
            total_papers += 1
            total_visual_questions += v_q
            total_diagrams += d_c
            total_option_images += opt_c
            print(f"  {p_id}: {v_q} visual Qs ({d_c} diags, {opt_c} opt images)")
            
            with open(j_path, 'w', encoding='utf-8') as f:
                json.dump(paper_data, f, indent=2, ensure_ascii=False)
        else:
            print(f"  WARNING: No PDF found for {p_id}")

    # ── 3. Process SSC CHSL 2025 (10 Papers) ──────────────────────────
    folder_2025 = '/Users/shivarampatel/Downloads/exam ssc/question paper 2025'
    json_2025_files = sorted(glob.glob(os.path.join(EXAMS_DATA_DIR, 'ssc-chsl-2025-*.json')))
    print(f"\n[3/3] Processing SSC CHSL 2025 ({len(json_2025_files)} papers)...")
    
    for j_path in json_2025_files:
        with open(j_path, 'r', encoding='utf-8') as f:
            paper_data = json.load(f)
        
        p_id = paper_data['id']
        m = re.search(r'ssc-chsl-2025-(\d{2})([a-z]+)-s(\d+)', p_id)
        if not m:
            continue
        day, month_str, shift_num = m.groups()
        
        candidates = glob.glob(os.path.join(folder_2025, f"*{day}-Nov*S{shift_num}*.pdf")) + \
                     glob.glob(os.path.join(folder_2025, f"*{day}-Nov*Shift-{shift_num}*.pdf")) + \
                     glob.glob(os.path.join(folder_2025, f"*{day}-Nov*Shift {shift_num}*.pdf"))
        
        if candidates:
            doc = fitz.open(candidates[0])
            v_q, d_c, opt_c = process_2025_paper(doc, paper_data, p_id)
            total_papers += 1
            total_visual_questions += v_q
            total_diagrams += d_c
            total_option_images += opt_c
            print(f"  {p_id}: {v_q} visual Qs ({d_c} diags)")
            
            with open(j_path, 'w', encoding='utf-8') as f:
                json.dump(paper_data, f, indent=2, ensure_ascii=False)
        else:
            print(f"  WARNING: No PDF found for {p_id}")

    print("\n" + "=" * 70)
    print("UNIVERSAL VISUAL EXTRACTION AUDIT REPORT")
    print("=" * 70)
    print(f"Total Exam Papers Reprocessed:    {total_papers} / 82")
    print(f"Total Visual Questions Repaired:  {total_visual_questions}")
    print(f"Total Question Diagrams Stored:   {total_diagrams}")
    print(f"Total Option Images Stored:       {total_option_images}")
    print(f"Unique Assets (Deduplicated):     {len(content_hash_map)}")
    print(f"Asset Directory:                  {PUBLIC_ASSETS_DIR}")
    print("=" * 70)

if __name__ == '__main__':
    run_universal_extraction()
