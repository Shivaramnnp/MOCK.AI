from dataclasses import dataclass, asdict
from typing import List


@dataclass
class QuestionRecord:
    exam_id: str
    exam_name: str
    exam_category: str
    organization: str
    country: str
    state: str
    year: str
    subject: str
    topic: str
    subtopic: str
    difficulty: str
    cognitive_level: str
    question_type: str
    question: str
    options: List[str]
    correct_answer: str
    explanation: str
    marks: str
    negative_marks: str
    time_limit_seconds: str
    language: str
    source: str
    tags: List[str]
    created_at: str
    updated_at: str
    question_hash: str

    def to_dict(self) -> dict:
        return asdict(self)
