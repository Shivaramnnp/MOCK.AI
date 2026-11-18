"""
scripts/ssc_engine_v4/classifier.py

Multi-Signal Content Classifier for Question Content and Visual Artifacts.
Performs evidence fusion across geometry, aspect ratio, text density, OCR confidence,
and semantic visual keywords.
"""

import io
import re
import hashlib
from typing import Tuple, Dict, Any, List, Optional
from PIL import Image

VISUAL_KEYWORDS = [
    'mirror image', 'mirror is placed',
    'paper is folded', 'punched', 'unfolded',
    'embedded in', 'embedded figure', 'hidden in',
    'complete the pattern', 'figure series', 'pattern series',
    'which figure', 'figure given in the options',
    'select the figure', 'replace the question mark', 'following series',
    'folded to form a cube', 'opposite side of', 'faces of a dice', 'dice',
    'pie chart', 'pie-chart', 'bar chart', 'bar graph', 'histogram',
    'shown below', 'figure below', 'given figure'
]

_DIAG_CROP_CACHE = {}

def refine_diagram_crop(img_bytes: bytes, min_gap_px: int = 8, ocr_func=None) -> Tuple[bytes, str]:
    """
    Checks if a diagram has a top text band (e.g. prompt text like
    'What would be the symbol on the opposite side of 7...' or 'Select the correct mirror image...')
    separated by a horizontal white gap (>= min_gap_px) from the authentic visual figure below.
    If so, crops the image to ONLY the visual figure below the gap, and returns
    (cropped_img_bytes, prompt_text). Memoized via SHA-256 hash.
    """
    if not img_bytes:
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
        for y in range(15, min(h - 30, 180)):
            if v_proj[y] == 0:
                gap = 0
                while y + gap < h and v_proj[y + gap] == 0:
                    gap += 1
                if gap >= min_gap_px and (y + gap) < h and sum(v_proj[y + gap : min(h, y + gap + 30)]) > 50:
                    top_band_end = y + gap
                    break
                    
        if not top_band_end:
            _DIAG_CROP_CACHE[h_key] = (img_bytes, '')
            return img_bytes, ''
            
        top_txt = ''
        if ocr_func:
            top_crop = im.crop((0, 0, w, top_band_end))
            top_pad = Image.new('L', (w + 40, top_band_end + 40), 255)
            top_pad.paste(top_crop, (20, 20))
            top_txt = ocr_func(top_pad, config='--psm 6').replace('\n', ' ')
            
        fig_crop = im.crop((0, top_band_end, w, h))
        bbox = fig_crop.getbbox()
        if bbox:
            fig_crop = fig_crop.crop(bbox)
            
        out_buf = io.BytesIO()
        fig_crop.convert('RGB').save(out_buf, format='JPEG', quality=95)
        res = (out_buf.getvalue(), top_txt)
        _DIAG_CROP_CACHE[h_key] = res
        return res
    except Exception:
        _DIAG_CROP_CACHE[h_key] = (img_bytes, '')
        return img_bytes, ''


class MultiSignalContentClassifier:
    """
    Classifies page blocks and visual elements into structural question roles.
    """
    def __init__(self, col_bound: float):
        self.col_bound = col_bound

    def classify_question_images(
        self,
        q_imgs: List[Dict[str, Any]],
        ans_pos: Optional[Tuple[int, float]],
        q_blocks: List[Dict[str, Any]],
        raw_q_text: str = ""
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Classifies images into stem diagrams (diag_imgs) vs option figures (opt_imgs).
        Enforces horizontal column discrimination, vertical extent boundaries,
        and safe empty-marker guards.
        """
        diag_imgs = []
        opt_imgs = []

        if not ans_pos:
            # Without Ans marker, everything belongs to question stem
            return q_imgs, []

        ans_page, ans_y = ans_pos
        # Determine top boundary of option area
        opt_marker_ys = [
            b['pos'][1] for b in q_blocks
            if b['pos'][0] == ans_page and b['pos'] >= ans_pos and re.search(r'(?:^|\n)\s*[1-4]\s*\.', b['text'])
        ]
        y_boundary = min([ans_y - 5.0] + opt_marker_ys)

        for img in q_imgs:
            img_page, img_y0 = img['pos']
            r = img['rect']

            if img_page < ans_page:
                diag_imgs.append(img)
            elif img_page > ans_page:
                if r.x0 >= self.col_bound:
                    opt_imgs.append(img)
                else:
                    diag_imgs.append(img)
            else:
                # Same page as Ans
                if r.y1 <= ans_y + 1.0 or (r.y0 < y_boundary and (r.x0 < self.col_bound or r.width >= 150)):
                    diag_imgs.append(img)
                elif r.y0 >= y_boundary:
                    opt_imgs.append(img)

        diag_imgs.sort(key=lambda img: img['pos'])
        opt_imgs.sort(key=lambda img: img['pos'])

        # 4-Option dimension clustering safeguard:
        # If opt_imgs contains > 4 images, reclassify outlier diagrams back to stem
        if len(opt_imgs) > 4:
            real_opts = []
            for img in opt_imgs:
                if img['rect'].y1 <= (ans_y + 1.0) or (img['rect'].y0 < y_boundary and img['rect'].width >= 150):
                    diag_imgs.append(img)
                else:
                    real_opts.append(img)
            opt_imgs = real_opts
            diag_imgs.sort(key=lambda img: img['pos'])
            opt_imgs.sort(key=lambda img: img['pos'])

        return diag_imgs, opt_imgs

    def is_demotable_text_strip(
        self,
        img_meta: Dict[str, Any],
        ocr_text: str,
        surrounding_text: str = ""
    ) -> bool:
        """
        Determines whether a stem image is actually a text strip that should be demoted
        to native typography rather than kept as a bitmap figure.
        Protects visual reasoning questions, charts, and tables from accidental demotion.
        """
        w, h = img_meta.get('width', 0), img_meta.get('height', 0)
        aspect = w / h if h > 0 else 0
        
        combined_text = (ocr_text + " " + surrounding_text).lower()
        has_visual_kw = any(kw in combined_text for kw in VISUAL_KEYWORDS)
        
        # Guard: never demote if visual reasoning keywords are present
        if has_visual_kw:
            return False
            
        # Must have readable text (>= 12 chars) and strip-like geometry
        if len(ocr_text.strip()) >= 12 and (h <= 140 or aspect >= 3.5):
            return True
            
        return False
