import json
import logging

logger = logging.getLogger("mockai_logger")

REQUIRED_FIELDS = {
    "question",
    "options",
    "correct_answer",
    "explanation"
}

def validate_and_parse_response(response_text: str) -> list:
    """
    Parses and validates the JSON output from the model.
    Checks for required fields.
    Raises ValueError if validation fails.
    """
    try:
        clean_text = response_text.strip()
        # Clean markdown code blocks if present
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
        elif clean_text.startswith("```"):
            clean_text = clean_text[3:]
            
        questions = json.loads(clean_text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to decode JSON: {e}. Response was: {response_text[:200]}...")
        raise ValueError(f"Invalid JSON format: {str(e)}")
        
    if not isinstance(questions, list):
        raise ValueError("Response must be a JSON array")
        
    if not questions:
        raise ValueError("Empty list of questions returned")
        
    validated_questions = []
    
    for idx, q in enumerate(questions):
        if not isinstance(q, dict):
            raise ValueError(f"Question at index {idx} is not an object")
            
        # Check missing fields
        missing_fields = REQUIRED_FIELDS - set(q.keys())
        if missing_fields:
            raise ValueError(f"Question at index {idx} missing fields: {missing_fields}")
            
        # Check options
        options = q["options"]
        if not isinstance(options, list) or len(options) != 4:
            raise ValueError(f"Question at index {idx} must have exactly 4 options")
            
        validated_questions.append(q)
        
    return validated_questions
