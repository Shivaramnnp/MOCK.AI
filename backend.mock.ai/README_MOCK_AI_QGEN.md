# Mock.AI Production Question Generation Engine

This system generates large-scale competitive exam questions for India with:

- Template engine and parameterized generation
- Difficulty-aware question construction (Easy/Medium/Hard)
- SHA-256 deduplication
- Validation engine (schema, answer, JSON)
- PostgreSQL write path with dedupe key (`question_hash`)
- Batch generation (default `10,000`)
- Export to JSON, CSV, SQL
- Logging and summary metrics

## 1) Install

```bash
pip install -r requirements.txt
```

## 2) Run local generation (no DB write)

```bash
python run_generator.py --target-count 10000 --batch-size 10000 --json-out q.json --csv-out q.csv --sql-out q.sql
```

## 3) Run with PostgreSQL write

```bash
python run_generator.py \
  --target-count 100000 \
  --batch-size 10000 \
  --write-db \
  --db-host localhost \
  --db-port 5432 \
  --db-name mock_ai \
  --db-user postgres \
  --db-password postgres
```

## 4) Scale to 1 crore - 10 crore

Use horizontal execution with deterministic shards:

- Run multiple workers with different `--seed` values.
- Assign each worker a target slice (e.g., 10 lakh each).
- Keep PostgreSQL unique index on `question_hash` for global dedupe.
- Partition `questions` table by month/year or hash prefix for performance.
- Export each shard separately (`q_shard_01.json`, etc.) and merge downstream.

## 5) Database Schema

The engine auto-creates:

```sql
CREATE TABLE IF NOT EXISTS questions (
    id BIGSERIAL PRIMARY KEY,
    exam_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_answer TEXT NOT NULL,
    explanation TEXT NOT NULL,
    language TEXT NOT NULL,
    question_hash VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
```

## 6) Notes

- The generated JSON record includes full Mock.AI schema fields.
- Validation rejects malformed or inconsistent records before persistence.
- `generation_summary.json` contains runtime stats (time, duplicates, failures, attempts).
