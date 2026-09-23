import asyncio
import requests
import json
from config import OLLAMA_URL, OLLAMA_MODEL, TIMEOUT_SECONDS, MAX_RETRIES, CONCURRENT_LIMIT
from templates import get_exam_template

_semaphore = None

def get_semaphore():
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(CONCURRENT_LIMIT)
    return _semaphore

def generate_prompt(request):
    """
    Step 4: Prompt Generator
    Generates a structured prompt based on the QuestionRequest and Exam Templates.
    """
    template = get_exam_template(request.exam)
    
    prompt = f"""Generate {request.count} multiple-choice questions for the following exam setup:

Exam Category: {request.exam}
Subject: {request.subject}
Topic: {request.topic}
Difficulty Level: {request.difficulty}

=== Exam Specific Rules ===
Difficulty Style: {template['difficulty_style']}
Wording Pattern: {template['wording_pattern']}
Marking Scheme (for context): {template['marking_scheme']}
Time Limit (for context): {template['time_limits']}

=== General Rules ===
- Do not repeat questions
- Follow the exact exam pattern and style specified above
- Provide exactly 4 options
- Provide the correct answer
- Provide a detailed explanation
- Return valid JSON strictly matching this format:
[
  {{
    "question": "Question text following the {request.exam} wording pattern",
    "options": ["A", "B", "C", "D"],
    "answer": "Correct option text",
    "explanation": "Detailed explanation incorporating the {request.exam} context"
  }}
]
"""
    return prompt

async def call_ollama_api(prompt: str) -> str:
    """
    Step 5: Call Ollama API
    Sends POST request to local Ollama instance with concurrency control.
    """
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False
    }
    
    # Step 6: Wrap model call inside semaphore
    async with get_semaphore():
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                # Run the synchronous requests.post in a thread pool so it doesn't block the async event loop
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
                if attempt == MAX_RETRIES:
                    raise TimeoutError("Model timeout")
            except requests.exceptions.ConnectionError:
                if attempt == MAX_RETRIES:
                    raise ConnectionError("Connection failure")
            except Exception as e:
                if attempt == MAX_RETRIES:
                    raise Exception(str(e))
        
        raise Exception("Model unavailable")
