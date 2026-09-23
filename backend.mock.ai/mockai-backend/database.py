import psycopg2
from psycopg2 import pool
import logging
import hashlib
import json

logger = logging.getLogger("mockai_logger")

DB_CONFIG = {
    "dbname": "mockai",
    "user": "postgres",
    "host": "localhost",
    "port": 5432
}

try:
    connection_pool = psycopg2.pool.ThreadedConnectionPool(1, 10, **DB_CONFIG)
    if connection_pool:
        logger.info("Connection pool created successfully")
except Exception as e:
    logger.error(f"Error creating connection pool: {e}")
    connection_pool = None

def init_db():
    if not connection_pool:
        logger.error("No connection pool available to init db.")
        return
    
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            # Create Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS questions (
                    id SERIAL PRIMARY KEY,
                    exam TEXT,
                    subject TEXT,
                    topic TEXT,
                    difficulty TEXT,
                    question TEXT,
                    options JSONB,
                    answer TEXT,
                    explanation TEXT,
                    question_hash TEXT UNIQUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            
            # Create Coverage Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS topic_coverage (
                    id SERIAL PRIMARY KEY,
                    exam TEXT,
                    subject TEXT,
                    topic TEXT,
                    subtopic TEXT,
                    difficulty TEXT,
                    questions_generated INT DEFAULT 0,
                    last_generated_at TIMESTAMP,
                    status TEXT DEFAULT 'pending',
                    UNIQUE(exam, subject, topic, subtopic, difficulty)
                );
            """)
            
            # Create User Performance Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS user_performance (
                    user_id TEXT,
                    exam TEXT,
                    subject TEXT,
                    topic TEXT,
                    total_attempts INT DEFAULT 0,
                    correct_answers INT DEFAULT 0,
                    accuracy FLOAT DEFAULT 0,
                    last_attempted TIMESTAMP,
                    PRIMARY KEY (user_id, exam, subject, topic)
                );
            """)
            
            # Create Test History Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS test_history (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT,
                    exam TEXT,
                    subject TEXT,
                    score INT,
                    total_questions INT,
                    accuracy FLOAT,
                    difficulty TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            
            # Create Study Plan Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS study_plan (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT,
                    exam TEXT,
                    subject TEXT,
                    topic TEXT,
                    task_type TEXT,
                    difficulty TEXT,
                    estimated_minutes INT,
                    completed BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            
            # Create Revision Queue Table (Spaced Repetition)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS revision_queue (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT,
                    exam TEXT,
                    subject TEXT,
                    topic TEXT,
                    next_revision_at TIMESTAMP,
                    interval_days INT DEFAULT 1,
                    ease_factor FLOAT DEFAULT 2.5,
                    last_result TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, exam, subject, topic)
                );
            """)
            
            # Create Mock Exam Sessions Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS mock_exam_sessions (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT,
                    exam TEXT,
                    mode TEXT,
                    total_questions INT,
                    duration_minutes INT,
                    questions JSONB,
                    started_at TIMESTAMP,
                    submitted_at TIMESTAMP,
                    score INT,
                    accuracy FLOAT,
                    status TEXT DEFAULT 'active'
                );
            """)
            
            # Create Indexes
            indexes = [
                "CREATE INDEX IF NOT EXISTS idx_exam ON questions(exam);",
                "CREATE INDEX IF NOT EXISTS idx_subject ON questions(subject);",
                "CREATE INDEX IF NOT EXISTS idx_topic ON questions(topic);",
                "CREATE INDEX IF NOT EXISTS idx_difficulty ON questions(difficulty);",
                "CREATE INDEX IF NOT EXISTS idx_hash ON questions(question_hash);",
                "CREATE INDEX IF NOT EXISTS idx_coverage_status ON topic_coverage(status);",
                "CREATE INDEX IF NOT EXISTS idx_user_perf ON user_performance(user_id, exam, subject);",
                "CREATE INDEX IF NOT EXISTS idx_test_history_user ON test_history(user_id);",
                "CREATE INDEX IF NOT EXISTS idx_study_plan_user ON study_plan(user_id, exam);",
                "CREATE INDEX IF NOT EXISTS idx_revision_due ON revision_queue(user_id, next_revision_at);",
                "CREATE INDEX IF NOT EXISTS idx_mock_sessions ON mock_exam_sessions(user_id, status);"
            ]
            for idx in indexes:
                cur.execute(idx)
                
            conn.commit()
            logger.info("Database initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        conn.rollback()
    finally:
        connection_pool.putconn(conn)
        
    try:
        from seed_topics import seed_topics
        seed_topics()
    except ImportError:
        pass

def save_questions_batch(exam: str, subject: str, topic: str, difficulty: str, questions: list):
    if not connection_pool:
        logger.error("No connection pool available to save questions.")
        return 0
        
    conn = connection_pool.getconn()
    inserted_count = 0
    try:
        with conn.cursor() as cur:
            for q in questions:
                # Type check in case of unexpected schema
                if not isinstance(q, dict):
                    continue
                    
                question_text = q.get("question", "")
                options = q.get("options", [])
                answer = q.get("correct_answer", q.get("answer", ""))
                explanation = q.get("explanation", "")
                
                if not question_text:
                    continue
                    
                # Generate SHA256 hash for deduplication
                q_hash = hashlib.sha256(question_text.encode('utf-8')).hexdigest()
                
                # Insert with conflict resolution
                cur.execute("""
                    INSERT INTO questions (exam, subject, topic, difficulty, question, options, answer, explanation, question_hash)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (question_hash) DO NOTHING
                    RETURNING id;
                """, (
                    exam, subject, topic, difficulty, 
                    question_text, json.dumps(options), answer, explanation, q_hash
                ))
                
                if cur.fetchone() is not None:
                    inserted_count += 1
            
            conn.commit()
            logger.info(f"Successfully inserted {inserted_count} new questions.")
            return inserted_count
    except Exception as e:
        logger.error(f"Failed to save questions batch: {e}")
        conn.rollback()
        return 0
    finally:
        connection_pool.putconn(conn)

def get_next_pending_topic(exam_name: str = None):
    """Selects the next pending topic for generation."""
    if not connection_pool:
        return None
    conn = connection_pool.getconn()
    try:
        with conn.cursor() as cur:
            if exam_name:
                cur.execute("""
                    SELECT id, exam, subject, topic, subtopic, difficulty 
                    FROM topic_coverage 
                    WHERE status = 'pending' AND exam = %s
                    ORDER BY id ASC LIMIT 1;
                """, (exam_name,))
            else:
                cur.execute("""
                    SELECT id, exam, subject, topic, subtopic, difficulty 
                    FROM topic_coverage 
                    WHERE status = 'pending'
                    ORDER BY id ASC LIMIT 1;
                """)
            row = cur.fetchone()
            if row:
                return {
                    "id": row[0],
                    "exam": row[1],
                    "subject": row[2],
                    "topic": row[3],
                    "subtopic": row[4],
                    "difficulty": row[5]
                }
            return None
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
