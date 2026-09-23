import re
from pypdf import PdfReader

def extract_paper(pdf_path):
    reader = PdfReader(pdf_path)
    
    # 1. Collect all pages text and identify sections
    # Notice: some pages are ad pages (e.g. page 2 with empty text)
    # Strip running headers: "CHSL Exam 2024 Tier I (01-07-2024 - 9-00 AM - 10-00 AM)", "Page X of Y"
    
    # Let's collect questions page by page, tracking active section
    sections_order = ['english', 'reasoning', 'quant', 'general_awareness']
    section_names = {
        'english': 'English Language',
        'reasoning': 'General Intelligence & Reasoning',
        'quant': 'Quantitative Aptitude',
        'general_awareness': 'General Awareness'
    }
    
    # We can split text by "Section : <name>" or keep track of section transitions
    full_doc_text = ""
    for p_idx, page in enumerate(reader.pages):
        t = page.extract_text()
        # strip header
        t = re.sub(r'CHSL\s+Exam\s+2024\s+Tier\s+I\s*\([^)]*\)', '', t)
        t = re.sub(r'Page\s+\d+\s+of\s+\d+', '', t)
        full_doc_text += f"\n[PAGE_{p_idx+1}]\n" + t
    
    # Also collect all ticks and crosses per page
    # In each question, there are 4 options and 1 TICK
    # Let's inspect how sections are partitioned
    parts = re.split(r'Section\s*:\s*', full_doc_text)
    print(f"Total section parts found: {len(parts)}")
    for i, p in enumerate(parts[1:], start=1):
        lines = p.strip().split('\n')
        sec_title = lines[0].strip()
        qs = re.findall(r'(?:^|\n)\s*Q\.(\d+)', p)
        print(f"Section part {i}: '{sec_title}' -> Qs count: {len(qs)}, first 3: {qs[:3]}")

extract_paper('/Users/shivarampatel/Downloads/exam ssc/qp 2024/CHSL-Exam-2024-Tier-I-01-07-2024-9-00-AM-10-00-AM-Paper.pdf')
