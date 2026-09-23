#!/usr/bin/env python3
"""
ingest_chsl_2025.py
Pipeline to inspect, normalize, validate, and output the 100-question SSC CHSL 2025 paper
(Similar Paper Held on 13 Nov 2025 Shift 2).
"""

import os
import re
import json
import zipfile
import xml.etree.ElementTree as ET

SOURCE_XLSX = '/Users/shivarampatel/Downloads/exam ssc/mock2025/mock1.xlsx'
OUTPUT_JSON = '/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/src/data/exams/ssc-chsl-2025-13nov-s2.json'

def load_sheet_data(xlsx_path):
    ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(xlsx_path) as z:
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in tree.findall('main:si', ns):
                texts = [t.text for t in si.findall('.//main:t', ns) if t.text]
                shared_strings.append(''.join(texts))

        sheet2_tree = ET.fromstring(z.read('xl/worksheets/sheet2.xml'))
        rows = []
        for row in sheet2_tree.findall('.//main:row', ns):
            row_cells = {}
            for c in row.findall('main:c', ns):
                r = c.attrib.get('r', '')
                t = c.attrib.get('t', '')
                v = c.find('main:v', ns)
                val = v.text if v is not None else ''
                if t == 's' and val:
                    val = shared_strings[int(val)]
                col_letter = ''.join(filter(str.isalpha, r))
                row_cells[col_letter] = val
            rows.append(row_cells)
    return rows[2:]  # Row 3 onwards are the 100 questions

def clean_watermarks(text):
    if not text:
        return ""
    # Strip copyright and branding strings
    text = re.sub(r'Copyright\s*©?\s*\d*\s*Adda247', '', text, flags=re.IGNORECASE)
    text = re.sub(r'©\s*\d*\s*Adda247', '', text, flags=re.IGNORECASE)
    text = re.sub(r'Adda247', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\s{2,}', ' ', text)
    return text.strip()

def process_questions(raw_rows):
    questions = []
    
    for idx, r in enumerate(raw_rows):
        q_num = int(r.get('A', idx + 1))
        raw_q = clean_watermarks(r.get('B', ''))
        raw_opt_a = clean_watermarks(r.get('C', ''))
        raw_opt_b = clean_watermarks(r.get('D', ''))
        raw_opt_c = clean_watermarks(r.get('E', ''))
        raw_opt_d = clean_watermarks(r.get('F', ''))
        raw_ans = r.get('G', '').strip().upper()
        raw_expl = clean_watermarks(r.get('H', ''))
        diagram_url = None

        # Section categorization
        if 1 <= q_num <= 25:
            section_id = 'english'
            section_name = 'English Language'
        elif 26 <= q_num <= 50:
            section_id = 'reasoning'
            section_name = 'General Intelligence & Reasoning'
        elif 51 <= q_num <= 75:
            section_id = 'quant'
            section_name = 'Quantitative Aptitude'
        else:
            section_id = 'general_awareness'
            section_name = 'General Awareness'

        # Specific Question Normalizations
        if q_num == 1:
            # Clean residual table header from Q1 explanation
            marker = "Created From Date"
            if marker in raw_expl:
                raw_expl = raw_expl[:raw_expl.index(marker)].strip() + " · The entomologist examined the insects to identify the species causing crop damage. Meanings of other options: (a) Biologist: Studies living organisms. (c) Ecologist: Studies organism-environment relationships. (d) Zoologist: Studies animals."

        elif q_num == 2:
            # Clean interspersed title words in Q2 explanation
            raw_expl = re.sub(r'aSimilar\s*', '', raw_expl)
            raw_expl = re.sub(r'Paper\s*', '', raw_expl)
            raw_expl = re.sub(r'\(Held\s*', '', raw_expl)
            raw_expl = re.sub(r'on\s*13\s*Nov\s*2025\s*S2\)\s*', '', raw_expl)
            raw_expl = "The correct one-word for the given group of words is (a) Museum. · A Museum is a place where rare, valuable, and historical objects are collected, preserved, and displayed for public viewing. Since the statement mentions rare and historical objects being preserved, museum is the most appropriate one-word substitute. Example: We visited a museum to see ancient coins and historical paintings. Meanings of other options: (b) Library: Place where books are kept. (c) Storage: Place used to store goods safely. (d) Repository: Place where things/data/documents are stored for future use."

        elif q_num == 35 or q_num == 36:
            diagram_url = "/exams/ssc-chsl/2025/13nov-s2/alphabet_positions.png"

        elif q_num == 45:
            raw_q = "AB : BC :: CD : ?"

        elif q_num == 50:
            diagram_url = "/exams/ssc-chsl/2025/13nov-s2/freedom_shift.png"
            raw_expl += " Diagram showing letter shift: +3, +3, +2, +3, +3, +2, +3 pattern."

        elif q_num == 51:
            raw_q = "The curved surface area of a hemisphere is $154\\pi\\text{ cm}^2$. Find its volume (in $\\text{cm}^3$)."
            raw_opt_a = "$\\frac{154\\sqrt{77}\\pi}{3}$"
            raw_opt_b = "$\\frac{155\\sqrt{77}\\pi}{3}$"
            raw_opt_c = "$\\frac{159\\sqrt{77}\\pi}{3}$"
            raw_opt_d = "$\\frac{154\\sqrt{77}\\pi}{5}$"
            raw_expl = "Given: $\\text{CSA} = 154\\pi$. Formula: $\\text{CSA} = 2\\pi r^2$, Volume $V = \\frac{2}{3}\\pi r^3$. $2\\pi r^2 = 154\\pi \\implies r^2 = 77 \\implies r = \\sqrt{77}$. Then $V = \\frac{2}{3}\\pi (\\sqrt{77})^3 = \\frac{154\\sqrt{77}\\pi}{3} \\text{ cm}^3$."

        elif q_num == 52:
            raw_q = "Which of the following sets of fractions is arranged in descending order?"
            raw_opt_a = "$\\frac{1}{3}, \\frac{3}{4}, \\frac{2}{7}, \\frac{2}{3}$"
            raw_opt_b = "$\\frac{3}{4}, \\frac{2}{7}, \\frac{2}{3}, \\frac{1}{3}$"
            raw_opt_c = "$\\frac{3}{4}, \\frac{2}{3}, \\frac{1}{3}, \\frac{2}{7}$"
            raw_opt_d = "$\\frac{3}{4}, \\frac{2}{7}, \\frac{1}{3}, \\frac{2}{3}$"
            raw_expl = "Decimal values: $\\frac{3}{4} = 0.75$, $\\frac{2}{3} \\approx 0.666$, $\\frac{1}{3} \\approx 0.333$, $\\frac{2}{7} \\approx 0.286$. Therefore, descending order: $\\frac{3}{4} > \\frac{2}{3} > \\frac{1}{3} > \\frac{2}{7}$."

        elif q_num == 54:
            raw_q = "If $p - q = 6$ and $pq = 7$, find the value of $p^3 - q^3 + 6(p + q)^2$."
            raw_expl = "Given: $p - q = 6, pq = 7$. $p^3 - q^3 = (p - q)^3 + 3pq(p - q) = 6^3 + 3(7)(6) = 216 + 126 = 342$. Also, $(p + q)^2 = (p - q)^2 + 4pq = 6^2 + 4(7) = 36 + 28 = 64$. $6(p + q)^2 = 6 \\times 64 = 384$. Required value $= 342 + 384 = 726$."

        elif q_num == 55:
            raw_q = "If $81^2 \\div 3^4 = 3^n$, find the value of $n$."
            raw_expl = "Given: $81^2 \\div 3^4 = 3^n$. Since $81 = 3^4$, $81^2 = (3^4)^2 = 3^8$. Then $3^8 \\div 3^4 = 3^{8-4} = 3^4 = 3^n \\implies n = 4$."

        elif q_num == 57:
            raw_q = "Simplify: $\\frac{(\\sin x - \\cos x)^2}{1 - \\sin x \\cos x}$"
            raw_opt_a = "$\\frac{1 - 2\\sin x \\cos x}{1 - \\sin x \\cos x}$"
            raw_opt_b = "$\\frac{1 + 2\\sin x \\cos x}{1 - \\sin x \\cos x}$"
            raw_opt_c = "$\\frac{2 - \\sin x \\cos x}{1 - \\sin x \\cos x}$"
            raw_opt_d = "$\\frac{3 - 2\\sin x \\cos x}{1 - \\sin x \\cos x}$"
            raw_expl = "Formula: $(\\sin x - \\cos x)^2 = \\sin^2 x + \\cos^2 x - 2\\sin x \\cos x = 1 - 2\\sin x \\cos x$. Substituting in expression gives $\\frac{1 - 2\\sin x \\cos x}{1 - \\sin x \\cos x}$."

        elif q_num == 58:
            raw_q = "If $\\cos A = \\frac{12}{13}$, where $A$ is an acute angle, find $\\sin A$."
            raw_opt_a = "$\\frac{5}{13}$"
            raw_opt_b = "$\\frac{12}{13}$"
            raw_opt_c = "$\\frac{13}{5}$"
            raw_opt_d = "$\\frac{7}{13}$"
            raw_expl = "Formula: $\\sin^2 A + \\cos^2 A = 1 \\implies \\sin A = \\sqrt{1 - (12/13)^2} = \\sqrt{1 - 144/169} = \\sqrt{25/169} = \\frac{5}{13}$."

        elif q_num == 59:
            raw_q = "In a right-angled triangle, if $\\sin \\theta = \\frac{1}{2}$, find the value of $2\\sin\\theta\\cos\\theta$."
            raw_opt_a = "$\\frac{\\sqrt{3}}{2}$"
            raw_opt_b = "$\\frac{1}{2}$"
            raw_opt_c = "$\\frac{\\sqrt{3}}{4}$"
            raw_opt_d = "$\\frac{3}{4}$"
            raw_expl = "Given: $\\sin \\theta = 1/2 \\implies \\theta = 30^\\circ$. $\\cos \\theta = \\frac{\\sqrt{3}}{2}$. Value $= 2\\sin\\theta\\cos\\theta = 2 \\times \\frac{1}{2} \\times \\frac{\\sqrt{3}}{2} = \\frac{\\sqrt{3}}{2}$."

        elif q_num == 60:
            raw_q = "The equation of a line is $3x + 4y - 12 = 0$. What is the slope of a line perpendicular to it?"
            raw_opt_a = "$\\frac{4}{3}$"
            raw_opt_b = "$-\\frac{3}{4}$"
            raw_opt_c = "$\\frac{3}{4}$"
            raw_opt_d = "$-\\frac{4}{3}$"
            raw_expl = "Rewriting $3x + 4y - 12 = 0 \\implies y = -\\frac{3}{4}x + 3$. Slope $m_1 = -\\frac{3}{4}$. Slope of perpendicular line $m_2 = -\\frac{1}{m_1} = \\frac{4}{3}$."

        elif q_num == 62:
            raw_q = "Find the value of $x^2 + y^2 + z^2$ if $x + y + z = 15$ and $xy + yz + zx = 54$."
            raw_expl = "Formula: $x^2 + y^2 + z^2 = (x + y + z)^2 - 2(xy + yz + zx) = 15^2 - 2(54) = 225 - 108 = 117$."

        elif q_num == 64:
            diagram_url = "/exams/ssc-chsl/2025/13nov-s2/perfect_square_check.png"

        elif q_num == 66:
            raw_q = "The HCF of $2 \\times 3^3 \\times 5^2 \\times 11$ and $2 \\times 3 \\times 5 \\times 7 \\times 11^2$ is:"
            raw_opt_a = "$2 \\times 3 \\times 5$"
            raw_opt_b = "$3 \\times 5 \\times 11$"
            raw_opt_c = "$2 \\times 3 \\times 5 \\times 11$"
            raw_opt_d = "$3 \\times 11$"
            raw_expl = "HCF takes the lowest power of common prime factors: $2^1 \\times 3^1 \\times 5^1 \\times 11^1 = 2 \\times 3 \\times 5 \\times 11$."

        elif q_num == 74:
            raw_q = "If $\\sin P = \\frac{5}{13}$ and $\\cos Q = \\frac{12}{13}$, find $\\sin P \\cos Q + \\cos P \\sin Q$:"
            raw_opt_a = "$\\frac{60}{169}$"
            raw_opt_b = "$\\frac{13}{13}$"
            raw_opt_c = "$\\frac{120}{169}$"
            raw_opt_d = "$\\frac{12}{13}$"
            raw_expl = "$\\cos P = \\sqrt{1 - (5/13)^2} = \\frac{12}{13}$. $\\sin Q = \\sqrt{1 - (12/13)^2} = \\frac{5}{13}$. Value $= \\sin P\\cos Q + \\cos P\\sin Q = \\frac{5}{13} \\cdot \\frac{12}{13} + \\frac{12}{13} \\cdot \\frac{5}{13} = \\frac{60}{169} + \\frac{60}{169} = \\frac{120}{169}$."

        elif q_num == 75:
            raw_q = "X, Y, and Z form a partnership. X invests Rs. 72,000, Y invests Rs. 54,000, and Z invests Rs. 36,000. After 4 months, Y increases his investment by 20%, while Z reduces his investment by 15%. At the end of 1 year, the total profit earned is Rs. 1,08,000. What is Z’s share of the profit?"
            raw_opt_a = "Rs. $\\frac{4,84,000}{23}$"
            raw_opt_b = "Rs. $\\frac{4,86,000}{23}$"
            raw_opt_c = "Rs. $\\frac{4,87,000}{23}$"
            raw_opt_d = "Rs. $\\frac{4,85,000}{23}$"
            raw_expl = "Profit ratio $\\propto \\text{Capital} \\times \\text{Time}$. X $= 72000 \\times 12 = 8,64,000$. Y $= 54000 \\times 4 + (54000 \\times 1.2) \\times 8 = 2,16,000 + 5,18,400 = 7,34,400$. Z $= 36000 \\times 4 + (36000 \\times 0.85) \\times 8 = 1,44,000 + 2,44,800 = 3,88,800$. Ratio $= 864 : 734.4 : 388.8 = 20 : 17 : 9$. Total parts $= 46$. Z's share $= \\frac{9}{46} \\times 1,08,000 = \\text{Rs. } \\frac{4,86,000}{23}$."

        elif q_num == 79:
            raw_q = "Announced in the Union Budget 2025–26, what is the primary objective of the National AI Mission?"

        ans_map = {'A': 0, 'B': 1, 'C': 2, 'D': 3}
        correct_index = ans_map.get(raw_ans, 0)

        q_obj = {
            "id": f"chsl-2025-13nov-s2-q{q_num}",
            "questionNumber": q_num,
            "sectionId": section_id,
            "sectionName": section_name,
            "questionText": raw_q,
            "options": [raw_opt_a, raw_opt_b, raw_opt_c, raw_opt_d],
            "correctAnswer": raw_ans,
            "correctAnswerIndex": correct_index,
            "explanation": raw_expl,
            "diagramUrl": diagram_url,
            "marks": 2.0,
            "negativeMarks": 0.5,
            "examId": "ssc-chsl",
            "year": 2025,
            "date": "2025-11-13",
            "shift": "Shift 2",
            "tier": "Tier 1",
            "language": "English"
        }
        questions.append(q_obj)

    return questions

def validate_paper(questions):
    assert len(questions) == 100, f"Expected 100 questions, got {len(questions)}"
    for q in questions:
        assert q["questionText"], f"Missing question text in Q{q['questionNumber']}"
        assert len(q["options"]) == 4, f"Options not 4 in Q{q['questionNumber']}"
        for opt in q["options"]:
            assert opt.strip(), f"Empty option in Q{q['questionNumber']}"
        assert q["correctAnswer"] in ['A', 'B', 'C', 'D'], f"Invalid answer in Q{q['questionNumber']}"
        assert q["correctAnswerIndex"] in [0, 1, 2, 3], f"Invalid index in Q{q['questionNumber']}"

    sections = {}
    for q in questions:
        sec = q["sectionId"]
        sections[sec] = sections.get(sec, 0) + 1
    assert sections == {
        'english': 25,
        'reasoning': 25,
        'quant': 25,
        'general_awareness': 25
    }, f"Unexpected section breakdown: {sections}"
    print("✅ All validation assertions passed!")

def main():
    print(f"Reading raw question rows from {SOURCE_XLSX}...")
    raw_rows = load_sheet_data(SOURCE_XLSX)
    print(f"Parsed {len(raw_rows)} rows. Cleaning and normalizing...")

    questions = process_questions(raw_rows)
    validate_paper(questions)

    paper_data = {
        "id": "ssc-chsl-2025-13nov-s2",
        "examId": "ssc-chsl",
        "examName": "SSC CHSL",
        "editionYear": 2025,
        "title": "SSC CHSL Tier 1 — 13 Nov 2025 (Shift 2)",
        "subTitle": "Official Question Paper Held on 13 Nov 2025 Shift 2",
        "date": "2025-11-13",
        "shift": "Shift 2",
        "tier": "Tier 1",
        "language": "English",
        "durationMinutes": 60,
        "totalMarks": 200,
        "totalQuestions": 100,
        "markingScheme": {
            "marksPerCorrect": 2.0,
            "negativeMarks": 0.5,
            "unansweredMarks": 0.0
        },
        "sections": [
            {
                "id": "english",
                "name": "English Language",
                "questionCount": 25,
                "maxMarks": 50,
                "startIndex": 0,
                "endIndex": 24
            },
            {
                "id": "reasoning",
                "name": "General Intelligence & Reasoning",
                "questionCount": 25,
                "maxMarks": 50,
                "startIndex": 25,
                "endIndex": 49
            },
            {
                "id": "quant",
                "name": "Quantitative Aptitude",
                "questionCount": 25,
                "maxMarks": 50,
                "startIndex": 50,
                "endIndex": 74
            },
            {
                "id": "general_awareness",
                "name": "General Awareness",
                "questionCount": 25,
                "maxMarks": 50,
                "startIndex": 75,
                "endIndex": 99
            }
        ],
        "questions": questions
    }

    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(paper_data, f, indent=2, ensure_ascii=False)

    print(f"🎉 Successfully exported normalized paper to {OUTPUT_JSON} ({len(questions)} questions)!")

if __name__ == '__main__':
    main()
