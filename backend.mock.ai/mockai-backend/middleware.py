import time
import logging
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger("mockai_logger")

# ─────────────────────────────────────────────────────
# PHASE 1 — Global Error Handler Middleware
# ─────────────────────────────────────────────────────
class GlobalErrorMiddleware(BaseHTTPMiddleware):
    """
    Catches ALL unhandled exceptions and returns consistent JSON.
    Prevents raw stack traces from reaching the client.
    """
    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            logger.error(f"Unhandled error on {request.method} {request.url.path}: {e}", exc_info=True)
            return JSONResponse(
                status_code=500,
                content={"status": "error", "message": "Internal server error. Please try again later."}
            )


# ─────────────────────────────────────────────────────
# PHASE 3 — Rate Limiter Middleware
# ─────────────────────────────────────────────────────
class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Simple in-memory rate limiter.
    Limits requests per IP to MAX_REQUESTS_PER_MINUTE.
    LLM-heavy endpoints get a stricter limit.
    """
    MAX_REQUESTS_PER_MINUTE = 30  # General endpoints
    LLM_REQUESTS_PER_MINUTE = 10  # LLM-heavy endpoints

    LLM_PATHS = {"/generate-questions", "/generate-next-topic", "/adaptive-test"}

    def __init__(self, app):
        super().__init__(app)
        self._general_tracker = defaultdict(list)   # ip → [timestamps]
        self._llm_tracker = defaultdict(list)       # ip → [timestamps]

    def _clean_old_entries(self, tracker: dict, ip: str, window: int = 60):
        """Remove entries older than the window."""
        now = time.time()
        tracker[ip] = [t for t in tracker[ip] if now - t < window]

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path
        now = time.time()

        # Check LLM-specific rate limit
        if path in self.LLM_PATHS:
            self._clean_old_entries(self._llm_tracker, client_ip)
            if len(self._llm_tracker[client_ip]) >= self.LLM_REQUESTS_PER_MINUTE:
                logger.warning(f"LLM rate limit hit: {client_ip} on {path}")
                return JSONResponse(
                    status_code=429,
                    content={"status": "error", "message": "Rate limit exceeded for AI generation. Max 10 requests/minute."}
                )
            self._llm_tracker[client_ip].append(now)

        # Check general rate limit
        self._clean_old_entries(self._general_tracker, client_ip)
        if len(self._general_tracker[client_ip]) >= self.MAX_REQUESTS_PER_MINUTE:
            logger.warning(f"General rate limit hit: {client_ip} on {path}")
            return JSONResponse(
                status_code=429,
                content={"status": "error", "message": "Too many requests. Please slow down."}
            )
        self._general_tracker[client_ip].append(now)

        response = await call_next(request)
        return response


# ─────────────────────────────────────────────────────
# PHASE 4 — Request Logging Middleware
# ─────────────────────────────────────────────────────
class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Logs every request with:
    - method, path, status code
    - response time in ms
    - client IP
    """
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        client_ip = request.client.host if request.client else "unknown"
        
        response = await call_next(request)
        
        elapsed_ms = round((time.time() - start) * 1000, 1)
        status = response.status_code
        path = request.url.path
        method = request.method

        # Skip health check spam in logs
        if path != "/health":
            log_level = logging.WARNING if status >= 400 else logging.INFO
            logger.log(log_level, f"{method} {path} → {status} | {elapsed_ms}ms | IP: {client_ip}")

        return response
