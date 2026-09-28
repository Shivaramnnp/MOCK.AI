import fitz, re, sys
sys.path.append('.')
from scripts.gate_forensic_pipeline import extract_rich_line, sanitize_math_text

doc = fitz.open('/Users/shivarampatel/Downloads/GATE 2025/Question Papers/DA/GATE_2025_DA_Question_Paper.pdf')
page = doc[11]

drawings = page.get_drawings()
h_lines = [fitz.Rect(d['rect']) for d in drawings if fitz.Rect(d['rect']).height <= 2.5 and 8 <= fitz.Rect(d['rect']).width <= 250]
words = page.get_text('words')

underlines = []
for hl in h_lines:
    above = [w for w in words if w[3] <= hl.y0 + 2.0 and w[1] < hl.y0 and abs(w[3] - hl.y0) < 12 and not (w[2] < hl.x0 - 4 or w[0] > hl.x1 + 4) and w[4] not in ['(A)', '(B)', '(C)', '(D)']]
    below = [w for w in words if w[1] >= hl.y1 - 2.0 and w[3] > hl.y1 and abs(w[1] - hl.y1) < 10 and not (w[2] < hl.x0 - 4 or w[0] > hl.x1 + 4) and w[4] not in ['(A)', '(B)', '(C)', '(D)']]
    if above and not below:
        underlines.append(hl)

def apply_underlines_to_text(line_spans, line_words, underlines):
    result_words = []
    for w in line_words:
        w_rect = fitz.Rect(w[0], w[1], w[2], w[3])
        matched_ul = None
        for ul in underlines:
            if abs(w_rect.y1 - ul.y0) < 2.5:
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
    # Format uppercase relation names
    t = re.sub(r'(?<![\\a-zA-Z0-9_"])\b(Own|Car|Make)\b(?![a-zA-Z0-9_"])', lambda m: r'\text{' + m.group(1) + r'}', t)
    return t

q17_y0 = 90.88
first_opt_y = 364.1

prompt_lines = []
for b in page.get_text('dict')['blocks']:
    for l in b.get('lines', []):
        if l['bbox'][1] >= q17_y0 - 2 and l['bbox'][3] <= first_opt_y - 2:
            rl = extract_rich_line(l).strip()
            # If line is header
            if re.match(r'^(?:Q\s*\.?\s*\d+|\d+\s*\.)', rl):
                continue
            
            # Check if this line is relational algebra
            if any(sym in rl for sym in ['π', 'σ', '▷◁', '⋈', 'bowtie']):
                rl_clean = format_relational_algebra(rl)
                prompt_lines.append(('relational_algebra', rl_clean))
                continue

            # Check if line has underlined words
            l_words = [w for w in words if l['bbox'][1] - 2 <= w[1] and w[3] <= l['bbox'][3] + 2]
            l_words.sort(key=lambda w: w[0])
            if any(any(abs(w[3] - ul.y0) < 2.5 for ul in underlines) for w in l_words):
                underlined_text = apply_underlines_to_text(l['spans'], l_words, underlines)
                prompt_lines.append(('underlined_text', underlined_text))
            else:
                prompt_lines.append(('text', rl))

print('Extracted prompt lines:')
for ptype, ptxt in prompt_lines:
    print(f'  [{ptype}]: {ptxt}')
