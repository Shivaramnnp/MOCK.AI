# Mock.AI — Phase 3.6 Security Remediation Proposal v4.10
### Document Title: `PHASE_3_6_SECURITY_REMEDIATION_PROPOSAL_v4_10.md`
**Proposal Version:** `4.10.0-DURABLE-OPERATION-OWNERSHIP-AND-REAUTHORIZATION-AUDIT`  
**Overall Readiness Gate:** 🔴 **RED — Implementation and Candidate-Facing Integration Strictly Blocked**  
**Document Status:** **STRICT DESIGN-ONLY AUDIT & ARCHITECTURAL SPECIFICATION**  
*(Strictly zero application source code modified, zero migrations applied, zero test suites executed)*

---

## 1. Document Status, Governance Locks & Audit Metadata

This document constitutes the definitive architectural design review and remediation specification **v4.10** for Mock.AI Phase 3.6. It directly addresses and resolves the critical recovery-protocol weaknesses, advisory-locking limits, and state-machine assumptions identified in the forensic review of proposal v4.9:

1. **Durable Operation Ownership Protocol:** Formally establishes the operational boundary where a request transitions from transient memory to durable cluster-wide ownership. Evaluates a single-transaction atomic execution model versus a two-phase leased reservation model with fencing tokens (`fence_token`). Defines how ambiguous reservation outcomes are reconciled without dual-worker execution races.
2. **Reassessment of Advisory Locks & Signaling Limits:** Deconstructs PostgreSQL advisory locks (`pg_advisory_xact_lock`), proving that they enforce application-level cooperative mutual exclusion strictly among code paths that request them. Proves that observing zero active backends in `pg_stat_activity` or no locks in `pg_locks` **does not prove an operation has aborted**.
3. **Corrected Durable Operation State Machine:** Defines the legal state transitions across seven durable states (`RESERVED`, `EXECUTING`, `COMMITTED`, `DEFINITIVE_ABORT`, `RECOVERY_PENDING`, `RECOVERED`, `INTEGRITY_FAILED`). Establishes what survives PostgreSQL engine rollbacks, eliminates the invalid in-transaction abort tombstone, and defines the authoritative evidence required by a supervisor coordinator before recording terminal aborts.
4. **Physical Invariants of Single-Transaction Atomicity:** Formally proves that under the same-transaction design (`INSERT INTO consumed_tickets` and `INSERT INTO projection_access_receipts` between `BEGIN` and `COMMIT`), a "Lost Receipt" state is **physically impossible** under relational engine ACID guarantees. Re-classifies the phenomenon as an invariant violation that can only occur if writes cross transactional boundaries or driver bugs swallow exceptions.
5. **Response Recovery & Re-Authorization Gate (Option A vs Option B):** Preserves both Option A (Payload Persistence) and Option B (Deterministic Recompilation) as authorized alternatives. Crucially separates **byte reconstruction** from **authorization release**: proves that recovering identical bytes does not authorize delivery unless tenant, candidate, session state (`ACTIVE`), quarantine, and staff capability rules are re-validated.
6. **Policy Beta Deconstruction via PostgreSQL Engine Internals:** Proves that row-level locks (`SELECT ... FOR SHARE`) in PostgreSQL are stored directly inside tuple headers on physical data pages (`t_infomask` / `xmax`) and **do not appear as discrete rows in `pg_locks`** unless an active lock conflict exists. Proves that `pg_stat_activity` and `pg_locks` cannot reliably bind backends to candidate sessions. Formally preserves **`DEP-GOV-TERM-01` as an OPEN Product Owner decision**.
7. **Strictly Bounded Adversarial Test Suite:** Retains all 81 existing adversarial scenarios and introduces only the minimum necessary set of four (4) targeted scenarios (`ADV-82` through `ADV-85`, total 85) to validate durable reservation leases, ambiguous reservation recovery, re-authorization gating, and supervisor race prevention. All 85 scenarios remain explicitly unexecuted (`[B]`).

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

## 2. Change Log (v4.9 $\rightarrow$ v4.10)

1. **Durable Operation Ownership Protocol Defined:** Specified how a request becomes owned by a specific worker; formulated two-phase leased reservation schema with fencing tokens (`fence_token`) and evaluated single-transaction versus two-phase trade-offs.
2. **Advisory Lock Scope & Engine Semantics Reassessed:** Clarified that `pg_advisory_xact_lock` is cooperative and transaction-scoped; analyzed connection-drop behavior and proved that absence of a lock does not equal an engine abort.
3. **Corrected State Machine & Authoritative Abort Evidence:** Eliminated in-transaction abort writes; established that supervisor coordinators must require proof of engine-level terminal error before writing `DEFINITIVE_ABORT`.
4. **Forensic Rectification of the "Lost Receipt" Anomaly:** Re-classified the "Lost Receipt" state from an execution branch to a structural invariant violation, proving it cannot occur within a single database transaction.
5. **Decoupled Reconstruction from Re-Authorization:** Mandated that cached or recomputed projection bytes cannot be emitted without re-verifying caller tenancy, candidate identity, session state (`ACTIVE`), and package quarantine status.
6. **Exposed Row-Lock Storage Limits in `pg_locks`:** Proved that PostgreSQL tuple locks are stored in tuple headers (`t_infomask`), not in shared-memory `pg_locks`, invalidating the assumption that `pg_locks` can be used for session discovery.
7. **Targeted Test Expansion (81 $\rightarrow$ 85):** Added exactly four targeted test specifications (`ADV-82` to `ADV-85`) addressing the corrected ownership, reservation recovery, and re-authorization state transitions.

---

## 3. Evidence Classification Taxonomy

- **`[A] Direct Repository Evidence`**: Verified by exact file path, line numbers, and repository contents.
- **`[B] Executed Test Evidence`**: Confirmed by executed test output in this workspace (all adversarial tests are explicitly marked *unexecuted*).
- **`[C] Verified PostgreSQL Semantics`**: Verified against official PostgreSQL engine documentation, executor source behavior, locking semantics, and catalog specifications.
- **`[D] Proposed Design`**: Architectural design, schema migration, or code pattern proposed for implementation.
- **`[E] Unresolved External Dependency`**: Blocking prerequisite external to the immediate gateway codebase.
- **`[F] Unverified Runtime Assumption`**: State of the live deployed database, network topology, or hosting environment that cannot be verified statically from repository code.

---

## 4. Durable Operation Ownership Protocol

### 4.1 When Does a Request Become Durably Owned? `[C]`, `[D]`

In proposals v4.8 and v4.9, request ownership existed only in ephemeral Node.js memory until the final `COMMIT` wrote to `consumed_tickets` and `projection_access_receipts`.  
**Critical Forensic Finding (`[D]`):**  
If ownership is not durably recorded before projection compilation begins:
- A network drop, gateway crash, or horizontal auto-scaling retry can cause two independent Gateway Workers ($W_1$ and $W_2$) to concurrently execute identical heavy projection queries for the same candidate.
- While row-level locking on `exam_sessions` (`SELECT ... FOR SHARE`) serializes transactions in PostgreSQL, it **does not prevent two workers from both successfully acquiring `FOR SHARE` simultaneously**, because shared locks are mutually compatible!
- Consequently, both workers will independently fetch question rows, independently serialize them in memory, and race to commit ticket consumption.

To solve this, the architecture must define **when and how durable ownership is established**. Two distinct design models are evaluated:

---

### 4.2 Model 1: Single-Transaction Atomic Execution (Cooperative Serialization) `[D]`

In Model 1, ownership is not written in a separate transaction. Instead, ownership, ticket consumption, and receipt persistence occur in a **single atomic transaction**, serialized at the application layer via transaction-scoped advisory locks:

```sql
-- Single Transaction Execution Flow
BEGIN;
-- 1. Acquire transaction-scoped advisory lock on request_id
SELECT pg_advisory_xact_lock(hashtext('idemp:' || $1::text));

-- 2. Verify receipt does not already exist
SELECT projection_status FROM uadue_delivery.projection_access_receipts WHERE request_id = $1;
-- If COMMITTED: release and return cached/reconstructed result.

-- 3. Acquire row lock on session
SELECT session_state FROM public.exam_sessions WHERE exam_session_id = $2 FOR SHARE;

-- 4. Consume ticket & write receipt in same transaction
INSERT INTO uadue_auth.consumed_tickets (jti, expires_at) VALUES ($3, $4);
INSERT INTO uadue_delivery.projection_access_receipts (
    request_id, exam_session_id, tenant_id, candidate_id, ticket_jti, 
    projection_status, projection_digest, created_at, committed_at
) VALUES ($1, $2, $5, $6, $3, 'COMMITTED', $7, clock_timestamp(), clock_timestamp());

COMMIT;
```

#### Evaluation of Model 1:
- **Pros:** Exactly one database transaction. Zero risk of orphaned reservations. Zero need for leasing or heartbeat infrastructure. Full ACID atomicity between ticket and receipt.
- **Cons:** If Node.js crashes before `COMMIT`, zero trace exists in the database. A retry will re-run the entire query. If the client retries across a different worker that fails to call the advisory lock, concurrent executions can occur.

---

### 4.3 Model 2: Two-Phase Leased Reservation Protocol with Fencing Tokens `[D]`

In Model 2, a durable reservation is committed to the database **before** projection generation begins.

#### 4.3.1 Proposed Reservation Schema `[D]`
*(Clearly distinguished from existing schema: this table does NOT exist in current migrations)*

```sql
CREATE TABLE uadue_delivery.operation_reservations (
    request_id              UUID PRIMARY KEY,
    ticket_jti              TEXT NOT NULL UNIQUE,
    exam_session_id         UUID NOT NULL REFERENCES public.exam_sessions(exam_session_id),
    tenant_id               UUID NOT NULL,
    candidate_id            UUID NOT NULL,
    package_id              UUID NOT NULL,
    package_integrity_seal  TEXT NOT NULL,
    owner_worker_id         UUID NOT NULL,         -- Pod / worker instance UUID
    fence_token             BIGINT NOT NULL DEFAULT 1,
    reservation_status      TEXT NOT NULL CHECK (
        reservation_status IN ('RESERVED', 'EXECUTING', 'COMMITTED', 'ABORTED', 'RECOVERY_PENDING')
    ),
    lease_expires_at        TIMESTAMPTZ NOT NULL,  -- Absolute wall-clock expiry
    created_at              TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_reservations_session_active 
ON uadue_delivery.operation_reservations(exam_session_id, reservation_status);
```

#### 4.3.2 Two-Phase Lifecycle & Fencing Semantics:
1. **Phase 1: Reserve (Independent Transaction $T_{\text{res}}$):**
   ```sql
   INSERT INTO uadue_delivery.operation_reservations (
       request_id, ticket_jti, exam_session_id, tenant_id, candidate_id,
       package_id, package_integrity_seal, owner_worker_id, fence_token,
       reservation_status, lease_expires_at
   ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, 1, 'RESERVED', clock_timestamp() + interval '5 seconds'
   )
   ON CONFLICT (request_id) DO NOTHING
   RETURNING fence_token;
   ```
2. **Ambiguous Reservation Outcome Reconciliation:**
   - If the network drops while committing $T_{\text{res}}$, Worker $W_1$ does not know if the reservation was created.
   - Reconciliation query:
     ```sql
     SELECT owner_worker_id, fence_token, reservation_status, lease_expires_at 
     FROM uadue_delivery.operation_reservations 
     WHERE request_id = $1;
     ```
   - If row exists and `owner_worker_id == W_1`: Reservation succeeded. Proceed to Phase 2.
   - If row exists and `owner_worker_id != W_1`: Another worker claimed it. Abort Phase 2; enter wait/recovery.
   - If row does not exist: Reservation rolled back. Safe to retry reservation.
3. **Phase 2: Execution & Fenced Commit ($T_{\text{exec}}$):**
   Inside the projection transaction:
   ```sql
   -- Verify fence token has not been bumped by a lease-takeover worker
   UPDATE uadue_delivery.operation_reservations
   SET reservation_status = 'COMMITTED', updated_at = clock_timestamp()
   WHERE request_id = $1 
     AND fence_token = $expected_fence_token
     AND reservation_status IN ('RESERVED', 'EXECUTING');
   ```
   If the `UPDATE` returns 0 rows, the worker's lease expired, another worker fenced it out, and $T_{\text{exec}}$ **must immediately rollback**!

#### 4.3.3 Recovery After Worker Crash:
If Worker $W_1$ crashes while holding the reservation:
- A new Worker $W_2$ receives the retry.
- $W_2$ inspects `operation_reservations`.
- If `reservation_status == 'RESERVED'` AND `clock_timestamp() > lease_expires_at`:
  $W_2$ performs a **Lease Steal & Fence Increment**:
  ```sql
  UPDATE uadue_delivery.operation_reservations
  SET owner_worker_id = $w2_id,
      fence_token = fence_token + 1,
      lease_expires_at = clock_timestamp() + interval '5 seconds',
      updated_at = clock_timestamp()
  WHERE request_id = $1 
    AND fence_token = $current_fence_token
    AND lease_expires_at < clock_timestamp()
  RETURNING fence_token;
  ```
- If the `UPDATE` succeeds, $W_2$ is the new authoritative owner. If $W_1$ subsequently wakes up from a GC pause, its commit attempt will fail because `fence_token` has incremented.

---

## 5. Reassessment of Advisory Locks & Signaling Limits

### 5.1 What Advisory Locks Serialize — And What They Do Not `[C]`

PostgreSQL advisory locks (`pg_advisory_xact_lock` and `pg_advisory_lock`) are application-level synchronization primitives.  
**Engine Reality (`[C]`):**
1. **What They Serialize:**  
   They serialize only database sessions that **explicitly execute the same advisory lock function with the exact same 64-bit integer lock key**.
2. **What They DO NOT Serialize:**
   - They **do not** block standard SQL queries (`SELECT`, `INSERT`, `UPDATE`) against tables.
   - They **do not** serialize workers or endpoints that execute alternate code paths without requesting the lock.
   - They **do not** prevent database background workers, proctor terminations, or administrative superusers from executing queries.

### 5.2 Transaction-Scoped vs Session-Scoped Dynamics `[C]`

| Dimension | Transaction-Scoped (`pg_advisory_xact_lock`) | Session-Scoped (`pg_advisory_lock`) |
| :--- | :--- | :--- |
| **Release Mechanism** | Automatic upon `COMMIT` or `ROLLBACK`. | Explicit `pg_advisory_unlock()` or connection close. |
| **PgBouncer Compatibility** | 🟢 **100% Compatible** with transaction pooling. | 🔴 **UNSAFE** in transaction pooling (persists across pool re-assignment). |
| **Connection Drop Behavior**| Immediately released when backend exits. | Immediately released when physical TCP connection closes. |
| **Worker Crash Resilience** | Immediate release allows waiting workers to unblock. | Immediate release on connection close. |

### 5.3 The Inspection Race Paradox `[C]`, `[D]`

In proposal v4.9, it was proposed that if no receipt is found, Worker $W_2$ acquires the advisory lock and inspects `pg_stat_activity` or session row locks to prove the previous transaction aborted.  
**Adversarial Technical Breakthrough (`[C]`):**  
**Observing no active backend in `pg_stat_activity` and no lock in `pg_locks` DOES NOT PROVE THE ORIGINAL OPERATION ABORTED.**
1. **The TCP Teardown / Engine Lag Gap:**  
   Worker $W_1$'s connection to PgBouncer may drop. PgBouncer drops the backend connection. The backend backend process in PostgreSQL receives `SIGTERM` or disconnect.  
   If $W_1$ issued `COMMIT` right before the drop, the backend might have completed the WAL flush and exited before $W_2$ queried `pg_stat_activity`.
2. **The Transient Vacuum Window:**  
   Between the moment backend $W_1$ exits and backend $W_2$ queries `projection_access_receipts`, there is a microsecond gap. If $W_1$ rolled back, $W_2$ sees zero rows. But $W_2$ cannot distinguish whether $W_1$ aborted, or if $W_1$ never ran at all!
3. **Conclusion:**  
   Advisory locks prevent **two active workers from simultaneously executing the projection pipeline**. They do **not** provide historical proof of an uncommitted transaction's demise. Historical proof must be established through durable state machines.

---

## 6. Corrected Durable Operation State Machine

### 6.1 Durable States & Legal Transitions `[C]`, `[D]`

```
                             ┌───────────────────────┐
                             │       UNSTARTED       │
                             └───────────┬───────────┘
                                         │ Phase 1: Reserve (T_res)
                                         ▼
                             ┌───────────────────────┐
         ┌───────────────────┤       RESERVED        ├───────────────────┐
         │ (Lease Expired)   └───────────┬───────────┘                   │ (Fatal Client Reject)
         ▼                               │ Phase 2: Start (T_exec)       ▼
┌───────────────────┐                    ▼                      ┌───────────────────┐
│ RECOVERY_PENDING  │        ┌───────────────────────┐          │ DEFINITIVE_ABORT  │
└────────┬──────────┘        │       EXECUTING       │          └───────────────────┘
         │ (Takeover)        └───────────┬───────────┘                    ▲
         ▼                               │                                │
┌───────────────────┐                    │ Commit (T_exec)                │
│    RECOVERED      │◄───────────────────┴────────────────────────────────┤ (Engine Error ACK)
└───────────────────┘                    │                                │
                                         ▼                                │
                             ┌───────────────────────┐                    │
                             │       COMMITTED       │                    │
                             └───────────┬───────────┘                    │
                                         │ (Tamper / Hash Divergence)     │
                                         ▼                                │
                             ┌───────────────────────┐                    │
                             │   INTEGRITY_FAILED    │────────────────────┘
                             └───────────────────────┘
```

### 6.2 State Transition Matrix & Rollback Durability

| State Name | Durability Scope | Survives Engine Rollback? | Permitted Transition To | Authoritative Evidence Required to Enter State |
| :--- | :---: | :---: | :--- | :--- |
| **`RESERVED`** | Durable (DB) | 🟢 Yes (Committed by $T_{\text{res}}$) | `EXECUTING`, `RECOVERY_PENDING`, `DEFINITIVE_ABORT` | Unique `request_id` insert succeeded in $T_{\text{res}}$. |
| **`EXECUTING`** | Ephemeral / DB | 🟡 Conditional | `COMMITTED`, `RECOVERY_PENDING`, `DEFINITIVE_ABORT` | Fenced worker verified ownership; projection running. |
| **`COMMITTED`** | Durable (DB) | 🟢 Yes (Committed by $T_{\text{exec}}$)| `RECOVERED`, `INTEGRITY_FAILED` | `CommandComplete('COMMIT')` acknowledged by engine. |
| **`DEFINITIVE_ABORT`**| Durable (DB) | 🟢 Yes (Committed by $T_{\text{coord}}$)| *Terminal State* | Verified engine abort ACK (SQL error) or PO cancel. |
| **`RECOVERY_PENDING`**| Durable (DB) | 🟢 Yes (Committed by $T_{\text{takeover}}$)| `EXECUTING`, `DEFINITIVE_ABORT` | `clock_timestamp() > lease_expires_at`. |
| **`RECOVERED`** | Durable / API | 🟢 Yes | *Terminal State* | Hash verification passed; payload re-emitted. |
| **`INTEGRITY_FAILED`**| Durable (DB) | 🟢 Yes (Committed by $T_{\text{coord}}$)| *Terminal State* | Hash divergence; package revoked/quarantined. |

### 6.3 Eliminating Invalid In-Transaction Abort Tombstones `[C]`
- **PostgreSQL Fundamental Rule:** A transaction that rolls back **cannot write its own tombstone**.
- If an abort tombstone is written, it **MUST be executed by a separate Supervisor Coordinator transaction ($T_{\text{coord}}$)**.
- **Authoritative Evidence Required by Supervisor Coordinator:**  
  The supervisor coordinator **MAY NOT write `DEFINITIVE_ABORT`** based merely on an absent receipt, a missing PID, or a network timeout.  
  It may only write `DEFINITIVE_ABORT` when:
  1. The database connection explicitly returned a fatal SQL error (`P0001` check violation, `40P01` deadlock, `57014` query canceled), followed by a confirmed `CommandComplete('ROLLBACK')`.
  2. The candidate session has been transitioned to `TERMINATED` by proctor authority.
  3. The request's lease expired and a takeover worker confirmed that the original ticket was **never consumed** in `consumed_tickets`.

---

## 7. Atomicity Between Receipt and Ticket Consumption

### 7.1 The Single-Transaction Atomicity Invariant `[C]`

The architectural invariant is stated with mathematical precision:
$$\forall T: \left( \text{Write}(T, \text{consumed\_tickets}) \wedge \text{Write}(T, \text{projection\_access\_receipts}) \right) \implies \left( \text{Commit}(T) \iff (\text{Persisted}(\text{Ticket}) \wedge \text{Persisted}(\text{Receipt})) \right)$$

**Direct Relational Invariant:**  
If both writes occur within the exact same database transaction block (`BEGIN ... COMMIT`), the engine's Write-Ahead Log (WAL) guarantees that:
- Either **both** tuples are permanently written to disk.
- Or **neither** tuple is visible to any transaction.

### 7.2 Forensic Investigation of the "Lost Receipt Defect" `[C]`, `[D]`

In proposal v4.9, State S6 was characterized as: *"Lost Receipt Defect (Transaction committed, but receipt insertion bug occurred)."*  
**Forensic Investigation Finding (`[C]`, `[D]`):**  
1. **Under Same-Transaction Design:**  
   A state where `consumed_tickets` exists but `projection_access_receipts` is missing is **PHYSICALLY IMPOSSIBLE** in PostgreSQL under a single transaction. PostgreSQL does not permit partial commit of tuples within a single transaction.
2. **When Could It Actually Occur?**
   - **Cross-Transaction Boundary Bug:** If the application code executed `INSERT INTO consumed_tickets` in Transaction 1, and `INSERT INTO projection_access_receipts` in Transaction 2, a crash between $T_1$ and $T_2$ would cause a lost receipt.
   - **Exception Swallowing in Application:** If the Node.js application caught an error on the receipt insert and continued to `COMMIT`:
     ```typescript
     await client.query('INSERT INTO consumed_tickets ...');
     try {
       await client.query('INSERT INTO projection_access_receipts ...');
     } catch {
       // BUG: Swallowing error allows ticket to commit without receipt!
     }
     await client.query('COMMIT');
     ```
   - **Asynchronous Replication Lag:** Querying a read replica before WAL replay has applied the receipt.
3. **Architectural Classification:**  
   The "Lost Receipt" state is **NOT a normal concurrency branch**. It is a **FATAL SYSTEM INVARIANT VIOLATION**. If detected, the gateway must halt processing, treat the ticket as corrupted, and alert security operations immediately.

---

## 8. Response Recovery: Option A vs Option B & Re-Authorization Gate

Both options are preserved as authorized design alternatives.

### 8.1 Option A: Durable Response Payload Persistence `[D]`

```sql
-- Schema addition for Option A
ALTER TABLE uadue_delivery.projection_access_receipts
ADD COLUMN response_payload JSONB,
ADD COLUMN response_payload_bytes BYTEA; -- Compressed zstd alternative
```

#### Specification & Operational Constraints:
1. **Immutable Binding:** Payload is stored with `(request_id, ticket_jti, candidate_id, tenant_id)`.
2. **Integrity Validation:** Upon retrieval, the gateway computes `sha256(payload)` and verifies equality with `projection_digest`.
3. **Tenant Isolation:** Enforced via PostgreSQL Row-Level Security:
   ```sql
   CREATE POLICY receipts_tenant_isolation ON uadue_delivery.projection_access_receipts
   FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));
   ```
4. **Retention & Deletion Policy:**  
   - Payload rows must be purged by an automated database job **24 hours after exam session termination**.
   - If an exam session is canceled or quarantined, an immediate trigger zeros the payload:
     ```sql
     UPDATE uadue_delivery.projection_access_receipts 
     SET response_payload = NULL, response_payload_bytes = NULL 
     WHERE exam_session_id = $terminated_session_id;
     ```

---

### 8.2 Option B: Deterministic Reconstruction from Immutable Package + Session State `[D]`

```sql
-- Schema addition for Option B
ALTER TABLE uadue_delivery.projection_access_receipts
ADD COLUMN package_id UUID NOT NULL,
ADD COLUMN package_integrity_seal TEXT NOT NULL,
ADD COLUMN state_version INTEGER NOT NULL,
ADD COLUMN compiler_version TEXT NOT NULL;
```

#### Specification & Operational Constraints:
1. **Deterministic Compilation Invariants:**
   - Package bytes loaded from `uadue_canonical.canonical_assessment_packages`.
   - Verified against `package_integrity_seal`.
   - Projection generator must be a **pure mathematical function** of package data, section seeds, and `state_version`.
   - Output JSON must use deterministic key sorting (canonical JSON).
2. **Missing Artifacts:** If canonical package rows or assets are missing, compilation fails closed (HTTP 500, `ERR_CANONICAL_PACKAGE_UNAVAILABLE`).
3. **Package Supersession / Quarantine:** If `canonical_assessment_packages.is_quarantined == true`, reconstruction aborts immediately with HTTP 403 Forbidden (`ERR_PACKAGE_QUARANTINED`).

---

### 8.3 The Re-Authorization Gate: Decoupling Bytes from Release Authority `[D]`

**Fundamental Security Principle (`[D]`):**  
**Reconstructing or retrieving identical response bytes DOES NOT authorize their release to the client.**  
A gateway MUST NOT return a projection payload merely because `request_id` matches. Prior to emitting HTTP 200, the gateway MUST execute the **Re-Authorization Pipeline**:

```
                       Recovered / Reconstructed Payload Available
                                            │
                                            ▼
                              [RE-AUTHORIZATION PIPELINE]
                                            │
           1. Tenant Check: caller.tenant_id == receipt.tenant_id?
              ├── NO  ──> HTTP 403 Forbidden (ERR_TENANT_MISMATCH)
              └── YES
                     │
           2. Candidate Check: caller.candidate_id == receipt.candidate_id?
              ├── NO  ──> HTTP 403 Forbidden (ERR_CANDIDATE_MISMATCH)
              └── YES
                     │
           3. Quarantine Check: Is package or session quarantined?
              ├── YES ──> HTTP 403 Forbidden (ERR_SECURITY_QUARANTINE)
              └── NO
                     │
           4. Session State Check: Is session_state == 'ACTIVE'?
              ├── NO (TERMINATED/EXPIRED):
              │   • FROZEN CONTRACT ENFORCEMENT:
              │     Phase 3.6 restricts live projection STRICTLY to ACTIVE.
              │   • Payload MUST BE WITHHELD! (HTTP 410 Gone / 403 Forbidden)
              └── YES
                     │
           5. Solution Masking: Verify EXAM:SOLUTION_AUDIT masking preserved
              ├── PASS ──> Release Payload (HTTP 200 OK)
              └── FAIL ──> Abort Release (HTTP 500 Masking Error)
```

---

## 9. Policy Beta and `pg_locks`: Deep Engine Deconstruction

### 9.1 Where PostgreSQL Actually Stores Row-Level Locks `[C]`

In proposal v4.9, Alternative 2 suggested that proctors could inspect `pg_locks` to find the candidate backend holding a `RowShareLock` on `exam_sessions`.  
**PostgreSQL Engine Source Code Deconstruction (`[C]`):**  
In PostgreSQL (`src/backend/storage/lmgr/heapam.c` and `src/backend/storage/lmgr/lock.c`):
1. **Tuple-Level Locks Do Not Reside in `pg_locks`:**  
   When a transaction executes `SELECT ... FOR SHARE` or `SELECT ... FOR UPDATE`, PostgreSQL **does not create an entry in the shared lock table (`pg_locks`)** for that tuple under normal uncontended execution!
2. **In-Tuple Lock Bits:**  
   PostgreSQL sets lock bits directly inside the tuple's header on the physical disk/buffer page:
   - `t_infomask` and `t_infomask2` flags (`HEAP_XMAX_IS_MULTI`, `HEAP_XMAX_LOCK_ONLY`, `HEAP_LOCK_MASK`).
   - The locking transaction's ID or `MultiXactId` is stored directly in the tuple's `xmax` field.
3. **When DOES a tuple lock appear in `pg_locks`?**  
   A tuple lock appears in `pg_locks` **only when a second transaction attempts to acquire a conflicting lock on the same tuple and is forced to wait** (`locktype = 'tuple'`).
4. **Catastrophic Impact on Policy Beta:**  
   A proctor querying `pg_locks` to find who is reading an `exam_sessions` row will observe **ZERO ROWS** in `pg_locks`, because uncontended `FOR SHARE` locks are stored exclusively in the heap page buffer, not in the system lock table!

### 9.2 Limitations of `pg_stat_activity` `[C]`
- `pg_stat_activity` exposes `pid`, `query`, and `client_addr`.
- In a production connection-pooled application (PgBouncer), all backends execute parameterized queries (e.g. `SELECT * FROM projections WHERE session_id = $1`).
- The actual values of `$1` are **not exposed in `pg_stat_activity.query`** unless `log_min_duration_statement` or deep tracing is enabled.
- Attempting to identify a candidate's backend PID from `pg_stat_activity` is non-deterministic and susceptible to false positives.

### 9.3 Governance Conclusion: `DEP-GOV-TERM-01` Remains Unresolved `[E]`
Because `pg_locks` cannot observe uncontended tuple locks and `pg_stat_activity` cannot bind parameterized queries to candidate identities, **Policy Beta cannot be implemented via system catalog inspection**.  
The decision between Policy Alpha (bounded row-lock queuing) and Policy Beta remains **strictly OPEN (`DEP-GOV-TERM-01`) for Product Owner resolution**. Neither policy is approved on the PO's behalf.

---

## 10. Comprehensive Transaction and Connection Pool Lifecycle Matrix

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

## 11. Authoritative Adversarial Test Inventory (85 Scenarios)

The test inventory retains all 81 scenarios from proposal v4.9 and introduces **exactly four (4) targeted scenarios** (`ADV-82` through `ADV-85`) strictly necessary to validate the corrected ownership, reservation recovery, and re-authorization state transitions.  
**All 85 scenarios remain completely unexecuted (`[B]`):**

| Test ID Range | Test Category & Objectives | Specified? | Authored? | Executed? | Passed? | Review Status |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **ADV-01 – ADV-18** | Core Ticket Claims, Seals, Replay & Privilege Escalation | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-19 – ADV-30** | Timeout Unwinds, Driver Internals, Socket Teardown & Buffering | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-31 – ADV-42** | Tuple Lock Arrival Skew, Role Memberships & Ambiguous Commits | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-43 – ADV-54** | API vs DB Skew, Buffer Scrapping, PID Reuse & Cross-Tenant Preemption | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-55 – ADV-67** | MVCC Visibility Paradox, Buffer Memory Leaks, TOCTOU & Receipt Atomicity | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-68 – ADV-81** | Ambiguous In-Flight Races, Deterministic Recovery, and Idempotency Integrity | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-82 – ADV-85** | Durable Leased Reservations, Fencing Tokens, and Re-Authorization Gates | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |

### Specification of Scenarios ADV-82 through ADV-85:

- **`ADV-82` (Durable Leased Reservation Crash & Takeover):** Worker $W_1$ commits durable reservation row with `lease_expires_at = T + 5s` and crashes (`SIGKILL`). Worker $W_2$ attempts retry at $T + 2s$ (rejected, lease active) and at $T + 6s$ (accepted via lease-steal and `fence_token` increment). Validates that $W_1$ waking up cannot commit.
- **`ADV-83` (Ambiguous Reservation Outcome Reconciliation):** Client socket drops while $T_{\text{res}}$ is committing. Worker reconnects and queries reservation status before initiating projection query; verifies that absent reservation leads to clean retry while committed reservation avoids duplicate reservation error.
- **`ADV-84` (Re-Authorization Gate Enforcement on Recovery):** A valid `COMMITTED` receipt exists for `request_id`, but the session was transitioned to `TERMINATED` by proctor authority before client recovery query arrives. Gateway re-validates session status, enforces frozen Phase 3.6 `ACTIVE`-only contract, and withholds payload (HTTP 410 Gone / 403 Forbidden).
- **`ADV-85` (Supervisor Coordinator Race Prevention):** Supervisor coordinator attempts to write `DEFINITIVE_ABORT` while the primary transaction is in an ambiguous commit state. Verifies that coordinator fails closed and yields to `RECOVERY_PENDING` rather than writing an unauthorized abort tombstone without engine-level error proof.

---

## 12. Preservation of All Frozen Phase 3 Governance Contracts

The following frozen Phase 3 governance baselines remain strictly locked:
1. **Phase 3.5 Raw-Score-Only Contract:** Zero modifications to scoring formulas, evaluation DAGs, or candidate scoring dispute tables.
2. **Phase 3.6 ACTIVE-Only Tier 3 Projection:** Question projection retrieval is restricted strictly to sessions with `session_state == 'ACTIVE'`.
3. **Zero Question-Viewing Grace:** Deadline calculations permit strictly zero question-viewing grace.
4. **Submission Transport Grace:** 15-second grace window applies strictly to answer ingestion events (`candidate_submission_events`).
5. **`EXAM:SOLUTION_AUDIT` Capability Contract:** Post-exam answers and solutions released strictly after administrative result release.
6. **`AP-DEC-013`:** Assessment policy rules strictly preserved; zero autonomous AI/LLM conversions permitted.
7. **Tenant Isolation & Quarantine Restrictions:** Unresolved `DEP-T4-ANS-01`, `GOV-04`, and `DEP-GOV-TERM-01` maintained.

---

## 13. Deliverable & Final Implementation Gate

### 13.1 Repository Evidence Examined
- [`web/src/services/uadue/delivery/deliveryPostgresAdapter.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/deliveryPostgresAdapter.ts) (Lines 108–112): Confirmed silent error swallowing in `SET LOCAL ROLE`.
- [`web/src/services/uadue/delivery/sessionOrchestrator.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/sessionOrchestrator.ts) (Lines 866–876): Confirmed all 9 session writer methods use `SELECT ... FOR UPDATE` and zero writers acquire advisory locks.
- [`web/package.json`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/package.json) (Lines 36, 41): Confirmed `pg: ^8.23.0` dependency.
- [`supabase/migrations/20261007_uadue_phase2d8_canonical.sql`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase2d8_canonical.sql) (Lines 366–369): Confirmed blanket `ALL PRIVILEGES` granted to `uadue_app_user`.
- [`supabase/migrations/20261007_uadue_phase3_database_foundation.sql`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase3_database_foundation.sql) (Lines 304–307): Confirmed session table schema and duplicate blanket role grants.

### 13.2 Confirmed Defects & Unverified Assumptions
- **Confirmed Defect 1:** `deliveryPostgresAdapter.ts` swallows `SET LOCAL ROLE` failures, executing transactions as physical superuser.
- **Confirmed Defect 2:** In migrations, `uadue_app_user` holds blanket `ALL PRIVILEGES` across all tables, functions, and sequences.
- **Confirmed Architecture Blocker:** Table-based backend signaling in Policy Beta is defeated by PostgreSQL MVCC transaction visibility, and catalog lock inspection is defeated by tuple-header lock storage.
- **Unverified Assumption 1 (`[F]`):** Live deployment Supabase database credentials and role hierarchy.
- **Unverified Assumption 2 (`[F]`):** Target deployment availability of `pg_sodium` extension.

### 13.3 Product Owner Decisions Still Required
1. **Resolution of Termination Architecture (`DEP-GOV-TERM-01`):** Formally decide between Policy Alpha (Transactional Mutual Exclusion with Bounded Queuing) and Policy Beta (Preemptive Cancellation via Signal), recognizing the tuple-header lock storage constraint.
2. **Authorization of Database Role & RLS Migration Phase (`DEP-SEC-CHILD-01`, `DEP-SEC-GUC-01`):** Authorize stripping `uadue_app_user` of blanket privileges, creating `uadue_tenant_runtime`, and applying RLS to the six child tables.

### 13.4 Final Implementation Gate Verdict

| Evaluation Dimension | Current Assessment | Gate Verdict |
| :--- | :--- | :---: |
| **Durable Operation Ownership** | Two-phase leased reservation schema with fencing tokens defined; ambiguous reservation recovery modeled. | 🟢 **PASS (Design)** |
| **Advisory Lock Scope & Semantics**| Cooperative scope proven; absence of lock decoupled from rollback inference. | 🟢 **PASS (Design)** |
| **State Machine & Coordinator Evidence**| 7-state lifecycle defined; in-transaction aborts eliminated; supervisor evidence boundaries formalized. | 🟢 **PASS (Design)** |
| **Single-Transaction Atomicity**| Invariant proven; "Lost Receipt" rectified as fatal bug rather than execution branch. | 🟢 **PASS (Design)** |
| **Response Recovery & Re-Authorization**| Option A & B preserved; re-authorization gate decouples byte recovery from release authority. | 🟢 **PASS (Design)** |
| **Policy Beta Engine Feasibility**| Deconstructed tuple-header lock storage; `pg_locks` limits proven; `DEP-GOV-TERM-01` kept open. | 🟡 **OPEN (PO Decision)** |
| **Fail-Closed Role Boundary** | Defect confirmed in `deliveryPostgresAdapter.ts`; fail-closed abort specified; unmigrated. | 🔴 **BLOCKED** |
| **Child-Table RLS Completeness** | Six child tables audited; least-privilege inventory complete; migrations unapplied. | 🔴 **BLOCKED** |
| **Cryptographic Byte Verification**| Raw canonical byte pipeline formalized; test suite unexecuted. | 🔴 **UNCERTIFIED** |
| **Replay Matrix & Retention** | Dual-branch race model and 5-minute post-expiry pruning formalized. | 🟢 **PASS (Design)** |
| **Projection Contract Alignment** | Authoritative `EXAM:SOLUTION_AUDIT` preserved; live projection gated strictly to `ACTIVE`. | 🟢 **PASS** |

### **Overall Gate: 🔴 RED — Implementation and Candidate-Facing Integration Strictly Blocked**

**Summary for Gatekeeper:**  
Proposal v4.10 resolves the remaining recovery-protocol weaknesses of v4.9: it formalizes the durable operation ownership protocol with fencing tokens, reassesses advisory locking to eliminate the false inference that an absent lock proves an abort, corrects the operation state machine by requiring authoritative engine proof before persisting abort tombstones, rectifies the "Lost Receipt" anomaly as a structural invariant violation, and establishes an explicit Re-Authorization Gate that prevents emitting cached responses without re-verifying session state, tenancy, and quarantine status. Because database role migrations, child-table RLS policies, and all 85 adversarial test scenarios remain unapplied and unexecuted, the overall readiness gate remains strictly **🔴 RED**. Exactly zero application source files were modified, zero migrations were applied, and zero tests were executed.
