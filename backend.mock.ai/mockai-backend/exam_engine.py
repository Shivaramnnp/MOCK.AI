import logging
import json
import random
from datetime import datetime
from database import connection_pool
from rank_engine import get_percentile, estimate_rank
from analytics_engine import get_topic_heatmap

logger = logging.getLogger("mockai_logger")

# ─────────────────────────────────────────────────────
# Exam configuration: durations and question counts
# ─────────────────────────────────────────────────────
EXAM_CONFIG = {
    "SSC": {"full": {"questions": 100, "duration": 60}, "sectional": {"questions": 25, "duration": 20}, "quick": {"questions": 10, "duration": 10}},
    "UPSC": {"full": {"questions": 100, "duration": 120}, "sectional": {"questions": 25, "duration": 30}, "quick": {"questions": 10, "duration": 15}},
    "JEE": {"full": {"questions": 75, "duration": 180}, "sectional": {"questions": 25, "duration": 60}, "quick": {"questions": 10, "duration": 15}},
    "NEET": {"full": {"questions": 180, "duration": 180}, "sectional": {"questions": 45, "duration": 45}, "quick": {"questions": 10, "duration": 10}},
    "GATE": {"full": {"questions": 65, "duration": 180}, "sectional": {"questions": 20, "duration": 60}, "quick": {"questions": 10, "duration": 15}},
    "BANKING": {"full": {"questions": 100, "duration": 60}, "sectional": {"questions": 25, "duration": 20}, "quick": {"questions": 10, "duration": 10}},
    "DEFAULT": {"full": {"questions": 50, "duration": 60}, "sectional": {"questions": 25, "duration": 30}, "quick": {"questions": 10, "duration": 10}},
}

# Target difficulty distribution: 30% Easy, 50% Medium, 20% Hard
DIFFICULTY_RATIO = {"Easy": 0.30, "Medium": 0.50, "Hard": 0.20}


def _get_exam_config(exam: str, mode: str):
    """Returns question count and duration for the given exam and mode."""
    config = EXAM_CONFIG.get(exam.upper(), EXAM_CONFIG["DEFAULT"])
    return config.get(mode, config["quick"])


def _pull_questions_from_db(exam: str, total_needed: int):
    """
    Pulls questions from the questions table with balanced difficulty.
    Falls back to whatever is available if not enough questions exist.
    """
    if not connection_pool:
        return []

    easy_count = max(1, int(total_needed * DIFFICULTY_RATIO["Easy"]))
    medium_count = max(1, int(total_needed * DIFFICULTY_RATIO["Medium"]))
    hard_count = total_needed - easy_count - medium_count

    conn = connection_pool.getconn()
    try:
        questions = []
        with conn.cursor() as cur:
            for diff, count in [("Easy", easy_count), ("Medium", medium_count), ("Hard", hard_count)]:
                cur.execute("""
                    SELECT id, exam, subject, topic, difficulty, question, options, answer, explanation
                    FROM questions
                    WHERE exam = %s AND difficulty = %s
                    ORDER BY RANDOM()
                    LIMIT %s;
                """, (exam, diff, count))
                rows = cur.fetchall()
                for r in rows:
                    questions.append({
                        "id": r[0],
                        "exam": r[1],
                        "subject": r[2],
                        "topic": r[3],
                        "difficulty": r[4],
                        "question": r[5],
                        "options": r[6] if isinstance(r[6], list) else json.loads(r[6]) if r[6] else [],
                        "correct_answer": r[7],
                        "explanation": r[8]
                    })

            # If we didn't get enough, pull more without difficulty filter
            if len(questions) < total_needed:
                existing_ids = [q["id"] for q in questions]
                placeholders = ",".join(["%s"] * len(existing_ids)) if existing_ids else "0"
                remaining = total_needed - len(questions)
                
                query = f"""
                    SELECT id, exam, subject, topic, difficulty, question, options, answer, explanation
                    FROM questions
                    WHERE exam = %s AND id NOT IN ({placeholders})
                    ORDER BY RANDOM()
                    LIMIT %s;
                """
                params = [exam] + existing_ids + [remaining]
                cur.execute(query, params)
                rows = cur.fetchall()
                for r in rows:
                    questions.append({
                        "id": r[0],
                        "exam": r[1],
                        "subject": r[2],
                        "topic": r[3],
                        "difficulty": r[4],
                        "question": r[5],
                        "options": r[6] if isinstance(r[6], list) else json.loads(r[6]) if r[6] else [],
                        "correct_answer": r[7],
                        "explanation": r[8]
                    })

        # Shuffle for randomization
        random.shuffle(questions)
        return questions

    except Exception as e:
        logger.error(f"Exam engine: failed to pull questions: {e}")
        return []
    finally:
        connection_pool.putconn(conn)


def start_exam(user_id: str, exam: str, mode: str):
    """
    Creates a new mock exam session.
    Pulls questions from the DB, stores them in the session, and returns them
    WITHOUT correct answers (to prevent cheating).
    """
    config = _get_exam_config(exam, mode)
    total_questions = config["questions"]
    duration = config["duration"]

    questions = _pull_questions_from_db(exam, total_questions)

    if not questions:
        return None, "No questions available for this exam. Generate questions first."

    # Create session in DB
    if not connection_pool:
        return None, "Database unavailable"

    conn = connection_pool.getconn()
    try:
        started_at = datetime.now()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO mock_exam_sessions 
                    (user_id, exam, mode, total_questions, duration_minutes, questions, started_at, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'active')
                RETURNING id;
            """, (user_id, exam, mode, len(questions), duration, json.dumps(questions), started_at))
            session_id = cur.fetchone()[0]
            conn.commit()

        # Return questions WITHOUT correct_answer and explanation (anti-cheat)
        safe_questions = []
        for i, q in enumerate(questions):
            safe_questions.append({
                "index": i + 1,
                "question": q["question"],
                "options": q["options"],
                "subject": q.get("subject"),
                "topic": q.get("topic"),
                "difficulty": q.get("difficulty")
            })

        return {
            "session_id": session_id,
            "exam": exam,
            "mode": mode,
            "total_questions": len(questions),
            "duration_minutes": duration,
            "started_at": started_at.isoformat(),
            "questions": safe_questions
        }, None

    except Exception as e:
        logger.error(f"Exam engine: failed to start exam: {e}")
        conn.rollback()
        return None, str(e)
    finally:
        connection_pool.putconn(conn)


def submit_exam(session_id: int, user_id: str, answers: list):
    """
    Evaluates and records a completed mock exam.
    answers: list of {"index": 1, "selected_answer": "..."}
    
    Returns full result analysis with score, accuracy, rank, and weak topics.
    """
    if not connection_pool:
        return None, "Database unavailable"

    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            # Fetch session
            cur.execute("""
                SELECT id, user_id, exam, questions, duration_minutes, started_at, status
                FROM mock_exam_sessions
                WHERE id = %s AND user_id = %s;
            """, (session_id, user_id))
            row = cur.fetchone()

            if not row:
                return None, "Session not found"

            if row[6] != "active":
                return None, "This exam has already been submitted"

            exam = row[2]
            stored_questions = row[3] if isinstance(row[3], list) else json.loads(row[3])
            duration = row[4]
            started_at = row[5]

            # Check timer (allow 60s grace period)
            submitted_at = datetime.now()
            elapsed_minutes = (submitted_at - started_at).total_seconds() / 60.0
            time_exceeded = elapsed_minutes > (duration + 1)

            # Build answer lookup: index → selected_answer
            answer_map = {}
            for a in answers:
                answer_map[a.get("index", 0)] = a.get("selected_answer", "")

            # Evaluate
            correct = 0
            total = len(stored_questions)
            topic_results = {}  # topic → {correct, total}

            for i, q in enumerate(stored_questions):
                idx = i + 1
                selected = answer_map.get(idx, "").strip().lower()
                actual = q.get("correct_answer", "").strip().lower()
                topic = q.get("topic", "Unknown")

                if topic not in topic_results:
                    topic_results[topic] = {"correct": 0, "total": 0}
                topic_results[topic]["total"] += 1

                if selected == actual:
                    correct += 1
                    topic_results[topic]["correct"] += 1

            accuracy = (correct / total * 100.0) if total > 0 else 0.0
            score = correct  # 1 mark per correct answer

            # Update session
            cur.execute("""
                UPDATE mock_exam_sessions
                SET submitted_at = %s, score = %s, accuracy = %s, status = 'completed'
                WHERE id = %s;
            """, (submitted_at, score, accuracy, session_id))
            conn.commit()

        # Identify weak topics from this exam
        weak_topics = []
        for topic, data in topic_results.items():
            topic_acc = (data["correct"] / data["total"] * 100.0) if data["total"] > 0 else 0.0
            if topic_acc < 60.0:
                weak_topics.append({"topic": topic, "accuracy": round(topic_acc, 2)})
        weak_topics.sort(key=lambda x: x["accuracy"])

        # Get rank prediction
        percentile = get_percentile(user_id, exam)
        est_rank = estimate_rank(percentile, exam)

        return {
            "session_id": session_id,
            "exam": exam,
            "score": score,
            "total_questions": total,
            "accuracy": round(accuracy, 2),
            "percentile": percentile,
            "estimated_rank": est_rank,
            "time_taken_minutes": round(elapsed_minutes, 1),
            "time_exceeded": time_exceeded,
            "weak_topics": weak_topics,
            "topic_breakdown": {
                topic: {
                    "correct": data["correct"],
                    "total": data["total"],
                    "accuracy": round((data["correct"] / data["total"] * 100.0) if data["total"] > 0 else 0, 2)
                }
                for topic, data in topic_results.items()
            }
        }, None

    except Exception as e:
        logger.error(f"Exam engine: failed to submit exam: {e}")
        conn.rollback()
        return None, str(e)
    finally:
        connection_pool.putconn(conn)


def get_exam_history(user_id: str, limit: int = 10):
    """Returns the user's recent mock exam sessions."""
    if not connection_pool:
        return []

    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, exam, mode, total_questions, duration_minutes,
                       started_at, submitted_at, score, accuracy, status
                FROM mock_exam_sessions
                WHERE user_id = %s
                ORDER BY started_at DESC
                LIMIT %s;
            """, (user_id, limit))
            rows = cur.fetchall()

            sessions = []
            for r in rows:
                sessions.append({
                    "session_id": r[0],
                    "exam": r[1],
                    "mode": r[2],
                    "total_questions": r[3],
                    "duration_minutes": r[4],
                    "started_at": r[5].isoformat() if r[5] else None,
                    "submitted_at": r[6].isoformat() if r[6] else None,
                    "score": r[7],
                    "accuracy": round(r[8], 2) if r[8] else None,
                    "status": r[9]
                })
            return sessions
    except Exception as e:
        logger.error(f"Exam engine: failed to get history: {e}")
        return []
    finally:
        connection_pool.putconn(conn)
