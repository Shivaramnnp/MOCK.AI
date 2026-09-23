from dataclasses import dataclass
from typing import Optional

# Phase-safe defaults for first production run.
BATCH_SIZE = 10000
TOTAL_BATCHES = 100
EXPORT_FORMAT = "json"
ENABLE_DEDUPLICATION = True
ENABLE_VALIDATION = True
LOGGING = True


@dataclass(frozen=True)
class PostgresConfig:
    host: str = "localhost"
    port: int = 5432
    dbname: str = "mock_ai"
    user: str = "postgres"
    password: str = "postgres"
    connect_timeout: int = 10


@dataclass(frozen=True)
class EngineConfig:
    year: str = "2026"
    country: str = "India"
    default_source: str = "Mock.AI Production Generator"
    batch_size: int = 10000
    max_retries_per_question: int = 20
    target_count: int = 10000
    language_mix_english: float = 0.7
    in_memory_hash_cache_limit: int = 2_000_000
    seed: Optional[int] = None
