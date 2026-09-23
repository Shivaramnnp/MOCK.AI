import logging
from database import connection_pool

logger = logging.getLogger("mockai_logger")

import random

def get_difficulty_distribution():
    """Returns the current difficulty distribution."""
    if not connection_pool:
        return {"Easy": 0, "Medium": 0, "Hard": 0}
        
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT difficulty, COUNT(*) FROM questions GROUP BY difficulty;")
            rows = cur.fetchall()
            dist = {"Easy": 0, "Medium": 0, "Hard": 0}
            for diff, count in rows:
                if diff in dist:
                    dist[diff] = count
            return dist
    except Exception as e:
        logger.error(f"Failed to get difficulty distribution: {e}")
        return {"Easy": 0, "Medium": 0, "Hard": 0}
    finally:
        connection_pool.putconn(conn)

def determine_target_difficulty():
    """Determines the next difficulty based on 30/50/20 target distribution."""
    dist = get_difficulty_distribution()
    total = sum(dist.values())
    if total == 0:
        return random.choices(["Easy", "Medium", "Hard"], weights=[0.3, 0.5, 0.2])[0]
        
    ratios = {k: v / total for k, v in dist.items()}
    
    # Target ratios
    targets = {"Easy": 0.3, "Medium": 0.5, "Hard": 0.2}
    
    # Find the one most behind its target
    diff_gaps = {k: targets[k] - ratios[k] for k in targets}
    best_diff = max(diff_gaps, key=diff_gaps.get)
    return best_diff

def get_next_topic(exam_name: str = None, subject_name: str = None):
    """
    Intelligent Topic Selection:
    1) Least covered topic
    2) Balances distribution (randomized among the top 5 least covered to avoid repetition)
    3) Returns chosen topic with computed difficulty
    """
    if not connection_pool:
        logger.error("No DB connection pool in coverage_tracker.")
        return None
        
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            # We select the top 5 least covered topics, ordered by questions_generated ASC
            # to allow some randomization and avoid repeating the exact same topic back-to-back.
            if exam_name and subject_name:
                cur.execute("""
                    SELECT id, exam, subject, topic, subtopic
                    FROM topic_coverage 
                    WHERE exam = %s AND subject = %s
                    ORDER BY questions_generated ASC, last_generated_at ASC NULLS FIRST
                    LIMIT 5;
                """, (exam_name, subject_name))
            elif exam_name:
                cur.execute("""
                    SELECT id, exam, subject, topic, subtopic
                    FROM topic_coverage 
                    WHERE exam = %s
                    ORDER BY questions_generated ASC, last_generated_at ASC NULLS FIRST
                    LIMIT 5;
                """, (exam_name,))
            else:
                cur.execute("""
                    SELECT id, exam, subject, topic, subtopic
                    FROM topic_coverage 
                    ORDER BY questions_generated ASC, last_generated_at ASC NULLS FIRST
                    LIMIT 5;
                """)
            rows = cur.fetchall()
            if not rows:
                return None
                
            # Randomly pick from the top least covered topics to avoid repetition
            selected_row = random.choice(rows)
            
            target_difficulty = determine_target_difficulty()
            
            return {
                "id": selected_row[0],
                "exam": selected_row[1],
                "subject": selected_row[2],
                "topic": selected_row[3],
                "subtopic": selected_row[4],
                "difficulty": target_difficulty
            }
    finally:
        connection_pool.putconn(conn)

def update_coverage_status(coverage_id: int, generated_count: int, status: str = 'completed'):
    """Updates the status and count for a processed topic."""
    if not connection_pool:
        return
        
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE topic_coverage 
                SET status = %s, 
                    questions_generated = questions_generated + %s,
                    last_generated_at = CURRENT_TIMESTAMP
                WHERE id = %s;
            """, (status, generated_count, coverage_id))
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to update coverage status: {e}")
        conn.rollback()
    finally:
        connection_pool.putconn(conn)

def get_coverage_stats():
    """Returns coverage statistics."""
    if not connection_pool:
        return {"total_questions": 0, "topics_covered": 0}
        
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM questions;")
            total_questions = cur.fetchone()[0] or 0
            
            cur.execute("SELECT COUNT(*) FROM topic_coverage WHERE status = 'completed';")
            topics_covered = cur.fetchone()[0] or 0
            
            return {
                "total_questions": total_questions,
                "topics_covered": topics_covered
            }
    except Exception as e:
        logger.error(f"Failed to get coverage stats: {e}")
        return {"total_questions": 0, "topics_covered": 0}
    finally:
        connection_pool.putconn(conn)

def get_detailed_coverage_stats(exam_name: str, subject_name: str):
    """Returns detailed question generation counts per topic for a given exam and subject."""
    if not connection_pool:
        return {"exam": exam_name, "subject": subject_name, "topics": []}
        
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT topic, sum(questions_generated)
                FROM topic_coverage
                WHERE exam = %s AND subject = %s
                GROUP BY topic
                ORDER BY topic ASC;
            """, (exam_name, subject_name))
            rows = cur.fetchall()
            
            topics_data = []
            for r in rows:
                topics_data.append({
                    "topic": r[0],
                    "questions_generated": r[1]
                })
                
            return {
                "exam": exam_name,
                "subject": subject_name,
                "topics": topics_data
            }
    except Exception as e:
        logger.error(f"Failed to get detailed coverage stats: {e}")
        return {"exam": exam_name, "subject": subject_name, "topics": []}
    finally:
        connection_pool.putconn(conn)
