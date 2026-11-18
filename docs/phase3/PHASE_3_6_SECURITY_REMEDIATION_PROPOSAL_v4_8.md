# Mock.AI — Phase 3.6 Security Remediation Proposal v4.8
### Document Title: `PHASE_3_6_SECURITY_REMEDIATION_PROPOSAL_v4_8.md`
**Proposal Version:** `4.8.0-TRANSACTION-VISIBILITY-AND-IDEMPOTENT-RECOVERY-AUDIT`  
**Overall Readiness Gate:** 🔴 **RED — Implementation and Candidate-Facing Integration Strictly Blocked**  
**Document Status:** **STRICT DESIGN-ONLY AUDIT & ARCHITECTURAL SPECIFICATION**  
*(Strictly zero application source code modified, zero migrations applied, zero test suites executed)*

---

## 1. Document Status, Governance Locks & Audit Metadata

This document constitutes the definitive architectural design review and remediation specification **v4.8** for Mock.AI Phase 3.6. It directly resolves the critical security contradictions, transaction visibility limits, and recovery gaps identified in the forensic review of proposal v4.7:

1. **Policy Beta Deconstruction & The MVCC Visibility Paradox:** Uncovers a fundamental architectural contradiction in Policy Beta: in PostgreSQL, an uncommitted context row inserted by `bind_context` in transaction $T_c$ is **completely invisible under MVCC to a concurrent proctor transaction $T_p$**. A proctor attempting to look up the candidate backend PID from `active_contexts` finds zero rows while $T_c$ is in-flight. Documents this fatal visibility paradox and marks Policy Beta as an **unresolved architectural blocker**.
2. **Data Exposure States & Application Buffer Containment:** Traces eight (8) discrete lifecycle states from initial query execution to browser rendering. Proves that in multi-statement transactions, projection data reaches Node.js memory (`res.rows`) before `COMMIT`. Specifies a strict response-release contract preventing HTTP output until `COMMIT` resolves, and establishes the exact point of irrevocability ($T_{\text{http\_emit}}$).
3. **Deconstruction of JavaScript Memory Erasure:** Disproves the claim that setting `projectionBuffer = null` provides secure memory erasure. Explains V8 heap management, garbage collection latencies, and nursery generations, mandating strict data-minimization controls across logging, APM tracing, and diagnostic dumps.
4. **Backend Identity TOCTOU Race Analysis:** Proves that even with `(backend_pid, backend_start)`, PostgreSQL's engine API `pg_terminate_backend(int)` operates strictly on raw integer PIDs, creating a kernel-level time-of-check to time-of-use (TOCTOU) race if a process terminates between catalog evaluation and signal dispatch.
5. **Durable Idempotency & Ambiguous Commit Recovery:** Retracts the naive assumption that a `consumed_tickets` row guarantees recoverable projection state. Formulates an atomic, durable operation ledger (`projection_access_receipts`) that couples ticket consumption with verifiable operation outcome and safe retry reconciliation.
6. **Authoritative 67-Scenario Adversarial Test Inventory:** Expands the adversarial test suite to sixty-seven (67) comprehensive scenarios, covering uncommitted context invisibility, buffer leaks, ambiguous commit races, and TOCTOU signaling. All 67 scenarios remain completely unexecuted (`[B]`).

### Governance Locks

| Governance Domain | Status | Operational Restriction |
| :--- | :---: | :--- |
| **Phase 3.6 Adapter Implementation** | 🔒 **LOCKED** | No client projection adapter code may be authored or committed. |
| **Phase 3.5 Scoring & Evaluation Engine** | 🔒 **FROZEN** | No modifications to evaluation DAGs, scoring formulas, or dispute tables. |
| **Assessment-Policy Governance (`AP-DEC-013`)** | 🔒 **STRICTLY LOCKED** | No candidate runtime bypasses or autonomous LLM policy conversions permitted. |
| **Repository File System** | 🔒 **READ-ONLY** | Exactly zero application source files modified in `/Users/shivarampatel/Desktop/MOCK.AI`. |
| **Database Migrations & Runtime** | 🔒 **UNEXECUTED** | No database migrations applied; zero tests executed. |
| **Candidate Player Integration** | 🔴 **BLOCKED** | Live candidate-facing integration blocked pending resolution of all blocking dependencies. |

---

## 2. Change Log (v4.7 $\rightarrow$ v4.8)

1. **Exposed MVCC Transaction Visibility Paradox (Policy Beta):** Proved that concurrent proctor transactions cannot inspect uncommitted candidate context rows in `active_contexts`, invalidating the table-based signaling lookup proposed in v4.7.
2. **Deconstructed JavaScript Heap & Buffer Containment:** Clarified that dereferencing `projectionBuffer` does not wipe V8 heap memory. Specified strict logging and APM exclusion boundaries.
3. **Formalized Eight (8) Discrete Data Exposure States:** Mapped the complete lifecycle of projection bytes, defining the exact behavior of proctor termination at each state and proving the boundary of irrevocability.
4. **Engineered Durable Idempotency Ledger (`projection_access_receipts`):** Replaced ticket-only reconciliation with an atomic operation receipt model for resolving ambiguous commit outcomes.
5. **Audited TOCTOU Engine Limits in `pg_terminate_backend`:** Documented the inherent kernel gap between reading `pg_stat_activity` and issuing `kill(pid, SIGTERM)`.
6. **Expanded Adversarial Test Suite to 67 Scenarios:** Added 13 new scenarios (`ADV-55` through `ADV-67`) targeting uncommitted MVCC visibility, buffer scrapping, ambiguous commit reconciliation, and receipt atomicity.

---

## 3. Evidence Classification Taxonomy

- **`[A] Direct Repository Evidence`**: Verified by exact file path, line numbers, and repository contents.
- **`[B] Executed Test Evidence`**: Confirmed by executed test output in this workspace (all adversarial tests are explicitly marked *unexecuted*).
- **`[C] Verified PostgreSQL Semantics`**: Verified against official PostgreSQL engine documentation, parser/executor source behavior, locking semantics, and catalog specifications.
- **`[D] Proposed Design`**: Architectural design, schema migration, or code pattern proposed for implementation.
- **`[E] Unresolved External Dependency`**: Blocking prerequisite external to the immediate gateway codebase.
- **`[F] Unverified Runtime Assumption`**: State of the live deployed database, network topology, or hosting environment that cannot be verified statically from repository code.

---

## 4. Policy Beta & The MVCC Transaction Visibility Paradox

### 4.1 The Fundamental Flaw in Table-Based Backend Signaling `[C]`

In proposal v4.7, it was proposed that `bind_context` inserts a record into `uadue_auth.active_contexts`, and `terminate_candidate_session` queries that table to find the candidate's `backend_pid` and `backend_start`.  
**Adversarial Technical Breakthrough (`[C]`):**  
Under PostgreSQL Multi-Version Concurrency Control (MVCC):
1. Candidate transaction $T_c$ begins (`BEGIN`), acquires `SELECT ... FOR SHARE` on `exam_sessions`, and executes `bind_context()`.
2. Inside `bind_context()`, $T_c$ inserts its tuple into `uadue_auth.active_contexts`.
3. **Transaction $T_c$ is active and uncommitted.** It holds the row lock and is actively fetching questions.
4. Concurrently, Proctor initiates termination in a separate transaction $T_p$.
5. $T_p$ queries:
   ```sql
   SELECT backend_pid FROM uadue_auth.active_contexts WHERE exam_session_id = ...;
   ```
6. **Under standard PostgreSQL MVCC isolation (`READ COMMITTED` or `REPEATABLE READ`), transaction $T_p$ CANNOT SEE the uncommitted row inserted by $T_c$!**
7. Transaction $T_p$ observes **zero rows** in `active_contexts`.
8. Consequently, `terminate_candidate_session` terminates **nothing**. The candidate backend continues running, fetches projection rows, and commits without ever being signaled!
9. By the time $T_c$ executes `COMMIT` and its row in `active_contexts` becomes visible to other transactions, **the candidate transaction has already finished**, and the questions are already in Node.js memory!

```
Candidate Transaction (Tc)                    Proctor Transaction (Tp)
─────────────────────────                    ────────────────────────
1. BEGIN;                                    1. BEGIN;
2. INSERT INTO active_contexts (...)         2. Proctor calls terminate_candidate_session()
   [UNCOMMITTED ROW]                            • SELECT backend_pid FROM active_contexts
3. SELECT * FROM projections...                   WHERE exam_session_id = ...;
   [Tc actively running and locked]             =========================================
                                                ==> MVCC: Tp SEES ZERO ROWS! <===========
                                                =========================================
                                                • pg_terminate_backend terminates NOTHING!
4. COMMIT;                                   3. COMMIT;
   [Row becomes visible only now!]
```

### 4.2 Architectural Assessment: Policy Beta Unresolved Blocker `[D]`, `[E]`
To make Policy Beta function, the architecture would require either:
- **Autonomous Context Logging:** Writing the context record via an autonomous transaction (e.g. `dblink` or `pg_background`) outside $T_c$ before $T_c$ begins. This breaks single-connection transactional guarantees, adds connection overhead, and leaves orphaned context records if the application crashes.
- **System Lock Inspection:** Having the proctor query `pg_locks` to find backends holding locks on the specific tuple in `exam_sessions`. This requires complex catalog parsing and elevated privileges.
- **Architectural Verdict:** **Policy Beta is architecturally blocked by PostgreSQL MVCC transaction visibility.** Marked as **Critical Blocker `DEP-GOV-TERM-01`**.

---

## 5. Eight-State Data Exposure Model & Buffer Containment

### 5.1 The Eight (8) Discrete Data Exposure States `[C]`, `[D]`

To eliminate ambiguity between database state and network transmission, eight discrete states are defined:

```
[State 0: Unstarted] ──> No database query initiated.
         │
         ▼
[State 1: Executing] ──> Query executing on PostgreSQL engine; lock held.
         │
         ▼
[State 2: Node.js Buffered] ──> Projection rows returned across pgwire into Node.js RAM.
         │                      (Database transaction remains uncommitted!)
         ▼
[State 3: Commit in Flight] ──> 'COMMIT' sent to PostgreSQL; awaiting server ACK.
         │
         ▼
[State 4: Commit Confirmed] ──> CommandComplete('COMMIT') received; lock released.
         │
         ▼
[State 5: HTTP Unstarted] ──> Node.js holds confirmed data; zero HTTP bytes written.
         │
         ▼
[State 6: HTTP Streaming] ──> Response headers emitted; body bytes streaming across TCP.
         │
         ▼
[State 7: Completed] ──> Full response received and rendered in candidate browser.
```

### 5.2 Proctor Termination Impact Across All 8 States

| State ID | Operational Description | Proctor Termination Impact under Policy Alpha | Proctor Termination Impact under Policy Beta | Data Exposure Outcome |
| :---: | :--- | :--- | :--- | :---: |
| **State 0** | Query not started | Proctor acquires lock; session marked `TERMINATED`. | Session marked `TERMINATED`. | 🟢 **Zero Data Exposed** |
| **State 1** | Query executing on engine | Proctor queues behind candidate lock. | Backend killed via `SIGTERM`; tx aborted. | 🟢 **Zero Data Exposed** |
| **State 2** | Rows buffered in Node.js RAM | Proctor queues behind candidate lock. | Backend killed; tx aborted. Buffer scrapped in Node.js. | 🟢 **Zero Data Exposed** (Buffer discarded) |
| **State 3** | Commit in flight over socket | Proctor queues behind candidate lock. | Backend killed or commit resolves. Buffer scrapped if abort. | 🟢 **Zero Data Exposed** (if abort) |
| **State 4** | Commit confirmed by DB | Proctor update unblocks, applies `TERMINATED`. | Proctor applies `TERMINATED`. | 🟡 **Data Authorized Prior to Term** |
| **State 5** | HTTP unstarted in Node.js | Proctor updates session. Gateway aborts HTTP emission. | Proctor updates session. Gateway aborts HTTP emission. | 🟢 **Zero Data Exposed** (Pre-emission check) |
| **State 6** | HTTP chunks actively streaming | Data already in transit across network routers. | Data already in transit across network routers. | 🔴 **IRREVOCABLE EXPOSURE** |
| **State 7** | Client browser rendered | Data fully rendered on candidate screen. | Data fully rendered on candidate screen. | 🔴 **IRREVOCABLE EXPOSURE** |

### 5.3 The Point of Irrevocability ($T_{\text{http\_emit}}$) `[D]`
The physical boundary of data exposure occurs at **State 6 ($T_{\text{http\_emit}}$)**. Once the first TCP packet containing projection payload bytes leaves the network interface, **no database locking, backend termination, or application logic can recall the data**.

---

## 6. JavaScript Buffer Lifetime & Memory Erasure Limits

### 6.1 What Dereferencing Accomplishes vs What It Does Not `[C]`, `[D]`

In proposal v4.7, it was proposed that setting `projectionBuffer = null` upon transaction abort guarantees secure memory cleanup.  
**Adversarial Technical Correction (`[C]`):**  
In the V8 / Node.js JavaScript execution environment:
1. **What Setting `null` DOES Accomplish:**  
   - It removes the reference from the local execution frame.
   - It prevents the data from being passed to `res.json()`, `res.write()`, or downstream HTTP serialization handlers.
2. **What Setting `null` DOES NOT Accomplish:**  
   - **Zero Memory Wiping:** V8 does not zero-fill or overwrite freed memory. The raw UTF-8 strings, JSON object graphs, and byte arrays remain physically intact in V8 heap memory until the garbage collector reallocates those specific memory addresses.
   - **Garbage Collection Latency:** V8 garbage collection (Scavenge or Mark-Sweep) is nondeterministic. Sensitive data may linger in memory pages for seconds, minutes, or hours depending on heap allocation pressure.
   - **Buffer Duplication:** When `node-postgres` parses binary pgwire packets into JavaScript objects, strings are allocated in the V8 heap. These intermediate allocations cannot be manually scrubbed by application code.

### 6.2 Data-Minimization & Leak-Prevention Specification `[D]`

To enforce maximum security within V8 runtime constraints:
1. **Zero Logging Guarantee:** Application logging frameworks (e.g. Winston, Pino) must explicitly blacklist `projectionBuffer` and `res.rows`. No projection payload data may be written to console output, log files, or APM traces (Datadog/OpenTelemetry).
2. **Diagnostic Dump Exclusion:** In production environments, core dump generation on unhandled exceptions must be disabled (`--no-core-dump`) to prevent heap dumps containing exam questions from being written to disk.
3. **Ephemeral Scope Containment:** The buffer must remain strictly scoped to a single function block, preventing lingering references in global or module-level variables.

---

## 7. Backend Identity TOCTOU Race & Kernel Limits

### 7.1 The Inherent Kernel TOCTOU Gap `[C]`

In proposal v4.7, it was claimed that checking `(backend_pid, backend_start)` eliminates PID reuse races.  
**Adversarial Technical Correction (`[C]`):**  
A kernel-level **Time-of-Check to Time-of-Use (TOCTOU)** gap exists in PostgreSQL:
1. The PostgreSQL function queries `pg_stat_activity` and validates that `pid = 1234` has `backend_start = 2026-10-09 10:00:00.123456`.
2. In the exact nanoseconds between evaluating `pg_stat_activity` and executing `pg_terminate_backend(1234)`, backend 1234 exits.
3. The host operating system immediately spawns a new process (e.g., an ingestion worker or backup process) and assigns it PID 1234.
4. The PostgreSQL backend executes the C-level function `pg_terminate_backend()`, which internally calls:
   ```c
   kill(pid, SIGTERM);
   ```
5. The `kill()` system call takes an **integer PID only**. The operating system kernel knows nothing about PostgreSQL's `backend_start`!
6. The `SIGTERM` signal is delivered to the **new, unrelated process**!

### 7.2 Severity & Operating System Realities `[C]`, `[E]`
- **Real-World Probability:** Low, because modern operating systems recycle PIDs through thousands of process slots before wrapping.
- **Theoretical Security Reality:** Because `pg_terminate_backend` takes an integer PID and not a process handle or start timestamp, **a true atomic kernel-level binding does not exist in PostgreSQL's native API**. The TOCTOU window cannot be mathematically eliminated without OS-level process handles (such as Linux `pidfd_send_signal`).

---

## 8. Durable Idempotency & Ambiguous Commit Recovery

### 8.1 Why Ticket Ledger Insertion Does Not Equal Recoverable State `[C]`, `[D]`

In proposal v4.7, it was proposed that if `jti` exists in `consumed_tickets`, the gateway returns a cached projection.  
**Adversarial Technical Correction (`[D]`):**  
- Table `uadue_auth.consumed_tickets` stores strictly `(jti, expires_at)`.
- It stores **zero projection data**, zero session state, and zero receipt records.
- If a transaction committed `consumed_tickets` but the server crashed before generating or caching the response, or if the client connection dropped, **the gateway has no projection to return!**
- Checking `consumed_tickets` proves ticket consumption, **not** that a recoverable projection exists.

### 8.2 Proposed Durable Idempotency Ledger (`projection_access_receipts`) `[D]`

To guarantee deterministic, idempotent recovery without creating phantom projection access, a dedicated receipt ledger must be created:

```sql
CREATE TABLE uadue_delivery.projection_access_receipts (
    request_id          UUID PRIMARY KEY,     -- Client-supplied idempotency key
    exam_session_id     UUID NOT NULL REFERENCES public.exam_sessions(exam_session_id),
    tenant_id           UUID NOT NULL,
    candidate_id        UUID NOT NULL,
    ticket_jti          TEXT NOT NULL UNIQUE REFERENCES uadue_auth.consumed_tickets(jti),
    projection_status   TEXT NOT NULL CHECK (projection_status IN ('IN_PROGRESS', 'COMMITTED', 'ABORTED')),
    projection_digest   TEXT NOT NULL,        -- SHA-256 seal of the retrieved projection
    committed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON uadue_delivery.projection_access_receipts FROM PUBLIC, uadue_tenant_runtime;
```

### 8.3 Atomic Execution & Ambiguous Commit Protocol `[D]`

```
                          client.query('COMMIT') fails with network timeout
                                                │
                                                ▼
                                    Ambiguous Commit Recovery
                                                │
                           Query projection_access_receipts WHERE request_id = $1
                                                │
        ┌───────────────────────────────────────┼───────────────────────────────────────┐
        ▼                                       ▼                                       ▼
[Record Found: COMMITTED]             [Record Found: ABORTED / None]           [Record: IN_PROGRESS]
• Transaction definitely committed.    • Transaction definitely rolled back.   • Original query still running.
• Ticket consumption is valid.         • Ticket was unrolled.                  • Gateway waits on lock
• Gateway reconstructs projection      • Client may safely retry using           or yields until resolution.
  from authoritative storage.            fresh session ticket.
```

#### Rules of the Recovery Protocol:
1. **Single Transaction Atomicity:** The `INSERT INTO consumed_tickets` and `INSERT INTO projection_access_receipts` must occur inside the **exact same database transaction**. Either both commit, or both roll back.
2. **Authoritative Resolution:** The gateway must check `projection_access_receipts`, **never** relying on client memory or naked ticket presence.
3. **No Blind Re-Issuance:** If `request_id` has status `COMMITTED`, re-issuing a new ticket is strictly prohibited; the gateway returns the authoritative projection associated with the committed receipt.

---

## 9. Comprehensive Transaction and Connection Pool Lifecycle Matrix

| Scenario | Row Lock Held? | Rollback Required? | Safe to Return Socket to Pool? | Protected Data Returned? | Expected Caller-Visible Result |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **1. Connection Checkout Failure** | ❌ No | ❌ No | ❌ N/A (no socket) | ❌ No | 503 Service Unavailable |
| **2. Transaction Start Failure (`BEGIN`)** | ❌ No | ❌ No | 🔴 **Destroy Socket** (`release(err)`) | ❌ No | 500 Internal Database Error |
| **3. Role-Switch Failure (`SET LOCAL ROLE`)** | ❌ No | 🟢 **Yes** (`ROLLBACK`) | 🔴 **Destroy Socket** (`release(err)`) | ❌ No | 403 Forbidden (`ERR_ROLE_SWITCH_FAILED`) |
| **4. Context-Binding Failure (`bind_context`)**| ❌ Released on abort | 🟢 **Yes** (`ROLLBACK`) | 🔴 **Destroy Socket** (`release(err)`) | ❌ No | 403 Forbidden (`P0001`–`P0021`) |
| **5. Projection Query Timeout (`statement_timeout`)**| ❌ Auto-released | 🟢 **Yes** (Engine auto-aborts) | 🔴 **Destroy Socket** (`release(err)`) | ❌ No | 504 Gateway Timeout (`statement_timeout`) |
| **6. Lock Timeout (`lock_timeout`)** | ❌ Not acquired | 🟢 **Yes** (Engine auto-aborts) | 🔴 **Destroy Socket** (`release(err)`) | ❌ No | 504 Gateway Timeout (`lock_timeout`) |
| **7. Application Cancellation (`AbortSignal`)**| ❌ Auto-released | 🟢 **Yes** (Engine auto-aborts) | 🔴 **Destroy Socket** (Stream destroyed) | ❌ No | 499 Client Closed Request |
| **8. Client Disconnect (TCP RST / FIN)** | ❌ Engine auto-releases| 🟢 **Yes** (Engine auto-aborts) | 🔴 **Destroy Socket** (Stream destroyed) | ❌ No | Network Drop (Socket closed) |
| **9. Rollback Failure (`ROLLBACK` errors)** | ❌ Engine resets socket| ❌ Rollback failed | 🔴 **Destroy Socket** (`release(err)`) | ❌ No | 500 Internal Database Error |
| **10. Commit Failure (`COMMIT` errors)** | ❌ Released on error | 🟢 Engine auto-aborts | 🔴 **Destroy Socket** (`release(err)`) | ❌ No | 500 Commit Aborted (Ambiguous outcome) |
| **11. Successful Execution & Release** | ❌ Released on COMMIT | ❌ No (Committed) | 🟢 **Yes** (`client.release()`) | 🟢 **Yes** | 200 OK (Projection delivered) |

---

## 10. Authoritative Adversarial Test Inventory (67 Scenarios)

The test inventory is formally expanded to sixty-seven (67) comprehensive scenarios covering all lock-ordering branches, buffer leaks, ambiguous commits, MVCC context invisibility, and TOCTOU races. **All 67 scenarios remain completely unexecuted (`[B]`):**

| Test ID Range | Test Category & Objectives | Specified? | Authored? | Executed? | Passed? | Review Status |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **ADV-01 – ADV-18** | Core Ticket Claims, Seals, Replay & Privilege Escalation | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-19 – ADV-30** | Timeout Unwinds, Driver Internals, Socket Teardown & Buffering | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-31 – ADV-42** | Tuple Lock Arrival Skew, Role Memberships & Ambiguous Commits | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-43 – ADV-54** | API vs DB Skew, Buffer Scrapping, PID Reuse & Cross-Tenant Preemption | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-55 – ADV-67** | MVCC Visibility Paradox, Buffer Memory Leaks, TOCTOU & Receipt Atomicity | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |

*New Scenarios Added in v4.8:*
- `ADV-55`: Proctor termination requested while results are buffered in Node.js memory before `COMMIT` (Buffer discarded, HTTP response prevented).
- `ADV-56`: Proctor termination requested after `COMMIT` acknowledged but before HTTP response emitted (State 5 preemption).
- `ADV-57`: Proctor termination requested during active HTTP response chunk transmission (State 6 transmission boundary).
- `ADV-58`: Buffer reference dereferencing (`null`) memory leak / diagnostic dump isolation audit.
- `ADV-59`: Stale context record with OS PID reuse; backend termination skipped.
- `ADV-60`: Target backend identity changes or terminates during validation query.
- `ADV-61`: **Uncommitted `active_contexts` row invisible to concurrent proctor transaction (MVCC visibility failure).**
- `ADV-62`: Context table cleanup after unexpected transaction rollback and pool reuse.
- `ADV-63`: Consumed ticket row present without a corresponding durable operation record.
- `ADV-64`: Database transaction committed successfully, but Node.js process crashes before HTTP delivery.
- `ADV-65`: Ambiguous `COMMIT` retry while original transaction is still in-flight on server.
- `ADV-66`: Concurrent retries for identical client `request_id`.
- `ADV-67`: Atomic coupling failure between ticket consumption and operation receipt persistence.

---

## 11. Preservation of All Frozen Phase 3 Governance Contracts

The following frozen Phase 3 governance baselines remain strictly locked:
1. **Phase 3.5 Raw-Score-Only Contract:** Zero modifications to scoring formulas, evaluation DAGs, or candidate scoring dispute tables.
2. **Phase 3.6 ACTIVE-Only Tier 3 Projection:** Question projection retrieval is restricted strictly to sessions with `session_state == 'ACTIVE'`.
3. **Zero Question-Viewing Grace:** Deadline calculations permit strictly zero question-viewing grace.
4. **Submission Transport Grace:** 15-second grace window applies strictly to answer ingestion events (`candidate_submission_events`).
5. **`EXAM:SOLUTION_AUDIT` Capability Contract:** Post-exam answers and solutions released strictly after administrative result release.
6. **`AP-DEC-013`:** Assessment policy rules strictly preserved; zero autonomous AI/LLM conversions permitted.
7. **Tenant Isolation & Quarantine Restrictions:** Unresolved `DEP-T4-ANS-01`, `GOV-04`, and `DEP-GOV-TERM-01` maintained.

---

## 12. Deliverable & Final Implementation Gate

### 12.1 Repository Evidence Examined
- [`web/src/services/uadue/delivery/deliveryPostgresAdapter.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/deliveryPostgresAdapter.ts) (Lines 62–125): Confirmed silent error swallowing in `SET LOCAL ROLE`.
- [`web/src/services/uadue/delivery/sessionOrchestrator.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/sessionOrchestrator.ts) (Lines 135–902): Confirmed all 9 session writer methods use `SELECT ... FOR UPDATE` and zero writers acquire advisory locks.
- [`web/package.json`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/package.json) (Lines 36, 41): Confirmed `pg: ^8.23.0` dependency.
- [`supabase/migrations/20261007_uadue_phase2d8_canonical.sql`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase2d8_canonical.sql) (Lines 115–370): Confirmed 6 unprotected child tables and blanket `ALL PRIVILEGES` to `uadue_app_user`.
- [`supabase/migrations/20261007_uadue_phase3_database_foundation.sql`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase3_database_foundation.sql) (Lines 18–307): Confirmed session table schema and duplicate blanket role grants.

### 12.2 Confirmed Defects & Unverified Assumptions
- **Confirmed Defect 1:** `deliveryPostgresAdapter.ts` swallows `SET LOCAL ROLE` failures, executing transactions as physical superuser.
- **Confirmed Defect 2:** In migrations, `uadue_app_user` holds blanket `ALL PRIVILEGES` across all tables, functions, and sequences.
- **Confirmed Architecture Blocker:** Table-based backend signaling in Policy Beta is defeated by PostgreSQL MVCC transaction visibility (uncommitted candidate context rows are invisible to concurrent proctors).
- **Unverified Assumption 1 (`[F]`):** Live deployment Supabase database credentials and role hierarchy.
- **Unverified Assumption 2 (`[F]`):** Target deployment availability of `pg_sodium` extension.

### 12.3 Product Owner Decisions Still Required
1. **Resolution of Termination Architecture (`DEP-GOV-TERM-01`):** Formally reject Policy Beta due to MVCC context invisibility and kernel TOCTOU limits, approving Policy Alpha (Transactional Mutual Exclusion with Bounded Queuing).
2. **Authorization of Database Role & RLS Migration Phase (`DEP-SEC-CHILD-01`, `DEP-SEC-GUC-01`):** Authorize stripping `uadue_app_user` of blanket privileges, creating `uadue_tenant_runtime`, and applying RLS to the six child tables.

### 12.4 Final Implementation Gate Verdict

| Evaluation Dimension | Current Assessment | Gate Verdict |
| :--- | :--- | :---: |
| **Termination-Ordering Consistency**| Reconciled API arrival skew vs database row-lock priority; 11 timestamps mapped. | 🟢 **PASS (Design)** |
| **Application Buffer Isolation** | Multi-statement memory buffer leak analyzed; post-commit emission contract defined. | 🟢 **PASS (Design)** |
| **Policy Beta Architecture** | Defeated by PostgreSQL MVCC visibility paradox and kernel TOCTOU limits. | 🔴 **BLOCKED** |
| **Durable Idempotency Ledger** | Atomic `projection_access_receipts` ledger specified for ambiguous commit recovery. | 🟢 **PASS (Design)** |
| **Fail-Closed Role Boundary** | Defect confirmed in `deliveryPostgresAdapter.ts`; fail-closed abort and eviction specified; unmigrated. | 🔴 **BLOCKED** |
| **Child-Table RLS Completeness** | Six child tables audited; least-privilege inventory complete; migrations unapplied. | 🔴 **BLOCKED** |
| **Cryptographic Byte Verification**| Raw canonical byte pipeline formalized; test suite unexecuted. | 🔴 **UNCERTIFIED** |
| **Replay Matrix & Retention** | Dual-branch race model and 5-minute post-expiry pruning formalized. | 🟢 **PASS (Design)** |
| **Projection Contract Alignment** | Authoritative `EXAM:SOLUTION_AUDIT` preserved; live projection gated strictly to `ACTIVE`. | 🟢 **PASS** |

### **Overall Gate: 🔴 RED — Implementation and Candidate-Facing Integration Strictly Blocked**

**Summary for Gatekeeper:**  
Proposal v4.8 exposes the fatal MVCC transaction visibility paradox in Policy Beta, proving that uncommitted context rows cannot be seen by concurrent proctors seeking to signal backends. It deconstructs Node.js memory buffering across eight discrete states, disproves the claim that pointer nullification equals memory erasure, and replaces naked ticket checks with an atomic durable receipt ledger (`projection_access_receipts`) for ambiguous commit recovery. Because role migrations, RLS policies, and all 67 adversarial test scenarios remain unapplied and unexecuted, the overall gate remains strictly **🔴 RED**. Exactly zero application source files were modified, zero migrations were applied, and zero tests were executed.
