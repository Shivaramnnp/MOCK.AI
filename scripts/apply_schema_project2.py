#!/usr/bin/env python3
"""
MOCK.AI — Apply Schema to Supabase Project 2
=============================================
Run this after getting your DB password from:
  https://supabase.com/dashboard/project/nvvscqxsrechenyqcwli/settings/database

Usage:
  python3 scripts/apply_schema_project2.py YOUR_DB_PASSWORD

OR set via environment:
  export SUPABASE_CONTENT_DB_PASSWORD=your_password
  python3 scripts/apply_schema_project2.py

The DB password is the 'postgres' user password shown in Supabase:
  Project Settings → Database → Connection string → Password
"""

import os
import sys
import psycopg2
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
SCHEMA_FILE  = PROJECT_ROOT / "supabase" / "schema_content_project2.sql"

# Supabase Project 2 connection details
PROJECT_REF = "nvvscqxsrechenyqcwli"
DB_REGION   = "ap-south-1"  # confirmed from pooler connection test
POOLER_HOST = f"aws-0-{DB_REGION}.pooler.supabase.com"
POOLER_PORT = 6543
DIRECT_HOST = f"db.{PROJECT_REF}.supabase.co"
DIRECT_PORT = 5432
DB_NAME     = "postgres"
DB_USER     = "postgres"


def apply_schema(password: str) -> bool:
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
            print("  Applying schema (this takes ~5 seconds)...", end=" ", flush=True)
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
    password = None

    # Check command line arg
    if len(sys.argv) > 1:
        password = sys.argv[1]

    # Check environment variable
    if not password:
        password = os.environ.get("SUPABASE_CONTENT_DB_PASSWORD", "")

    if not password:
        print("=" * 70)
        print("MOCK.AI — Supabase Project 2 Schema Setup")
        print("=" * 70)
        print()
        print("STEP 1: Get your database password")
        print()
        print("  Open this URL in your browser:")
        print(f"  https://supabase.com/dashboard/project/{PROJECT_REF}/settings/database")
        print()
        print("  Look for 'Connection string' → copy the password")
        print("  (Or click 'Reset database password' to set a new one)")
        print()
        print("STEP 2: Run this script with the password:")
        print()
        print("  python3 scripts/apply_schema_project2.py YOUR_DB_PASSWORD")
        print()
        print("  OR:")
        print()
        print("  export SUPABASE_CONTENT_DB_PASSWORD=YOUR_DB_PASSWORD")
        print("  python3 scripts/apply_schema_project2.py")
        print()
        print("STEP 3: After schema is applied, run the full migration:")
        print()
        print("  python3 scripts/migrate_to_supabase_content.py --dry-run")
        print("  python3 scripts/migrate_to_supabase_content.py")
        print()
        print("─" * 70)
        print("ALTERNATIVE: Apply via Supabase SQL Editor (no password needed)")
        print()
        print("  1. Open: https://supabase.com/dashboard/project/nvvscqxsrechenyqcwli/sql/new")
        print("  2. Paste the contents of: supabase/schema_content_project2.sql")
        print("  3. Click Run")
        print("  4. Then run: python3 scripts/migrate_to_supabase_content.py")
        print("=" * 70)
        return

    if not SCHEMA_FILE.exists():
        print(f"ERROR: Schema file not found: {SCHEMA_FILE}")
        sys.exit(1)

    print("=" * 70)
    print("MOCK.AI — Applying Schema to Supabase Project 2")
    print("=" * 70)
    print(f"  Project: {PROJECT_REF}")
    print(f"  Schema:  {SCHEMA_FILE}")
    print()

    success = apply_schema(password)

    if success:
        print()
        print("=" * 70)
        print("✓ Schema applied successfully!")
        print()
        print("Next step — run the migration:")
        print()
        print("  python3 scripts/migrate_to_supabase_content.py --dry-run")
        print("  python3 scripts/migrate_to_supabase_content.py")
        print("=" * 70)
    else:
        print()
        print("=" * 70)
        print("✗ All connection attempts failed.")
        print()
        print("Try the Supabase SQL Editor instead:")
        print("  https://supabase.com/dashboard/project/nvvscqxsrechenyqcwli/sql/new")
        print()
        print("Paste the contents of: supabase/schema_content_project2.sql")
        print("=" * 70)
        sys.exit(1)


if __name__ == "__main__":
    main()
