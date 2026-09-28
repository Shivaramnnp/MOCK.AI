import fitz, re, sys
sys.path.append('.')

doc = fitz.open('/Users/shivarampatel/Downloads/GATE 2025/Question Papers/DA/GATE_2025_DA_Question_Paper.pdf')

def extract_page_features(page):
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

    return underlines, fractions, words

# Test on page 12 (Q17)
page12 = doc[11]
underlines, fractions, words = extract_page_features(page12)
print('Page 12: Underlines:', len(underlines), 'Fractions:', len(fractions))

# Test on page 11 (Q14)
page11 = doc[10]
u11, f11, w11 = extract_page_features(page11)
print('Page 11: Underlines:', len(u11), 'Fractions:', len(f11), [f[3] for f in f11])
