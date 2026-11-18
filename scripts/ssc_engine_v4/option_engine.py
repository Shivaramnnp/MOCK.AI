"""
scripts/ssc_engine_v4/option_engine.py

Option Engine for 1-to-1 Spatial Slot Assignment and Collision Forensics.
Eliminates greedy fallback leakage and prevents option duplication.
"""

import re
from typing import List, Dict, Any, Tuple, Optional, Set

def clean_and_normalize_option_text(text: str) -> str:
    """Cleans option text, removing stray bounding characters and extra spaces."""
    if not text:
        return ""
    t = text.strip()
    # Normalize unicode curly quotes and quotes
    t = t.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')
    # Normalize currency: Z, %, £, ~, 2 before currency patterns -> ₹
    t = re.sub(r'^[Zz%£~]\s*(\d+([,\.]\d+)*)', r'₹\1', t)
    t = re.sub(r'^2(\d{2,3}(?:,\d{2,3})+)', r'₹\1', t) # e.g. 24,00,000 -> ₹4,00,000
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
    # Normalize operator pairs (e.g. "+andx", "—and+", "—and x", "+and—")
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
    # Normalize trigonometric powers & angles (e.g. "2sec26", "2cot?6", "2cos26", "2sin20")
    if not re.search(r'\b(sec|seconds?)$', t, re.IGNORECASE):
        m_trig = re.match(r'^(\d*)\s*(sin|cos|tan|cot|sec|cosec)\s*([23²³\?\*7]?)\s*([0689oO\?θ\u03b8@])?$', t, re.IGNORECASE)
        if m_trig:
            coeff = m_trig.group(1)
            func = m_trig.group(2).lower()
            pwr = m_trig.group(3)
            pwr_str = '^2' if pwr in ['2', '²', '?', '*', '7'] else (f'^{pwr}' if pwr else '')
            t = f"${coeff}\\{func}{pwr_str}\\theta$"
    # Normalize OCR bracket noise in analogy expressions: e.g. FH] : -> FHI :, GI] -> GI
    t = re.sub(r'([A-Z]+)\]\s*:', r'\1I :', t)
    t = re.sub(r'\]\s*$', '', t)
    return t

def is_promotable_option_text(text: str) -> bool:
    """
    Returns True if text represents a clean, unambiguous option value
    (number, single letter, percentage, currency, short phrase, ratio, LaTeX math)
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

    # 0. LaTeX math / fractions / expressions / inequalities
    if ('\\frac{' in t) and not any(kw in t.lower() for kw in ['mirror', 'figure', 'dice', 'cube']):
        m_fr = re.search(r'\\frac\{([^}]+)\}\{([^}]+)\}', t)
        if m_fr:
            num, den = m_fr.group(1), m_fr.group(2)
            num_clean = re.sub(r'\\(?:sqrt|pm|theta)', '', num).strip()
            den_clean = re.sub(r'\\(?:sqrt|pm|theta)', '', den).strip()
            if re.search(r'[A-Z]\s+[A-Z]', num_clean) or re.search(r'[A-Z]\s+[A-Z]', den_clean):
                return False
        return True
    if t.startswith('$') and t.endswith('$') and len(t) >= 4:
        return True

    # 1. Pure integer or decimal number (with or without thousand-separator commas)
    if re.match(r'^\d{1,3}(,\d{2,3})+(\.\d+)?$', t) or re.match(r'^\d+(\.\d+)?$', t):
        return True

    # 1b. Tuples of integers in parentheses: e.g. "(25, 81)", "(18, 9, 165)"
    if re.match(r'^\(\s*\d+\s*(?:,\s*\d+\s*)+\)$', t):
        return True

    # 1c. Number triads or pairs with hyphens/dashes: e.g. "46-41-12", "16-9-21", "46-141", "3-48-54-45-42"
    if re.match(r'^\d+(\s*[-–—]\s*\d+)+$', t):
        return True

    # 2. Percentage: e.g. "25%", "76.5%", "12.5%", "7.90%"
    if re.match(r'^\d+(\.\d+)?\s*%$', t):
        return True

    # 3. Currency: e.g. "₹135", "₹5,50,000", "₹50,000"
    if re.match(r'^[₹$]\s*\d+([,\.]\d+)*$', t):
        return True

    # 4. Single uppercase or lowercase letter: e.g. "V", "Z", "X", "W", "a", "b"
    if re.match(r'^[A-Za-z]$', t):
        return True

    # 5. Reasoning code words: 2-4 uppercase ("ABCD", "TVW", "GREN") or 2-3 lowercase ("pl", "rq", "jn", "mp", "ge", "fp", "mz", "ze")
    if (re.match(r'^[A-Z]{2,4}$', t) or re.match(r'^[a-z]{2,3}$', t)) and t.lower() not in ['er', 're', 'te', 'so', 'sl', 'au', 'oa', 'as', 'es', 'is', 'at', 'an', 'in', 'on', 'to', 'by', 'or', 'if', 'we', 'he', 'me', 'us', 'am']:
        return True

    # 6. Letter/word pair analogy: e.g. "TVW : YAB", "Foot : Ankle", "Cow — Buffalo", "Safe — Secure"
    if re.match(r'^[A-Za-z]+(\s+[A-Za-z]+)*\s*[:–—\-]\s*[A-Za-z]+(\s+[A-Za-z]+)*$', t):
        return True

    # 6b. Operator interchange pairs: e.g. "+ and x", "- and +", "+ and -"
    if re.match(r'^[+\-x×÷/]\s+and\s+[+\-x×÷/]$', t, re.IGNORECASE) or re.match(r'^[+\-x×÷/]\s*,\s*[+\-x×÷/]$', t, re.IGNORECASE):
        return True

    # 7. Units of measurement: e.g. "15 days", "20 days", "42 km/h", "94.66 km/hr", "512 cm3", "625 cm²", "5 cm", "150 sec"
    if re.match(r'^\d+(\.\d+)?\s*(days?|hours?|years?|months?|km/h|km/hr|kmph|m/s|cm/s|cm[23²³]?|m[23²³]?|kg|g|quintals?|sec)\b', t, re.IGNORECASE):
        return True

    # 8. Profit / Loss phrases: e.g. "12% Profit", "15% Loss", "Profit, 36%", "Loss, 47%", "Loss, ₹36", "Profit of 2%"
    if re.match(r'^(?:Profit|Loss)\s*(?:of\s*)?,?\s*[₹$]?\s*\d+(\.\d+)?%?$', t, re.IGNORECASE) or re.match(r'^\d+(\.\d+)?%\s*(Profit|Loss)\b', t, re.IGNORECASE):
        return True

    # 9. Degree angles: e.g. "100°", "105°", "120°", "37°"
    if re.match(r'^\d+°$', t):
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

    # 13. Short clean dictionary words / names (e.g. seasons, authors, family terms, countries):
    words = t.split()
    if 1 <= len(words) <= 3 and all(re.match(r'^[A-Z][a-z]+$', w) or re.match(r'^[a-z]+$', w) for w in words) and len(t) <= 30:
        vowels = sum(1 for c in t.lower() if c in 'aeiou')
        if vowels >= 1 and not re.search(r'[bcdfghjklmnpqrstvwxyz]{4,}', t.lower()) and not re.search(r'(ndv|ndh|xce|qwt)', t.lower()):
            if len(words) > 1 or len(t) <= 8:
                return True

    # 14. Clean natural phrases or sentences (e.g. "India and Bangladesh", "Most people will expect the interest rate to rise in the future."):
    visual_keywords = ['mirror', 'figure', 'dice', 'cube', 'pattern', 'fold', 'embedded', 'shown below', 'given figure']
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


class OptionSpatialMatcher:
    """
    Performs strict 1-to-1 spatial matching of option images to option slots.
    FORBIDS greedy zip assignment of unassigned images.
    """
    @staticmethod
    def match_options(
        opt_imgs: List[Dict[str, Any]],
        opt_positions: Dict[int, Tuple[int, float]],
        col_bound: float
    ) -> List[Optional[Dict[str, Any]]]:
        """
        Maps option images to slots 0, 1, 2, 3 based strictly on spatial bounds.
        Returns a list of 4 elements (each is either an image dict or None).
        """
        assigned: List[Optional[Dict[str, Any]]] = [None, None, None, None]
        opt_imgs_sorted = sorted(opt_imgs, key=lambda img: img['pos'])
        
        # Case 1: Exactly 4 option images with matching aspect ratio and uniform dimensions
        if len(opt_imgs_sorted) == 4:
            ws = [im['w'] for im in opt_imgs_sorted]
            hs = [im['h'] for im in opt_imgs_sorted]
            is_uniform = (max(ws) - min(ws) <= 45) and (max(hs) - min(hs) <= 45)
            if is_uniform:
                return list(opt_imgs_sorted)

        # Case 2: Proximity-based spatial assignment
        # Match each slot to the nearest image within vertical tolerance (<= 75pt)
        used_img_indices: Set[int] = set()
        for slot in range(4):
            if slot in opt_positions:
                s_pos = opt_positions[slot]
                best_idx = None
                best_dist = 999999.0
                for idx_img, img in enumerate(opt_imgs_sorted):
                    if idx_img in used_img_indices:
                        continue
                    # Must be on the same page
                    if img['pos'][0] != s_pos[0]:
                        continue
                    # Must be in option column
                    if img['rect'].x0 < col_bound:
                        continue
                    dist = abs(img['pos'][1] - s_pos[1])
                    if dist < best_dist and dist <= 75.0:
                        best_dist = dist
                        best_idx = idx_img
                if best_idx is not None:
                    used_img_indices.add(best_idx)
                    assigned[slot] = opt_imgs_sorted[best_idx]

        # NOTE: NEVER greedily assign unassigned images to unassigned slots!
        # Unassigned slots remain None, which triggers REVIEW_REQUIRED if text is also missing.
        return assigned


class OptionDuplicateDetector:
    """
    Detects and handles option collisions ($A == B == C == D$).
    """
    @staticmethod
    def audit_options(
        opt_texts: List[str],
        opt_images: List[Optional[str]]
    ) -> Tuple[bool, str]:
        """
        Checks for invalid duplication.
        Returns (is_valid, reason).
        """
        # If all 4 options are non-empty text, verify they are distinct
        non_empty_texts = [t.strip() for t in opt_texts if t.strip()]
        if len(non_empty_texts) == 4:
            if len(set(non_empty_texts)) < 4:
                # Duplication detected
                return False, f"Duplicate option text detected: {opt_texts}"

        # If options are images, verify distinct image URLs
        non_empty_images = [img for img in opt_images if img]
        if len(non_empty_images) == 4:
            if len(set(non_empty_images)) < 4:
                return False, f"Duplicate option image asset detected: {opt_images}"

        return True, "Valid"
