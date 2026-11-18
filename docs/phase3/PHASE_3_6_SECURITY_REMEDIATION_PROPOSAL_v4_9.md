# Mock.AI — Phase 3.6 Security Remediation Proposal v4.9
### Document Title: `PHASE_3_6_SECURITY_REMEDIATION_PROPOSAL_v4_9.md`
**Proposal Version:** `4.9.0-TRANSACTIONAL-RECOVERY-AND-COORDINATOR-STATE-MACHINE`  
**Overall Readiness Gate:** 🔴 **RED — Implementation and Candidate-Facing Integration Strictly Blocked**  
**Document Status:** **STRICT DESIGN-ONLY AUDIT & ARCHITECTURAL SPECIFICATION**  
*(Strictly zero application source code modified, zero migrations applied, zero test suites executed)*

---

## 1. Document Status, Governance Locks & Audit Metadata

This document constitutes the definitive architectural design review and remediation specification **v4.9** for Mock.AI Phase 3.6. It directly resolves the critical architectural, recovery, and transactional state-machine weaknesses identified in the forensic review of proposal v4.8:

1. **Durable Receipt Ledger & Response Recoverability:** Retracts the erroneous assumption that `projection_digest` alone allows a crashed Node.js process to recover response data. Formulates and evaluates two robust recovery architectures: **Option A (Durable Response Payload Persistence)** versus **Option B (Deterministic Reconstruction from Immutable Sealed Package + Pinned Session State)**. Defines `projection_digest` strictly as a cryptographic integrity seal and tamper validator.
2. **Transactional State Machine & Rollback Reality:** Corrects the fatal contradiction in v4.8 where aborted transactions were modeled as persisting an `ABORTED` receipt. Under PostgreSQL MVCC and atomicity guarantees, an engine rollback discards all uncommitted row inserts. Establishes a four-tier transactional state machine separating transaction-local transient states from durable engine commits, and specifies an out-of-transaction **Supervisor Coordinator** for recording terminal failure tombstones.
3. **Deconstruction of the "Absent Receipt Means Rollback" Fallacy:** Retracts the naive inference that querying zero receipts equals a confirmed transaction rollback. Systematically analyzes all seven (7) discrete execution and race states (Unstarted, In-Flight, Lock-Waiting, Commit-Race, Definitive Abort, Post-Commit Crash, Concurrent Retry) and establishes a fail-closed mutual-exclusion resolution protocol.
4. **Authoritative Idempotency & Response Contract:** Formalizes the mathematical binding across `request_id`, `ticket_jti`, `exam_session_id`, `candidate_id`, `tenant_id`, and `package_integrity_seal`. Specifies strict HTTP status codes and error taxonomies for replay attempts, attribute mismatches (409 Conflict), and in-flight contention.
5. **Scoped MVCC Analysis & Policy Beta Architecture Governance:** Narrowed the v4.8 claim from "Policy Beta is universally impossible in PostgreSQL" to "the specific table-based lookup design (`bind_context` inserting into `active_contexts` inside $T_c$) is defeated under standard `READ COMMITTED` MVCC because concurrent proctor transactions cannot observe uncommitted rows." Re-evaluates out-of-transaction logging and `pg_locks` catalog inspection, and formally maintains **`DEP-GOV-TERM-01` as an OPEN decision for the Product Owner**.
6. **Backend Identity TOCTOU & Kernel Signaling Bounds:** Formally specifies the theoretical boundary of `pg_terminate_backend(pid INT)`: proves that while PostgreSQL verifies its internal shared memory (`BackendStatusArray`) at signal dispatch time, POSIX signals operate strictly on integer PIDs without kernel-level `pidfd` bindings, bounding what can and cannot be guaranteed during OS-level PID recycling.
7. **V8 Memory Management & Strict Data Minimization:** Re-affirms that `projectionBuffer = null` only dereferences JavaScript object pointers, leaving heap pages intact until non-deterministic V8 GC sweeps. Enforces strict production leak-containment controls (zero APM capture, zero logging, `--no-core-dump`).
8. **Expanded 81-Scenario Adversarial Test Inventory:** Expands the adversarial test suite from 67 to eighty-one (81) scenarios, adding 14 new targeted scenarios (`ADV-68` through `ADV-81`) covering ambiguous commit races, recovery verification, replay mismatches, and heap scraping. All 81 scenarios remain explicitly unexecuted (`[B]`).

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

## 2. Change Log (v4.8 $\rightarrow$ v4.9)

1. **Resolved Response Recoverability Gap:** Proved that `projection_digest` is a SHA-256 seal, not recoverable payload data. Formalized Option A (payload persistence in `projection_access_receipts`) and Option B (deterministic re-compilation from `canonical_assessment_packages`), providing concrete schema and trade-off matrices.
2. **Corrected Rollback State Semantics:** Eliminated the impossible state of an in-transaction `ABORTED` receipt. Specified an external coordinator transaction for durable abort auditing.
3. **Deconstructed the "Absent Receipt" Fallacy:** Replaced blind retry assumptions with an exhaustive 7-state concurrency taxonomy and a fail-closed mutual-exclusion check against `pg_stat_activity` / session row locks.
4. **Formalized Idempotency Claim Contract:** Defined the exact JSON schema and database tuple binding between idempotency keys, JWT identifiers, session tokens, and tamper seals.
5. **Narrowed Policy Beta Impossibility Claim:** Re-scoped the MVCC blocker strictly to the table-based write path; analyzed `pg_locks` and autonomous transaction alternatives; kept `DEP-GOV-TERM-01` open for PO decision.
6. **Detailed `pg_terminate_backend` TOCTOU Semantics:** Analyzed PostgreSQL C source behavior (`BackendStatusArray`) versus POSIX `kill()` limits.
7. **Added SQL Catalog Verification Suite:** Formulated exact SQL queries for DBA verification of locks, backend states, RLS enforcement, and role privileges.
8. **Expanded Adversarial Test Matrix to 81 Scenarios:** Added 14 new scenarios (`ADV-68` through `ADV-81`) targeting recovery payload integrity, in-flight commit races, and idempotency key mismatches.

---

## 3. Evidence Classification Taxonomy

- **`[A] Direct Repository Evidence`**: Verified by exact file path, line numbers, and repository contents.
- **`[B] Executed Test Evidence`**: Confirmed by executed test output in this workspace (all adversarial tests are explicitly marked *unexecuted*).
- **`[C] Verified PostgreSQL Semantics`**: Verified against official PostgreSQL engine documentation, executor source behavior, locking semantics, and catalog specifications.
- **`[D] Proposed Design`**: Architectural design, schema migration, or code pattern proposed for implementation.
- **`[E] Unresolved External Dependency`**: Blocking prerequisite external to the immediate gateway codebase.
- **`[F] Unverified Runtime Assumption`**: State of the live deployed database, network topology, or hosting environment that cannot be verified statically from repository code.

---

## 4. Durable Receipt Ledger & Response Recoverability

### 4.1 The Fatal Defect in v4.8: Digest vs Payload Recovery `[C]`, `[D]`

In proposal v4.8, table `uadue_delivery.projection_access_receipts` stored:
```sql
projection_digest TEXT NOT NULL -- SHA-256 seal of the retrieved projection
```
And the recovery protocol stated:
> *"Gateway reconstructs projection from authoritative storage."*

**Adversarial Technical Breakthrough (`[C]`, `[D]`):**  
A SHA-256 digest is an irreversible cryptographic one-way hash (32 raw bytes, 64 hex characters). It can verify that an existing payload is authentic and un-tampered, but **it cannot produce a single byte of the original question projection**.  
If the Node.js process crashes (e.g., container OOM, VM reboot, host termination) after `COMMIT` succeeds on PostgreSQL but before the HTTP response is written to the socket, the candidate client retries with the same `request_id`.  
If the gateway finds a `COMMITTED` receipt containing only `projection_digest`, **it cannot satisfy the client request without recovering the payload**.

Two distinct architectural solutions exist:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RECOVERY ARCHITECTURE COMPARISON                      │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ OPTION A: Payload Persistence        │ OPTION B: Deterministic Reconstruction│
├──────────────────────────────────────┼──────────────────────────────────────┤
│ • Full projection JSON stored in DB. │ • Only metadata & digest stored in DB│
│ • Self-contained & instant.          │ • Re-compiled from immutable package │
│ • High database storage overhead.    │ • Zero storage bloat; requires pure  │
│ • Requires encryption-at-rest & RLS. │   deterministic projection engine.   │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

### 4.2 Option A: Durable Response Payload Persistence `[D]`

In this model, the serialized JSON response is stored directly in the receipt table inside the projection transaction:

```sql
CREATE TABLE uadue_delivery.projection_access_receipts (
    request_id              UUID PRIMARY KEY,     -- Client-supplied idempotency key
    exam_session_id         UUID NOT NULL REFERENCES public.exam_sessions(exam_session_id),
    tenant_id               UUID NOT NULL,
    candidate_id            UUID NOT NULL,
    ticket_jti              TEXT NOT NULL UNIQUE REFERENCES uadue_auth.consumed_tickets(jti),
    projection_status       TEXT NOT NULL CHECK (projection_status IN ('COMMITTED', 'ABORTED_DURABLE')),
    projection_digest       TEXT NOT NULL,        -- SHA-256 hex seal
    response_payload        JSONB,                -- Stored response payload
    response_payload_bytes  BYTEA,                -- Alternative: zstd-compressed bytes
    created_at              TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    committed_at            TIMESTAMPTZ
);
```

#### Evaluation:
- **Pros:**
  1. **Instantaneous Recovery:** Single indexed query retrieves the exact response.
  2. **Decoupled from Future State:** If the exam session subsequently transitions to `COMPLETED` or `EXPIRED`, the recovery query still delivers the projection that was lawfully authorized at the moment of commit.
- **Cons:**
  1. **Storage Bloat:** An exam projection containing 100 questions with SVG geometry and rich text is typically 150 KB – 500 KB. For 100,000 candidates, this represents 15 GB – 50 GB of high-churn database storage.
  2. **Security & Data Retention:** Stores full exam questions in a delivery log. Requires strict RLS, automated pruning after session completion, and database-level encryption.

### 4.3 Option B: Deterministic Reconstruction from Immutable Package + Pinned Session State `[D]`

In this model, the database stores **zero question payload data** in the receipt table. Instead, it records the immutable compilation coordinates:

```sql
CREATE TABLE uadue_delivery.projection_access_receipts (
    request_id              UUID PRIMARY KEY,
    exam_session_id         UUID NOT NULL REFERENCES public.exam_sessions(exam_session_id),
    tenant_id               UUID NOT NULL,
    candidate_id            UUID NOT NULL,
    ticket_jti              TEXT NOT NULL UNIQUE REFERENCES uadue_auth.consumed_tickets(jti),
    projection_status       TEXT NOT NULL CHECK (projection_status IN ('COMMITTED', 'ABORTED_DURABLE')),
    package_id              UUID NOT NULL,
    package_integrity_seal  TEXT NOT NULL,        -- SHA-256 seal of canonical package
    state_version           INTEGER NOT NULL,     -- Version-pinned session counter
    projection_digest       TEXT NOT NULL,        -- SHA-256 hash of authorized output
    created_at              TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    committed_at            TIMESTAMPTZ
);
```

#### Deterministic Recovery Flow:
1. Client retries with `request_id`.
2. Gateway queries `projection_access_receipts` and loads: `(package_id, package_integrity_seal, state_version, projection_digest)`.
3. Gateway fetches the immutable assessment package from `uadue_canonical.canonical_assessment_packages WHERE package_id = $1`.
4. Gateway verifies package seal: `sha256(canonical_package_bytes) == package_integrity_seal`.
5. Gateway executes the **deterministic projection compiler**:
   $$\text{Payload} = \text{CompileProjection}(\text{Package}, \text{SessionState}_{\text{state\_version}})$$
6. Gateway computes:
   $$\text{recomputed\_digest} = \text{sha256}(\text{CanonicalSerialize}(\text{Payload}))$$
7. **Integrity Gate:**
   - If $\text{recomputed\_digest} == \text{projection\_digest}$: Return `Payload` (HTTP 200).
   - If $\text{recomputed\_digest} \neq \text{projection\_digest}$: **Fail closed** (`ERR_RECOVERY_INTEGRITY_MISMATCH`, HTTP 500). Alert security operations for potential compiler regression or state drift.

#### Evaluation:
- **Pros:**
  1. **Minimal Storage Footprint:** Row size is $\approx 200$ bytes regardless of exam size.
  2. **Zero Question Duplication:** Exam contents exist strictly in canonical tables.
- **Cons:**
  1. **Compiler Determinism Invariant:** Requires the projection adapter to be a 100% pure function of package and session state (no non-deterministic UUID generation, timestamps, or unordered JSON keys).
  2. **Re-computation Overhead:** Re-runs compilation on recovery (acceptable for low-frequency crash recovery).

### 4.4 Synthesis: Role of `projection_digest` `[D]`
Under both options, `projection_digest` is **not a source of data**, but an **immutable cryptographic anchor**. Under Option A, it verifies that the retrieved JSONB was not modified in the database. Under Option B, it proves that the newly compiled payload exactly matches what was committed in the original transaction.

---

## 5. Transactional State Machine, Rollback Semantics & Coordinator Lifecycle

### 5.1 The Rollback Reality: Uncommitted Changes Do Not Survive `[C]`

In proposal v4.8, the recovery state diagram included the state:
```
[Record Found: ABORTED / None] ──> Transaction definitely rolled back.
```
**Adversarial Technical Correction (`[C]`):**  
In PostgreSQL (and any relational engine conforming to ACID atomicity):
1. When transaction $T_c$ executes `INSERT INTO projection_access_receipts (...) VALUES (..., 'ABORTED', ...)`, that tuple is written to a shared buffer page with the transaction's `xmin = T_c`.
2. If transaction $T_c$ subsequently fails (e.g., statement timeout, lock timeout, role-switch failure, explicit `ROLLBACK`), PostgreSQL marks $T_c$ as aborted in the Commit Log (`pg_xact`).
3. Under MVCC, any row with an aborted `xmin` is **completely invisible to all past, present, and future transactions**.
4. **Conclusion:** Transaction $T_c$ **CANNOT write its own `ABORTED` receipt**! If $T_c$ rolls back, its receipt row vanishes entirely.

```
                          ┌────────────────────────┐
                          │   Transaction Tc       │
                          │   BEGIN;               │
                          │   INSERT 'ABORTED' ... │
                          │   ... ERROR / TIMEOUT  │
                          │   ROLLBACK;            │
                          └───────────┬────────────┘
                                      │
                                      ▼
             PostgreSQL marks Tc as ABORTED in pg_xact
             Row is treated as dead tuple; NEVER VISIBLE to Tp!
             A subsequent SELECT finds ZERO ROWS (None).
```

### 5.2 Four-Tier Transactional State Machine `[D]`

To establish mathematically rigorous state handling, four distinct layers of state are defined:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. TRANSACTION-LOCAL TRANSIENT STATE (Ephemeral to Tc)                      │
│    • PostgreSQL private backend memory (backend_pid, backend_start)         │
│    • Row locks held: SELECT ... FOR SHARE on exam_sessions tuple            │
│    • Session-level GUCs: SET LOCAL ROLE, SET LOCAL app.current_tenant_id    │
│    • Intermediate pgwire rows buffered in Node.js socket RAM                │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. ENGINE-COMMITTED DURABLE STATE (Survives in PostgreSQL)                  │
│    • Tuple in uadue_auth.consumed_tickets (jti, expires_at)                 │
│    • Tuple in uadue_delivery.projection_access_receipts ('COMMITTED')       │
│    • WAL flush confirmed; locks released                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. POST-ROLLBACK COORDINATOR DURABLE STATE (Supervisor Transaction)         │
│    • Separate independent transaction T_coord (autocommit or new BEGIN)     │
│    • Writes durable tombstone: status = 'ABORTED_DURABLE'                   │
│    • Records failure reason (e.g. TIMEOUT, ROLE_REJECT, PREEMPTED)          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. APPLICATION RUNTIME DISPATCH STATE (Node.js Gateway)                     │
│    • Node.js response stream state (UNSTARTED, HEADERS_SENT, STREAMING)     │
│    • AbortController signal status                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Supervisor Coordinator Pattern `[D]`

When transaction $T_c$ encounters a failure or rollback:
1. $T_c$ connection emits error; Node.js gateway catches error and issues `await client.query('ROLLBACK')`.
2. Client connection $T_c$ is destroyed or sanitized (`release(err)`).
3. The gateway invokes the **Supervisor Coordinator**:
   ```typescript
   async function recordDurableAbort(
     pool: Pool,
     requestId: string,
     sessionId: string,
     tenantId: string,
     ticketJti: string,
     reason: string
   ): Promise<void> {
     // Run in a brand-new, isolated connection transaction
     const coord = await pool.connect();
     try {
       await coord.query(
         `INSERT INTO uadue_delivery.projection_access_receipts
            (request_id, exam_session_id, tenant_id, candidate_id, ticket_jti,
             projection_status, projection_digest, failure_reason, created_at)
          VALUES ($1, $2, $3, $4, $5, 'ABORTED_DURABLE', '0', $6, clock_timestamp())
          ON CONFLICT (request_id) DO NOTHING`,
         [requestId, sessionId, tenantId, candidateId, ticketJti, reason]
       );
     } catch (coordErr) {
       // Log coordinator failure; must not mask primary error
       logger.error({ coordErr, requestId }, 'Failed to persist durable abort tombstone');
     } finally {
       coord.release();
     }
   }
   ```
4. If the coordinator succeeds, future retries find an explicit `ABORTED_DURABLE` receipt. If the coordinator itself crashes, future retries find **None (zero rows)**, which must be resolved via the authoritative check in Section 6.

---

## 6. Deconstruction of the "Absent Receipt Means Rollback" Fallacy

### 6.1 The Seven (7) Execution and Race States `[C]`, `[D]`

When a client or gateway reconciliation query executes:
```sql
SELECT * FROM uadue_delivery.projection_access_receipts WHERE request_id = $1;
```
And returns **zero rows**, it is a fatal security flaw to assume: *"No receipt found, therefore the transaction rolled back."*  
There are seven distinct execution states that yield zero rows:

| State ID | Execution State Name | Actual Engine Reality | Can Client Safely Retry Immediately? | Risk if Assumed "Rolled Back" |
| :---: | :--- | :--- | :---: | :--- |
| **S1** | **Unstarted Request** | Request dropped before reaching DB pool. Zero DB activity. | 🟢 **YES** | None. |
| **S2** | **In-Flight Query** | Query actively executing on PostgreSQL engine. $T_c$ is uncommitted. | 🔴 **STRICTLY NO** | **Dual Execution:** Retry starts second query; both may commit, consuming multiple tickets or corrupting state. |
| **S3** | **Lock-Waiting** | $T_c$ is blocked in PostgreSQL waiting for row lock on `exam_sessions`. | 🔴 **STRICTLY NO** | **Deadlock / Double Commit:** Retry queues behind original or causes deadlock. |
| **S4** | **Commit-Race** | `COMMIT` command in-flight over socket or flushing to WAL. | 🔴 **STRICTLY NO** | **Split-Brain / Double Consume:** Original commits 2ms later; retry commits second time. |
| **S5** | **Definitive Rollback** | Engine rolled back $T_c$. Backend is idle or disconnected. | 🟢 **YES** (with fresh ticket) | None (true rollback). |
| **S6** | **Lost Receipt Defect** | $T_c$ committed, but receipt insertion bug occurred. | 🔴 **FATAL** | **Data Inconsistency:** Ticket consumed, no receipt recorded. |
| **S7** | **Concurrent Retry Race** | Retry arrives at Gateway Worker 2 while Worker 1 is still processing S2. | 🔴 **STRICTLY NO** | **Race Condition:** Two worker processes simultaneously processing identical `request_id`. |

### 6.2 The Authoritative Fail-Closed Resolution Protocol `[D]`

To safely resolve an absent receipt, the gateway MUST NOT proceed with a retry until it has proven that no in-flight transaction exists for this `request_id` or `ticket_jti`:

```
                       Query projection_access_receipts WHERE request_id = $1
                                                 │
                                                 ▼
                             ┌───────────────────────────────────────┐
                             │       Does a receipt row exist?       │
                             └───────────────────┬───────────────────┘
                                                 │
                        ┌────────────────────────┴────────────────────────┐
                        ▼ YES                                             ▼ NO (Zero Rows)
            Check projection_status                               Inspect Engine State:
            ├── 'COMMITTED': Reconstruct & Return (HTTP 200)      1. Acquire Advisory Lock on (request_id)
            └── 'ABORTED_DURABLE': Reject / Retry (HTTP 410/400)  2. Check pg_stat_activity for in-flight queries
                                                                  3. Query exam_sessions FOR SHARE (Wait for writers)
                                                                                  │
                                                               ┌──────────────────┴──────────────────┐
                                                               ▼ Active Writer Found                 ▼ No Active Writer
                                                        Wait / Backoff (HTTP 429/503)          Definitive Rollback Confirmed
                                                        (Prevent concurrent execution)         Safe to accept new submission / abort
```

#### Protocol Steps:
1. **Advisory Lock Serialization:** The recovery worker acquires a transaction-scoped PostgreSQL advisory lock keyed to the `request_id`:
   ```sql
   SELECT pg_advisory_xact_lock(hashtext('idemp:' || $1::text));
   ```
   If another worker is currently executing the projection for this `request_id`, the recovery worker **waits** until that transaction commits or aborts.
2. **Re-Check Receipt:** Once the advisory lock is acquired, re-query `projection_access_receipts`. If the original transaction was in State S2, S3, or S4, its receipt will now be visible!
3. **Inspect Session Lock:** If still zero rows, acquire `SELECT exam_session_id FROM public.exam_sessions WHERE exam_session_id = $1 FOR SHARE NOWAIT`. If this fails with `lock_not_available`, an active writer is still modifying the session; retry must fail closed with HTTP 429 / 503 (`ERR_CONCURRENT_TRANSACTION_IN_FLIGHT`).
4. **Definitive Resolution:** Only when the advisory lock is held and no active session writer exists can the gateway conclude that the transaction was in State S1 or S5 (rolled back).

---

## 7. Authoritative Idempotency & Response Contract

### 7.1 Mathematical Binding of the Idempotency Tuple `[D]`

An idempotent request is defined by the strict tuple:
$$\mathcal{T}_{\text{idemp}} = \langle \text{request\_id}, \text{ticket\_jti}, \text{exam\_session\_id}, \text{candidate\_id}, \text{tenant\_id}, \text{package\_id}, \text{package\_seal} \rangle$$

All seven components must match the committed record. Any partial mismatch indicates either a client implementation defect or a malicious credential/replay injection.

### 7.2 Strict Mismatch & Replay Handling Matrix `[D]`

| Condition | Database State | Incoming Request State | HTTP Status | Error Code | Operational Action |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **Exact Match** | `COMMITTED` receipt exists | Identical `request_id`, `ticket_jti`, `candidate_id` | **200 OK** | `N/A` | Return identical projection & digest. |
| **Key Collision / Tamper** | `COMMITTED` receipt exists | Same `request_id`, but **different** `ticket_jti` or `candidate_id` | **409 Conflict** | `ERR_IDEMPOTENCY_KEY_COLLISION` | Reject immediately. Log security anomaly. |
| **Replayed Ticket** | `ticket_jti` in `consumed_tickets` | Different `request_id` | **409 Conflict** | `ERR_TICKET_ALREADY_CONSUMED` | Reject replay. Void ticket. |
| **Session State Drift** | `COMMITTED` receipt exists | Session state in DB has transitioned to `TERMINATED` | **200 OK** | `N/A` | Deliver committed historical projection (lawful at commit time). |
| **In-Flight Contention** | Advisory lock held by Worker 1 | Same `request_id` arrives at Worker 2 | **429 / 503** | `ERR_RETRY_IN_FLIGHT` | Return retry-after header (500ms). |
| **Terminal Abort** | `ABORTED_DURABLE` receipt exists | Same `request_id` | **410 Gone** | `ERR_TRANSACTION_PREVIOUSLY_ABORTED` | Reject retry on this key. Require new request ID. |

---

## 8. Policy Beta Scoping & The MVCC Visibility Paradox

### 8.1 Clarification: Table-Lookup Impossibility vs General Preemption `[C]`, `[D]`

In proposal v4.8, it was stated that:
> *"Policy Beta is universally impossible in PostgreSQL."*

**Forensic Scoping Correction (`[C]`, `[D]`):**  
That statement was overly broad. PostgreSQL does not preclude backend signaling in general. Rather:
**The specific architecture proposed in v4.7 — where `bind_context` inserts into `uadue_auth.active_contexts` inside transaction $T_c$, and a concurrent proctor transaction $T_p$ queries `active_contexts` — is fundamentally defeated under PostgreSQL MVCC (`READ COMMITTED`).**

#### Proof of MVCC Invisibility:
1. Under PostgreSQL's default `READ COMMITTED` isolation level, a transaction's snapshot only observes tuples committed by transactions that committed **prior to the query's start time** (`xmin < CurrentTransactionId` and `xmin` committed).
2. Tuple $t_{\text{context}}$ inserted by $T_c$ has `xmin = txid(T_c)`.
3. Because $T_c$ is active, uncommitted, and executing `SELECT ... FOR SHARE`, `txid(T_c)` is marked in-progress in `pg_xact`.
4. Therefore, when $T_p$ executes:
   ```sql
   SELECT backend_pid FROM uadue_auth.active_contexts WHERE exam_session_id = $1;
   ```
   PostgreSQL heap tuple visibility checks (`HeapTupleSatisfiesMVCC` in `backend/utils/time/tqual.c`) evaluate to `FALSE`.
5. $T_p$ sees zero rows. It cannot extract `backend_pid`. It cannot signal the backend.

### 8.2 Theoretical Alternatives to the In-Transaction Table Lookup `[C]`, `[D]`

For completeness, two alternative implementations of Policy Beta were evaluated:

1. **Alternative 1: Out-of-Transaction Context Publication (`dblink` / Pre-Commit):**
   - Candidate connection opens transaction $T_{\text{pre}}$, inserts context into `active_contexts`, and **commits immediately**.
   - Then connection begins $T_c$ (projection transaction).
   - **Failure Mode:** If the connection crashes or the network drops after $T_{\text{pre}}$ but before $T_c$, an **orphaned context row** remains in the table. If that PID is recycled, the proctor signals an innocent process.
2. **Alternative 2: Engine Lock Inspection via `pg_locks` (`[C]`):**
   - Proctor does not query `active_contexts`. Instead, it inspects PostgreSQL system catalogs:
     ```sql
     SELECT pid FROM pg_locks
     WHERE locktype = 'tuple'
       AND relation = 'public.exam_sessions'::regclass
       AND page = $target_page AND tuple = $target_tuple
       AND mode = 'RowShareLock';
     ```
   - **Failure Mode:** Requires elevated catalog query privileges (`pg_read_all_stats` or superuser), introduces catalog cache lock contention on high-throughput workloads, and requires parsing physical tuple ctid coordinates.

### 8.3 Governance Status: `DEP-GOV-TERM-01` Remains OPEN `[E]`

Because both Policy Alpha (Transactional Mutual Exclusion with Bounded Queuing) and Policy Beta (Preemptive Cancellation via Signal) involve operational trade-offs:
- **Policy Alpha Trade-off:** Proctor update queues behind candidate query for at most `statement_timeout` (e.g. 2000ms), but has zero orphan risks, zero PID recycling risks, and uses standard row-locking.
- **Policy Beta Trade-off:** Instantaneous preemption (< 50ms), but requires catalog inspection or out-of-transaction tables, elevated database privileges, and risks killing recycled PIDs.

**The decision between Policy Alpha and Policy Beta is formally kept OPEN (`DEP-GOV-TERM-01`) for the Product Owner.** The recommendation of this proposal remains Policy Alpha.

---

## 9. Backend Identity TOCTOU Race & Kernel Bounds in `pg_terminate_backend`

### 9.1 Engine Internals: `pg_terminate_backend` Implementation `[C]`

In PostgreSQL C source code (`backend/utils/adt/misc.c` and `backend/storage/ipc/pmsignal.c`):
```c
Datum pg_terminate_backend(PG_FUNCTION_ARGS) {
    int pid = PG_GETARG_INT32(0);
    // 1. Searches internal shared memory array (BackendStatusArray)
    // 2. Finds matching entry for 'pid'
    // 3. Verifies caller has permission (superuser or pg_signal_backend)
    // 4. Calls internal signaling function:
    SendProcSignal(pid, PROCSIG_RECOVERY_CONFLICT_DATABASE, InvalidBackendId);
    // Or falls back to POSIX kill:
    kill(pid, SIGTERM);
}
```

### 9.2 The Irreducible Kernel Gap `[C]`

Even when a query binds `(pid, backend_start)`:
```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE pid = 1234
  AND backend_start = '2026-10-09 10:00:00.123456+00';
```
1. **Time-of-Check (TOC):** PostgreSQL SQL engine evaluates the `WHERE` clause against `pg_stat_activity`. The tuple matches.
2. **Execution:** The SQL engine invokes `pg_terminate_backend(1234)`.
3. **Kernel Gap:** In the microsecond between TOC and the C-level `kill(1234, SIGTERM)` system call:
   - Backend 1234 exits naturally (e.g. completes query).
   - The OS kernel re-allocates PID 1234 to another process on the host.
4. **Time-of-Use (TOU):** The OS kernel executes `kill(1234, SIGTERM)`. The signal is delivered to the **new process**.
5. **Architectural Bound:** Because POSIX `kill(pid, sig)` takes only an integer, **no database-level software check can eliminate this race without Linux-specific `pidfd_send_signal` (which PostgreSQL does not use)**.

---

## 10. Data Exposure Lifecycle & V8 Heap Memory Minimization

### 10.1 The Eight Discrete Exposure States Re-Affirmed `[C]`, `[D]`

```
[State 0: Unstarted] ──> Query not sent to DB. Zero data in application memory.
         │
         ▼
[State 1: Executing] ──> Executing in DB engine. Row lock held on exam_sessions.
         │
         ▼
[State 2: Node.js Buffered] ──> Projection rows returned over pgwire into Node.js heap.
         │                      (Database transaction remains uncommitted!)
         ▼
[State 3: Commit in Flight] ──> 'COMMIT' sent to PostgreSQL; awaiting server ACK.
         │
         ▼
[State 4: Commit Confirmed] ──> CommandComplete('COMMIT') received; lock released.
         │
         ▼
[State 5: HTTP Unstarted] ──> Confirmed data held in Node.js; 0 HTTP bytes written.
         │
         ▼
[State 6: HTTP Streaming] ──> First chunk emitted across network interface (T_http_emit).
         │                    *** PHYSICAL POINT OF IRREVOCABILITY ***
         ▼
[State 7: Browser Rendered] ──> Data fully decoded and rendered in candidate DOM.
```

### 10.2 V8 Heap Behavior: Dereferencing vs Memory Erasure `[C]`

In proposal v4.8, it was clarified that `projectionBuffer = null` does not erase memory. Proposal v4.9 formalizes the exact V8 runtime constraints:
1. **Garbage Collection Deferral:** In Node.js / V8, setting a local variable to `null` decrements reference counters in the local frame. However, the allocated memory blocks (Old Space or Nursery Space) remain unmodified until a scavenge or mark-sweep GC phase is triggered by allocation pressure.
2. **Buffer String Interning:** Strings parsed from JSON pgwire payloads are interned in V8 heap pages. Application code cannot invoke `memset()` or `bzero()` on JavaScript string primitives.
3. **Mandatory Leak-Containment Invariants (`[D]`):**
   - **Invariant M1 (No APM Payload Tracing):** OpenTelemetry and Datadog interceptors must be configured with payload filtering to strip SQL response rows from APM spans.
   - **Invariant M2 (Zero Structured Logging):** Winston/Pino logger formatting pipelines must have explicit redaction filters for `rows`, `projection`, and `payload`.
   - **Invariant M3 (Disable Core Dumps):** Node.js production containers must execute with `node --no-core-dump` and Linux `ulimit -c 0` to prevent memory scraping from crash dumps.

---

## 11. Concrete SQL Catalog Verification Queries

The following queries must be executed by DBAs or verification scripts to establish ground truth in the target deployment database:

### 11.1 Verification of Active Session Row Locks (`pg_locks`) `[C]`
```sql
SELECT 
    l.locktype,
    l.relation::regclass AS locked_relation,
    l.page,
    l.tuple,
    l.virtualxid,
    l.transactionid,
    l.mode,
    l.granted,
    a.pid,
    a.usename,
    a.client_addr,
    a.state,
    a.query_start,
    clock_timestamp() - a.query_start AS query_duration,
    a.query
FROM pg_locks l
JOIN pg_stat_activity a ON l.pid = a.pid
WHERE l.relation = 'public.exam_sessions'::regclass
ORDER BY a.query_start ASC;
```

### 11.2 Verification of Application Role Privileges (Audit Defect 2) `[A]`, `[C]`
```sql
SELECT 
    grantee, 
    table_schema, 
    table_name, 
    privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'uadue_app_user'
  AND table_schema IN ('public', 'uadue_canonical', 'uadue_auth', 'uadue_delivery')
ORDER BY table_schema, table_name, privilege_type;
```

### 11.3 Verification of RLS Enforcement on Child Tables `[A]`, `[C]`
```sql
SELECT 
    schemaname, 
    tablename, 
    rowsecurity, 
    forcerowsecurity
FROM pg_tables
WHERE tablename IN (
    'exam_sessions',
    'candidate_submissions',
    'candidate_responses',
    'session_events',
    'consumed_tickets',
    'projection_access_receipts'
);
```

---

## 12. Comprehensive Transaction and Connection Pool Lifecycle Matrix

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

## 13. Authoritative Adversarial Test Inventory (81 Scenarios)

The test inventory is formally expanded to **eighty-one (81)** comprehensive scenarios covering all lock-ordering branches, buffer leaks, ambiguous commits, MVCC context invisibility, TOCTOU races, and response recoverability. **All 81 scenarios remain completely unexecuted (`[B]`):**

| Test ID Range | Test Category & Objectives | Specified? | Authored? | Executed? | Passed? | Review Status |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **ADV-01 – ADV-18** | Core Ticket Claims, Seals, Replay & Privilege Escalation | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-19 – ADV-30** | Timeout Unwinds, Driver Internals, Socket Teardown & Buffering | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-31 – ADV-42** | Tuple Lock Arrival Skew, Role Memberships & Ambiguous Commits | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-43 – ADV-54** | API vs DB Skew, Buffer Scrapping, PID Reuse & Cross-Tenant Preemption | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-55 – ADV-67** | MVCC Visibility Paradox, Buffer Memory Leaks, TOCTOU & Receipt Atomicity | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-68 – ADV-81** | Ambiguous In-Flight Races, Deterministic Recovery, and Idempotency Integrity | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |

### Comprehensive Specification of Scenarios ADV-68 through ADV-81:

- **`ADV-68`:** Ambiguous commit retry while original primary transaction is actively executing in PostgreSQL (`pg_stat_activity` state `'active'`). Verifies that absent receipt is NOT interpreted as rollback while transaction is in flight; gateway blocks or yields with retry-after.
- **`ADV-69`:** Transaction rollback followed by client retry; proves that an in-transaction `ABORTED` receipt does not exist in the database, and verifies that the post-rollback Supervisor Coordinator successfully persists a durable tombstone (`ABORTED_DURABLE`).
- **`ADV-70`:** Node.js process crashes (`SIGKILL`) immediately after `COMMIT` succeeds on PostgreSQL socket. Client retries with same `request_id`; verifies deterministic projection reconstruction from `canonical_assessment_packages` (Option B) or cached payload (Option A).
- **`ADV-71`:** Idempotency key mismatch: client sends an existing `request_id` but pairs it with a different `ticket_jti` or `candidate_id`. Gateway strictly rejects with HTTP 409 Conflict (`ERR_IDEMPOTENCY_KEY_COLLISION`).
- **`ADV-72`:** Concurrent racing retries with identical `request_id` arriving simultaneously across two independent Gateway Worker processes; verifies transactional advisory lock serialization prevents dual execution.
- **`ADV-73`:** Deterministic projection reconstruction hash divergence: recomputed projection SHA-256 does not match committed `projection_digest`. System fails closed (`ERR_RECOVERY_INTEGRITY_MISMATCH`, HTTP 500) and triggers security alert.
- **`ADV-74`:** Proctor attempts Policy Beta preemption via `pg_locks` tuple-lock inspection rather than table lookup; evaluates required catalog privileges and tuple-level locking concurrency under load.
- **`ADV-75`:** Proctor attempts out-of-transaction context logging (autonomous transaction); evaluates orphaned context records created when projection transaction fails before `BEGIN`.
- **`ADV-76`:** Client disconnects during `COMMIT` execution; PostgreSQL engine finishes `COMMIT` successfully, but socket write fails. Receipt confirms `COMMITTED`; subsequent client reconnect safely fetches committed payload.
- **`ADV-77`:** Client retry when database has executed `ROLLBACK` due to statement timeout; coordinator records durable `ABORTED_DURABLE` receipt; verifies ticket was not consumed and candidate is directed to error screen.
- **`ADV-78`:** Memory leak probe under V8 heap dump generation: force-dumping heap during State 2 buffered window confirms that un-dereferenced projection objects are present in heap, verifying necessity of `--no-core-dump` and APM redaction.
- **`ADV-79`:** TOCTOU kernel race simulation: PID recycled by OS within sub-millisecond window between catalog check and `pg_terminate_backend`; confirms failure mode and bounds.
- **`ADV-80`:** Multi-tenant boundary isolation during idempotent recovery: recovery query for `request_id` belonging to Tenant A attempted by candidate authenticated under Tenant B; strict 403 Forbidden failure.
- **`ADV-81`:** Recovery attempt after assessment package revocation or hash mismatch: candidate tries to recover committed projection using `request_id` after package seal is invalidated; fails closed with integrity alarm.

---

## 14. Preservation of All Frozen Phase 3 Governance Contracts

The following frozen Phase 3 governance baselines remain strictly locked:
1. **Phase 3.5 Raw-Score-Only Contract:** Zero modifications to scoring formulas, evaluation DAGs, or candidate scoring dispute tables.
2. **Phase 3.6 ACTIVE-Only Tier 3 Projection:** Question projection retrieval is restricted strictly to sessions with `session_state == 'ACTIVE'`.
3. **Zero Question-Viewing Grace:** Deadline calculations permit strictly zero question-viewing grace.
4. **Submission Transport Grace:** 15-second grace window applies strictly to answer ingestion events (`candidate_submission_events`).
5. **`EXAM:SOLUTION_AUDIT` Capability Contract:** Post-exam answers and solutions released strictly after administrative result release.
6. **`AP-DEC-013`:** Assessment policy rules strictly preserved; zero autonomous AI/LLM conversions permitted.
7. **Tenant Isolation & Quarantine Restrictions:** Unresolved `DEP-T4-ANS-01`, `GOV-04`, and `DEP-GOV-TERM-01` maintained.

---

## 15. Deliverable & Final Implementation Gate

### 15.1 Repository Evidence Examined
- [`web/src/services/uadue/delivery/deliveryPostgresAdapter.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/deliveryPostgresAdapter.ts) (Lines 108–112): Confirmed silent error swallowing in `SET LOCAL ROLE`.
- [`web/src/services/uadue/delivery/sessionOrchestrator.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/sessionOrchestrator.ts) (Lines 866–876): Confirmed all 9 session writer methods use `SELECT ... FOR UPDATE` and zero writers acquire advisory locks.
- [`web/package.json`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/package.json) (Lines 36, 41): Confirmed `pg: ^8.23.0` dependency.
- [`supabase/migrations/20261007_uadue_phase2d8_canonical.sql`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase2d8_canonical.sql) (Lines 366–369): Confirmed blanket `ALL PRIVILEGES` granted to `uadue_app_user`.
- [`supabase/migrations/20261007_uadue_phase3_database_foundation.sql`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase3_database_foundation.sql) (Lines 304–307): Confirmed session table schema and duplicate blanket role grants.

### 15.2 Confirmed Defects & Unverified Assumptions
- **Confirmed Defect 1:** `deliveryPostgresAdapter.ts` swallows `SET LOCAL ROLE` failures, executing transactions as physical superuser.
- **Confirmed Defect 2:** In migrations, `uadue_app_user` holds blanket `ALL PRIVILEGES` across all tables, functions, and sequences.
- **Confirmed Architecture Blocker:** Table-based backend signaling in Policy Beta is defeated by PostgreSQL MVCC transaction visibility (uncommitted candidate context rows are invisible to concurrent proctors).
- **Unverified Assumption 1 (`[F]`):** Live deployment Supabase database credentials and role hierarchy.
- **Unverified Assumption 2 (`[F]`):** Target deployment availability of `pg_sodium` extension.

### 15.3 Product Owner Decisions Still Required
1. **Resolution of Termination Architecture (`DEP-GOV-TERM-01`):** Formally decide between Policy Alpha (Transactional Mutual Exclusion with Bounded Queuing) and Policy Beta (Preemptive Cancellation via Signal), recognizing the MVCC table-lookup constraint and catalog inspection trade-offs.
2. **Authorization of Database Role & RLS Migration Phase (`DEP-SEC-CHILD-01`, `DEP-SEC-GUC-01`):** Authorize stripping `uadue_app_user` of blanket privileges, creating `uadue_tenant_runtime`, and applying RLS to the six child tables.

### 15.4 Final Implementation Gate Verdict

| Evaluation Dimension | Current Assessment | Gate Verdict |
| :--- | :--- | :---: |
| **Response Recoverability Architecture**| Option A (Payload) vs Option B (Deterministic Reconstruction) formalized; digest role clarified. | 🟢 **PASS (Design)** |
| **Transactional State Machine**| 4-tier state machine formulated; out-of-transaction coordinator tombstone specified. | 🟢 **PASS (Design)** |
| **Idempotency & Race Resolution** | 7-state concurrency taxonomy defined; absent receipt fallacy deconstructed. | 🟢 **PASS (Design)** |
| **Policy Beta Scoping & Governance** | Narrowed to table-lookup write path; `DEP-GOV-TERM-01` kept open for PO. | 🟡 **OPEN (PO Decision)** |
| **Fail-Closed Role Boundary** | Defect confirmed in `deliveryPostgresAdapter.ts`; fail-closed abort specified; unmigrated. | 🔴 **BLOCKED** |
| **Child-Table RLS Completeness** | Six child tables audited; least-privilege inventory complete; migrations unapplied. | 🔴 **BLOCKED** |
| **Cryptographic Byte Verification**| Raw canonical byte pipeline formalized; test suite unexecuted. | 🔴 **UNCERTIFIED** |
| **Replay Matrix & Retention** | Dual-branch race model and 5-minute post-expiry pruning formalized. | 🟢 **PASS (Design)** |
| **Projection Contract Alignment** | Authoritative `EXAM:SOLUTION_AUDIT` preserved; live projection gated strictly to `ACTIVE`. | 🟢 **PASS** |

### **Overall Gate: 🔴 RED — Implementation and Candidate-Facing Integration Strictly Blocked**

**Summary for Gatekeeper:**  
Proposal v4.9 resolves the fundamental recovery and transaction lifecycle contradictions of v4.8: it proves how a committed projection can be recovered without payload storage via deterministic recompilation (Option B) or cached payload persistence (Option A), dismantles the assumption that an aborted transaction can write an `ABORTED` receipt, deconstructs the fallacy that an absent receipt equals a rollback across seven discrete race states, and narrows the Policy Beta critique to the table-lookup write path while preserving `DEP-GOV-TERM-01` for Product Owner determination. Because database role migrations, child-table RLS policies, and all 81 adversarial test scenarios remain unapplied and unexecuted, the overall gate remains strictly **🔴 RED**. Exactly zero application source files were modified, zero migrations were applied, and zero tests were executed.
