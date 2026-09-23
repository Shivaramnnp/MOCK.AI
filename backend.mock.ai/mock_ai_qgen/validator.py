import json
from typing import Tuple

from .schema import QuestionRecord


class ValidationError(Exception):
    pass


class ValidationEngine:
    @staticmethod
    def validate_record(record: QuestionRecord) -> Tuple[bool, str]:
        required_text_fields = [
            "exam_id",
            "exam_name",
            "exam_category",
            "organization",
            "country",
            "year",
            "subject",
            "topic",
            "subtopic",
            "difficulty",
            "cognitive_level",
            "question_type",
            "question",
            "correct_answer",
            "explanation",
            "marks",
            "negative_marks",
            "time_limit_seconds",
            "language",
            "source",
            "created_at",
            "updated_at",
            "question_hash",
        ]
        for field in required_text_fields:
            val = getattr(record, field, None)
            if val is None or str(val).strip() == "":
                return False, f"missing_or_empty_field:{field}"

        if record.question_type in ("MCQ", "True/False", "Match the following", "Assertion-Reason", "Case study questions", "Diagram-based questions"):
            if not record.options:
                return False, "options_required_for_question_type"

        if record.correct_answer not in record.options and record.options and record.question_type in ("MCQ", "True/False", "Match the following", "Assertion-Reason", "Case study questions", "Diagram-based questions"):
            return False, "correct_answer_not_in_options"

        try:
            float(record.marks)
            float(record.negative_marks)
            int(record.time_limit_seconds)
        except ValueError:
            return False, "invalid_numeric_field_format"

        try:
            json.dumps(record.to_dict(), ensure_ascii=False)
        except TypeError:
            return False, "invalid_json_serializable_record"

        return True, "ok"
