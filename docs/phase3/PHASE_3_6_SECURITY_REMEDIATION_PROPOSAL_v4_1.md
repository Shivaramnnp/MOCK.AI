# Mock.AI — Phase 3.6 Security Remediation Proposal v4.1
### Document Title: `PHASE_3_6_SECURITY_REMEDIATION_PROPOSAL_v4_1.md`
**Proposal Version:** `4.1.0-PRIVILEGE-CONCURRENCY-HARDENING`  
**Overall Readiness Gate:** 🔴 **RED — Implementation and Candidate-Facing Integration Strictly Blocked**  
**Document Status:** **STRICT DESIGN-ONLY AUDIT & ARCHITECTURAL SPECIFICATION**  
*(Strictly zero application source code modified, zero migrations applied, zero test suites executed)*

---

## 1. Document Status, Governance Locks & Audit Metadata

This document constitutes the definitive architectural design review and remediation specification **v4.1** for Mock.AI Phase 3.6. It directly corrects the four critical vulnerabilities and technical inconsistencies identified in the forensic review of proposal v4.0:

1. **Correction of the `SELECT ... FOR SHARE` Privilege Inconsistency:** Rectifies the inaccurate claim in v4.0 that `SELECT ... FOR SHARE` requires only `SELECT` privileges. It demonstrates engine locking privilege rules, evaluates the minimum viable column-level `UPDATE` grant on a non-authoritative operational column versus transactional advisory locks (`pg_advisory_xact_lock`), and details the exact least-privilege boundary.
2. **Correction of the Concurrency & Linearization Guarantee:** Eliminates the overstatement that row-level locking provides "serializable consistency" under Read Committed transaction isolation. It formally separates row-lock ordering, Read Committed snapshot semantics, the authorization linearization point, and the transaction-scoped projection-read boundary.
3. **Unambiguous Key-ID (`kid`) Cryptographic Binding:** Formulates a strict 6-step verification pipeline requiring `p_key_id` resolution, raw canonical byte signature validation, JSONB payload parsing, and an explicit identity assertion between the signed `kid` claim and the external `p_key_id` parameter, accompanied by explicit key lifecycle and emergency revocation policies.
4. **Exhaustive Replay, Rollback, and Ambiguous Commit Failure Matrix:** Formally models single committed consumption across eight distinct operational scenarios—including concurrent presentation of identical `jti`, uncommitted rollback retries, connection drops before commit, connection drops during commit (ambiguous commit), client retry after ambiguous commit, expiry during retry, and duplicate in-transaction bindings.

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

## 2. Change Log (v4.0 $\rightarrow$ v4.1)

1. **Corrected `SELECT ... FOR SHARE` Privilege Claim:** Replaced the erroneous assertion that `SELECT ... FOR SHARE` operates with zero `UPDATE` privileges. Documented PostgreSQL engine requirements where row-locking clauses enforce write privilege checks. Formulated two rigorous resolution paths: (a) Narrowest column-level grant (`GRANT UPDATE (lease_heartbeat_at) ON public.exam_sessions TO uadue_security_admin;`), and (b) Zero-write Transactional Advisory Locks (`pg_advisory_xact_lock`).
2. **Corrected Concurrency & Isolation Model:** Retracted claims of "serializable consistency under Read Committed." Proved that row locking provides mutual exclusion against concurrent updates on the locked row, while transaction isolation remains standard `READ COMMITTED`. Proved the authorization linearization point and defined the transaction boundary covering all protected projection queries.
3. **Formalized Key-ID Verification Contract:** Mandated an explicit equality assertion ($\text{payload.kid} \equiv \text{p\_key\_id}$) evaluated only after raw-byte signature verification. Detailed explicit rejection mechanics for unknown, retired, and revoked keys.
4. **Completed Replay & Retry Semantics Matrix:** Expanded the replay-prevention contract to eight exhaustive operational cases with deterministic database and caller-visible outcomes, specifically defining the client retry behavior after ambiguous network disconnects during commit.
5. **Preserved Frozen Phase 3 Contracts:** Reaffirmed `ACTIVE`-only live question access, zero question-viewing grace, 15-second submission transport grace only, `EXAM:SOLUTION_AUDIT` post-exam release boundary, and the least-privilege inventory of six unprotected canonical child tables.

---

## 3. Evidence Classification Taxonomy

Every significant finding, assertion, and design choice in this document is tagged with one of the following authoritative classifications:

- **`[A] Direct Repository Evidence`**: Verified by exact file path, line numbers, and contents in this repository.
- **`[B] Executed Test Evidence`**: Confirmed by executed test output in this workspace (all adversarial tests in this document are explicitly marked *unexecuted*).
- **`[C] Verified PostgreSQL Semantics`**: Verified against official PostgreSQL engine documentation, parser/executor source behavior, locking semantics, and catalog specifications.
- **`[D] Proposed Design`**: Architectural design, schema migration, or code pattern proposed for implementation.
- **`[E] Unresolved External Dependency`**: Blocking prerequisite external to the immediate gateway codebase.
- **`[F] Unverified Runtime Assumption`**: State of the live deployed database, network topology, or hosting environment that cannot be verified statically from repository code.

---

## 4. PostgreSQL Row Locking Privilege Correction (`SELECT ... FOR SHARE`)

### 4.1 Critical Specification Defect in Proposal v4.0 `[C]`, `[D]`
In proposal v4.0 (Section 5.3), it was asserted:
> *"SELECT ... FOR SHARE and SELECT ... FOR KEY SHARE lock rows against concurrent mutation, but require only SELECT privilege on the target table... Therefore, uadue_security_admin is granted strictly: GRANT SELECT ON public.exam_sessions TO uadue_security_admin; It is impossible for uadue_security_admin or any query inside bind_context to update, delete, or truncate rows..."*

**Defect Analysis (`[C]`):**  
This claim is technically inconsistent with PostgreSQL engine locking-clause privilege requirements.  
Under official PostgreSQL engine semantics (PostgreSQL 14, 15, and 16 documentation for `SELECT`, under section *The Locking Clause*):
- When a `SELECT` statement specifies `FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE`, or `FOR KEY SHARE`, the parser and executor check table-level and column-level privileges.
- Specifically, row-locking operations that take write-intent locks or shared row locks interact with PostgreSQL's tuple lock manager. Depending on the PostgreSQL major version, engine build, and presence of triggers or views, PostgreSQL requires `UPDATE` privilege on at least one column of each locked table (or table-level `UPDATE`).
- If `uadue_security_admin` is granted **strictly `SELECT`** with zero `UPDATE` privilege on any column of `public.exam_sessions`, executing `SELECT ... FOR SHARE` can fail with:
  ```
  ERROR: permission denied for table exam_sessions
  ```
  Consequently, as specified in v4.0, **the verifier function could be unable to execute its own session-locking query**, resulting in a fail-closed execution error.

### 4.2 Minimum Viable Privilege Arrangement (Option 1: Column-Level Grant) `[C]`, `[D]`
If row locking via `FOR SHARE` is retained directly on `public.exam_sessions`, least-privilege principles strictly prohibit granting blanket table-level `UPDATE` (`GRANT UPDATE ON public.exam_sessions`).  

The **minimum viable permission arrangement** requires restricting `UPDATE` privilege to exactly one non-authoritative operational column:

```sql
-- Owner: postgres / uadue_migration_owner
-- Grant minimum read privileges on required session columns:
GRANT SELECT (
    exam_session_id,
    tenant_id,
    candidate_id,
    package_id,
    package_integrity_seal,
    session_state,
    current_lease_id,
    actual_started_at,
    duration_seconds
) ON public.exam_sessions TO uadue_security_admin;

-- Grant column-level UPDATE on strictly one operational heartbeat column:
GRANT UPDATE (lease_heartbeat_at) ON public.exam_sessions TO uadue_security_admin;
```

#### Security Consequence Audit of Column-Level Grant:
1. **Scope Limitation:** `uadue_security_admin` possesses `UPDATE` rights **only** on `lease_heartbeat_at`. It has zero update rights on `session_state`, `candidate_id`, `tenant_id`, `package_id`, `package_integrity_seal`, or `current_lease_id`.
2. **Defensive Isolation:** Even if an arbitrary SQL injection defect were present inside the procedural code of `bind_context`, an attacker executing as `uadue_security_admin` **cannot** alter session states, extend deadlines, change candidate assignments, or swap packages.
3. **Execution Context:** `uadue_security_admin` is marked `NOLOGIN` and `NOINHERIT`. It cannot be authenticated interactively. It is invoked exclusively via `SECURITY DEFINER` within `bind_context`.

### 4.3 Alternative Architecture: Transactional Advisory Locks (Option 2: Zero-Write Mutex) `[C]`, `[D]`
To eliminate any `UPDATE` grant on `public.exam_sessions` altogether, the architecture can utilize **PostgreSQL Transaction-Scoped Advisory Locks**:

```sql
-- uadue_auth.bind_context procedural execution:
-- Acquire transactional advisory lock hashed over the session UUID:
PERFORM pg_advisory_xact_lock(
    hashtext('mockai_exam_session:' || v_sid::text)::bigint
);

-- Execute pure SELECT without any locking clause:
SELECT
    tenant_id,
    candidate_id,
    package_id,
    package_integrity_seal,
    session_state,
    current_lease_id,
    actual_started_at,
    duration_seconds
INTO
    v_db_tenant_id,
    v_db_candidate_id,
    v_db_package_id,
    v_db_seal,
    v_db_state,
    v_db_lease_id,
    v_started_at,
    v_duration_seconds
FROM public.exam_sessions
WHERE exam_session_id = v_sid;
```

#### Mutex Pairing with Proctor Operations:
When a proctor or administrative workflow pauses, terminates, or modifies `exam_sessions`, the proctor procedure must execute the identical advisory lock:
```sql
-- Administrative state mutation procedure:
PERFORM pg_advisory_xact_lock(
    hashtext('mockai_exam_session:' || p_exam_session_id::text)::bigint
);
UPDATE public.exam_sessions
SET session_state = p_new_state
WHERE exam_session_id = p_exam_session_id;
```

#### Privilege & Operational Comparison:

| Dimension | Option 1: `SELECT ... FOR SHARE` with Column `UPDATE` | Option 2: `pg_advisory_xact_lock` + Pure `SELECT` |
| :--- | :--- | :--- |
| **Privileges on `exam_sessions`** | `SELECT` on 9 columns + `UPDATE (lease_heartbeat_at)` | **Strictly `SELECT` on 9 columns. Zero `UPDATE`.** |
| **PostgreSQL Built-in Primitives** | Standard row lock manager (`tuple lock`). | Built-in advisory lock manager (`locktag_advisory`). |
| **Proctor Implementation Coupling** | Automatic: any standard SQL `UPDATE` blocks on row lock. | Explicit: administrative code must acquire advisory lock. |
| **Deadlock Risk** | Low (ordered by single tuple). | Low (single hash key per session). |
| **Hash Collision Risk** | None (keyed by actual physical tuple ID). | Negligible ($1 \text{ in } 2^{64}$ with 64-bit bigint hash). |
| **Architectural Verdict** | Viable, but requires column-level `UPDATE`. | **Recommended Architectural Target** for pure least privilege. |

---

## 5. Concurrency Guarantee, Linearization & Transaction Boundaries

### 5.1 Dissecting the v4.0 Concurrency Overstatement `[C]`
Proposal v4.0 stated:
> *"Serializable row-level ordering is guaranteed under standard Read Committed isolation level."*

**Technical Clarification (`[C]`):**  
This statement conflates row-level mutual exclusion with `SERIALIZABLE` transaction isolation.  
- Under PostgreSQL `READ COMMITTED` isolation, acquiring a row lock (`FOR SHARE`) or advisory lock guarantees **mutual exclusion against concurrent modifications on that specific row**.
- It does **not** provide `SERIALIZABLE` transaction isolation. `READ COMMITTED` allows non-repeatable reads on un-locked relations and phantom reads across range queries.
- Mock.AI does not require global serializable isolation across the entire cluster; it requires **strict linearization of authorization state and mutual exclusion against concurrent proctor transitions**.

### 5.2 The Six Architectural Facets of Concurrency

```
Candidate Transaction (Tc)                    Proctor Transaction (Tp)
─────────────────────────                    ────────────────────────
1. BEGIN (Read Committed)                     1. BEGIN (Read Committed)
2. bind_context(ticket)                       2. Proctor decides to terminate
   • pg_advisory_xact_lock(sid)                 • attempts pg_advisory_xact_lock(sid)
     [ACQUIRED AT TIME T_lin]                     --> BLOCKS WAITING FOR Tc!
   • Validates 12 claims against DB
   • Verifies session_state == 'ACTIVE'
   • Inserts active_contexts row
3. Projection Queries:
   • SELECT * FROM exam_session_projections
   • SELECT * FROM canonical_package_items
   [Protected by active lock]
4. COMMIT (Time T_end)                        --> Tp UNBLOCKS at T_end
   • Active lock released                        • Reads current DB state
   • Ticket committed to consumed_tickets        • Executes UPDATE exam_sessions
                                                   SET session_state = 'TERMINATED';
                                                 • COMMIT;
```

#### 1. Row-Lock / Advisory-Lock Ordering:
- Locks on the session are acquired at the start of `bind_context` before any session state is evaluated.
- Any conflicting proctor mutation attempting to pause, resume, or terminate the session must acquire the exclusive lock and is forced to wait in the PostgreSQL lock queue.

#### 2. Transaction Isolation Level:
- Operates under standard `READ COMMITTED`.
- Because the session is locked before its state is read, the candidate transaction reads the latest committed tuple without interference from uncommitted concurrent transactions.

#### 3. Authorization Linearization Point ($T_{\text{lin}}$):
- The **exact instant of authorization linearization** is the millisecond when `bind_context` acquires the session lock and validates that `session_state == 'ACTIVE'` and $\text{clock\_timestamp}() \le \text{deadline}$.
- Prior to $T_{\text{lin}}$, the ticket is unverified and uncommitted.
- After $T_{\text{lin}}$, authorization is established for this transaction.

#### 4. Projection-Read Completion & Transaction Boundary:
- The transaction boundary begins at `BEGIN` before `bind_context` and ends at `COMMIT` **only after all client projection queries have completed**.
- The lock is held continuously across the entire transaction boundary.
- **Guarantee:** All projection reads finish before any concurrent proctor state change is permitted to take effect.

#### 5. Concurrent Proctor Pause or Termination:
- **Scenario A (Candidate acquires lock first):** Proctor's update blocks until candidate transaction finishes. Candidate receives complete projection data for the session that was active when requested. Once candidate commits, proctor update unblocks and applies `TERMINATED`.
- **Scenario B (Proctor acquires lock first):** Candidate's `bind_context` blocks. Proctor commits `session_state = 'TERMINATED'` and releases lock. Candidate's lock unblocks, reads the newly committed tuple, evaluates Gate 2, observes `session_state = 'TERMINATED'`, and immediately raises `ERR_SESSION_NOT_ACTIVE (P0013)`. No projection data is ever returned.

#### 6. Commit and Rollback Behavior:
- **On `COMMIT`:** The `consumed_tickets` row is committed. The transaction-scoped context in `active_contexts` remains tied to the completed `xid8`. The socket is returned to the connection pool clean.
- **On `ROLLBACK`:** All uncommitted inserts (`consumed_tickets`, `active_contexts`) are discarded by PostgreSQL. All locks are immediately released.

### 5.3 Preservation of Frozen Phase 3 Contracts `[A]`
- **`ACTIVE`-Only Live Question Access:** Strictly enforced. If `exam_sessions.session_state` is `INITIALIZED`, `PAUSED`, `RECOVERY_PENDING`, `SUBMITTED`, `EXPIRED`, or `TERMINATED`, projection retrieval is denied (`P0013`).
- **Zero Question-Viewing Grace:** The deadline is calculated strictly as `actual_started_at + (duration_seconds * INTERVAL '1 second')`. If `clock_timestamp()` exceeds this timestamp by even 1 millisecond, the query is rejected (`ERR_EXAM_EXPIRED (P0014)`).
- **Submission Transport Grace Contract:** The 15-second grace window is reserved strictly for answer submission events (`candidate_submission_events`) via the submission pipeline, and is strictly prohibited for question projection viewing.

---

## 6. Cryptographic Key-ID Binding & Verification Contract

### 6.1 Strict Six-Step Verification Pipeline `[C]`, `[D]`

The verifier procedure `uadue_auth.bind_context` accepts raw canonical bytes, a detached binary signature, and an explicit key identifier:

```sql
FUNCTION uadue_auth.bind_context(
    p_raw_canonical_payload BYTEA,  -- Raw RFC 8785 canonical UTF-8 bytes
    p_signature             BYTEA,  -- Exactly 64-byte Ed25519 detached signature
    p_key_id                TEXT    -- Verification key identifier
) RETURNS VOID
```

Execution proceeds through six mandatory sequential steps:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 1: Input Syntax Validation                                            │
│ • Assert p_key_id is non-null, non-empty, and matches regex ^[a-zA-Z0-9_-]+$│
│ • If invalid: RAISE EXCEPTION P0019 (ERR_KEY_ID_MALFORMED)                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ Step 2: Key Resolution & Status Verification                                │
│ • Query uadue_auth.verification_keys WHERE key_id = p_key_id                │
│ • If NOT FOUND: RAISE EXCEPTION P0017 (ERR_KEY_UNKNOWN)                     │
│ • If status == 'REVOKED': RAISE EXCEPTION P0016 (ERR_KEY_REVOKED)           │
│ • If status == 'RETIRED': Check retired_at (see Section 6.2)                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Step 3: Raw Canonical Byte Cryptographic Verification                       │
│ • Verify p_signature over p_raw_canonical_payload using resolved public_key│
│ • Evaluated via pg_sodium.crypto_sign_verify_detached(...)                  │
│ • If FALSE: RAISE EXCEPTION P0001 (ERR_SIGNATURE_INVALID)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Step 4: Secure Payload Deserialization                                      │
│ • Execute ONLY AFTER Step 3 cryptographic verification passes               │
│ • v_payload := jsonb(convert_from(p_raw_canonical_payload, 'UTF8'))         │
│ • If malformed JSON: RAISE EXCEPTION P0020 (ERR_PAYLOAD_MALFORMED)          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Step 5: Unambiguous Key-ID Equality Assertion                               │
│ • Extract v_signed_kid := v_payload->>'kid'                                │
│ • Assert: v_signed_kid IS NOT NULL AND v_signed_kid = p_key_id              │
│ • If mismatch: RAISE EXCEPTION P0018 (ERR_KEY_ID_MISMATCH)                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ Step 6: 12-Claim Validation & Authoritative Database Revalidation          │
│ • Validate all 12 signed claims against DB session record (Section 7)       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Key Lifecycle, Rotation & Emergency Revocation Policy `[D]`

The schema `uadue_auth.verification_keys` enforces strict status transitions:

```sql
CREATE TABLE uadue_auth.verification_keys (
    key_id      TEXT PRIMARY KEY,
    algorithm   TEXT NOT NULL CHECK (algorithm IN ('Ed25519', 'HMAC-SHA256')),
    public_key  BYTEA NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('ACTIVE', 'RETIRED', 'REVOKED')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    retired_at  TIMESTAMPTZ,
    revoked_at  TIMESTAMPTZ
);
REVOKE ALL ON uadue_auth.verification_keys FROM PUBLIC, uadue_tenant_runtime;
```

#### Status Transition Rules:
1. **`ACTIVE` $\rightarrow$ `RETIRED` (Standard Scheduled Rotation):**
   - When a new key is introduced, the old key's status is set to `'RETIRED'` with `retired_at = clock_timestamp()`.
   - **Validation Rule:** Tickets referencing a `'RETIRED'` key are valid **if and only if** their issued timestamp satisfies:
     $$\text{ticket.iat} \le \text{retired\_at} \quad \text{AND} \quad \text{clock\_timestamp}() \le \text{ticket.exp}$$
   - Any ticket issued *after* `retired_at` referencing the retired key is rejected with `ERR_KEY_RETIRED (P0021)`.
2. **`ACTIVE` / `RETIRED` $\rightarrow$ `REVOKED` (Emergency Security Revocation):**
   - If a signing private key is compromised or exposed, an administrator updates status to `'REVOKED'` with `revoked_at = clock_timestamp()`.
   - **Validation Rule:** Any presentation of a revoked key is immediately and unconditionally rejected with `ERR_KEY_REVOKED (P0016)`. All uncommitted in-flight tickets are instantly invalidated.

### 6.3 Verification Truthfulness Declaration `[B]`, `[F]`
- **Unexecuted Test Status (`[B]`):** The cryptographic verification logic (`pg_sodium` and RFC 8785 canonical UTF-8 bytes) is a **design specification**. No cross-language unit tests or database verification procedures have been executed in this workspace.
- **Runtime Dependency Assumption (`[F]`):** Relies on `pg_sodium` extension availability in the target PostgreSQL runtime environment.

---

## 7. Exhaustive Replay, Rollback, and Retry Failure Matrix

### 7.1 Single Committed Consumption Contract `[C]`, `[D]`
The security contract is formally defined as:  
**Guaranteed Single-Commit Consumption with Concurrent Mutual Exclusion**.  
A ticket's unique identifier (`jti`) is permanently consumed if and only if the transaction that presented it successfully **commits**. If the transaction **rolls back**, the ledger insertion is rolled back by the database engine, permitting legitimate retry within the 15-second ticket validity window.

### 7.2 Exhaustive Failure Matrix (8 Operational Scenarios)

| Scenario ID | Operational Event | Is Ticket Consumed? | Retry Permitted? | Expected Database State | Expected Caller-Visible Result | Deterministic Outcome? |
| :---: | :--- | :---: | :---: | :--- | :--- | :---: |
| **SC-01** | **Two concurrent requests using same `jti` ($T_1, T_2$)** | Yes (by winning transaction) | For $T_1$: No (done)<br/>For $T_2$: 🔴 Forbidden | Single row `(jti, expires_at)` in `consumed_tickets`. | $T_1$ receives projection data (200 OK).<br/>$T_2$ blocks, unblocks on $T_1$ commit, throws `P0006 (ERR_REPLAY_DETECTED)`. | ✅ **Yes** (B-Tree unique index serialization) |
| **SC-02** | **First transaction commits successfully** | ✅ **Yes, permanently** | 🔴 **Strictly Forbidden** | Row committed in `uadue_auth.consumed_tickets`. | Initial request succeeds (200 OK). Any future presentation raises `P0006`. | ✅ **Yes** |
| **SC-03** | **First transaction rolls back (e.g., query timeout)** | ❌ **No** | 🟢 **Permitted** (within 15s window) | Zero rows for `jti` in `consumed_tickets`. Rollback completely cleans ledger. | First request fails with query error. Client may retry with same ticket before `exp`. | ✅ **Yes** |
| **SC-04** | **Connection loss BEFORE commit (socket drop during query)** | ❌ **No** | 🟢 **Permitted** (within 15s window) | Zero rows in `consumed_tickets`. PostgreSQL automatically rolls back aborted socket. | Client observes TCP RST / socket hangup. Re-presenting ticket in fresh connection succeeds. | ✅ **Yes** |
| **SC-05** | **Connection loss AFTER commit but BEFORE response delivery** | ✅ **Yes, permanently** | 🔴 **Forbidden with same `jti`** | Row committed in `consumed_tickets`. Projection was generated on server. | Client observes timeout / disconnect. Client cannot distinguish commit success from failure (Ambiguous Commit). | ✅ **Yes** (Server state is committed) |
| **SC-06** | **Client retry after ambiguous commit (retries same `jti`)** | ✅ **Already consumed** | 🔴 **Forbidden with same `jti`** | Row remains in `consumed_tickets`. | Client receives `ERR_REPLAY_DETECTED (P0006)`. Client gateway must request fresh ticket. | ✅ **Yes** |
| **SC-07** | **Ticket expiry during retry ($T_{\text{clock}} > \text{exp}$)** | ❌ **No** | 🔴 **Forbidden** (expired) | Zero rows for `jti` in `consumed_tickets`. | Verifier evaluates Gate 1 claim `exp` and throws `ERR_TICKET_EXPIRED (P0005)`. | ✅ **Yes** |
| **SC-08** | **Duplicate `bind_context` call within single transaction** | ❌ **Transaction aborted** | 🔴 **Forbidden** | `active_contexts` detects duplicate `(backend_pid, tx_id)` and throws `P0015`. | Verifier raises `ERR_DUPLICATE_BINDING (P0015)`. Entire transaction enters aborted state. | ✅ **Yes** |

---

## 8. Authoritative 12-Claim Validation Contract & Database Revalidation

### 8.1 Exhaustive Signed Claims Inventory `[D]`

Every ticket canonicalized via RFC 8785 and signed by the authorization authority must contain exactly twelve (12) signed claims:

| # | Claim | Type | Required? | Signed? | Authoritative Source | Validation Rule | Error Code on Failure |
| :-: | :---: | :---: | :---: | :---: | :--- | :--- | :---: |
| **1** | **`iss`** | `TEXT` | Required | Signed | Static Security Policy | Must strictly equal `'mockai-auth-authority'` | `ERR_ISSUER_INVALID (P0002)` |
| **2** | **`aud`** | `TEXT` | Required | Signed | Static Security Policy | Must strictly equal `'mockai-delivery-db'` | `ERR_AUDIENCE_INVALID (P0003)` |
| **3** | **`kid`** | `TEXT` | Required | Signed | Parameter `p_key_id` | Must strictly equal `p_key_id` | `ERR_KEY_ID_MISMATCH (P0018)` |
| **4** | **`jti`** | `TEXT` | Required | Signed | `uadue_auth.consumed_tickets` | Must not exist; inserted with unique constraint | `ERR_REPLAY_DETECTED (P0006)` |
| **5** | **`iat`** | `BIGINT` | Required | Signed | `clock_timestamp()` | Must satisfy: $\text{iat} \le \text{clock\_timestamp}() + 2\text{s}$ | `ERR_FUTURE_TOKEN (P0004)` |
| **6** | **`exp`** | `BIGINT` | Required | Signed | `clock_timestamp()` | Must satisfy: $\text{clock} \le \text{exp}$ and $\text{exp} - \text{iat} \le 15\text{s}$ | `ERR_TICKET_EXPIRED (P0005)` |
| **7** | **`sub`** | `TEXT` | Required | Signed | `exam_sessions.candidate_id` | Must strictly equal database candidate UUID | `ERR_CANDIDATE_MISMATCH (P0007)` |
| **8** | **`sid`** | `TEXT` | Required | Signed | `exam_sessions.exam_session_id` | Must strictly equal database session UUID | `ERR_SESSION_NOT_FOUND (P0008)` |
| **9** | **`tid`** | `TEXT` | Required | Signed | `exam_sessions.tenant_id` | Must strictly equal database tenant UUID | `ERR_TENANT_MISMATCH (P0009)` |
| **10**| **`pkg`** | `TEXT` | Required | Signed | `exam_sessions.package_id` | Must strictly equal database package UUID | `ERR_PACKAGE_MISMATCH (P0010)` |
| **11**| **`seal`**| `TEXT` | Required | Signed | `exam_sessions.package_integrity_seal`| Must strictly equal database 64-char hex seal | `ERR_SEAL_MISMATCH (P0011)` |
| **12**| **`lease`**| `TEXT`| Required | Signed | `exam_sessions.current_lease_id` | Must strictly equal database active lease UUID | `ERR_LEASE_SUPERSEDED (P0012)` |

### 8.2 Real-Time Database FSM & Deadline Revalidation (Gate 2) `[A]`, `[C]`
The database session record fetched under mutual exclusion—**never caller-supplied parameters**—is authoritative:
1. **FSM State Revalidation:**  
   `exam_sessions.session_state` must strictly equal `'ACTIVE'`. Any other state (`INITIALIZED`, `PAUSED`, `RECOVERY_PENDING`, `SUBMITTED`, `EXPIRED`, `TERMINATED`) throws `ERR_SESSION_NOT_ACTIVE (P0013)`.
2. **Authoritative Deadline Revalidation:**  
   $$\text{clock\_timestamp}() \le \text{exam\_sessions.actual\_started\_at} + (\text{exam\_sessions.duration\_seconds} \times \text{INTERVAL '1 second'})$$
   Zero question-viewing grace is permitted. Violation immediately throws `ERR_EXAM_EXPIRED (P0014)`.
3. **Immutability of Authoritative Properties:**  
   Untrusted caller parameters can never override or substitute tenant ID, candidate ID, package ID, integrity seal, or active lease ID.

---

## 9. Transaction-Context Lifecycle, Immutability & Pooling Mechanics

### 9.1 PostgreSQL Transaction ID Semantics (`xid8`) `[C]`
- `pg_backend_pid()`: Returns the integer process ID of the PostgreSQL server process handling the client socket.
- `pg_current_xact_id()`: Materializes a true 64-bit transaction identifier (`xid8`) in the PostgreSQL transaction log (`pg_xact`). Calling this function upgrades a read-only virtual transaction (`vxid`) into a materialized transaction.
- `pg_current_xact_id_if_assigned()`: Returns the assigned `xid8`, or `NULL` if no real transaction ID has been assigned.

### 9.2 Context Table Schema & Immutability Proof `[C]`, `[D]`

The persistent context table is defined in the private `uadue_auth` schema:

```sql
CREATE TABLE uadue_auth.active_contexts (
    backend_pid     INTEGER NOT NULL,
    tx_id           XID8 NOT NULL,
    tenant_id       UUID NOT NULL,
    candidate_id    UUID NOT NULL,
    exam_session_id UUID NOT NULL,
    package_id      UUID NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (backend_pid, tx_id)
);
REVOKE ALL ON uadue_auth.active_contexts FROM PUBLIC, uadue_tenant_runtime;
```

#### Immutability & Duplicate Bind Denial:
Context insertion executes as an explicit `INSERT`:
```sql
INSERT INTO uadue_auth.active_contexts (
    backend_pid, tx_id, tenant_id, candidate_id, exam_session_id, package_id, expires_at
) VALUES (
    pg_backend_pid(), pg_current_xact_id(), v_db_tenant_id, v_db_candidate_id, v_sid, v_db_package_id, to_timestamp(v_exp)
);
```
- **Duplicate Insertion Behavior:** If a client attempts to invoke `bind_context` a second time within transaction $T_1$, the composite primary key `(backend_pid, tx_id)` causes an immediate primary key violation (`23505`).
- The verifier catches this and throws `ERR_DUPLICATE_BINDING (P0015)`, aborting the transaction.
- Context modification (`UPDATE`) is strictly prohibited. Context is strictly immutable for the duration of the transaction.

### 9.3 Connection Pool Safety & Driver Lifecycle `[C]`, `[D]`
In node-postgres (`pg`):
1. **Transaction Wrapping:** Every projection query execution is wrapped strictly in:
   ```typescript
   const client = await pool.connect();
   try {
     await client.query('BEGIN');
     await client.query('SELECT uadue_auth.bind_context($1, $2, $3)', [rawBytes, sig, kid]);
     const projection = await client.query('SELECT * FROM exam_session_projections WHERE exam_session_id = $1', [sid]);
     await client.query('COMMIT');
     return projection.rows[0];
   } catch (err) {
     await client.query('ROLLBACK').catch(() => {});
     throw err;
   } finally {
     client.release();
   }
   ```
2. **Socket Reuse Isolation:** When transaction $T_1$ completes (`COMMIT` or `ROLLBACK`) and the socket is returned to the pool:
   - When subsequent transaction $T_2$ begins on that socket, PostgreSQL assigns a **new, unique `xid8`**.
   - The accessor `uadue_auth.get_current_tenant_id()` looks up `WHERE backend_pid = pg_backend_pid() AND tx_id = pg_current_xact_id_if_assigned()`.
   - Because $T_2$'s transaction ID does not match the historical row from $T_1$, the accessor evaluates to `NULL`.
   - Zero context leaks across pooled connections.
3. **Dead Row Cleanup:** A lightweight background sweep deletes rows where `expires_at < clock_timestamp()`.

---

## 10. Child-Table Access Control & Least-Privilege Inventory

### 10.1 Schema Audit of the Six Unprotected Child Tables `[A]`, `[C]`
Direct inspection of migration [20261007_uadue_phase2d8_canonical.sql](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase2d8_canonical.sql) reveals six child tables lacking Row-Level Security:

| Table Name | Source Lines | Current RLS State | Current Grants (`uadue_app_user`) | Required RLS Action | Required Permission (`uadue_tenant_runtime`) |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **`canonical_logical_families`** | lines 115–123 | ❌ **NONE** | 🔴 `ALL PRIVILEGES` | `ENABLE + FORCE RLS` | 🔴 **`REVOKE ALL`** (Candidate denied entirely) |
| **`canonical_relationship_evaluations`**| lines 126–139 | ❌ **NONE** | 🔴 `ALL PRIVILEGES` | `ENABLE + FORCE RLS` | 🔴 **`REVOKE ALL`** (Forensic evaluations denied) |
| **`canonical_family_memberships`** | lines 142–151 | ❌ **NONE** | 🔴 `ALL PRIVILEGES` | `ENABLE + FORCE RLS` | 🔴 **`REVOKE ALL`** (Internal memberships denied) |
| **`canonical_quarantined_relationships`**| lines 154–164 | ❌ **NONE** | 🔴 `ALL PRIVILEGES` | `ENABLE + FORCE RLS` | 🔴 **`REVOKE ALL`** (Quarantine records denied) |
| **`canonical_package_supersessions`** | lines 177–186 | ❌ **NONE** | 🔴 `ALL PRIVILEGES` | `ENABLE + FORCE RLS` | 🟢 `SELECT` (Gated to `get_current_package_id()`) |
| **`canonical_assets`** | lines 204–212 | ❌ **NONE** | 🔴 `ALL PRIVILEGES` | `ENABLE + FORCE RLS` | 🔴 **`REVOKE ALL`** (Direct SQL byte access denied) |

### 10.2 Strict Denial of Direct SQL Access to `canonical_assets` `[A]`, `[D]`
[PHASE_3_PROJECTION_CONTRACT.md:75](file:///Users/shivarampatel/Desktop/MOCK.AI/docs/phase3/PHASE_3_PROJECTION_CONTRACT.md#L75) mandates that exam media assets are delivered via **secure, signed URLs**.  
- Candidate runtime role `uadue_tenant_runtime` has **`REVOKE ALL ON public.canonical_assets`**.
- Candidates are physically prohibited from issuing `SELECT asset_data FROM canonical_assets`.
- Assets are signed and distributed by an air-gapped media delivery service.

---

## 11. Expanded Adversarial Test Plan (18 Scenarios)

The following eighteen (18) adversarial scenarios define the mandatory pre-execution test suite. All tests are currently **UNEXECUTED (`[B]`)**:

| Test ID | Threat Scenario | Preconditions & Attacker Vector | Database State Before $\rightarrow$ After | Expected Outcome | Security Property Verified |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **ADV-01** | **Tenant Claim Substitution** | Attacker presents valid signature with `tid = 'tenant_victim'`. | Session `sess_01` has `tenant_id = 'tenant_actual'`. | Transaction aborts with `ERR_TENANT_MISMATCH (P0009)`. | Cryptographic tenant binding. |
| **ADV-02** | **Package Claim Substitution** | Attacker presents valid signature with `pkg = 'pkg_confidential'`. | Session `sess_01` has `package_id = 'pkg_assigned'`. | Transaction aborts with `ERR_PACKAGE_MISMATCH (P0010)`. | Package entitlement boundary. |
| **ADV-03** | **Package Integrity Tampering** | Attacker presents ticket with altered `seal = 'tampered_hex'`. | Session `sess_01` has authentic seal. | Transaction aborts with `ERR_SEAL_MISMATCH (P0011)`. | Package seal integrity binding. |
| **ADV-04** | **Issuer / Audience Spoofing** | Attacker sets `iss = 'rogue_idp'` or `aud = 'public_api'`. | Key exists; verifier evaluates headers. | Transaction aborts with `ERR_ISSUER_INVALID (P0002)`. | Issuer/Audience scope locking. |
| **ADV-05** | **Future Token Presentation** | Attacker presents ticket with `iat = clock_timestamp() + 10s`. | Database clock is authoritative. | Transaction aborts with `ERR_FUTURE_TOKEN (P0004)`. | Clock skew & future token ban. |
| **ADV-06** | **Excessive Lifetime Token** | Attacker presents ticket with $\text{exp} - \text{iat} = 60\text{s}$ ($> 15\text{s}$). | Ticket presented within 60s. | Transaction aborts with `ERR_TICKET_EXPIRED (P0005)`. | 15-second lifetime ceiling. |
| **ADV-07** | **Duplicate In-Transaction Bind** | Attacker invokes `bind_context` twice in same SQL transaction. | First bind succeeds. Second bind executes. | Second call throws `ERR_DUPLICATE_BINDING (P0015)`. Entire transaction aborts. | Single-transaction context immutability. |
| **ADV-08** | **Committed Replay Attack** | Attacker presents `jti_01` after previous transaction committed. | `jti_01` committed in `consumed_tickets`. | Transaction aborts with `ERR_REPLAY_DETECTED (P0006)`. | One-time commit consumption. |
| **ADV-09** | **Concurrent Replay Presentation**| Two connections present `jti_01` at identical millisecond. | Concurrency race on unique index. | $T_1$ commits; $T_2$ blocks, detects duplicate, and throws `P0006`. | Concurrent mutual exclusion. |
| **ADV-10** | **Rollback Retry Verification** | Transaction $T_1$ rolls back on query timeout; client retries. | $T_1$ unrolls `jti_01`. $T_2$ presents same ticket within 15s. | $T_2$ successfully inserts `jti_01` and executes. | Legitimate rollback retry support. |
| **ADV-11** | **Socket Reuse Isolation** | $T_1$ commits. Socket reused by client without calling `bind_context`. | Row has $T_1$ `xid8`. Current transaction is $T_2$. | Accessor returns `NULL`. Queries return 0 rows. | Connection-pool session cleanliness. |
| **ADV-12** | **Concurrent Proctor Revocation** | Proctor terminates session concurrently with projection read. | Proctor acquires lock, commits `TERMINATED`. | Candidate unblocks, reads `TERMINATED`, throws `P0013`. | Concurrency linearization. |
| **ADV-13** | **`SECURITY DEFINER` Escalation** | Runtime executes `SET ROLE uadue_security_admin`. | Runtime role has `NOLOGIN`, `NOINHERIT`. | PostgreSQL throws `permission denied for role`. | Role escalation lockout. |
| **ADV-14** | **JSONB Formatting Divergence** | Ticket signed over non-canonical JSON (extra whitespace, altered keys). | PostgreSQL verifies raw canonical bytes first. | Signature verification fails (`P0001`). Transaction aborts. | Bit-for-bit JCS verification. |
| **ADV-15** | **Emergency Key Revocation** | Ticket signed with key ID marked `'REVOKED'` in `verification_keys`. | Key row has `status = 'REVOKED'`. | Transaction aborts with `ERR_KEY_REVOKED (P0016)`. | Cryptographic revocation support. |
| **ADV-16** | **Direct Child-Table Dumping** | Runtime executes `SELECT * FROM canonical_logical_families`. | `REVOKE ALL` enforced on table. | Query fails with `permission denied for table`. | Child-table least-privilege boundary. |
| **ADV-17** | **Key-ID Mismatch Attack** | Attacker signs valid payload with Key B, but specifies `p_key_id = 'key_a'`. | Verifier resolves Key A, checks bytes. | Signature fails or Step 5 assertion detects mismatch (`P0018`). | Key-ID claim binding. |
| **ADV-18** | **Retired Key Expiry Check** | Attacker presents ticket issued *after* key's `retired_at` timestamp. | Key row has `status = 'RETIRED'`. | Transaction aborts with `ERR_KEY_RETIRED (P0021)`. | Key retirement grace boundary. |

---

## 12. Evidence & Final Implementation Gate

### 12.1 Critical Corrections Accomplished in v4.1
1. **Rectified Row-Locking Privilege Defect:** Corrected the erroneous assertion that `SELECT ... FOR SHARE` requires zero update privileges. Evaluated column-level `UPDATE (lease_heartbeat_at)` versus transactional advisory locks (`pg_advisory_xact_lock`), specifying advisory locking as the preferred zero-write design.
2. **Corrected Concurrency Linearization:** Retracted invalid claims of "serializable consistency under Read Committed." Proved row-lock mutual exclusion, Read Committed snapshot semantics, authorization linearization point, and transaction boundary across projection queries.
3. **Hardened Key-ID Binding:** Formally specified the Step 5 assertion ($\text{payload.kid} \equiv \text{p\_key\_id}$) and documented explicit handling for unknown, retired, and revoked keys.
4. **Completed Failure Matrix:** Detailed deterministic outcomes across eight operational scenarios, resolving ambiguity around rollbacks, connection losses, and ambiguous commits.

### 12.2 Remaining Contradictions & Unverified Assumptions
- **`[F]` Runtime Extension Availability:** Availability of `pg_sodium` in the live Supabase/PostgreSQL environment remains an unverified runtime assumption.
- **`[B]` Cryptographic Interoperability:** Cross-language compatibility between Node.js RFC 8785 byte generation and PostgreSQL Ed25519 verification remains an unexecuted design proposal.
- **`[A]` Current Migration Grants:** Current repository migrations still configure only `uadue_app_user` with blanket `ALL PRIVILEGES`.

### 12.3 Consolidated Register of Blocking Dependencies

| Dependency ID | Subsystem | Vulnerability / Defect Addressed | Blocking Status |
| :--- | :--- | :--- | :---: |
| **`DEP-SEC-GUC-01`** | Database Architecture | Caller-settable GUC vulnerability; `uadue_auth` schema and advisory lock migration unapplied. | 🔴 **CRITICAL BLOCKER** |
| **`DEP-SEC-TENANT-01`**| Edge Authentication | Candidate edge authentication middleware and ticket signing service unbuilt. | 🔴 **CRITICAL BLOCKER** |
| **`DEP-SEC-SESS-01`** | Operational Delivery | Session authorization and FSM hydration guard unbuilt. | 🔴 **CRITICAL BLOCKER** |
| **`DEP-SEC-CHILD-01`** | Database Migrations | Six canonical child tables lack RLS and grant blanket privileges. | 🔴 **CRITICAL BLOCKER** |
| **`DEP-T4-ANS-01`** | Results & Evaluation | Decoupled post-exam answer release pipeline and `packageResultReleased` check unbuilt. | 🔴 **CRITICAL BLOCKER** |
| **`GOV-04`** | Content Governance | Quarantine promotion workflow and cryptographic signing authority unbuilt. | 🔴 **CRITICAL BLOCKER** |

### 12.4 Product Owner Decisions vs Autonomous Engineering Tasks

#### Product Owner Decisions Required:
1. **Locking Mechanism Selection (`DEP-SEC-GUC-01`):** Formally decide between Option 1 (Column-level `UPDATE` on `lease_heartbeat_at` with `FOR SHARE`) and Option 2 (Transactional Advisory Locks with zero `UPDATE` privileges).
2. **Authorization of Migration Phase (`DEP-SEC-CHILD-01`):** Formally authorize drafting and applying the migration enabling RLS on the six child tables and revoking candidate SQL access to `canonical_assets`.

#### Autonomous Engineering Tasks (Once Authorized):
1. Draft migration for schema `uadue_auth`, `active_contexts`, `consumed_tickets`, and `verification_keys`.
2. Implement Node.js ticket-signing service implementing RFC 8785 canonical serialization.
3. Execute the 18-scenario adversarial test suite against a dedicated staging PostgreSQL instance.

---

## 13. Final Implementation Gate Verdict

| Evaluation Dimension | Current Assessment | Gate Verdict |
| :--- | :--- | :---: |
| **Database Privilege Boundary** | Rectified row-locking privilege model; advisory lock alternative formalized; unmigrated. | 🔴 **BLOCKED** |
| **Candidate Session Authorization** | Concurrency linearization and transaction boundaries proven; edge middleware unbuilt. | 🔴 **BLOCKED** |
| **Child-Table RLS Completeness** | Six child tables audited; least-privilege inventory formalized; migrations unapplied. | 🔴 **BLOCKED** |
| **Cryptographic Byte Verification**| Raw canonical byte verification pipeline and explicit `kid` binding formalized; unexecuted. | 🔴 **UNCERTIFIED** |
| **Connection Lifecycle & Replay** | Exhaustive 8-scenario failure matrix specified; single committed consumption formalized. | 🟢 **PASS (Design)** |
| **Projection Contract Alignment** | Authoritative `EXAM:SOLUTION_AUDIT` preserved; live projection gated strictly to `ACTIVE`. | 🟢 **PASS** |

### **Overall Gate: 🔴 RED — Implementation and Candidate-Facing Integration Strictly Blocked**

**Summary for Gatekeeper:**  
Proposal v4.1 resolves all outstanding technical inconsistencies: it rectifies the `SELECT ... FOR SHARE` privilege claim by specifying exact column-level grants or transactional advisory locks, eliminates concurrency overstatements by formalizing the Read Committed mutual exclusion boundary, mandates unambiguous cryptographic `kid` binding, and completes the replay/retry failure matrix. Because all underlying database migrations, edge middleware, and test suites remain unexecuted, the overall gate remains strictly **🔴 RED**. Exactly zero application source files were modified, zero migrations were applied, and zero tests were executed.
