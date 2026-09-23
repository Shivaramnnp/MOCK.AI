from typing import List, Optional, Set

import psycopg2
from psycopg2.extras import execute_values

from .config import PostgresConfig
from .schema import QuestionRecord


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS questions (
    id BIGSERIAL PRIMARY KEY,
    exam_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_answer TEXT NOT NULL,
    explanation TEXT NOT NULL,
    language TEXT NOT NULL,
    question_hash VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
"""


class PostgresStorage:
    def __init__(self, cfg: PostgresConfig):
        self.cfg = cfg
        self.conn = None

    def connect(self) -> None:
        self.conn = psycopg2.connect(
            host=self.cfg.host,
            port=self.cfg.port,
            dbname=self.cfg.dbname,
            user=self.cfg.user,
            password=self.cfg.password,
            connect_timeout=self.cfg.connect_timeout,
        )
        self.conn.autocommit = False
        with self.conn.cursor() as cur:
            cur.execute(CREATE_TABLE_SQL)
        self.conn.commit()

    def close(self) -> None:
        if self.conn:
            self.conn.close()
            self.conn = None

    def fetch_existing_hashes(self, limit: Optional[int] = None) -> Set[str]:
        if not self.conn:
            raise RuntimeError("Database not connected.")
        sql = "SELECT question_hash FROM questions"
        if limit:
            sql += f" LIMIT {int(limit)}"
        with self.conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()
        return {r[0] for r in rows}

    def insert_batch(self, records: List[QuestionRecord]) -> int:
        if not self.conn:
            raise RuntimeError("Database not connected.")
        if not records:
            return 0
        sql = """
        INSERT INTO questions
            (exam_name, subject, topic, difficulty, question, options, correct_answer, explanation, language, question_hash, created_at)
        VALUES %s
        ON CONFLICT (question_hash) DO NOTHING
        """
        values = [
            (
                r.exam_name,
                r.subject,
                r.topic,
                r.difficulty,
                r.question,
                r.options,
                r.correct_answer,
                r.explanation,
                r.language,
                r.question_hash,
                r.created_at,
            )
            for r in records
        ]
        with self.conn.cursor() as cur:
            execute_values(cur, sql, values, page_size=1000)
        self.conn.commit()
        return len(records)
