import glob, json, re

exams = glob.glob('/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/src/data/exams/gate-*.json')
print(f'Auditing {len(exams)} GATE exam JSON files...')

malformed_fracs = []
suspicious_pseudocode = []
short_opts = []
relational_algebra_qs = []

for ef in exams:
    with open(ef, 'r', encoding='utf-8') as f:
        data = json.load(f)
    p_code = data.get('paperCode', '')
    p_year = data.get('year', '')
    for q in data.get('questions', []):
        q_num = q['questionNumber']
        q_text = q['questionText']
        opts = q.get('options', [])
        
        # Check for malformed fractions where num == den or underline-like
        for oi, opt in enumerate(opts):
            fm = re.search(r'\\frac\{([^}]+)\}\{([^}]+)\}', opt)
            if fm and fm.group(1).strip() == fm.group(2).strip():
                malformed_fracs.append((p_year, p_code, q_num, oi, opt))
            if q['questionType'] in ['MCQ', 'MSQ'] and len(opt.strip()) < 2 and not opt.strip().isdigit() and not q.get('optionImages'):
                short_opts.append((p_year, p_code, q_num, oi, opt))
                
        # Check for pseudocode label where text doesn't mention code/algorithm/program
        if '```text' in q_text and not any(kw in q_text.lower() for kw in ['pseudocode', 'program', 'algorithm', 'function', 'code', 'loop', 'procedure']):
            suspicious_pseudocode.append((p_year, p_code, q_num))
            
        # Check for relational algebra symbols in prompt
        if any(sym in q_text for sym in ['π', 'σ', '▷◁', '⋈', 'bowtie']):
            relational_algebra_qs.append((p_year, p_code, q_num))

print('Malformed num==den fractions:', malformed_fracs)
print(f'Suspicious pseudocode questions ({len(suspicious_pseudocode)}):', suspicious_pseudocode)
print(f'Short options without images ({len(short_opts)}):', short_opts)
print(f'Relational algebra questions ({len(relational_algebra_qs)}):', relational_algebra_qs)
