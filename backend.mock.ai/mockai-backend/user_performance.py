import logging
from database import connection_pool
from datetime import datetime

logger = logging.getLogger("mockai_logger")

def update_user_performance(user_id: str, exam: str, subject: str, topic: str, correct: int, total: int):
    """
    Updates the user's performance for a given topic.
    Adds correct and total counts, recalculates accuracy.
    """
    if not connection_pool:
        logger.error("No database connection available.")
        return
        
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            # Check if record exists
            cur.execute("""
                SELECT total_attempts, correct_answers 
                FROM user_performance 
                WHERE user_id = %s AND exam = %s AND subject = %s AND topic = %s;
            """, (user_id, exam, subject, topic))
            row = cur.fetchone()
            
            if row:
                new_total = row[0] + total
                new_correct = row[1] + correct
                new_accuracy = (new_correct / new_total * 100.0) if new_total > 0 else 0.0
                
                cur.execute("""
                    UPDATE user_performance 
                    SET total_attempts = %s,
                        correct_answers = %s,
                        accuracy = %s,
                        last_attempted = CURRENT_TIMESTAMP
                    WHERE user_id = %s AND exam = %s AND subject = %s AND topic = %s;
                """, (new_total, new_correct, new_accuracy, user_id, exam, subject, topic))
            else:
                accuracy = (correct / total * 100.0) if total > 0 else 0.0
                cur.execute("""
                    INSERT INTO user_performance (user_id, exam, subject, topic, total_attempts, correct_answers, accuracy, last_attempted)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP);
                """, (user_id, exam, subject, topic, total, correct, accuracy))
                
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to update user performance: {e}")
        conn.rollback()
    finally:
        connection_pool.putconn(conn)

def get_user_weak_topics(user_id: str, exam: str, subject: str):
    """
    Returns topics grouped by weakness.
    accuracy < 50% -> VERY WEAK
    accuracy 50-70 -> WEAK
    accuracy > 70 -> STRONG
    Returns a sorted list of weakest topics first.
    """
    if not connection_pool:
        return []
        
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT topic, accuracy, total_attempts 
                FROM user_performance
                WHERE user_id = %s AND exam = %s AND subject = %s
                ORDER BY accuracy ASC, last_attempted ASC;
            """, (user_id, exam, subject))
            rows = cur.fetchall()
            
            topics_data = []
            for r in rows:
                topic = r[0]
                acc = r[1]
                
                if acc < 50.0:
                    strength = "VERY WEAK"
                elif acc <= 70.0:
                    strength = "WEAK"
                else:
                    strength = "STRONG"
                    
                topics_data.append({
                    "topic": topic,
                    "accuracy": acc,
                    "strength": strength,
                    "total_attempts": r[2]
                })
            return topics_data
    except Exception as e:
        logger.error(f"Failed to get weak topics: {e}")
        return []
    finally:
        connection_pool.putconn(conn)

def get_user_stats(user_id: str):
    """
    Returns overall user stats across exams/subjects.
    """
    if not connection_pool:
        return {"overall_accuracy": 0, "weak_topics": [], "strong_topics": [], "recommended_next_topic": None}
        
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT topic, accuracy
                FROM user_performance
                WHERE user_id = %s
                ORDER BY accuracy ASC;
            """, (user_id,))
            rows = cur.fetchall()
            
            if not rows:
                return {"overall_accuracy": 0, "weak_topics": [], "strong_topics": [], "recommended_next_topic": None}
                
            total_acc = sum(r[1] for r in rows)
            overall = total_acc / len(rows)
            
            weak_topics = [r[0] for r in rows if r[1] <= 70.0]
            strong_topics = [r[0] for r in rows if r[1] > 70.0]
            
            rec = weak_topics[0] if weak_topics else (rows[0][0] if rows else None)
            
            return {
                "overall_accuracy": round(overall, 2),
                "weak_topics": weak_topics,
                "strong_topics": strong_topics,
                "recommended_next_topic": rec
            }
    except Exception as e:
        logger.error(f"Failed to get user stats: {e}")
        return {"overall_accuracy": 0, "weak_topics": [], "strong_topics": [], "recommended_next_topic": None}
    finally:
        connection_pool.putconn(conn)
