import logging
from datetime import datetime, timedelta
from database import connection_pool

logger = logging.getLogger("mockai_logger")

# ─────────────────────────────────────────────────────
# SM-2 Constants
# ─────────────────────────────────────────────────────
MIN_EASE = 1.3
MAX_EASE = 2.5
DEFAULT_EASE = 2.5
DEFAULT_INTERVAL = 1  # days


def _clamp_ease(ease: float) -> float:
    """Keeps ease_factor within safe bounds."""
    return max(MIN_EASE, min(MAX_EASE, ease))


# ─────────────────────────────────────────────────────
# PHASE 2 — Add / update revision queue entries
# ─────────────────────────────────────────────────────
def add_to_revision_queue(user_id: str, exam: str, subject: str, topic: str):
    """
    Adds a topic to the revision queue if it doesn't already exist.
    Called when a user answers incorrectly or when a weak topic is detected.
    Uses ON CONFLICT to avoid duplicates.
    """
    if not connection_pool:
        return

    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            next_rev = datetime.now() + timedelta(days=DEFAULT_INTERVAL)
            cur.execute("""
                INSERT INTO revision_queue (user_id, exam, subject, topic, next_revision_at, interval_days, ease_factor, last_result)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'wrong')
                ON CONFLICT (user_id, exam, subject, topic) DO NOTHING;
            """, (user_id, exam, subject, topic, next_rev, DEFAULT_INTERVAL, DEFAULT_EASE))
            conn.commit()
    except Exception as e:
        logger.error(f"Revision engine: failed to add to queue: {e}")
        conn.rollback()
    finally:
        connection_pool.putconn(conn)


def bulk_add_weak_topics_to_revision(user_id: str, exam: str, subject: str, weak_topics: list):
    """
    Batch-inserts weak topics into the revision queue.
    Called after test submission to ensure all weak topics are tracked.
    """
    if not connection_pool or not weak_topics:
        return

    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            next_rev = datetime.now() + timedelta(days=DEFAULT_INTERVAL)
            for topic_name in weak_topics:
                cur.execute("""
                    INSERT INTO revision_queue (user_id, exam, subject, topic, next_revision_at, interval_days, ease_factor, last_result)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'wrong')
                    ON CONFLICT (user_id, exam, subject, topic) DO NOTHING;
                """, (user_id, exam, subject, topic_name, next_rev, DEFAULT_INTERVAL, DEFAULT_EASE))
            conn.commit()
    except Exception as e:
        logger.error(f"Revision engine: failed bulk add: {e}")
        conn.rollback()
    finally:
        connection_pool.putconn(conn)


# ─────────────────────────────────────────────────────
# PHASE 3 & 4 — SM-2 spaced repetition logic
# ─────────────────────────────────────────────────────
def update_revision(user_id: str, exam: str, subject: str, topic: str, result: str):
    """
    Applies the SM-2 algorithm to update a revision entry.

    If result == 'correct':
        interval_days = interval_days * ease_factor
        ease_factor += 0.1

    If result == 'wrong':
        interval_days = 1
        ease_factor -= 0.2

    next_revision_at = now + interval_days
    """
    if not connection_pool:
        return {"status": "error", "message": "No DB connection"}

    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            # Fetch current state
            cur.execute("""
                SELECT id, interval_days, ease_factor
                FROM revision_queue
                WHERE user_id = %s AND exam = %s AND subject = %s AND topic = %s;
            """, (user_id, exam, subject, topic))
            row = cur.fetchone()

            if not row:
                # Topic not in queue yet — create it
                if result == "correct":
                    interval = 3
                    ease = DEFAULT_EASE + 0.1
                else:
                    interval = DEFAULT_INTERVAL
                    ease = DEFAULT_EASE - 0.2

                ease = _clamp_ease(ease)
                next_rev = datetime.now() + timedelta(days=interval)

                cur.execute("""
                    INSERT INTO revision_queue (user_id, exam, subject, topic, next_revision_at, interval_days, ease_factor, last_result)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                """, (user_id, exam, subject, topic, next_rev, interval, ease, result))
                conn.commit()

                return {
                    "status": "created",
                    "topic": topic,
                    "next_revision_at": next_rev.isoformat(),
                    "interval_days": interval,
                    "ease_factor": round(ease, 2)
                }

            rev_id, current_interval, current_ease = row

            if result == "correct":
                new_interval = max(1, int(current_interval * current_ease))
                new_ease = _clamp_ease(current_ease + 0.1)
            else:  # wrong
                new_interval = DEFAULT_INTERVAL
                new_ease = _clamp_ease(current_ease - 0.2)

            next_rev = datetime.now() + timedelta(days=new_interval)

            cur.execute("""
                UPDATE revision_queue
                SET interval_days = %s,
                    ease_factor = %s,
                    next_revision_at = %s,
                    last_result = %s
                WHERE id = %s;
            """, (new_interval, new_ease, next_rev, result, rev_id))
            conn.commit()

            return {
                "status": "updated",
                "topic": topic,
                "next_revision_at": next_rev.isoformat(),
                "interval_days": new_interval,
                "ease_factor": round(new_ease, 2)
            }

    except Exception as e:
        logger.error(f"Revision engine: failed to update revision: {e}")
        conn.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        connection_pool.putconn(conn)


# ─────────────────────────────────────────────────────
# PHASE 5 — Get due revisions
# ─────────────────────────────────────────────────────
def get_due_revisions(user_id: str, exam: str = None):
    """
    Returns all topics where next_revision_at <= now.
    These are the topics the user MUST revise today.
    """
    if not connection_pool:
        return []

    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            if exam:
                cur.execute("""
                    SELECT id, exam, subject, topic, next_revision_at, interval_days, ease_factor, last_result
                    FROM revision_queue
                    WHERE user_id = %s AND exam = %s AND next_revision_at <= NOW()
                    ORDER BY next_revision_at ASC;
                """, (user_id, exam))
            else:
                cur.execute("""
                    SELECT id, exam, subject, topic, next_revision_at, interval_days, ease_factor, last_result
                    FROM revision_queue
                    WHERE user_id = %s AND next_revision_at <= NOW()
                    ORDER BY next_revision_at ASC;
                """, (user_id,))

            rows = cur.fetchall()
            tasks = []
            for r in rows:
                tasks.append({
                    "id": r[0],
                    "exam": r[1],
                    "subject": r[2],
                    "topic": r[3],
                    "next_revision_at": r[4].isoformat() if r[4] else None,
                    "interval_days": r[5],
                    "ease_factor": round(r[6], 2),
                    "last_result": r[7]
                })
            return tasks
    except Exception as e:
        logger.error(f"Revision engine: failed to get due revisions: {e}")
        return []
    finally:
        connection_pool.putconn(conn)


def get_upcoming_revisions(user_id: str, days_ahead: int = 7):
    """
    Returns all revisions scheduled in the next N days (for dashboard/calendar view).
    """
    if not connection_pool:
        return []

    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cutoff = datetime.now() + timedelta(days=days_ahead)
            cur.execute("""
                SELECT id, exam, subject, topic, next_revision_at, interval_days, ease_factor, last_result
                FROM revision_queue
                WHERE user_id = %s AND next_revision_at <= %s
                ORDER BY next_revision_at ASC;
            """, (user_id, cutoff))

            rows = cur.fetchall()
            tasks = []
            for r in rows:
                overdue = r[4] <= datetime.now() if r[4] else False
                tasks.append({
                    "id": r[0],
                    "exam": r[1],
                    "subject": r[2],
                    "topic": r[3],
                    "next_revision_at": r[4].isoformat() if r[4] else None,
                    "interval_days": r[5],
                    "ease_factor": round(r[6], 2),
                    "last_result": r[7],
                    "overdue": overdue
                })
            return tasks
    except Exception as e:
        logger.error(f"Revision engine: failed to get upcoming revisions: {e}")
        return []
    finally:
        connection_pool.putconn(conn)


# ─────────────────────────────────────────────────────
# PHASE 2 — Auto-trigger: process test answers
# ─────────────────────────────────────────────────────
def process_test_for_revision(user_id: str, exam: str, subject: str, topic: str, answers: list):
    """
    Called after a test submission.
    For each wrong answer, adds the topic to revision queue.
    For each correct answer on a topic already in the queue, updates it positively.
    """
    wrong_count = 0
    correct_count = 0

    for a in answers:
        if a.selected_answer.strip().lower() == a.correct_answer.strip().lower():
            correct_count += 1
        else:
            wrong_count += 1

    accuracy = (correct_count / len(answers) * 100.0) if answers else 0.0

    if accuracy < 70.0:
        # Low accuracy → add/reset in revision queue
        add_to_revision_queue(user_id, exam, subject, topic)
        update_revision(user_id, exam, subject, topic, "wrong")
    else:
        # Good performance → push revision further out
        update_revision(user_id, exam, subject, topic, "correct")
