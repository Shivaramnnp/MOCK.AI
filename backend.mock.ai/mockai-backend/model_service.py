import asyncio
import requests
import logging
from config import OLLAMA_URL, OLLAMA_MODEL, TIMEOUT_SECONDS, MAX_RETRIES, CONCURRENT_LIMIT

logger = logging.getLogger("mockai_logger")

_semaphore = None

def get_semaphore():
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(CONCURRENT_LIMIT)
    return _semaphore

async def call_ollama_api(prompt: str) -> str:
    """
    Handles Ollama calls with:
    - Timeout (30s)
    - Retry (2 attempts)
    - Concurrency limit (2)
    - Error-safe responses
    """
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False
    }
    
    async with get_semaphore():
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                # Run the synchronous requests.post in a thread pool
                response = await asyncio.to_thread(
                    requests.post,
                    OLLAMA_URL,
                    json=payload,
                    timeout=TIMEOUT_SECONDS
                )
                response.raise_for_status()
                data = response.json()
                return data.get("response", "")
            except requests.exceptions.Timeout:
                logger.warning(f"Ollama call timeout. Attempt {attempt} of {MAX_RETRIES}.")
                if attempt == MAX_RETRIES:
                    raise TimeoutError("Model timeout")
            except requests.exceptions.ConnectionError:
                logger.warning(f"Ollama connection error. Attempt {attempt} of {MAX_RETRIES}.")
                if attempt == MAX_RETRIES:
                    raise ConnectionError("Connection failure")
            except Exception as e:
                logger.error(f"Ollama call failed: {e}. Attempt {attempt} of {MAX_RETRIES}.")
                if attempt == MAX_RETRIES:
                    raise Exception(str(e))
        
        raise Exception("Model unavailable")
