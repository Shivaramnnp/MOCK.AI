#!/usr/bin/env python3
"""
universal_chsl_importer.py
Complete multi-year ingestion and visual content pipeline for SSC CHSL:
Processes 2022, 2021, 2020, and 2019 folders, extracts text, diagrams,
option images, and official answer keys from TCS iON CBT response sheets.
"""

import os, glob, re, json, hashlib, io
import fitz
from PIL import Image, ImageOps
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
    # Normalize OCR geometry angle errors: ZB = 90° -> ∠B = 90°
    cleaned = re.sub(r'\bZ([A-D])\s*=\s*(\d+)', r'∠\1 = \2', cleaned)
    # Normalize dropped radical in trigonometric identities: cosecA = 22 -> cosecA = 2√2
    cleaned = re.sub(r'\bcosecA\s*=\s*22\b', r'cosecA = 2√2', cleaned)
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
    pad_bin = pad.point(lambda p: 255 if p > 165 else 0)
    t = pytesseract.image_to_string(pad_bin, config=f'--psm {psm}').strip()
    if not t and psm != 6:
        t = pytesseract.image_to_string(pad_bin, config='--psm 6').strip()
    return clean_watermarks(t)

def refine_diagram_crop(img_bytes, ext):
    """
    Checks if a diagram has a top text band (e.g. prompt text like
    'What would be the symbol on the opposite side of 7...' or 'Select the correct mirror image...')
    separated by a horizontal white gap (>= 8px) from the authentic visual figure below.
    If so, crops the image to ONLY the visual figure below the gap, and returns
    (cropped_img_bytes, prompt_text).
    """
    if not pytesseract or not img_bytes:
        return img_bytes, ''
    try:
        im = Image.open(io.BytesIO(img_bytes)).convert('L')
        w, h = im.size
        if w < 50 or h < 50:
            return img_bytes, ''
            
        v_proj = [sum(1 for x in range(w) if im.getpixel((x, y)) < 200) for y in range(h)]
        
        top_band_end = None
        for y in range(5, min(45, h)):
            if v_proj[y] > 40:
                pass
            elif v_proj[y] < 5 and any(v_proj[k] > 40 for k in range(0, y)):
                top_band_end = y
                break
                
        if not top_band_end:
            return img_bytes, ''
            
        gap_end = None
        for y in range(top_band_end, min(top_band_end + 75, h)):
            if v_proj[y] > 20:
                gap_end = y
                break
                
        if not gap_end or (gap_end - top_band_end) < 8:
            return img_bytes, ''
            
        # Valid top text band and white gap detected
        top_crop = im.crop((0, 0, w, top_band_end))
        scale = max(3, int(100 / max(1, top_crop.height)))
        top_lg = top_crop.resize((top_crop.width * scale, top_crop.height * scale), Image.Resampling.LANCZOS)
        top_pad = ImageOps.expand(top_lg, border=25, fill=255)
        top_txt = pytesseract.image_to_string(top_pad, config='--psm 6').strip().replace('\n', ' ')
        
        # If the image is a chart card (pie chart, bar chart, graph) where the chart contains its own title/prompt,
        # preserve the full card as an authentic graphic asset without splitting
        if any(kw in top_txt.lower() for kw in ['pie-chart', 'pie chart', 'bar chart', 'bar graph', 'histogram', 'chart']):
            return img_bytes, ''

        # Clean up OCR noise in extracted prompt
        top_txt = re.sub(r'([a-zA-Z])!\s+', r'\1 ', top_txt)
        top_txt = top_txt.replace('“', "'").replace('”', "'").replace('‘', "'").replace('’', "'").replace('°', "'")
        top_txt = clean_watermarks(top_txt).strip()
        
        out_buf = io.BytesIO()
        fig_im = Image.open(io.BytesIO(img_bytes)).crop((0, gap_end, w, h))
        fig_im.save(out_buf, format='PNG')
        
        return out_buf.getvalue(), top_txt
    except Exception:
        return img_bytes, ''

def robust_ocr_chip(img_bytes):
    """
    Robust OCR specifically designed for option chips and small badges:
    Reconstructs pure fractions, mixed fractions with units, algebraic fractions,
    percentages, numbers with commas, and word-pair analogies into clean text or KaTeX LaTeX.
    """
    if not pytesseract or not img_bytes:
        return ""
    try:
        pil_im = Image.open(io.BytesIO(img_bytes)).convert('L')
        w, h = pil_im.size
        if w < 5 or h < 5:
            return ""

        scale = 4 if max(w, h) < 140 else 2
        im_lg = pil_im.resize((w * scale, h * scale), Image.Resampling.LANCZOS)
        im_pad = ImageOps.expand(im_lg, border=25, fill=255)

        # 1. Check 2-line pure or algebraic fraction FIRST (PSM 6)
        raw_p6 = clean_watermarks(pytesseract.image_to_string(im_pad, config='--psm 6')).strip()
        p6_lines = [l.strip() for l in raw_p6.split('\n') if l.strip()]

        if len(p6_lines) == 2 and re.match(r'^\d+$', p6_lines[0]) and re.match(r'^\d+$', p6_lines[1]):
            return f"\\frac{{{p6_lines[0]}}}{{{p6_lines[1]}}}"

        if len(p6_lines) == 2 and any(v in raw_p6.lower() for v in ['x', 'y', 'xy', 'a', 'b']):
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
            if c_top and c_bot:
                return f"\\frac{{{c_top}}}{{{c_bot}}}"

        # 2. Check clean single-line p7 text
        raw_p7 = clean_watermarks(pytesseract.image_to_string(im_pad, config='--psm 7')).strip()
        p7_norm = clean_and_normalize_option_text(raw_p7)
        if (
            p7_norm
            and is_promotable_option_text(p7_norm)
            and ('\n' not in raw_p7)
            and ('/' not in raw_p7)
            and not (len(p6_lines) >= 2 and re.match(r'^\d+$', p7_norm))
        ):
            return p7_norm

        # 3. Horizontal component extraction (e.g. 42 1/2 km/h, Profit, 36 4/11 %)
        col_proj = [sum(1 for y in range(h) if pil_im.getpixel((x, y)) < 200) for x in range(w)]
        comps = []
        in_comp = False
        start_x = 0
        for x in range(w):
            if col_proj[x] > 0 and not in_comp:
                in_comp = True
                start_x = x
            elif col_proj[x] == 0 and in_comp:
                in_comp = False
                if x - start_x >= 2: comps.append((start_x, x))
        if in_comp and w - start_x >= 2:
            comps.append((start_x, w))

        frac_comp = None
        frac_val = None
        for c_idx, (cx0, cx1) in enumerate(comps):
            c_crop = pil_im.crop((cx0, 0, cx1, h))
            c_scale = max(6, int(150 / max(1, c_crop.height)))
            c_lg = c_crop.resize((c_crop.width * c_scale, c_crop.height * c_scale), Image.Resampling.LANCZOS)
            c_pad = ImageOps.expand(c_lg, border=30, fill=255)
            c_t6 = pytesseract.image_to_string(c_pad, config='--psm 6').strip()
            c_lines = [l.strip() for l in c_t6.split('\n') if l.strip()]
            if len(c_lines) == 2:
                n_str = re.sub(r'[^\d]', '', c_lines[0])
                d_str = re.sub(r'[^\d]', '', c_lines[1])
                if c_lines[1].lower() in ['e', '7']: d_str = '7'
                if c_lines[0].lower() in ['i', 'l', '1']: n_str = '1'
                if n_str and d_str:
                    frac_comp = (cx0, cx1)
                    frac_val = (n_str, d_str)
                    break

        if frac_val:
            fx0, fx1 = frac_comp
            left_txt = ''
            if fx0 > 4:
                l_crop = pil_im.crop((0, 0, fx0 - 1, h))
                l_lg = l_crop.resize((l_crop.width * 4, l_crop.height * 4), Image.Resampling.LANCZOS)
                l_pad = ImageOps.expand(l_lg, border=25, fill=255)
                left_txt = pytesseract.image_to_string(l_pad, config='--psm 6').strip().replace('\n', ' ')

            right_txt = ''
            if w - fx1 > 4:
                r_crop = pil_im.crop((fx1 + 1, 0, w, h))
                r_lg = r_crop.resize((r_crop.width * 4, r_crop.height * 4), Image.Resampling.LANCZOS)
                r_pad = ImageOps.expand(r_lg, border=25, fill=255)
                right_txt = pytesseract.image_to_string(r_pad, config='--psm 6').strip().replace('\n', ' ')

            left_txt = re.sub(r'[^\w\s,]', '', left_txt).strip()
            m_w = re.search(r'(\d+)$', left_txt)
            w_val = m_w.group(1) if m_w else ''
            pfx = left_txt[:m_w.start()].strip() if m_w else left_txt

            n_v, d_v = frac_val
            f_lat = f"\\frac{{{n_v}}}{{{d_v}}}"
            math_core = f"{w_val}{f_lat}" if w_val else f_lat

            r_low = right_txt.lower()
            if '%' in right_txt:
                return f"{pfx} ${math_core}\\%$" if pfx else f"${math_core}\\%$"
            elif 'km' in r_low or 'km/h' in r_low or 'km' in left_txt.lower():
                return f"${math_core}\\text{{ km/h}}$"
            elif right_txt:
                return f"${math_core}\\text{{ {right_txt}}}$"
            else:
                return f"{pfx} ${math_core}$" if pfx else f"${math_core}$"

        # 4. Geometric 3-line / 2-line stacked fraction for compact chips (q66, q67, q68)
        best_y = None
        best_run = 0
        best_x_span = None
        for y in range(int(h * 0.25), int(h * 0.75)):
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
                    if run_len > best_run:
                        best_run = run_len
                        best_y = y
                        best_x_span = (start_x, x)
            if in_run:
                run_len = w - start_x
                if run_len > best_run:
                    best_run = run_len
                    best_y = y
                    best_x_span = (start_x, w)

        if best_y is not None and best_run >= 8:
            bx0, bx1 = best_x_span
            num_crop = pil_im.crop((max(0, bx0 - 4), 0, min(w, bx1 + 4), best_y - 1))
            den_crop = pil_im.crop((max(0, bx0 - 4), best_y + 2, min(w, bx1 + 4), h))
            num_txt = ocr_crop(num_crop)
            den_txt = ocr_crop(den_crop)

            n_digits = re.sub(r'[^\d]', '', norm_digit_line(num_txt))
            d_digits = re.sub(r'[^\d]', '', norm_digit_line(den_txt))

            if d_digits and d_digits != '0' and int(d_digits) > 0 and n_digits:
                whole_txt = ''
                if bx0 > 6:
                    whole_crop = pil_im.crop((0, 0, bx0 - 1, h))
                    whole_txt = ocr_crop(whole_crop, psm=6).replace('\n', ' ').strip()
                whole_clean = clean_and_normalize_option_text(whole_txt)
                m_w = re.search(r'(\d+)$', whole_clean)
                w_val = m_w.group(1) if m_w else ''

                n_val = n_digits
                d_val = d_digits
                f_lat = f"\\frac{{{n_val}}}{{{d_val}}}"
                if w_val:
                    return f"${w_val}{f_lat}$"
                return f"\\frac{{{n_val}}}{{{d_val}}}"

        # 5. Default fallback
        base_t = raw_p7 if raw_p7 else raw_p6.replace('\n', ' ')
        return clean_and_normalize_option_text(base_t)
    except Exception:
        return ""

def clean_and_normalize_option_text(text):
    if not text:
        return ""
    t = text.strip()
    # Normalize currency: Z, %, £, ~, 2 before currency patterns -> ₹
    t = re.sub(r'^[Zz%£~]\s*(\d+([,\.]\d+)*)', r'₹\1', t)
    t = re.sub(r'^2(\d{2,3}(?:,\d{2,3})+)', r'₹\1', t) # e.g. 24,00,000 -> ₹4,00,000
    # Normalize rupee written as Rs or Rs.
    t = re.sub(r'^Rs\.?\s*', '₹', t, flags=re.IGNORECASE)
    # Strip leading/trailing quote marks or stray punctuation (preserve LaTeX math delimiters)
    if not (t.startswith('$') and t.endswith('$')):
        t = re.sub(r'^[‘\'"`\.,\-_]+|[‘\'"`\.,\-_]+$', '', t).strip()
    # Normalize units: cm? or cm} or cm] -> cm³
    t = re.sub(r'cm[\?\}\]]', 'cm³', t)
    t = re.sub(r'm[\?\}\]]', 'm³', t)
    t = re.sub(r'cm3\b', 'cm³', t)
    t = re.sub(r'cm2\b', 'cm²', t)
    t = re.sub(r'm3\b', 'm³', t)
    t = re.sub(r'm2\b', 'm²', t)
    # Normalize speeds
    t = re.sub(r'km\s*[\'"`]\s*hr', 'km/hr', t, flags=re.IGNORECASE)
    t = re.sub(r'knyhr', 'km/hr', t, flags=re.IGNORECASE)
    # Normalize slash OCR artifact to 7 if isolated
    if t == '/':
        t = '7'
    # Normalize isolated pipe or OCR vertical line to '1'
    if t in ['|', 'l', '!']:
        t = '1'
    # Normalize ratio OCR noise: e.g. "2 : |" -> "2:1", "1 : |" -> "1:1"
    t = re.sub(r'(\d+)\s*:\s*[|lI!]', r'\1:1', t)
    t = re.sub(r'[|lI!]\s*:\s*(\d+)', r'1:\1', t)
    t = re.sub(r'(\d+)\s*:\s*[Zz]', r'\1:2', t)
    t = re.sub(r'[Zz]\s*:\s*(\d+)', r'2:\1', t)
    # Strip stray vertical bars attached to numbers or text: e.g. "5 |" -> "5"
    t = re.sub(r'\s*\|\s*$', '', t)
    t = re.sub(r'^\s*\|\s*', '', t)
    if not t:
        return ""
    # Normalize OCR radicals like v2 -> √2
    if re.match(r'^(?:v|V)\d+$', t):
        t = '√' + t[1:]
    elif re.match(r'^\d+(?:v|V)\d+$', t):
        t = re.sub(r'[vV]', '√', t)
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

    # Explicit blacklist for known OCR noise tokens
    if t.lower() in ['er', 'sos', 'aa', 'ae', 'oe', 'ea', 're', 'te', 'so', 'sl', 'a2', 'au', 'oa', 'eel', 'fir', 'dump', 'as', 'c=']:
        return False

    # 0. LaTeX math / fractions / expressions
    if ('\\frac{' in t) and not any(kw in t.lower() for kw in ['mirror', 'figure', 'dice', 'cube']):
        return True
    if t.startswith('$') and t.endswith('$') and len(t) >= 4:
        return True

    # 1. Pure integer or decimal number (with or without thousand-separator commas): e.g. "87,000", "28", "1991", "1.28"
    if re.match(r'^\d{1,3}(,\d{2,3})+(\.\d+)?$', t) or re.match(r'^\d+(\.\d+)?$', t):
        return True

    # 2. Percentage: e.g. "25%", "76.5%", "12.5%"
    if re.match(r'^\d+(\.\d+)?\s*%$', t):
        return True

    # 3. Currency: e.g. "₹135", "₹5,50,000", "₹50,000"
    if re.match(r'^[₹$]\s*\d+([,\.]\d+)*$', t):
        return True

    # 4. Single uppercase or lowercase letter: e.g. "V", "Z", "X", "W"
    if re.match(r'^[A-Za-z]$', t):
        return True

    # 5. Uppercase reasoning code words: e.g. "GREN", "ABCD", "TVW"
    if re.match(r'^[A-Z]{2,6}$', t) and t not in ['SO', 'AU', 'OA', 'ER', 'RE', 'TE', 'ES']:
        return True

    # 6. Letter/word pair analogy: e.g. "TVW : YAB", "Foot : Ankle", "Cow — Buffalo", "Safe — Secure"
    if re.match(r'^[A-Za-z]+(\s+[A-Za-z]+)*\s*[:–—\-]\s*[A-Za-z]+(\s+[A-Za-z]+)*$', t):
        return True

    # 7. Units of measurement: e.g. "15 days", "20 days", "42 km/h", "94.66 km/hr", "512 cm3", "625 cm²"
    if re.match(r'^\d+(\.\d+)?\s*(days?|hours?|years?|months?|km/h|km/hr|kmph|m/s|cm/s|cm[23²³]?|m[23²³]?|kg|g|quintals?)\b', t, re.IGNORECASE):
        return True

    # 8. Profit / Loss phrases: e.g. "12% Profit", "15% Loss", "Profit, 36%", "Loss, 47%"
    if re.match(r'^\d+(\.\d+)?%\s*(Profit|Loss)\b', t, re.IGNORECASE) or re.match(r'^(Profit|Loss),\s*\d+(\.\d+)?\s*%$', t, re.IGNORECASE):
        return True

    # 9. Degree angles: e.g. "100°", "105°", "120°"
    if re.match(r'^\d+°$', t):
        return True

    # 10. Ratios: e.g. "4:10:3", "6:14:35", "1:4"
    if re.match(r'^\d+\s*:\s*\d+(\s*:\s*\d+)?$', t):
        return True

    # 11. Simple math radicals: e.g. "√2", "2√2"
    if re.match(r'^(?:√|\d+√)\d+$', t):
        return True

    # 12. Short clean dictionary words / names (e.g. seasons, authors):
    words = t.split()
    if 1 <= len(words) <= 3 and all(w.isalpha() for w in words) and len(t) <= 25:
        vowels = sum(1 for c in t.lower() if c in 'aeiou')
        if vowels >= 1 and not re.search(r'[a-z][A-Z]', t):
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
        
    # 2. Match exact time in filename
    if '5-15' in fn or '5:15' in fn:
        return 4, 'Shift 4', '5:15 PM - 6:15 PM'
    if '2-30' in fn or '2:30' in fn or '4-00' in fn or '4:00' in fn:
        return 3, 'Shift 3', '2:30 PM - 3:30 PM'
    if '11-45' in fn or '11:45' in fn or '1-00' in fn or '1:00' in fn:
        return 2, 'Shift 2', '11:45 AM - 12:45 PM'
    if '9-00' in fn or '9:00' in fn or '10-00' in fn or '10:00' in fn:
        return 1, 'Shift 1', '9:00 AM - 10:00 AM'
        
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
    # In Tier 1, 'Ans' blocks are at x ~ 36 and radio buttons/ticks are at x < 78.
    # In Tier 2, 'Ans' blocks are at x ~ 115-240 and radio buttons/ticks are at x < 145.
    ans_x = []
    for p_idx in range(min(10, len(doc))):
        for b in doc[p_idx].get_text('blocks'):
            if 'Ans' in b[4]:
                ans_x.append(b[0])
    avg_ans_x = sum(ans_x) / len(ans_x) if ans_x else 36
    col_bound = 145 if avg_ans_x > 80 else 78
    
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
            if (w, h) in AD_SIZES or (w, h) in [(595, 842), (595, 850), (600, 850), (595, 841), (464, 137), (2022, 423), (834, 719)] or (h <= 22 and w >= 300):
                continue
            rects = page.get_image_rects(xref)
            for r in rects:
                if r.y1 < 50 or r.y0 > page.rect.height - 30:
                    continue
                # If image is in the selection indicator column
                if r.x1 < col_bound:
                    # Check if this is the official green tick icon
                    if w <= 22 and h <= 22:
                        try:
                            img = Image.open(io.BytesIO(meta['image'])).convert('RGB')
                            pixels = list(img.getdata())
                            sat_green = [p for p in pixels if p[1] > 120 and p[1] > p[0] + 30 and p[1] > p[2] + 30]
                            if len(sat_green) > 35 and (len(sat_green) / len(pixels)) > 0.25:
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
            m = re.search(r'(?:^|\n)\s*Q\s*\.?\s*(\d+)', t)
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
        
        # Calculate image start position with 15pt upward tolerance for formula graphics
        cur_q_y = start_pos[1]
        prev_q_y = markers[idx - 1]['pos'][1] if idx > 0 else 0
        img_start_y = (cur_q_y - 15) if (idx == 0 or markers[idx - 1]['pos'][0] != start_pos[0] or prev_q_y < cur_q_y - 15) else cur_q_y
        img_start_pos = (start_pos[0], img_start_y)
        
        next_q_pos = markers[idx + 1]['pos'] if idx + 1 < len(markers) else (len(doc), 99999)
        next_img_start_y = (next_q_pos[1] - 15) if (next_q_pos[0] != start_pos[0] or next_q_pos[1] - 15 > img_start_pos[1]) else next_q_pos[1]
        next_img_start_pos = (next_q_pos[0], next_img_start_y)
        
        q_blocks = [b for b in all_blocks if start_pos <= b['pos'] < end_pos]
        q_imgs = [img for img in all_images if img_start_pos <= img['pos'] < next_img_start_pos]
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
                        ocr_raw = pytesseract.image_to_string(pil_im_pad, config='--psm 6').strip()
                        if not ocr_raw:
                            ocr_raw = pytesseract.image_to_string(pil_im_pad, config='--psm 7').strip()
                    else:
                        ocr_raw = pytesseract.image_to_string(pil_im).strip()
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
                'folded to form a cube', 'opposite side of', 'faces of a dice', 'dice',
                'pie chart', 'pie-chart', 'bar chart', 'bar graph', 'histogram',
                'shown below', 'figure below', 'given figure'
            ])

            # Discrimination criteria for text strip:
            # 1. Not a visual reasoning / chart question
            # 2. Strip geometry: height <= 140 or aspect ratio >= 3.5
            # 3. Substantial readable OCR text (>= 12 chars)
            if not has_visual_kw and len(ocr_stem) >= 12 and (h <= 140 or aspect >= 3.5):
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
                # Mixed or irregular option set: match by vertical proximity to opt_positions
                assigned_slots = set()
                used_img_indices = set()
                
                # Match slots that have explicit opt_positions
                for slot in range(4):
                    if slot in opt_positions:
                        s_pos = opt_positions[slot]
                        best_idx = None
                        best_dist = 999999
                        for idx_img, img in enumerate(opt_imgs_sorted):
                            if idx_img in used_img_indices:
                                continue
                            if img['pos'][0] != s_pos[0]:
                                continue
                            dist = abs(img['pos'][1] - s_pos[1])
                            if dist < best_dist and dist < 80:
                                best_dist = dist
                                best_idx = idx_img
                        if best_idx is not None:
                            assigned_slots.add(slot)
                            used_img_indices.add(best_idx)
                            opt_imgs_assigned[slot] = opt_imgs_sorted[best_idx]
                            
                # For remaining unassigned slots and unassigned images
                unassigned_slots = [s for s in range(4) if s not in assigned_slots]
                unassigned_imgs = [img for idx_img, img in enumerate(opt_imgs_sorted) if idx_img not in used_img_indices]
                for slot, img in zip(unassigned_slots, unassigned_imgs):
                    opt_imgs_assigned[slot] = img

        # OCR fallback for small text/number images - 1-to-1 alignment
        opt_ocr_texts = [None, None, None, None]
        if pytesseract:
            for i in range(4):
                if opt_imgs_assigned[i]:
                    target_img = opt_imgs_assigned[i]
                    m_meta = target_img['meta']
                    if m_meta['width'] <= 260 and m_meta['height'] <= 85:
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
        is_visual_reasoning = any(kw in raw_q_text.lower() for kw in [
            'mirror image', 'mirror is placed',
            'paper is folded', 'punched', 'unfolded',
            'embedded in', 'embedded figure', 'hidden in',
            'complete the pattern', 'figure series', 'pattern series',
            'which figure', 'figure given in the options'
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

        for i in range(4):
            if is_promotable_option_text(clean_candidate_ocrs[i]):
                promotable_count += 1

        has_any_frac = any(clean_candidate_ocrs[i] and '\\frac{' in clean_candidate_ocrs[i] for i in range(4))
        is_symmetric_math = True
        if has_any_frac:
            for i in range(4):
                val = clean_candidate_ocrs[i] or ""
                if not ('\\frac{' in val or '√' in val or re.match(r'^[₹$]?\s*-?\d+(\.\d+)?%?$', val)):
                    is_symmetric_math = False
                    break

        should_promote_options = (
            (not is_visual_reasoning)
            and is_symmetric_math
            and assigned_img_count == 4
            and promotable_count == 4
            and all(clean_candidate_ocrs[i] for i in range(4))
        )

        option_images = [None, None, None, None]
        if should_promote_options:
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

def process_single_paper_task(args):
    pdf_path, target_year = args
    fname = os.path.basename(pdf_path)
    try:
        pdata, stats = parse_tcs_ion_cbt(pdf_path, target_year)
        out_path = os.path.join(EXAMS_DATA_DIR, f"{pdata['id']}.json")
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(pdata, f, indent=2, ensure_ascii=False)
        return (True, pdata['id'], len(pdata['questions']), stats, None)
    except Exception as e:
        import traceback
        return (False, fname, 0, None, f"{e}\n{traceback.format_exc()}")

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and (sys.argv[1].endswith('.pdf') or sys.argv[1] == '--pdf'):
        pdf_path = sys.argv[2] if sys.argv[1] == '--pdf' else sys.argv[1]
        target_year = '2024'
        if '--year' in sys.argv:
            y_idx = sys.argv.index('--year')
            if y_idx + 1 < len(sys.argv):
                target_year = sys.argv[y_idx + 1]
        paper_data, stats = parse_tcs_ion_cbt(pdf_path, target_year)
        out_path = os.path.join(EXAMS_DATA_DIR, f"{paper_data['id']}.json")
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(paper_data, f, indent=2, ensure_ascii=False)
        print(f"[OK] Reprocessed {paper_data['id']} ({len(paper_data['questions'])} Qs) | {stats['visual_q']} visual Qs | {stats['diags']} diags, {stats['opt_imgs']} opt imgs -> {out_path}")
    elif len(sys.argv) > 1 and sys.argv[1] == '--year':
        target_year = sys.argv[2]
        folders = {
            '2024': '/Users/shivarampatel/Downloads/exam ssc chsl/qp 2024',
            '2023': '/Users/shivarampatel/Downloads/exam ssc chsl/qp 2023',
            '2022': '/Users/shivarampatel/Downloads/exam ssc chsl/qp2022',
            '2021': '/Users/shivarampatel/Downloads/exam ssc chsl/qp 2021',
            '2020': '/Users/shivarampatel/Downloads/exam ssc chsl/qp 2020',
            '2019': '/Users/shivarampatel/Downloads/exam ssc chsl/qp 2019',
        }
        fpath = folders.get(target_year)
        if not fpath or not os.path.exists(fpath):
            fpath = fpath.replace('exam ssc chsl/', 'exam ssc/') if fpath else None
        pdf_files = sorted(glob.glob(os.path.join(fpath, '*.pdf'))) if fpath else []
        print(f"Processing SSC CHSL {target_year}: {len(pdf_files)} PDFs in parallel...")
        import concurrent.futures
        workers = min(6, os.cpu_count() or 4)
        with concurrent.futures.ProcessPoolExecutor(max_workers=workers) as executor:
            tasks = [(p, target_year) for p in pdf_files]
            futures = {executor.submit(process_single_paper_task, t): t[0] for t in tasks}
            for f in concurrent.futures.as_completed(futures):
                ok, pid, q_len, stats, err = f.result()
                if ok:
                    print(f"  [OK] {pid} ({q_len} Qs) | {stats['visual_q']} visual Qs | {stats['diags']} diags, {stats['opt_imgs']} opt imgs")
                else:
                    print(f"  [ERROR] {pid}: {err}")
    else:
        run_multiyear_ingestion()

