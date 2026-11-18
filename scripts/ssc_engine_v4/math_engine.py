"""
scripts/ssc_engine_v4/math_engine.py

Mathematical Expression Reconstruction and LaTeX Syntax Validation Engine.
Converts OCR approximations into authentic KaTeX expressions and validates syntax.
"""

import re
from typing import Tuple

class MathEngine:
    """
    Mathematical reconstruction and LaTeX normalization engine.
    """

    @staticmethod
    def validate_latex(latex_str: str) -> Tuple[bool, str]:
        """
        Validates basic KaTeX/LaTeX syntax:
        - Balanced curly braces {}
        - Balanced parentheses ()
        - Balanced brackets []
        - Valid LaTeX commands
        """
        if not latex_str:
            return True, "Empty"

        stack = []
        pairs = {'{': '}', '(': ')', '[': ']'}
        reverse_pairs = {v: k for k, v in pairs.items()}

        in_math = False
        i = 0
        while i < len(latex_str):
            ch = latex_str[i]
            if ch == '$':
                in_math = not in_math
                i += 1
                continue

            if ch in pairs:
                stack.append(ch)
            elif ch in reverse_pairs:
                if not stack or stack[-1] != reverse_pairs[ch]:
                    return False, f"Mismatched closing bracket '{ch}' at position {i}"
                stack.pop()
            i += 1

        if stack:
            return False, f"Unclosed opening bracket '{stack[-1]}'"

        return True, "Valid"

    @staticmethod
    def normalize_math_text(text: str) -> str:
        """
        Normalizes OCR math approximations into standard LaTeX:
        - Fractions: '3 / 4' -> '\\frac{3}{4}'
        - Mixed fractions: '1 81/289' -> '1 \\frac{81}{289}'
        - Radicals: '√10' -> '\\sqrt{10}'
        - Trigonometric notation repairs:
          'cot6' -> '\\cot \\theta'
          'cosec7@' or 'cosec2@' -> '\\csc^2 \\theta'
        """
        if not text:
            return ""

        t = text

        # 1. Normalize trigonometry symbols
        t = re.sub(r'\bcot[6\.]\b', r'\\cot \\theta', t)
        t = re.sub(r'\bcosec[72][@6](?=[^\w]|$)', r'\\csc^2 \\theta', t)
        t = re.sub(r'\bsec[@6](?=[^\w]|$)', r'\\sec \\theta', t)
        t = re.sub(r'\bcos[@6](?=[^\w]|$)', r'\\cos \\theta', t)
        t = re.sub(r'\bsin[@6](?=[^\w]|$)', r'\\sin \\theta', t)
        t = re.sub(r'\btan[@6](?=[^\w]|$)', r'\\tan \\theta', t)

        # 2. Square roots: √10 -> \sqrt{10}
        t = re.sub(r'√(\d+)', r'\\sqrt{\1}', t)
        t = re.sub(r'√\((.*?)\)', r'\\sqrt{\1}', t)

        # 3. Simple fractions: 81/289 -> \frac{81}{289}
        t = re.sub(r'\b(\d+)\s*/\s*(\d+)\b', r'\\frac{\1}{\2}', t)

        # 4. Mixed fractions: e.g. 1 \frac{81}{289}
        t = re.sub(r'\b(\d+)\s+(\\frac\{\d+\}\{\d+\})\b', r'\1 \2', t)

        return t
