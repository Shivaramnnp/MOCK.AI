#!/usr/bin/env python3
"""
scripts/audit_all_exam_papers.py
=============================================================================
Audits all 284 exam JSON datasets in web/src/data/exams/.
Calculates question counts, empty stems, identical options, missing options,
answer key integrity, broken asset counts, and verification status.

Outputs:
  - paper-audit-report.json
  - answer-key-audit.json
  - source-fidelity-report.json
"""

import os
import glob
import json
from collections import Counter, defaultdict

BASE_DIR = '/Users/shivarampatel/AndroidStudioProjects/MOCK.AI'
EXAMS_DATA_DIR = os.path.join(BASE_DIR, 'web/src/data/exams')
PUBLIC_ASSETS_DIR = os.path.join(BASE_DIR, 'web/public/exam-assets')

def main():
    json_files = sorted(glob.glob(os.path.join(EXAMS_DATA_DIR, '*.json')))
    print(f"Auditing {len(json_files)} exam papers...")

    paper_reports = []
    ak_reports = []
    global_stats = Counter()

    for jpath in json_files:
        with open(jpath, 'r', encoding='utf-8') as f:
            pdata = json.load(f)

        pid = pdata.get('id', os.path.splitext(os.path.basename(jpath))[0])
        exam_id = pdata.get('examId', 'unknown')
        year = pdata.get('editionYear', 0)
        questions = pdata.get('questions', [])

        empty_stem_count = 0
        identical_opt_count = 0
        missing_opt_count = 0
        visual_count = 0
        broken_asset_count = 0
        v_status_counts = Counter()
        ans_key_counts = Counter()
        ans_keys = []

        for q in questions:
            q_num = q.get('questionNumber', 0)
            stem = q.get('questionText', '').strip()
            blocks = q.get('contentBlocks') or []
            diags = q.get('diagramUrls') or ([q['diagramUrl']] if q.get('diagramUrl') else [])
            opts = q.get('options') or []
            opt_imgs = q.get('optionImages') or []
            rich_opts = q.get('richOptions') or []
            v_status = q.get('verificationStatus', 'UNVERIFIED')
            v_status_counts[v_status] += 1

            has_diag = bool(diags) or any(b.get('type') in ['diagram', 'image'] for b in blocks)
            if not stem and not has_diag:
                empty_stem_count += 1

            if has_diag or any(opt_imgs):
                visual_count += 1

            # Options integrity
            if q.get('questionType') not in ['NAT', 'DESCRIPTIVE']:
                if len(opts) >= 4 and opts[0] and opts[0] == opts[1] == opts[2] == opts[3] and not any(opt_imgs):
                    identical_opt_count += 1

                for idx in range(len(opts)):
                    opt_t = opts[idx] if idx < len(opts) else ''
                    opt_i = opt_imgs[idx] if idx < len(opt_imgs) else None
                    if not opt_t and not opt_i:
                        missing_opt_count += 1

            # Asset verification
            all_q_urls = list(diags)
            for oi in opt_imgs:
                if oi:
                    all_q_urls.append(oi)
            for ro in rich_opts:
                if isinstance(ro, dict) and ro.get('imageUrl'):
                    all_q_urls.append(ro['imageUrl'])

            for u in all_q_urls:
                if not u or not isinstance(u, str):
                    continue
                clean_u = u.strip()
                if clean_u.startswith('/exam-assets/'):
                    rel_p = clean_u[len('/exam-assets/'):]
                elif clean_u.startswith('exam-assets/'):
                    rel_p = clean_u[len('exam-assets/'):]
                else:
                    rel_p = clean_u.lstrip('/')
                disk_p = os.path.join(PUBLIC_ASSETS_DIR, rel_p)
                if not os.path.exists(disk_p):
                    broken_asset_count += 1

            # Answer key
            ans = q.get('correctAnswer')
            if ans:
                ans_key_counts[ans] += 1
                ans_keys.append((q_num, ans))
            elif q.get('answerRange') or q.get('numericAnswer'):
                ans_key_counts['NAT'] += 1
            else:
                ans_key_counts['MISSING'] += 1

        global_stats['total_papers'] += 1
        global_stats['total_questions'] += len(questions)
        global_stats['empty_stems'] += empty_stem_count
        global_stats['identical_options'] += identical_opt_count
        global_stats['broken_assets'] += broken_asset_count
        global_stats['visual_questions'] += visual_count

        paper_rep = {
            "paperId": pid,
            "examId": exam_id,
            "editionYear": year,
            "questionCount": len(questions),
            "emptyStemCount": empty_stem_count,
            "identicalOptionCount": identical_opt_count,
            "missingOptionCount": missing_opt_count,
            "visualAssetCount": visual_count,
            "brokenAssetCount": broken_asset_count,
            "verificationStatus": dict(v_status_counts)
        }
        paper_reports.append(paper_rep)

        ak_rep = {
            "paperId": pid,
            "questionCount": len(questions),
            "answerDistribution": dict(ans_key_counts),
            "missingAnswerCount": ans_key_counts.get('MISSING', 0),
            "status": "VALID" if ans_key_counts.get('MISSING', 0) == 0 else "DEFECTIVE"
        }
        ak_reports.append(ak_rep)

    # Write paper-audit-report.json
    with open(os.path.join(BASE_DIR, 'paper-audit-report.json'), 'w', encoding='utf-8') as f:
        json.dump({
            "timestamp": os.popen('date -u +"%Y-%m-%dT%H:%M:%SZ"').read().strip(),
            "summary": dict(global_stats),
            "papers": paper_reports
        }, f, indent=2)

    # Write answer-key-audit.json
    with open(os.path.join(BASE_DIR, 'answer-key-audit.json'), 'w', encoding='utf-8') as f:
        json.dump({
            "timestamp": os.popen('date -u +"%Y-%m-%dT%H:%M:%SZ"').read().strip(),
            "papers": ak_reports
        }, f, indent=2)

    # Write source-fidelity-report.json
    with open(os.path.join(BASE_DIR, 'source-fidelity-report.json'), 'w', encoding='utf-8') as f:
        json.dump({
            "timestamp": os.popen('date -u +"%Y-%m-%dT%H:%M:%SZ"').read().strip(),
            "totalPapersAudited": len(paper_reports),
            "globalStatistics": dict(global_stats),
            "criticalFindings": {
                "papersWithBrokenAssets": sum(1 for p in paper_reports if p['brokenAssetCount'] > 0),
                "papersWithIdenticalOptions": sum(1 for p in paper_reports if p['identicalOptionCount'] > 0),
                "papersWithEmptyStems": sum(1 for p in paper_reports if p['emptyStemCount'] > 0)
            }
        }, f, indent=2)

    print("Audited all papers successfully.")
    print(f"Total Papers: {len(paper_reports)}, Total Questions: {global_stats['total_questions']}")
    print(f"Papers with broken assets: {sum(1 for p in paper_reports if p['brokenAssetCount'] > 0)}")
    print(f"Identical option questions: {global_stats['identical_options']}")
    print("Generated paper-audit-report.json, answer-key-audit.json, source-fidelity-report.json.")

if __name__ == '__main__':
    main()
