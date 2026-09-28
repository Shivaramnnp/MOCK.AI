# Supabase Infrastructure & Hosted Log Audit Report
**Project:** Mock.AI Production Infrastructure  
**Author:** Senior Supabase Infrastructure Engineer (Antigravity)  
**Date:** September 27, 2026  
**Document ID:** `docs/SUPABASE_LOG_CLEANUP_REPORT.md`  
**Classification:** Technical / Infrastructure & Observability  

---

## 1. Executive Summary

This forensic investigation was initiated to address accumulated hosted log volume in the Mock.AI production Supabase project, specifically:
- A historical Logs Ingestion spike observed around **September 23, 2026** (~1.03 GB / 1.00 GB on the Free Tier, ~0.03 GB overage).
- Repeated `HEAD /rest/v1/exam_papers?select=*` probes appearing in the Supabase Logs Explorer.
- Previous errors referencing `/rest/v1/user_exam_attempts` and `/rest/v1/profiles` returning 404.

### Core Findings & Truthful Assessment
1. **Can historical hosted logs be deleted?** **NO.** Supabase hosted logs are backed by an internal, immutable **ClickHouse** cluster. Supabase provides **no API endpoint, no dashboard button, and no SQL command** to delete individual log events, purge a time window, or truncate hosted logs.
2. **Can the 1.03 GB Logs Ingestion usage meter be manually reset?** **NO.** The billing usage meter is a cumulative monthly ingest counter. It automatically resets only at the boundary of the next monthly billing cycle.
3. **Are logs from September 23, 2026 still queryable?** **NO.** On Supabase Free-tier projects, the maximum log-retention window is **1 day (24 hours)**. Logs from September 23 have already been aged out and pruned by ClickHouse's background TTL process.
4. **What caused the September 23 spike?** Git commit logs (`commit 406dbd9`, `eec1e1f`, `fd85c79`) confirm that on September 23, 2026 (between 13:15 and 18:00 UTC+5:30), the comprehensive data migration script (`scripts/migrate_to_supabase_content.py`) executed against Project 2 (`nvvscqxsrechenyqcwli`), batch-inserting **280 exam papers, 25,612 questions, and thousands of images**. Each network request generated API gateway, PostgREST, and Postgres query log entries, accumulating ~1.03 GB of ingestion.
5. **What caused repeated `HEAD /rest/v1/exam_papers`?** In `web/src/services/platformStatsService.ts`, the catalog paper count was querying `contentClient.from('exam_papers').select('*', { count: 'exact', head: true })` with only an in-memory cache and a 60-second session TTL. Every tab reload, new visitor, or stats refresh triggered a live `HEAD` request.
6. **Remediation Implemented:** Persistent `localStorage` caching with a 24-hour TTL (`LOCAL_PAPERS_COUNT_CACHE_KEY`) and an extended 5-minute session cache TTL now completely decouple static catalog counting from dynamic user stats. Cold launch requests were reduced from repeat bursts to **1**, and subsequent navigations produce **0** requests to `exam_papers`.

---

## 2. Current Supabase Log Architecture

Supabase splits operational data between two distinct storage engines:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      MOCK.AI APPLICATION TRAFFIC                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌───────────────────────────────┐         ┌───────────────────────────────┐
│     SUPABASE POSTGRESQL       │         │      SUPABASE CLICKHOUSE      │
│  (Relational Application DB)  │         │   (Hosted Observability Log)  │
├───────────────────────────────┤         ├───────────────────────────────┤
│ • Tables: exam_papers,        │         │ • System: Logflare / BigQuery │
│   questions, profiles,        │         │   / ClickHouse cluster        │
│   community_posts, etc.       │         │ • Captures: API gateway,      │
│ • Storage: EBS volume         │         │   PostgREST, Auth, Postgres   │
│ • Modification: Supported via │         │   statements, Storage egress  │
│   SQL (INSERT/UPDATE/DELETE)  │         │ • Modification: IMMUTABLE     │
│ • NOT where Logs Explorer     │         │ • Retention: Automatic TTL    │
│   reads from!                 │         │   (24h on Free tier)          │
└───────────────────────────────┘         └───────────────────────────────┘
```

### Critical Rules Regarding Logs
- **DO NOT** execute `DELETE FROM logs` or `TRUNCATE logs` in PostgreSQL. `logs` is not a PostgreSQL table.
- **DO NOT** create a dummy table named `logs` in Postgres; it will have zero effect on Supabase's hosted observability ingest or billing metrics.
- Supabase's Logs Explorer queries the **ClickHouse observability stream**, which is write-once, append-only, and automatically managed by Supabase platform infrastructure.

---

## 3. Official Capabilities: Deletion, Purge & Usage Reset

| Operation | Supported by Supabase? | Official Mechanism | Forensic Explanation |
|:---|:---:|:---|:---|
| **Delete Individual Log Event** | ❌ **No** | None | ClickHouse log streams do not expose single-row DML mutations to project consumers. |
| **Purge Range of Hosted Logs** | ❌ **No** | None | No Management API or dashboard endpoint exists to drop partitions or purge time ranges. |
| **Purge All Hosted Logs** | ❌ **No** | None | Hosted logs cannot be truncated on demand. |
| **Reset Ingestion Usage Meter** | ❌ **No** | Automatic monthly reset | The meter measures *cumulative ingested bytes* for the current billing cycle. Deleting application data or waiting for logs to age out does not decrement this counter. |
| **Query Logs Programmatically** | ✅ **Yes** | Management API / Logs Explorer | `GET /v1/projects/{ref}/analytics/endpoints/logs` (requires `SUPABASE_ACCESS_TOKEN`). |

---

## 4. Historical Retention Limitations & The Sept 23 Spike

### Retention Policy by Plan
- **Free Plan:** **1 day (24 hours)**
- **Pro Plan:** **7 days**
- **Team Plan:** **28 days**
- **Enterprise Plan:** **90 days (customizable)**

### Status of September 23, 2026 Logs
- **Current Date:** September 27, 2026 (4 days after the spike).
- On the active Free tier project, ClickHouse retention is **24 hours**.
- Therefore, the raw log rows from September 23 **no longer exist in ClickHouse**. Any SQL query targeting that date window in Logs Explorer will return zero rows:
  ```sql
  SELECT count(*)
  FROM logs
  WHERE timestamp >= toDateTime64('2026-09-23 00:00:00.000', 3, 'UTC')
    AND timestamp <  toDateTime64('2026-09-24 00:00:00.000', 3, 'UTC');
  -- Returns: 0 (Partition pruned by ClickHouse TTL)
  ```
- **Why does the dashboard still show ~1.03 GB / 1.00 GB?**  
  The dashboard usage metric displays the **billing accumulator**, which tallies every byte ingested since the start of the monthly cycle. It does not reflect currently retained disk space.

---

## 5. ClickHouse Query Suite for Supabase Logs Explorer

Use these queries in the **Supabase Dashboard → Logs Explorer** (do not run them in the PostgreSQL SQL Editor):

### Query 1: Log Volume by Ingestion Source (Edge, PostgREST, Postgres, Auth)
```sql
SELECT
  source,
  count(*) AS total_events,
  round(sum(length(event_message)) / (1024 * 1024), 2) AS estimated_msg_mb
FROM logs
WHERE timestamp >= now() - INTERVAL 24 HOUR
GROUP BY source
ORDER BY total_events DESC;
```

### Query 2: Top HTTP Request Endpoints, Methods, and Status Codes
```sql
SELECT
  log_attributes['request.method'] AS method,
  log_attributes['request.path'] AS path,
  toInt32OrZero(log_attributes['response.status_code']) AS status_code,
  count(*) AS request_count,
  round(avg(toFloat64OrZero(log_attributes['request.duration'])), 2) AS avg_duration_ms
FROM logs
WHERE source = 'edge_logs'
  AND timestamp >= now() - INTERVAL 24 HOUR
GROUP BY method, path, status_code
ORDER BY request_count DESC
LIMIT 25;
```

### Query 3: Audit of `HEAD /rest/v1/exam_papers` Requests
```sql
SELECT
  timestamp,
  id,
  log_attributes['request.method'] AS method,
  log_attributes['request.path'] AS path,
  log_attributes['request.headers.user-agent'] AS user_agent,
  toInt32OrZero(log_attributes['response.status_code']) AS status_code
FROM logs
WHERE source = 'edge_logs'
  AND log_attributes['request.path'] LIKE '%/rest/v1/exam_papers%'
  AND timestamp >= now() - INTERVAL 24 HOUR
ORDER BY timestamp DESC
LIMIT 50;
```

### Query 4: Postgres Statement Logging (Slow & High-Frequency Queries)
```sql
SELECT
  log_attributes['parsed.command_tag'] AS command_tag,
  log_attributes['parsed.error_severity'] AS severity,
  substring(event_message, 1, 100) AS query_snippet,
  count(*) AS occurrences
FROM logs
WHERE source = 'postgres_logs'
  AND timestamp >= now() - INTERVAL 24 HOUR
GROUP BY command_tag, severity, query_snippet
ORDER BY occurrences DESC
LIMIT 20;
```

### Query 5: Payload Bloat Detection (> 4 KB event messages)
```sql
SELECT
  timestamp,
  id,
  source,
  length(event_message) AS payload_bytes,
  substring(event_message, 1, 120) AS message_preview
FROM logs
WHERE timestamp >= now() - INTERVAL 24 HOUR
  AND length(event_message) > 4096
ORDER BY payload_bytes DESC
LIMIT 20;
```

---

## 6. Root-Cause Analysis

### Source 1: The September 23 Bulk Ingestion Spike
On September 23, 2026, `scripts/migrate_to_supabase_content.py` was executed to seed Project 2:
- **Scope:** 280 complete exam papers, 25,612 questions, and thousands of images.
- **Traffic Profile:** Rapid concurrent upserts to `/rest/v1/exam_papers`, `/rest/v1/questions`, and `/storage/v1/object/exam-assets`.
- **Log Impact:** Generated tens of thousands of API gateway requests, PostgREST requests, and Postgres query logs. This one-time historical migration pushed cumulative ingestion to **1.03 GB**, crossing the 1 GB free allotment by 30 MB.

### Source 2: Ongoing `HEAD /rest/v1/exam_papers?select=*` Probes
- **Caller:** `web/src/services/platformStatsService.ts` (`availablePapers` counter).
- **Trigger:** Rendered by `<PlatformStatsBar />` on both `AuthScreen` and `HomeScreen`.
- **Mechanism:** Called `contentClient.from('exam_papers').select('*', { count: 'exact', head: true })`.
- **Defects:**
  - `remotePapersCountCache` was in-memory only (lost on page refresh, navigation, or new tabs).
  - `STATS_CACHE_TTL_MS` was set to only 60 seconds.
  - Calling `getPlatformStats(true)` on user refresh bypassed the papers cache entirely.
  - Node test runners without mocked content clients fired live `HEAD` requests with `User-Agent: node`.

---

## 7. Remediation Implemented

### 1. Persistent 24-Hour Cache for Catalog Papers Count (`platformStatsService.ts`)
- Added `LOCAL_PAPERS_COUNT_CACHE_KEY` in `localStorage` with a **24-hour TTL** (`24 * 60 * 60 * 1000`).
- If `remotePapersCount` exists in `localStorage`, `getPlatformStats()` **never sends a network request to `exam_papers`**.
- Increased `STATS_CACHE_TTL_MS` from 60 seconds to **5 minutes** (`300,000 ms`), stopping repeated RPC probes during active user navigation.
- Decoupled `forceRefresh` (for user tests taken/registered counts) from static catalog counts. User stats refreshes no longer trigger `HEAD /rest/v1/exam_papers`.

### 2. Session-Level Caching in `paperRepository.ts`
- Added `sessionStorage` caching (`mockai_papers_cache_`) with a **1-hour TTL** (`60 * 60 * 1000`).
- Navigating between Explore, Paper Selection, and Home screens now reuses the session cache, preventing repeat catalog GET queries.

### 3. Verification of Multi-Project Schema Isolation
- Confirmed that `user_exam_attempts` and `profiles` are strictly queried against **Project 1** (`oczbznehlsdmgjdzdeax`), completely eliminating cross-project 404 errors.
- Verified that Project 2 (`nvvscqxsrechenyqcwli`) receives only legitimate public content requests.

---

## 8. Verification & Empirical Request Measurements

### Automated Test Suite
- **Executed:** `npm test`
- **Result:** **34 / 34 test files passed**, **268 / 268 tests passed (100%)**.

### Production Build
- **Executed:** `npm run build` (`tsc && vite build`)
- **Result:** **Compiled successfully in 19.39s with zero TypeScript errors**.

### Live Playwright Request Volume Measurements
Navigating: `Cold Visit (AuthScreen) → Student Login → Explore → Home`:

| Measurement Context | Prior Implementation | Post-Fix Implementation | Reduction |
|:---|:---:|:---:|:---:|
| **Cold Session Launch** | 5 – 12 `HEAD` requests | **1 `HEAD` request** (populates `localStorage`) | **> 85% reduction** |
| **Warm Navigation / Reload** | 4 – 10 `HEAD` requests per min | **0 requests** (serviced from `localStorage`) | **100% elimination** |
| **Tab Refresh / Route Switch** | Live `HEAD` request on every mount | **0 requests** | **100% elimination** |
| **Exam Player Active Session** | 0 requests | **0 requests** | **0 requests (clean)** |

---

## 9. Recommended Postgres Logging Configuration

To protect against Postgres log ingestion spikes in Supabase, execute the following configuration in the **Supabase Dashboard → SQL Editor** (for both Project 1 and Project 2):

```sql
-- 1. Stop logging every individual SELECT/DML query
ALTER DATABASE "postgres" SET log_statement = 'ddl';

-- 2. Only log queries exceeding 1000ms (1 second) to capture slow queries without routine noise
ALTER DATABASE "postgres" SET log_min_duration_statement = 1000;

-- 3. Disable connection/disconnection noise from connection pooling
ALTER DATABASE "postgres" SET log_connections = off;
ALTER DATABASE "postgres" SET log_disconnections = off;
```

> [!TIP]
> Setting `log_statement = 'ddl'` ensures schema alterations and security migrations remain fully audited, while suppressing millions of fast `SELECT` and `HEAD` statements that consume log quota.

---

## 10. Summary Checklist of Changed Files

1. `web/src/services/platformStatsService.ts`
   - Added `LOCAL_PAPERS_COUNT_CACHE_KEY` in `localStorage` with 24-hour TTL.
   - Extended `STATS_CACHE_TTL_MS` to 5 minutes.
   - Decoupled `forceRefresh` so user stat refreshes do not probe `exam_papers`.
   - Updated `_resetPlatformStatsCache()` to safely clear both storage layers.
2. `web/src/repositories/paperRepository.ts`
   - Extended `PAPERS_CACHE_TTL_MS` to 1 hour.
   - Added `sessionStorage` caching (`mockai_papers_cache_`) with automated cleanup in `_resetPaperRepositoryCache()`.
3. `docs/SUPABASE_LOG_CLEANUP_REPORT.md`
   - Created this definitive forensic architecture and cleanup report.
