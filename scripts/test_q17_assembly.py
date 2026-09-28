import fitz, re, sys
sys.path.append('.')
from scripts.gate_forensic_pipeline import extract_rich_line, sanitize_math_text

doc = fitz.open('/Users/shivarampatel/Downloads/GATE 2025/Question Papers/DA/GATE_2025_DA_Question_Paper.pdf')
page = doc[11]

drawings = page.get_drawings()
h_lines = [fitz.Rect(d['rect']) for d in drawings if fitz.Rect(d['rect']).height <= 2.5 and 8 <= fitz.Rect(d['rect']).width <= 250]
words = page.get_text('words')

underlines = []
fractions = []
for hl in h_lines:
    above = [w for w in words if w[3] <= hl.y0 + 2.0 and w[1] < hl.y0 and abs(w[3] - hl.y0) < 12 and not (w[2] < hl.x0 - 4 or w[0] > hl.x1 + 4) and w[4] not in ['(A)', '(B)', '(C)', '(D)']]
    below = [w for w in words if w[1] >= hl.y1 - 2.0 and w[3] > hl.y1 and abs(w[1] - hl.y1) < 10 and not (w[2] < hl.x0 - 4 or w[0] > hl.x1 + 4) and w[4] not in ['(A)', '(B)', '(C)', '(D)']]
    if above and below and set(w[4] for w in above) != set(w[4] for w in below):
        num = ''.join(w[4] for w in above).strip().rstrip(',').rstrip('.')
        den = ''.join(w[4] for w in below).strip().rstrip(',').rstrip('.')
        fractions.append((hl, num, den, f"\\frac{{{num}}}{{{den}}}"))
    elif above and not below:
        underlines.append(hl)

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
    t = re.sub(r'(?<![\\a-zA-Z0-9_"])\b(Own|Car|Make)\b(?![a-zA-Z0-9_"])', lambda m: r'\text{' + m.group(1) + r'}', t)
    return t.strip()

q17_y0 = 90.88
first_opt_y = 364.1

page_dict = page.get_text('dict')
raw_lines = []
for b in page_dict.get('blocks', []):
    for l in b.get('lines', []):
        if l['bbox'][1] >= q17_y0 - 2 and l['bbox'][3] <= first_opt_y - 2:
            txt = ''.join(s['text'] for s in l['spans']).strip()
            if not re.match(r'^(?:Q\s*\.?\s*\d+|\d+\s*\.)', txt):
                raw_lines.append(l)

raw_lines.sort(key=lambda l: (round(l['bbox'][1], 1), round(l['bbox'][0], 1)))

processed_lines = []
for l in raw_lines:
    rl = extract_rich_line(l).strip()
    l_words = [w for w in words if l['bbox'][1] - 2 <= w[1] and w[3] <= l['bbox'][3] + 2]
    l_words.sort(key=lambda w: w[0])
    
    # Check if pure relational algebra formula
    if re.match(r'^[πσρ]\s*[\(\{_]', rl) or (any(sym in rl for sym in ['π', 'σ', '▷◁', '⋈']) and not any(kw in rl.lower() for kw in ['denotes', 'where', 'tuple', 'key'])):
        formatted_expr = format_relational_algebra(rl)
        processed_lines.append(('relational_algebra', formatted_expr, l))
    elif any(any(abs(w[3] - ul.y0) < 3.0 for ul in underlines) for w in l_words):
        underlined_text = apply_underlines_to_text(l['spans'], l_words, underlines)
        processed_lines.append(('text', underlined_text, l))
    else:
        processed_lines.append(('text', rl, l))

# Smart assembly into prompt string and structured content blocks
blocks = []
current_text_parts = []
content_types = set(['text'])

for idx, (ltype, ltext, lobj) in enumerate(processed_lines):
    if ltype == 'relational_algebra':
        if current_text_parts:
            text_chunk = ''.join(current_text_parts).strip()
            if text_chunk:
                blocks.append({'type': 'text', 'content': text_chunk, 'confidence': 'VERIFIED'})
            current_text_parts = []
        blocks.append({'type': 'relational_algebra', 'latex': ltext, 'confidence': 'VERIFIED'})
        content_types.add('relational_algebra')
        content_types.add('math')
    else:
        # Determine joining separator with previous line
        if not current_text_parts:
            current_text_parts.append(ltext)
        else:
            prev_ltype, prev_ltext, prev_lobj = processed_lines[idx - 1]
            prev_clean = re.sub(r'</?u>', '', prev_ltext).strip()
            curr_clean = re.sub(r'</?u>', '', ltext).strip()
            is_prev_schema = bool(re.match(r'^[A-Z][a-zA-Z0-9_]*\s*\([^\)]+\)$', prev_clean))
            is_curr_schema = bool(re.match(r'^[A-Z][a-zA-Z0-9_]*\s*\([^\)]+\)$', curr_clean))
            v_gap = lobj['bbox'][1] - prev_lobj['bbox'][3]
            
            if is_prev_schema and is_curr_schema:
                current_text_parts.append('\n' + ltext)
            elif is_prev_schema or is_curr_schema or prev_clean.endswith(':') or v_gap > 12.0:
                current_text_parts.append('\n\n' + ltext)
            else:
                current_text_parts.append(' ' + ltext)

if current_text_parts:
    text_chunk = ''.join(current_text_parts).strip()
    if text_chunk:
        blocks.append({'type': 'text', 'content': text_chunk, 'confidence': 'VERIFIED'})

# Build backward-compatible full questionText
assembled_text_parts = []
for b in blocks:
    if b['type'] == 'text':
        assembled_text_parts.append(b['content'])
    elif b['type'] == 'relational_algebra':
        assembled_text_parts.append(f"$${b['latex']}$$")
    elif b['type'] == 'math':
        assembled_text_parts.append(f"$${b['latex']}$$")

assembled_prompt = '\n\n'.join(assembled_text_parts)

print('=== ASSEMBLED PROMPT ===')
print(assembled_prompt)
print('\n=== STRUCTURED BLOCKS ===')
import json
print(json.dumps(blocks, indent=2))
print('\n=== CONTENT TYPES ===')
print(sorted(list(content_types)))
