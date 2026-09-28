import os
import csv
import json
import fitz

BASE_DIR = "/Users/shivarampatel/Downloads/GATE 2025"
MANIFEST_PATH = os.path.join(BASE_DIR, "GATE_2025_manifest.csv")
WEB_EXAMS_DIR = "/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/src/data/exams"
OUTPUT_CSV = "/Users/shivarampatel/AndroidStudioProjects/MOCK.AI/docs/GATE_2025_PAPER_INVENTORY.csv"

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
                    marks = 2.0 if '2' in marks_str else 1.0

                    ak_dict[q_no] = {
                        'q_no': q_no,
                        'session': session,
                        'q_type': q_type,
                        'section': section,
                        'key_range': key_range,
                        'marks': marks,
                    }
    return ak_dict

def run_inventory():
    print(f"Reading manifest: {MANIFEST_PATH}")
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        manifest_rows = list(reader)

    # Group by paper_code
    papers = {}
    for r in manifest_rows:
        code = r['paper_code']
        ftype = r['file_type']
        if code not in papers:
            papers[code] = {
                'paper_name': r['paper_name'],
                'paper_code': code,
                'year': r['year'],
                'session': r['session'],
                'qp_path': None,
                'ak_path': None
            }
        if ftype == 'Question Paper':
            papers[code]['qp_path'] = r['local_path']
        elif ftype == 'Answer Key':
            papers[code]['ak_path'] = r['local_path']

    print(f"Found {len(papers)} papers in manifest.")

    inventory_records = []

    for code, pdata in sorted(papers.items()):
        qp_path = pdata['qp_path']
        ak_path = pdata['ak_path']
        name = pdata['paper_name']

        qp_pages = 0
        if qp_path and os.path.exists(qp_path):
            doc = fitz.open(qp_path)
            qp_pages = len(doc)
            doc.close()

        ak_dict = {}
        if ak_path and os.path.exists(ak_path):
            ak_dict = parse_answer_key(ak_path)

        expected_q_count = len(ak_dict)
        expected_sections = sorted(list(set(q['section'] for q in ak_dict.values()))) if ak_dict else []
        expected_1m = sum(1 for q in ak_dict.values() if q['marks'] == 1.0)
        expected_2m = sum(1 for q in ak_dict.values() if q['marks'] == 2.0)
        expected_marks_dist = f"1M:{expected_1m}, 2M:{expected_2m}"

        # Current JSON check
        json_filename = f"gate-2025-{code.lower()}.json"
        json_path = os.path.join(WEB_EXAMS_DIR, json_filename)
        actual_q_count = 0
        actual_sections = []
        actual_marks_dist = "N/A"
        ingestion_status = "MISSING"

        if os.path.exists(json_path):
            try:
                with open(json_path, 'r', encoding='utf-8') as jf:
                    jdata = json.load(jf)
                    actual_q_count = len(jdata.get('questions', []))
                    actual_sections = [s.get('name', s.get('id', '')) for s in jdata.get('sections', [])]
                    q_1m = sum(1 for q in jdata.get('questions', []) if q.get('marks') == 1)
                    q_2m = sum(1 for q in jdata.get('questions', []) if q.get('marks') == 2)
                    actual_marks_dist = f"1M:{q_1m}, 2M:{q_2m}"
                    ingestion_status = "EXISTS"
            except Exception as e:
                ingestion_status = f"ERROR: {e}"

        asset_dir = f"web/public/exam-assets/gate/2025/{code.lower()}"

        # Preliminary verification status
        verif_status = "NOT VERIFIED"
        if ingestion_status != "EXISTS":
            verif_status = "MISSING"
        elif actual_q_count == 0 or (expected_q_count > 0 and actual_q_count != expected_q_count):
            verif_status = "FAILED (Count Mismatch)"

        inventory_records.append({
            'paper_code': code,
            'subject': name,
            'source_pdf_path': qp_path,
            'answer_key_path': ak_path,
            'pdf_pages': qp_pages,
            'expected_question_count': expected_q_count,
            'actual_ingested_question_count': actual_q_count,
            'expected_sections': '; '.join(expected_sections),
            'actual_sections': '; '.join(actual_sections),
            'expected_marks_distribution': expected_marks_dist,
            'actual_marks_distribution': actual_marks_dist,
            'json_path': json_path,
            'asset_directory': asset_dir,
            'ingestion_status': ingestion_status,
            'verification_status': verif_status
        })

    # Write CSV
    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
    fieldnames = [
        'paper_code',
        'subject',
        'source_pdf_path',
        'answer_key_path',
        'pdf_pages',
        'expected_question_count',
        'actual_ingested_question_count',
        'expected_sections',
        'actual_sections',
        'expected_marks_distribution',
        'actual_marks_distribution',
        'json_path',
        'asset_directory',
        'ingestion_status',
        'verification_status'
    ]
    with open(OUTPUT_CSV, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in inventory_records:
            writer.writerow(r)

    print(f"Inventory written to {OUTPUT_CSV}")
    print(f"{'Code':<6} | {'Subject':<35} | {'Pages':<5} | {'Exp Q':<6} | {'Act Q':<6} | {'Status'}")
    print("-" * 80)
    for r in inventory_records:
        print(f"{r['paper_code']:<6} | {r['subject'][:35]:<35} | {r['pdf_pages']:<5} | {r['expected_question_count']:<6} | {r['actual_ingested_question_count']:<6} | {r['verification_status']}")

if __name__ == '__main__':
    run_inventory()
