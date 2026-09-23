import logging
from database import connection_pool

logger = logging.getLogger("mockai_logger")

# ─────────────────────────────────────────────────────
# Classification thresholds
# ─────────────────────────────────────────────────────
MIN_ATTEMPTS_FOR_CLASSIFICATION = 3

def _classify_accuracy(accuracy: float, total_attempts: int) -> str:
    """Classifies a topic's strength level based on accuracy and attempt count."""
    if total_attempts < MIN_ATTEMPTS_FOR_CLASSIFICATION:
        return "INSUFFICIENT_DATA"
    if accuracy < 50.0:
        return "VERY_WEAK"
    elif accuracy < 70.0:
        return "WEAK"
    elif accuracy < 85.0:
        return "GOOD"
    else:
        return "STRONG"


# ─────────────────────────────────────────────────────
# PHASE 1 & 2 & 3 — Topic performance + heatmap
# ─────────────────────────────────────────────────────
def get_topic_heatmap(user_id: str, exam: str, subject: str):
    """
    Returns per-topic performance data with strength classification.
    This is the heatmap data the frontend renders.
    """
    if not connection_pool:
        return []

    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT topic, total_attempts, correct_answers, accuracy
                FROM user_performance
                WHERE user_id = %s AND exam = %s AND subject = %s
                ORDER BY accuracy ASC;
            """, (user_id, exam, subject))
            rows = cur.fetchall()

            heatmap = []
            for r in rows:
                topic = r[0]
                total_attempts = r[1]
                correct = r[2]
                accuracy = round(r[3], 2) if r[3] else 0.0
                level = _classify_accuracy(accuracy, total_attempts)

                heatmap.append({
                    "topic": topic,
                    "total_attempts": total_attempts,
                    "correct_answers": correct,
                    "accuracy": accuracy,
                    "level": level
                })

            return heatmap
    except Exception as e:
        logger.error(f"Analytics: failed to get heatmap: {e}")
        return []
    finally:
        connection_pool.putconn(conn)


# ─────────────────────────────────────────────────────
# PHASE 4 — Accuracy trend (last N tests)
# ─────────────────────────────────────────────────────
def get_accuracy_trend(user_id: str, limit: int = 10):
    """
    Returns the user's last N test scores in chronological order
    plus the computed trend direction.
    """
    if not connection_pool:
        return {"scores": [], "trend": "No data"}

    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT accuracy, exam, subject, created_at
                FROM test_history
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT %s;
            """, (user_id, limit))
            rows = cur.fetchall()

            if not rows:
                return {"scores": [], "trend": "No data"}

            # Reverse to chronological order (oldest → newest)
            rows = list(reversed(rows))

            scores = []
            for r in rows:
                scores.append({
                    "accuracy": round(r[0], 2),
                    "exam": r[1],
                    "subject": r[2],
                    "date": r[3].isoformat() if r[3] else None
                })

            # Calculate trend
            accuracies = [r[0] for r in rows]
            if len(accuracies) < 2:
                trend = "Not enough data"
            else:
                first_half = sum(accuracies[:len(accuracies)//2]) / (len(accuracies)//2)
                second_half = sum(accuracies[len(accuracies)//2:]) / (len(accuracies) - len(accuracies)//2)
                diff = second_half - first_half

                if diff > 5.0:
                    trend = "Improving"
                elif diff < -5.0:
                    trend = "Declining"
                else:
                    trend = "Stable"

            # Week-over-week improvement (if enough data)
            week_improvement = None
            if len(accuracies) >= 4:
                recent_avg = sum(accuracies[-3:]) / 3
                older_avg = sum(accuracies[:3]) / 3
                week_improvement = round(recent_avg - older_avg, 2)

            return {
                "scores": scores,
                "trend": trend,
                "week_improvement": week_improvement
            }
    except Exception as e:
        logger.error(f"Analytics: failed to get accuracy trend: {e}")
        return {"scores": [], "trend": "Error"}
    finally:
        connection_pool.putconn(conn)


# ─────────────────────────────────────────────────────
# PHASE 5 — Subject-level summary
# ─────────────────────────────────────────────────────
def get_subject_summary(user_id: str):
    """
    Returns average accuracy per subject, plus the strongest and weakest subjects.
    """
    if not connection_pool:
        return {"subjects": [], "strongest": None, "weakest": None}

    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT subject,
                       AVG(accuracy) as avg_accuracy,
                       SUM(total_attempts) as total_attempts,
                       SUM(correct_answers) as total_correct
                FROM user_performance
                WHERE user_id = %s
                GROUP BY subject
                ORDER BY avg_accuracy ASC;
            """, (user_id,))
            rows = cur.fetchall()

            if not rows:
                return {"subjects": [], "strongest": None, "weakest": None}

            subjects = []
            for r in rows:
                avg_acc = round(float(r[1]), 2) if r[1] else 0.0
                subjects.append({
                    "subject": r[0],
                    "avg_accuracy": avg_acc,
                    "total_attempts": r[2],
                    "total_correct": r[3],
                    "level": _classify_accuracy(avg_acc, r[2] or 0)
                })

            weakest = subjects[0]["subject"] if subjects else None
            strongest = subjects[-1]["subject"] if subjects else None

            return {
                "subjects": subjects,
                "strongest": strongest,
                "weakest": weakest
            }
    except Exception as e:
        logger.error(f"Analytics: failed to get subject summary: {e}")
        return {"subjects": [], "strongest": None, "weakest": None}
    finally:
        connection_pool.putconn(conn)


# ─────────────────────────────────────────────────────
# PHASE 7 — Smart insights generator
# ─────────────────────────────────────────────────────
def generate_insights(user_id: str, exam: str = None, subject: str = None):
    """
    Generates human-readable AI coaching insights based on all available data.
    """
    insights = []

    # Subject-level insights
    summary = get_subject_summary(user_id)
    if summary["weakest"]:
        insights.append(f"📉 Your weakest subject is {summary['weakest']}. Prioritize it in your next study session.")
    if summary["strongest"]:
        insights.append(f"💪 You're strongest in {summary['strongest']}. Keep revising to maintain your edge.")

    # Trend insights
    trend_data = get_accuracy_trend(user_id)
    if trend_data["trend"] == "Improving":
        insights.append("📈 Your accuracy is improving — great momentum! Keep going.")
    elif trend_data["trend"] == "Declining":
        insights.append("⚠️ Your accuracy has been declining recently. Consider revisiting fundamentals.")
    elif trend_data["trend"] == "Stable":
        insights.append("➡️ Your performance is stable. Try harder difficulty levels to push growth.")

    if trend_data.get("week_improvement") is not None:
        wi = trend_data["week_improvement"]
        if wi > 0:
            insights.append(f"🔥 Your accuracy improved by {wi}% compared to earlier tests.")
        elif wi < 0:
            insights.append(f"📉 Your accuracy dropped by {abs(wi)}% compared to earlier tests. Time to revise weak topics.")

    # Heatmap insights (if exam + subject provided)
    if exam and subject:
        heatmap = get_topic_heatmap(user_id, exam, subject)
        very_weak = [t for t in heatmap if t["level"] == "VERY_WEAK"]
        if very_weak:
            topic_names = ", ".join(t["topic"] for t in very_weak[:3])
            insights.append(f"🔴 Critical weak areas: {topic_names}. Focus here immediately.")

        strong = [t for t in heatmap if t["level"] == "STRONG"]
        if strong:
            insights.append(f"🟢 You've mastered {len(strong)} topic(s). Schedule periodic revision to retain them.")

    # Revision insights
    from revision_engine import get_due_revisions
    due = get_due_revisions(user_id, exam)
    if due:
        insights.append(f"🔁 You have {len(due)} topic(s) overdue for revision. Complete them today for best retention.")

    if not insights:
        insights.append("👋 Welcome! Start taking tests to unlock personalized insights.")

    return insights
