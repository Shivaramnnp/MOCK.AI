import logging
import hashlib
from collections import deque

logger = logging.getLogger("mockai_logger")

# Variation Engine: Cache the last 100 question hashes
recent_question_cache = deque(maxlen=100)

def calculate_quality_score(q: dict) -> int:
    score = 100
    
    question = q.get("question", "")
    explanation = q.get("explanation", "")
    
    # Penalize short questions
    if len(question) < 30:
        score -= 20
        
    # Penalize short explanations
    if len(explanation) < 20:
        score -= 20
        
    # Check if correct_answer matches options perfectly
    options = q.get("options", [])
    correct_answer = q.get("correct_answer", "")
    if correct_answer not in options:
        score -= 50
        
    # Options uniqueness
    if len(set(options)) != len(options):
        score -= 30
        
    # Generic placeholder penalties
    placeholders = ["placeholder", "insert text here", "option a", "option b", "generic"]
    text_content = (question + " ".join(options) + explanation).lower()
    for p in placeholders:
        if p in text_content:
            score -= 40
            
    return max(0, score)

def validate_question_quality(q: dict) -> bool:
    """
    Quality Engine & Variation Engine check.
    Returns True if the question passes quality and variation checks.
    """
    question = q.get("question", "")
    
    if len(question) < 20:
        logger.warning("Quality Engine: Rejected - Question too short")
        return False
        
    options = q.get("options", [])
    if len(options) != 4:
        logger.warning("Quality Engine: Rejected - Invalid options count")
        return False
        
    correct_answer = q.get("correct_answer", "")
    if correct_answer not in options:
        logger.warning("Quality Engine: Rejected - Correct answer not in options")
        return False
        
    if len(set(options)) != 4:
        logger.warning("Quality Engine: Rejected - Options not unique")
        return False
        
    explanation = q.get("explanation", "")
    if not explanation or len(explanation.split()) < 10:
        logger.warning("Quality Engine: Auto-filling missing/short explanation")
        q["explanation"] = f"The correct answer is {correct_answer}. (Auto-generated fallback explanation)."
        
    # Variation Engine: Deduplication check
    q_hash = hashlib.sha256(question.encode('utf-8')).hexdigest()
    if q_hash in recent_question_cache:
        logger.warning("Variation Engine: Rejected - Duplicate recent question")
        return False
        
    # Score check
    score = calculate_quality_score(q)
    if score < 70:
        logger.warning(f"Quality Engine: Rejected - Score too low ({score})")
        return False
        
    # Add to cache if valid
    recent_question_cache.append(q_hash)
    
    return True

def filter_high_quality_questions(questions: list) -> list:
    """Filters a list of questions, keeping only high-quality ones."""
    high_quality = []
    for q in questions:
        if validate_question_quality(q):
            high_quality.append(q)
    return high_quality
