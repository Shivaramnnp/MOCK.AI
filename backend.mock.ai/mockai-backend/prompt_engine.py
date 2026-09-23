from templates import get_exam_template

def build_exam_specific_logic(exam: str) -> str:
    exam_lower = exam.lower()
    if "ssc" in exam_lower:
        return "- Focus heavily on speed, arithmetic tricks, and direct pattern recognition."
    elif "upsc" in exam_lower or "civil" in exam_lower:
        return "- Focus deeply on conceptual reasoning, multi-statement logic, and comprehensive analytical thinking."
    elif "jee" in exam_lower:
        return "- Focus on advanced problem solving, numerical accuracy, and multi-concept application."
    elif "neet" in exam_lower:
        return "- Focus on factual depth, theoretical clarity, and core scientific principles."
    else:
        return "- Ensure questions test both factual knowledge and conceptual understanding, avoiding superficial questions."

def generate_prompt(exam: str, subject: str, topic: str, difficulty: str, count: int) -> str:
    try:
        template = get_exam_template(exam)
    except Exception:
        template = {
            'difficulty_style': 'Standard difficulty',
            'wording_pattern': 'Direct conceptual questions',
            'marking_scheme': '+1 for correct, 0 for incorrect',
            'time_limits': '1 minute per question'
        }

    exam_specific_rules = build_exam_specific_logic(exam)

    prompt = f"""
You are a STRICT JSON exam question generator.

⚠️ CRITICAL RULES (MUST FOLLOW):
- Output ONLY valid JSON
- Output MUST be a JSON ARRAY
- DO NOT include markdown, text, explanation outside JSON
- DO NOT skip any field
- If any field is missing → output is INVALID

⚠️ EACH QUESTION MUST HAVE:
1. question (string)
2. options (array of EXACTLY 4 UNIQUE strings)
3. correct_answer (must exactly match one option)
4. explanation (MINIMUM 15 WORDS — MUST NOT BE EMPTY)

⚠️ STRICT VALIDATION RULES:
- explanation must NOT be short
- options must NOT repeat
- correct_answer must be one of options
- ALL fields must exist in EVERY question

⚠️ IF YOU FAIL RULES:
REGENERATE internally until valid JSON is produced

---

Generate {count} HIGH-QUALITY questions:

Exam: {exam}
Subject: {subject}
Topic: {topic}
Difficulty: {difficulty}

---

Exam Style:
Difficulty Style: {template['difficulty_style']}
Wording Pattern: {template['wording_pattern']}
{exam_specific_rules}

---

Return ONLY JSON in this exact format:

[
  {{
    "question": "string",
    "options": ["A", "B", "C", "D"],
    "correct_answer": "string",
    "explanation": "minimum 15 words explanation"
  }}
]
"""
    return prompt