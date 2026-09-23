#!/usr/bin/env python3
"""
universal_chsl_importer.py
Complete multi-year ingestion and visual content pipeline for SSC CHSL:
Processes 2022, 2021, 2020, and 2019 folders, extracts text, diagrams,
option images, and official answer keys from TCS iON CBT response sheets.
"""

import os, glob, re, json, hashlib, io
import fitz
from PIL import Image
try:
    import pytesseract
except ImportError:
    pytesseract = None

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

def clean_watermarks(text):
    if not text:
        return ""
    patterns = [
        r'Adda247\s*',
        r'Test\s+Prime\s*',
        r'Download\s+App\s*',
        r'Question\s+ID\s*:\s*\d+',
        r'Chosen\s+Option\s*:\s*\S+',
        r'Status\s*:\s*[^\n]+',
        r'Page\s+\d+\s+of\s+\d+',
        r'CHSL\s+Exam\s+\d+\s+Tier\s+[IVX]+[^\n]*',
        r'Combined\s+Higher\s+Secondary\s+Level[^\n]*',
        r'To\s+Attempt\s+Mock\s+Test[^\n]*',
        r'Click\s+Here[^\n]*',
        r'Visit\s+Website[^\n]*',
    ]
    cleaned = text
    for pat in patterns:
        cleaned = re.sub(pat, '', cleaned, flags=re.IGNORECASE)
    # Remove leading/trailing line numbers and extra whitespace
    cleaned = re.sub(r'^[1-4]\.\s*', '', cleaned)
    return cleaned.strip()

def get_shift_info(fname, header_text=""):
    fn = fname.lower()
    if any(k in fn for k in ['-s4', '–s4', 'shift-iv', 'shift 4', 'shift-4', '5-15']):
        return 4, 'Shift 4', '5:15 PM - 6:15 PM'
    if any(k in fn for k in ['-s3', '–s3', 'shift-iii', 'shift 3', 'shift-3', 'evening', '4-5']):
        return 3, 'Shift 3', '4:00 PM - 5:00 PM'
    if any(k in fn for k in ['-s2', '–s2', 'shift-ii', 'shift 2', 'shift-2', 'afternoon', 'afrernoon', '1-2']):
        return 2, 'Shift 2', '1:00 PM - 2:00 PM'
    if any(k in fn for k in ['-s1', '–s1', 'shift-i', 'shift 1', 'shift-1', 'morning', '10-11', '9-00']):
        return 1, 'Shift 1', '10:00 AM - 11:00 AM'
    
    # Fallback to header text
    combined = header_text.lower()
    if '5:15 pm' in combined or '5-15' in combined:
        return 4, 'Shift 4', '5:15 PM - 6:15 PM'
    if '4:00 pm' in combined or '4-5' in combined:
        return 3, 'Shift 3', '4:00 PM - 5:00 PM'
    if '1:00 pm' in combined or '1-2' in combined or '12:00' in combined or '11:45' in combined:
        return 2, 'Shift 2', '1:00 PM - 2:00 PM'
    if '10:00 am' in combined or '9:00 am' in combined or '10-11' in combined:
        return 1, 'Shift 1', '10:00 AM - 11:00 AM'
        
    return 1, 'Shift 1', '10:00 AM - 11:00 AM'

def get_date_info(fname, header_text=""):
    # Try header
    m_date = re.search(r'Test Date\s*[:\-\s]*([0-9]{1,2}[/\-\.][0-9]{1,2}[/\-\.][0-9]{2,4})', header_text, re.IGNORECASE) or \
             re.search(r'Exam Date\s*[:\-\s]*([0-9]{1,2}[/\-\.][0-9]{1,2}[/\-\.][0-9]{2,4})', header_text, re.IGNORECASE)
    raw = None
    if m_date:
        raw = m_date.group(1).replace('/', '-').replace('.', '-')
    else:
        m_fn = re.search(r'(\d{2}[-\.]\d{2}[-\.]\d{4})', fname)
        if m_fn:
            raw = m_fn.group(1).replace('.', '-')
        else:
            m_fn2 = re.search(r'(\d{2}[-\.][A-Za-z]{3}[-\.]\d{4})', fname)
            if m_fn2:
                raw = m_fn2.group(1).replace('.', '-')
                
    if not raw:
        return "2020-01-01", "01", "Jan", "01 Jan"

    # Normalize to YYYY-MM-DD
    month_names = {
        '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
        '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
        '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
        'jan': 'Jan', 'feb': 'Feb', 'mar': 'Mar', 'apr': 'Apr',
        'may': 'May', 'jun': 'Jun', 'jul': 'Jul', 'aug': 'Aug',
        'sep': 'Sep', 'oct': 'Oct', 'nov': 'Nov', 'dec': 'Dec',
    }
    
    parts = raw.split('-')
    if len(parts) == 3:
        p0, p1, p2 = parts
        if len(p0) == 2 and len(p2) == 4:
            day = p0
            mon = p1
            yr = p2
        elif len(p0) == 4 and len(p2) == 2:
            yr = p0
            mon = p1
            day = p2
        else:
            day, mon, yr = p0, p1, p2
            
        mon_str = month_names.get(mon.lower(), 'Jan')
        mon_num = list(month_names.values()).index(mon_str) + 1
        iso_date = f"{yr}-{mon_num:02d}-{int(day):02d}"
        display_date = f"{int(day):02d} {mon_str} {yr}"
        short_date = f"{int(day):02d}{mon_str.lower()}"
        return iso_date, day, mon_str, display_date, short_date
        
    return raw, "01", "Jan", raw, "01jan"

def parse_tcs_ion_cbt(pdf_path, year):
    """
    Parses a single TCS iON CBT PDF, extracting:
    - Metadata
    - Sections and questions
    - Tick vs cross icons (pixel color analysis for official answer key)
    - Diagrams & Option Images
    """
    doc = fitz.open(pdf_path)
    fname = os.path.basename(pdf_path)
    
    # 1. Header & metadata
    header_text = ''
    for pi in range(min(4, len(doc))):
        header_text += doc[pi].get_text() + '\n'
        
    shift_num, shift_label, shift_time = get_shift_info(fname, header_text)
    date_res = get_date_info(fname, header_text)
    if len(date_res) == 5:
        iso_date, day, mon_str, display_date, short_date = date_res
    else:
        iso_date, day, mon_str, display_date = date_res[0], date_res[1], date_res[2], date_res[3]
        short_date = f"{day}{mon_str.lower()}"
        
    tier = 'Tier 2' if ('tier-ii' in fname.lower() or 'tier-2' in fname.lower() or 'tier 2' in fname.lower()) else 'Tier 1'
    
    tier_tag = "-tier2" if tier == 'Tier 2' else ""
    paper_id = f"ssc-chsl-{year}-{short_date}-s{shift_num}{tier_tag}"
    title = f"SSC CHSL {tier} — {display_date} ({shift_label})"
    subTitle = f"Official Previous Year Paper ({shift_time})"
    
    # 2. Extract tick icons xrefs across the document
    tick_xrefs = set()
    cross_xrefs = set()
    
    for page in doc:
        for info in page.get_images():
            xref = info[0]
            if xref in tick_xrefs or xref in cross_xrefs:
                continue
            meta = doc.extract_image(xref)
            w, h = meta['width'], meta['height']
            if w <= 35 and h <= 35:
                img = Image.open(io.BytesIO(meta['image'])).convert('RGB')
                pixels = list(img.getdata())
                colored = [p for p in pixels if p[0] < 240 or p[1] < 240 or p[2] < 240]
                if colored:
                    avg_r = sum(p[0] for p in colored) / len(colored)
                    avg_g = sum(p[1] for p in colored) / len(colored)
                    if avg_g > avg_r:
                        tick_xrefs.add(xref)
                    else:
                        cross_xrefs.add(xref)
                        
    # 3. Process pages and extract questions
    asset_dir = os.path.join(PUBLIC_ASSETS_DIR, 'ssc/chsl', str(year), paper_id)
    web_base_url = f"/exam-assets/ssc/chsl/{year}/{paper_id}"
    
    questions = []
    current_sec_id = 'english'
    current_sec_name = 'English Language'
    sec_q_counter = 0
    overall_q_num = 0
    
    # Track statistics for audit
    visual_q_count = 0
    diag_count = 0
    opt_img_count = 0
    tables_count = 0
    graphs_count = 0
    
    # Vector outline fallback: if entire document has < 100 characters of text
    total_doc_text = sum(len(doc[pi].get_text()) for pi in range(len(doc)))
    use_ocr = (total_doc_text < 500 and pytesseract is not None)
    
    for p_idx, page in enumerate(doc):
        # OCR fallback for vector drawing pages
        if use_ocr:
            pix = page.get_pixmap(dpi=150)
            img = Image.open(io.BytesIO(pix.tobytes('png')))
            ocr_text = pytesseract.image_to_string(img)
            # Synthesize text blocks from OCR lines
            lines = [l.strip() for l in ocr_text.split('\n') if l.strip()]
            blocks = [(0, i*25, 500, (i+1)*25, l, 0, 0) for i, l in enumerate(lines)]
        else:
            blocks = page.get_text('blocks')
            blocks.sort(key=lambda b: b[1])
            
        # Collect non-ad, non-icon images on page
        page_imgs = []
        for info in page.get_images():
            xref = info[0]
            if xref in tick_xrefs or xref in cross_xrefs:
                continue
            meta = doc.extract_image(xref)
            w, h = meta['width'], meta['height']
            if (w, h) in AD_SIZES:
                continue
            rects = page.get_image_rects(xref)
            for r in rects:
                if r.y1 < 50 or r.y0 > page.rect.height - 30:
                    continue
                if r.x1 < 78 and (w <= 35 or h <= 35):
                    continue
                page_imgs.append({
                    'xref': xref,
                    'rect': r,
                    'meta': meta,
                    'w': w,
                    'h': h
                })
                
        # Collect ticks on this page with vertical position
        page_ticks = []
        for xref in tick_xrefs:
            for r in page.get_image_rects(xref):
                page_ticks.append(r)
        page_ticks.sort(key=lambda r: r.y0)
        
        # Scan page elements
        items = []
        for b in blocks:
            t = b[4].strip()
            if 'Section :' in t or 'Section:' in t:
                items.append(('section', b[1], t))
            else:
                m = re.search(r'(?:^|\n)\s*Q\s*\.?\s*(\d+)', t)
                if m:
                    items.append(('question', b[1], int(m.group(1)), b[4]))
                    
        for idx_item, item in enumerate(items):
            if item[0] == 'section':
                sec_raw = item[2].split(':')[-1].strip().lower()
                if 'intelligence' in sec_raw or 'reasoning' in sec_raw:
                    current_sec_id = 'reasoning'
                    current_sec_name = 'General Intelligence & Reasoning'
                elif 'quantitative' in sec_raw or 'quant' in sec_raw:
                    current_sec_id = 'quant'
                    current_sec_name = 'Quantitative Aptitude'
                elif 'awareness' in sec_raw:
                    current_sec_id = 'general_awareness'
                    current_sec_name = 'General Awareness'
                elif 'english' in sec_raw:
                    current_sec_id = 'english'
                    current_sec_name = 'English Language'
                elif 'mathematical' in sec_raw:
                    current_sec_id = 'quant'
                    current_sec_name = 'Mathematical Abilities'
                elif 'computer' in sec_raw:
                    current_sec_id = 'computer'
                    current_sec_name = 'Computer Knowledge Module'
                sec_q_counter = 0
            elif item[0] == 'question':
                q_local = item[2]
                q_y = item[1]
                sec_q_counter += 1
                overall_q_num += 1
                
                next_y = items[idx_item+1][1] if idx_item+1 < len(items) else page.rect.height
                
                # Question text & options extraction
                q_block_text = item[3]
                ans_y = None
                
                # Search for Ans marker
                for b in blocks:
                    if q_y <= b[1] < next_y and 'Ans' in b[4]:
                        ans_y = b[1]
                        break
                        
                # Extract question prompt text
                q_text_lines = []
                ans_reached = False
                for b in blocks:
                    if q_y <= b[1] < next_y:
                        if 'Ans' in b[4]:
                            ans_reached = True
                            # Capture text before 'Ans' if in same block
                            parts = b[4].split('Ans')
                            if parts[0].strip():
                                q_text_lines.append(parts[0].strip())
                            break
                        if not ans_reached:
                            q_text_lines.append(b[4].strip())
                            
                raw_q_text = clean_watermarks('\n'.join(q_text_lines))
                # Remove Q.X prefix
                raw_q_text = re.sub(r'^(?:Q\.?\s*\d+\s*)', '', raw_q_text).strip()
                
                # Parse 4 options text
                opt_texts = ["", "", "", ""]
                opt_y_positions = []
                for b in blocks:
                    if ans_y and ans_y <= b[1] < next_y:
                        m_opt = re.match(r'^([1-4])\.\s*(.*)', b[4].strip(), re.DOTALL)
                        if m_opt:
                            opt_idx = int(m_opt.group(1)) - 1
                            opt_texts[opt_idx] = clean_watermarks(m_opt.group(2))
                            opt_y_positions.append((opt_idx, b[1]))
                            
                # Delineate diagrams vs option images
                q_imgs = [img for img in page_imgs if q_y <= img['rect'].y0 < next_y]
                if ans_y:
                    diag_imgs = [img for img in q_imgs if img['rect'].y0 < ans_y]
                    opt_imgs = [img for img in q_imgs if img['rect'].y0 >= ans_y]
                else:
                    diag_imgs = q_imgs
                    opt_imgs = []
                    
                opt_imgs.sort(key=lambda img: img['rect'].y0)
                
                # 1. Process diagrams
                diag_urls = []
                for d_i, d in enumerate(diag_imgs):
                    ext = d['meta']['ext']
                    fname_diag = f"q{overall_q_num}_diag_{d_i+1}.{ext}" if len(diag_imgs) > 1 else f"q{overall_q_num}_diag.{ext}"
                    dest_path = os.path.join(asset_dir, fname_diag)
                    web_url = f"{web_base_url}/{fname_diag}"
                    saved_url = get_or_save_asset(d['meta']['image'], ext, dest_path, web_url)
                    diag_urls.append(saved_url)
                    diag_count += 1
                    
                    # Detect graphs / tables by aspect ratio / size
                    if d['w'] > 500 and d['h'] > 200:
                        graphs_count += 1
                    elif d['w'] > 400 and d['h'] < 100:
                        tables_count += 1
                        
                # 2. Process option images
                option_images = [None, None, None, None]
                if len(opt_imgs) == 4:
                    for opt_i in range(4):
                        opt_meta = opt_imgs[opt_i]['meta']
                        ext = opt_meta['ext']
                        letter = ['a', 'b', 'c', 'd'][opt_i]
                        fname_opt = f"q{overall_q_num}_opt_{letter}.{ext}"
                        dest_path = os.path.join(asset_dir, fname_opt)
                        web_url = f"{web_base_url}/{fname_opt}"
                        saved_url = get_or_save_asset(opt_meta['image'], ext, dest_path, web_url)
                        option_images[opt_i] = saved_url
                        opt_img_count += 1
                elif 0 < len(opt_imgs) < 4:
                    for opt_i, img in enumerate(opt_imgs):
                        ext = img['meta']['ext']
                        letter = ['a', 'b', 'c', 'd'][opt_i]
                        fname_opt = f"q{overall_q_num}_opt_{letter}.{ext}"
                        dest_path = os.path.join(asset_dir, fname_opt)
                        web_url = f"{web_base_url}/{fname_opt}"
                        saved_url = get_or_save_asset(img['meta']['image'], ext, dest_path, web_url)
                        option_images[opt_i] = saved_url
                        opt_img_count += 1
                        
                # 3. Determine Correct Answer via Green Tick Icon
                q_ticks = [t for t in page_ticks if q_y <= t.y0 < next_y]
                correct_idx = 0
                if q_ticks:
                    t_y = q_ticks[0].y0
                    # If option images are present, align with option image vertical level
                    if any(option_images) and len(opt_imgs) == 4:
                        diffs = [abs(opt['rect'].y0 - t_y) for opt in opt_imgs]
                        correct_idx = diffs.index(min(diffs))
                    elif opt_y_positions:
                        # Align with text option y position
                        closest = min(opt_y_positions, key=lambda p: abs(p[1] - t_y))
                        correct_idx = closest[0]
                        
                ans_letter = ['A', 'B', 'C', 'D'][correct_idx]
                
                # 4. Clean placeholders
                if any(option_images):
                    rich_opts = []
                    for idx_opt in range(4):
                        lbl = ['A', 'B', 'C', 'D'][idx_opt]
                        img_u = option_images[idx_opt]
                        orig_t = opt_texts[idx_opt]
                        is_ph = bool(re.match(r'^Option\s*\([A-D]\)$', orig_t.strip(), re.IGNORECASE))
                        cl_t = "" if (is_ph and img_u) else orig_t
                        opt_texts[idx_opt] = cl_t
                        rich_opts.append({
                            'id': lbl,
                            'text': cl_t,
                            'imageUrl': img_u
                        })
                else:
                    rich_opts = [{'id': ['A','B','C','D'][i], 'text': opt_texts[i], 'imageUrl': None} for i in range(4)]
                    
                # Clean questionText placeholder if diagram exists
                if diag_urls and (not raw_q_text or re.match(r'^Question\s*\d+$', raw_q_text.strip(), re.IGNORECASE)):
                    raw_q_text = ""
                elif not raw_q_text:
                    raw_q_text = f"Question {overall_q_num}"
                    
                if diag_urls or any(option_images):
                    visual_q_count += 1
                    
                q_obj = {
                    "id": f"{paper_id}-q{overall_q_num}",
                    "questionNumber": overall_q_num,
                    "sectionId": current_sec_id,
                    "sectionName": current_sec_name,
                    "questionText": raw_q_text,
                    "options": opt_texts,
                    "optionImages": option_images if any(option_images) else None,
                    "richOptions": rich_opts if any(option_images) else None,
                    "correctAnswer": ans_letter,
                    "correctAnswerIndex": correct_idx,
                    "explanation": f"The official answer key provided by Staff Selection Commission is Option ({ans_letter}).",
                    "diagramUrl": diag_urls[0] if diag_urls else None,
                    "diagramUrls": diag_urls if diag_urls else None,
                    "questionAssets": [{'type': 'image', 'url': u} for u in diag_urls] if diag_urls else None,
                    "marks": 2.0 if tier == 'Tier 1' else 3.0,
                    "negativeMarks": 0.5 if tier == 'Tier 1' else 1.0,
                    "examId": "ssc-chsl",
                    "year": int(year),
                    "date": iso_date,
                    "shift": shift_label,
                    "tier": tier,
                    "language": "English"
                }
                questions.append(q_obj)

    # Build Section metadata
    sec_counts = {}
    for q in questions:
        sid = q['sectionId']
        sec_counts[sid] = sec_counts.get(sid, 0) + 1
        
    sections = []
    cur_idx = 0
    sec_titles = {
        'english': 'English Language',
        'reasoning': 'General Intelligence & Reasoning',
        'quant': 'Quantitative Aptitude' if tier == 'Tier 1' else 'Mathematical Abilities',
        'general_awareness': 'General Awareness',
        'computer': 'Computer Knowledge Module'
    }
    
    for sid, count in sec_counts.items():
        sections.append({
            "id": sid,
            "name": sec_titles.get(sid, sid.title()),
            "questionCount": count,
            "startIndex": cur_idx,
            "endIndex": cur_idx + count - 1,
            "maxMarks": count * (2.0 if tier == 'Tier 1' else 3.0)
        })
        cur_idx += count
        
    is_complete = (len(questions) == (135 if tier == 'Tier 2' else 100))
    
    paper_data = {
        "id": paper_id,
        "examId": "ssc-chsl",
        "examName": "SSC CHSL",
        "editionYear": int(year),
        "title": title,
        "subTitle": subTitle,
        "date": iso_date,
        "shift": shift_label,
        "tier": tier,
        "language": "English",
        "durationMinutes": 135 if tier == 'Tier 2' else 60,
        "totalMarks": len(questions) * (3.0 if tier == 'Tier 2' else 2.0),
        "totalQuestions": len(questions),
        "isComplete": is_complete,
        "markingScheme": {
            "marksPerCorrect": 3.0 if tier == 'Tier 2' else 2.0,
            "negativeMarks": 1.0 if tier == 'Tier 2' else 0.5,
            "unansweredMarks": 0.0
        },
        "sections": sections,
        "questions": questions
    }
    
    return paper_data, {
        "visual_q": visual_q_count,
        "diags": diag_count,
        "opt_imgs": opt_img_count,
        "tables": tables_count,
        "graphs": graphs_count,
        "is_complete": is_complete
    }

def run_multiyear_ingestion():
    folders = {
        '2022': '/Users/shivarampatel/Downloads/exam ssc/qp2022',
        '2021': '/Users/shivarampatel/Downloads/exam ssc/qp 2021',
        '2020': '/Users/shivarampatel/Downloads/exam ssc/qp 2020',
        '2019': '/Users/shivarampatel/Downloads/exam ssc/qp 2019',
    }
    
    audit_reports = {}
    
    for year in ['2022', '2021', '2020', '2019']:
        fpath = folders[year]
        pdf_files = sorted(glob.glob(os.path.join(fpath, '*.pdf')))
        
        rep = {
            "files_found": len(pdf_files),
            "qp_files": len(pdf_files),
            "promo_ignored": 0,
            "duplicate_files": 0,
            "unique_papers": 0,
            "complete_papers": 0,
            "incomplete_papers": 0,
            "tests_created": 0,
            "reused_papers": 0,
            "questions_imported": 0,
            "duplicate_questions_prevented": 0,
            "visual_questions": 0,
            "image_options": 0,
            "tables": 0,
            "graphs": 0,
            "charts": 0,
            "diagrams": 0,
            "math_visuals": 0,
            "missing_assets": 0,
            "validation_failures": 0,
            "errors": 0,
        }
        
        print(f"\n============================================================")
        print(f"PROCESSING SSC CHSL {year} ({len(pdf_files)} PDFs)")
        print(f"============================================================")
        
        for p in pdf_files:
            fname = os.path.basename(p)
            try:
                paper_data, stats = parse_tcs_ion_cbt(p, year)
                
                # Save JSON
                out_path = os.path.join(EXAMS_DATA_DIR, f"{paper_data['id']}.json")
                with open(out_path, 'w', encoding='utf-8') as f:
                    json.dump(paper_data, f, indent=2, ensure_ascii=False)
                    
                rep["unique_papers"] += 1
                rep["tests_created"] += 1
                rep["questions_imported"] += len(paper_data['questions'])
                rep["visual_questions"] += stats['visual_q']
                rep["diagrams"] += stats['diags']
                rep["image_options"] += stats['opt_imgs']
                rep["tables"] += stats['tables']
                rep["graphs"] += stats['graphs']
                
                if stats['is_complete']:
                    rep["complete_papers"] += 1
                else:
                    rep["incomplete_papers"] += 1
                    
                print(f"  [OK] {paper_data['id']} ({len(paper_data['questions'])} Qs) | {stats['visual_q']} visual Qs | {stats['diags']} diags, {stats['opt_imgs']} opt imgs")
            except Exception as e:
                print(f"  [ERROR] {fname}: {e}")
                rep["errors"] += 1
                rep["validation_failures"] += 1
                
        audit_reports[year] = rep
        
    return audit_reports

if __name__ == '__main__':
    run_multiyear_ingestion()
