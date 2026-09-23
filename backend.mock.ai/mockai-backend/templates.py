EXAM_TEMPLATES = {
    "SSC": {
        "difficulty_style": "Direct, formula-based, and speed-oriented.",
        "wording_pattern": "Straightforward phrasing, focusing on clear calculations or direct facts.",
        "marking_scheme": "+2 for correct, -0.5 for incorrect.",
        "time_limits": "Expected completion time per question is 30-45 seconds."
    },
    "UPSC": {
        "difficulty_style": "Highly analytical, multi-statement, conceptual depth, and interdisciplinary.",
        "wording_pattern": "Complex phrasing, often using 'Consider the following statements' with multiple combinations (e.g., 1 only, 1 and 2).",
        "marking_scheme": "+2 for correct, -0.66 for incorrect.",
        "time_limits": "Expected completion time per question is 60-90 seconds."
    },
    "BANKING": {
        "difficulty_style": "High-speed logic, intensive calculations, and complex data interpretation.",
        "wording_pattern": "Tricky phrasing designed to test reading speed and mathematical shortcuts.",
        "marking_scheme": "+1 for correct, -0.25 for incorrect.",
        "time_limits": "Expected completion time per question is 25-40 seconds."
    },
    "RAILWAY": {
        "difficulty_style": "Basic to moderate application of formulas and static general knowledge.",
        "wording_pattern": "One-liner questions, highly factual and unambiguous.",
        "marking_scheme": "+1 for correct, -0.33 for incorrect.",
        "time_limits": "Expected completion time per question is 20-30 seconds."
    },
    "GATE": {
        "difficulty_style": "Advanced engineering and mathematics concepts, highly numerical and logic-based.",
        "wording_pattern": "Precise technical phrasing, often numerical answer type or complex MCQs.",
        "marking_scheme": "+1 or +2 for correct, -1/3 or -2/3 for incorrect.",
        "time_limits": "Expected completion time per question is 2-3 minutes."
    },
    "JEE": {
        "difficulty_style": "Rigorous conceptual application in physics, chemistry, and mathematics.",
        "wording_pattern": "Multi-step problem phrasing requiring conceptual linkages.",
        "marking_scheme": "+4 for correct, -1 for incorrect.",
        "time_limits": "Expected completion time per question is 2-3 minutes."
    },
    "NEET": {
        "difficulty_style": "Extensive syllabus coverage with a mix of direct biology facts and application-based physics/chemistry.",
        "wording_pattern": "Clear scientific phrasing, often match-the-following or assertion-reason types.",
        "marking_scheme": "+4 for correct, -1 for incorrect.",
        "time_limits": "Expected completion time per question is 45-60 seconds."
    },
    "STATE PSC": {
        "difficulty_style": "Moderate to difficult, heavily focused on state-specific geography, history, and administration alongside general studies.",
        "wording_pattern": "Factual to analytical, similar to UPSC but slightly more direct.",
        "marking_scheme": "+1 or +2 for correct, standard negative marking.",
        "time_limits": "Expected completion time per question is 50-60 seconds."
    },
    "POLICE": {
        "difficulty_style": "Basic quantitative aptitude, reasoning, and practical legal/civic knowledge.",
        "wording_pattern": "Simple, direct, scenario-based or factual one-liners.",
        "marking_scheme": "+1 for correct, -0.25 for incorrect.",
        "time_limits": "Expected completion time per question is 30-40 seconds."
    },
    "TEACHING": {
        "difficulty_style": "Pedagogy-focused, child development concepts, and subject matter expertise.",
        "wording_pattern": "Scenario-based phrasing evaluating teacher-student interaction and academic principles.",
        "marking_scheme": "+1 for correct, usually no negative marking.",
        "time_limits": "Expected completion time per question is 45-60 seconds."
    }
}

def get_exam_template(exam_name: str) -> dict:
    """Returns the matching template or a standard default if exam is not listed."""
    default_template = {
        "difficulty_style": "Standard academic level testing core concepts.",
        "wording_pattern": "Clear and concise academic phrasing.",
        "marking_scheme": "+1 for correct, 0 for incorrect.",
        "time_limits": "Expected completion time is 60 seconds."
    }
    
    if not exam_name:
        return default_template
        
    normalized_exam = exam_name.upper().strip()
    return EXAM_TEMPLATES.get(normalized_exam, default_template)
