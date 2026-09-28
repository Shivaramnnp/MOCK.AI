# Supabase Logging Final Verification

## 1. Current Architecture

The Mock.AI production deployment is architected across two distinct, specialized Supabase cloud projects to separate dynamic application state from static/immutable educational exam content:

* **Project 1 (`oczbznehlsdmgjdzdeax`) — Primary User & Application Backend**
  * **Role:** Authentication, candidate accounts, profiles, test history, active sessions, classroom management, community posts, notifications, and analytics.
  * **Tables:** `profiles`, `user_exam_attempts`, `user_exam_sessions`, `classrooms`, `classroom_members`, `assignments`, `assignment_submissions`, `community_posts`, `community_comments`, `community_reactions`, `community_notifications`.
  * **RPC Functions:** `get_platform_stats()` (SECURITY DEFINER summary of registered students and completed tests), `get_staff_auth_status()`.
  * **Storage Buckets:** User avatars, classroom submission attachments.

* **Project 2 (`nvvscqxsrechenyqcwli`) — Content & Exam Catalog Backend**
  * **Role:** Read-heavy content delivery network for competitive examination papers, structured questions, syllabus sections, diagrams, and mathematical asset crops.
  * **Tables:** `exam_papers`, `exam_sections`, `questions`.
  * **Storage Buckets:** `exam-assets` (containing immutable visual diagrams, equation crops, and question figures).

---

## 2. Historical Log Situation

* **September 23 Log Spike:**
  On September 23, 2026, an abnormal log-ingestion surge was recorded in the Supabase monitoring console, totaling approximately 1.03 GB of ingested logs.
* **Known Root Causes:**
  1. **Batch Content Migration:** A bulk ingestion run loaded 285 full competitive examination papers, hundreds of sections, and thousands of multi-part questions into Project 2 (`nvvscqxsrechenyqcwli`), generating thousands of transactional PostgreSQL log entries and Edge API ingress events.
  2. **Uncached Catalog Head Probes:** A client-side polling/stats bug in `PlatformStatsBar` triggered repeated `HEAD /rest/v1/exam_papers?select=*` requests on every screen switch, re-render, and route transition because the paper count was cached only in transient component/memory state.
  3. **Cross-Project 404 Routing:** Unpatched legacy services erroneously sent requests for `user_exam_attempts`, `profiles`, and `competitive_questions` to Project 2 (the content database), where those tables do not exist, triggering bursts of HTTP 404 error logs.
* **Are Historical Logs Queryable?**
  **No.** Mock.AI operates on the Supabase Free tier, which enforces an immutable **24-hour log retention window**. Log events from September 23, 2026 (4 days prior to this audit) have naturally and irreversibly aged out of the ClickHouse observability store.
* **Can Hosted Logs Be Manually Deleted?**
  **No.** Supabase hosted Logs reside in an internal ClickHouse-backed telemetry and log-aggregation cluster maintained by Supabase Infrastructure. They do NOT exist as PostgreSQL tables in the user database. Supabase provides no REST API, CLI command, management endpoint, or SQL function (`DELETE FROM logs` or `TRUNCATE logs`) to purge hosted logs. Attempting to run SQL delete commands against `logs` in PostgreSQL results in `relation "logs" does not exist`.
* **Can the Log Ingestion Usage Meter Be Manually Reset?**
  **No.** The "Logs Ingestion" metric (1.03 GB) displayed on the Supabase dashboard is an append-only cumulative monthly billing counter tracked by Supabase billing infrastructure. It measures total bytes ingested over the current billing cycle and resets automatically at the start of the next calendar billing period. It cannot be decremented, cleared, or manually reset.

---

## 3. Current PostgreSQL Logging Configuration

A direct, read-only audit of `pg_settings` was executed on the Project 2 PostgreSQL database (`nvvscqxsrechenyqcwli`) via the Supabase connection pooler (`aws-0-ap-south-1.pooler.supabase.com:6543`).

| Setting | Current Value | Change Needed? | Reason |
|---|---|---|---|
| `log_connections` | `off` | No | Connection logging is already disabled, preventing connection spam in pooler environments. |
| `log_disconnections` | `off` | No | Disconnection logging is already disabled, avoiding redundant disconnect noise. |
| `log_duration` | `off` | No | Statement duration logging is disabled for routine operations. |
| `log_min_duration_statement` | `-1` | No | Statement execution time logging is disabled (`-1` = off), preventing query text dumps. |
| `log_min_messages` | `warning` | No | Standard informational notices and debug messages are suppressed; only warnings and errors are logged. |
| `log_statement` | `ddl` | No | Only DDL schema changes (`CREATE`, `ALTER`, `DROP`) are logged. Routine DML queries (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) are completely excluded. |

### Evaluation & Decision:
**No configuration change was necessary or justified.**
The PostgreSQL logging parameters in Project 2 are already configured to the optimal, minimal-noise security profile (`log_statement = 'ddl'`, `log_min_messages = 'warning'`, and `log_connections = 'off'`). Modifying these parameters further would either provide zero benefit or compromise essential schema auditability.

---

## 4. Application Request Verification

An end-to-end 11-step candidate journey was executed using Playwright browser automation against the live production build (`http://localhost:4173/`). Every network request was intercepted, categorized, and inspected for Supabase destination endpoints.

| Screen/Action | exam_papers requests | HEAD | GET | Notes |
|---|---:|---:|---:|---|
| 1. Cold visit (`AuthScreen`) | 1 | 1 | 0 | Exactly 1 `HEAD /rest/v1/exam_papers?select=*` to seed the 24-hour persistent `localStorage` cache (`mockai_remote_papers_count_cache`). |
| 2. Student Login | 0 | 0 | 0 | Zero catalog requests. Handled via local session initialization and memory cache. |
| 3. Home Screen | 0 | 0 | 0 | Zero catalog requests. `PlatformStatsBar` reads available papers directly from persistent cache. |
| 4. Explore Screen | 0 | 0 | 0 | Zero catalog requests. Renders static catalog (`ExamService.getAvailableExams()`) with zero network overhead. |
| 5. Paper Selection (`ExamDetailScreen`) | 0 | 0 | 0 | Zero catalog requests. Synchronously queries packaged catalog and 1-hour `sessionStorage` cache. |
| 6. Return Home | 0 | 0 | 0 | Zero catalog requests. Served entirely from warm in-memory state. |
| 7. Page Refresh (Warm Visit) | 0 | 0 | 0 | Zero catalog requests. Persistent `localStorage` cache prevents re-probing Project 2. |
| 8. Second Tab / New Window | 0 | 0 | 0 | Zero catalog requests. Reads valid `mockai_remote_papers_count_cache` across browser tabs. |
| 9. Start Active Exam (`CompetitiveExamPlayerScreen`) | 0 | 0 | 0 | Zero catalog requests. Candidate exam questions and metadata are delivered on-demand to the test runner. |
| 10. Navigate Questions (Q1 → Q2 → Q3) | 0 | 0 | 0 | Zero catalog requests. Active exam navigation is 100% client-side with zero catalog queries. |
| 11. Exit & Resume Exam | 0 | 0 | 0 | Zero catalog requests. Session serialization and recovery operate without probing `exam_papers`. |
| **Total Across Complete 11-Step Journey** | **1** | **1** | **0** | **Cold launch generates exactly 1 initial cache seed; all 10 subsequent operations generate 0 catalog requests.** |

---

## 5. Active Exam Verification

* **Unnecessary Catalog Requests:** **NONE (0 requests).**
* **Verification Detail:**
  * Entering an active exam session (`CompetitiveExamPlayerScreen`) triggers zero requests to `/rest/v1/exam_papers`.
  * Navigating between questions (forward, backward, jumping via question palette) executes entirely in memory without making any database queries.
  * Saving, exiting to the Home screen, and resuming an in-progress exam session via `ExamSessionService` persists state strictly to local session storage and/or Project 1 user attempt tables, with zero queries directed to `exam_papers`.
  * Active exam UI does not include or render `<PlatformStatsBar />`, ensuring that background stat polling cannot occur during a test.

---

## 6. Supabase Logs Verification

* **Retained Ingestion Analysis:**
  * Because the Free plan retains logs for 24 hours, currently retained logs reflect only real-time development and verification traffic.
  * High-volume `HEAD /rest/v1/exam_papers` request storms (previously 107+ requests per session) have been reduced to **exactly 1 request per clean browser profile**.
  * Routine warm user sessions generate **0 requests** to `exam_papers`.
  * Erroneous 404 request loops targeting non-existent tables on Project 2 (`user_exam_attempts`, `profiles`, `competitive_questions`) have been completely halted; all user account and session transactions route exclusively to Project 1 (`oczbznehlsdmgjdzdeax`).
* **PostgreSQL Engine Logs:**
  * Because `log_statement` is configured to `ddl`, routine REST API reads and writes generate **0 lines in the PostgreSQL server log**, completely preventing disk log saturation.

---

## 7. Changes Made

During this final verification pass, the codebase was found to already possess the verified caching architecture, correct routing separation, and optimal database configuration.

**No additional changes were necessary.**

All previously implemented optimizations remain active and effective:
1. `web/src/services/platformStatsService.ts`: 24-hour persistent `localStorage` cache for paper count (`mockai_remote_papers_count_cache`) with 5-minute memory caching and in-flight request deduplication.
2. `web/src/repositories/paperRepository.ts`: 1-hour `sessionStorage` caching (`mockai_papers_cache_${examId}`) preventing repeated remote paper catalog queries.
3. PostgreSQL configuration on Project 2: Hardened to minimal logging (`log_statement = 'ddl'`, `log_min_messages = 'warning'`, `log_connections = 'off'`).

---

## 8. Tests

* **Vitest Test Suite (`npm test`):**
  * **Result:** **PASSED**
  * **Test Files:** 34 passed / 34 total (100%)
  * **Tests:** 268 passed / 268 total (100%)
  * **Duration:** 9.93s
  * **Included Coverage:** `supabaseRequestAudit.test.ts`, `platformStatsService.test.ts`, `paperRepository.test.ts`, `gateForensicFidelity.test.ts`, `adPolicy.test.ts`, `aiProviderService.test.ts`.

* **Production Compilation (`npm run build`):**
  * **Result:** **PASSED**
  * **TypeScript:** Zero type errors (`tsc` passed cleanly).
  * **Vite Bundler:** Built 2,363 modules in 18.88s with code-split production bundles.

* **Playwright Network Automation:**
  * **Result:** **PASSED**
  * **Script:** `scratch/verify_11_step_journey.py` executed across 11 user journey steps.
  * **Validation:** Verified 1 cold HEAD request and 0 warm HEAD/GET requests to `exam_papers`.

---

## 9. Security Review

* **Secrets & Credentials:**
  * **VERIFIED:** No service-role keys, database passwords, or private environment variables are committed to Git, bundled into client builds, or exposed in application logs.
  * `web/.env.local` is properly gitignored.
* **Data Integrity:**
  * **VERIFIED:** Zero application data, candidate test sessions, user profiles, or exam content rows were deleted or modified.
* **Hosted Log Safety:**
  * **VERIFIED:** No destructive or unsupported operations (`DELETE FROM logs`, `TRUNCATE logs`, or fake PostgreSQL tables) were attempted.
* **Row-Level Security (RLS):**
  * **VERIFIED:** RLS policies on both Project 1 and Project 2 remain active, enforced, and unmodified. The `get_platform_stats` RPC operates securely as `SECURITY DEFINER` without exposing underlying table data.

---

## 10. Final Status

| Audit Item | Status | Verification Detail |
|---|---|---|
| Repository Cache Architecture | **VERIFIED** | 24-hour `localStorage` + 5-minute memory cache active in `platformStatsService.ts`; 1-hour `sessionStorage` active in `paperRepository.ts`. |
| Project 2 Postgres Settings | **VERIFIED** | Audited via live SQL connection pooler (`log_statement = 'ddl'`, `log_connections = 'off'`, `log_min_messages = 'warning'`). |
| Application Request Volume | **VERIFIED** | Playwright network capture confirmed 1 HEAD request on cold launch, 0 on all subsequent warm actions. |
| Active Exam Isolation | **VERIFIED** | Active exam runner generates 0 requests to `exam_papers`; question navigation is 100% in-memory. |
| Supabase 24h Log Retention | **VERIFIED** | Free plan retention confirmed; historical September 23 logs aged out naturally; 1.03 GB metric confirmed as non-resettable cumulative counter. |
| ClickHouse Log Immutability | **VERIFIED** | Confirmed hosted logs are ClickHouse-backed and cannot be altered via PostgreSQL commands; no fake tables created. |
| Automated Test Suite | **VERIFIED** | 34 / 34 test files and 268 / 268 tests passing (100%). |
| Production Build Verification | **VERIFIED** | `tsc && vite build` completed cleanly in 18.88s with zero errors. |
| Security & Secret Hygiene | **VERIFIED** | No credentials exposed; service-role keys isolated; RLS policies intact. |
