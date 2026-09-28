import os, re, json
import fitz
from collections import defaultdict
import sys
sys.path.append('.')

from scripts.gate_forensic_pipeline import parse_answer_key, extract_rich_line, sanitize_math_text, neutralize_page_watermarks, is_meaningful_visual

OPTION_REGEX = re.compile(r'^(?:\(([A-D])\)|\(([a-d])\)|([A-D])[\.\:\)](?:\s+|$)|(©))(?:\s*|\n)(.*)', re.DOTALL)

def parse_option_block(txt):
    txt_clean = txt.strip()
    if txt_clean in ['(A)', '(B)', '(C)', '(D)', '(a)', '(b)', '(c)', '(d)']:
        return txt_clean[1].upper(), ''
    if txt_clean in ['A.', 'B.', 'C.', 'D.', 'A:', 'B:', 'C:', 'D:', 'A)', 'B)', 'C)', 'D)']:
        return txt_clean[0].upper(), ''
    m = OPTION_REGEX.match(txt_clean)
    if m:
        letter = m.group(1) or (m.group(2).upper() if m.group(2) else None) or m.group(3) or ('C' if m.group(4) else None)
        rest = (m.group(5) or '').strip()
        return letter, rest
    return None, None

def detect_fractions_and_underlines(page, rect):
    drawings = page.get_drawings()
    h_lines = []
    for d in drawings:
        r = fitz.Rect(d['rect'])
        if r.height < 1.0:
            r.y0 -= 1.0
            r.y1 += 1.0
        if r.height <= 2.5 and 8 <= r.width <= 250 and rect.intersects(r) and rect.y0 < r.y0 < rect.y1:
            h_lines.append(r)

    if not h_lines:
        return [], []

    words = page.get_text('words', clip=rect)
    fractions = []
    underlines = []

    for hl in h_lines:
        above = [w for w in words if w[3] <= hl.y0 + 2.0 and w[1] < hl.y0 and abs(w[3] - hl.y0) < 12 and not (w[2] < hl.x0 - 4 or w[0] > hl.x1 + 4) and w[4] not in ['(A)', '(B)', '(C)', '(D)']]
        below = [w for w in words if w[1] >= hl.y1 - 2.0 and w[3] > hl.y1 and abs(w[1] - hl.y1) < 10 and not (w[2] < hl.x0 - 4 or w[0] > hl.x1 + 4) and w[4] not in ['(A)', '(B)', '(C)', '(D)']]

        if above and below and set(w[4] for w in above) != set(w[4] for w in below):
            num = ''.join(w[4] for w in above).strip().rstrip(',').rstrip('.')
            den = ''.join(w[4] for w in below).strip().rstrip(',').rstrip('.')
            num = re.sub(r'ex\b', 'e^x', num)
            num = re.sub(r'e-x\b', 'e^{-x}', num)
            num = re.sub(r'e−x\b', 'e^{-x}', num)
            fractions.append((hl, num, den, f"\\frac{{{num}}}{{{den}}}"))
        elif above and not below:
            underlines.append(hl)

    return fractions, underlines

def apply_underlines_to_text(line_spans, line_words, underlines):
    result_words = []
    for w in line_words:
        w_rect = fitz.Rect(w[0], w[1], w[2], w[3])
        matched_ul = None
        for ul in underlines:
            if abs(w_rect.y1 - ul.y0) < 3.0:
                overlap = max(0, min(w_rect.x1, ul.x1) - max(w_rect.x0, ul.x0))
                if overlap > 0.5 * (w_rect.width):
                    matched_ul = ul
                    break
        w_text = w[4]
        if matched_ul:
            lead_punct = ''
            trail_punct = ''
            core = w_text
            if core.startswith('('):
                lead_punct = '('
                core = core[1:]
            if core.endswith(','):
                trail_punct = ','
                core = core[:-1]
            elif core.endswith(')'):
                trail_punct = ')'
                core = core[:-1]
            result_words.append(f'{lead_punct}<u>{core}</u>{trail_punct}')
        else:
            result_words.append(w_text)
    return ' '.join(result_words)

def format_relational_algebra(text):
    t = text
    t = t.replace('▷◁', r' \bowtie ')
    t = t.replace('⋈', r' \bowtie ')
    t = t.replace('“', '\"').replace('”', '\"')
    t = re.sub(r'π_\{([^}]+)\}', lambda m: r'\pi_{\text{' + m.group(1) + r'}}', t)
    t = re.sub(r'π\s*([a-zA-Z0-9]+)', lambda m: r'\pi_{\text{' + m.group(1) + r'}}', t)
    t = re.sub(r'σ_\{([^}]+)\}', lambda m: r'\sigma_{\text{' + m.group(1) + r'}}', t)
    t = re.sub(r'σ\s*([a-zA-Z0-9]+)', lambda m: r'\sigma_{\text{' + m.group(1) + r'}}', t)
    t = re.sub(r'ρ_\{([^}]+)\}', lambda m: r'\rho_{\text{' + m.group(1) + r'}}', t)
    t = re.sub(r'(?<![\\a-zA-Z0-9_"])\b([A-Z][a-zA-Z0-9_]*)\b(?![a-zA-Z0-9_"])', lambda m: r'\text{' + m.group(1) + r'}', t)
    return t.strip()

print("Helpers compiled successfully.")
