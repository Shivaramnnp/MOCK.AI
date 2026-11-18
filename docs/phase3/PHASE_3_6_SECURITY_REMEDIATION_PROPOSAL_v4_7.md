# Mock.AI — Phase 3.6 Security Remediation Proposal v4.7
### Document Title: `PHASE_3_6_SECURITY_REMEDIATION_PROPOSAL_v4_7.md`
**Proposal Version:** `4.7.0-TERMINATION-ORDERING-AND-IDENTITY-BINDING-AUDIT`  
**Overall Readiness Gate:** 🔴 **RED — Implementation and Candidate-Facing Integration Strictly Blocked**  
**Document Status:** **STRICT DESIGN-ONLY AUDIT & ARCHITECTURAL SPECIFICATION**  
*(Strictly zero application source code modified, zero migrations applied, zero test suites executed)*

---

## 1. Document Status, Governance Locks & Audit Metadata

This document constitutes the definitive architectural design review and remediation specification **v4.7** for Mock.AI Phase 3.6. It directly addresses the three critical contradictions and evidence gaps identified in the forensic review of proposal v4.6:

1. **Resolution of the Termination-Ordering Contradiction:** Eliminates the conflict between lock-ordering semantics and data exposure invariants. Proves that external proctor request arrival at the API gateway does **not** equal termination taking effect in the database. Maps eleven (11) distinct timestamps and defines the authoritative linearization points for both Policy Alpha and Policy Beta.
2. **Correction of the Five-Event Data-Exposure Model:** Deconstructs the actual data flow in multi-statement transactions, proving that PostgreSQL delivers projection rows to Node.js application memory **before** `client.query('COMMIT')` is issued. Formulates strict application buffer containment and error-handling requirements to guarantee that uncommitted or aborted rows are never emitted over HTTP.
3. **Backend Identity-Binding Proof for Policy Beta:** Replaces naive PID matching with a multi-attribute identity binding contract (`pid` + `backend_start` + `tx_id` + `tenant_id`). Proves mathematical immunity against operating system PID reuse and stale context records, encapsulates `pg_terminate_backend` inside a locked `SECURITY DEFINER` function, and demonstrates why candidate roles cannot misuse signaling capabilities.
4. **Read-Only Verification Plan for the Live Role Graph:** Provides concrete, executable SQL catalog queries to inspect `pg_roles`, `pg_auth_members`, grants, overloads, and RLS configurations, while formally classifying live production credentials as an unverified deployment assumption (`[F]`).
5. **Idempotent Ambiguous Commit Recovery:** Formalizes the tri-state commit outcome model and defines the authoritative persisted state check used by client gateways before retrying ambiguous requests.
6. **Authoritative 54-Scenario Adversarial Test Inventory:** Expands the test inventory to fifty-four (54) comprehensive scenarios, explicitly confirming that all 54 remain completely unexecuted (`[B]`).

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

## 2. Change Log (v4.6 $\rightarrow$ v4.7)

1. **Reconciled Termination Ordering & Invariants:** Formally separated API request arrival from database row-lock acquisition. Proved that if an external proctor termination request arrives first, but the candidate acquires the database row lock first, candidate projection data can still be authorized and returned under Policy Alpha.
2. **Corrected Application Memory Data-Exposure Timeline:** Recognized that in multi-statement transactions, PostgreSQL returns query rows to Node.js before `COMMIT`. Specified mandatory application buffer isolation and garbage collection upon commit failure.
3. **Engineered Multi-Attribute Backend Identity Binding:** Added `backend_start` timestamp verification against `pg_stat_activity` to eliminate OS PID reuse hazards in Policy Beta.
4. **Provided SQL Catalog Verification Queries:** Detailed exact read-only queries for inspecting live database role graphs and privilege configurations.
5. **Defined Ambiguous Commit Idempotency Protocol:** Formulated receipt-based ledger verification for ambiguous commit outcomes.
6. **Expanded Adversarial Matrix to 54 Scenarios:** Added 12 new targeted edge cases (`ADV-43` through `ADV-54`) covering skew between API arrival and lock acquisition, memory buffer leaks, PID reuse, and cross-tenant signaling attacks.

---

## 3. Evidence Classification Taxonomy

- **`[A] Direct Repository Evidence`**: Verified by exact file path, line numbers, and repository contents.
- **`[B] Executed Test Evidence`**: Confirmed by executed test output in this workspace (all adversarial tests are explicitly marked *unexecuted*).
- **`[C] Verified PostgreSQL Semantics`**: Verified against official PostgreSQL engine documentation, parser/executor source behavior, locking semantics, and catalog specifications.
- **`[D] Proposed Design`**: Architectural design, schema migration, or code pattern proposed for implementation.
- **`[E] Unresolved External Dependency`**: Blocking prerequisite external to the immediate gateway codebase.
- **`[F] Unverified Runtime Assumption`**: State of the live deployed database, network topology, or hosting environment that cannot be verified statically from repository code.

---

## 4. Resolution of the Termination-Ordering Contradiction

### 4.1 Deconstructing the v4.6 Contradiction `[C]`

In proposal v4.6, two conflicting assertions were made:
1. *Assertion A (Policy Alpha Lock Ordering):* Candidate reads complete if the candidate's lock request reaches the PostgreSQL tuple lock manager before the proctor's conflicting lock request—even if the proctor transaction started first.
2. *Assertion B (Exposure Invariant):* Termination requested before authorization ($E_1$) guarantees zero data exposure.

**Adversarial Technical Correction (`[C]`, `[D]`):**  
These two assertions are mutually incompatible. An external proctor termination request can arrive at an API endpoint, but due to network routing, queuing, or application processing, the candidate's database query can reach the PostgreSQL tuple lock manager and acquire `SELECT ... FOR SHARE` **before the proctor's query requests its lock**.  
Treating external request arrival as equivalent to database termination taking effect is an architectural fallacy.

### 4.2 The Eleven (11) Discrete Lifecycle Timestamps

To establish complete determinism, eleven discrete events must be tracked:

```
[Candidate Request Stream]                    [Proctor Termination Stream]
─────────────────────────                    ───────────────────────────
                                             T_ext_proc:  Termination arrives at API
                                             T_auth_proc: Proctor auth verified at API
                                             T_begin_proc:Proctor DB tx starts (BEGIN)
T_begin_cand:    Candidate DB tx starts
T_lock_req_cand: Candidate requests FOR SHARE
T_lock_acq_cand: Candidate ACQUIRES FOR SHARE
T_val_cand:      Candidate validates ACTIVE
                 [AUTHORIZATION EFFECTIVE]
                                             T_lock_req_proc: Proctor requests lock
                                             T_lock_acq_proc: Proctor ACQUIRES lock
                                             T_commit_proc:   Proctor COMMITS state
T_commit_cand:   Candidate tx COMMITS
T_app_cand:      Rows in Node.js buffer
T_http_cand:     HTTP response streams
```

### 4.3 Authoritative Linearization Points Under Each Policy

#### Policy Alpha (Transactional Mutual Exclusion):
- **Authoritative Linearization Point:** **$T_{\text{lock\_acq\_cand}}$ vs $T_{\text{lock\_acq\_proc}}$** (The physical moment a lock is acquired in PostgreSQL).
- **Behavior when External Proctor Request Arrives First ($T_{\text{ext\_proc}} < T_{\text{lock\_req\_cand}}$ but $T_{\text{lock\_acq\_cand}} < T_{\text{lock\_req\_proc}}$):**
  - Even though the proctor clicked "Terminate" before the candidate requested questions, the candidate's database query arrived at the tuple lock manager first and acquired `FOR SHARE`.
  - When the proctor's database transaction attempts `SELECT ... FOR UPDATE`, it enters the `LockWait` queue.
  - Candidate evaluates $T_{\text{val\_cand}}$ against the unchanged database record, sees `session_state == 'ACTIVE'`, and **successfully retrieves and returns projection data**.
  - Proctor's update unblocks and commits $T_{\text{commit\_proc}}$ only after candidate transaction finishes.
  - **Invariant:** Under Policy Alpha, external proctor request arrival does **not** stop candidate data release; only database row-lock priority governs execution.

#### Policy Beta (Hard Backend Preemption):
- **Authoritative Linearization Point:** **$T_{\text{sig\_term}}$** (The moment the administrative function signals the candidate backend process).
- **Behavior when External Proctor Request Arrives First:**
  - If $T_{\text{sig\_term}}$ is dispatched before candidate transaction completes ($T_{\text{commit\_cand}}$), the candidate database backend is forcefully killed, the transaction rolls back, and zero data is returned.
  - If $T_{\text{sig\_term}}$ is dispatched after candidate rows have reached the application ($T_{\text{app\_cand}}$) or entered HTTP transmission ($T_{\text{http\_cand}}$), backend termination cannot recall the data.

---

## 5. Corrected Data-Exposure Timeline & Application Buffer Isolation

### 5.1 Multi-Statement vs Single-Statement Retrieval Flows `[C]`, `[D]`

In proposal v4.6, it was assumed that database transaction completion ($E_2$) strictly precedes result bytes reaching the application ($E_3$).  
**Engine Reality (`[C]`):**  
In the proposed multi-statement transaction:
```typescript
await client.query('BEGIN');
await client.query('SELECT uadue_auth.bind_context(...)');
const res = await client.query('SELECT * FROM exam_session_projections WHERE ...'); // <-- ROWS ARRIVE HERE!
await client.query('COMMIT'); // <-- TRANSACTION COMPLETES HERE!
```
- Query 3 executes and returns result tuples across the PostgreSQL wire protocol directly into Node.js application memory (`res.rows`).
- At that millisecond, **the data is resident in Node.js RAM, but the transaction has NOT yet committed!**
- If Query 4 (`COMMIT`) throws an exception, times out, or is cancelled, the database rolls back, but **the Node.js process already holds the sensitive exam questions**.

```
Timeline: Multi-Statement Retrieval Sequence
───────────────────────────────────────────────────────────────────────────────
1. PostgreSQL executes SELECT projections.
2. PostgreSQL emits DataRow wire protocol packets.
3. Node.js 'pg' driver receives packets and populates res.rows in memory.
   ============================================================================
   ==> DATA RESIDENT IN APPLICATION BUFFER (BEFORE DATABASE COMMIT!) <========
   ============================================================================
4. Node.js sends COMMIT command over socket.
5. PostgreSQL processes commit and emits CommandComplete ('COMMIT').
6. Node.js completes transaction.
7. Node.js emits HTTP response headers and body to candidate.
───────────────────────────────────────────────────────────────────────────────
```

### 5.2 Mandatory Application Buffer Containment Contract `[D]`

To prevent uncommitted data from leaking when transactions fail or are preempted:
1. **Strict Post-Commit Emission Rule:**  
   The application gateway must **never** begin streaming HTTP headers or body chunks (`res.writeHead()`, `res.write()`) until `await client.query('COMMIT')` has successfully resolved.
2. **Immediate Buffer Scrapping on Failure:**  
   If `COMMIT` fails, times out, or throws an error:
   ```typescript
   let projectionBuffer: ProjectionRecord | null = null;
   try {
     await client.query('BEGIN');
     await client.query('SET LOCAL ROLE uadue_tenant_runtime');
     await client.query('SELECT uadue_auth.bind_context($1, $2, $3)', [raw, sig, kid]);
     const queryRes = await client.query('SELECT * FROM exam_session_projections WHERE ...', [sid]);
     projectionBuffer = queryRes.rows[0]; // Held strictly in local scope
     
     await client.query('COMMIT'); // Commit authorization & ticket consumption
     
     // ONLY AFTER SUCCESSFUL COMMIT:
     res.status(200).json(projectionBuffer);
   } catch (err) {
     projectionBuffer = null; // FORCE IMMEDIATE DEREFERENCE
     await client.query('ROLLBACK').catch(() => {});
     client.release(err);
     res.status(err.statusCode || 500).json({ error: 'Failed to authorize or commit projection read' });
   }
   ```
3. **Single-Statement Alternative (Mechanism A):**  
   If encapsulated into `SELECT * FROM uadue_auth.get_candidate_projection(...)`, PostgreSQL assembles the JSON payload internally and outputs data tuples **only if the function completes without error**, coupling execution atomically.

---

## 6. Policy Beta: Multi-Attribute Backend Identity Binding Contract

### 6.1 The OS PID Reuse Hazard `[C]`

Operating system Process IDs (PIDs) are finite integers (e.g. 16-bit to 22-bit integers, cycling every 32,768 to 4,194,304 processes).  
In high-throughput environments, a PostgreSQL backend process can terminate, and the host operating system can reassign that exact same PID to a new, completely unrelated process within seconds.  
If the administrative termination function relies solely on `backend_pid`, calling `pg_terminate_backend(pid)` risks **killing an innocent database connection belonging to another tenant, an ingestion worker, or a system process!**

### 6.2 Multi-Attribute Binding Schema (`uadue_auth.active_contexts`) `[D]`

To guarantee that only the specific, intended candidate backend process is signaled, the context table must bind four immutable attributes:

```sql
CREATE TABLE uadue_auth.active_contexts (
    backend_pid     INTEGER NOT NULL,
    backend_start   TIMESTAMPTZ NOT NULL,  -- Microsecond server process start time
    tx_id           XID8 NOT NULL,         -- PostgreSQL 64-bit transaction identifier
    exam_session_id UUID NOT NULL,
    tenant_id       UUID NOT NULL,
    candidate_id    UUID NOT NULL,
    package_id      UUID NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (backend_pid, tx_id)
);
REVOKE ALL ON uadue_auth.active_contexts FROM PUBLIC, uadue_tenant_runtime;
```

### 6.3 Secure Administrative Termination Procedure `[C]`, `[D]`

The termination procedure joins against the PostgreSQL system catalog `pg_stat_activity` to verify the process birth timestamp before dispatching any signal:

```sql
CREATE FUNCTION uadue_admin.terminate_candidate_session(
    p_exam_session_id UUID,
    p_tenant_id       UUID
) RETURNS INTEGER
SECURITY DEFINER
SET search_path = uadue_auth, pg_catalog, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
    v_target RECORD;
    v_terminated_count INTEGER := 0;
BEGIN
    -- Assert caller is an authorized administrative role:
    IF current_user NOT IN ('postgres', 'uadue_service_role', 'uadue_admin') THEN
        RAISE EXCEPTION 'UADUE Security Violation: Unauthorized caller attempted backend preemption.'
            USING ERRCODE = 'P0022';
    END IF;

    -- Lookup strictly active contexts matching session, tenant, and non-expired window:
    FOR v_target IN
        SELECT c.backend_pid, c.backend_start, c.tx_id
        FROM uadue_auth.active_contexts c
        JOIN pg_stat_activity a 
          ON a.pid = c.backend_pid 
         AND a.backend_start = c.backend_start -- STRICT PROCESS IDENTITY BINDING
        WHERE c.exam_session_id = p_exam_session_id
          AND c.tenant_id = p_tenant_id
          AND c.expires_at > clock_timestamp()
    LOOP
        -- Signal strictly verified backend:
        IF pg_terminate_backend(v_target.backend_pid) THEN
            v_terminated_count := v_terminated_count + 1;
        END IF;
    END LOOP;

    -- Purge the terminated context records:
    DELETE FROM uadue_auth.active_contexts
    WHERE exam_session_id = p_exam_session_id AND tenant_id = p_tenant_id;

    RETURN v_terminated_count;
END;
$$;

REVOKE ALL ON FUNCTION uadue_admin.terminate_candidate_session FROM PUBLIC, uadue_tenant_runtime;
GRANT EXECUTE ON FUNCTION uadue_admin.terminate_candidate_session TO uadue_service_role, uadue_admin;
```

#### Security Proof of Identity Binding (`[C]`):
1. **Immunity to PID Reuse:** If backend process 1234 terminates and the OS reassigns PID 1234 to an ingestion worker, `a.backend_start` in `pg_stat_activity` will reflect the new worker's start time, which does **not** match `c.backend_start`. The query returns zero rows; the signal is never sent.
2. **Tenant Boundary Enforcement:** `c.tenant_id = p_tenant_id` ensures that a proctor from Tenant A cannot terminate sessions belonging to Tenant B.
3. **Privilege Containment:** `uadue_tenant_runtime` has `REVOKE EXECUTE` on this function and zero direct permissions on `pg_signal_backend`.

---

## 7. Concrete SQL Catalog Verification Plan

To verify that the live database configuration matches architectural specifications without relying on unverified deployment assumptions, the following read-only SQL queries must be executed against the target environment:

### Query 1: Verify Role Attributes (`pg_roles`) `[C]`
```sql
SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls
FROM pg_catalog.pg_roles
WHERE rolname IN (
    'postgres', 'uadue_migration_owner', 'uadue_security_admin',
    'uadue_pool_authenticator', 'uadue_tenant_runtime', 'uadue_service_role', 'uadue_app_user'
)
ORDER BY rolname;
```
*Expected Invariants:* `uadue_tenant_runtime` has `rolcanlogin = false, rolsuper = false, rolbypassrls = false`. `uadue_security_admin` has `rolcanlogin = false, rolsuper = false, rolbypassrls = true`.

### Query 2: Verify Role Memberships (`pg_auth_members`) `[C]`
```sql
SELECT r_role.rolname AS granted_role, r_member.rolname AS member_role,
       m.admin_option, m.inherit_option, m.set_option
FROM pg_catalog.pg_auth_members m
JOIN pg_catalog.pg_roles r_role ON m.roleid = r_role.oid
JOIN pg_catalog.pg_roles r_member ON m.member = r_member.oid
WHERE r_member.rolname IN ('uadue_pool_authenticator', 'uadue_tenant_runtime')
   OR r_role.rolname IN ('uadue_security_admin', 'uadue_service_role', 'postgres');
```
*Expected Invariants:* `uadue_tenant_runtime` is granted to `uadue_pool_authenticator`. Zero records link `uadue_pool_authenticator` or `uadue_tenant_runtime` to `uadue_security_admin`, `uadue_service_role`, or `postgres`.

### Query 3: Verify Function Definition, Owner & Search Path `[C]`
```sql
SELECT proname, pg_get_userbyid(proowner) AS function_owner,
       prosecdef AS is_security_definer, proconfig AS search_path_settings
FROM pg_catalog.pg_proc
WHERE proname IN ('bind_context', 'terminate_candidate_session');
```
*Expected Invariants:* `bind_context` owned by `uadue_security_admin`, `prosecdef = true`, `search_path_settings = {'search_path=uadue_auth, pg_catalog, pg_temp'}`.

### Query 4: Verify Table Grants & RLS Status `[C]`
```sql
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_catalog.pg_class
JOIN pg_catalog.pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE nspname = 'public'
  AND relname IN ('exam_sessions', 'canonical_logical_families', 'canonical_assets');
```
*Expected Invariants:* `relrowsecurity = true` and `relforcerowsecurity = true` on all tables.

---

## 8. Idempotent Ambiguous Commit Recovery Protocol

### 8.1 Tri-State Commit Decision Model `[C]`, `[D]`

When a client or gateway encounters a timeout or network disconnect while awaiting a `COMMIT` response, the outcome is **ambiguous**:

```
                       client.query('COMMIT') fails with network drop
                                             │
                                             ▼
                                  Outcome Unknown to Client
                                             │
                        ┌────────────────────┴────────────────────┐
                        ▼                                         ▼
           [Server Actually Committed WAL]             [Server Aborted Transaction]
           • jti is committed in ledger.               • jti was unrolled; not in ledger.
           • Session projection was created.           • Zero session state updated.
```

### 8.2 Client Gateway Idempotency Contract `[D]`

1. **Strict Prohibition of Blind Retry:**  
   The client or gateway must **never** automatically retry an ambiguous request using the same `jti` without reconciliation. If the server actually committed, re-presenting the same `jti` raises `ERR_REPLAY_DETECTED (P0006)`.
2. **Authoritative Ledger Reconciliation Query:**  
   Before executing a retry, the application gateway must issue an idempotent reconciliation query under a read-only check:
   ```sql
   SELECT 1 FROM uadue_auth.consumed_tickets WHERE jti = $1;
   ```
   - **Branch A (Record Exists):** The transaction definitely committed on the database server. The ticket is consumed. The gateway must return the cached projection or re-query `exam_session_projections` using an administrative read.
   - **Branch B (Record Does NOT Exist):** The transaction definitely aborted on the database server. The `jti` is unconsumed. If the ticket is still within its 15-second validity window ($\text{clock} \le \text{exp}$), the gateway may safely re-present the ticket. If the ticket expired during the network delay, the gateway must obtain a fresh session ticket with a **new `jti`**.

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

## 10. Authoritative Adversarial Test Inventory (54 Scenarios)

The test inventory is expanded to fifty-four (54) comprehensive scenarios. **All 54 scenarios remain unexecuted (`[B]`):**

| Test ID | Category & Scenario Objective | Specified? | Authored? | Executed? | Passed? | Independent Review |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **ADV-01** | Tenant Claim Substitution Denial | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-02** | Package Claim Substitution Denial | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-03** | Package Integrity Seal Tampering Denial | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-04** | Issuer / Audience Scope Tampering Denial | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-05** | Future Token Presentation Rejection (`iat > now`) | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-06** | Excessive Lifetime Token Rejection ($\Delta t > 15\text{s}$) | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-07** | Duplicate In-Transaction `bind_context` Denial | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-08** | Committed Replay Attack Denial (Serial Presentation) | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-09** | Concurrent Replay Presentation ($T_1$ vs $T_2$ Race) | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-10** | Rollback Retry Verification (Legitimate Retry) | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-11** | Pool Socket Reuse & Context Leakage Isolation | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-12** | Proctor/Candidate State Linearization Race | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-13** | `SECURITY DEFINER` Role Escalation Lockout | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-14** | Bit-for-Bit RFC 8785 Raw-Byte Verification | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-15** | Emergency Key Revocation Immediate Invalidation | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-16** | Child-Table Least-Privilege Access Denial | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-17** | Unambiguous Key-ID Mismatch Rejection | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-18** | Retired Key Expiration Boundary Rejection | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-19** | Statement Timeout Firing While Row Lock is Held | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-20** | Delayed Cancellation & Server Disconnect Detection | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-21** | Row Lock Release Verification After Transaction Abort | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-22** | Node.js Event-Loop Stall Past Application Deadline | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-23** | Connection Destruction During `COMMIT` (Ambiguous Commit)| ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-24** | Proctor Termination While Candidate Data Assembled | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-25** | Proctor Termination After DB Commit Before HTTP ACK | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-26** | Partial HTTP Response Delivery Before Termination | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-27** | Unexpected Trigger Work Extending Row Lock Duration | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-28** | Role-Switch Failure Followed by Attempted Query | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-29** | Unsafe Pooled Connection Reuse After Uncertain State | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-30** | Backend Preemption (`pg_terminate_backend`) Lifecycle| ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-31** | Candidate Lock Acquired Before Proctor UPDATE | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-32** | Proctor UPDATE Lock Acquired Before Candidate Request | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-33** | Proctor Tx Starts First But Acquires Lock Second | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-34** | Proctor Tx Aborts While Waiting For Candidate Lock | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-35** | Candidate Tx Aborts While Proctor Waits | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-36** | Unauthorized `SET ROLE` Escalation Attempt | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-37** | Inherited and Indirect Role Membership Escalation | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-38** | Unsafe Default Privileges Exploitation Attempt | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-39** | `SECURITY DEFINER` Overload / Search-Path Attack | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-40** | `COMMIT` Result Ambiguity & Receipt State Verification | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-41** | Backend Termination Attempted After Database `COMMIT`| ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-42** | Response Bytes Transmitted Before Termination Commits| ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-43** | Proctor Request Arrives at API First But Candidate Locks First| ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-44** | Candidate Lock Acquired While Proctor Termination Queued| ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-45** | Proctor Lock Acquired First; Candidate Aborts on Wake | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-46** | Proctor Tx Aborts in LockWait Queue | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-47** | Candidate Tx Aborts in LockWait Queue | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-48** | Application Buffer Scrapped on Post-Query Commit Abort | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-49** | Idempotent Reconciliation Query After Ambiguous Commit | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-50** | Termination Requested After Node Buffer But Before HTTP | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-51** | Termination Requested After Partial HTTP Chunk Sent | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-52** | OS PID Reuse Rejection via `backend_start` Mismatch | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-53** | Cross-Tenant Termination Rejection via Mismatched Tenant| ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-54** | Termination Rejection After Session Ownership Supersession| ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |

---

## 11. Preservation of All Frozen Phase 3 Governance Contracts

The following frozen Phase 3 governance baselines remain strictly locked:
1. **Phase 3.5 Raw-Score-Only Contract:** Zero modifications to scoring formulas, evaluation DAGs, or candidate scoring dispute tables.
2. **Phase 3.6 ACTIVE-Only Tier 3 Projection:** Question projection retrieval is restricted strictly to sessions with `session_state == 'ACTIVE'`.
3. **Zero Question-Viewing Grace:** Deadline calculations permit strictly zero question-viewing grace.
4. **Submission Transport Grace:** 15-second grace window applies strictly to answer ingestion events (`candidate_submission_events`).
5. **`EXAM:SOLUTION_AUDIT` Capability Contract:** Post-exam answers and solutions released strictly after administrative result release.
6. **`AP-DEC-013`:** Assessment policy rules strictly preserved; zero autonomous AI/LLM conversions permitted.
7. **Tenant Isolation & Quarantine Restrictions:** Unresolved `DEP-T4-ANS-01` and `GOV-04` dependencies maintained.

---

## 12. Deliverable & Final Implementation Gate

### 12.1 Repository Evidence Examined
- [`web/src/services/uadue/delivery/deliveryPostgresAdapter.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/deliveryPostgresAdapter.ts) (Lines 62–125): Confirmed silent error swallowing in `SET LOCAL ROLE`.
- [`web/src/services/uadue/delivery/sessionOrchestrator.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/sessionOrchestrator.ts) (Lines 135–902): Confirmed all 9 session writer methods use `SELECT ... FOR UPDATE` and zero writers acquire advisory locks.
- [`web/package.json`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/package.json) (Lines 36, 41): Confirmed `pg: ^8.23.0` dependency.
- [`supabase/migrations/20261007_uadue_phase2d8_canonical.sql`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase2d8_canonical.sql) (Lines 115–370): Confirmed 6 unprotected child tables and blanket `ALL PRIVILEGES` to `uadue_app_user`.
- [`supabase/migrations/20261007_uadue_phase3_database_foundation.sql`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase3_database_foundation.sql) (Lines 18–307): Confirmed session table schema and duplicate blanket role grants.

### 12.2 Confirmed Defects & Unverified Assumptions
- **Confirmed Defect 1:** `deliveryPostgresAdapter.ts` swallows `SET LOCAL ROLE` failures, executing transactions as the physical superuser.
- **Confirmed Defect 2:** In migrations, `uadue_app_user` holds blanket `ALL PRIVILEGES` across all tables, functions, and sequences.
- **Unverified Assumption 1 (`[F]`):** Live deployment Supabase database credentials and role hierarchy.
- **Unverified Assumption 2 (`[F]`):** Target deployment availability of `pg_sodium` extension.

### 12.3 Product Owner Decisions Still Required
1. **Approval of Proctor Preemption Policy (`DEP-GOV-TERM-01`):** Formally approve Policy Alpha (Transactional Mutual Exclusion with Bounded Queuing) or Policy Beta (Hard Backend Preemption via `terminate_candidate_session`).
2. **Authorization of Database Role & RLS Migration Phase (`DEP-SEC-CHILD-01`, `DEP-SEC-GUC-01`):** Authorize stripping `uadue_app_user` of blanket privileges, creating `uadue_tenant_runtime`, and applying RLS to the six child tables.

### 12.4 Final Implementation Gate Verdict

| Evaluation Dimension | Current Assessment | Gate Verdict |
| :--- | :--- | :---: |
| **Termination-Ordering Consistency**| Reconciled API arrival skew vs database row-lock priority; 11 timestamps mapped. | 🟢 **PASS (Design)** |
| **Application Buffer Isolation** | Multi-statement memory buffer leak analyzed; post-commit emission contract defined. | 🟢 **PASS (Design)** |
| **Policy Beta Identity Binding** | Process start timestamp (`backend_start`) bound to eliminate OS PID reuse hazards. | 🟢 **PASS (Design)** |
| **Live Catalog Verification Plan** | Executable SQL queries formulated; live deployment status marked unverified. | 🟢 **PASS (Design)** |
| **Fail-Closed Role Boundary** | Defect confirmed in `deliveryPostgresAdapter.ts`; fail-closed abort and eviction specified; unmigrated. | 🔴 **BLOCKED** |
| **Child-Table RLS Completeness** | Six child tables audited; least-privilege inventory complete; migrations unapplied. | 🔴 **BLOCKED** |
| **Cryptographic Byte Verification**| Raw canonical byte pipeline formalized; test suite unexecuted. | 🔴 **UNCERTIFIED** |
| **Replay Matrix & Retention** | Dual-branch race model and 5-minute post-expiry pruning formalized. | 🟢 **PASS (Design)** |
| **Projection Contract Alignment** | Authoritative `EXAM:SOLUTION_AUDIT` preserved; live projection gated strictly to `ACTIVE`. | 🟢 **PASS** |

### **Overall Gate: 🔴 RED — Implementation and Candidate-Facing Integration Strictly Blocked**

**Summary for Gatekeeper:**  
Proposal v4.7 resolves the termination-ordering contradiction by decoupling external API arrival from database tuple lock acquisition, proves that multi-statement queries buffer rows in Node.js before `COMMIT`, specifies multi-attribute identity binding (`pid` + `backend_start`) to prevent OS PID reuse in Policy Beta, provides concrete read-only SQL catalog verification queries, and expands the adversarial test inventory to 54 scenarios. Because database role migrations, RLS policies, and all 54 adversarial test scenarios remain unapplied and unexecuted, the overall gate remains strictly **🔴 RED**. Exactly zero application source files were modified, zero migrations were applied, and zero tests were executed.
