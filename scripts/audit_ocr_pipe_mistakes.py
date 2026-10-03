#!/usr/bin/env python3
"""
audit_ocr_pipe_mistakes.py
Audits 2024 and 2025 (and the full catalog) for OCR confusion artifacts:
- '|' (pipe) instead of '1'
- 'l' or 'I' or '!' or ']' or '[' instead of '1' in numeric contexts
- 'Z' instead of '2' in numeric contexts
- 'ZB' instead of '∠B' in geometry question stems
- Corrupted math tokens like 'cosecA = 22' or '2v2'
"""

import glob
import json
import os
import re

def is_math_or_number(s):
    if not isinstance(s, str):
        return False
    t = s.strip()
    if re.match(r'^\d+(\.\d+)?$', t):
        return True
    if re.match(r'^\$\d+(\.\d+)?\$$', t):
        return True
    if any(k in t for k in ['\\frac', '√', '^', '%', ':']):
        return True
    return False

def audit_files():
    all_files = sorted(glob.glob('web/src/data/exams/*.json'))
    print(f"Total exam JSON files: {len(all_files)}")
    
    findings = []
    
    for fpath in all_files:
        fname = os.path.basename(fpath)
        with open(fpath, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
            except Exception as e:
                print(f"Error {fname}: {e}")
                continue
                
        questions = data.get('questions', [])
        for q in questions:
            qnum = q.get('questionNumber', 0)
            qid = q.get('id', '')
            qtext = q.get('questionText', '')
            opts = q.get('options', [])
            
            # 1. Stem angle Z check: e.g. ZB = 90, ZA =, ZC =
            m_angle = re.search(r'\bZ([A-D])\s*=\s*\d+', qtext)
            if m_angle:
                findings.append({
                    'file': fname,
                    'qnum': qnum,
                    'id': qid,
                    'type': 'STEM_ANGLE_Z',
                    'detail': f"Found 'Z{m_angle.group(1)} =' in stem: {qtext[:120]}...",
                    'fix': f"∠{m_angle.group(1)} = "
                })
            
            # Check for cosecA = 22 or similar radical drops
            if 'cosecA = 22' in qtext:
                findings.append({
                    'file': fname,
                    'qnum': qnum,
                    'id': qid,
                    'type': 'STEM_RADICAL_DROP',
                    'detail': "Found 'cosecA = 22' in stem",
                    'fix': "cosecA = 2\\sqrt{2}"
                })
                
            # 2. Options checks
            # Count how many options look like numbers or mathematical expressions
            math_counts = sum(1 for o in opts if is_math_or_number(o))
            
            for i, opt in enumerate(opts):
                if not isinstance(opt, str):
                    continue
                s = opt.strip()
                
                # A: Pipe | directly in option
                if s == '|':
                    findings.append({
                        'file': fname,
                        'qnum': qnum,
                        'id': qid,
                        'opt_idx': i,
                        'type': 'OPTION_PIPE_IS_ONE',
                        'val': s,
                        'options': opts,
                        'math_counts': math_counts,
                        'fix': '1'
                    })
                elif '|' in s:
                    findings.append({
                        'file': fname,
                        'qnum': qnum,
                        'id': qid,
                        'opt_idx': i,
                        'type': 'OPTION_CONTAINS_PIPE',
                        'val': s,
                        'options': opts,
                        'math_counts': math_counts
                    })
                
                # B: Single character 'Z' in numeric context (e.g. ['6', '1', 'Z', '3'])
                elif s == 'Z' and math_counts >= 2:
                    findings.append({
                        'file': fname,
                        'qnum': qnum,
                        'id': qid,
                        'opt_idx': i,
                        'type': 'OPTION_Z_IS_TWO',
                        'val': s,
                        'options': opts,
                        'fix': '2'
                    })
                    
                # C: Single character 'l' or 'I' or '!' in numeric context
                elif s in ['l', '!', ']', '['] and math_counts >= 2:
                    findings.append({
                        'file': fname,
                        'qnum': qnum,
                        'id': qid,
                        'opt_idx': i,
                        'type': 'OPTION_CHAR_IS_ONE',
                        'val': s,
                        'options': opts,
                        'fix': '1'
                    })
                elif s == 'I' and math_counts >= 2 and not any(r in opts for r in ['II', 'III', 'IV']):
                    findings.append({
                        'file': fname,
                        'qnum': qnum,
                        'id': qid,
                        'opt_idx': i,
                        'type': 'OPTION_I_IS_ONE',
                        'val': s,
                        'options': opts,
                        'fix': '1'
                    })

                # D: Radicals written as v2 or 2v2
                if re.match(r'^(?:v|V)\d+$', s) or re.match(r'^\d+(?:v|V)\d+$', s):
                    fixed_val = s.replace('v', '√').replace('V', '√')
                    findings.append({
                        'file': fname,
                        'qnum': qnum,
                        'id': qid,
                        'opt_idx': i,
                        'type': 'OPTION_V_RADICAL',
                        'val': s,
                        'options': opts,
                        'fix': fixed_val
                    })

    return findings

if __name__ == '__main__':
    results = audit_files()
    print(f"\nTotal findings: {len(results)}\n")
    by_type = {}
    for r in results:
        by_type.setdefault(r['type'], []).append(r)
        
    for t, items in by_type.items():
        print(f"=== {t} ({len(items)}) ===")
        for item in items:
            opts_str = f" | options: {item.get('options')}" if 'options' in item else ""
            print(f"  {item['file']} Q{item['qnum']} [{item.get('opt_idx', '')}]: {item.get('val', '')} -> fix: {item.get('fix', '')}{opts_str}")
