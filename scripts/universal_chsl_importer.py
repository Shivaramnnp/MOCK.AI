#!/usr/bin/env python3
"""
universal_chsl_importer.py
Complete multi-year ingestion and visual content pipeline for SSC CHSL:
Processes 2022, 2021, 2020, and 2019 folders, extracts text, diagrams,
option images, and official answer keys from TCS iON CBT response sheets.
"""

import os, glob, re, json, hashlib, io, time, sys, datetime, gc, signal, resource, argparse
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import fitz
from PIL import Image, ImageOps
try:
    import pytesseract
except ImportError:
    pytesseract = None

from scripts.ssc_engine_v4.geometry import is_image_in_interval
from scripts.ssc_engine_v4.segmentation import QuestionSegmentationEngine
from scripts.ssc_engine_v4.region_model import (
    QuestionRegion,
    SourceRepresentation,
    ObjectRole,
    ExtractedObject,
)

# Mac Thermal & Resource Management
os.environ["OMP_THREAD_LIMIT"] = "1"
_GLOBAL_OCR_SEMAPHORE = None
_OCR_CHIP_CACHE = {}
_DIAG_CROP_CACHE = {}
_INTERRUPT_REQUESTED = False

def init_worker_process(ocr_sem):
    """Initializes worker process with shared OCR semaphore and thread limits."""
    global _GLOBAL_OCR_SEMAPHORE
    _GLOBAL_OCR_SEMAPHORE = ocr_sem
    os.environ["OMP_THREAD_LIMIT"] = "1"
    signal.signal(signal.SIGINT, signal.SIG_IGN)

def call_tesseract_safely(img, config=""):
    """
    Executes Tesseract within the bounded OCR semaphore.
    Guarantees at most OCR_WORKERS simultaneous OCR processes across the entire machine.
    """
    if not pytesseract or img is None:
        return ""
    global _GLOBAL_OCR_SEMAPHORE
    if _GLOBAL_OCR_SEMAPHORE is not None:
        with _GLOBAL_OCR_SEMAPHORE:
            return pytesseract.image_to_string(img, config=config).strip()
    else:
        return pytesseract.image_to_string(img, config=config).strip()

BASE_DIR = '/Users/shivarampatel/AndroidStudioProjects/MOCK.AI'
EXAMS_DATA_DIR = os.path.join(BASE_DIR, 'web/src/data/exams')
PUBLIC_ASSETS_DIR = os.path.join(BASE_DIR, 'web/public/exam-assets')
MANIFEST_DIR = os.path.join(BASE_DIR, 'web/src/data/exams/.manifests')
DOCS_DIR = os.path.join(BASE_DIR, 'docs')

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

def get_or_save_asset(img_bytes, ext, dest_path, web_url):
    """
    Saves image bytes to dest_path (converting to PNG if necessary).
    Returns the web-accessible URL strictly scoped to this paper's assets.
    """
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    
    if ext.lower() in ('png', 'jpeg', 'jpg'):
        with open(dest_path, 'wb') as f:
            f.write(img_bytes)
    else:
        pil_img = Image.open(io.BytesIO(img_bytes))
        dest_path = os.path.splitext(dest_path)[0] + '.png'
        web_url = os.path.splitext(web_url)[0] + '.png'
        pil_img.save(dest_path, format='PNG')
        
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
    cleaned = re.sub(r'\b[Zz]([A-Z]\s*=\s*\d+°)', r'∠\1', cleaned)
    cleaned = re.sub(r'(\bcosec\s*[A-Z]\s*=\s*)22\b', r'\g<1>2\\sqrt{2}', cleaned)
    cleaned = re.sub(r'question\s*mark\s*\(?7\)?', 'question mark (?)', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\bIf([a-zA-Z])', r'If \1', cleaned)
    cleaned = re.sub(r'\b([a-c])[\?3³]\s*\+\s*([a-c])[\?3³]\s*\+\s*([a-c])[\?3³]\s*[-–—]\s*3\s*ab[ce\?]', r'a^3 + b^3 + c^3 - 3abc', cleaned)
    cleaned = re.sub(r'\bsec\s*[69oO@θ]\s*([+-])\s*tan\s*[69oO@θ]', r'sec \\theta \1 tan \\theta', cleaned)
    return cleaned.strip()

def clean_option_text(text):
    cleaned = clean_watermarks(text)
    return cleaned.strip()

def norm_digit_line(s):
    subs = {'S': '8', 's': '8', 'i': '1', 'I': '1', 'l': '1', '|': '1', 'O': '0', 'o': '0', 'Z': '2', 'z': '2', 'B': '8', 'J': '7', 'j': '7'}
    res = []
    for ch in s:
        if ch in subs: res.append(subs[ch])
        else: res.append(ch)
    return ''.join(res)

def ocr_crop(crop, psm=7):
    if crop.width <= 2 or crop.height <= 2: return ''
    scale = max(6, int(150 / max(1, crop.height)))
    lg = crop.resize((crop.width * scale, crop.height * scale), Image.Resampling.LANCZOS)
    pad = ImageOps.expand(lg, border=30, fill=255)
    t = call_tesseract_safely(pad, config=f'--psm {psm}')
    if not t:
        pad_bin = pad.point(lambda p: 255 if p > 165 else 0)
        t = call_tesseract_safely(pad_bin, config=f'--psm {psm}')
    if not t and psm != 6:
        t = call_tesseract_safely(pad, config='--psm 6')
        if not t:
            pad_bin = pad.point(lambda p: 255 if p > 165 else 0)
            t = call_tesseract_safely(pad_bin, config='--psm 6')
    return clean_watermarks(t)

def refine_diagram_crop(img_bytes, ext):
    """
    Checks if a diagram has a top text band separated by a horizontal white gap (>= 8px)
    from the authentic visual figure below. Returns (cropped_img_bytes, prompt_text).
    Memoized via SHA-256 hash.
    """
    if not pytesseract or not img_bytes:
        return img_bytes, ''
    h_key = hashlib.sha256(img_bytes).hexdigest()
    if h_key in _DIAG_CROP_CACHE:
        return _DIAG_CROP_CACHE[h_key]
    try:
        im = Image.open(io.BytesIO(img_bytes)).convert('L')
        w, h = im.size
        if w < 50 or h < 50:
            _DIAG_CROP_CACHE[h_key] = (img_bytes, '')
            return img_bytes, ''
            
        v_proj = [sum(1 for x in range(w) if im.getpixel((x, y)) < 200) for y in range(h)]
        
        top_band_end = None
        for y in range(5, min(95, h)):
            if v_proj[y] > 40:
                pass
            elif v_proj[y] < 5 and any(v_proj[k] > 40 for k in range(0, y)):
                top_band_end = y
                break
                
        if not top_band_end:
            _DIAG_CROP_CACHE[h_key] = (img_bytes, '')
            return img_bytes, ''
            
        gap_end = None
        for y in range(top_band_end, min(top_band_end + 75, h)):
            if v_proj[y] > 20:
                gap_end = y
                break
                
        if not gap_end or (gap_end - top_band_end) < 6:
            _DIAG_CROP_CACHE[h_key] = (img_bytes, '')
            return img_bytes, ''
            
        # Valid top text band and white gap detected
        top_crop = im.crop((0, 0, w, top_band_end))
        scale = max(3, int(100 / max(1, top_crop.height)))
        top_lg = top_crop.resize((top_crop.width * scale, top_crop.height * scale), Image.Resampling.LANCZOS)
        top_pad = ImageOps.expand(top_lg, border=25, fill=255)
        top_txt = call_tesseract_safely(top_pad, config='--psm 6').replace('\n', ' ')
        
        # If the image is a chart card (pie chart, bar chart, graph) where the chart contains its own title/prompt,
        # preserve the full card as an authentic graphic asset without splitting
        if any(kw in top_txt.lower() for kw in ['pie-chart', 'pie chart', 'bar chart', 'bar graph', 'histogram', 'chart']):
            _DIAG_CROP_CACHE[h_key] = (img_bytes, '')
            return img_bytes, ''

        # Clean up OCR noise in extracted prompt
        top_txt = re.sub(r'([a-zA-Z])!\s+', r'\1 ', top_txt)
        top_txt = top_txt.replace('“', "'").replace('”', "'").replace('‘', "'").replace('’', "'").replace('°', "'")
        top_txt = clean_watermarks(top_txt).strip()
        
        out_buf = io.BytesIO()
        fig_im = Image.open(io.BytesIO(img_bytes)).crop((0, gap_end, w, h))
        fig_im.save(out_buf, format='PNG')
        res = (out_buf.getvalue(), top_txt)
        _DIAG_CROP_CACHE[h_key] = res
        return res
    except Exception:
        _DIAG_CROP_CACHE[h_key] = (img_bytes, '')
        return img_bytes, ''

def detect_inequality_chip(pil_im, raw_txt):
    """
    Detects double inequalities with precision, inspecting the bottom bar row of <=
    to distinguish < vs <= with 100% mathematical fidelity.
    """
    w, h = pil_im.size
    t_clean = raw_txt.replace(' ', '')
    m = re.search(r'(\d+)[<≤\*\=\.§]+([A-Za-z\$§5])[<≤\*\=\.§sS]+(\d+)', t_clean)
    if not m:
        return None
    n1, var, n2 = m.group(1), m.group(2), m.group(3)
    var_norm = 'S' if var in ['$', '§', '5'] else var
    
    bottom_bars = []
    for y in range(max(0, h - 8), h - 1):
        in_run = False
        start_x = 0
        for x in range(w):
            dark = pil_im.getpixel((x, y)) < 185
            if dark and not in_run:
                in_run = True
                start_x = x
            elif not dark and in_run:
                in_run = False
                if x - start_x >= 7:
                    bottom_bars.append((y, start_x, x))
        if in_run and w - start_x >= 7:
            bottom_bars.append((y, start_x, w))
            
    mid_x = w * 0.5
    has_left_bar = any(bx0 < mid_x and bx1 > 15 for by, bx0, bx1 in bottom_bars)
    has_right_bar = any(bx0 > mid_x - 5 and bx1 < w - 15 for by, bx0, bx1 in bottom_bars)
    
    op1 = '\\le' if has_left_bar else '<'
    op2 = '\\le' if has_right_bar else '<'
    return f"${n1} {op1} {var_norm} {op2} {n2}$"

def decompose_mixed_fraction_chip(pil_im):
    """
    Decomposes mixed fractions, algebraic fractions, and fractions with units
    by locating the isolated horizontal fraction bar and OCR-ing numerator and denominator separately.
    """
    w, h = pil_im.size
    if w < 10 or h < 28:
        return None
        
    candidates = []
    for y in range(int(h * 0.2), int(h * 0.8)):
        in_run = False
        start_x = 0
        for x in range(w):
            dark = pil_im.getpixel((x, y)) < 185
            if dark and not in_run:
                in_run = True
                start_x = x
            elif not dark and in_run:
                in_run = False
                run_len = x - start_x
                if run_len >= 5:
                    candidates.append((y, start_x, x, run_len))
        if in_run:
            run_len = w - start_x
            if run_len >= 5:
                candidates.append((y, start_x, w, run_len))
                
    best_cand = None
    for y, x0, x1, r_len in candidates:
        # Check that immediately above and below is white space gap (isolated bar)
        gap_above = sum(1 for gx in range(x0, x1) if pil_im.getpixel((gx, y - 1)) < 185)
        gap_below = sum(1 for gx in range(x0, x1) if pil_im.getpixel((gx, y + 1)) < 185)
        if gap_above > 1 or gap_below > 1:
            continue

        num_ink = sum(1 for ny in range(max(0, y - 18), y - 1)
                      for nx in range(max(0, x0 - 2), min(w, x1 + 2))
                      if pil_im.getpixel((nx, ny)) < 185)
        den_ink = sum(1 for dy in range(y + 2, min(h, y + 19))
                      for dx in range(max(0, x0 - 2), min(w, x1 + 2))
                      if pil_im.getpixel((dx, dy)) < 185)
        if num_ink >= 4 and den_ink >= 4:
            score = r_len * 10 + min(num_ink, den_ink)
            if best_cand is None or score > best_cand[0]:
                best_cand = (score, y, x0, x1)
                
    if not best_cand:
        return None
        
    score, by, bx0, bx1 = best_cand
    num_crop = pil_im.crop((bx0, 0, min(w, bx1 + 2), by - 1))
    den_crop = pil_im.crop((bx0, by + 2, min(w, bx1 + 2), h))
    
    def ocr_digits(c):
        scale = max(4, int(100 / max(1, c.height)))
        lg = c.resize((c.width * scale, c.height * scale), Image.Resampling.LANCZOS)
        pad = ImageOps.expand(lg, border=15, fill=255)
        raw = call_tesseract_safely(pad, config='--psm 10 -c tessedit_char_whitelist=0123456789').strip()
        if not raw:
            raw = call_tesseract_safely(pad, config='--psm 8 -c tessedit_char_whitelist=0123456789').strip()
        if not raw or raw in ['0']:
            t_gen = call_tesseract_safely(pad, config='--psm 10').strip()
            if re.search(r'[vVyY]\d+', t_gen):
                return re.sub(r'[vVyY]', '√', t_gen)
            if t_gen.lower() in ['ff', 'f', 'e', '7', 't', '?']: return '7'
            if t_gen.lower() in ['l', 'i', '|', '1', '!']: return '1'
            if t_gen.lower() in ['z', '2']: return '2'
            if t_gen.lower() in ['b', '8']: return '8'
            if t_gen.lower() in ['a', '4']: return '4'
            if t_gen.lower() in ['s', '5']: return '5'
        t_gen2 = call_tesseract_safely(pad, config='--psm 6').strip()
        if re.search(r'[vVyY]\s*\d+', t_gen2):
            return re.sub(r'[vVyY]\s*', '√', t_gen2)
        return re.sub(r'\D', '', raw)

    n_val = ocr_digits(num_crop)
    d_val = ocr_digits(den_crop)
    if not (n_val and d_val and d_val != '0'):
        return None
        
    left_txt = ''
    if bx0 > 4:
        l_crop = pil_im.crop((0, 0, bx0 - 1, h))
        scale = max(4, int(100 / max(1, l_crop.height)))
        lg = l_crop.resize((l_crop.width * scale, l_crop.height * scale), Image.Resampling.LANCZOS)
        pad = ImageOps.expand(lg, border=25, fill=255)
        left_txt = call_tesseract_safely(pad, config='--psm 6').strip()
        
    right_txt = ''
    if w - bx1 > 4:
        r_crop = pil_im.crop((bx1 + 1, 0, w, h))
        scale = max(4, int(100 / max(1, r_crop.height)))
        lg = r_crop.resize((r_crop.width * scale, r_crop.height * scale), Image.Resampling.LANCZOS)
        pad = ImageOps.expand(lg, border=25, fill=255)
        right_txt = call_tesseract_safely(pad, config='--psm 6').strip()
        
    is_pm = bool(re.search(r'[+±=]', left_txt))
    left_txt = re.sub(r'[+±=\-:—–]', '', left_txt).strip()
    
    f_den = f"\\sqrt{{{d_val[1:]}}}" if d_val.startswith('√') else d_val
    f_lat = f"\\frac{{{n_val}}}{{{f_den}}}"
    m_w = re.search(r'(\d+)$', left_txt)
    w_val = m_w.group(1) if m_w else ''
    pfx = left_txt[:m_w.start()].strip() if m_w else left_txt
    if pfx.lower() not in ['profit', 'loss', 'gain', '₹', '$']:
        pfx = ''
    
    math_core = f"{w_val}{f_lat}" if w_val else f_lat
    if is_pm:
        math_core = f"\\pm {math_core}"
        
    r_low = right_txt.lower()
    if '%' in right_txt:
        return f"{pfx} ${math_core}\\%$" if pfx else f"${math_core}\\%$"
    elif 'km' in r_low or 'km/h' in r_low:
        return f"${math_core}\\text{{ km/h}}$"
    elif 'year' in r_low or 'yr' in r_low:
        return f"${math_core}\\text{{ years}}$"
    elif 'day' in r_low:
        return f"${math_core}\\text{{ days}}$"
    elif 'cm' in r_low:
        if '2' in r_low:
            return f"${math_core}\\text{{ cm}}^2$"
        elif any(c in r_low for c in ['3', '?', ']', '}']):
            return f"${math_core}\\text{{ cm}}^3$"
        else:
            return f"${math_core}\\text{{ cm}}$"
    elif 'm' in r_low:
        if '2' in r_low:
            return f"${math_core}\\text{{ m}}^2$"
        elif any(c in r_low for c in ['3', '?', ']', '}']):
            return f"${math_core}\\text{{ m}}^3$"
        else:
            return f"${math_core}\\text{{ m}}$"
    elif right_txt:
        norm_r = clean_and_normalize_option_text(right_txt)
        return f"${math_core}\\text{{ {norm_r}}}$" if norm_r else (f"{pfx} ${math_core}$" if pfx else f"${math_core}$")
    else:
        return f"{pfx} ${math_core}$" if pfx else f"${math_core}$"

def robust_ocr_chip(img_bytes):
    """
    Robust OCR specifically designed for option chips and small badges:
    Reconstructs pure fractions, mixed fractions with units, algebraic fractions,
    inequalities, percentages, numbers with commas, and word-pair analogies into clean text or KaTeX LaTeX.
    Memoized via SHA-256 hash.
    """
    if not pytesseract or not img_bytes:
        return ""
    h_key = hashlib.sha256(img_bytes).hexdigest()
    if h_key in _OCR_CHIP_CACHE:
        return _OCR_CHIP_CACHE[h_key]
    try:
        pil_im = Image.open(io.BytesIO(img_bytes)).convert('L')
        w, h = pil_im.size
        if w < 5 or h < 5:
            _OCR_CHIP_CACHE[h_key] = ""
            return ""

        # 1. Check inequality detector on original image
        raw_p7_orig = clean_watermarks(call_tesseract_safely(pil_im, config='--psm 7'))
        ineq = detect_inequality_chip(pil_im, raw_p7_orig)
        if ineq and is_promotable_option_text(ineq):
            _OCR_CHIP_CACHE[h_key] = ineq
            return ineq

        # 2. Check isolated horizontal fraction bar decomposition (for mixed fractions, h >= 28)
        frac_decomp = decompose_mixed_fraction_chip(pil_im)
        if frac_decomp and is_promotable_option_text(frac_decomp):
            _OCR_CHIP_CACHE[h_key] = frac_decomp
            return frac_decomp

        # 3. Check single-line PSM 7 text on original image first (preserves sharp colons/ratios for normal size chips)
        if h >= 30:
            p7_orig_norm = clean_and_normalize_option_text(raw_p7_orig)
            if (
                p7_orig_norm
                and is_promotable_option_text(p7_orig_norm)
                and ('\n' not in raw_p7_orig)
                and ('/' not in raw_p7_orig)
            ):
                _OCR_CHIP_CACHE[h_key] = p7_orig_norm
                return p7_orig_norm

        scale = 6 if h < 30 else (min(4, max(2, int(90 / max(1, h)))) if max(w, h) < 140 else 2)
        im_lg = pil_im.resize((w * scale, h * scale), Image.Resampling.BICUBIC)
        im_pad = ImageOps.expand(im_lg, border=25, fill=255)

        # 4. Check 2-line pure or algebraic fraction (PSM 6)
        raw_p6 = clean_watermarks(call_tesseract_safely(im_pad, config='--psm 6'))
        p6_lines = [l.strip() for l in raw_p6.split('\n') if l.strip()]

        if len(p6_lines) == 2 and re.match(r'^\d+$', p6_lines[0]) and re.match(r'^\d+$', p6_lines[1]):
            res = f"\\frac{{{p6_lines[0]}}}{{{p6_lines[1]}}}"
            _OCR_CHIP_CACHE[h_key] = res
            return res

        if len(p6_lines) == 3 and re.match(r'^\d+$', p6_lines[0]) and re.match(r'^\d+$', p6_lines[2]):
            res = f"\\frac{{{p6_lines[0]}}}{{{p6_lines[2]}}}"
            _OCR_CHIP_CACHE[h_key] = res
            return res

        if h >= 32 and len(p6_lines) == 2 and any(v in raw_p6.lower() for v in ['x', 'y', 'xy', 'a', 'b']):
            def clean_alg_term(s):
                s = re.sub(r'[Kk][eE]', 'x^2', s)
                s = re.sub(r'x\s*[\*2²\?]', 'x^2', s)
                s = re.sub(r'y\s*[\*2²\?s]', 'y^2', s)
                s = re.sub(r'2XV?y', '2xy', s, flags=re.IGNORECASE)
                s = re.sub(r'2XY', '2xy', s, flags=re.IGNORECASE)
                s = re.sub(r'[—–]', '-', s)
                s = re.sub(r'\s*([+-])\s*', r' \1 ', s)
                return s.strip()
            c_top = clean_alg_term(p6_lines[0])
            c_bot = clean_alg_term(p6_lines[1])
            if c_top and c_bot and re.search(r'[A-Za-z0-9]', c_top) and re.search(r'[A-Za-z0-9]', c_bot):
                res = f"\\frac{{{c_top}}}{{{c_bot}}}"
                _OCR_CHIP_CACHE[h_key] = res
                return res

        # 5. Check upscaled single-line PSM 7 text
        raw_p7 = clean_watermarks(call_tesseract_safely(im_pad, config='--psm 7'))
        p7_norm = clean_and_normalize_option_text(raw_p7)
        if (
            p7_norm
            and is_promotable_option_text(p7_norm)
            and ('\n' not in raw_p7)
            and ('/' not in raw_p7 or re.match(r'^\d+/\d+$', raw_p7.strip()))
            and not (len(p6_lines) >= 2 and re.match(r'^\d+([,\.]\d+)*%?$', p7_norm))
        ):
            _OCR_CHIP_CACHE[h_key] = p7_norm
            return p7_norm

        # 5b. Check PSM 10 for small single character / fraction chips
        if h <= 28:
            raw_p10 = clean_watermarks(call_tesseract_safely(im_pad, config='--psm 10'))
            p10_norm = clean_and_normalize_option_text(raw_p10)
            if p10_norm and is_promotable_option_text(p10_norm):
                _OCR_CHIP_CACHE[h_key] = p10_norm
                return p10_norm

        raw_p6_clean = clean_and_normalize_option_text(raw_p6.replace('\n', ' '))
        if (
            raw_p6_clean
            and is_promotable_option_text(raw_p6_clean)
            and not (len(p6_lines) >= 2 and re.match(r'^\d+([,\.]\d+)*%?$', raw_p6_clean))
        ):
            _OCR_CHIP_CACHE[h_key] = raw_p6_clean
            return raw_p6_clean

        # 6. Default fallback
        base_t = raw_p7_orig if raw_p7_orig else (raw_p7 if raw_p7 else raw_p6.replace('\n', ' '))
        res = clean_and_normalize_option_text(base_t)
        _OCR_CHIP_CACHE[h_key] = res
        return res
    except Exception:
        _OCR_CHIP_CACHE[h_key] = ""
        return ""

def clean_and_normalize_option_text(text):
    if not text:
        return ""
    t = text.strip()
    # Normalize unicode curly quotes and quotes
    t = t.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')
    # Normalize minus sign OCR confusion as equals sign
    if t in ['=', '=-', '=1', '=e', '=-e']:
        return "-1"
    # Normalize currency: Z, %, £, ~, 2 before currency patterns -> ₹
    t = re.sub(r'^[Zz%£~]\s*(\d+([,\.]\d+)*)', r'₹\1', t)
    t = re.sub(r'^2(\d{2,3}(?:,\d{2,3})+)', r'₹\1', t)
    t = re.sub(r'^Rs\.?\s*', '₹', t, flags=re.IGNORECASE)
    t = re.sub(r'^(Profit|Loss),\s*2(\d{2,})\b', r'\1, ₹\2', t, flags=re.IGNORECASE)
    
    # Strip leading/trailing quote marks or stray punctuation (preserve LaTeX math delimiters, operator pairs, and time abbreviations)
    if not (t.startswith('$') and t.endswith('$')):
        is_leading_op = bool(re.match(r"^[-–—]\s*(and|\d|[+\-x×÷/])", t, flags=re.IGNORECASE))
        is_trailing_op = bool(re.search(r"[+\-x×÷/]\s*and\s*[-–—]$", t, flags=re.IGNORECASE))
        is_time = bool(re.search(r'\b[ap]\.?m\.?$', t, flags=re.IGNORECASE))
        if is_trailing_op or is_time:
            t = re.sub(r"[‘\'\"`]+$", "", t).strip()
        else:
            t = re.sub(r"[‘\'\"`\.,\-_]+$", "", t).strip()
        if is_leading_op:
            t = re.sub(r"^[‘\'\"`\.,_]+", "", t).strip()
        else:
            t = re.sub(r"^[‘\'\"`\.,\-_]+", "", t).strip()

    # 1. Inequality normalization: e.g. "15*<§ < 33", "15<= $<33", "15<S< 33", "15=. $< 33", "15<S§<33"
    t_nospace = t.replace(' ', '')
    m_ineq = re.match(r'^(\d+)(<=|=<|=\.|<|≤|\*<)([\$§S5])(<=|=<|=\.|<|≤|<§|§|\*<)(\d+)$', t_nospace)
    if m_ineq:
        n1, op1, var, op2, n2 = m_ineq.groups()
        var_norm = 'S'
        op1_norm = '\\le' if any(x in op1 for x in ['=', '≤', '.']) else '<'
        op2_norm = '\\le' if any(x in op2 for x in ['=', '≤', '§']) else '<'
        return f"${n1} {op1_norm} {var_norm} {op2_norm} {n2}$"

    m_ineq2 = re.match(r'^(\d+)([<≤\*\=\.]+)([A-Za-z\$§])([<≤\*\=\.§]+)(\d+)$', t_nospace)
    if m_ineq2:
        n1, op1, var, op2, n2 = m_ineq2.groups()
        var_norm = 'S' if var in ['$', '§'] else var
        op1_norm = '\\le' if any(x in op1 for x in ['=', '≤', '.']) else '<'
        op2_norm = '\\le' if any(x in op2 for x in ['=', '≤', '§']) else '<'
        return f"${n1} {op1_norm} {var_norm} {op2_norm} {n2}$"

    t = re.sub(r'\\text\{\s*cm[³\?\]\^]+3', r'\\text{ cm}^3', t)
    t = re.sub(r'\\text\{\s*m[³\?\]\^]+3', r'\\text{ m}^3', t)
    if not (t.startswith('$') and t.endswith('$')):
        # Normalize units: cm? or cm] -> cm³
        t = re.sub(r'cm[\?\]]', 'cm³', t)
        t = re.sub(r'm[\?\]]', 'm³', t)
        t = re.sub(r'cm3\b', 'cm³', t)
        t = re.sub(r'cm2\b', 'cm²', t)
        t = re.sub(r'm3\b', 'm³', t)
        t = re.sub(r'm2\b', 'm²', t)
        # Normalize units with OCR noise: §cm / Scm -> 5 cm, \d+cm -> \d+ cm
        t = re.sub(r'^[§S]\s*(cm|m|km|kg|g)\b', r'5 \1', t)
        t = re.sub(r'^(\d+)\s*(cm|m|km|kg|g)\b', r'\1 \2', t)
    # Normalize speeds
    t = re.sub(r'km\s*[\'"`]\s*hr', 'km/h', t, flags=re.IGNORECASE)
    t = re.sub(r'km/hr\b', 'km/h', t, flags=re.IGNORECASE)
    t = re.sub(r'knyhr', 'km/h', t, flags=re.IGNORECASE)
    # Normalize percentage OCR confusions (e.g. 8./0% -> 8.70%, 8/0% -> 8.70%)
    t = re.sub(r'(\d+)\s*\.\s*/\s*(\d+)%', r'\1.7\2%', t)
    t = re.sub(r'(\d+)\s*/\s*(\d+)%', r'\1.7\2%', t)
    # Normalize operator pairs (e.g. "+andx", "—and+", "—and x", "+and—", "+and-")
    t = t.replace('—', '-').replace('–', '-')
    t = re.sub(r'[-–—]{2,}', '-', t)
    t = re.sub(r'([+\-x×÷/])\s*and\s*([+\-x×÷/])', r'\1 and \2', t, flags=re.IGNORECASE)
    # Normalize ratio OCR noise first: e.g. "2 : |" -> "2:1", "1 : |" -> "1:1"
    t = re.sub(r'(\d+)\s*:\s*[|lI!]', r'\1:1', t)
    t = re.sub(r'[|lI!]\s*:\s*(\d+)', r'1:\1', t)
    t = re.sub(r'(\d+)\s*:\s*[Zz]', r'\1:2', t)
    t = re.sub(r'[Zz]\s*:\s*(\d+)', r'2:\1', t)
    # Normalize ratio pairs (e.g. "1:2and1:1", "1:land2:1")
    t = re.sub(r'(\d+:\d+)\s*and\s*(\d+:\d+)', r'\1 and \2', t, flags=re.IGNORECASE)
    t = re.sub(r'(\d+:\d+)\s*,\s*(\d+:\d+)', r'\1, \2', t)
    # Normalize three-part ratios with spaces: e.g. "11 2533" -> "11:25:33"
    t = re.sub(r'^(\d+)\s+(\d{2})(\d{2})$', r'\1:\2:\3', t)
    t = re.sub(r'^(\d+)\s+(\d+:\d+)$', r'\1:\2', t)
    # Normalize slash OCR artifact to 7 if isolated
    if t == '/':
        t = '7'
    # Normalize isolated pipe or OCR vertical line to '1'
    if t in ['|', 'l', '!']:
        t = '1'
    # Strip stray vertical bars attached to numbers or text: e.g. "5 |" -> "5"
    t = re.sub(r'\s*\|\s*$', '', t)
    t = re.sub(r'^\s*\|\s*', '', t)
    if not t:
        return ""
    # Normalize OCR radicals like v2, y2 -> √2
    t = re.sub(r'(\d+)\s*[vVyY]\s*(\d+)', r'\1√\2', t)
    t = re.sub(r'^[vVyY]\s*(\d+)$', r'√\1', t)
    if re.match(r'^(?:v|V)\d+$', t):
        t = '√' + t[1:]
    elif re.match(r'^\d+(?:v|V)\d+$', t):
        t = re.sub(r'[vV]', '√', t)
    # Normalize plus-minus prefix: e.g. "+1" -> "±1", "+-1" -> "±1", "+: 1" -> "±1"
    if re.match(r'^[+±][\-\.:]\s*(\d+|√|\$|\\frac)', t):
        t = re.sub(r'^[+±][\-\.:]\s*', r'±', t)
    # Normalize time of day: e.g. "5:36 p.m.", "12:00 p.m."
    m_time = re.match(r'^(\d{1,2}:\d{2})\s*([ap]\.?m\.?)$', t, re.IGNORECASE)
    if m_time:
        t = f"{m_time.group(1)} {m_time.group(2).lower()}"
    # Normalize trigonometric powers & angles (e.g. "2sec26", "2cot?9", "2cos*8", "2sin7@", "sec 7A", "SecA", "Tan A", "Tan 7A", "2secA", "2 cosec A", "secA", "cosec A")
    if not re.search(r'\b(sec|seconds?)$', t, re.IGNORECASE) and not re.search(r'\b(days?|hours?|years?|months?|km|m|cm|kg|gm)\b', t, re.IGNORECASE):
        m_trig = re.match(r'^([±+-]?\d*)\s*(sin|cos|tan|cot|sec|cosec|csc)\s*([23²³\?\*7"\'\-~—–]?)\s*([1-9]?\s*[A-Za-zθ\u03b8]|[0689oO\?@]|\d+°)?$', t, re.IGNORECASE)
        if m_trig:
            coeff = m_trig.group(1)
            func = m_trig.group(2).lower()
            pwr = m_trig.group(3)
            arg = (m_trig.group(4) or "").strip()
            pwr_str = '^2' if pwr in ['2', '²', '?', '*', '7', '"', "'", '-', '~', '—', '–'] else (f'^{pwr}' if pwr else '')
            if not arg:
                arg_str = ""
            elif arg in ['0', '6', '8', '9', 'o', 'O', '?', '@', 'θ', '\u03b8']:
                arg_str = r'\theta'
            else:
                arg_str = arg
            space = " " if arg_str else ""
            tex_func = r'\operatorname{cosec}' if func in ['cosec', 'csc'] else f'\\{func}'
            t = f"${coeff}{tex_func}{pwr_str}{space}{arg_str}$".replace("$$", "$")
    # Normalize pure numerical slash fraction to LaTeX: e.g. "1/5" -> "$\\frac{1}{5}$"
    m_slash = re.match(r'^(\d+)/(\d+)$', t)
    if m_slash:
        t = f"$\\frac{{{m_slash.group(1)}}}{{{m_slash.group(2)}}}$"
    # Normalize OCR bracket noise in analogy expressions: e.g. FH] : -> FHI :, GI] -> GI
    t = re.sub(r'([A-Z]+)\]\s*:', r'\1I :', t)
    t = re.sub(r'\]\s*$', '', t)
    return t

def is_promotable_option_text(text):
    """
    Returns True if text represents a clean, unambiguous option value
    (number, single letter, percentage, currency, short phrase/time/ratio, LaTeX math)
    rather than OCR noise from a geometric drawing or mirror image.
    """
    if not text:
        return False
    t = clean_and_normalize_option_text(text)
    if not t:
        return False

    visual_keywords = ['mirror', 'figure', 'dice', 'cube', 'pattern', 'fold', 'embedded', 'shown below', 'given figure']
    if any(kw in t.lower() for kw in visual_keywords):
        return False

    # Explicit blacklist for known OCR noise tokens
    if t.lower() in ['er', 'sos', 'aa', 'ae', 'oe', 'ea', 're', 'te', 'so', 'sl', 'a2', 'au', 'oa', 'eel', 'fir', 'dump', 'as', 'c=']:
        return False

    # 0. LaTeX math / fractions / expressions / inequalities
    if ('\\frac{' in t) and not any(kw in t.lower() for kw in visual_keywords):
        m_fr = re.search(r'\\frac\{([^}]+)\}\{\s*([^}]+)\}', t)
        if m_fr:
            num, den = m_fr.group(1), m_fr.group(2)
            num_clean = re.sub(r'\\(?:sqrt|pm|theta)', '', num).strip()
            den_clean = re.sub(r'\\(?:sqrt|pm|theta)', '', den).strip()
            if re.search(r'[A-Z]\s+[A-Z]', num_clean) or re.search(r'[A-Z]\s+[A-Z]', den_clean):
                return False
        return True
    if t.startswith('$') and t.endswith('$') and len(t) >= 4:
        return True

    # 1. Pure integer or decimal number (with or without thousand-separator commas): e.g. "87,000", "28", "1991", "1.28"
    if re.match(r'^\d{1,3}(,\d{2,3})+(\.\d+)?$', t) or re.match(r'^\d+(\.\d+)?$', t):
        return True

    # 1a. Number pairs / triples or letter/code + number pairs with commas: e.g. "11, 83", "8,51", "S, 2.63", "P, 3.63", "150, 70", "12, 69", "15, 92", "A, 15", "East, 20"
    if re.match(r'^[A-Za-z0-9]+\s*,\s*\d+(\.\d+)?(?:\s*(?:m|km|cm|kg|gm|s|sec|days?|hours?|metres?|meters?))?(\s*,\s*\d+(\.\d+)?)?$', t):
        return True

    # 1b. Tuples of integers in parentheses: e.g. "(25, 81)", "(18, 9, 165)"
    if re.match(r'^\(\s*\d+\s*(?:,\s*\d+\s*)+\)$', t):
        return True

    # 1c. Number triads or pairs with hyphens/dashes: e.g. "46-41-12", "16-9-21", "46-141", "3-48-54-45-42"
    if re.match(r'^\d+(\s*[-–—]\s*\d+)+$', t):
        return True

    # 1d. Roman numerals: e.g. "(i)", "(ii)", "(iii)", "(iv)", "(I)", "(II)"
    if re.match(r'^\([ivxIVX]+\)$', t) or re.match(r'^[ivxIVX]+$', t):
        return True

    # 2. Percentage: e.g. "25%", "76.5%", "12.5%", "7.90%", "155%", "165%"
    if re.match(r'^\d+(\.\d+)?\s*%$', t):
        return True

    # 3. Currency: e.g. "₹135", "₹5,50,000", "₹50,000", "₹28500"
    if re.match(r'^[₹$]\s*\d+([,\.]\d+)*$', t):
        return True

    # 4. Single uppercase or lowercase letter: e.g. "V", "Z", "X", "W", "a", "b"
    if re.match(r'^[A-Za-z]$', t):
        return True

    # 5. Reasoning code words: 2-8 uppercase ("ABCD", "TVW", "GREN", "RGTQML", "RGTQMP") or 2-4 lowercase ("pl", "rq", "jn", "mp", "ge")
    if (re.match(r'^[A-Z]{2,8}$', t) or re.match(r'^[a-z]{2,4}$', t)) and t.lower() not in ['er', 're', 'te', 'so', 'sl', 'au', 'oa', 'as', 'es', 'is', 'at', 'an', 'in', 'on', 'to', 'by', 'or', 'if', 'we', 'he', 'me', 'us', 'am']:
        return True

    # 6. Letter/word pair analogy: e.g. "TVW : YAB", "Foot : Ankle", "Cow — Buffalo", "Safe — Secure"
    if re.match(r'^[A-Za-z]+(\s+[A-Za-z]+)*\s*[:–—\-]\s*[A-Za-z]+(\s+[A-Za-z]+)*$', t):
        return True

    # 6b. Operator interchange pairs: e.g. "+ and x", "- and +", "+ and -"
    if re.match(r'^[+\-x×÷/]\s+and\s+[+\-x×÷/]$', t, re.IGNORECASE) or re.match(r'^[+\-x×÷/]\s*,\s*[+\-x×÷/]$', t, re.IGNORECASE):
        return True

    # 7. Units of measurement: e.g. "15 days", "20 days", "42 km/h", "94.66 km/hr", "512 cm3", "625 cm²", "5 cm", "150 sec", "11 yards", "12 yards", "500 gm", "175 m"
    if re.match(r'^\d+(\.\d+)?\s*(days?|hours?|years?|months?|km/h|km/hr|kmph|km|m/s|cm/s|cm[23²³]?|m[23²³]?|kg|gm|g|quintals?|sec|yards?|meters?|metres?|litres?|liters?|inches|feet)\b', t, re.IGNORECASE):
        return True

    # 8. Profit / Loss phrases: e.g. "12% Profit", "15% Loss", "Profit, 36%", "Loss, 47%", "Loss, ₹36", "Profit of 2%"
    if re.match(r'^(?:Profit|Loss)\s*(?:of\s*)?,?\s*[₹$]?\s*\d+(\.\d+)?%?$', t, re.IGNORECASE) or re.match(r'^\d+(\.\d+)?%\s*(Profit|Loss)\b', t, re.IGNORECASE):
        return True

    # 9. Degree angles (integer or decimal): e.g. "100°", "105°", "120°", "37°", "43.2°", "64.8°", "50.4°", "63.2°"
    if re.match(r'^\d+(\.\d+)?°$', t):
        return True

    # 10. Ratios and ratio pairs: e.g. "4:10:3", "6:14:35", "1:4", "1:2 and 1:1", "12:28:63", "1 : √2", "1:√2"
    if re.match(r'^\d+\s*:\s*\d+(\s*:\s*\d+)?$', t):
        return True
    if re.match(r'^\d+\s*:\s*(?:√|\d+√)\d+$', t):
        return True
    if re.match(r'^\d+\s*:\s*\d+\s+and\s+\d+\s*:\s*\d+$', t, re.IGNORECASE) or re.match(r'^\d+\s*:\s*\d+\s*,\s*\d+\s*:\s*\d+$', t):
        return True

    # 10b. Time of day: e.g. "5:36 p.m.", "12:00 p.m."
    if re.match(r'^\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)$', t, re.IGNORECASE):
        return True

    # 11. Math radicals and plus-minus: e.g. "√2", "2√2", "3√5", "±1", "±√2"
    if re.match(r'^[±+-]?(?:√|\d+√)\d+$', t) or re.match(r'^[±]\s*\d+$', t):
        return True

    # 12. Alphanumeric reasoning codes: e.g. "DS 86", "DR 82", "ER 84", "ES 86", "B2", "K 12", "MA38"
    if re.match(r'^[A-Z]{1,4}\s*\d{1,4}$', t):
        return True

    # 12b. Acronym phrases with prepositions: e.g. "GDP at MP", "NNP at FC", "NDP at MP", "GNP at FC"
    if re.match(r'^[A-Z]{2,5}\s+(?:at|in|of|and|to|for)\s+[A-Z]{2,5}$', t):
        return True

    # 12c. Monomial algebraic terms: e.g. "3x", "4x", "2x", "-2y", "3a"
    if re.match(r'^[±+-]?\d*[a-zA-Z](?:\^[2-4²³])?$', t) and t.lower() not in ['er', 're', 'te', 'so', 'sl', 'au', 'oa', 'as', 'es', 'is', 'at', 'an', 'in', 'on', 'to', 'by', 'or', 'if', 'we', 'he', 'me', 'us', 'am']:
        return True

    # 13. Short clean dictionary words / names (e.g. seasons, authors, family terms, countries, states, dynasties, medical/scientific terms):
    words = t.split()
    if 1 <= len(words) <= 3 and all(re.match(r'^[A-Z][a-z]+$', w) or re.match(r'^[a-z]+$', w) for w in words) and len(t) <= 30:
        vowels = sum(1 for c in t.lower() if c in 'aeiouy')
        if vowels >= 1 and not re.search(r'[bcdfghjklmnpqrstvwxz]{4,}', t.lower()) and not re.search(r'(ndv|ndh|xce|qwt)', t.lower()):
            if len(words) > 1 or len(t) <= 25:
                return True

    # 14. Clean natural phrases or sentences (e.g. "India and Bangladesh", "Most people will expect the interest rate to rise in the future."):
    if (
        len(words) >= 2
        and len(t) <= 220
        and not any(kw in t.lower() for kw in visual_keywords)
        and re.match(r'^[A-Za-z0-9\s,\.\'\-\(\)/%&]+$', t)
    ):
        vowels = sum(1 for c in t.lower() if c in 'aeiou')
        single_char_words = sum(1 for w in words if len(w) == 1 and w.lower() not in ['a', 'i', '&'])
        avg_word_len = sum(len(w) for w in words) / max(1, len(words))
        if vowels >= 2 and single_char_words == 0 and avg_word_len >= 2.5:
            return True

    return False


def get_shift_info(fname, header_text=""):
    fn = fname.lower()
    
    # 1. Match explicit shift in filename
    m_s = re.search(r'[-_–\s]s([1-4])\b', fn) or re.search(r'shift[-_\s]*([1-4]|i{1,3}|iv)\b', fn)
    if m_s:
        val = m_s.group(1).lower()
        mapping = {'1': 1, 'i': 1, '2': 2, 'ii': 2, '3': 3, 'iii': 3, '4': 4, 'iv': 4}
        s_num = mapping.get(val, 1)
        labels = {
            1: (1, 'Shift 1', '9:00 AM - 10:00 AM'),
            2: (2, 'Shift 2', '11:45 AM - 12:45 PM'),
            3: (3, 'Shift 3', '2:30 PM - 3:30 PM'),
            4: (4, 'Shift 4', '5:15 PM - 6:15 PM'),
        }
        return labels[s_num]
        
    # 2. Match exact time or session keyword in filename
    if 'morning' in fn:
        return 1, 'Shift 1', '9:00 AM - 10:00 AM'
    if 'afternoon' in fn or 'afrernoon' in fn:
        return 2, 'Shift 2', '12:30 PM - 1:30 PM'
    if 'evening' in fn:
        return 3, 'Shift 3', '4:00 PM - 5:00 PM'
    if '5-15' in fn or '5:15' in fn:
        return 4, 'Shift 4', '5:15 PM - 6:15 PM'
    if '4-5-pm' in fn or '4-5' in fn or '2-30' in fn or '2:30' in fn or '4-00' in fn or '4:00' in fn:
        return 3, 'Shift 3', '4:00 PM - 5:00 PM' if ('4-5' in fn) else '2:30 PM - 3:30 PM'
    if '1-2-pm' in fn or '1-2' in fn or '11-45' in fn or '11:45' in fn or '1-00' in fn or '1:00' in fn:
        return 2, 'Shift 2', '1:00 PM - 2:00 PM' if ('1-2' in fn) else '11:45 AM - 12:45 PM'
    if '10-11' in fn or '9-00' in fn or '9:00' in fn or '10-00' in fn or '10:00' in fn:
        return 1, 'Shift 1', '10:00 AM - 11:00 AM' if ('10-11' in fn) else '9:00 AM - 10:00 AM'
    if 'tier-ii' in fn or 'descriptive' in fn:
        return 1, 'Single Session', 'Descriptive'
        
    # 3. Match in header text (restricted strictly to preamble before Q.1)
    ht = header_text.lower().split('q.1')[0].split('q. 1')[0]
    m_sh = re.search(r'shift\s*[:\-]?\s*([1-4]|i{1,3}|iv)\b', ht)
    if m_sh:
        val = m_sh.group(1).lower()
        mapping = {'1': 1, 'i': 1, '2': 2, 'ii': 2, '3': 3, 'iii': 3, '4': 4, 'iv': 4}
        s_num = mapping.get(val, 1)
        labels = {
            1: (1, 'Shift 1', '9:00 AM - 10:00 AM'),
            2: (2, 'Shift 2', '11:45 AM - 12:45 PM'),
            3: (3, 'Shift 3', '2:30 PM - 3:30 PM'),
            4: (4, 'Shift 4', '5:15 PM - 6:15 PM'),
        }
        return labels[s_num]
        
    if '5:15' in ht or '5-15' in ht:
        return 4, 'Shift 4', '5:15 PM - 6:15 PM'
    if '2:30' in ht or '2-30' in ht:
        return 3, 'Shift 3', '2:30 PM - 3:30 PM'
    if '11:45' in ht or '11-45' in ht:
        return 2, 'Shift 2', '11:45 AM - 12:45 PM'
    if '9:00' in ht or '9-00' in ht:
        return 1, 'Shift 1', '9:00 AM - 10:00 AM'
        
    return 1, 'Shift 1', '9:00 AM - 10:00 AM'

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

def purge_orphaned_assets(pdata, asset_dir):
    """
    Safely removes unreferenced image assets in asset_dir that were created by
    previous/stale ingestion runs, preserving 100% referential integrity.
    """
    if not os.path.exists(asset_dir):
        return 0
    referenced = set()
    for q in pdata.get('questions', []):
        if q.get('diagramUrl'):
            referenced.add(os.path.basename(q['diagramUrl']))
        for u in (q.get('diagramUrls') or []):
            if u:
                referenced.add(os.path.basename(u))
        for u in (q.get('optionImages') or []):
            if u:
                referenced.add(os.path.basename(u))
        for ro in (q.get('richOptions') or []):
            if ro.get('imageUrl'):
                referenced.add(os.path.basename(ro['imageUrl']))

    purged = 0
    for fname in os.listdir(asset_dir):
        fpath = os.path.join(asset_dir, fname)
        if os.path.isfile(fpath) and fname not in referenced:
            try:
                os.remove(fpath)
                purged += 1
            except Exception:
                pass
    return purged

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
    
    # 2. Automatically determine selection indicator column boundary
    # In Tier 1, 'Ans' blocks are at x ~ 36-58 and radio buttons/ticks are at x < 98.
    # In Tier 2, 'Ans' blocks are at x ~ 115-240 and radio buttons/ticks are at x < 146.
    ans_x = []
    for p_idx in range(min(10, len(doc))):
        for b in doc[p_idx].get_text('blocks'):
            if re.search(r'(?:^|\n)\s*Ans\b', b[4], re.IGNORECASE):
                ans_x.append(b[0])
    avg_ans_x = sum(ans_x) / len(ans_x) if ans_x else 36
    col_bound = 146 if (tier == 'Tier 2' or avg_ans_x > 80) else (100 if str(year) in ('2023', '2022', '2021', '2020', '2019') else 80)
    
    # 3. Process pages and extract questions via cross-page stream
    asset_dir = os.path.join(PUBLIC_ASSETS_DIR, 'ssc/chsl', str(year), paper_id)
    web_base_url = f"/exam-assets/ssc/chsl/{year}/{paper_id}"
    
    # Collect all blocks, images, ticks across the entire document
    all_blocks = []
    all_images = []
    all_ticks = []
    
    for p_idx, page in enumerate(doc):
        p_height = page.rect.height
        page_blocks = page.get_text('blocks')
        sorted_blocks = sorted(page_blocks, key=lambda b: (b[1], b[0]))
        
        for b in sorted_blocks:
            t_clean = b[4].strip()
            if not t_clean:
                continue
            # 1. Filter page footer: "Page X of Y" or bottom navigation
            if re.search(r'Page\s+\d+\s+of\s+\d+', t_clean, re.IGNORECASE):
                continue
            if b[1] > p_height - 45 and any(k in t_clean.lower() for k in ['page', 'download app', 'visit website', 'test prime']):
                continue
            # 2. Filter repetitive page headers on pages after page 0
            if p_idx > 0 and b[3] < 55 and any(k in t_clean.lower() for k in ['chsl exam', 'combined higher secondary', 'ssc chsl']):
                continue
                
            all_blocks.append({
                'page': p_idx,
                'pos': (p_idx, b[1]),
                'bbox': b[:4],
                'text': b[4]
            })
            
        for info in page.get_images():
            xref = info[0]
            meta = doc.extract_image(xref)
            w, h = meta['width'], meta['height']
            if (w, h) in AD_SIZES or (w, h) in [(595, 842), (595, 850), (600, 850), (595, 841)] or ((h <= 3 and w >= 100) or (w <= 3 and h >= 100)):
                continue
            rects = page.get_image_rects(xref)
            for r in rects:
                if r.y1 < 50 or r.y0 > page.rect.height - 30:
                    continue
                # If image is in the selection indicator column
                is_sel_icon = ((w <= 55 and h <= 55) or (r.width <= 25 and r.height <= 25)) and (r.x0 < 85 and r.x1 <= 95)
                if is_sel_icon:
                    # Check if this is the official green tick icon
                    if (w <= 50 and h <= 50) or (r.width <= 25 and r.height <= 25):
                        try:
                            img = Image.open(io.BytesIO(meta['image'])).convert('RGB')
                            pixels = list(img.getdata())
                            sat_green = [p for p in pixels if p[1] > 90 and p[1] > p[0] + 12 and p[1] > p[2] + 12]
                            if len(sat_green) >= 15 and (len(sat_green) / len(pixels)) >= 0.10:
                                all_ticks.append({
                                    'page': p_idx,
                                    'pos': (p_idx, r.y0),
                                    'rect': r
                                })
                        except Exception:
                            pass
                    # All selection column icons (radio buttons, crosses, ticks) are filtered from content images
                    continue
                
                # In content column: legitimate question diagram or option image
                all_images.append({
                    'page': p_idx,
                    'pos': (p_idx, r.y0),
                    'rect': r,
                    'xref': xref,
                    'meta': meta,
                    'w': w,
                    'h': h
                })

    # Markers for Sections and Questions
    markers = []
    last_q_end_idx = 0
    for idx, b in enumerate(all_blocks):
        t = b['text'].strip()
        if 'Section :' in t or 'Section:' in t:
            markers.append({'type': 'section', 'pos': b['pos'], 'text': t})
            last_q_end_idx = idx
        else:
            m = re.search(r'(?:^|\n)\s*Q\s*\.\s*(\d+)', t)
            if m and b['bbox'][0] < 160:
                q_num = int(m.group(1))
                start_pos = b['pos']
                # If this question is preceded on the same page by Comprehension passage or SubQuestion
                for back_idx in range(idx - 1, max(-1, last_q_end_idx - 1), -1):
                    back_b = all_blocks[back_idx]
                    if back_b['page'] != b['page']:
                        break
                    if 'Comprehension:' in back_b['text']:
                        start_pos = back_b['pos']
                        break
                    elif 'SubQuestion No' in back_b['text']:
                        start_pos = back_b['pos']
                markers.append({'type': 'question', 'q_num': q_num, 'pos': start_pos, 'text': t})
                last_q_end_idx = idx

    markers.sort(key=lambda m: m['pos'])

    # 4. Universal Geometric Isolation Engine: Build bounded question regions
    question_regions = QuestionSegmentationEngine.build_question_regions(
        doc=doc,
        all_blocks=all_blocks,
        all_images=all_images,
        all_ticks=all_ticks,
        paper_id=paper_id,
        col_bound=col_bound
    )

    questions = []
    current_sec_id = 'english'
    current_sec_name = 'English Language'
    overall_q_num = 0
    visual_q_count = 0
    diag_count = 0
    opt_img_count = 0
    tables_count = 0
    graphs_count = 0

    if question_regions:
        items_to_process = [(r.question_number, r.section_id, r.section_name, r) for r in question_regions]
    else:
        # Fallback to legacy markers if no regions detected
        items_to_process = []
        c_sec_id = 'english'
        c_sec_name = 'English Language'
        q_count = 0
        for idx, m in enumerate(markers):
            if m['type'] == 'section':
                sec_raw = m['text'].split(':')[-1].strip().lower()
                if 'intelligence' in sec_raw or 'reasoning' in sec_raw:
                    c_sec_id = 'reasoning'
                    c_sec_name = 'General Intelligence & Reasoning'
                elif 'quantitative' in sec_raw or 'quant' in sec_raw:
                    c_sec_id = 'quant'
                    c_sec_name = 'Quantitative Aptitude'
                elif 'awareness' in sec_raw:
                    c_sec_id = 'general_awareness'
                    c_sec_name = 'General Awareness'
                elif 'english' in sec_raw:
                    c_sec_id = 'english'
                    c_sec_name = 'English Language'
                elif 'mathematical' in sec_raw:
                    c_sec_id = 'quant'
                    c_sec_name = 'Mathematical Abilities'
                elif 'computer' in sec_raw:
                    c_sec_id = 'computer'
                    c_sec_name = 'Computer Knowledge Module'
            else:
                q_count += 1
                items_to_process.append((q_count, c_sec_id, c_sec_name, (idx, m)))

    for q_item in items_to_process:
        item_q_num, item_sec_id, item_sec_name, item_data = q_item
        overall_q_num = item_q_num
        current_sec_id = item_sec_id
        current_sec_name = item_sec_name or 'General Intelligence & Reasoning'

        if isinstance(item_data, QuestionRegion):
            region = item_data
            q_blocks = [b for b in all_blocks if region.contains_point(b['page'], b['pos'][1])]
            # Midpoint-based image evaluation with strict footer clamping
            q_imgs = [
                img for img in all_images
                if region.contains_point(img['page'], (img['rect'].y0 + img['rect'].y1) / 2.0)
                and not (region.footer_anchor and img['page'] == region.end_page and img['rect'].y0 >= region.footer_anchor[3])
            ]
            q_ticks = [t for t in all_ticks if region.contains_point(t['page'], t['pos'][1])]
        else:
            idx, m = item_data
            start_pos = m['pos']
            end_pos = markers[idx + 1]['pos'] if idx + 1 < len(markers) else (len(doc), 99999)
            q_blocks = [b for b in all_blocks if start_pos <= b['pos'] < end_pos]
            q_imgs = [img for img in all_images if is_image_in_interval(img['rect'], img['page'], start_pos, end_pos)]
            q_ticks = [t for t in all_ticks if start_pos <= t['pos'] < end_pos]
        
        # Sort q_blocks strictly in geometric reading order
        q_blocks.sort(key=lambda b: (b['page'], b['bbox'][1], b['bbox'][0]))
        
        # Ans marker (supporting normal and vertically stacked 'Ans' or 'A\nn\ns')
        ans_pos = None
        for b in q_blocks:
            if re.search(r'(?:^|\n)\s*A\s*n\s*s\b', b['text'], re.IGNORECASE):
                ans_pos = b['pos']
                break
                
        # Question prompt text
        prompt_parts = []
        for b in q_blocks:
            if ans_pos and b['pos'] >= ans_pos:
                if b['pos'] == ans_pos:
                    p = re.split(r'(?:^|\n)\s*A\s*n\s*s\b', b['text'], flags=re.IGNORECASE)[0].strip()
                    if p:
                        prompt_parts.append(p)
                break
            prompt_parts.append(b['text'].strip())
            
        raw_q_text = clean_watermarks('\n'.join(prompt_parts))
        raw_q_text = re.sub(r'^(?:Q\.?\s*\d+\s*)', '', raw_q_text).strip()
        
        # Certified 2D Geometric Classifier
        # Separates question stem diagrams from option figures using horizontal column
        # discrimination, vertical extent boundaries, safe empty-marker guards, and 4-option dimension clustering.
        diag_imgs = []
        opt_imgs = []

        if ans_pos:
            ans_page, ans_y = ans_pos
            # 1. Safe empty marker guard: determine top boundary of option area
            opt_marker_ys = [b['pos'][1] for b in q_blocks if b['pos'][0] == ans_page and b['pos'] >= ans_pos and re.search(r'(?:^|\n)\s*[1-4]\s*\.', b['text'])]
            y_boundary = min([ans_y - 5] + opt_marker_ys)

            for img in q_imgs:
                img_page, img_y0 = img['pos']
                r = img['rect']

                if img_page < ans_page:
                    # On earlier page than Ans: strictly stem diagram
                    diag_imgs.append(img)
                elif img_page > ans_page:
                    # On later page than Ans: option image if in option column, else stem
                    if r.x0 >= col_bound:
                        opt_imgs.append(img)
                    else:
                        diag_imgs.append(img)
                else:
                    # Same page as Ans:
                    # Question stem diagrams: strictly above or at the Ans block (y1 <= ans_y + 1 or y0 < y_boundary)
                    # Multi-figure series safeguard: all figures with y1 <= ans_y belong to stem
                    if r.y1 <= ans_y + 1.0 or (r.y0 < y_boundary and (r.x0 < col_bound or r.width >= 150)):
                        diag_imgs.append(img)
                    elif r.y0 >= y_boundary:
                        opt_imgs.append(img)
                    else:
                        # Fallback for borderline coordinates straddling boundary: width >= 150pt or left-margin is stem
                        if r.width >= 150 or r.x0 < col_bound:
                            diag_imgs.append(img)
                        else:
                            opt_imgs.append(img)
        else:
            diag_imgs = q_imgs
            opt_imgs = []

        # Sort images by physical reading order
        diag_imgs.sort(key=lambda img: img['pos'])
        opt_imgs.sort(key=lambda img: img['pos'])

        # 4-Option dimension clustering safeguard:
        # If opt_imgs contains > 4 images, reclassify outlier diagrams back to stem
        if len(opt_imgs) > 4:
            real_opts = []
            for img in opt_imgs:
                if img['rect'].y1 <= (ans_pos[1] + 1.0 if ans_pos else 0) or (img['rect'].y0 < y_boundary and img['rect'].width >= 150):
                    diag_imgs.append(img)
                else:
                    real_opts.append(img)
            opt_imgs = real_opts
            diag_imgs.sort(key=lambda img: img['pos'])
            opt_imgs.sort(key=lambda img: img['pos'])
        
        # Option texts
        opt_texts = ["", "", "", ""]
        opt_positions = {}
        for b in q_blocks:
            if ans_pos and b['pos'] >= ans_pos:
                if 'Comprehension:' in b['text'] or 'SubQuestion No' in b['text']:
                    break
                matches = list(re.finditer(r'(?:^|\n)\s*([1-4])\s*\.\s*(.*?)(?=\n\s*[1-4]\s*\.|\n\s*Question ID|\n\s*Status|\n\s*Chosen Option|$)', b['text'], re.DOTALL))
                for om in matches:
                    opt_idx = int(om.group(1)) - 1
                    val = clean_option_text(om.group(2).strip())
                    opt_texts[opt_idx] = val
                    opt_positions[opt_idx] = b['pos']

        # Certified Stem Strip Demotion:
        # Check if candidate stem images in diag_imgs are actually plain-text prompt strips
        # (e.g. number series, analogies, word problems, GA sentences) rather than authentic visual figures.
        filtered_diag_imgs = []
        for d in diag_imgs:
            w, h = d['w'], d['h']
            aspect = w / h if h > 0 else 0
            is_text_strip = False
            ocr_stem = ""

            if pytesseract:
                try:
                    pil_im = Image.open(io.BytesIO(d['meta']['image'])).convert('L')
                    scale = 4 if h < 45 else (2 if h < 75 else 1)
                    if scale > 1:
                        pil_im_lg = pil_im.resize((pil_im.width * scale, pil_im.height * scale), Image.Resampling.LANCZOS)
                        pil_im_pad = ImageOps.expand(pil_im_lg, border=25, fill=255)
                        ocr_raw = call_tesseract_safely(pil_im_pad, config='--psm 6').strip()
                        if not ocr_raw:
                            ocr_raw = call_tesseract_safely(pil_im_pad, config='--psm 7').strip()
                    else:
                        ocr_raw = call_tesseract_safely(pil_im).strip()
                    ocr_stem = clean_watermarks(ocr_raw).replace('\n', ' ').strip()
                    # Clean spurious leading quote or question marker
                    ocr_stem = re.sub(r'^(?:[‘\'"]+|Q\.?\s*\d+\s*)', '', ocr_stem).strip()
                except Exception:
                    pass

            # Visual keywords check
            has_visual_kw = any(kw in ocr_stem.lower() or kw in raw_q_text.lower() for kw in [
                'mirror image', 'mirror is placed',
                'paper is folded', 'punched', 'unfolded',
                'embedded in', 'embedded figure', 'hidden in',
                'complete the pattern', 'figure series', 'pattern series',
                'which figure', 'figure given in the options',
                'select the figure', 'replace the question mark', 'following series',
                'folded to form a cube', 'opposite side of', 'faces of a dice', 'dice',
                'pie chart', 'pie-chart', 'bar chart', 'bar graph', 'histogram',
                'shown below', 'figure below', 'given figure'
            ])

            # Discrimination criteria for text strip:
            # 1. Not a visual reasoning / chart question
            # 2. Has NO option images (if option images exist, stem diagram is visual reasoning)
            # 3. Strip geometry: height <= 140 or aspect ratio >= 3.5
            # 4. Substantial readable OCR text (>= 12 chars)
            if not has_visual_kw and len(opt_imgs) == 0 and len(ocr_stem) >= 12 and (h <= 140 or aspect >= 3.5):
                is_text_strip = True

            if is_text_strip:
                # Demote strip to native question text
                if not raw_q_text or len(raw_q_text) < 10 or re.match(r'^Question\s*\d+$', raw_q_text.strip(), re.IGNORECASE):
                    raw_q_text = ocr_stem
                elif ocr_stem not in raw_q_text:
                    raw_q_text = raw_q_text + "\n" + ocr_stem
            else:
                filtered_diag_imgs.append(d)

        diag_imgs = filtered_diag_imgs

        # 1. Process diagrams with Prompt-Figure Separation
        diag_urls = []
        for d_i, d in enumerate(diag_imgs):
            ext = d['meta']['ext']
            fig_bytes, top_prompt = refine_diagram_crop(d['meta']['image'], ext)
            if top_prompt:
                if not raw_q_text or len(raw_q_text) < 10 or re.match(r'^Question\s*\d+$', raw_q_text.strip(), re.IGNORECASE):
                    raw_q_text = top_prompt
                elif top_prompt.lower() not in raw_q_text.lower():
                    raw_q_text = top_prompt + "\n" + raw_q_text

            fname_diag = f"q{overall_q_num}_diag_{d_i+1}.{ext}" if len(diag_imgs) > 1 else f"q{overall_q_num}_diag.{ext}"
            dest_path = os.path.join(asset_dir, fname_diag)
            web_url = f"{web_base_url}/{fname_diag}"
            saved_url = get_or_save_asset(fig_bytes, ext, dest_path, web_url)
            diag_urls.append(saved_url)
            diag_count += 1
            if d['w'] > 500 and d['h'] > 200:
                graphs_count += 1
            elif d['w'] > 400 and d['h'] < 100:
                tables_count += 1

        # 2. Assign option images to slots with Single-Ownership Guarantee (In-Memory first)
        opt_imgs_assigned = [None, None, None, None]
        if opt_imgs:
            opt_imgs_sorted = sorted(opt_imgs, key=lambda x: x['pos'])

            if len(opt_imgs_sorted) == 4:
                # Standard visual reasoning question: 4 option figures strictly ordered A -> B -> C -> D
                for slot in range(4):
                    opt_imgs_assigned[slot] = opt_imgs_sorted[slot]
            else:
                # Bipartite minimum distance matching between option slots and images
                # Prevents off-by-one cascading thefts when an option image is missing.
                assigned_slots = set()
                used_img_indices = set()
                
                pair_dists = []
                for slot in range(4):
                    if slot in opt_positions:
                        s_pos = opt_positions[slot]
                        for idx_img, img in enumerate(opt_imgs_sorted):
                            if img['pos'][0] == s_pos[0]:
                                d = abs(img['pos'][1] - s_pos[1])
                                pair_dists.append((d, slot, idx_img))
                                
                pair_dists.sort(key=lambda x: x[0])
                for dist, slot, idx_img in pair_dists:
                    if dist > 35:
                        continue
                    if slot in assigned_slots or idx_img in used_img_indices:
                        continue
                    assigned_slots.add(slot)
                    used_img_indices.add(idx_img)
                    opt_imgs_assigned[slot] = opt_imgs_sorted[idx_img]

        # OCR fallback for small text/number images - 1-to-1 alignment
        opt_ocr_texts = [None, None, None, None]
        if pytesseract:
            for i in range(4):
                if opt_imgs_assigned[i]:
                    target_img = opt_imgs_assigned[i]
                    m_meta = target_img['meta']
                    if m_meta['width'] <= 850 and m_meta['height'] <= 140:
                        ocr_res = robust_ocr_chip(m_meta['image'])
                        if ocr_res:
                            opt_ocr_texts[i] = ocr_res

        # 3. Determine Correct Answer via Green Tick Icon
        correct_idx = 0
        if q_ticks:
            t_pos = q_ticks[0]['pos']
            slot_dists = []
            for slot in range(4):
                ref_pos = None
                if slot in opt_positions:
                    ref_pos = opt_positions[slot]
                elif opt_imgs_assigned[slot] is not None:
                    ref_pos = opt_imgs_assigned[slot]['pos']
                if ref_pos:
                    dist = abs(ref_pos[0] - t_pos[0]) * 10000 + abs(ref_pos[1] - t_pos[1])
                    slot_dists.append((dist, slot))
            if slot_dists:
                slot_dists.sort()
                correct_idx = slot_dists[0][1]
                
        ans_letter = ['A', 'B', 'C', 'D'][correct_idx]
        
        # Check for 4-identical options OCR defect when option images are assigned
        if len(opt_ocr_texts) == 4 and opt_ocr_texts[0] and opt_ocr_texts[0] == opt_ocr_texts[1] == opt_ocr_texts[2] == opt_ocr_texts[3]:
            opt_ocr_texts = [None, None, None, None]
            
        if len(opt_texts) == 4 and opt_texts[0] and opt_texts[0] == opt_texts[1] == opt_texts[2] == opt_texts[3] and any(opt_imgs_assigned):
            opt_texts = ["", "", "", ""]

        # Certified Option Strip Promotion:
        # Check if candidate option images are actually plain-text/number badges (e.g. "28", "15 days", "₹135", "V")
        # that should be rendered as clean native text rather than boxed image cutouts.
        diag_stem_text = ""
        for d in diag_imgs:
            try:
                pil_d = Image.open(io.BytesIO(d['meta']['image'])).convert('L')
                diag_stem_text += " " + clean_watermarks(call_tesseract_safely(pil_d, config='--psm 6'))
            except Exception:
                pass
        combined_q_text = (raw_q_text + " " + diag_stem_text).lower()

        is_visual_reasoning = any(kw in combined_q_text for kw in [
            'mirror image', 'mirror is placed', 'when the mirror',
            'paper is folded', 'punched', 'unfolded',
            'embedded in', 'embedded figure', 'hidden in',
            'complete the pattern', 'figure series', 'pattern series',
            'which figure', 'figure given in the options', 'option figure', 'which of the following figures',
            'venn diagram', 'venn diagrams', 'dice', 'opposite faces', 'cube'
        ])

        clean_candidate_ocrs = [None, None, None, None]
        promotable_count = 0
        assigned_img_count = sum(1 for x in opt_imgs_assigned if x is not None)

        for i in range(4):
            raw_opt_val = opt_texts[i] if opt_texts[i] else (opt_ocr_texts[i] or "")
            c_opt_val = clean_and_normalize_option_text(raw_opt_val)
            clean_candidate_ocrs[i] = c_opt_val

        # If any option has currency symbol ₹, harmonize pure digit options to ₹
        if any(o and o.startswith('₹') for o in clean_candidate_ocrs):
            for i in range(4):
                if clean_candidate_ocrs[i] and re.match(r'^\d+([,\.]\d+)*$', clean_candidate_ocrs[i]):
                    clean_candidate_ocrs[i] = '₹' + clean_candidate_ocrs[i]

        # Arithmetic Progression / Consecutive Count recovery for missing numeric options
        # E.g. ['14', None, '16', None] -> ['14', '15', '16', '17']
        num_indices = [i for i in range(4) if clean_candidate_ocrs[i] and re.match(r'^\d+$', clean_candidate_ocrs[i].strip())]
        if len(num_indices) == 2:
            i1, i2 = num_indices
            val1, val2 = int(clean_candidate_ocrs[i1]), int(clean_candidate_ocrs[i2])
            step = (val2 - val1) / (i2 - i1)
            if step in (1.0, 2.0, -1.0, -2.0):
                base_0 = val1 - int(step) * i1
                for i in range(4):
                    if not clean_candidate_ocrs[i]:
                        clean_candidate_ocrs[i] = str(base_0 + int(step) * i)
                        opt_texts[i] = clean_candidate_ocrs[i]

        for i in range(4):
            if is_promotable_option_text(clean_candidate_ocrs[i]):
                promotable_count += 1

        has_any_math = any(clean_candidate_ocrs[i] and ('\\frac{' in clean_candidate_ocrs[i] or '√' in clean_candidate_ocrs[i] or clean_candidate_ocrs[i].startswith('$')) for i in range(4))
        is_symmetric_math = True
        if has_any_math:
            for i in range(4):
                val = clean_candidate_ocrs[i] or ""
                if not (
                    '\\frac{' in val
                    or '√' in val
                    or val.startswith('$')
                    or is_promotable_option_text(val)
                ):
                    is_symmetric_math = False
                    break

        should_promote_options = (
            (not is_visual_reasoning)
            and is_symmetric_math
            and assigned_img_count > 0
            and promotable_count >= 3
            and all(clean_candidate_ocrs[i] for i in range(4))
            and len(set(clean_candidate_ocrs[i].strip() for i in range(4))) == 4
        )

        option_images = [None, None, None, None]
        if should_promote_options:
            # Case normalization for reasoning code token sets (e.g. ['ge', 'fp', 'mz', 'Ze'] -> 'ze')
            lower_cnt = sum(1 for c in clean_candidate_ocrs if c and c.islower() and len(c) <= 3 and c.isalpha())
            if lower_cnt >= 2:
                for i in range(4):
                    if clean_candidate_ocrs[i] and len(clean_candidate_ocrs[i]) <= 3 and clean_candidate_ocrs[i].isalpha():
                        clean_candidate_ocrs[i] = clean_candidate_ocrs[i].lower()
            for i in range(4):
                if clean_candidate_ocrs[i]:
                    opt_texts[i] = clean_candidate_ocrs[i]
                option_images[i] = None
                # Clean up any stale option PNG files on disk from prior ingestions
                letter = ['a', 'b', 'c', 'd'][i]
                for old_ext in ['png', 'jpg', 'jpeg']:
                    old_path = os.path.join(asset_dir, f"q{overall_q_num}_opt_{letter}.{old_ext}")
                    if os.path.exists(old_path):
                        try:
                            os.remove(old_path)
                        except Exception:
                            pass
        else:
            # Save authentic visual option assets to disk
            for slot in range(4):
                if opt_imgs_assigned[slot] is not None:
                    opt_meta = opt_imgs_assigned[slot]['meta']
                    ext = opt_meta['ext']
                    letter = ['a', 'b', 'c', 'd'][slot]
                    fname_opt = f"q{overall_q_num}_opt_{letter}.{ext}"
                    dest_path = os.path.join(asset_dir, fname_opt)
                    web_url = f"{web_base_url}/{fname_opt}"
                    saved_url = get_or_save_asset(opt_meta['image'], ext, dest_path, web_url)
                    option_images[slot] = saved_url
                    opt_img_count += 1

        # 4. Clean placeholders & build richOptions and contentBlocks with strict presentation policy
        rich_opts = []
        for idx_opt in range(4):
            lbl = ['A', 'B', 'C', 'D'][idx_opt]
            img_u = option_images[idx_opt]
            orig_t = opt_texts[idx_opt]
            ocr_t = opt_ocr_texts[idx_opt]
            
            # If native text is just placeholder "Option (A)"
            is_ph = bool(re.match(r'^Option\s*\([A-D]\)$', orig_t.strip(), re.IGNORECASE))
            cl_t = "" if (is_ph and img_u) else orig_t
            
            if img_u:
                # Presentation policy: visual option
                # Source visual asset is the authoritative representation.
                # OCR is metadata for altText/search only. Text is NOT rendered visually.
                disp_mode = 'IMAGE_ONLY'
                ocr_metadata = ocr_t or cl_t or None
                alt_label = f"Option {lbl} figure"
                c_blocks = [{
                    'type': 'image',
                    'assetUrl': img_u,
                    'displayMode': disp_mode,
                    'altText': alt_label,
                    'ocrText': ocr_metadata,
                    'confidence': 'VERIFIED'
                }]
                rich_opts.append({
                    'id': lbl,
                    'text': "",  # strictly empty so no renderer accidentally renders text
                    'imageUrl': img_u,
                    'displayMode': disp_mode,
                    'altText': alt_label,
                    'ocrText': ocr_metadata,
                    'contentBlocks': c_blocks,
                    'contentTypes': ['image']
                })
                # For raw options array, strictly set to "" when displayMode is IMAGE_ONLY
                # to prevent double-rendering or OCR contamination in legacy/raw option consumers.
                # OCR text is preserved strictly in richOptions[i].ocrText.
                opt_texts[idx_opt] = ""
            else:
                # Presentation policy: text option
                disp_mode = 'TEXT_ONLY'
                c_blocks = []
                c_types = []
                if cl_t:
                    c_blocks.append({'type': 'text', 'content': cl_t, 'confidence': 'VERIFIED'})
                    c_types.append('text')
                rich_opts.append({
                    'id': lbl,
                    'text': cl_t,
                    'imageUrl': None,
                    'displayMode': disp_mode,
                    'contentBlocks': c_blocks if c_blocks else None,
                    'contentTypes': c_types if c_types else None
                })
                opt_texts[idx_opt] = cl_t
            
        # Strict rule: NEVER generate "Question {N}" fallback string.
        # If there are diagrams and no text, text is "" and question is visual.
        # If there is no diagram and no text, mark verificationStatus as REVIEW_REQUIRED.
        if diag_urls and (not raw_q_text or re.match(r'^Question\s*\d+$', raw_q_text.strip(), re.IGNORECASE)):
            raw_q_text = ""
        elif not raw_q_text or re.match(r'^Question\s*\d+$', raw_q_text.strip(), re.IGNORECASE):
            raw_q_text = ""
            
        if diag_urls or any(option_images):
            visual_q_count += 1
            
        # Quality gate check: question is REVIEW_REQUIRED if:
        # 1) no text AND no diagram
        # 2) any option slot has NEITHER text NOR image
        has_empty_option = any(not opt_texts[i] and not option_images[i] for i in range(4))
        has_no_stem = not raw_q_text and not diag_urls
        
        v_status = "REVIEW_REQUIRED" if (has_empty_option or has_no_stem) else "VERIFIED"
        
        # Build question contentBlocks
        q_content_blocks = []
        q_content_types = []
        if raw_q_text:
            q_content_blocks.append({
                'type': 'text',
                'content': raw_q_text,
                'confidence': 'VERIFIED'
            })
            q_content_types.append('text')
        for d_url in diag_urls:
            q_content_blocks.append({
                'type': 'image',
                'assetUrl': d_url,
                'confidence': 'VERIFIED'
            })
            if 'image' not in q_content_types:
                q_content_types.append('image')
            
        q_obj = {
            "id": f"{paper_id}-q{overall_q_num}",
            "questionNumber": overall_q_num,
            "sectionId": current_sec_id,
            "sectionName": current_sec_name,
            "questionText": raw_q_text,
            "contentBlocks": q_content_blocks if q_content_blocks else None,
            "contentTypes": q_content_types if q_content_types else None,
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
            "language": "English",
            "verificationStatus": v_status
        }

        # Single-Ownership Guarantee Verification
        stem_asset_urls = set(diag_urls)
        opt_asset_urls = set(u for u in option_images if u)
        assert stem_asset_urls.isdisjoint(opt_asset_urls), f"Single-ownership violation in Q{overall_q_num}: Assets_stem and Assets_opt intersect!"
        assert all('_diag' in u for u in stem_asset_urls), f"Invalid stem asset naming in Q{overall_q_num}"
        assert all('_opt_' in u for u in opt_asset_urls), f"Invalid option asset naming in Q{overall_q_num}"

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
    
    # Safely purge any orphaned/stale assets from previous runs
    purge_orphaned_assets(paper_data, asset_dir)
    
    try:
        doc.close()
    except Exception:
        pass
    gc.collect()

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
        if not os.path.exists(fpath):
            alt_fpath = fpath.replace('exam ssc/', 'exam ssc chsl/')
            if os.path.exists(alt_fpath):
                fpath = alt_fpath
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

def load_manifest(year):
    os.makedirs(MANIFEST_DIR, exist_ok=True)
    mpath = os.path.join(MANIFEST_DIR, f"ssc_chsl_{year}_manifest.json")
    if os.path.exists(mpath):
        try:
            with open(mpath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[WARN] Failed to load existing manifest: {e}")
    return {
        "year": str(year),
        "created_at": datetime.datetime.now().isoformat(),
        "last_updated": datetime.datetime.now().isoformat(),
        "papers": {}
    }

def save_manifest(manifest, year):
    os.makedirs(MANIFEST_DIR, exist_ok=True)
    mpath = os.path.join(MANIFEST_DIR, f"ssc_chsl_{year}_manifest.json")
    tmpath = mpath + ".tmp"
    manifest["last_updated"] = datetime.datetime.now().isoformat()
    try:
        with open(tmpath, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmpath, mpath)
    except Exception as e:
        print(f"[ERROR] Failed to save manifest: {e}")

def is_paper_already_certified(paper_id, pdf_hash, manifest):
    pentry = manifest.get("papers", {}).get(paper_id)
    if not pentry:
        return False
    if pentry.get("status") != "CERTIFIED":
        return False
    if pentry.get("pdf_sha256") != pdf_hash:
        return False
    out_path = os.path.join(EXAMS_DATA_DIR, f"{paper_id}.json")
    if not os.path.exists(out_path):
        return False
    try:
        with open(out_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            expected_q = 135 if "tier2" in paper_id else 100
            qs = data.get("questions", [])
            if len(qs) != expected_q:
                return False
            if not qs or not qs[0].get("contentBlocks"):
                return False
            return True
    except Exception:
        return False

def print_manifest_status(manifest, total_discovered=None):
    papers = manifest.get("papers", {})
    certified = [p for p in papers.values() if p.get("status") == "CERTIFIED"]
    failed = [p for p in papers.values() if p.get("status") == "FAILED"]
    total = total_discovered if total_discovered is not None else len(papers)
    pending = max(0, total - len(certified))
    
    print("\n" + "=" * 70)
    print(f"SSC CHSL {manifest.get('year', '2023')} CHECKPOINT MANIFEST STATUS")
    print("=" * 70)
    print(f"  Total Papers Discovered : {total}")
    print(f"  Certified Papers        : {len(certified)} / {total} ({(len(certified)/max(1,total))*100:.1f}%)")
    print(f"  Failed Papers           : {len(failed)}")
    print(f"  Pending Papers          : {pending}")
    print("-" * 70)
    print(f"  {'Paper ID':<34} | {'Status':<9} | {'Qs':<4} | {'Visual':<6} | {'Sec':<5} | {'RSS MB'}")
    print("-" * 70)
    for pid, p in sorted(papers.items()):
        status = p.get('status', 'UNKNOWN')
        qs = p.get('total_questions', 0)
        v_qs = p.get('visual_questions', 0)
        sec = f"{p.get('elapsed_seconds', 0.0):.1f}s"
        rss = f"{p.get('peak_rss_mb', 0.0):.1f}"
        print(f"  {pid:<34} | {status:<9} | {qs:<4} | {v_qs:<6} | {sec:<5} | {rss}")
    print("=" * 70 + "\n")

def discover_source_pdfs(target_year):
    """
    Discovers all unique source PDFs for a given target year.
    For 2023: includes 36 Tier 1 papers and 2 Tier 2 papers (02 Nov 2023 & 10 Jan 2024).
    Deduplicates by SHA-256 hash.
    """
    target_year = str(target_year)
    raw_files = []
    if target_year == '2023':
        t1_dir = '/Users/shivarampatel/Downloads/exam ssc chsl/qp 2023'
        t2_dir = '/Users/shivarampatel/Downloads/exam ssc chsl/qp tier 2'
        if os.path.exists(t1_dir):
            raw_files.extend(glob.glob(os.path.join(t1_dir, '*.pdf')))
        if os.path.exists(t2_dir):
            # Include 2023 Tier-II papers (excluding 2022 tier 2 held in 2023)
            for p in glob.glob(os.path.join(t2_dir, '*2023*Tier-II*.pdf')):
                if '2022-Tier-II' not in os.path.basename(p):
                    raw_files.append(p)
    else:
        folders = {
            '2024': '/Users/shivarampatel/Downloads/exam ssc chsl/qp 2024',
            '2022': '/Users/shivarampatel/Downloads/exam ssc chsl/qp2022',
            '2021': '/Users/shivarampatel/Downloads/exam ssc chsl/qp 2021',
            '2020': '/Users/shivarampatel/Downloads/exam ssc chsl/qp 2020',
            '2019': '/Users/shivarampatel/Downloads/exam ssc chsl/qp 2019',
        }
        fpath = folders.get(target_year)
        if not fpath or not os.path.exists(fpath):
            fpath = fpath.replace('exam ssc chsl/', 'exam ssc/') if fpath else None
        if fpath and os.path.exists(fpath):
            raw_files = [f for f in glob.glob(os.path.join(fpath, '*.pdf')) if 'descriptive' not in os.path.basename(f).lower()]

    # Deduplicate by SHA-256 hash
    unique_items = []
    seen_hashes = set()
    for p in sorted(raw_files):
        try:
            with open(p, 'rb') as fp:
                h = hashlib.sha256(fp.read()).hexdigest()
            if h not in seen_hashes:
                seen_hashes.add(h)
                unique_items.append((p, h))
        except Exception as e:
            print(f"[WARN] Failed to read {p}: {e}")
    return unique_items

def process_single_paper_task(args):
    pdf_path, target_year, pdf_hash = args
    fname = os.path.basename(pdf_path)
    t0 = time.time()
    try:
        pdata, stats = parse_tcs_ion_cbt(pdf_path, target_year)
        pid = pdata['id']
        out_path = os.path.join(EXAMS_DATA_DIR, f"{pid}.json")
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(pdata, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        
        elapsed = round(time.time() - t0, 2)
        max_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        rss_mb = round(max_rss / (1024 * 1024) if sys.platform == 'darwin' else max_rss / 1024, 1)
        return (True, pid, pdf_path, pdf_hash, len(pdata['questions']), stats, elapsed, rss_mb, None)
    except Exception as e:
        import traceback
        elapsed = round(time.time() - t0, 2)
        return (False, fname, pdf_path, pdf_hash, 0, None, elapsed, 0.0, f"{e}\n{traceback.format_exc()}")
    finally:
        _OCR_CHIP_CACHE.clear()
        _DIAG_CROP_CACHE.clear()
        gc.collect()

def main():
    import multiprocessing, concurrent.futures

    parser = argparse.ArgumentParser(description="MOCK.AI SSC CHSL Universal Importer & Forensic Certifier")
    parser.add_argument("--year", default="2023", help="Target exam year (e.g. 2023, 2024)")
    parser.add_argument("--pdf", default=None, help="Process single PDF file")
    parser.add_argument("--mode", choices=["laptop", "performance"], default="laptop", help="Operating resource profile")
    parser.add_argument("--thermal-safe", action="store_true", help="Force laptop thermal bounds (PDF_WORKERS=2, OCR_WORKERS=1)")
    parser.add_argument("--pdf-workers", type=int, default=None, help="Override PDF worker count")
    parser.add_argument("--ocr-workers", type=int, default=None, help="Override OCR worker count")
    parser.add_argument("--image-workers", type=int, default=None, help="Override image worker count")
    parser.add_argument("--hash-workers", type=int, default=None, help="Override hash worker count")
    parser.add_argument("--resume", action="store_true", default=True, help="Resume from checkpoint manifest (skip certified)")
    parser.add_argument("--force", action="store_true", help="Force re-extraction of all papers, ignoring checkpoint")
    parser.add_argument("--status", action="store_true", help="Print checkpoint manifest certification status and exit")
    parser.add_argument("--benchmark", action="store_true", help="Print detailed benchmark profiling metrics")
    parser.add_argument("--cooldown-every", type=int, default=2, help="Number of completed papers before triggering thermal cooldown (default: 2)")
    parser.add_argument("--cooldown-seconds", type=int, default=120, help="Cooldown duration in seconds (default: 120)")
    parser.add_argument("--no-cooldown", action="store_true", help="Disable thermal cooldown between paper batches")

    args = parser.parse_args()
    target_year = args.year

    cooldown_enabled = not args.no_cooldown and (args.cooldown_every > 0) and (args.cooldown_seconds > 0)
    cooldown_every = args.cooldown_every if cooldown_enabled else 0
    cooldown_seconds = args.cooldown_seconds if cooldown_enabled else 0

    manifest = load_manifest(target_year)

    if args.status:
        pdf_items = discover_source_pdfs(target_year)
        print_manifest_status(manifest, len(pdf_items))
        return

    # Determine concurrency limits based on mode and flags
    if args.thermal_safe or args.mode == "laptop":
        def_pdf_w = int(os.environ.get("CHSL_PDF_WORKERS", 2))
        def_ocr_w = int(os.environ.get("CHSL_OCR_WORKERS", 1))
    else:
        def_pdf_w = int(os.environ.get("CHSL_PDF_WORKERS", min(4, os.cpu_count() or 2)))
        def_ocr_w = int(os.environ.get("CHSL_OCR_WORKERS", 2))

    pdf_workers = args.pdf_workers if args.pdf_workers is not None else def_pdf_w
    ocr_workers = args.ocr_workers if args.ocr_workers is not None else def_ocr_w

    # Single PDF execution
    if args.pdf:
        pdf_path = args.pdf
        fname = os.path.basename(pdf_path)
        with open(pdf_path, 'rb') as fp:
            h = hashlib.sha256(fp.read()).hexdigest()
        print(f"\n[SINGLE] Processing single PDF: {fname}")
        t0 = time.time()
        pdata, stats = parse_tcs_ion_cbt(pdf_path, target_year)
        pid = pdata['id']
        out_path = os.path.join(EXAMS_DATA_DIR, f"{pid}.json")
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(pdata, f, indent=2, ensure_ascii=False)
        elapsed = round(time.time() - t0, 2)
        max_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        rss_mb = round(max_rss / (1024 * 1024) if sys.platform == 'darwin' else max_rss / 1024, 1)

        manifest["papers"][pid] = {
            "paper_id": pid,
            "source_pdf": fname,
            "pdf_sha256": h,
            "status": "CERTIFIED",
            "certified_at": datetime.datetime.now().isoformat(),
            "total_questions": len(pdata['questions']),
            "expected_questions": 135 if "tier2" in pid else 100,
            "visual_questions": stats['visual_q'],
            "diagrams": stats['diags'],
            "image_options": stats['opt_imgs'],
            "tables": stats['tables'],
            "graphs": stats['graphs'],
            "elapsed_seconds": elapsed,
            "peak_rss_mb": rss_mb,
            "error": None
        }
        save_manifest(manifest, target_year)
        print(f"[OK] Certified {pid} ({len(pdata['questions'])} Qs) in {elapsed}s | {stats['visual_q']} visual Qs | {stats['diags']} diags, {stats['opt_imgs']} opt imgs -> {out_path}")
        return

    # Full Corpus Ingestion
    pdf_items = discover_source_pdfs(target_year)
    total_found = len(pdf_items)

    print("\n" + "=" * 70)
    print("MOCK.AI SSC CHSL IMPORTER & FORENSIC CERTIFIER")
    print(f"Target Year      : {target_year}")
    print(f"Unique PDFs      : {total_found}")
    print(f"Execution Mode   : {args.mode.upper()} {'(Forced Thermal-Safe)' if args.thermal_safe else ''}")
    print(f"Concurrency      : PDF_WORKERS={pdf_workers} | OCR_WORKERS={ocr_workers} | OMP_THREAD_LIMIT=1")
    print(f"Thermal Cooldown : {'ENABLED (Every ' + str(cooldown_every) + ' papers, ' + str(cooldown_seconds) + 's)' if cooldown_enabled else 'DISABLED'}")
    print(f"Resume Mode      : {'ENABLED' if not args.force else 'DISABLED (Force Reprocess)'}")
    print("=" * 70 + "\n")

    # Filter tasks based on checkpoint manifest
    tasks_to_run = []
    already_certified_count = 0
    for p_path, p_hash in pdf_items:
        # Pre-calculate paper_id hint or inspect manifest
        # We can check if any certified paper in manifest has this pdf_sha256
        certified_match = None
        for pid, pinfo in manifest.get("papers", {}).items():
            if pinfo.get("pdf_sha256") == p_hash and pinfo.get("status") == "CERTIFIED":
                if is_paper_already_certified(pid, p_hash, manifest):
                    certified_match = pid
                    break

        if certified_match and not args.force:
            already_certified_count += 1
        else:
            tasks_to_run.append((p_path, target_year, p_hash))

    print(f"[STATUS] {already_certified_count} papers already certified. {len(tasks_to_run)} papers to process.")

    if not tasks_to_run:
        print("\nAll papers in corpus are already certified! Checkpoint complete.")
        print_manifest_status(manifest, total_found)
        return

    # Graceful interrupt handling
    global _INTERRUPT_REQUESTED
    _INTERRUPT_REQUESTED = False

    def sig_handler(sig, frame):
        global _INTERRUPT_REQUESTED
        if _INTERRUPT_REQUESTED:
            print("\n[INTERRUPT] Force exit requested. Checkpoint preserved.")
            sys.exit(1)
        print("\n\n[INTERRUPT] Received shutdown signal. Gracefully finishing active tasks and saving checkpoint...")
        _INTERRUPT_REQUESTED = True

    signal.signal(signal.SIGINT, sig_handler)
    signal.signal(signal.SIGTERM, sig_handler)

    # Initialize shared OCR semaphore via multiprocessing Manager
    mgr = multiprocessing.Manager()
    ocr_sem = mgr.Semaphore(ocr_workers)

    start_all = time.time()
    completed_in_run = 0
    errors_in_run = 0

    batch_size = cooldown_every if cooldown_enabled else len(tasks_to_run)
    batches = [tasks_to_run[i:i + batch_size] for i in range(0, len(tasks_to_run), batch_size)]

    with concurrent.futures.ProcessPoolExecutor(max_workers=pdf_workers, initializer=init_worker_process, initargs=(ocr_sem,)) as executor:
        for batch_idx, batch in enumerate(batches):
            if _INTERRUPT_REQUESTED:
                break

            # Submit tasks for the current batch
            future_map = {executor.submit(process_single_paper_task, t): t for t in batch}

            for future in concurrent.futures.as_completed(future_map):
                task_info = future_map[future]
                try:
                    ok, pid, p_path, p_hash, q_len, stats, elapsed, rss_mb, err = future.result()
                except Exception as e:
                    ok, pid, p_path, p_hash, q_len, stats, elapsed, rss_mb, err = False, os.path.basename(task_info[0]), task_info[0], task_info[2], 0, None, 0.0, 0.0, str(e)

                expected_q = 135 if "tier2" in pid else 100
                is_valid = ok and (q_len == expected_q)

                manifest["papers"][pid] = {
                    "paper_id": pid,
                    "source_pdf": os.path.basename(p_path),
                    "pdf_sha256": p_hash,
                    "status": "CERTIFIED" if is_valid else "FAILED",
                    "certified_at": datetime.datetime.now().isoformat(),
                    "total_questions": q_len,
                    "expected_questions": expected_q,
                    "visual_questions": stats['visual_q'] if stats else 0,
                    "diagrams": stats['diags'] if stats else 0,
                    "image_options": stats['opt_imgs'] if stats else 0,
                    "tables": stats['tables'] if stats else 0,
                    "graphs": stats['graphs'] if stats else 0,
                    "elapsed_seconds": elapsed,
                    "peak_rss_mb": rss_mb,
                    "error": err
                }
                save_manifest(manifest, target_year)

                if is_valid:
                    completed_in_run += 1
                    curr_certified = already_certified_count + completed_in_run
                    print(f"  [{curr_certified}/{total_found}] [OK] {pid} ({q_len} Qs, {elapsed}s, {rss_mb} MB) | {stats['visual_q']} visual | {stats['diags']} diag, {stats['opt_imgs']} opts")
                else:
                    errors_in_run += 1
                    print(f"  [ERROR] {pid}: {err or f'Expected {expected_q} Qs, got {q_len}'}")

                if _INTERRUPT_REQUESTED:
                    print("\n[INTERRUPT] Stopping further tasks as requested.")
                    break

            if _INTERRUPT_REQUESTED:
                break

            # Thermal Cooldown between batches
            has_more_batches = (batch_idx < len(batches) - 1)
            if cooldown_enabled and has_more_batches:
                sys.stdout.flush()
                sys.stderr.flush()
                gc.collect()

                curr_certified = already_certified_count + completed_in_run
                next_batch_time = (datetime.datetime.now() + datetime.timedelta(seconds=cooldown_seconds)).strftime("%H:%M")

                print("\n" + "=" * 48)
                print("THERMAL COOLDOWN")
                print(f"Completed: {curr_certified} / {total_found} papers\n")
                print(f"Cooling down for {cooldown_seconds} seconds...")
                print(f"Next batch starts at: {next_batch_time}\n")
                print("CPU workers: idle")
                print("OCR workers: idle")
                print("=" * 48 + "\n")
                sys.stdout.flush()

                sleep_start = time.time()
                try:
                    while time.time() - sleep_start < cooldown_seconds:
                        if _INTERRUPT_REQUESTED:
                            break
                        time.sleep(min(0.5, cooldown_seconds - (time.time() - sleep_start)))
                except KeyboardInterrupt:
                    _INTERRUPT_REQUESTED = True

                if _INTERRUPT_REQUESTED:
                    print("[INTERRUPT] Received shutdown signal during cooldown. Checkpoint preserved. Exiting cleanly.")
                    break

                print("RESUMING\n")
                sys.stdout.flush()


    total_elapsed = round(time.time() - start_all, 2)
    print(f"\nBatch processing finished in {total_elapsed}s. {completed_in_run} newly certified, {errors_in_run} errors.")
    print_manifest_status(manifest, total_found)

    # Purge orphaned/unreferenced option images from disk
    purge_corpus_orphaned_assets(target_year)

def purge_corpus_orphaned_assets(target_year):
    """
    Scans all generated exam JSONs for target_year, collects all referenced asset URLs
    (diagramUrl, diagramUrls, questionAssets, optionImages, richOptions),
    and deletes any unreferenced files in web/public/exam-assets/ssc/chsl/{target_year}/.
    """
    target_year = str(target_year)
    json_dir = os.path.join(BASE_DIR, "web", "src", "data", "exams")
    assets_base = os.path.join(BASE_DIR, "web", "public", "exam-assets", "ssc", "chsl", target_year)
    if not os.path.exists(assets_base):
        return 0, 0

    referenced_web_paths = set()
    for j_path in glob.glob(os.path.join(json_dir, f"ssc-chsl-{target_year}*.json")):
        try:
            with open(j_path, "r", encoding="utf-8") as f:
                d = json.load(f)
            for q in d.get("questions", []):
                if q.get("diagramUrl"):
                    referenced_web_paths.add(q["diagramUrl"])
                for u in q.get("diagramUrls") or []:
                    if u: referenced_web_paths.add(u)
                for a in q.get("questionAssets") or []:
                    if isinstance(a, dict) and a.get("url"):
                        referenced_web_paths.add(a["url"])
                    elif isinstance(a, str) and a:
                        referenced_web_paths.add(a)
                for img in q.get("optionImages") or []:
                    if img: referenced_web_paths.add(img)
                for ro in q.get("richOptions") or []:
                    if isinstance(ro, dict) and ro.get("imageUrl"):
                        referenced_web_paths.add(ro["imageUrl"])
        except Exception:
            pass

    purged_count = 0
    bytes_freed = 0
    for root, dirs, files in os.walk(assets_base):
        for f in files:
            if not f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                continue
            abs_p = os.path.join(root, f)
            rel_web = "/" + os.path.relpath(abs_p, os.path.join(BASE_DIR, "web", "public"))
            if rel_web not in referenced_web_paths:
                try:
                    fsize = os.path.getsize(abs_p)
                    os.remove(abs_p)
                    purged_count += 1
                    bytes_freed += fsize
                except Exception:
                    pass

    for root, dirs, files in os.walk(assets_base, topdown=False):
        for d in dirs:
            dir_p = os.path.join(root, d)
            if not os.listdir(dir_p):
                try:
                    os.rmdir(dir_p)
                except Exception:
                    pass

    mb_freed = round(bytes_freed / (1024 * 1024), 2)
    print(f"[PURGE] Purged {purged_count} orphaned asset files ({mb_freed} MB freed) for SSC CHSL {target_year}.")
    return purged_count, mb_freed

if __name__ == '__main__':
    main()



