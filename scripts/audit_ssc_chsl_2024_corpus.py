#!/usr/bin/env python3
"""
MOCK.AI — SSC CHSL 2024 Corpus Forensic Audit Tool (V2)
Performs rigorous question-by-question verification across all 2024 papers.
"""

import os
import sys
import json
import glob
import re

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'web', 'src', 'data', 'exams')

def run_audit():
    pattern = os.path.join(DATA_DIR, 'ssc-chsl-2024-*.json')
    files = sorted(glob.glob(pattern))
    
    if not files:
        print("[ERROR] No SSC CHSL 2024 JSON files found!")
        sys.exit(1)
        
    print(f"Auditing {len(files)} SSC CHSL 2024 papers...")
    
    total_papers = len(files)
    total_questions = 0
    total_verified = 0
    total_review_required = 0
    
    corpus_empty_options = []
    corpus_empty_stems = []
    corpus_stem_wipes = []
    corpus_identical_options = []
    corpus_invalid_answers = []
    corpus_presentation_policy_violations = []
    
    paper_summaries = []
    
    for f in files:
        paper_id = os.path.basename(f).replace('.json', '')
        with open(f, 'r', encoding='utf-8') as jf:
            try:
                data = json.load(jf)
            except Exception as e:
                print(f"[FAIL] {paper_id}: Invalid JSON: {e}")
                continue
                
        questions = data.get('questions', [])
        q_count = len(questions)
        total_questions += q_count
        
        p_empty_options = 0
        p_empty_stems = 0
        p_stem_wipes = 0
        p_identical_options = 0
        p_policy_violations = 0
        p_verified = 0
        p_review_required = 0
        
        for q in questions:
            q_num = q.get('questionNumber', 0)
            q_id = q.get('id', f"{paper_id}-q{q_num}")
            q_text = (q.get('questionText') or '').strip()
            diag = q.get('diagramUrl') or q.get('diagramUrls')
            options = q.get('options') or []
            option_images = q.get('optionImages') or [None, None, None, None]
            rich_options = q.get('richOptions') or []
            v_status = q.get('verificationStatus', 'UNKNOWN')
            
            if v_status == 'VERIFIED':
                p_verified += 1
            else:
                p_review_required += 1
                
            # 1. Stem check
            if re.match(r'^Question\s*\d+$', q_text, re.IGNORECASE):
                p_stem_wipes += 1
                corpus_stem_wipes.append((paper_id, q_num, q_text))
            elif not q_text and not diag:
                p_empty_stems += 1
                corpus_empty_stems.append((paper_id, q_num))
                
            # 2. Option check: each of the 4 slots must have text OR image
            has_blank_slot = False
            for idx in range(4):
                slot_text = options[idx] if idx < len(options) else ""
                slot_img = option_images[idx] if idx < len(option_images) else None
                if not slot_text and not slot_img:
                    has_blank_slot = True
                    break
            if has_blank_slot:
                p_empty_options += 1
                corpus_empty_options.append((paper_id, q_num))
                
            # 3. 4-identical options check
            if len(options) == 4 and options[0] and options[0] == options[1] == options[2] == options[3]:
                p_identical_options += 1
                corpus_identical_options.append((paper_id, q_num, options[0]))
                
            # 4. Presentation policy check
            if rich_options:
                raw_options = q.get('options') or []
                for idx_ro, ro in enumerate(rich_options):
                    mode = ro.get('displayMode')
                    img_u = ro.get('imageUrl')
                    t = ro.get('text')
                    ct = ro.get('contentTypes') or []
                    
                    if mode == 'IMAGE_ONLY':
                        if not img_u:
                            p_policy_violations += 1
                            corpus_presentation_policy_violations.append((paper_id, q_num, 'IMAGE_ONLY without imageUrl'))
                        if t != "":
                            p_policy_violations += 1
                            corpus_presentation_policy_violations.append((paper_id, q_num, f'IMAGE_ONLY with non-empty rich text: {t!r}'))
                        if idx_ro < len(raw_options) and raw_options[idx_ro] != "":
                            p_policy_violations += 1
                            corpus_presentation_policy_violations.append((paper_id, q_num, f'IMAGE_ONLY with non-empty raw option text: {raw_options[idx_ro]!r}'))
                        if 'text' in ct:
                            p_policy_violations += 1
                            corpus_presentation_policy_violations.append((paper_id, q_num, 'IMAGE_ONLY with text contentType'))
                    elif mode == 'TEXT_ONLY':
                        if img_u:
                            p_policy_violations += 1
                            corpus_presentation_policy_violations.append((paper_id, q_num, 'TEXT_ONLY with imageUrl'))
                            
            # 5. Answer key check
            ans_let = q.get('correctAnswer')
            ans_idx = q.get('correctAnswerIndex')
            if ans_let not in ['A', 'B', 'C', 'D'] or ans_idx not in [0, 1, 2, 3] or ['A', 'B', 'C', 'D'][ans_idx] != ans_let:
                corpus_invalid_answers.append((paper_id, q_num, ans_let, ans_idx))
                
        total_verified += p_verified
        total_review_required += p_review_required
        
        status_label = "VERIFIED" if (p_empty_options == 0 and p_empty_stems == 0 and p_stem_wipes == 0 and p_identical_options == 0 and p_policy_violations == 0) else "REVIEW_REQUIRED"
        paper_summaries.append({
            'paper_id': paper_id,
            'tier': data.get('tier', 'Tier 1'),
            'date': data.get('date', ''),
            'shift': data.get('shift', ''),
            'questions': q_count,
            'verified': p_verified,
            'review_required': p_review_required,
            'empty_options': p_empty_options,
            'empty_stems': p_empty_stems,
            'stem_wipes': p_stem_wipes,
            'identical_options': p_identical_options,
            'policy_violations': p_policy_violations,
            'status': status_label
        })
        
    print("\n" + "=" * 90)
    print(f"{'Paper ID':<35} | {'Qs':<4} | {'EmptyOpt':<8} | {'StemWipe':<8} | {'IdentOpt':<8} | {'PolicyViol':<10} | {'Status':<10}")
    print("=" * 90)
    for ps in paper_summaries:
        print(f"{ps['paper_id']:<35} | {ps['questions']:<4} | {ps['empty_options']:<8} | {ps['stem_wipes']:<8} | {ps['identical_options']:<8} | {ps['policy_violations']:<10} | {ps['status']:<10}")
    print("=" * 90)
    
    print("\nCorpus Synthesis:")
    print(f"  Total Papers: {total_papers}")
    print(f"  Total Questions: {total_questions}")
    print(f"  Fully Verified Questions: {total_verified} ({total_verified/total_questions*100:.2f}%)")
    print(f"  Review Required Questions: {total_review_required}")
    print(f"  Corpus Empty Options: {len(corpus_empty_options)}")
    print(f"  Corpus Stem-Wipe Fallbacks: {len(corpus_stem_wipes)}")
    print(f"  Corpus Empty Non-Visual Stems: {len(corpus_empty_stems)}")
    print(f"  Corpus 4-Identical Options: {len(corpus_identical_options)}")
    print(f"  Corpus Presentation Policy Violations: {len(corpus_presentation_policy_violations)}")
    print(f"  Corpus Invalid Answer Keys: {len(corpus_invalid_answers)}")
    
    return {
        'total_papers': total_papers,
        'total_questions': total_questions,
        'total_verified': total_verified,
        'total_review_required': total_review_required,
        'empty_options_count': len(corpus_empty_options),
        'stem_wipes_count': len(corpus_stem_wipes),
        'identical_options_count': len(corpus_identical_options),
        'policy_violations_count': len(corpus_presentation_policy_violations),
        'paper_summaries': paper_summaries
    }

if __name__ == '__main__':
    run_audit()
