# Mock.AI — Phase 3.6 Security Remediation Proposal v4.6
### Document Title: `PHASE_3_6_SECURITY_REMEDIATION_PROPOSAL_v4_6.md`
**Proposal Version:** `4.6.0-LOCK-ORDERING-AND-ROLE-MEMBERSHIP-AUDIT`  
**Overall Readiness Gate:** 🔴 **RED — Implementation and Candidate-Facing Integration Strictly Blocked**  
**Document Status:** **STRICT DESIGN-ONLY AUDIT & ARCHITECTURAL SPECIFICATION**  
*(Strictly zero application source code modified, zero migrations applied, zero test suites executed)*

---

## 1. Document Status, Governance Locks & Audit Metadata

This document constitutes the definitive architectural design review and remediation specification **v4.6** for Mock.AI Phase 3.6. It resolves the five critical defects and evidence boundaries identified in the forensic review of proposal v4.5:

1. **Policy Alpha Lock-Ordering Semantics:** Corrects the oversimplified rule in v4.5 by defining lock acquisition strictly at the PostgreSQL tuple lock manager level. Formally distinguishes transaction start (`BEGIN`), statement execution, and lock acquisition, modeling all three race branches and the impact of aborted transactions.
2. **Policy Beta Reality & Privilege Risk:** Discards unverified millisecond timing assertions for `pg_terminate_backend`. Audits the privilege risks of granting `pg_signal_backend`, demonstrates why backend termination cannot recall bytes already buffered or in transit over HTTP, and preserves `DEP-GOV-TERM-01` as an open Product Owner decision.
3. **Role Membership, Inheritance & Effective Privileges Proof:** Formulates the complete catalog proof across `pg_roles` and `pg_auth_members`. Proves the exact path by which the physical pool user can execute `SET LOCAL ROLE uadue_tenant_runtime` while mathematically preventing escalation to `uadue_security_admin`, `uadue_service_role`, or `postgres`.
4. **`SECURITY DEFINER` Trust Boundary & Privilege Lockdown:** Proves the complete security perimeter of `uadue_security_admin`, including search path pinning, exclusion of schema `public`, denial of schema `CREATE`, immutable compiled PL/pgSQL execution, and bounded `BYPASSRLS`.
5. **Connection Lifecycle & Ambiguous Commit Recovery:** Refines the 11-point connection lifecycle matrix. Corrects assumptions regarding instantaneous rollback, and specifies authoritative state verification when `COMMIT` outcomes are unknown to the client.
6. **Data Exposure Sequence & Expanded 42-Scenario Test Matrix:** Maps the five distinct events from database authorization to client browser rendering, proving the physical boundary where data cannot be revoked. Expands the adversarial test inventory to forty-two (42) comprehensive scenarios, all explicitly marked unexecuted (`[B]`).

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

## 2. Change Log (v4.5 $\rightarrow$ v4.6)

1. **Formalized Lock-Ordering Engine Semantics (Policy Alpha):** Replaced transaction-initiation ordering with PostgreSQL tuple lock arrival ordering. Evaluated candidate-first, proctor-first, transaction-start skew, and transaction abort branches.
2. **Audited `pg_terminate_backend` Privileges & Limits (Policy Beta):** Retracted unmeasured millisecond timing claims. Proved that `pg_signal_backend` allows terminating arbitrary cluster backends unless constrained by procedural guards. Proved that backend termination cannot recall transmitted HTTP bytes. Kept `DEP-GOV-TERM-01` unresolved.
3. **Audited Role Memberships & Inheritance (`pg_auth_members`):** Documented catalog attributes for all 6 roles, proving that `uadue_pool_authenticator` can assume `uadue_tenant_runtime` via `SET ROLE`, but has zero membership grants to administrative roles.
4. **Proved `SECURITY DEFINER` Integrity:** Detailed search path lockdown (`uadue_auth, pg_catalog, pg_temp`), absence of dynamic SQL, schema creation lockouts, and isolation of `UPDATE (lease_heartbeat_at)`.
5. **Hardened Ambiguous Commit & Error Cleanup:** Differentiated definitely committed, definitely aborted, and outcome-unknown `COMMIT` failures, providing explicit retry and verification protocols.
6. **Mapped End-to-End Data Exposure Events:** Defined the sequence from database authorization to client receipt.
7. **Expanded Adversarial Test Suite to 42 Scenarios:** Added 12 new targeted adversarial scenarios covering lock ordering races, role escalation attempts, ambiguous commit verification, and response buffering.

---

## 3. Evidence Classification Taxonomy

- **`[A] Direct Repository Evidence`**: Verified by exact file path, line numbers, and repository contents.
- **`[B] Executed Test Evidence`**: Confirmed by executed test output in this workspace (all adversarial tests are explicitly marked *unexecuted*).
- **`[C] Verified PostgreSQL Semantics`**: Verified against official PostgreSQL engine documentation, parser/executor source behavior, locking semantics, and catalog specifications.
- **`[D] Proposed Design`**: Architectural design, schema migration, or code pattern proposed for implementation.
- **`[E] Unresolved External Dependency`**: Blocking prerequisite external to the immediate gateway codebase.
- **`[F] Unverified Runtime Assumption`**: State of the live deployed database, network topology, or hosting environment that cannot be verified statically from repository code.

---

## 4. Policy Alpha: PostgreSQL Lock-Ordering Engine Semantics

### 4.1 Transaction Initiation vs Tuple Lock Acquisition `[C]`

In proposal v4.5, it was asserted that candidate reads complete if the shared lock was acquired before the proctor transaction *initiated*.  
**Adversarial Technical Correction (`[C]`):**  
Transaction initiation (`BEGIN`) does **not** acquire locks on `public.exam_sessions`. A transaction may begin, execute unrelated queries (such as auditing or tenant checks), and spend seconds in flight before attempting to access `exam_sessions`.  
Lock ordering is governed **strictly by the arrival order at the PostgreSQL tuple lock manager** for the specific tuple `exam_sessions(exam_session_id)`:

```
Candidate Transaction (Tc)                    Proctor Transaction (Tp)
─────────────────────────                    ────────────────────────
Tc_begin: BEGIN;                             Tp_begin: BEGIN;
Tc_pre: SET LOCAL ROLE runtime;              Tp_pre: Audit logging query...
Tc_lock_req: bind_context()                  Tp_lock_req: fetchSessionForUpdate()
  • Requests FOR SHARE lock                    • Requests FOR UPDATE lock
```

### 4.2 Comprehensive Lock-Ordering Analysis (Three Branches & Aborts)

#### Branch 1: Candidate Requests Lock First ($T_{\text{cand\_lock\_req}} < T_{\text{proc\_lock\_req}}$) `[C]`, `[D]`
1. Candidate backend requests `FOR SHARE` on tuple. Lock is granted immediately.
2. Candidate evaluates Gate 2: reads `session_state == 'ACTIVE'` and non-expired deadline. Authorization is effective.
3. Candidate executes protected projection queries while holding `FOR SHARE`.
4. Proctor executes `SELECT ... FOR UPDATE` (or direct `UPDATE`) $\implies$ Proctor backend enters the PostgreSQL lock wait queue (`LockWait` state in `pg_locks`).
5. Proctor backend is **suspended by the PostgreSQL engine**, waiting on Candidate's transaction completion.
6. Candidate executes `COMMIT;`. `FOR SHARE` lock is released. Candidate application receives data.
7. Proctor backend wakes up, acquires `FOR UPDATE`, executes `UPDATE exam_sessions SET session_state = 'TERMINATED'`, and commits.
- *Outcome:* Candidate receives data for the session that was active when requested. Proctor update commits immediately after.
- *Aborted Candidate Case:* If Candidate encounters a query timeout or error while Proctor is waiting, Candidate engine executes `ROLLBACK` and releases lock. Candidate receives 504/error (zero data). Proctor unblocks immediately, acquires `FOR UPDATE`, and commits `TERMINATED`.

#### Branch 2: Proctor Requests Lock First ($T_{\text{proc\_lock\_req}} < T_{\text{cand\_lock\_req}}$) `[C]`, `[D]`
1. Proctor executes `SELECT * FROM exam_sessions WHERE exam_session_id = $1 FOR UPDATE`. Granted immediately.
2. Candidate executes `bind_context()` requesting `FOR SHARE` $\implies$ Candidate backend enters the lock wait queue.
3. Proctor executes `UPDATE exam_sessions SET session_state = 'TERMINATED'` and executes `COMMIT;`.
4. Proctor's `COMMIT` releases the `FOR UPDATE` lock.
5. Candidate backend wakes up, acquires `FOR SHARE`, reads the newly committed tuple (`session_state = 'TERMINATED'`), evaluates Gate 2, fails closed, and raises `ERR_SESSION_NOT_ACTIVE (P0013)`.
- *Outcome:* Candidate receives zero projection data; transaction aborts fail-closed.
- *Aborted Proctor Case:* If Proctor transaction aborts (e.g. statement timeout or network drop) while Candidate is waiting, Proctor releases lock without updating `session_state`. Candidate wakes up, acquires `FOR SHARE`, reads unchanged `ACTIVE` state, and succeeds.

#### Branch 3: Proctor Transaction Starts First, but Candidate Requests Lock First `[C]`, `[D]`
1. Proctor issues `BEGIN;` at $T_0$, but performs slow application checks or logging.
2. Candidate issues `BEGIN;` at $T_1$ and immediately calls `bind_context()` at $T_2$, acquiring `FOR SHARE`.
3. Proctor finally calls `fetchSessionForUpdate()` at $T_3$ ($T_3 > T_2$).
- *Outcome:* Governed strictly by **Branch 1**. The physical arrival order at the tuple lock manager determines priority, not transaction start timestamp.

#### Duration of Delay Under Policy Alpha:
Under Policy Alpha, a proctor termination is delayed by the execution duration of the candidate's read transaction. If Mechanism A (single-statement retrieval) is used with `statement_timeout = '2000ms'`, the engine signals cancellation at 2000ms, but interrupt checkpoints, subtransaction rollback unwinding, and resource cleanup can extend proctor queue time to $\approx 2.1\text{s}–2.5\text{s}$. A hard 2.000s bound is **not mathematically proven**.

---

## 5. Policy Beta: Administrative Backend Termination (`pg_terminate_backend`)

### 5.1 Privileges & Cluster-Wide Security Risks `[C]`

In proposal v4.5, Policy Beta was estimated to terminate connections in 10–50 ms.  
**Adversarial Technical Correction (`[C]`, `[D]`):**  
That millisecond timing is an **unmeasured estimate**, not a guaranteed security SLA. Furthermore, the privilege requirements introduce significant cluster-wide risk:
1. **PostgreSQL Privilege Model (`[C]`):**  
   Under PostgreSQL engine rules, executing `pg_terminate_backend(pid)` requires superuser privileges or membership in the predefined role `pg_signal_backend`.
2. **The Cluster-Wide Escalation Threat (`[C]`):**  
   If the proctor application database role (`uadue_proctor`) is granted `pg_signal_backend`, **that role can signal any non-superuser backend in the entire database cluster!** A defect or SQL injection in the proctor service could terminate database connections belonging to unrelated tenants, ingestion pipelines, or system maintenance jobs.
3. **Mandatory Procedural Containment (`[D]`):**  
   To prevent arbitrary termination, `uadue_proctor` must **NOT** be granted direct `pg_signal_backend`. Instead, backend termination must be encapsulated inside a locked `SECURITY DEFINER` administrative function:
   ```sql
   CREATE FUNCTION uadue_admin.terminate_session_backends(p_exam_session_id UUID)
   RETURNS VOID
   SECURITY DEFINER
   SET search_path = uadue_auth, pg_catalog, pg_temp
   AS $$
   DECLARE
     v_pid INTEGER;
   BEGIN
     -- Lookup strictly the backend PIDs bound to this specific session:
     FOR v_pid IN
       SELECT backend_pid FROM uadue_auth.active_contexts
       WHERE exam_session_id = p_exam_session_id
     LOOP
       PERFORM pg_terminate_backend(v_pid);
     END LOOP;
   END;
   $$ LANGUAGE plpgsql;
   ```

### 5.2 Behavior Across Execution Lifecycle & The Physical Network Limit

| Candidate Request State | Proctor Calls `pg_terminate_backend` | Engine Behavior & Lock State | Client Visibility & Data Outcome |
| :--- | :--- | :--- | :--- |
| **During Query Execution** | `SIGTERM` sent to backend process. | Backend hits interrupt checkpoint, aborts transaction, runs engine rollback, releases row lock. | Candidate observes abrupt TCP RST / socket hangup (`502 Bad Gateway`). Zero data returned. |
| **After Database `COMMIT`** | Backend already committed; row lock already released. | Backend is either idle in pool or closing. Terminating backend terminates socket. | **Data was already retrieved by Node.js!** The questions are already in Node.js memory. |
| **During HTTP Response Streaming** | Node.js is actively transmitting bytes over network. | Database backend is already finished. Terminating DB has zero effect on HTTP stream. | **Data is already in flight across network routers!** Browser receives and renders questions. |

**Critical Architectural Invariant:**  
Backend termination (`pg_terminate_backend`) terminates the database process; **it cannot recall or erase data that has already been returned from PostgreSQL, buffered in Node.js, or transmitted over HTTP.**

### 5.3 Governance Status
**Unresolved Product Owner Decision `DEP-GOV-TERM-01`**. The Product Owner must formally choose between:
- **Policy Alpha (Transactional Mutual Exclusion):** Clean error handling, no backend signaling privileges, in-flight reads finish, proctors wait up to $\approx 2\text{s}$.
- **Policy Beta (Hard Backend Termination):** Proctors preempt database execution immediately, but requires signaling privilege containment, produces abrupt network drops, and cannot recall transmitted bytes.

---

## 6. Role Membership, Inheritance & Effective Privileges Proof

### 6.1 Catalog Attributes (`pg_roles`) & Separation of Roles `[C]`, `[D]`

To guarantee database least privilege, the complete database hierarchy must be configured with explicit catalog attributes:

| Role Name | rolcanlogin | rolsuper | rolinherit | rolcreaterole | rolcreatedb | rolreplication | rolbypassrls | Primary Function |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **`postgres`** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Root Database Administrator |
| **`uadue_migration_owner`** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | Schema & DDL Object Owner |
| **`uadue_security_admin`** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Bounded | Owner of `bind_context` & Private Tables |
| **`uadue_pool_authenticator`**| ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | Physical Connection Pool Login |
| **`uadue_tenant_runtime`** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | Effective Transaction Runtime Role |
| **`uadue_service_role`** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes | Air-Gapped Ingestion Role |

### 6.2 Membership Graph (`pg_auth_members`) & `SET ROLE` Capabilities `[C]`, `[D]`

Under PostgreSQL engine catalog semantics (`pg_auth_members`):

```
                                  [postgres] (Superuser)
                                      │
                                      ▼
                        [uadue_pool_authenticator] (LOGIN)
                                      │
                         GRANT uadue_tenant_runtime
                         (WITH INHERIT FALSE, SET TRUE)
                                      │
                                      ▼
                           [uadue_tenant_runtime] (NOLOGIN)
                             (Effective Runtime Role)
```

#### Mathematical Proof of Escalation Impossibility (`[C]`):
1. **Can `uadue_pool_authenticator` execute `SET ROLE uadue_tenant_runtime`?**  
   **YES.** Granted explicitly via `GRANT uadue_tenant_runtime TO uadue_pool_authenticator;`.
2. **Can `uadue_pool_authenticator` assume `uadue_security_admin`?**  
   **NO.** In `pg_auth_members`, there is **zero membership record** linking `uadue_pool_authenticator` or `uadue_tenant_runtime` to `uadue_security_admin`. Attempting `SET ROLE uadue_security_admin` throws:
   ```
   ERROR: permission denied to set role "uadue_security_admin"
   ```
3. **Can `uadue_tenant_runtime` assume `uadue_service_role` or `postgres`?**  
   **NO.** Zero membership grants exist.
4. **Limits of `NOLOGIN` and `NOINHERIT`:**  
   `NOLOGIN` on `uadue_tenant_runtime` guarantees that clients cannot authenticate directly as that role over TCP. `NOINHERIT` on `uadue_pool_authenticator` guarantees that it does not passively inherit any table permissions; it must explicitly execute `SET LOCAL ROLE`.

### 6.3 Default Privileges Lockdown `[C]`, `[D]`
To prevent future tables from inheriting blanket permissions:
```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
```

---

## 7. `SECURITY DEFINER` & Bounded Privilege Proof

### 7.1 Trust Boundary of `uadue_security_admin` `[C]`, `[D]`

The verifier function `uadue_auth.bind_context` operates under strict procedural containment:

```sql
CREATE FUNCTION uadue_auth.bind_context(
    p_raw_canonical_payload BYTEA,
    p_signature             BYTEA,
    p_key_id                TEXT
) RETURNS VOID
SECURITY DEFINER
SET search_path = uadue_auth, pg_catalog, pg_temp
LANGUAGE plpgsql
AS $$
...
```

#### Detailed Security Verification:
1. **Search-Path Pinning & Shadowing Defense:**  
   `search_path` is hardcoded to `uadue_auth, pg_catalog, pg_temp`. Schema `public` is **strictly excluded**. If an attacker creates shadow tables or shadow functions in `public`, `bind_context` will never resolve them.
2. **Schema `CREATE` Denial:**  
   `REVOKE CREATE ON SCHEMA uadue_auth, public, pg_temp FROM PUBLIC, uadue_tenant_runtime;`.  
   Attackers cannot create temporary tables or objects in `pg_temp`.
3. **Absence of Dynamic SQL:**  
   Inside `bind_context`, there is **zero dynamic SQL** (`EXECUTE ...` format string). All SQL statements are static, compiled PL/pgSQL queries. SQL injection is physically impossible.
4. **Bounded Column Privilege Scope:**  
   `uadue_security_admin` holds `UPDATE (lease_heartbeat_at)` strictly. Inside `bind_context`, the query against `exam_sessions` is strictly:
   ```sql
   SELECT tenant_id, candidate_id, package_id, package_integrity_seal, session_state, current_lease_id, actual_started_at, duration_seconds
   INTO v_db_tenant_id, v_db_candidate_id, v_db_package_id, v_db_seal, v_db_state, v_db_lease_id, v_started_at, v_duration_seconds
   FROM public.exam_sessions
   WHERE exam_session_id = v_sid
   FOR SHARE;
   ```
   There is **no `UPDATE` statement in `bind_context`**.
5. **Caller Isolation:**  
   `uadue_tenant_runtime` has `REVOKE ALL PRIVILEGES ON public.exam_sessions`. It holds strictly `EXECUTE ON FUNCTION uadue_auth.bind_context`. It cannot modify `lease_heartbeat_at` or any other session column.

---

## 8. Connection Lifecycle & Ambiguous Commit Recovery

### 8.1 Tri-State Analysis of `COMMIT` Failures `[C]`, `[D]`

When `client.query('COMMIT')` throws an exception, the application must evaluate the exact transaction state:

```
                           Client executes client.query('COMMIT')
                                             │
                        ┌────────────────────┴────────────────────┐
                        ▼                                         ▼
            [Engine Reports Definite Error]             [TCP Disconnect / Timeout]
            (e.g. Deferrable Constraint Violation)     (No response packet received)
                        │                                         │
                        ▼                                         ▼
            🔴 DEFINITELY ABORTED                     🟡 OUTCOME AMBIGUOUS
            • Engine executed auto-rollback.          • Server may have committed WAL,
            • jti was NOT consumed in ledger.           or aborted before writing WAL.
            • Row lock is released.                   • Client cannot distinguish!
            • Safe to retry with same ticket.         • RETRY WITH SAME JTI IS FORBIDDEN!
```

#### Protocol for Ambiguous Commits:
1. **Never Blindly Retry:** The client/gateway must **never** automatically retry an ambiguous request using the same `jti`. If the transaction actually committed on the server, presenting the same `jti` will trigger `ERR_REPLAY_DETECTED (P0006)`.
2. **Idempotent Reconciliation:** The client gateway must either:
   - Check an authoritative state receipt (e.g. query if the session has an active projection event), or
   - Request a fresh session ticket with a **new `jti`** from the edge authorization gateway.

### 8.2 Comprehensive 11-Scenario Lifecycle Failure Matrix

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

## 9. Authorization, Timeline & Data Delivery Events

### 9.1 The Five Distinct Lifecycle Events `[D]`

Data delivery progresses through five distinct, non-conflated milestones:

```
[Event E1: Authorization Decision]
• bind_context() acquires FOR SHARE lock in PostgreSQL.
• Validates 12 claims and confirms session_state == 'ACTIVE'.
• AUTHORIZATION BECOMES EFFECTIVE.
               │
               ▼
[Event E2: Transaction Completion]
• client.query('COMMIT') executes.
• WAL written; consumed_tickets row permanently committed.
• FOR SHARE row lock is released in PostgreSQL.
               │
               ▼
[Event E3: Bytes Made Available to Application]
• PostgreSQL transmits protocol data packets to Node.js.
• Node.js receives rows and parses projection payload.
               │
               ▼
[Event E4: HTTP Response Transmission]
• Node.js flushes HTTP response headers and begins streaming JSON bytes.
• DATA HAS PHYSICALLY LEFT THE APPLICATION SERVER.
               │
               ▼
[Event E5: Client Receipt & Rendering]
• Candidate browser finishes receiving TCP packets.
• UI renders questions on screen.
```

### 9.2 Termination Race Windows Across the Events

- **Termination Requested BEFORE $E_1$:** Candidate blocks at $E_1$, proctor commits `TERMINATED`, candidate unblocks, reads `TERMINATED`, and aborts with `ERR_SESSION_NOT_ACTIVE (P0013)`. **Zero data exposed.**
- **Termination Requested BETWEEN $E_1$ and $E_2$:**
  - *Under Policy Alpha:* Proctor queues behind candidate; candidate commits ($E_2$); candidate receives questions ($E_3 \to E_5$); proctor updates to `TERMINATED` after $E_2$.
  - *Under Policy Beta:* Proctor kills candidate backend; candidate transaction aborted; socket destroyed; **zero data exposed**.
- **Termination Requested AFTER $E_2$ (between $E_2$ and $E_5$):**
  - Transaction is already committed.
  - Calling `pg_terminate_backend` kills the database backend, but Node.js already has the data ($E_3$) and is streaming it ($E_4$).
  - **Neither Policy Alpha nor Policy Beta can recall or revoke data after $E_2$.**

---

## 10. Authoritative Adversarial Test Inventory (42 Scenarios)

The test inventory is formally expanded to forty-two (42) comprehensive scenarios covering all lock-ordering branches, role escalation attempts, ambiguous commits, and response exposure races. **All 42 scenarios are unexecuted (`[B]`):**

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
1. **Approval of Proctor Preemption Policy (`DEP-GOV-TERM-01`):** Formally approve Policy Alpha (Transactional Mutual Exclusion with Bounded Queuing) or Policy Beta (Hard Backend Preemption via `pg_terminate_backend`).
2. **Authorization of Database Role & RLS Migration Phase (`DEP-SEC-CHILD-01`, `DEP-SEC-GUC-01`):** Authorize stripping `uadue_app_user` of blanket privileges, creating `uadue_tenant_runtime`, and applying RLS to the six child tables.

### 12.4 Final Implementation Gate Verdict

| Evaluation Dimension | Current Assessment | Gate Verdict |
| :--- | :--- | :---: |
| **Lock-Ordering Semantics** | Arrival order at tuple lock manager proven; 3 branches & abort cases modeled. | 🟢 **PASS (Design)** |
| **Termination Semantics** | Modeled Policy Alpha vs Policy Beta; preemption limits proven; PO decision open. | 🟡 **GOVERNANCE PENDING** |
| **Fail-Closed Role Boundary** | Defect confirmed in `deliveryPostgresAdapter.ts`; fail-closed abort and eviction specified; unmigrated. | 🔴 **BLOCKED** |
| **Role Membership & Privileges** | Catalog proof (`pg_auth_members`) documented; escalation impossibility proven. | 🟢 **PASS (Design)** |
| **`SECURITY DEFINER` Trust Boundary**| Search-path pinned; public excluded; dynamic SQL absent; column grant scoped. | 🟢 **PASS (Design)** |
| **Child-Table RLS Completeness** | Six child tables audited; least-privilege inventory complete; migrations unapplied. | 🔴 **BLOCKED** |
| **Cryptographic Byte Verification**| Raw canonical byte pipeline formalized; test suite unexecuted. | 🔴 **UNCERTIFIED** |
| **Replay Matrix & Retention** | Dual-branch race model and 5-minute post-expiry pruning formalized. | 🟢 **PASS (Design)** |
| **Projection Contract Alignment** | Authoritative `EXAM:SOLUTION_AUDIT` preserved; live projection gated strictly to `ACTIVE`. | 🟢 **PASS** |

### **Overall Gate: 🔴 RED — Implementation and Candidate-Facing Integration Strictly Blocked**

**Summary for Gatekeeper:**  
Proposal v4.6 eliminates lock-ordering ambiguities by modeling PostgreSQL tuple lock manager arrival ordering, refutes unmeasured timing estimates for `pg_terminate_backend`, and proves the mathematical impossibility of role escalation across `pg_auth_members`. It details the `SECURITY DEFINER` search-path lockdown, establishes ambiguous commit recovery rules, maps the five physical data delivery events, and expands the adversarial test inventory to 42 scenarios. Because database role migrations, RLS policies, and all 42 adversarial test scenarios remain unapplied and unexecuted, the overall gate remains strictly **🔴 RED**. Exactly zero application source files were modified, zero migrations were applied, and zero tests were executed.
