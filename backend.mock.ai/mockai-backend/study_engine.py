import logging
import json
from datetime import datetime, date
from database import connection_pool
from user_performance import get_user_weak_topics
from rank_engine import get_readiness_level
from revision_engine import get_due_revisions

logger = logging.getLogger("mockai_logger")

# ─────────────────────────────────────────────────────
# Time allocation per difficulty
# ─────────────────────────────────────────────────────
TIME_MAP = {
    "Easy": 10,
    "Medium": 20,
    "Hard": 30
}

# ─────────────────────────────────────────────────────
# Task distribution by readiness level
# ─────────────────────────────────────────────────────
PLAN_PROFILES = {
    "Low": {
        "weak_pct": 0.60,
        "medium_pct": 0.30,
        "revision_pct": 0.10,
        "max_tasks": 6
    },
    "Moderate": {
        "weak_pct": 0.40,
        "medium_pct": 0.40,
        "revision_pct": 0.20,
        "max_tasks": 8
    },
    "High": {
        "weak_pct": 0.20,
        "medium_pct": 0.30,
        "revision_pct": 0.50,
        "max_tasks": 8
    }
}


def _get_user_accuracy_for_readiness(user_id: str, exam: str) -> float:
    """Gets the user's recent average accuracy to determine readiness."""
    if not connection_pool:
        return 0.0
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT AVG(accuracy) FROM (
                    SELECT accuracy FROM test_history
                    WHERE user_id = %s AND exam = %s
                    ORDER BY created_at DESC LIMIT 10
                ) sub;
            """, (user_id, exam))
            row = cur.fetchone()
            if row and row[0] is not None:
                return float(row[0])
            return 0.0
    except Exception as e:
        logger.error(f"Study engine: failed to get user accuracy: {e}")
        return 0.0
    finally:
        connection_pool.putconn(conn)


def _get_uncovered_topics(exam: str, subject: str, limit: int = 10):
    """Gets topics from syllabus coverage that have the fewest questions generated."""
    if not connection_pool:
        return []
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT topic
                FROM topic_coverage
                WHERE exam = %s AND subject = %s
                ORDER BY questions_generated ASC
                LIMIT %s;
            """, (exam, subject, limit))
            return [r[0] for r in cur.fetchall()]
    except Exception as e:
        logger.error(f"Study engine: failed to get uncovered topics: {e}")
        return []
    finally:
        connection_pool.putconn(conn)


def _has_plan_today(user_id: str, exam: str, subject: str) -> bool:
    """Checks if a study plan was already generated today for this user."""
    if not connection_pool:
        return False
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT COUNT(*) FROM study_plan
                WHERE user_id = %s AND exam = %s AND subject = %s
                  AND created_at::date = CURRENT_DATE;
            """, (user_id, exam, subject))
            row = cur.fetchone()
            return row is not None and row[0] > 0
    except Exception as e:
        logger.error(f"Study engine: failed to check existing plan: {e}")
        return False
    finally:
        connection_pool.putconn(conn)


def _save_plan_tasks(tasks: list):
    """Bulk-inserts plan tasks into the study_plan table."""
    if not connection_pool or not tasks:
        return
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            for t in tasks:
                cur.execute("""
                    INSERT INTO study_plan (user_id, exam, subject, topic, task_type, difficulty, estimated_minutes)
                    VALUES (%s, %s, %s, %s, %s, %s, %s);
                """, (t["user_id"], t["exam"], t["subject"], t["topic"],
                      t["task_type"], t["difficulty"], t["estimated_minutes"]))
            conn.commit()
    except Exception as e:
        logger.error(f"Study engine: failed to save plan: {e}")
        conn.rollback()
    finally:
        connection_pool.putconn(conn)


def generate_daily_plan(user_id: str, exam: str, subject: str):
    """
    Generates an intelligent daily study plan.
    
    Steps:
    1. Check if plan already exists today → return existing if so.
    2. Get weak topics from user_performance.
    3. Get uncovered topics from coverage_tracker.
    4. Get readiness level from rank_engine.
    5. Build task list with proper distribution.
    6. Save to DB and return.
    """
    # If plan already generated today, return existing
    if _has_plan_today(user_id, exam, subject):
        return get_study_plan(user_id, exam, subject)

    # ── Gather intelligence ──
    weak_topics_data = get_user_weak_topics(user_id, exam, subject)
    uncovered_topics = _get_uncovered_topics(exam, subject)
    accuracy = _get_user_accuracy_for_readiness(user_id, exam)
    readiness = get_readiness_level(accuracy)

    profile = PLAN_PROFILES.get(readiness, PLAN_PROFILES["Low"])
    max_tasks = profile["max_tasks"]

    # ── Separate topics by strength ──
    very_weak = [t for t in weak_topics_data if t["strength"] == "VERY WEAK"]
    weak = [t for t in weak_topics_data if t["strength"] == "WEAK"]
    strong = [t for t in weak_topics_data if t["strength"] == "STRONG"]
    
    # Topics the user has never attempted (from syllabus coverage)
    attempted_topic_names = {t["topic"] for t in weak_topics_data}
    new_topics = [t for t in uncovered_topics if t not in attempted_topic_names]

    # ── Allocate task slots ──
    weak_slots = max(1, int(max_tasks * profile["weak_pct"]))
    medium_slots = max(1, int(max_tasks * profile["medium_pct"]))
    revision_slots = max(1, max_tasks - weak_slots - medium_slots)

    tasks = []

    # ── PRIORITY: Inject overdue revisions from spaced repetition engine ──
    due_revisions = get_due_revisions(user_id, exam)
    revision_inject_limit = 3  # Cap so we don't flood the plan
    for rev in due_revisions[:revision_inject_limit]:
        if rev["topic"] and rev["subject"] == subject:
            tasks.append({
                "user_id": user_id, "exam": exam, "subject": subject,
                "topic": rev["topic"], "task_type": "revision",
                "difficulty": "Easy", "estimated_minutes": TIME_MAP["Easy"]
            })

    # ── Fill WEAK slots (practice on weakest topics) ──
    weak_pool = very_weak + weak + [{"topic": t, "strength": "NEW"} for t in new_topics]
    for i in range(weak_slots):
        if i < len(weak_pool):
            topic_name = weak_pool[i]["topic"]
            difficulty = "Easy" if weak_pool[i].get("strength") in ("VERY WEAK", "NEW") else "Medium"
        elif new_topics:
            topic_name = new_topics[i % len(new_topics)]
            difficulty = "Easy"
        else:
            # Fallback: pick from uncovered
            topic_name = uncovered_topics[i % len(uncovered_topics)] if uncovered_topics else subject
            difficulty = "Easy"

        tasks.append({
            "user_id": user_id, "exam": exam, "subject": subject,
            "topic": topic_name, "task_type": "practice",
            "difficulty": difficulty, "estimated_minutes": TIME_MAP[difficulty]
        })

    # ── Fill MEDIUM slots (study / concept-building) ──
    medium_pool = weak + [{"topic": t} for t in new_topics]
    for i in range(medium_slots):
        if i < len(medium_pool):
            topic_name = medium_pool[i]["topic"]
        elif uncovered_topics:
            topic_name = uncovered_topics[i % len(uncovered_topics)]
        else:
            topic_name = subject
        tasks.append({
            "user_id": user_id, "exam": exam, "subject": subject,
            "topic": topic_name, "task_type": "study",
            "difficulty": "Medium", "estimated_minutes": TIME_MAP["Medium"]
        })

    # ── Fill REVISION slots (strong topics or recently attempted) ──
    revision_pool = strong + very_weak  # revise strong to retain, and very weak to reinforce
    for i in range(revision_slots):
        if i < len(revision_pool):
            topic_name = revision_pool[i]["topic"]
            difficulty = "Hard" if revision_pool[i].get("strength") == "STRONG" else "Easy"
        elif uncovered_topics:
            topic_name = uncovered_topics[i % len(uncovered_topics)]
            difficulty = "Medium"
        else:
            topic_name = subject
            difficulty = "Medium"
        tasks.append({
            "user_id": user_id, "exam": exam, "subject": subject,
            "topic": topic_name, "task_type": "revision",
            "difficulty": difficulty, "estimated_minutes": TIME_MAP[difficulty]
        })

    # ── Save to DB ──
    _save_plan_tasks(tasks)

    total_minutes = sum(t["estimated_minutes"] for t in tasks)

    return {
        "user_id": user_id,
        "exam": exam,
        "subject": subject,
        "readiness": readiness,
        "total_tasks": len(tasks),
        "estimated_total_minutes": total_minutes,
        "tasks": [
            {
                "topic": t["topic"],
                "task_type": t["task_type"],
                "difficulty": t["difficulty"],
                "estimated_minutes": t["estimated_minutes"],
                "completed": False
            }
            for t in tasks
        ]
    }


def get_study_plan(user_id: str, exam: str = None, subject: str = None):
    """
    Returns the user's current (today's) study plan.
    Falls back to the latest plan if none exists for today.
    """
    if not connection_pool:
        return {"tasks": []}

    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            # Try today's plan first
            if exam and subject:
                cur.execute("""
                    SELECT id, topic, task_type, difficulty, estimated_minutes, completed, created_at
                    FROM study_plan
                    WHERE user_id = %s AND exam = %s AND subject = %s
                      AND created_at::date = CURRENT_DATE
                    ORDER BY id ASC;
                """, (user_id, exam, subject))
            else:
                cur.execute("""
                    SELECT id, topic, task_type, difficulty, estimated_minutes, completed, created_at
                    FROM study_plan
                    WHERE user_id = %s
                      AND created_at::date = CURRENT_DATE
                    ORDER BY id ASC;
                """, (user_id,))
            
            rows = cur.fetchall()

            # Fallback to latest plan if no plan today
            if not rows:
                if exam and subject:
                    cur.execute("""
                        SELECT id, topic, task_type, difficulty, estimated_minutes, completed, created_at
                        FROM study_plan
                        WHERE user_id = %s AND exam = %s AND subject = %s
                        ORDER BY created_at DESC
                        LIMIT 20;
                    """, (user_id, exam, subject))
                else:
                    cur.execute("""
                        SELECT id, topic, task_type, difficulty, estimated_minutes, completed, created_at
                        FROM study_plan
                        WHERE user_id = %s
                        ORDER BY created_at DESC
                        LIMIT 20;
                    """, (user_id,))
                rows = cur.fetchall()

            tasks = []
            for r in rows:
                tasks.append({
                    "id": r[0],
                    "topic": r[1],
                    "task_type": r[2],
                    "difficulty": r[3],
                    "estimated_minutes": r[4],
                    "completed": r[5],
                    "created_at": r[6].isoformat() if r[6] else None
                })
            
            completed = sum(1 for t in tasks if t["completed"])
            total_minutes = sum(t["estimated_minutes"] for t in tasks)
            
            return {
                "user_id": user_id,
                "total_tasks": len(tasks),
                "completed_tasks": completed,
                "estimated_total_minutes": total_minutes,
                "tasks": tasks
            }
    except Exception as e:
        logger.error(f"Study engine: failed to get plan: {e}")
        return {"tasks": []}
    finally:
        connection_pool.putconn(conn)


def mark_task_complete(task_id: int) -> bool:
    """Marks a single study plan task as completed."""
    if not connection_pool:
        return False
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE study_plan SET completed = TRUE WHERE id = %s RETURNING id;
            """, (task_id,))
            conn.commit()
            return cur.fetchone() is not None
    except Exception as e:
        logger.error(f"Study engine: failed to complete task: {e}")
        conn.rollback()
        return False
    finally:
        connection_pool.putconn(conn)
