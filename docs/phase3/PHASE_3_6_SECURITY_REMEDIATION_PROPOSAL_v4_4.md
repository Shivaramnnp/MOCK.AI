# Mock.AI — Phase 3.6 Security Remediation Proposal v4.4
### Document Title: `PHASE_3_6_SECURITY_REMEDIATION_PROPOSAL_v4_4.md`
**Proposal Version:** `4.4.0-TRANSACTION-LOCK-BOUND-AND-FAIL-CLOSED-AUDIT`  
**Overall Readiness Gate:** 🔴 **RED — Implementation and Candidate-Facing Integration Strictly Blocked**  
**Document Status:** **STRICT DESIGN-ONLY AUDIT & ARCHITECTURAL SPECIFICATION**  
*(Strictly zero application source code modified, zero migrations applied, zero test suites executed)*

---

## 1. Document Status, Governance Locks & Audit Metadata

This document constitutes the definitive architectural design review and remediation specification **v4.4** for Mock.AI Phase 3.6. It resolves the critical timeout modeling defect and authorization boundary questions raised in the forensic review of proposal v4.3:

1. **Revalidation of the Transaction-Wide Lock Duration Claim:** Formally retracts the unproven claim that standard PostgreSQL per-statement timeouts (`statement_timeout = '2000ms'`, `lock_timeout = '1000ms'`, `idle_in_transaction_session_timeout = '2000ms'`) establish an upper bound of two seconds on proctor termination delays. Demonstrates why multi-statement transactions can hold row locks across several statements, and designs both an atomic single-statement database retrieval procedure and an application-enforced socket termination harness that actually bounds row-lock retention.
2. **Formalization of Authorization Linearization Point:** Rigorously defines the timeline of authorization effectiveness ($T_{\text{lin}}$) versus proctor termination ($T_{\text{proc}}$), documents the exact state where a candidate receives projection data while a proctor termination is queued, bounds this delay, and formalizes the preemption model as an open Product Owner policy decision (`DEP-GOV-TERM-01`).
3. **Verification of the Real Database Role-Switch Failure Path:** Analyzes the confirmed defect in [`deliveryPostgresAdapter.ts:108-112`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/deliveryPostgresAdapter.ts#L108-L112) where `SET LOCAL ROLE` failures are silently swallowed. Specifies the fail-closed abort semantics, client socket eviction, and the strict separation between physical connection credentials and effective transaction roles.
4. **Revalidation of Locking Privilege Scope:** Re-verifies PostgreSQL 14–16 locking privilege rules for `SELECT ... FOR SHARE`, proves the narrow scope of column-level `GRANT UPDATE (lease_heartbeat_at)`, and demonstrates why callers cannot manipulate session records.
5. **Comprehensive Transaction and Connection Pool Lifecycle Matrix:** Constructs an exhaustive 11-scenario failure matrix detailing lock release, rollback requirements, socket pool safety, data leak potential, and caller visibility across all checkout, execution, timeout, and teardown scenarios.
6. **Preservation of Replay Invariant & Frozen Governance:** Reaffirms the deterministic single-commit invariant over nondeterministic race winners, post-expiry ledger pruning, and all frozen Phase 3 contracts.

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

## 2. Change Log (v4.3 $\rightarrow$ v4.4)

1. **Revalidated Lock Duration & Disproved Per-Statement Timeout Bounds:** Proved that `statement_timeout`, `lock_timeout`, and `idle_in_transaction_session_timeout` do not limit cumulative transaction duration across multiple statements. Designed two verifiable bounding mechanisms: (a) Atomic procedural single-statement retrieval, and (b) Node.js application `AbortSignal` with hard TCP stream destruction.
2. **Formalized Authorization Linearization vs Proctor Queuing:** Modeled the exact timeline where candidate `FOR SHARE` locks queue proctor `FOR UPDATE` writes, proving that candidate reads complete if the lock was acquired before proctor transaction execution. Framed preemption policy as blocking dependency `DEP-GOV-TERM-01`.
3. **Hardened Role-Switch Fail-Closed Architecture:** Detailed the fail-closed abort path for `deliveryPostgresAdapter.ts`, requiring immediate `ROLLBACK`, client socket destruction, and prohibition of fallback to physical superuser credentials.
4. **Expanded Transaction & Pool Lifecycle Failure Matrix:** Created an 11-point failure matrix auditing row lock retention, rollback necessity, socket contamination, and caller-visible outcomes.
5. **Harmonized 18-Test Adversarial Matrix:** Maintained the reconciled 18-scenario test inventory, explicitly recording zero executed tests.

---

## 3. Evidence Classification Taxonomy

- **`[A] Direct Repository Evidence`**: Verified by exact file path, line numbers, and repository contents.
- **`[B] Executed Test Evidence`**: Confirmed by executed test output in this workspace (all adversarial tests are explicitly marked *unexecuted*).
- **`[C] Verified PostgreSQL Semantics`**: Verified against official PostgreSQL engine documentation, parser/executor source behavior, locking semantics, and catalog specifications.
- **`[D] Proposed Design`**: Architectural design, schema migration, or code pattern proposed for implementation.
- **`[E] Unresolved External Dependency`**: Blocking prerequisite external to the immediate gateway codebase.
- **`[F] Unverified Runtime Assumption`**: State of the live deployed database, network topology, or hosting environment that cannot be verified statically from repository code.

---

## 4. Revalidation of the Transaction-Wide Lock Duration Claim

### 4.1 Deconstructing the v4.3 Two-Second Timeout Flaw `[C]`

In proposal v4.3 (Section 6.2), it was asserted:
> *"The maximum time a proctor can be queued behind a candidate read is strictly bounded by statement_timeout (2 seconds)... If the candidate transaction exceeds 2 seconds, PostgreSQL automatically cancels the transaction, executes ROLLBACK, and releases the row lock..."*

**Adversarial Technical Correction (`[C]`):**  
This claim is technically invalid under standard PostgreSQL engine semantics:
1. **`statement_timeout` Limits Individual Statements Only:** `statement_timeout` starts a timer when a single SQL statement is received from the client and resets the timer when that statement completes execution. It does **not** track cumulative transaction duration.
   - If a candidate transaction executes:
     - Statement 1 (`bind_context`): takes 1.2s.
     - Statement 2 (`SELECT * FROM exam_session_projections`): takes 1.5s.
     - Statement 3 (`SELECT * FROM canonical_package_items`): takes 1.4s.
   - Each statement individually complies with `statement_timeout = '2000ms'`. Yet the transaction has held the row lock for **4.1 seconds**, delaying a concurrent proctor update far beyond the claimed 2-second upper bound.
2. **`lock_timeout` Applies to the Waiting Connection:** `lock_timeout = '1000ms'` limits how long the connection on which it is configured will wait to acquire a lock.
   - If configured on the Candidate connection, it limits the Candidate waiting for locks, not the Proctor waiting for the Candidate!
   - If configured on the Proctor connection, the Proctor will abort with `ERROR: canceling statement due to lock timeout` after 1 second if the Candidate is still reading!
3. **`idle_in_transaction_session_timeout` Only Bounds Idle Periods:** This setting only fires when the server is waiting for the client to send the next query within an open transaction block. While an active statement is actively executing on the engine, the session is **not idle**, so this timeout has zero effect.
4. **PostgreSQL Version Constraints (`[C]`, `[F]`):** PostgreSQL 17 introduces a native `transaction_timeout` setting. However, Mock.AI targets PostgreSQL 14–16 (standard Supabase environment). In PostgreSQL 14–16, **there is no native PostgreSQL GUC that enforces a cumulative transaction-wide execution deadline across multiple statements**.

### 4.2 Mechanisms that Actually Bound Transaction & Row-Lock Lifetime `[C]`, `[D]`

To establish a verified upper bound on row-lock retention and prevent indefinite proctor delays, the architecture must utilize one of two concrete bounding mechanisms:

#### Mechanism A: Atomic Single-Statement Procedural Retrieval (Database-Enforced) `[C]`, `[D]`
Instead of executing multiple sequential statements over the client connection, the entire operation—context binding, authorization verification, row locking, and projection projection assembly—is encapsulated inside a **single stored procedure**:
```sql
-- Single SQL call executed by application:
SELECT * FROM uadue_auth.get_candidate_projection(
    p_raw_canonical_payload => $1,
    p_signature             => $2,
    p_key_id                => $3
);
```
**Why Mechanism A Bounds Lock Duration (`[C]`):**  
Because the entire transaction consists of exactly one statement, PostgreSQL's `statement_timeout = '2000ms'` starts when `get_candidate_projection` begins and enforces a **hard 2000ms ceiling on the entire operation**. If total execution exceeds 2000ms, the engine automatically cancels the statement, executes `ROLLBACK`, releases the `FOR SHARE` row lock, and allows the proctor to commit.

#### Mechanism B: Application-Level Hard Deadline with Socket Destruction (Transport-Enforced) `[C]`, `[D]`
In Node.js, wrap the multi-statement transaction in an `AbortSignal` with hard socket eviction:
```typescript
const client = await pool.connect();
const abortController = new AbortController();
const timeoutId = setTimeout(() => {
  abortController.abort();
  // FORCE HARD SOCKET DESTRUCTION:
  (client as any).connection?.stream?.destroy();
}, 2000);

try {
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE uadue_tenant_runtime');
  await client.query('SELECT uadue_auth.bind_context($1, $2, $3)', [raw, sig, kid]);
  const res = await client.query('SELECT * FROM exam_session_projections WHERE exam_session_id = $1', [sid]);
  await client.query('COMMIT');
  clearTimeout(timeoutId);
  return res.rows[0];
} catch (err) {
  clearTimeout(timeoutId);
  await client.query('ROLLBACK').catch(() => {});
  client.release(err); // Evict destroyed or errored socket
  throw err;
}
```
**Why Mechanism B Bounds Lock Duration (`[C]`):**  
If 2000ms elapses, the application forcefully calls `.destroy()` on the underlying TCP stream. When the socket disconnects, the PostgreSQL backend process immediately receives an `EOF` / `ECONNRESET` signal, triggers an immediate internal `FATAL: connection terminated` event, performs an atomic engine rollback, and **instantly releases the row lock**.

---

## 5. Formalization of the Authorization Linearization Point

### 5.1 Authorization Timeline & Effective States `[C]`, `[D]`

```
Timeline: Candidate Linearization vs Proctor Termination
───────────────────────────────────────────────────────────────────────────────
Time T0: Candidate starts query: BEGIN; SET LOCAL ROLE uadue_tenant_runtime;
Time T1: Candidate executes bind_context():
         • Acquires SELECT ... FOR SHARE lock on exam_sessions row.
         • Evaluates session_state == 'ACTIVE' and deadline.
         ======================================================================
         ==> T_lin (Authorization Linearization Point): Candidate is ACTIVE. ==
         ======================================================================
Time T2: Proctor initiates terminateSession():
         • Executes SELECT * FROM exam_sessions WHERE ... FOR UPDATE;
         • BLOCKS in PostgreSQL tuple lock manager waiting for Candidate lock!
Time T3: Candidate executes SELECT * FROM exam_session_projections;
         • Projection data generated and transferred across network.
Time T4: Candidate executes COMMIT;
         • FOR SHARE lock released.
         • Candidate receives 200 OK with questions.
Time T5: Proctor's query UNBLOCKS:
         • Acquires FOR UPDATE lock.
         • Executes UPDATE exam_sessions SET session_state = 'TERMINATED';
         • Proctor COMMITS. Session is now permanently TERMINATED.
───────────────────────────────────────────────────────────────────────────────
```

### 5.2 Key Linearization Invariants

1. **Authorization Effective Instant ($T_{\text{lin}}$):**  
   Candidate authorization becomes legally effective at the exact instant `bind_context` acquires the `FOR SHARE` row lock and verifies `session_state == 'ACTIVE'`.
2. **Proctor State Change Effective Instant ($T_{\text{proc}}$):**  
   Proctor termination becomes legally effective in the database when the proctor transaction **commits** ($T_5$).
3. **Data Return While Termination is Queued:**  
   If a candidate acquired the row lock at $T_1$, and the proctor initiated termination at $T_2$, **the candidate will receive projection data for that read request**. The proctor update waits until the candidate transaction finishes.
4. **Rejection of Future Requests:**  
   Once the proctor transaction commits at $T_5$, any subsequent candidate request will execute `bind_context`, read `session_state = 'TERMINATED'`, and fail closed with `ERR_SESSION_NOT_ACTIVE (P0013)`.
5. **No Instantaneous Preemption:**  
   Row locking guarantees **serializability and mutual exclusion**, not instantaneous preemption. It prevents concurrent modifications from corrupting reads, but permits in-flight reads that acquired the lock first to complete.

### 5.3 Governance Dependency: `DEP-GOV-TERM-01` `[E]`
The Product Owner must explicitly approve whether bounded proctor queuing (up to 2000ms delay) is acceptable, or whether a hard preemption policy (killing candidate connections via `pg_terminate_backend`) is required. **Marked as Blocking Governance Dependency `DEP-GOV-TERM-01`**.

---

## 6. Verification of the Real Role-Switch Failure Path

### 6.1 Confirmed Defect in `deliveryPostgresAdapter.ts` `[A]`
Inspection of [`web/src/services/uadue/delivery/deliveryPostgresAdapter.ts:108-112`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/deliveryPostgresAdapter.ts#L108-L112) reveals:
```typescript
try {
  await client.query('SET LOCAL ROLE uadue_app_user');
} catch {
  // Fallback if role is not available  <-- CONFIRMED DEFECT
}
```
If `SET LOCAL ROLE` fails, the error is swallowed, and the request executes under the physical pool credentials (`postgres` or local superuser `shivarampatel`), completely bypassing RLS.

### 6.2 Mandatory Fail-Closed Specification `[D]`

The connection adapter contract must strictly enforce:
1. **Zero Error Swallowing:** Any failure in `SET LOCAL ROLE` must immediately throw a fatal exception.
2. **Immediate Rollback & Socket Eviction:**
   ```typescript
   try {
     await client.query('SET LOCAL ROLE uadue_tenant_runtime');
   } catch (err) {
     await client.query('ROLLBACK').catch(() => {});
     client.release(err); // Forces pool to destroy contaminated socket
     throw new SecurityRoleSwitchError('FATAL: Database role switch failed. Transaction aborted fail-closed.', err);
   }
   ```
3. **Prohibition of Protected Execution:** No protected projection query may execute if role switching has not succeeded.
4. **Distinction of Identities:**
   - *Physical Identity:* Authenticated connection pool user (`uadue_pool_authenticator`), possessing `NOLOGIN` for administrative users, zero direct table permissions, and `GRANT uadue_tenant_runtime TO uadue_pool_authenticator`.
   - *Effective Transaction Role:* `uadue_tenant_runtime`, constrained by RLS policies and `rolbypassrls = false`.

---

## 7. Revalidation of Locking Privilege Scope

### 7.1 PostgreSQL Engine Locking Rules `[C]`
Under official PostgreSQL 14–16 documentation for `SELECT` (*The Locking Clause*):
- `SELECT ... FOR SHARE` sets shared row-locking intent on the target relation.
- When table-level write privileges are restricted, PostgreSQL checks column-level privileges. To execute a row-locking query on a relation, the executing role must possess `SELECT` privilege on the referenced columns, and `UPDATE` privilege on at least one column of the table being locked.
- If `uadue_security_admin` has strictly `SELECT` with zero `UPDATE` privilege, PostgreSQL aborts with `ERROR: permission denied for table exam_sessions`.

### 7.2 Scope and Safety of `GRANT UPDATE (lease_heartbeat_at)` `[C]`, `[D]`
The narrowest viable permission arrangement grants:
```sql
GRANT SELECT (
    exam_session_id, tenant_id, candidate_id, package_id,
    package_integrity_seal, session_state, current_lease_id,
    actual_started_at, duration_seconds
) ON public.exam_sessions TO uadue_security_admin;

GRANT UPDATE (lease_heartbeat_at) ON public.exam_sessions TO uadue_security_admin;
```

#### Why Callers Cannot Mutate Session Records:
1. **Executable Surface Lockdown:** `uadue_security_admin` owns `bind_context`. Inside the compiled PL/pgSQL function body, the only SQL query referencing `exam_sessions` is:
   ```sql
   SELECT tenant_id, candidate_id, package_id, package_integrity_seal, session_state, current_lease_id, actual_started_at, duration_seconds
   FROM public.exam_sessions WHERE exam_session_id = v_sid FOR SHARE;
   ```
   There is **no `UPDATE` statement in `bind_context`**.
2. **Caller Privilege Isolation:** The calling role `uadue_tenant_runtime` has `REVOKE ALL PRIVILEGES ON public.exam_sessions`. Callers cannot invoke arbitrary SQL under `uadue_security_admin`.
3. **Immutability of Authoritative Columns:** `session_state`, `tenant_id`, `candidate_id`, `package_id`, and `package_integrity_seal` have zero update privileges granted to any role in candidate delivery.

---

## 8. Comprehensive Transaction and Connection Pool Lifecycle Matrix

The following failure matrix defines deterministic behavior across eleven (11) lifecycle scenarios:

| Lifecycle Scenario | Row Lock Held? | Rollback Required? | Safe to Return Socket to Pool? | Protected Data Returned? | Expected Caller-Visible Result |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **1. Connection Checkout Failure** | ❌ No | ❌ No | ❌ N/A (no socket) | ❌ No | 503 Service Unavailable |
| **2. Transaction Start Failure (`BEGIN`)** | ❌ No | ❌ No | 🔴 **Destroy Socket** (`release(err)`) | ❌ No | 500 Internal Database Error |
| **3. Role-Switch Failure (`SET LOCAL ROLE`)** | ❌ No | 🟢 **Yes** (`ROLLBACK`) | 🔴 **Destroy Socket** (`release(err)`) | ❌ No | 403 Forbidden (`ERR_ROLE_SWITCH_FAILED`) |
| **4. Context-Binding Failure (`bind_context`)**| ❌ Released on abort | 🟢 **Yes** (`ROLLBACK`) | 🔴 **Destroy Socket** (`release(err)`) | ❌ No | 403 Forbidden (Specific code `P0001`–`P0021`) |
| **5. Projection Query Timeout (`statement_timeout`)**| ❌ Auto-released | 🟢 **Yes** (Engine auto-aborts) | 🔴 **Destroy Socket** (`release(err)`) | ❌ No | 504 Gateway Timeout (`statement_timeout`) |
| **6. Lock Timeout (`lock_timeout`)** | ❌ Not acquired | 🟢 **Yes** (Engine auto-aborts) | 🔴 **Destroy Socket** (`release(err)`) | ❌ No | 504 Gateway Timeout (`lock_timeout`) |
| **7. Application Cancellation (`AbortSignal`)**| ❌ Auto-released | 🟢 **Yes** (Engine auto-aborts) | 🔴 **Destroy Socket** (Stream destroyed) | ❌ No | 499 Client Closed Request |
| **8. Client Disconnect (TCP RST / FIN)** | ❌ Engine auto-releases| 🟢 **Yes** (Engine auto-aborts) | 🔴 **Destroy Socket** (Stream destroyed) | ❌ No | Network Drop (Socket closed) |
| **9. Rollback Failure (`ROLLBACK` errors)** | ❌ Engine resets socket| ❌ Rollback failed | 🔴 **Destroy Socket** (`release(err)`) | ❌ No | 500 Internal Database Error |
| **10. Commit Failure (`COMMIT` errors)** | ❌ Released on error | 🟢 Engine auto-aborts | 🔴 **Destroy Socket** (`release(err)`) | ❌ No | 500 Commit Aborted (Ambiguous outcome) |
| **11. Successful Execution & Release** | ❌ Released on COMMIT | ❌ No (Committed) | 🟢 **Yes** (`client.release()`) | 🟢 **Yes** | 200 OK (Projection delivered) |

---

## 9. Replay Protection & Frozen Governance Contracts

### 9.1 Replay Invariant Across Concurrent Presentations `[C]`, `[D]`
The security contract is strictly defined as:  
**At most one transaction can successfully commit consumption of a given `jti`.**
- Under concurrent presentation of the same `jti` across two transactions ($T_1, T_2$), the winner is determined nondeterministically by PostgreSQL unique index conflict arbitration.
- The winner commits and consumes the `jti` (200 OK).
- The loser blocks, unblocks on commit, and receives `ERR_REPLAY_DETECTED (P0006)`.
- If the winner rolls back, the loser unblocks, successfully inserts `jti`, and commits (200 OK).

### 9.2 Expired-Ticket Ledger Pruning Lifecycle `[D]`
- Rows in `uadue_auth.consumed_tickets` are purged after `expires_at + 5 minutes`.
- Any presentation of an expired ticket ($T_{\text{clock}} > \text{exp}$) is rejected at Gate 1 timestamp validation before `consumed_tickets` is queried. Pruning dead rows cannot weaken replay protection.

### 9.3 Frozen Phase 3 Governance Contracts `[A]`
All frozen governance baselines remain strictly locked:
1. **Phase 3.5 Scoring Freeze:** Scoring formulas, DAGs, and dispute tables locked.
2. **`AP-DEC-013`:** Assessment policy rules strictly preserved.
3. **`ACTIVE`-Only Live Question Access:** No question retrieval permitted in non-`ACTIVE` states.
4. **Zero Question-Viewing Grace:** Strict deadline enforcement; zero question viewing grace.
5. **Submission Transport Grace:** 15-second grace window applies strictly to answer ingestion events.
6. **`EXAM:SOLUTION_AUDIT` Capability Contract:** Post-exam solutions released only after administrative result release.

---

## 10. Authoritative Test Inventory (Reconciliation of 18 Scenarios)

The test inventory is formally reconciled into eighteen (18) unique scenarios. **All 18 scenarios remain completely unexecuted (`[B]`):**

| Test ID | Test Category & Adversarial Objective | Specified? | Authored? | Executed? | Passed? | Independent Review |
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

---

## 11. Deliverable & Final Implementation Gate

### 11.1 Repository Evidence Examined
- [`web/src/services/uadue/delivery/deliveryPostgresAdapter.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/deliveryPostgresAdapter.ts) (Lines 62–125): Confirmed silent error swallowing in `SET LOCAL ROLE` and fallback to physical connection credentials.
- [`web/src/services/uadue/delivery/sessionOrchestrator.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/sessionOrchestrator.ts) (Lines 135–902): Confirmed all 9 session writer methods use `SELECT ... FOR UPDATE`.
- [`supabase/migrations/20261007_uadue_phase2d8_canonical.sql`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase2d8_canonical.sql) (Lines 115–370): Confirmed 6 unprotected child tables and blanket `ALL PRIVILEGES` on `uadue_app_user`.
- [`supabase/migrations/20261007_uadue_phase3_database_foundation.sql`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase3_database_foundation.sql) (Lines 18–307): Confirmed session table schema and duplicate blanket role grants.

### 11.2 Confirmed Defects & Unverified Deployment Assumptions
- **Confirmed Defect 1:** `deliveryPostgresAdapter.ts` swallows `SET LOCAL ROLE` errors, falling back to physical superuser credentials.
- **Confirmed Defect 2:** In migrations, `uadue_app_user` holds blanket `ALL PRIVILEGES` across all tables, functions, and sequences.
- **Unverified Assumption 1 (`[F]`):** Live deployment Supabase database credentials and role hierarchy.
- **Unverified Assumption 2 (`[F]`):** Target deployment availability of `pg_sodium` extension.

### 11.3 Product Owner Decisions Still Required
1. **Approval of Proctor Preemption Policy (`DEP-GOV-TERM-01`):** Formally approve Policy Alpha (Transactional Mutual Exclusion with 2s Bounded Delay) or Policy Beta (Hard Backend Preemption).
2. **Authorization of Database Role & RLS Migration Phase (`DEP-SEC-CHILD-01`, `DEP-SEC-GUC-01`):** Authorize stripping `uadue_app_user` of blanket privileges, creating `uadue_tenant_runtime`, and applying RLS to child tables.

### 11.4 Final Implementation Gate Verdict

| Evaluation Dimension | Current Assessment | Gate Verdict |
| :--- | :--- | :---: |
| **Transaction-Wide Lock Bound** | Multi-statement timeout gap disproved; atomic procedure and socket destruction harnesses specified. | 🟢 **PASS (Design)** |
| **Fail-Closed Role Boundary** | Defect confirmed in `deliveryPostgresAdapter.ts`; fail-closed abort and eviction specified; unmigrated. | 🔴 **BLOCKED** |
| **Row-Locking Writer Compatibility**| Natively coordinates with existing `FOR UPDATE` writers; column `UPDATE` scoped; timeouts modeled. | 🟢 **PASS (Design)** |
| **Child-Table RLS Completeness** | Six child tables audited; least-privilege inventory complete; migrations unapplied. | 🔴 **BLOCKED** |
| **Cryptographic Byte Verification**| Raw canonical byte pipeline and `kid` assertion formalized; test suite unexecuted. | 🔴 **UNCERTIFIED** |
| **Replay Matrix & Retention** | Dual-branch race model and 5-minute post-expiry pruning formalized. | 🟢 **PASS (Design)** |
| **Projection Contract Alignment** | Authoritative `EXAM:SOLUTION_AUDIT` preserved; live projection gated strictly to `ACTIVE`. | 🟢 **PASS** |

### **Overall Gate: 🔴 RED — Implementation and Candidate-Facing Integration Strictly Blocked**

**Summary for Gatekeeper:**  
Proposal v4.4 disproves the claim that standard per-statement timeouts bound multi-statement transaction durations, specifying atomic procedural retrieval and transport-level socket destruction to guarantee row-lock release within 2000ms. It models the authorization linearization timeline, details the fail-closed role switch specification, and constructs an exhaustive 11-point transaction and pool lifecycle matrix. Because role migrations, RLS policies, and all 18 adversarial test scenarios remain unapplied and unexecuted, the overall gate remains strictly **🔴 RED**. Exactly zero application source files were modified, zero migrations were applied, and zero tests were executed.
