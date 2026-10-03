#!/usr/bin/env python3
"""
repair_pipe_ocr_mistakes.py
Applies forensic corrections for OCR defects across exam datasets:
- Replaces '|' with '1' (or 'L' in cube letter net)
- Replaces 'Z' with '2' (or '7' on dice faces) in numeric context
- Restores corrupted fraction and ratio options (51/400, 17/200, 2:1, etc.)
- Restores geometry angle ∠B = 90° and trigonometric radical cosecA = 2\sqrt{2}
- Restores missing stems verified from official response sheets
"""

import json
import os

BASE_DIR = '/Users/shivarampatel/AndroidStudioProjects/MOCK.AI'
EXAMS_DIR = os.path.join(BASE_DIR, 'web/src/data/exams')

REPAIRS = {
    'ssc-chsl-2024-01jul-s1.json': {
        64: {
            'stem': 'In right-angled triangle ABC, ∠B = 90° and angle A and angle C are acute angles. If cosecA = 2\\sqrt{2}, then find the value of sinA .cosC + cosA.sinC.',
            'options': ['\\sqrt{2}', '1', '0', '2\\sqrt{2}'],
            'correctAnswer': 'B',
            'correctAnswerIndex': 1,
        },
        47: {
            'stem': 'Six numbers 1, 3, 5, 6, 7 and 8 are written on different faces of a dice. Two positions of this dice are shown in the figure. Which is the number on the face opposite to the face containing 6?',
            'options': ['5', '3', '7', '8'],
            'correctAnswer': 'B',
            'correctAnswerIndex': 1,
        }
    },
    'ssc-chsl-2024-01jul-s2.json': {
        39: {
            'options': ['M', 'I', 'L', 'H'],
            'correctAnswer': 'A',
            'correctAnswerIndex': 0,
        }
    },
    'ssc-chsl-2024-01jul-s3.json': {
        35: {
            'options': ['10', '2', '3', '8'],
            'correctAnswer': 'B',
            'correctAnswerIndex': 1,
        }
    },
    'ssc-chsl-2024-01jul-s4.json': {
        54: {
            'options': ['2:3', '2:1', '2:5', '2:7'],
            'correctAnswer': 'B',
            'correctAnswerIndex': 1,
        },
        67: {
            'options': ['1', '\\frac{1}{4}', '√69', '\\frac{1}{2}'],
            'correctAnswer': 'D',
            'correctAnswerIndex': 3,
        }
    },
    'ssc-chsl-2024-02jul-s3.json': {
        62: {
            'options': ['30', '26', '25', '27'],
            'correctAnswer': 'D',
            'correctAnswerIndex': 3,
        }
    },
    'ssc-chsl-2024-03jul-s2.json': {
        65: {
            'options': ['1:1', '1:2', '2:3', '2:1'],
            'correctAnswer': 'A',
            'correctAnswerIndex': 0,
        }
    },
    'ssc-chsl-2024-03jul-s3.json': {
        69: {
            'options': ['\\frac{41}{400}', '\\frac{17}{200}', '\\frac{51}{400}', '\\frac{37}{400}'],
            'correctAnswer': 'C',
            'correctAnswerIndex': 2,
        }
    },
    'ssc-chsl-2024-03jul-s4.json': {
        45: {
            'options': ['6', '1', '2', '3'],
            'correctAnswer': 'C',
            'correctAnswerIndex': 2,
        }
    },
    'ssc-chsl-2024-05jul-s2.json': {
        38: {
            'options': ['6', '4', '2', '8'],
            'correctAnswer': 'A',
            'correctAnswerIndex': 0,
        }
    },
    'ssc-chsl-2024-08jul-s2.json': {
        48: {
            'options': ['5', '9', '6', '1'],
            'correctAnswer': 'C',
            'correctAnswerIndex': 2,
        }
    },
    'ssc-chsl-2024-08jul-s3.json': {
        45: {
            'options': ['3', '9', '2', '1'],
            'correctAnswer': 'D',
            'correctAnswerIndex': 3,
        }
    },
    'ssc-chsl-2024-11jul-s1.json': {
        34: {
            'options': ['6', '2', '4', '8'],
            'correctAnswer': 'A',
            'correctAnswerIndex': 0,
        },
        59: {
            'stem': 'What is the value of $\\frac{[\\frac{1}{4} \\div \\frac{1}{4} \\times \\frac{1}{4}] \\times \\frac{1}{4}}{[\\frac{1}{8} + \\frac{1}{8} \\times \\frac{1}{8}]} + (1 - \\frac{4}{9})$?',
            'options': ['1', '0', '3', '2'],
            'correctAnswer': 'A',
            'correctAnswerIndex': 0,
        }
    },
    'ssc-chsl-2024-11jul-s2.json': {
        28: {
            'stem': 'Six numbers 1, 2, 4, 5, 7 and 9 are written on different faces of a dice. Two positions of this dice are shown in the figure. Which is the number on the face opposite to the face containing 9?',
            'options': ['5', '1', '7', '2'],
            'correctAnswer': 'A',
            'correctAnswerIndex': 0,
        }
    },
    'ssc-chsl-2024-11jul-s4.json': {
        74: {
            'stem': 'What should be added to each term of the ratio 5 : 11 so that the ratio becomes 3 : 5?',
            'options': ['5', '4', '2', '6'],
            'correctAnswer': 'B',
            'correctAnswerIndex': 1,
        }
    },
    'ssc-chsl-2020-16oct-s3.json': {
        30: {
            'options': ['Option (A)', 'Option (B)', 'Option (C)', 'Option (D)'],
        }
    },
    'ssc-chsl-2021-31may-s3.json': {
        54: {
            'options': ['Option (A)', 'Option (B)', 'Option (C)', 'Option (D)'],
        }
    }
}

def apply_repairs():
    repaired_count = 0
    for fname, q_dict in REPAIRS.items():
        fpath = os.path.join(EXAMS_DIR, fname)
        if not os.path.exists(fpath):
            print(f"File not found: {fpath}")
            continue
            
        with open(fpath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        modified = False
        for q in data.get('questions', []):
            qnum = q.get('questionNumber')
            if qnum in q_dict:
                patch = q_dict[qnum]
                if 'options' in patch:
                    q['options'] = patch['options']
                    if not any(opt.startswith('Option (') for opt in patch['options']):
                        q['optionImages'] = None
                        q['richOptions'] = None
                    elif 'richOptions' in q and q['richOptions']:
                        for idx, opt_text in enumerate(patch['options']):
                            if idx < len(q['richOptions']):
                                q['richOptions'][idx]['text'] = opt_text
                if 'stem' in patch:
                    q['questionText'] = patch['stem']
                    if 'contentBlocks' in q and q['contentBlocks']:
                        for b in q['contentBlocks']:
                            if b.get('type') == 'text':
                                b['content'] = patch['stem']
                if 'correctAnswer' in patch:
                    q['correctAnswer'] = patch['correctAnswer']
                if 'correctAnswerIndex' in patch:
                    q['correctAnswerIndex'] = patch['correctAnswerIndex']
                modified = True
                repaired_count += 1
                print(f"Repaired {fname} Q{qnum}")
                
        if modified:
            with open(fpath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                
    print(f"\nSuccessfully repaired {repaired_count} questions across {len(REPAIRS)} exam papers.")

if __name__ == '__main__':
    apply_repairs()
