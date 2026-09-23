import hashlib
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple

import numpy as np
from faker import Faker

from .config import EngineConfig
from .schema import QuestionRecord
from .templates import (
    COGNITIVE_LEVELS,
    DIFFICULTY_LEVELS,
    EXAM_BLUEPRINT,
    QUESTION_TYPES,
    RENDERERS,
    SUBJECT_TOPIC_MAP,
)
from .validator import ValidationEngine


LOGGER = logging.getLogger(__name__)


class QuestionGenerator:
    def __init__(self, cfg: EngineConfig, external_hashes: Optional[Set[str]] = None):
        self.cfg = cfg
        self.rng = np.random.default_rng(cfg.seed)
        self.faker = Faker("en_IN")
        self.external_hashes = external_hashes or set()
        self.local_hashes: Set[str] = set()
        self.exam_counters: Dict[str, int] = {}

    def _pick_language(self) -> str:
        return "English" if float(self.rng.random()) < self.cfg.language_mix_english else "Hindi"

    def _pick_subject_block(self) -> Tuple[str, str, str]:
        subject = list(SUBJECT_TOPIC_MAP.keys())[int(self.rng.integers(0, len(SUBJECT_TOPIC_MAP)))]
        topic, subtopic = SUBJECT_TOPIC_MAP[subject][int(self.rng.integers(0, len(SUBJECT_TOPIC_MAP[subject])))]
        return subject, topic, subtopic

    def _pick_difficulty(self) -> str:
        w = [0.4, 0.4, 0.2]
        return str(self.rng.choice(DIFFICULTY_LEVELS, p=w))

    def _pick_cognitive_level(self, difficulty: str) -> str:
        if difficulty == "Easy":
            levels = ["Remember", "Understand", "Apply"]
        elif difficulty == "Medium":
            levels = ["Understand", "Apply", "Analyze"]
        else:
            levels = ["Analyze", "Evaluate", "Create"]
        return levels[int(self.rng.integers(0, len(levels)))]

    @staticmethod
    def _compute_hash(text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def _build_exam_id(self, exam_name: str, year: str) -> str:
        key = exam_name.upper().replace(" ", "_")
        count = self.exam_counters.get(key, 0) + 1
        self.exam_counters[key] = count
        return f"{key}_{year}_{count:07d}"

    def _is_duplicate_hash(self, h: str) -> bool:
        return h in self.external_hashes or h in self.local_hashes

    def _remember_hash(self, h: str) -> None:
        self.local_hashes.add(h)
        if len(self.local_hashes) > self.cfg.in_memory_hash_cache_limit:
            self.local_hashes.clear()

    def _render_core_question(self, difficulty: str, language: str):
        renderer = RENDERERS[int(self.rng.integers(0, len(RENDERERS)))]
        return renderer(self.rng, difficulty, language)

    def _question_hash_payload(self, exam_name: str, subject: str, topic: str, q: str, options: List[str], lang: str) -> str:
        options_key = "|".join(options)
        return f"{exam_name}::{subject}::{topic}::{lang}::{q}::{options_key}"

    def generate_batch(self, batch_size: Optional[int] = None) -> Tuple[List[QuestionRecord], Dict[str, int]]:
        target = batch_size or self.cfg.batch_size
        records: List[QuestionRecord] = []
        metrics = {"generated_attempts": 0, "duplicates": 0, "validation_failures": 0, "success": 0}

        while len(records) < target:
            metrics["generated_attempts"] += 1
            exam = EXAM_BLUEPRINT[int(self.rng.integers(0, len(EXAM_BLUEPRINT)))]
            subject, topic, subtopic = self._pick_subject_block()
            difficulty = self._pick_difficulty()
            cognitive = self._pick_cognitive_level(difficulty)
            language = self._pick_language()
            core = self._render_core_question(difficulty=difficulty, language=language)

            hash_payload = self._question_hash_payload(
                exam_name=exam["exam_name"],
                subject=subject,
                topic=topic,
                q=core.question,
                options=core.options,
                lang=language,
            )
            q_hash = self._compute_hash(hash_payload)
            if self._is_duplicate_hash(q_hash):
                metrics["duplicates"] += 1
                continue

            now_iso = datetime.now(timezone.utc).isoformat()
            exam_id = self._build_exam_id(exam["exam_name"], self.cfg.year)
            record = QuestionRecord(
                exam_id=exam_id,
                exam_name=exam["exam_name"],
                exam_category=exam["exam_category"],
                organization=exam["organization"],
                country=self.cfg.country,
                state=exam["state"] if exam["state"] else "All India",
                year=self.cfg.year,
                subject=subject,
                topic=topic,
                subtopic=subtopic,
                difficulty=difficulty,
                cognitive_level=cognitive if cognitive in COGNITIVE_LEVELS else "Apply",
                question_type=core.question_type if core.question_type in QUESTION_TYPES else "MCQ",
                question=core.question,
                options=core.options,
                correct_answer=core.correct_answer,
                explanation=core.explanation,
                marks=core.marks,
                negative_marks=core.negative_marks,
                time_limit_seconds=core.time_limit_seconds,
                language=language,
                source=self.cfg.default_source,
                tags=[
                    exam["exam_name"].lower().replace(" ", "-"),
                    subject.lower().replace(" ", "-"),
                    difficulty.lower(),
                    core.question_type.lower().replace(" ", "-"),
                ],
                created_at=now_iso,
                updated_at=now_iso,
                question_hash=q_hash,
            )
            ok, reason = ValidationEngine.validate_record(record)
            if not ok:
                metrics["validation_failures"] += 1
                LOGGER.debug("Validation failed: %s", reason)
                continue

            self._remember_hash(q_hash)
            records.append(record)
            metrics["success"] += 1

        return records, metrics
