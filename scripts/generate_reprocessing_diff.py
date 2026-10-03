#!/usr/bin/env python3
"""
scripts/generate_reprocessing_diff.py
=============================================================================
Analyzes the 284 exam papers, quantifies the difference between the legacy
corrupted state (e.g. 980 broken cross-year option links, flat index assumptions)
and the canonical source-fidelity v3 state.

Outputs:
  - reprocessing-diff.json
"""

import os
import glob
import json
from collections import Counter

BASE_DIR = '/Users/shivarampatel/AndroidStudioProjects/MOCK.AI'
EXAMS_DATA_DIR = os.path.join(BASE_DIR, 'web/src/data/exams')
PUBLIC_ASSETS_DIR = os.path.join(BASE_DIR, 'web/public/exam-assets')

def main():
    with open(os.path.join(BASE_DIR, 'asset-audit-report.json'), 'r') as f:
        asset_audit = json.load(f)

    broken_refs = asset_audit['brokenReferences']
    broken_by_paper = Counter(x['paperId'] for x in broken_refs)

    json_files = sorted(glob.glob(os.path.join(EXAMS_DATA_DIR, '*.json')))

    diff_summary = {
        "timestamp": os.popen('date -u +"%Y-%m-%dT%H:%M:%SZ"').read().strip(),
        "totalPapers": len(json_files),
        "cleanPapers": len(json_files) - len(broken_by_paper),
        "defectivePapers": len(broken_by_paper),
        "totalBrokenReferences": len(broken_refs),
        "brokenReferencesByYear": Counter(),
        "papers": []
    }

    for jpath in json_files:
        pid = os.path.splitext(os.path.basename(jpath))[0]
        broken_count = broken_by_paper.get(pid, 0)

        year = 0
        for y in ['2019', '2020', '2021', '2022', '2023', '2024', '2025']:
            if y in pid:
                year = int(y)
                break

        if broken_count > 0:
            diff_summary['brokenReferencesByYear'][str(year)] += broken_count

        diff_summary['papers'].append({
            "paperId": pid,
            "year": year,
            "brokenReferences": broken_count,
            "status": "REQUIRES_REPROCESSING" if broken_count > 0 else "CANONICAL_CLEAN"
        })

    diff_summary['brokenReferencesByYear'] = dict(diff_summary['brokenReferencesByYear'])

    out_path = os.path.join(BASE_DIR, 'reprocessing-diff.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(diff_summary, f, indent=2)

    print(f"Generated {out_path}:")
    print(f"  Total papers: {diff_summary['totalPapers']}")
    print(f"  Clean papers: {diff_summary['cleanPapers']}")
    print(f"  Defective papers with broken assets: {diff_summary['defectivePapers']}")
    print(f"  Total broken cross-year references: {diff_summary['totalBrokenReferences']}")
    print(f"  Broken by year: {diff_summary['brokenReferencesByYear']}")

if __name__ == '__main__':
    main()
