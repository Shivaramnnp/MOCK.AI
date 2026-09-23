import json
import logging
from database import connection_pool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mockai_logger")

def seed_topics():
    if not connection_pool:
        logger.error("No database connection available.")
        return
        
    try:
        with open('topics_master.json', 'r') as f:
            data = json.load(f)
    except FileNotFoundError:
        logger.error("topics_master.json not found.")
        return
        
    conn = connection_pool.getconn()
    inserted = 0
    try:
        with conn.cursor() as cur:
            for exam, subjects in data.items():
                for subj in subjects:
                    subject = subj['subject']
                    topic = subj['topic']
                    for subtopic in subj['subtopics']:
                        for diff in subj['difficulties']:
                            cur.execute("""
                                INSERT INTO topic_coverage (exam, subject, topic, subtopic, difficulty, status)
                                VALUES (%s, %s, %s, %s, %s, 'pending')
                                ON CONFLICT (exam, subject, topic, subtopic, difficulty) DO NOTHING;
                            """, (exam, subject, topic, subtopic, diff))
                            if cur.rowcount > 0:
                                inserted += 1
            conn.commit()
            logger.info(f"Successfully seeded {inserted} new topics into coverage tracking.")
    except Exception as e:
        logger.error(f"Error seeding topics: {e}")
        conn.rollback()
    finally:
        connection_pool.putconn(conn)

if __name__ == "__main__":
    seed_topics()
