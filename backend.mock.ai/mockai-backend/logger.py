import logging
import os
from datetime import datetime
from logging.handlers import RotatingFileHandler

# Ensure logs directory exists
os.makedirs("logs", exist_ok=True)

logger = logging.getLogger("mockai_logger")
logger.setLevel(logging.INFO)

formatter = logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Rotating file handler: 10MB max, keep 5 backups
file_handler = RotatingFileHandler(
    "logs/app.log",
    maxBytes=10 * 1024 * 1024,  # 10 MB
    backupCount=5
)
file_handler.setFormatter(formatter)

# Separate error log for critical issues
error_handler = RotatingFileHandler(
    "logs/error.log",
    maxBytes=5 * 1024 * 1024,  # 5 MB
    backupCount=3
)
error_handler.setLevel(logging.ERROR)
error_handler.setFormatter(formatter)

# Console handler
stream_handler = logging.StreamHandler()
stream_handler.setFormatter(formatter)

if not logger.handlers:
    logger.addHandler(file_handler)
    logger.addHandler(error_handler)
    logger.addHandler(stream_handler)

def log_request(exam: str, subject: str, topic: str, difficulty: str, request_time: datetime, response_time: datetime, db_status: str, errors: str = None):
    duration = (response_time - request_time).total_seconds()
    log_data = {
        "timestamp": datetime.now().isoformat(),
        "exam": exam,
        "subject": subject,
        "topic": topic,
        "difficulty": difficulty,
        "request_time": request_time.isoformat(),
        "response_time": response_time.isoformat(),
        "duration_seconds": duration,
        "db_insert_status": db_status,
        "errors": errors
    }
    if errors:
        logger.error(f"Request failed: {log_data}")
    else:
        logger.info(f"Request successful: {log_data}")

