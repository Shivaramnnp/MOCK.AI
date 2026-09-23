import time
import logging
from threading import Lock

logger = logging.getLogger("mockai_logger")

# ─────────────────────────────────────────────────────
# In-memory TTL cache (Redis-ready design pattern)
# ─────────────────────────────────────────────────────
class TTLCache:
    """
    Thread-safe in-memory cache with per-key TTL.
    Drop-in replaceable with Redis when scaling.
    """
    def __init__(self, default_ttl: int = 300):
        self._store = {}       # key → (value, expire_time)
        self._lock = Lock()
        self._default_ttl = default_ttl  # seconds

    def get(self, key: str):
        """Returns cached value or None if expired/missing."""
        with self._lock:
            if key in self._store:
                value, expire_at = self._store[key]
                if time.time() < expire_at:
                    return value
                else:
                    del self._store[key]
            return None

    def set(self, key: str, value, ttl: int = None):
        """Sets a value with optional custom TTL."""
        with self._lock:
            expire_at = time.time() + (ttl or self._default_ttl)
            self._store[key] = (value, expire_at)

    def invalidate(self, key: str):
        """Removes a specific key."""
        with self._lock:
            self._store.pop(key, None)

    def invalidate_prefix(self, prefix: str):
        """Removes all keys starting with the given prefix."""
        with self._lock:
            keys_to_remove = [k for k in self._store if k.startswith(prefix)]
            for k in keys_to_remove:
                del self._store[k]

    def clear(self):
        """Wipes the entire cache."""
        with self._lock:
            self._store.clear()

    def stats(self):
        """Returns cache statistics."""
        with self._lock:
            now = time.time()
            total = len(self._store)
            active = sum(1 for _, (_, exp) in self._store.items() if exp > now)
            return {"total_keys": total, "active_keys": active, "expired_keys": total - active}


# ─────────────────────────────────────────────────────
# Global cache instance
# ─────────────────────────────────────────────────────
cache = TTLCache(default_ttl=300)  # 5-minute default


def cached(key: str, ttl: int = 300):
    """
    Decorator-style helper for caching function results.
    
    Usage:
        result = cached_get("analytics:user123:SSC")
        if result is not None:
            return result
        # ... compute ...
        cache.set("analytics:user123:SSC", result)
    """
    return cache.get(key)
