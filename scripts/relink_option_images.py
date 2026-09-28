#!/usr/bin/env python3
"""
MOCK.AI — Forensic Option-Image & Diagram Relinking Pipeline
============================================================
Scans all exam JSON datasets against `web/public/exam-assets`.
For any visual question where option images (opt_a, opt_b, opt_c, opt_d) or diagrams
exist on disk but were left unlinked in the JSON, this script populates `optionImages`,
`richOptions`, `diagramUrl`, and `contentBlocks` authoritatively.
"""

import os
import glob
import json
import re
from pathlib import Path

BASE_DIR = Path('/Users/shivarampatel/AndroidStudioProjects/MOCK.AI')
EXAMS_DIR = BASE_DIR / 'web' / 'src' / 'data' / 'exams'
PUBLIC_ASSETS = BASE_DIR / 'web' / 'public' / 'exam-assets'

def main():
    print("=" * 70)
    print("MOCK.AI — Relinking Option Images & Diagrams to Exam JSONs")
    print("=" * 70)

    files = sorted(EXAMS_DIR.glob('*.json'))
    total_relinked_questions = 0
    total_relinked_diagrams = 0
    modified_papers = 0

    for json_file in files:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        paper_id = data.get('id', json_file.stem)
        year = data.get('editionYear')
        exam = data.get('examId')

        if exam == 'ssc-chsl':
            asset_dir = PUBLIC_ASSETS / 'ssc' / 'chsl' / str(year) / paper_id
            web_base = f'/exam-assets/ssc/chsl/{year}/{paper_id}'
        elif exam == 'gate':
            paper_code = str(data.get('paperCode', '')).lower()
            if not paper_code:
                paper_code = paper_id.replace(f'gate-{year}-', '')
            asset_dir = PUBLIC_ASSETS / 'gate' / str(year) / paper_code
            web_base = f'/exam-assets/gate/{year}/{paper_code}'
        else:
            continue

        if not asset_dir.exists():
            continue

        paper_changed = False
        for q in data.get('questions', []):
            q_num = q.get('questionNumber')
            opt_imgs = q.get('optionImages') or []
            has_imgs = any(bool(x) for x in opt_imgs)

            # Relink option images (supports 1 to 4 visual options)
            disk_opts = [None, None, None, None]
            has_any_disk_opt = False
            for idx, letter in enumerate(['a', 'b', 'c', 'd']):
                matches = sorted(glob.glob(str(asset_dir / f'q{q_num}_opt_{letter}.*')))
                if matches:
                    png_matches = [m for m in matches if m.endswith('.png')]
                    chosen = png_matches[0] if png_matches else matches[0]
                    fname = Path(chosen).name
                    disk_opts[idx] = f'{web_base}/{fname}'
                    has_any_disk_opt = True

            if has_any_disk_opt and not has_imgs:
                q['optionImages'] = disk_opts
                opts_text = q.get('options') or ['', '', '', '']
                # If option text is just axis numbers or coordinate leak, clear it
                cleaned_opts = []
                for i, opt in enumerate(opts_text):
                    if disk_opts[i] and (not opt or opt.startswith('Option (') or re.match(r'^\(?0,\s*-?1\)?', opt)):
                        cleaned_opts.append('')
                    else:
                        cleaned_opts.append(opt)
                q['options'] = cleaned_opts
                q['richOptions'] = [
                    {
                        'id': letter,
                        'text': cleaned_opts[i],
                        'imageUrl': disk_opts[i]
                    }
                    for i, letter in enumerate(['A', 'B', 'C', 'D'])
                ]
                total_relinked_questions += 1
                paper_changed = True

            # Relink question diagrams if unreferenced
            diag_matches = sorted(glob.glob(str(asset_dir / f'q{q_num}_diag.*')))
            if diag_matches and not q.get('diagramUrl'):
                png_m = [m for m in diag_matches if m.endswith('.png')]
                chosen_d = png_m[0] if png_m else diag_matches[0]
                d_url = f'{web_base}/{Path(chosen_d).name}'
                q['diagramUrl'] = d_url
                q['diagramUrls'] = [d_url]
                if 'contentBlocks' in q and isinstance(q['contentBlocks'], list):
                    if not any(b.get('type') == 'diagram' for b in q['contentBlocks']):
                        q['contentBlocks'].append({'type': 'diagram', 'assetUrl': d_url, 'confidence': 'VERIFIED'})
                if 'contentTypes' in q and isinstance(q['contentTypes'], list):
                    if 'diagram' not in q['contentTypes']:
                        q['contentTypes'].append('diagram')
                        q['contentTypes'].sort()
                total_relinked_diagrams += 1
                paper_changed = True

        if paper_changed:
            with open(json_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            modified_papers += 1
            print(f"  ✓ Relinked assets in: {paper_id}")

    print("=" * 70)
    print(f"SUMMARY: Relinked options for {total_relinked_questions} questions, {total_relinked_diagrams} diagrams across {modified_papers} papers.")
    print("=" * 70)

if __name__ == '__main__':
    main()
