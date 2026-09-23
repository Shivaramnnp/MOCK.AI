import os

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi3")
TIMEOUT_SECONDS = int(os.getenv("TIMEOUT_SECONDS", "30"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "2"))
CONCURRENT_LIMIT = int(os.getenv("CONCURRENT_LIMIT", "2"))
