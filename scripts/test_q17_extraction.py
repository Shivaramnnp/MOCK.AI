import fitz, re

doc = fitz.open('/Users/shivarampatel/Downloads/GATE 2025/Question Papers/DA/GATE_2025_DA_Question_Paper.pdf')
page = doc[11]

# 1. Detect fractions and underlines
drawings = page.get_drawings()
h_lines = [fitz.Rect(d['rect']) for d in drawings if fitz.Rect(d['rect']).height <= 2.5 and 8 <= fitz.Rect(d['rect']).width <= 250]
words = page.get_text('words')

underlines = []
fractions = []
for hl in h_lines:
    above = [w for w in words if w[3] <= hl.y0 + 2.0 and w[1] < hl.y0 and abs(w[3] - hl.y0) < 12 and not (w[2] < hl.x0 - 4 or w[0] > hl.x1 + 4) and w[4] not in ['(A)', '(B)', '(C)', '(D)']]
    below = [w for w in words if w[1] >= hl.y1 - 2.0 and w[3] > hl.y1 and abs(w[1] - hl.y1) < 10 and not (w[2] < hl.x0 - 4 or w[0] > hl.x1 + 4) and w[4] not in ['(A)', '(B)', '(C)', '(D)']]
    
    # Fractions require distinct words above and below
    if above and below and set(w[4] for w in above) != set(w[4] for w in below):
        num = ''.join(w[4] for w in above).strip().rstrip(',').rstrip('.')
        den = ''.join(w[4] for w in below).strip().rstrip(',').rstrip('.')
        fractions.append((hl, num, den, f"\\frac{{{num}}}{{{den}}}"))
    elif above and not below:
        underlines.append(hl)

print(f'Fractions on page 12: {len(fractions)}')
print(f'Underlines on page 12: {len(underlines)}')

# 2. Test option extraction on Q17
blocks = page.get_text('blocks')
content_blocks = [b for b in blocks if b[1] > 65 and b[3] < 770 and b[4].strip()]
content_blocks.sort(key=lambda b: (round(b[1], 1), round(b[0], 1)))

q17_y0 = 90.88
next_q_y0 = 496.86

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

q_opts = {}
for ob in content_blocks:
    if ob[1] >= q17_y0 and ob[1] < next_q_y0 and ob[0] < 140:
        txt = ob[4].strip()
        letter, val = parse_option_block(txt)
        if letter and letter not in q_opts:
            q_opts[letter] = (ob[1], ob[3], val, ob)

print('Extracted option letters:', list(q_opts.keys()))
for let in ['A', 'B', 'C', 'D']:
    print(f'  Opt {let}:', q_opts[let][2])
