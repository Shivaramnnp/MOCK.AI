#!/usr/bin/env python3
import os, glob, re, json, fitz
from PIL import Image
import pytesseract
import io

def find_pdf_for_exam(exam_id):
    m = re.match(r'ssc-chsl-(\d{4})-(\d{2})([a-z]{3})-s(\d)', exam_id)
    if not m:
        return None
    year, day, month_str, shift = m.groups()
    months = {'jan':'01', 'feb':'02', 'mar':'03', 'apr':'04', 'may':'05', 'jun':'06', 'jul':'07', 'aug':'08', 'sep':'09', 'oct':'10', 'nov':'11', 'dec':'12'}
    month = months.get(month_str, '07')
    
    pattern = f'{day}-{month}-{year}'
    folder = f'/Users/shivarampatel/Downloads/exam ssc/qp {year}'
    if not os.path.exists(folder):
        folder = f'/Users/shivarampatel/Downloads/exam ssc/qp{year}'
    if not os.path.exists(folder):
        folder = f'/Users/shivarampatel/Downloads/exam ssc/question paper {year}'
        
    shifts_times = {
        '1': ['9-00-AM', '09-00-AM', '9.00-AM'],
        '2': ['11-45-AM', '12-45-PM', '11.45-AM'],
        '3': ['2-30-PM', '02-30-PM', '2.30-PM'],
        '4': ['5-15-PM', '05-15-PM', '5.15-PM']
    }
    
    candidates = glob.glob(os.path.join(folder, f'*{pattern}*.pdf'))
    for c in candidates:
        for t in shifts_times.get(shift, []):
            if t in c:
                return c
    if candidates:
        return candidates[0]
    return None

candidates = [
    ('ssc-chsl-2024-01jul-s1', 64),
    ('ssc-chsl-2024-01jul-s2', 39),
    ('ssc-chsl-2024-01jul-s4', 54),
    ('ssc-chsl-2024-01jul-s4', 67),
    ('ssc-chsl-2024-02jul-s3', 62),
    ('ssc-chsl-2024-03jul-s2', 65),
    ('ssc-chsl-2024-03jul-s3', 69),
    ('ssc-chsl-2024-03jul-s4', 45),
    ('ssc-chsl-2024-08jul-s2', 48),
    ('ssc-chsl-2024-08jul-s3', 45),
    ('ssc-chsl-2024-11jul-s1', 59),
    ('ssc-chsl-2024-01jul-s1', 47),
    ('ssc-chsl-2024-01jul-s3', 35),
    ('ssc-chsl-2024-05jul-s2', 38),
    ('ssc-chsl-2024-11jul-s1', 34),
    ('ssc-chsl-2024-11jul-s2', 28),
    ('ssc-chsl-2024-11jul-s4', 74)
]

if __name__ == '__main__':
    for exam_id, qnum in candidates:
        pdf_path = find_pdf_for_exam(exam_id)
        if not pdf_path or not os.path.exists(pdf_path):
            print(f"PDF not found for {exam_id}")
            continue
            
        doc = fitz.open(pdf_path)
        sec_qnum = ((qnum - 1) % 25) + 1
        sec_idx = (qnum - 1) // 25
        
        json_path = f"web/src/data/exams/{exam_id}.json"
        with open(json_path) as jf:
            jdata = json.load(jf)
        curr_q = next((q for q in jdata['questions'] if q['questionNumber'] == qnum), None)
        
        print(f"\n==========================================")
        print(f"Exam: {exam_id} | Q{qnum} (Sec {sec_idx+1} Q.{sec_qnum})")
        if curr_q:
            print(f"Current Stem: {curr_q.get('questionText')}")
            print(f"Current Options: {curr_q.get('options')}")
            print(f"Current Key: {curr_q.get('correctAnswer')}")
        
        target_page = None
        for p_idx, page in enumerate(doc):
            text = page.get_text()
            pattern = rf'Q\.\s*{sec_qnum}\b'
            if re.search(pattern, text):
                target_page = p_idx
                break
                
        if target_page is not None:
            p = doc[target_page]
            ptxt = p.get_text()
            print(f"Page {target_page+1} text around Q.{sec_qnum}:")
            lines = ptxt.splitlines()
            for l_i, line in enumerate(lines):
                if re.search(rf'Q\.\s*{sec_qnum}\b', line):
                    print("\n".join(lines[max(0, l_i):min(len(lines), l_i+15)]))
                    break
                    
            imgs = p.get_images()
            print(f"Page has {len(imgs)} images")
