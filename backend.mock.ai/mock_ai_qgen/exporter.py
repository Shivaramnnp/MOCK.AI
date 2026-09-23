from pathlib import Path
from typing import Iterable, List

import pandas as pd

from .schema import QuestionRecord


class Exporter:
    @staticmethod
    def export_json(records: Iterable[QuestionRecord], out_path: str) -> None:
        rows = [r.to_dict() for r in records]
        pd.DataFrame(rows).to_json(out_path, orient="records", force_ascii=False, indent=2)

    @staticmethod
    def export_csv(records: Iterable[QuestionRecord], out_path: str) -> None:
        rows = [r.to_dict() for r in records]
        pd.DataFrame(rows).to_csv(out_path, index=False)

    @staticmethod
    def export_sql(records: Iterable[QuestionRecord], out_path: str, table_name: str = "questions") -> None:
        path = Path(out_path)
        lines: List[str] = []
        for r in records:
            options_txt = str(r.options).replace("'", "''")
            question_txt = r.question.replace("'", "''")
            explanation_txt = r.explanation.replace("'", "''")
            answer_txt = r.correct_answer.replace("'", "''")
            lines.append(
                "INSERT INTO {table} "
                "(exam_name, subject, topic, difficulty, question, options, correct_answer, explanation, language, question_hash, created_at) "
                "VALUES ('{exam_name}','{subject}','{topic}','{difficulty}','{question}','{options}','{answer}','{exp}','{lang}','{hash}','{created}');".format(
                    table=table_name,
                    exam_name=r.exam_name.replace("'", "''"),
                    subject=r.subject.replace("'", "''"),
                    topic=r.topic.replace("'", "''"),
                    difficulty=r.difficulty,
                    question=question_txt,
                    options=options_txt,
                    answer=answer_txt,
                    exp=explanation_txt,
                    lang=r.language,
                    hash=r.question_hash,
                    created=r.created_at,
                )
            )
        path.write_text("\n".join(lines), encoding="utf-8")
