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
    # 2. Extract tick and cross icons xrefs across the document using color saturation
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
                sat_red = [p for p in pixels if p[0] > 120 and p[0] > p[1] + 30 and p[0] > p[2] + 30]
                sat_green = [p for p in pixels if p[1] > 120 and p[1] > p[0] + 30 and p[1] > p[2] + 30]
                if len(sat_green) > 20 and len(sat_green) > len(sat_red):
                    tick_xrefs.add(xref)
                elif len(sat_red) > 20 and len(sat_red) > len(sat_green):
                    cross_xrefs.add(xref)
                        
    # 3. Process pages and extract questions via cross-page stream
    asset_dir = os.path.join(PUBLIC_ASSETS_DIR, 'ssc/chsl', str(year), paper_id)
    web_base_url = f"/exam-assets/ssc/chsl/{year}/{paper_id}"
    
    # Collect all blocks, images, ticks across the entire document
    all_blocks = []
    all_images = []
    all_ticks = []
    
    for p_idx, page in enumerate(doc):
        for b in page.get_text('blocks'):
            all_blocks.append({
                'page': p_idx,
                'pos': (p_idx, b[1]),
                'bbox': b[:4],
                'text': b[4]
            })
            
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
                all_images.append({
                    'page': p_idx,
                    'pos': (p_idx, r.y0),
                    'rect': r,
                    'xref': xref,
                    'meta': meta,
                    'w': w,
                    'h': h
                })
                
        for xref in tick_xrefs:
            for r in page.get_image_rects(xref):
                all_ticks.append({
                    'page': p_idx,
                    'pos': (p_idx, r.y0),
                    'rect': r
                })

    # Markers for Sections and Questions
    markers = []
    for b in all_blocks:
        t = b['text'].strip()
        if 'Section :' in t or 'Section:' in t:
            markers.append({'type': 'section', 'pos': b['pos'], 'text': t})
        else:
            m = re.search(r'(?:^|\n)\s*Q\s*\.?\s*(\d+)', t)
            if m and b['bbox'][0] < 80:
                markers.append({'type': 'question', 'q_num': int(m.group(1)), 'pos': b['pos'], 'text': t})

    markers.sort(key=lambda m: m['pos'])

    questions = []
    current_sec_id = 'english'
    current_sec_name = 'English Language'
    overall_q_num = 0
    visual_q_count = 0
    diag_count = 0
    opt_img_count = 0
    tables_count = 0
    graphs_count = 0

    for idx, m in enumerate(markers):
        if m['type'] == 'section':
            sec_raw = m['text'].split(':')[-1].strip().lower()
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
            continue
            
        start_pos = m['pos']
        end_pos = markers[idx + 1]['pos'] if idx + 1 < len(markers) else (len(doc), 99999)
        overall_q_num += 1
        
        q_blocks = [b for b in all_blocks if start_pos <= b['pos'] < end_pos]
        q_imgs = [img for img in all_images if start_pos <= img['pos'] < end_pos]
        q_ticks = [t for t in all_ticks if start_pos <= t['pos'] < end_pos]
        
        # Ans marker
        ans_pos = None
        for b in q_blocks:
            if 'Ans' in b['text']:
                ans_pos = b['pos']
                break
                
        # Question prompt text
        prompt_parts = []
        for b in q_blocks:
            if ans_pos and b['pos'] >= ans_pos:
                if b['pos'] == ans_pos:
                    p = b['text'].split('Ans')[0].strip()
                    if p:
                        prompt_parts.append(p)
                break
            prompt_parts.append(b['text'].strip())
            
        raw_q_text = clean_watermarks('\n'.join(prompt_parts))
        raw_q_text = re.sub(r'^(?:Q\.?\s*\d+\s*)', '', raw_q_text).strip()
        
        # Split diagrams vs option images
        if ans_pos:
            diag_imgs = [img for img in q_imgs if img['pos'] < ans_pos]
            opt_imgs = [img for img in q_imgs if img['pos'] >= ans_pos]
        else:
            diag_imgs = q_imgs
            opt_imgs = []
            
        opt_imgs.sort(key=lambda img: img['pos'])
        
        # Option texts
        opt_texts = ["", "", "", ""]
        opt_positions = {}
        for b in q_blocks:
            if ans_pos and b['pos'] >= ans_pos:
                matches = list(re.finditer(r'(?:^|\n)\s*([1-4])\.\s*(.*?)(?=\n\s*[1-4]\.|\n\s*Question ID|\n\s*Status|\n\s*Chosen Option|$)', b['text'], re.DOTALL))
                for om in matches:
                    opt_idx = int(om.group(1)) - 1
                    val = clean_watermarks(om.group(2).strip())
                    opt_texts[opt_idx] = val
                    opt_positions[opt_idx] = b['pos']

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
            if d['w'] > 500 and d['h'] > 200:
                graphs_count += 1
            elif d['w'] > 400 and d['h'] < 100:
                tables_count += 1

        # 2. Process option images and align by vertical coordinate
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
            for opt_img in opt_imgs:
                best_i = None
                best_dist = 999999
                for i in range(4):
                    if i in opt_positions:
                        dist = abs(opt_img['pos'][0] - opt_positions[i][0]) * 10000 + abs(opt_img['pos'][1] - opt_positions[i][1])
                        if dist < best_dist:
                            best_dist = dist
                            best_i = i
                if best_i is None or option_images[best_i] is not None:
                    for i in range(4):
                        if option_images[i] is None:
                            best_i = i
                            break
                if best_i is not None:
                    opt_meta = opt_img['meta']
                    ext = opt_meta['ext']
                    letter = ['a', 'b', 'c', 'd'][best_i]
                    fname_opt = f"q{overall_q_num}_opt_{letter}.{ext}"
                    dest_path = os.path.join(asset_dir, fname_opt)
                    web_url = f"{web_base_url}/{fname_opt}"
                    saved_url = get_or_save_asset(opt_meta['image'], ext, dest_path, web_url)
                    option_images[best_i] = saved_url
                    opt_img_count += 1

        # OCR fallback for small text/number images
        if pytesseract:
            for i in range(4):
                if not opt_texts[i] and option_images[i]:
                    for img in opt_imgs:
                        m_meta = img['meta']
                        if m_meta['width'] <= 160 and m_meta['height'] <= 60:
                            try:
                                pil_im = Image.open(io.BytesIO(m_meta['image'])).convert('RGB')
                                pil_im_lg = pil_im.resize((pil_im.width * 4, pil_im.height * 4), Image.Resampling.LANCZOS)
                                ocr_res = pytesseract.image_to_string(pil_im_lg, config='--psm 7').strip()
                                if ocr_res and not opt_texts[i]:
                                    opt_texts[i] = ocr_res
                                    break
                            except Exception:
                                pass

        # 3. Determine Correct Answer via Green Tick Icon
        correct_idx = 0
        if q_ticks:
            t_pos = q_ticks[0]['pos']
            if any(option_images) and len(opt_imgs) == 4:
                diffs = [abs(opt['pos'][0] - t_pos[0]) * 10000 + abs(opt['pos'][1] - t_pos[1]) for opt in opt_imgs]
                correct_idx = diffs.index(min(diffs))
            elif opt_positions:
                closest = min(opt_positions.items(), key=lambda p: abs(p[1][0] - t_pos[0]) * 10000 + abs(p[1][1] - t_pos[1]))
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
        '2024': '/Users/shivarampatel/Downloads/exam ssc/qp 2024',
        '2023': '/Users/shivarampatel/Downloads/exam ssc/qp 2023',
        '2022': '/Users/shivarampatel/Downloads/exam ssc/qp2022',
        '2021': '/Users/shivarampatel/Downloads/exam ssc/qp 2021',
        '2020': '/Users/shivarampatel/Downloads/exam ssc/qp 2020',
        '2019': '/Users/shivarampatel/Downloads/exam ssc/qp 2019',
    }
    
    audit_reports = {}
    
    for year in ['2024', '2023', '2022', '2021', '2020', '2019']:
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
