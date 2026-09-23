import argparse
import json
import logging
import shutil
import time
from pathlib import Path
from typing import List

from tqdm import tqdm

from .config import EngineConfig, PostgresConfig
from .exporter import Exporter
from .generator import QuestionGenerator
from .schema import QuestionRecord
from .storage import PostgresStorage


def setup_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )


def split_json_if_large(path: str, chunk_size: int = 10000, threshold_bytes: int = 1_000_000_000) -> List[str]:
    out_files: List[str] = []
    p = Path(path)
    if not p.exists() or p.stat().st_size <= threshold_bytes:
        return out_files
    rows = json.loads(p.read_text(encoding="utf-8"))
    for i in range(0, len(rows), chunk_size):
        idx = (i // chunk_size) + 1
        op = Path(f"dataset_part_{idx:03d}.json")
        op.write_text(json.dumps(rows[i : i + chunk_size], ensure_ascii=False, indent=2), encoding="utf-8")
        out_files.append(str(op))
    return out_files


def run_pipeline(
    target_count: int,
    batch_size: int,
    write_db: bool,
    export_json_path: str,
    export_csv_path: str,
    export_sql_path: str,
    log_level: str = "INFO",
    db_cfg: PostgresConfig = PostgresConfig(),
    engine_cfg: EngineConfig = EngineConfig(),
) -> None:
    setup_logging(log_level)
    logger = logging.getLogger("mock_ai.pipeline")

    cfg = EngineConfig(
        year=engine_cfg.year,
        country=engine_cfg.country,
        default_source=engine_cfg.default_source,
        batch_size=batch_size,
        max_retries_per_question=engine_cfg.max_retries_per_question,
        target_count=target_count,
        language_mix_english=engine_cfg.language_mix_english,
        in_memory_hash_cache_limit=engine_cfg.in_memory_hash_cache_limit,
        seed=engine_cfg.seed,
    )

    storage = PostgresStorage(db_cfg)
    existing_hashes = set()
    if write_db:
        logger.info("Connecting to PostgreSQL...")
        storage.connect()
        existing_hashes = storage.fetch_existing_hashes()
        logger.info("Loaded %d existing hashes for dedupe.", len(existing_hashes))

    generator = QuestionGenerator(cfg=cfg, external_hashes=existing_hashes)
    all_records: List[QuestionRecord] = []
    total_duplicates = 0
    total_failures = 0
    total_attempts = 0
    total_errors = 0

    started = time.perf_counter()
    batch_idx = 0
    pbar = tqdm(total=target_count, desc="Generating Questions", unit="q")
    while len(all_records) < target_count:
        batch_idx += 1
        needed = min(batch_size, target_count - len(all_records))
        t0 = time.perf_counter()
        records, metrics = generator.generate_batch(batch_size=needed)
        t1 = time.perf_counter()

        total_duplicates += metrics["duplicates"]
        total_failures += metrics["validation_failures"]
        total_attempts += metrics["generated_attempts"]
        total_errors += metrics["validation_failures"]

        if write_db:
            storage.insert_batch(records)
        all_records.extend(records)
        pbar.update(len(records))

        elapsed = max(0.001, time.perf_counter() - started)
        qps = len(all_records) / elapsed
        disk = shutil.disk_usage(".")
        free_pct = (disk.free / disk.total) * 100
        try:
            import psutil  # type: ignore

            mem_pct = psutil.virtual_memory().percent
            cpu_pct = psutil.cpu_percent(interval=0.0)
        except Exception:
            mem_pct = -1.0
            cpu_pct = -1.0

        logger.info(
            "batch=%d generated=%d needed=%d attempts=%d duplicates=%d validation_failures=%d elapsed=%.2fs qps=%.2f cpu=%.2f%% mem=%.2f%% disk_free=%.2f%%",
            batch_idx,
            len(records),
            needed,
            metrics["generated_attempts"],
            metrics["duplicates"],
            metrics["validation_failures"],
            t1 - t0,
            qps,
            cpu_pct,
            mem_pct,
            free_pct,
        )

        if mem_pct > 80:
            logger.warning("Memory usage above 80%%. Pausing generation for safety.")
            time.sleep(5)
        if free_pct < 10:
            logger.error("Disk free space below 10%%. Stopping generation for safety.")
            break

    pbar.close()

    total_time = time.perf_counter() - started
    questions_per_second = len(all_records) / max(0.001, total_time)
    logger.info(
        "completed total=%d attempts=%d duplicates=%d validation_failures=%d total_time=%.2fs qps=%.2f",
        len(all_records),
        total_attempts,
        total_duplicates,
        total_failures,
        total_time,
        questions_per_second,
    )

    if export_json_path:
        Exporter.export_json(all_records, export_json_path)
        split_json_if_large(export_json_path, chunk_size=10000, threshold_bytes=1_000_000_000)
    if export_csv_path:
        Exporter.export_csv(all_records, export_csv_path)
    if export_sql_path:
        Exporter.export_sql(all_records, export_sql_path)

    summary_path = Path("generation_summary.json")
    summary_path.write_text(
        json.dumps(
            {
                "total_generated": len(all_records),
                "total_valid": len(all_records),
                "total_duplicates": total_duplicates,
                "total_errors": total_errors,
                "attempts": total_attempts,
                "generation_time_seconds": total_time,
                "questions_per_second": questions_per_second,
                "batches": batch_idx,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    if write_db:
        storage.close()


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Mock.AI Production Question Generation Engine")
    p.add_argument("--target-count", type=int, default=10000, help="Total questions to generate.")
    p.add_argument("--batch-size", type=int, default=10000, help="Batch size per generation cycle.")
    p.add_argument("--write-db", action="store_true", help="Write generated records to PostgreSQL.")
    p.add_argument("--db-host", type=str, default="localhost")
    p.add_argument("--db-port", type=int, default=5432)
    p.add_argument("--db-name", type=str, default="mock_ai")
    p.add_argument("--db-user", type=str, default="postgres")
    p.add_argument("--db-password", type=str, default="postgres")
    p.add_argument("--json-out", type=str, default="mock_ai_questions.json")
    p.add_argument("--csv-out", type=str, default="mock_ai_questions.csv")
    p.add_argument("--sql-out", type=str, default="mock_ai_questions.sql")
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--log-level", type=str, default="INFO")
    return p


def main() -> None:
    args = build_arg_parser().parse_args()
    db_cfg = PostgresConfig(
        host=args.db_host,
        port=args.db_port,
        dbname=args.db_name,
        user=args.db_user,
        password=args.db_password,
    )
    eng_cfg = EngineConfig(seed=args.seed)
    run_pipeline(
        target_count=args.target_count,
        batch_size=args.batch_size,
        write_db=args.write_db,
        export_json_path=args.json_out,
        export_csv_path=args.csv_out,
        export_sql_path=args.sql_out,
        log_level=args.log_level,
        db_cfg=db_cfg,
        engine_cfg=eng_cfg,
    )


if __name__ == "__main__":
    main()
