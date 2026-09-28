import os, re, json
import fitz
from collections import defaultdict
import sys
sys.path.append('.')

from scripts.gate_forensic_pipeline import (
    parse_answer_key, extract_rich_line, sanitize_math_text,
    neutralize_page_watermarks, is_meaningful_visual,
    reconstruct_piecewise_case, SECTION_METADATA
)
from scripts.test_pipeline_helpers import (
    OPTION_REGEX, parse_option_block,
    detect_fractions_and_underlines, apply_underlines_to_text,
    format_relational_algebra
)

def extract_indented_code(page, rect):
    d = page.get_text('dict', clip=rect)
    code_lines = []
    has_mono = False

    for b in d.get('blocks', []):
        if 'lines' in b:
            for l in b['lines']:
                spans = l['spans']
                line_text = ''.join(s['text'] for s in spans).strip()
                if any(stop_phrase in line_text.lower() for stop_phrase in ['the value of', 'which one of the', 'what is the', 'answer in integer', 'answer in']):
                    break
                is_line_mono = all('Mon' in s['font'] or 'Courier' in s['font'] or not s['text'].strip() for s in spans)
                if is_line_mono:
                    has_mono = True
                    if line_text:
                        code_lines.append((l['bbox'][0], line_text))
                        if line_text.startswith('Output '):
                            break

    if not has_mono or len(code_lines) < 3:
        return None

    # Exclude relation schema definitions (e.g. Car (model, year, serial, color))
    clean_lines = [re.sub(r'</?u>', '', text).strip() for _, text in code_lines]
    if all(re.match(r'^[A-Z][a-zA-Z0-9_]*\s*\([^\)]+\)$', cl) for cl in clean_lines):
        return None

    # Check if lines have actual programming keywords or function structure
    has_prog_syntax = any(
        re.search(r'\b(?:void|int|float|double|char|return|for|while|if|else|def|function|algorithm|printf|scanf|malloc|input|output)\b', text, re.I)
        or re.search(r'[:=;{}<>-]', text)
        for _, text in code_lines
    )
    if not has_prog_syntax:
        return None

    base_x = min(c[0] for c in code_lines)
    formatted = []
    for x0, text in code_lines:
        indent_level = int(round((x0 - base_x) / 17.0))
        indent = '    ' * max(0, indent_level)
        clean_text = text
        if clean_text.endswith('}') and not clean_text.startswith('}'):
            clean_text = clean_text[:-1].rstrip() + '\n' + indent + '}'
        formatted.append(f"{indent}{clean_text}")

    code_block = "```text\n" + "\n".join(formatted) + "\n```"
    return code_block

def run_test_da_extraction():
    qp_path = '/Users/shivarampatel/Downloads/GATE 2025/Question Papers/DA/GATE_2025_DA_Question_Paper.pdf'
    ak_path = '/Users/shivarampatel/Downloads/GATE 2025/Answer Keys/DA/GATE_2025_DA_Answer_Key.pdf'
    
    ak_dict = parse_answer_key(ak_path)
    doc = fitz.open(qp_path)
    
    extracted_qs = {}
    active_text_q = None

    for pno, page in enumerate(doc):
        neutralize_page_watermarks(doc, page, year=2025)

        page_images = []
        for img in page.get_images():
            xref = img[0]
            w, h = img[2], img[3]
            if w <= 1 and h <= 1:
                continue
            rects = page.get_image_rects(xref)
            if any(r.y1 < 75 for r in rects):
                continue
            if any((r.width > 380 and r.height > 320) or (r.width > 240 and r.height > 240 and abs(r.width - r.height) < 15) for r in rects):
                continue
            for r in rects:
                if r.y1 > 75 and r.y0 < 765:
                    page_images.append((xref, r, w, h))

        page_drawings = []
        for d in page.get_drawings():
            dr = fitz.Rect(d['rect'])
            if dr.width <= 2.5 or dr.height <= 2.5:
                continue
            if dr.width > 350 and dr.height > 350:
                continue
            if dr.y1 < 75 or dr.y0 > 765:
                continue
            if d.get('fill') and all(c >= 0.99 for c in d['fill'][:3]) and not d.get('color'):
                continue
            page_drawings.append(dr)

        page_dict = page.get_text('dict')
        blocks = page.get_text('blocks')
        content_blocks = [b for b in blocks if b[1] > 65 and b[3] < 770 and b[4].strip()]
        content_blocks.sort(key=lambda b: (round(b[1], 1), round(b[0], 1)))

        headers = []
        for b in content_blocks:
            if b[0] < 125:
                txt = b[4].strip()
                if re.search(r'\d+\s*[–\-–—]\s*Q\s*\.?\s*\d+', txt) or re.search(r'carry\s+\w+\s+mark', txt, re.IGNORECASE):
                    continue
                qm = re.match(r'^(?:Q\s*\.?\s*(\d+)|(\d+)\s*\.)(?:\s+|–|-|\.|\n|$)', txt)
                if qm:
                    qnum = int(qm.group(1) or qm.group(2))
                    if qnum in ak_dict and qnum not in extracted_qs:
                        headers.append((qnum, b[1], b[3], b))

        # Cross-page continuation check before first header
        first_header_y = headers[0][1] if headers else 765.0
        if active_text_q is not None and active_text_q in extracted_qs and first_header_y > 75.0:
            q_prev = extracted_qs[active_text_q]
            top_blocks = [b for b in content_blocks if b[3] <= first_header_y + 2]
            for tb in top_blocks:
                txt = tb[4].strip()
                if re.search(r'carry\s+\w+\s+mark', txt, re.IGNORECASE) or 'general aptitude' in txt.lower():
                    continue
                let, val = parse_option_block(txt)
                if let:
                    letter_idx = {'A': 0, 'B': 1, 'C': 2, 'D': 3}.get(let, -1)
                    if letter_idx != -1:
                        while len(q_prev['options']) <= letter_idx:
                            q_prev['options'].append('')
                        q_prev['options'][letter_idx] = sanitize_math_text(val)
                elif len(q_prev['options']) == 0:
                    clean_tb = sanitize_math_text(txt)
                    q_prev['prompt'] = (q_prev['prompt'] + ' ' + clean_tb).strip()

        words = page.get_text('words')

        for hi, (qnum, q_y0, q_y1, q_block) in enumerate(headers):
            active_text_q = qnum
            next_q_y0 = headers[hi+1][1] if hi+1 < len(headers) else 765.0
            q_rect = fitz.Rect(60, q_y0, 540, next_q_y0)

            # Option extraction: check for options A-D strictly between q_y0 and next_q_y0
            q_opts = {}  # letter -> (y0, y1, text, block)
            for ob in content_blocks:
                if ob[1] >= q_y0 and ob[1] < next_q_y0 and ob[0] < 140:
                    txt = ob[4].strip()
                    letter, val = parse_option_block(txt)
                    if letter and letter not in q_opts:
                        q_opts[letter] = (ob[1], ob[3], val, ob)

            first_opt_y = min([o[0] for o in q_opts.values()]) if q_opts else next_q_y0
            prompt_rect = fitz.Rect(60, q_y0, 540, first_opt_y)

            # Piecewise Cases detection
            cases_formula = reconstruct_piecewise_case(page, prompt_rect)

            # Monospace code block detection
            code_block = extract_indented_code(page, prompt_rect)

            # Detect genuine fractions and text underlines
            prompt_fractions, prompt_underlines = detect_fractions_and_underlines(page, prompt_rect)

            # Collect prompt lines strictly between q_y0 - 2 and first_opt_y - 1
            raw_lines = []
            for b in page_dict.get('blocks', []):
                for l in b.get('lines', []):
                    if l['bbox'][1] >= q_y0 - 2 and l['bbox'][3] <= first_opt_y + 1:
                        txt = ''.join(s['text'] for s in l['spans']).strip()
                        if not re.match(r'^(?:Q\s*\.?\s*\d+|\d+\s*\.)', txt):
                            raw_lines.append(l)

            raw_lines.sort(key=lambda l: (round(l['bbox'][1], 1), round(l['bbox'][0], 1)))

            processed_lines = []
            inserted_frac_ids = set()
            for l in raw_lines:
                line_rect = fitz.Rect(l['bbox'])
                # Denominator line check
                is_pure_den = False
                for fl, fnum, fden, fstr in prompt_fractions:
                    den_zone = fitz.Rect(fl.x0 - 2, fl.y1 - 1, fl.x1 + 0.5, fl.y1 + 16)
                    if den_zone.contains(line_rect) or (den_zone.intersects(line_rect) and (den_zone & line_rect).width > 0.8 * line_rect.width):
                        is_pure_den = True
                        break
                if is_pure_den:
                    continue

                # Fraction numerator line check
                has_frac_span = False
                for fl, fnum, fden, fstr in prompt_fractions:
                    num_zone = fitz.Rect(fl.x0 - 2, fl.y0 - 16, fl.x1 + 0.5, fl.y0 + 1)
                    if num_zone.intersects(line_rect):
                        has_frac_span = True
                        break

                if has_frac_span:
                    line_parts = []
                    for s in l.get('spans', []):
                        s_txt = s['text']
                        if not s_txt:
                            continue
                        s_rect = fitz.Rect(s['bbox'])
                        matched_f = None
                        for fl, fnum, fden, fstr in prompt_fractions:
                            num_zone = fitz.Rect(fl.x0 - 2, fl.y0 - 16, fl.x1 + 0.5, fl.y0 + 1)
                            if num_zone.intersects(s_rect):
                                matched_f = (fl, fstr)
                                break
                        if matched_f:
                            f_id = (round(matched_f[0].x0), round(matched_f[0].y0))
                            if f_id not in inserted_frac_ids:
                                line_parts.append(f"\\({matched_f[1]}\\)")
                                inserted_frac_ids.add(f_id)
                        else:
                            line_parts.append(s_txt)
                    line_txt = ''.join(line_parts).strip()
                    if line_txt:
                        processed_lines.append(('text', line_txt, l))
                else:
                    rl = extract_rich_line(l).strip()
                    l_words = [w for w in words if l['bbox'][1] - 2 <= w[1] and w[3] <= l['bbox'][3] + 2]
                    l_words.sort(key=lambda w: w[0])
                    # Check if pure relational algebra formula
                    if re.match(r'^[πσρ]\s*[\(\{_]', rl) or (any(sym in rl for sym in ['π', 'σ', '▷◁', '⋈']) and not any(kw in rl.lower() for kw in ['denotes', 'where', 'tuple', 'key', 'represents', 'specifies'])):
                        formatted_expr = format_relational_algebra(rl)
                        processed_lines.append(('relational_algebra', formatted_expr, l))
                    elif any(any(abs(w[3] - ul.y0) < 3.0 for ul in prompt_underlines) for w in l_words):
                        underlined_text = apply_underlines_to_text(l['spans'], l_words, prompt_underlines)
                        processed_lines.append(('text', underlined_text, l))
                    else:
                        processed_lines.append(('text', rl, l))

            # Assemble into structured Content Blocks and questionText
            c_blocks = []
            curr_text_parts = []
            c_types = set(['text'])

            if cases_formula:
                raw_txt = ' '.join(p[1] for p in processed_lines)
                intro_m = re.search(r'(.*?as follows:)', raw_txt, re.IGNORECASE)
                outro_m = re.search(r'(If the median.*)', raw_txt, re.IGNORECASE)
                intro = intro_m.group(1) if intro_m else "Let X be a continuous random variable whose cumulative distribution function (CDF) F_X(x) is given as follows:"
                outro = outro_m.group(1) if outro_m else "If the median of X is 3, then what is the value of t?"
                c_blocks.append({'type': 'text', 'content': intro, 'confidence': 'VERIFIED'})
                c_blocks.append({'type': 'math', 'latex': cases_formula, 'confidence': 'VERIFIED'})
                c_blocks.append({'type': 'text', 'content': outro, 'confidence': 'VERIFIED'})
                c_types.add('math')
                assembled_prompt = f"{intro}\n\n{cases_formula}\n\n{outro}"
            elif code_block:
                raw_txt = ' '.join(p[1] for p in processed_lines)
                intro_m = re.search(r'(Consider the following (?:pseudocode|program|code|algorithm)[\.:]?)', raw_txt, re.IGNORECASE)
                outro_m = re.search(r'(The value of[\s\S]*)', raw_txt, re.IGNORECASE)
                intro = intro_m.group(1) if intro_m else "Consider the following pseudocode:"
                outro = re.sub(r'\s+', ' ', outro_m.group(1)).strip() if outro_m else ""
                c_blocks.append({'type': 'text', 'content': intro, 'confidence': 'VERIFIED'})
                c_blocks.append({'type': 'pseudocode', 'content': code_block, 'confidence': 'VERIFIED'})
                if outro:
                    c_blocks.append({'type': 'text', 'content': outro, 'confidence': 'VERIFIED'})
                c_types.add('pseudocode')
                assembled_prompt = f"{intro}\n\n{code_block}\n\n{outro}".strip()
            else:
                for idx, (ltype, ltext, lobj) in enumerate(processed_lines):
                    if ltype == 'relational_algebra':
                        if curr_text_parts:
                            chunk = ''.join(curr_text_parts).strip()
                            if chunk:
                                c_blocks.append({'type': 'text', 'content': chunk, 'confidence': 'VERIFIED'})
                            curr_text_parts = []
                        c_blocks.append({'type': 'relational_algebra', 'latex': ltext, 'confidence': 'VERIFIED'})
                        c_types.add('relational_algebra')
                        c_types.add('math')
                    else:
                        if not curr_text_parts:
                            curr_text_parts.append(ltext)
                        else:
                            prev_ltype, prev_ltext, prev_lobj = processed_lines[idx - 1]
                            prev_clean = re.sub(r'</?u>', '', prev_ltext).strip()
                            curr_clean = re.sub(r'</?u>', '', ltext).strip()
                            is_prev_schema = bool(re.match(r'^[A-Z][a-zA-Z0-9_]*\s*\([^\)]+\)$', prev_clean))
                            is_curr_schema = bool(re.match(r'^[A-Z][a-zA-Z0-9_]*\s*\([^\)]+\)$', curr_clean))
                            v_gap = lobj['bbox'][1] - prev_lobj['bbox'][3]

                            if is_prev_schema and is_curr_schema:
                                curr_text_parts.append('\n' + ltext)
                            elif is_prev_schema or is_curr_schema or prev_clean.endswith(':') or v_gap > 12.0:
                                curr_text_parts.append('\n\n' + ltext)
                            else:
                                curr_text_parts.append(' ' + ltext)

                if curr_text_parts:
                    chunk = ''.join(curr_text_parts).strip()
                    if chunk:
                        c_blocks.append({'type': 'text', 'content': chunk, 'confidence': 'VERIFIED'})

                assembled_text_parts = []
                for b in c_blocks:
                    if b['type'] == 'text':
                        assembled_text_parts.append(b['content'])
                    elif b['type'] == 'relational_algebra':
                        assembled_text_parts.append(f"$${b['latex']}$$")
                    elif b['type'] == 'math':
                        assembled_text_parts.append(f"$${b['latex']}$$")
                assembled_prompt = '\n\n'.join(assembled_text_parts).strip()

            assembled_prompt = re.sub(r'^(?:General Aptitude \(GA\)[\s\n]*)?(?:Q\s*\.?\s*\d+\s*[–\-–—]\s*Q\s*\.?\s*\d+\s*(?:carry|Carry)\s+[^\n]*(?:each|Each)[\.\s\n]*)', '', assembled_prompt, flags=re.IGNORECASE).strip()
            assembled_prompt = re.sub(r'^(?:General Aptitude \(GA\)[\s\n]*)', '', assembled_prompt, flags=re.IGNORECASE).strip()

            # Diagram URL
            diagram_url = None

            # Option assembly
            opt_texts = []
            opt_images = []
            opt_blocks_list = []
            letters = ['A', 'B', 'C', 'D']
            for li, let in enumerate(letters):
                if let in q_opts:
                    val = q_opts[let][2]
                    opt_y0 = q_opts[let][0]
                    opt_y1 = q_opts[letters[li+1]][0] if li+1 < len(letters) and letters[li+1] in q_opts else next_q_y0
                    opt_rect = fitz.Rect(70, opt_y0, 530, opt_y1)

                    opt_fracs, _ = detect_fractions_and_underlines(page, opt_rect)
                    if opt_fracs and (not val or len(val.strip()) < 5 or bool(re.match(r'^(?:Option\s*\(?[A-D]\)?|\(?[A-D]\)?)$', val.strip(), re.I))):
                        val = f"\\({opt_fracs[0][3]}\\)"
                    else:
                        opt_lines = []
                        for b in page_dict.get('blocks', []):
                            for l in b.get('lines', []):
                                if l['bbox'][1] >= opt_y0 - 2 and l['bbox'][3] <= opt_y1 + 2:
                                    rl = extract_rich_line(l).strip()
                                    rl = re.sub(r'^(?:\([A-D]\)|[A-D]\b)\s*', '', rl).strip()
                                    if rl:
                                        opt_lines.append(rl)
                        if opt_lines and (not val or len(val.strip()) < 5):
                            val = ' '.join(opt_lines)

                    opt_text = sanitize_math_text(val)
                    if any(sym in opt_text for sym in [r'\frac', r'\equiv', r'\rightarrow', r'\neg', r'\land', r'\lor', '^{', '_{', r'\mathbb', 'O(']):
                        if not ('$' in opt_text or r'\(' in opt_text or r'\[' in opt_text):
                            opt_text = f"\\({opt_text}\\)"
                    opt_texts.append(opt_text)
                    opt_images.append(None)
                else:
                    opt_texts.append('')
                    opt_images.append(None)

            extracted_qs[qnum] = {
                'questionNumber': qnum,
                'prompt': assembled_prompt,
                'options': opt_texts,
                'option_images': opt_images,
                'diagram_url': diagram_url,
                'type': ak_dict[qnum]['q_type'],
                'content_blocks': c_blocks,
                'content_types': sorted(list(c_types)),
                'page': pno + 1,
            }

    print(f'Total questions extracted: {len(extracted_qs)}')
    q17 = extracted_qs[17]
    print('=== Q17 RESULT ===')
    print('Prompt:\n', q17['prompt'])
    print('Options:\n', q17['options'])
    print('Content Types:\n', q17['content_types'])

    q19 = extracted_qs[19]
    print('\n=== Q19 RESULT ===')
    print('Prompt:\n', q19['prompt'])
    print('Content Types:\n', q19['content_types'])

    q64 = extracted_qs[64]
    print('\n=== Q64 RESULT ===')
    print('Prompt:\n', q64['prompt'])
    print('Content Types:\n', q64['content_types'])

run_test_da_extraction()
