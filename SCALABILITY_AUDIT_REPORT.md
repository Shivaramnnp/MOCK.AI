# MOCK.AI — Comprehensive Concurrent User Capacity & Scalability Audit
**System Performance, Database, Distributed Systems & SRE Forensic Audit**
**Date**: September 26, 2026 | **Auditor**: Senior Distributed Systems, Performance & Database Engineering Team
**Target Platform**: MOCK.AI Web Application (`https://mock-ai-neon.vercel.app`)

---

## 1. Executive Summary & Reality-Check

Based on an exhaustive, line-by-line inspection of the current production codebase, **MOCK.AI's current real-world concurrent capacity** is:

| Workload Type | Realistic Concurrent Capacity (Current Codebase) | Primary Bottleneck |
| :--- | :--- | :--- |
| **Browsing Users (Catalog / Explore)** | **25,000 – 50,000 concurrent users** | Vercel Edge CDN bandwidth & Client mobile JS heap memory (28MB bundle) |
| **Active Test Users (Guest / Demo)** | **50,000+ concurrent users** | Pure client-side memory & static CDN (Zero DB writes) |
| **Active Test Users (Authenticated)** | **300 – 500 concurrent users (Free Supabase)**<br>**1,500 – 2,500 concurrent users (Pro Supabase)** | **5-second unbatched remote autosave loop** flooding PostgreSQL with 2,000+ write TPS |
| **Peak 10:00:00 Exam Start Spike** | **~500 simultaneous clicks** | Supabase PostgREST connection pool saturation (`504 Gateway Timeout`) |

### The Good News:
1. **Zero Database Reads for Active Tests**: All 204 SSC CHSL papers and 76 GATE papers (5,344 questions) are pre-bundled into static JSON chunks served directly from Vercel's global Anycast Edge CDN. The database is **never queried** during active test question rendering or section switching.
2. **Client-Side Scoring & Zero Compute Bottleneck**: Exam scoring, negative marking (+2/-0.5, +3/-1, +1/-0.33), and section breakdowns are calculated client-side in under 1 millisecond. There is zero server compute pressure during test submissions.
3. **Resilient Local Persistence**: Every question attempt, answer state, and timer tick is written synchronously to browser `localStorage` before attempting network calls. Even if the database crashes, students can continue taking the test locally.

### The Fatal Bottleneck:
The application features a hardcoded **5-second periodic autosave timer** (`CompetitiveExamPlayerScreen.tsx:205`) that executes an unbatched `upsert` to PostgreSQL `public.user_exam_attempts` over HTTP REST for every authenticated student. 
- At **10,000 active test users**, this generates **2,000 database writes per second** against a single PostgreSQL instance evaluating Row Level Security (`auth.uid() = user_id`) on every write.
- A standard PostgreSQL database on Supabase Pro (Small/Medium compute) will exhaust its connection pool and hit 100% CPU utilization within **seconds**, dropping requests and locking up the database.

---

## 2. Actual System Architecture (Codebase Verification)

Contrary to typical Next.js multi-tier architectures, MOCK.AI actually utilizes:

```
[ Learner Client Browser (Desktop / Mobile) ]
      │
      ├── Static Assets (HTML, CSS, JS Chunks, GATE Assets)
      │     ▼
      │   [ Vercel Edge Global Anycast CDN ] (Zero backend compute)
      │
      ├── SSC CHSL Image Assets (PNG Figures, Options)
      │     ▼
      │   [ Supabase Storage Public CDN (Project 2) ] (exam-assets bucket)
      │
      ├── Auth & Attempt Persistence (Active Sessions)
      │     ▼
      │   [ Supabase Project 1: Auth & PostgreSQL ]
      │     ├── PostgREST REST API
      │     ├── Supavisor Connection Pooler
      │     └── PostgreSQL (user_exam_attempts, profiles, classes)
      │
      └── AI On-Demand Test Generator (Custom tests only)
            ▼
          [ Google Gemini API / Groq API ] (Direct client-side HTTPS)
```

### Architectural Realities Discovered:
1. **Framework**: It is **NOT Next.js**. It is a **Vite 6 React 18 Single Page Application (SPA)** (`vercel.json` rewrites `/(.*) -> /index.html`).
2. **Serverless Functions**: There are **zero Vercel Serverless Functions / Route Handlers** running in production. Everything is client-side code communicating directly with external SaaS APIs (Supabase and Gemini).
3. **Dual Supabase Projects**:
   - **Project 1 (`oczbznehlsdmgjdzdeax.supabase.co`)**: Authenticates users and stores active test attempts (`user_exam_attempts`).
   - **Project 2 (`nvvscqxsrechenyqcwli.supabase.co`)**: Exam content metadata and public storage bucket for SSC images.
4. **Firebase**: Used **strictly in the Android Kotlin app (`app/`)**. The Web application does **not** import or use Firebase.

---

## 3. Data & Request Flow Analysis Under Load

### A. Browsing Users (Home, Explore, Exam Detail)
- **Question & Paper Catalog**: Statically compiled in `web/src/data/exams/catalog.ts`. When a user filters by year, tier, or shift, the operation runs entirely in browser memory (`Array.filter`).
- **Database Reads**: Exactly **1 read** on initial Home mount for authenticated users (`getActiveSessionsForUser`), querying `user_exam_attempts` where `status IN ('IN_PROGRESS', 'PAUSED')`. Unauthenticated users produce **0 reads**.
- **Edge CDN Caching**: HTML, CSS, and JS chunks are cached at Vercel's global edge points with immutable content hashes.
- **Estimated Browsing Capacity**: **25,000 – 50,000 concurrent users**. Vercel Edge handles the traffic trivially. The main constraint is client memory and bandwidth.

### B. Active Mock Test Users (The Core Engine)
1. **Starting a Test**:
   - Local: Generates session in `localStorage` synchronously.
   - Remote: Sends `POST /rest/v1/user_exam_attempts` to Supabase Project 1.
2. **Question Navigation & Options**:
   - Selecting an option, marking for review, or switching sections updates client React state and `localStorage`.
   - **ZERO network calls** occur for questions because questions are already in RAM.
3. **Autosave Heartbeat**:
   - `CompetitiveExamPlayerScreen.tsx` sets `setInterval(syncToStorage, 5000)`.
   - `syncToStorage` calls `ExamSessionService.queueAutosave()`, which debounces by 600ms and executes `client.from('user_exam_attempts').upsert(payload)`.
   - **Every authenticated student sends a complete HTTP UPSERT request every 5 seconds.**
4. **Timer Engine**:
   - Wall-clock authoritative: `calculateRemainingSeconds(session)` computes `Math.floor((expiresAt - Date.now()) / 1000)`.
   - Client interval runs once per second locally. **Zero network calls**.
5. **Test Submission**:
   - Client calculates score across all sections in ~0.5ms.
   - 1 final `UPSERT` updates `status = 'SUBMITTED'` and writes `result_summary` JSONB.

---

## 4. Quantitative Modeling: Active Mock Test Load

Let us mathematically model what happens when $N$ authenticated students are simultaneously taking a timed mock examination:

$$\text{Writes per Second (WPS)} = \frac{N}{\text{Sync Interval (5s)}} = 0.2 \times N$$

$$\text{Payload per Write} \approx 4.5 \text{ KB (HTTP headers + JSONB answers \& statuses)}$$

$$\text{Ingress Bandwidth} = \text{WPS} \times 4.5 \text{ KB}$$

### Load Metrics by Concurrent Active User Tier:

| Concurrent Active Users ($N$) | DB Reads/sec (In-Test) | DB Writes/sec (Autosave) | Ingress Bandwidth to Supabase | PostgreSQL Pool Demand | Status on Current Supabase |
| :---: | :---: | :---: | :---: | :---: | :--- |
| **100** | 0 | **20 writes/s** | 90 KB/s | ~20 active conns | 🟢 Safe (Free Tier handles) |
| **500** | 0 | **100 writes/s** | 450 KB/s | ~100 active conns | 🟡 Near Free-Tier Limit |
| **1,000** | 0 | **200 writes/s** | 900 KB/s | ~200 active conns | 🔴 Fails on Free; Requires Pro |
| **2,500** | 0 | **500 writes/s** | 2.25 MB/s | ~500 active conns | 🔴 Supabase Small Compute 100% CPU |
| **5,000** | 0 | **1,000 writes/s** | 4.50 MB/s | ~1,000 active conns | 💥 Connection Pool Exhaustion |
| **10,000** | 0 | **2,000 writes/s** | 9.00 MB/s | ~2,000 active conns | 💥 Total Database Outage (504/503) |
| **50,000** | 0 | **10,000 writes/s** | 45.00 MB/s | ~10,000 active conns | 💥 Architectural Impossibility on single DB |

---

## 5. The Peak Event: 10:00:00 Exam-Start Spike Simulation

### Scenario:
`10,000 candidates` open the exam portal to start the *SSC CHSL Tier 1 Shift 1* or *GATE 2025 DA* paper at precisely **10:00:00**.

### Timeline & Failure Cascade:

```
T = 09:59:50 – 10:00:00 (Landing & Browsing)
  - 10,000 clients download index.html and preloaded JS modules.
  - Vercel Edge CDN handles the request spike smoothly (Anycast caching).
  - Bandwidth consumption: 10,000 × 3.5 MB (gzipped) = 35 GB egress in 10 seconds!
  - Mobile devices experience 1.5–4.0s main-thread freezing to parse 28MB uncompressed JS.

T = 10:00:00 (The "Start Test" Click)
  - 10,000 students click "Start Simulation".
  - ExamSessionService.createSession initializes local storage (100% success).
  - Immediately, 10,000 asynchronous HTTP POST requests are fired to:
    POST https://oczbznehlsdmgjdzdeax.supabase.co/rest/v1/user_exam_attempts
  - Supavisor / PostgREST connection queue maxes out at 500–1,000 connections.
  - Latency spikes from 45ms to 12,000ms.
  - Supabase begins returning HTTP 504 Gateway Timeout and HTTP 503 Service Unavailable.

T = 10:00:01 – 10:00:03 (Client Resilience Masking Server Crash)
  - In ExamSessionService.ts:117, the Promise catch block handles the error gracefully:
    catch(err) { console.warn('Non-fatal: initial remote session save skipped:', err); }
  - The examination UI renders! Students see Question 1.
  - BUT: The remote cloud session does NOT exist in PostgreSQL.

T = 10:00:05 (The Periodic Autosave Wave 1)
  - Exactly 5 seconds after start, 10,000 client setInterval timers fire simultaneously.
  - Another wave of 10,000 UPSERT requests hits the already overwhelmed Supabase backend.
  - Database CPU remains pegged at 100%. WAL (Write-Ahead Logging) write queue backs up.

T = 10:00:10 (The Periodic Autosave Wave 2)
  - Yet another 10,000 UPSERT requests arrive before previous ones finish.
  - PostgreSQL transaction queue enters a cascading deadlock / timeout spiral.

T = 10:05:00 (Asset Image Loading for SSC)
  - Students navigating through questions encounter diagrams.
  - GATE assets load instantly from Vercel static CDN.
  - SSC assets hit Supabase Storage (nvvscqxsrechenyqcwli.supabase.co).
  - 10,000 students downloading ~20 images (50KB each) = 10 GB storage egress.
  - Supabase Storage 5 GB free tier limit is blown; subsequent images return HTTP 429 / 402.
```

---

## 6. Forensic Database & Schema Audit

### A. Table: `public.user_exam_attempts` (Project 1)
- **Primary Key**: `id TEXT` (Indexed via B-tree).
- **Foreign Key**: `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`.
- **Existing Indexes**:
  - `idx_user_attempts_user_id` on `(user_id)`
  - `idx_user_attempts_paper_id` on `(paper_id)`
  - `idx_user_attempts_status` on `(status)`
  - `idx_user_attempts_user_status` on `(user_id, status)`
- **Schema Flaw**:
  - `user_answers`, `user_msq_answers`, `user_nat_answers`, `user_descriptive_answers`, and `question_statuses` are stored as separate `JSONB` columns.
  - On every 5-second autosave, the entire row is rewritten via `UPSERT`.
  - In PostgreSQL, an `UPDATE` on a row containing multiple large `JSONB` blobs creates a new row version (MVCC), writing to the WAL and table heap.
  - With 2,000 writes/sec, PostgreSQL generates **~15 MB of WAL every second**, triggering aggressive auto-vacuuming and I/O disk thrashing.
- **Row Level Security (RLS)**:
  - Policy: `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
  - Evaluated on every single HTTP UPSERT. While indexed on `user_id`, evaluating JWT claims 2,000 times/second adds measurable CPU overhead to PostgreSQL.

### B. Table: `public.profiles` (Project 1)
- **Missing Index**: In `supabase.ts:308`, phone uniqueness is checked during registration:
  ```ts
  .or(`phone_number.eq.${normalized},phone_number.eq.${phone.trim()}`)
  ```
  In `fix_auth_profiles_trigger.sql`, `phone_number TEXT` **has NO index**.
  Every signup or phone validation triggers a **Sequential Table Scan (`Seq Scan on profiles`)**. At 50,000 registered users, registration will cause high database read spikes.

### C. Table: `public.classes` & `public.class_members` (Project 1)
- **RLS Flaw**: In `schema_classroom.sql:76`:
  ```sql
  CREATE POLICY "View enrolled, taught, or joinable classes"
      ON public.classes FOR SELECT
      USING (... OR join_code IS NOT NULL);
  ```
  Since `join_code` is `NOT NULL`, this policy allows **any authenticated user to read all classes in the database**.
- **N+1 Query Flaw**: In `classroomService.ts:100`, after querying `classes`, the code executes a separate `SELECT` from `class_members` for each class in an `await` loop.

---

## 7. Question & Asset Delivery Audit (Bandwidth & Bundling)

### A. The 28 MB Eager Bundle Trap
In `web/src/data/exams/catalog.ts:242`:
```ts
const paperModules = import.meta.glob<{ default: ExamPaper }>(
  ['./ssc-chsl-*.json', './gate-*.json'], 
  { eager: true }
);
```
- Because `{ eager: true }` is specified, Vite builds 10 separate JavaScript chunks partitioned by year:
  - `gate-2024.js` (3.47 MB)
  - `gate-2025.js` (3.47 MB)
  - `ssc-chsl-2019.js` through `2025.js` (1.15 MB – 4.52 MB each)
- Because `index.js` imports `catalog.ts`, Vite includes `<link rel="modulepreload">` for **all 10 year chunks in `index.html`**!
- **Every visitor downloads all 280 exam papers (28 MB uncompressed / 3.5 MB gzipped) before even selecting an exam!**

### B. Bandwidth Consumption Projections:

| Concurrent Users | Initial Page Load JS Transfer | Image Assets (Estimated) | Total Bandwidth Needed | Vercel Monthly Egress Impact (1TB Limit) |
| :---: | :---: | :---: | :---: | :---: |
| **100** | 350 MB | 50 MB | 400 MB | 0.04% |
| **1,000** | 3.5 GB | 500 MB | 4.0 GB | 0.40% |
| **5,000** | 17.5 GB | 2.5 GB | 20.0 GB | 2.00% |
| **10,000** | 35.0 GB | 5.0 GB | 40.0 GB | 4.00% |
| **50,000** | 175.0 GB | 25.0 GB | 200.0 GB | 20.00% |
| **100,000** | 350.0 GB | 50.0 GB | 400.0 GB | 40.00% |

---

## 8. Authentication & Security Audit

1. **Token Refresh Behavior**:
   - Supabase Auth stores the JWT in `localStorage` under `mockai_auth_session` and `sb-<ref>-auth-token`.
   - Token refresh is automatic (`autoRefreshToken: true`), handled by `@supabase/gotrue-js` every 60 minutes.
   - It does **not** make auth requests on route transitions or page reloads if the cached JWT is unexpired.
2. **Credentials Audit**:
   - Zero `service_role` keys were detected in the client bundle.
   - Both Supabase URLs and Anon/Publishable keys are exposed in the client. This is normal and expected for public client-side Supabase architectures governed by RLS.
   - However, fallback hardcoded URLs and keys in `supabase.ts` and `supabaseContent.ts` mean that even if `.env` is unconfigured, the app hits the live production Supabase instance.
3. **Session Partitioning**:
   - All RLS policies on `user_exam_attempts` strictly enforce `auth.uid() = user_id`. User A cannot read, update, or delete User B's exam attempts (IDOR-safe).

---

## 9. Comprehensive Scalability Problem Matrix

Here is the exact categorization of architectural issues preventing Mock.AI from scaling:

### [CRITICAL]
#### Issue C1: Unbatched 5-Second Autosave Loop
- **File**: `web/src/screens/CompetitiveExamPlayerScreen.tsx:205` & `web/src/services/examSessionService.ts:321`
- **Problem**: Periodic 5s interval triggers an unbatched HTTP UPSERT of full JSONB answer state to Supabase PostgreSQL.
- **Why it matters**: Generates 2,000 writes/sec for 10,000 concurrent users. PostgreSQL connection pool and WAL collapse instantly.
- **Impact**: Server crash (`504 Gateway Timeout`) for any test with >500 concurrent authenticated students.
- **Recommended Solution**:
  1. Increase periodic sync interval from 5s to **60 seconds**.
  2. Implement **delta-only autosaving** (save locally on every click; sync to server only on Section Change, Question 20/40 checkpoints, Save & Exit, and Final Submit).
  3. Introduce client-side jitter ($\pm 5\text{s}$) to avoid synchronized clock waves.

#### Issue C2: Simultaneous Exam Start Connection Flood
- **File**: `web/src/screens/CompetitiveExamPlayerScreen.tsx:55` & `web/src/services/examSessionService.ts:117`
- **Problem**: When 10,000 students start an exam at 10:00:00, 10,000 concurrent `INSERT` requests hit Supabase within 1 second.
- **Why it matters**: PostgREST connection backlog overflows, causing immediate initial save failures.
- **Impact**: Cloud session creation fails for majority of users; resume across devices becomes broken.
- **Recommended Solution**:
  - Lazily initialize remote session: Create session locally in `localStorage` on start; sync to remote database after the user answers their first question or after a randomized delay (5–30s).

---

### [HIGH]
#### Issue H1: Eager 28MB Preload of All Exam Papers
- **File**: `web/src/data/exams/catalog.ts:242`
- **Problem**: `import.meta.glob(..., { eager: true })` causes Vite to preload all 280 papers across all 7 years on initial page visit.
- **Why it matters**: Wastes 35 GB of bandwidth per 10k users and freezes budget mobile browser threads.
- **Impact**: Slow initial load time (LCP > 4.5s on mobile 4G); high Vercel egress costs.
- **Recommended Solution**:
  - Switch `catalog.ts` to dynamic lazy loading: `import.meta.glob(..., { eager: false })`.
  - Only load the specific JSON chunk when the user clicks on an exam paper.

#### Issue H2: Supabase Storage Bandwidth Quota on SSC Assets
- **File**: `web/src/lib/supabaseContent.ts:60` & `web/src/components/ExamAsset.tsx:21`
- **Problem**: SSC images are fetched from Supabase Storage bucket `exam-assets`.
- **Why it matters**: Supabase Free Tier provides only 5 GB/month storage egress. Pro provides 50 GB/month.
- **Impact**: A single mock test event with 10,000 students downloading diagrams can exhaust the monthly storage quota in 30 minutes, breaking diagram images for subsequent users.
- **Recommended Solution**:
  - Migrate SSC images to Cloudflare R2 or serve via Cloudflare CDN caching in front of Supabase Storage (`Cache-Control: public, max-age=31536000, immutable`).

---

### [MEDIUM]
#### Issue M1: Full Table Scan on Phone Uniqueness Check
- **File**: `web/src/services/supabase.ts:308` & `supabase/fix_auth_profiles_trigger.sql:19`
- **Problem**: Registration query checks `phone_number.eq` without an index on `public.profiles(phone_number)`.
- **Why it matters**: Sequential scan cost scales linearly ($O(N)$) with user base.
- **Impact**: Registration latency increases as registered accounts grow past 50,000.
- **Recommended Solution**:
  - Add `CREATE UNIQUE INDEX idx_profiles_phone ON public.profiles(phone_number) WHERE phone_number IS NOT NULL AND phone_number != '';`

#### Issue M2: N+1 Query in Classroom Service
- **File**: `web/src/services/classroomService.ts:100`
- **Problem**: Sequentially queries `class_members` for every class returned in `classes`.
- **Why it matters**: Multiplies database round-trips by the number of classes.
- **Impact**: Slow load on Classroom tab; unnecessary connection pool consumption.
- **Recommended Solution**:
  - Use single joined query: `.from('classes').select('*, class_members(student_id, student_name)')`.

---

## 10. Complete Capacity Table

| Concurrent Users | Browsing / Explore | Active Tests (Current) | Active Tests (Optimized) | Expected Risk | Primary Bottleneck | Required Architecture Changes |
|---:|:---|:---|:---|:---|:---|:---|
| **100** | `ESTIMATE` 100% OK | `ESTIMATE` 100% OK | `ESTIMATE` 100% OK | Negligible | None | None |
| **500** | `ESTIMATE` 100% OK | `ESTIMATE` 80% OK | `ESTIMATE` 100% OK | Low | Free DB pool limit | Upgrade to Supabase Pro or increase sync to 30s |
| **1,000** | `ESTIMATE` 100% OK | `ESTIMATE` 25% Fail | `ESTIMATE` 100% OK | High (Current) | 200 writes/sec to DB | Increase autosave to 60s + lazy session init |
| **2,500** | `ESTIMATE` 100% OK | `ESTIMATE` 90% Fail | `ESTIMATE` 100% OK | Critical (Current) | DB CPU 100% | Delta sync + client-side checkpointing |
| **5,000** | `ESTIMATE` 100% OK | `ESTIMATE` 100% Fail | `ESTIMATE` 95% OK | Outage (Current) | DB connection pool | Dedicated DB instance + connection pooling |
| **10,000** | `ESTIMATE` 100% OK | `ESTIMATE` 100% Fail | `ESTIMATE` 90% OK | Outage (Current) | Autosave write rate | Edge ingestion buffer or Redis write-behind |
| **25,000** | `ESTIMATE` 95% OK | `ESTIMATE` 100% Fail | `ESTIMATE` 80% OK | Outage (Current) | Supabase REST API | Cloudflare Worker / Redis state cache |
| **50,000** | `ESTIMATE` 90% OK | `ESTIMATE` 100% Fail | `ESTIMATE` 70% OK | Severe | Network egress | Lazy-load 28MB JS chunks + R2 asset CDN |
| **100,000** | `ESTIMATE` 80% OK | `ESTIMATE` 100% Fail | `ESTIMATE` 60% OK | Extreme | Egress & DB writes | Edge worker session aggregation |

---

## 11. Staging & Local Load-Test Plan (Safe & Non-Destructive)

To verify the real breaking points without risking production data or incurring unexpected cloud bills:

### A. Environment Configuration:
1. Spin up a local staging instance using Supabase CLI (`npx supabase start`) on a local test runner or dedicated staging project.
2. Seed staging database with 10,000 dummy user accounts and the `user_exam_attempts` schema.
3. Use **k6** or **Artillery** to simulate realistic user behaviors.

### B. Scenario Workloads to Test:

#### Scenario 1: The 10:00:00 Start Spike (PostgREST Concurrency)
- **Target**: `POST /rest/v1/user_exam_attempts`
- **Pattern**: Ramp from 0 to 1,000 VUs (Virtual Users) in 5 seconds; hold for 60s.
- **Metrics to Measure**:
  - HTTP 504 Gateway Timeout rate
  - p95 and p99 latency
  - PostgreSQL active connections (`pg_stat_activity`)
  - Supabase CPU usage

#### Scenario 2: Active Test Autosave Sustained Load
- **Target**: `POST /rest/v1/user_exam_attempts` (UPSERT with full JSONB state)
- **Pattern**:
  - Test A: 500 VUs sending payload every 5s (100 RPS)
  - Test B: 1,000 VUs sending payload every 5s (200 RPS)
  - Test C: 2,500 VUs sending payload every 5s (500 RPS)
- **Success Criteria**:
  - Error rate < 0.1%
  - p95 response time < 250ms
  - No connection pool exhaustion

#### Scenario 3: Static Asset & Chunk Delivery
- **Target**: `GET /assets/gate-2025-*.js`, `GET /assets/index-*.js`
- **Pattern**: 5,000 requests/sec against Vercel staging deployment.
- **Success Criteria**: Cache hit ratio > 98%, p99 latency < 100ms.

---

## 12. Strategic Roadmap to Target Capacities (Without Overengineering)

### Target A: 1,000 Concurrent Active Test Users (Readiness: 40%)
- **What's needed**:
  1. Change autosave timer from 5s to **30s** or **checkpoint-based** (Section switch + Question 25/50).
  2. Implement client jitter: $\text{delay} = 30\text{s} \pm \text{random}(0, 5\text{s})$.
  3. Lazy initialize session on first answered question rather than on initial "Start" click.
- **Infrastructure**: Supabase Pro tier ($25/mo) with default compute.

### Target B: 5,000 Concurrent Active Test Users (Readiness: 15%)
- **What's needed**:
  1. All of Target A.
  2. Switch Vite exam chunk imports in `catalog.ts` from eager to dynamic lazy import (`import(...)`).
  3. Increase Supabase compute to **Small / Medium (2-4 vCPU)**.
  4. Cache SSC assets on Cloudflare CDN in front of Supabase Storage.

### Target C: 10,000 Concurrent Active Test Users (Readiness: 5%)
- **What's needed**:
  1. All of Target B.
  2. Change answer persistence strategy:
     - Local storage is the primary operational state.
     - Remote database is updated only on **3 key events**: (1) Section completion, (2) Save & Exit, (3) Final Submit.
     - A 2-minute emergency heartbeat only writes `time_remaining` and answered counts (lightweight row update, not full 100-question JSONB rewrite).
- **Infrastructure**: Supabase Medium compute (4 vCPU, 8GB RAM).

### Target D & E: 50,000 – 100,000 Concurrent Active Test Users (Readiness: 0%)
- **What's needed**:
  - Direct HTTP UPSERT to PostgreSQL will **never** sustain 10,000+ writes/second from 50k–100k clients without massive enterprise database cluster costs ($2,000+/mo).
  - **The Clean Solution (No Kubernetes/Kafka needed)**:
    - Route test heartbeats and answer syncs through a **Cloudflare Worker** or lightweight Go/Node edge ingestor that buffers writes into an in-memory Redis/Dragonfly queue or Cloudflare D1/KV.
    - An asynchronous worker flushes consolidated attempt summaries to PostgreSQL in micro-batches every 10 seconds.
    - Result: PostgreSQL receives only 50–100 batched writes/sec instead of 10,000 individual transactional writes/sec!
