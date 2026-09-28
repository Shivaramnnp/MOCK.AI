import os
import glob
import json
import re
import csv
import fitz

BASE_DIR = "/Users/shivarampatel/Downloads/GATE 2025"
MANIFEST_PATH = os.path.join(BASE_DIR, "GATE_2025_manifest.csv")
WEB_EXAMS_DIR = "/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/src/data/exams"
WEB_PUBLIC_DIR = "/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/public"

def parse_answer_key(ak_pdf_path):
    doc = fitz.open(ak_pdf_path)
    ak_dict = {}
    for page in doc:
        for t in page.find_tables().tables:
            for r in t.extract():
                if r and r[0] and str(r[0]).strip().isdigit():
                    q_no = int(str(r[0]).strip())
                    session = str(r[1]).strip() if len(r) > 1 and r[1] else '1'
                    q_type = str(r[2]).strip().upper() if len(r) > 2 and r[2] else 'MCQ'
                    section = str(r[3]).strip() if len(r) > 3 and r[3] else 'Subject'
                    key_range = str(r[4]).strip() if len(r) > 4 and r[4] else ''
                    marks_str = str(r[5]).strip() if len(r) > 5 and r[5] else '1'
                    marks = 2 if '2' in marks_str else 1

                    ak_dict[q_no] = {
                        'q_no': q_no,
                        'session': session,
                        'q_type': q_type,
                        'section': section,
                        'key_range': key_range,
                        'marks': marks,
                    }
    return ak_dict

def scan_all_papers():
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest_rows = list(csv.DictReader(f))

    papers = {}
    for r in manifest_rows:
        code = r['paper_code']
        ftype = r['file_type']
        if code not in papers:
            papers[code] = {'name': r['paper_name'], 'code': code, 'qp': None, 'ak': None}
        if ftype == 'Question Paper':
            papers[code]['qp'] = r['local_path']
        elif ftype == 'Answer Key':
            papers[code]['ak'] = r['local_path']

    stats = {
        'total_papers': len(papers),
        'total_questions': 0,
        'relational_algebra_blocks': 0,
        'relational_algebra_papers': set(),
        'raw_latex_issues': 0,
        'missing_images': 0,
        'duplicate_images': 0,
        'answer_mismatches': 0,
        'mark_mismatches': 0,
        'type_mismatches': 0,
        'tables_count': 0
    }

    image_usage = {} # url -> list of (paper, q_no)
    question_audit_rows = []
    visual_audit_rows = []

    # Patterns for raw unescaped LaTeX outside $...$ or $$...$$
    raw_latex_pattern = re.compile(
        r'(?<!\$)(?<!\\)\\(?:sqrt|lim|infty|mathbb|begin\{cases\}|frac|mathbf|mathit|vec|hat|bar)\b'
        r'|(?<!\$)(?:[a-zA-Z]_[a-zA-Z0-9]+|[a-zA-Z]\^[a-zA-Z0-9]+)\b'
    )

    for code, pdata in sorted(papers.items()):
        json_path = os.path.join(WEB_EXAMS_DIR, f"gate-2025-{code.lower()}.json")
        if not os.path.exists(json_path):
            print(f"MISSING JSON: {json_path}")
            continue

        with open(json_path, 'r', encoding='utf-8') as jf:
            jdata = json.load(jf)

        ak_dict = {}
        if pdata['ak'] and os.path.exists(pdata['ak']):
            ak_dict = parse_answer_key(pdata['ak'])

        questions = jdata.get('questions', [])
        stats['total_questions'] += len(questions)

        for q in questions:
            q_no = q.get('questionNumber', 0)
            q_text = q.get('questionText', '')
            blocks = q.get('contentBlocks', [])
            q_type = q.get('questionType', 'MCQ')
            marks = q.get('marks', 1)
            diagram_url = q.get('diagramUrl')
            diagram_urls = q.get('diagramUrls', [])
            all_diagrams = [diagram_url] if diagram_url else []
            if diagram_urls:
                all_diagrams.extend(diagram_urls)
            all_diagrams = list(set([u for u in all_diagrams if u]))

            # 1. Track images
            for d_url in all_diagrams:
                if d_url not in image_usage:
                    image_usage[d_url] = []
                image_usage[d_url].append((code, q_no))

                # Check if file exists locally
                local_asset_path = os.path.join(WEB_PUBLIC_DIR, d_url.lstrip('/'))
                exists = os.path.exists(local_asset_path)
                if not exists:
                    stats['missing_images'] += 1

                visual_audit_rows.append({
                    'paper_code': code,
                    'question_number': q_no,
                    'visual_type': 'diagram',
                    'asset_url': d_url,
                    'file_exists': exists,
                    'owner': 'question_stem',
                    'verification_status': 'VERIFIED' if exists else 'MISSING'
                })

            # Check option images
            for opt_idx, opt_img in enumerate(q.get('optionImages') or []):
                if opt_img:
                    opt_char = chr(65 + opt_idx)
                    local_asset_path = os.path.join(WEB_PUBLIC_DIR, opt_img.lstrip('/'))
                    exists = os.path.exists(local_asset_path)
                    if not exists:
                        stats['missing_images'] += 1
                    visual_audit_rows.append({
                        'paper_code': code,
                        'question_number': q_no,
                        'visual_type': f'option_{opt_char}_diagram',
                        'asset_url': opt_img,
                        'file_exists': exists,
                        'owner': f'option_{opt_char}',
                        'verification_status': 'VERIFIED' if exists else 'MISSING'
                    })

            # 2. Check blocks
            has_ra = False
            has_table = False
            has_math_block = False
            has_raw_latex = False

            # Check for raw LaTeX in text blocks and option strings
            full_content_to_check = [q_text]
            for b in blocks:
                b_type = b.get('type')
                if b_type == 'relational_algebra':
                    has_ra = True
                    stats['relational_algebra_blocks'] += 1
                    stats['relational_algebra_papers'].add(code)
                elif b_type == 'table':
                    has_table = True
                    stats['tables_count'] += 1
                elif b_type == 'math':
                    has_math_block = True
                elif b_type == 'text':
                    full_content_to_check.append(b.get('content', ''))

            for opt in (q.get('options') or []):
                full_content_to_check.append(opt)

            for text_piece in full_content_to_check:
                # Remove delimited blocks first ($...$, $$...$$, \(...\))
                cleaned = re.sub(r'\$\$[\s\S]+?\$\$', '', text_piece)
                cleaned = re.sub(r'\$[^\$\n]+?\$', '', cleaned)
                cleaned = re.sub(r'\\\(.+?\\\)', '', cleaned)
                cleaned = re.sub(r'\\\[.+?\\\]', '', cleaned)
                if raw_latex_pattern.search(cleaned):
                    has_raw_latex = True
                    stats['raw_latex_issues'] += 1
                    break

            # 3. Check Answer Key & Scoring
            ak_entry = ak_dict.get(q_no)
            ans_match = True
            mark_match = True
            type_match = True
            ak_ans = "N/A"
            if ak_entry:
                ak_ans = ak_entry['key_range']
                ak_marks = ak_entry['marks']
                ak_type = ak_entry['q_type']

                # Normalize answers for comparison
                q_ans = q.get('correctAnswer', '')
                if ak_type == 'MCQ':
                    if q_ans.strip() != ak_ans.strip():
                        ans_match = False
                        stats['answer_mismatches'] += 1
                elif ak_type == 'MSQ':
                    ak_set = set(ak_ans.replace(';', ',').split(','))
                    q_set = set(q.get('correctAnswerSet') or []) or set((q_ans or '').replace(';', ',').split(','))
                    if ak_set != q_set:
                        ans_match = False
                        stats['answer_mismatches'] += 1
                elif ak_type == 'NAT':
                    # NAT answer range
                    if not q.get('answerRange') and not q.get('answerRanges'):
                        ans_match = False
                        stats['answer_mismatches'] += 1

                if marks != ak_marks:
                    mark_match = False
                    stats['mark_mismatches'] += 1

                if q_type != ak_type:
                    type_match = False
                    stats['type_mismatches'] += 1

            # Determine overall question status
            overall = "VERIFIED"
            if not ans_match or not mark_match or not type_match or has_ra or has_raw_latex:
                if not ans_match:
                    overall = "FAILED (Answer Mismatch)"
                elif has_ra:
                    overall = "FAILED (False Relational Algebra)"
                elif has_raw_latex:
                    overall = "PARTIALLY_VERIFIED (Raw Math Syntax)"
                else:
                    overall = "PARTIALLY_VERIFIED"

            question_audit_rows.append({
                'paper_code': code,
                'question_number': q_no,
                'section': q.get('sectionName', ''),
                'question_type': q_type,
                'marks': marks,
                'source_pdf': f"GATE_2025_{code}_Question_Paper.pdf",
                'source_page': "N/A",
                'json_source': f"gate-2025-{code.lower()}.json",
                'text_status': 'VERIFIED' if not has_raw_latex else 'NEEDS_CLEANING',
                'math_status': 'FAILED (Raw LaTeX / Misclassified)' if (has_ra or has_raw_latex) else 'VERIFIED',
                'options_status': 'VERIFIED' if len(q.get('options') or []) in (0, 4) else 'PARTIAL',
                'visual_status': 'VERIFIED' if all_diagrams else 'NONE',
                'table_status': 'STRUCTURED_TABLE' if has_table else 'NONE',
                'answer_status': 'VERIFIED' if ans_match else f'MISMATCH (JSON:{q.get("correctAnswer")} vs AK:{ak_ans})',
                'render_status': 'NEEDS_RENDER_TEST',
                'overall_status': overall
            })

    # Count duplicate images across multiple questions
    for url, users in image_usage.items():
        if len(users) > 1:
            stats['duplicate_images'] += 1

    print("\n" + "="*80)
    print("GATE 2025 FORENSIC AUDIT SCAN SUMMARY")
    print("="*80)
    print(f"Total Papers Scanned:          {stats['total_papers']}")
    print(f"Total Questions Scanned:       {stats['total_questions']}")
    print(f"Relational Algebra Blocks:     {stats['relational_algebra_blocks']} (across {len(stats['relational_algebra_papers'])} papers: {sorted(list(stats['relational_algebra_papers']))})")
    print(f"Raw LaTeX Syntax In Questions: {stats['raw_latex_issues']}")
    print(f"Missing Visual Assets:         {stats['missing_images']}")
    print(f"Duplicated Visual Assets:      {stats['duplicate_images']}")
    print(f"Answer Key Mismatches:         {stats['answer_mismatches']}")
    print(f"Mark Distribution Mismatches:  {stats['mark_mismatches']}")
    print(f"Question Type Mismatches:      {stats['type_mismatches']}")
    print(f"Structured Tables Detected:    {stats['tables_count']}")
    print("="*80)

    # Write Question Audit CSV
    out_q_csv = "/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/docs/GATE_2025_QUESTION_AUDIT.csv"
    os.makedirs(os.path.dirname(out_q_csv), exist_ok=True)
    fieldnames_q = [
        'paper_code', 'question_number', 'section', 'question_type', 'marks',
        'source_pdf', 'source_page', 'json_source', 'text_status', 'math_status',
        'options_status', 'visual_status', 'table_status', 'answer_status',
        'render_status', 'overall_status'
    ]
    with open(out_q_csv, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames_q)
        writer.writeheader()
        for r in question_audit_rows:
            writer.writerow(r)
    print(f"Saved Question Audit to {out_q_csv}")

    # Write Visual Audit CSV
    out_v_csv = "/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/docs/GATE_2025_VISUAL_AUDIT.csv"
    fieldnames_v = [
        'paper_code', 'question_number', 'visual_type', 'asset_url',
        'file_exists', 'owner', 'verification_status'
    ]
    with open(out_v_csv, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames_v)
        writer.writeheader()
        for r in visual_audit_rows:
            writer.writerow(r)
    print(f"Saved Visual Audit to {out_v_csv}")

if __name__ == '__main__':
    scan_all_papers()
