from pydantic import BaseModel

class QuestionRequest(BaseModel):
    exam: str
    subject: str
    topic: str
    difficulty: str
    count: int

class NextTopicRequest(BaseModel):
    exam: str | None = None
    subject: str | None = None
    count: int = 5

class UserAnswer(BaseModel):
    question: str
    selected_answer: str
    correct_answer: str

class SubmitTestRequest(BaseModel):
    user_id: str
    exam: str
    subject: str
    topic: str
    difficulty: str | None = None
    answers: list[UserAnswer]

class AdaptiveTestRequest(BaseModel):
    user_id: str
    exam: str
    subject: str
    count: int = 5

class StudyPlanRequest(BaseModel):
    user_id: str
    exam: str
    subject: str

class SubmitRevisionRequest(BaseModel):
    user_id: str
    exam: str
    subject: str
    topic: str
    result: str  # "correct" or "wrong"

class StartExamRequest(BaseModel):
    user_id: str
    exam: str
    mode: str = "quick"  # full | sectional | quick

class ExamAnswer(BaseModel):
    index: int
    selected_answer: str

class SubmitExamRequest(BaseModel):
    session_id: int
    user_id: str
    answers: list[ExamAnswer]
