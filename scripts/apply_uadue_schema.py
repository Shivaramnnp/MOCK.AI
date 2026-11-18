#!/usr/bin/env python3
"""
MOCK.AI — Apply UADUE Schema Extensions to Supabase Project 2
"""

import os
import sys
import psycopg2
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
SCHEMA_FILE  = PROJECT_ROOT / "supabase" / "add_uadue_schema_support.sql"

PROJECT_REF = "nvvscqxsrechenyqcwli"
DB_REGION   = "ap-south-1"
POOLER_HOST = f"aws-0-{DB_REGION}.pooler.supabase.com"
POOLER_PORT = 6543
DIRECT_HOST = f"db.{PROJECT_REF}.supabase.co"
DIRECT_PORT = 5432
DB_NAME     = "postgres"
DB_USER     = "postgres"

def apply_uadue_schema(password: str) -> bool:
    schema_sql = SCHEMA_FILE.read_text(encoding="utf-8")

    configs = [
        {
            "name": "Supabase pooler (ap-south-1)",
            "host": POOLER_HOST,
            "port": POOLER_PORT,
            "user": f"{DB_USER}.{PROJECT_REF}",
            "password": password,
            "dbname": DB_NAME,
            "sslmode": "require",
            "connect_timeout": 15,
        },
        {
            "name": "Direct DB host",
            "host": DIRECT_HOST,
            "port": DIRECT_PORT,
            "user": DB_USER,
            "password": password,
            "dbname": DB_NAME,
            "sslmode": "require",
            "connect_timeout": 15,
        },
        {
            "name": "Pooler (standard port 5432)",
            "host": POOLER_HOST,
            "port": 5432,
            "user": f"{DB_USER}.{PROJECT_REF}",
            "password": password,
            "dbname": DB_NAME,
            "sslmode": "require",
            "connect_timeout": 15,
        },
    ]

    for cfg in configs:
        name = cfg.pop("name")
        print(f"  Trying: {name}...", end=" ", flush=True)
        try:
            conn = psycopg2.connect(**cfg)
            conn.autocommit = True
            cur = conn.cursor()
            cur.execute("SELECT current_database()")
            db = cur.fetchone()[0]
            print(f"✓ Connected (db={db})")
            print("  Applying UADUE schema extension...", end=" ", flush=True)
            cur.execute(schema_sql)
            print("✓ Done!")
            cur.close()
            conn.close()
            return True
        except psycopg2.OperationalError as e:
            print(f"✗ {str(e)[:60]}")
        except Exception as e:
            print(f"✗ Error: {str(e)[:80]}")

    return False

def main():
    if os.environ.get("ALLOW_SCHEMA_APPLY") != "true":
        print("=" * 70)
        print("BLOCKED: Direct schema execution via legacy script is prohibited.")
        print("To run in a confirmed test environment, set ALLOW_SCHEMA_APPLY=true.")
        print("=" * 70)
        sys.exit(1)

    PROD_CONTENT_REF = "nvvscqxsrechenyqcwli"
    if PROJECT_REF == PROD_CONTENT_REF and os.environ.get("CONFIRM_PRODUCTION_MUTATION") != "YES_I_AM_SURE":
        print("=" * 70)
        print(f"FATAL: Target project '{PROJECT_REF}' matches production! ABORTING.")
        print("Production mutation is blocked. Set CONFIRM_PRODUCTION_MUTATION='YES_I_AM_SURE' to override.")
        print("=" * 70)
        sys.exit(1)

    password = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SUPABASE_CONTENT_DB_PASSWORD", "")
    if not password:
        print("ERROR: Database password required via argument or SUPABASE_CONTENT_DB_PASSWORD.")
        sys.exit(1)

    print(f"Applying {SCHEMA_FILE.name} to {PROJECT_REF}...")
    success = apply_uadue_schema(password)
    if success:
        print("✓ UADUE schema extensions applied successfully!")
    else:
        print("✗ Failed to apply schema via direct/pooler connections.")
        sys.exit(1)

if __name__ == "__main__":
    main()
