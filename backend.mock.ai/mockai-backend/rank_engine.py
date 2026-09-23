import logging
from database import connection_pool

logger = logging.getLogger("mockai_logger")

EXAM_CANDIDATE_ESTIMATES = {
    "SSC": 1000000,
    "UPSC": 1000000,
    "JEE": 1200000,
    "NEET": 2000000,
    "GATE": 800000,
    "DEFAULT": 500000
}

def save_test_result(user_id: str, exam: str, subject: str, score: int, total_questions: int, difficulty: str = None):
    """Saves the test result into the test_history table."""
    if not connection_pool:
        return
        
    accuracy = (score / total_questions * 100.0) if total_questions > 0 else 0.0
    
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO test_history (user_id, exam, subject, score, total_questions, accuracy, difficulty)
                VALUES (%s, %s, %s, %s, %s, %s, %s);
            """, (user_id, exam, subject, score, total_questions, accuracy, difficulty))
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to save test result: {e}")
        conn.rollback()
    finally:
        connection_pool.putconn(conn)

def get_percentile(user_id: str, exam: str) -> float:
    """Calculates percentile based on the user's latest moving average score compared to others."""
    if not connection_pool:
        return 0.0
        
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            # Get user's latest score average (last 3 tests to smooth noise)
            cur.execute("""
                SELECT AVG(accuracy) FROM (
                    SELECT accuracy FROM test_history 
                    WHERE user_id = %s AND exam = %s
                    ORDER BY created_at DESC LIMIT 3
                ) sub;
            """, (user_id, exam))
            user_avg_acc_row = cur.fetchone()
            
            if not user_avg_acc_row or user_avg_acc_row[0] is None:
                return 0.0
                
            user_avg_acc = float(user_avg_acc_row[0])
            
            # Now find how many users have an average accuracy below this user
            cur.execute("""
                WITH user_averages AS (
                    SELECT user_id, AVG(accuracy) as avg_acc
                    FROM (
                        SELECT user_id, accuracy,
                               ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY created_at DESC) as rn
                        FROM test_history
                        WHERE exam = %s
                    ) recent_tests
                    WHERE rn <= 3
                    GROUP BY user_id
                )
                SELECT 
                    (SELECT COUNT(*) FROM user_averages WHERE avg_acc < %s) as below_count,
                    (SELECT COUNT(*) FROM user_averages) as total_count;
            """, (exam, user_avg_acc))
            
            row = cur.fetchone()
            if not row or row[1] == 0:
                return 0.0
                
            below_count, total_count = row
            
            # Prevent division by zero, though total_count should be at least 1 (the user themselves)
            if total_count <= 1:
                # If they are the only user, default to their accuracy as a proxy for percentile
                return round(user_avg_acc, 2)
                
            percentile = (below_count / total_count) * 100.0
            return round(percentile, 2)
            
    except Exception as e:
        logger.error(f"Failed to calculate percentile: {e}")
        return 0.0
    finally:
        connection_pool.putconn(conn)

def estimate_rank(percentile: float, exam: str) -> int:
    """Estimates rank based on percentile and exam total candidates."""
    total_candidates = EXAM_CANDIDATE_ESTIMATES.get(exam.upper(), EXAM_CANDIDATE_ESTIMATES["DEFAULT"])
    rank = int((1.0 - (percentile / 100.0)) * total_candidates)
    return max(1, rank)

def get_performance_trend(user_id: str, exam: str):
    """Calculates improvement trend based on the last 10 tests."""
    if not connection_pool:
        return "Stable"
        
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT accuracy FROM test_history
                WHERE user_id = %s AND exam = %s
                ORDER BY created_at DESC LIMIT 10;
            """, (user_id, exam))
            rows = cur.fetchall()
            
            if len(rows) < 2:
                return "Not enough data"
                
            accuracies = [r[0] for r in rows]
            accuracies.reverse() # chronologically oldest to newest
            
            # Simple linear trend
            first_half = sum(accuracies[:len(accuracies)//2]) / (len(accuracies)//2)
            second_half = sum(accuracies[len(accuracies)//2:]) / (len(accuracies) - len(accuracies)//2)
            
            diff = second_half - first_half
            if diff > 5.0:
                return "Improving"
            elif diff < -5.0:
                return "Declining"
            else:
                return "Stable"
    except Exception as e:
        logger.error(f"Failed to get performance trend: {e}")
        return "Stable"
    finally:
        connection_pool.putconn(conn)

def get_readiness_level(accuracy: float) -> str:
    if accuracy < 40.0:
        return "Low"
    elif accuracy <= 70.0:
        return "Moderate"
    else:
        return "High"

def generate_rank_prediction(user_id: str, exam: str):
    """Aggregates all metrics into a single response."""
    percentile = get_percentile(user_id, exam)
    rank = estimate_rank(percentile, exam)
    trend = get_performance_trend(user_id, exam)
    
    # Get overall accuracy for readiness
    conn = connection_pool.getconn()
    accuracy = 0.0
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
                accuracy = round(float(row[0]), 2)
    except Exception as e:
        logger.error(f"Failed to get accuracy for readiness: {e}")
    finally:
        connection_pool.putconn(conn)
        
    readiness = get_readiness_level(accuracy)
    
    return {
        "percentile": percentile,
        "estimated_rank": rank,
        "accuracy": accuracy,
        "trend": trend,
        "readiness_level": readiness
    }
