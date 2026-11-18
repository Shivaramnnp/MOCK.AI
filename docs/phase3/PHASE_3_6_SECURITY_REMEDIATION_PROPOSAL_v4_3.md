# Mock.AI — Phase 3.6 Security Remediation Proposal v4.3
### Document Title: `PHASE_3_6_SECURITY_REMEDIATION_PROPOSAL_v4_3.md`
**Proposal Version:** `4.3.0-FAIL-CLOSED-ROLE-AND-LOCKING-SEMANTICS`  
**Overall Readiness Gate:** 🔴 **RED — Implementation and Candidate-Facing Integration Strictly Blocked**  
**Document Status:** **STRICT DESIGN-ONLY AUDIT & ARCHITECTURAL SPECIFICATION**  
*(Strictly zero application source code modified, zero migrations applied, zero test suites executed)*

---

## 1. Document Status, Governance Locks & Audit Metadata

This document constitutes the definitive architectural design review and remediation specification **v4.3** for Mock.AI Phase 3.6. It directly addresses the critical security-boundary defect and concurrency modeling gaps identified in the forensic review of proposal v4.2:

1. **Critical Fail-Closed Role Switching Boundary:** Formally analyzes the critical defect in [`web/src/services/uadue/delivery/deliveryPostgresAdapter.ts:108-112`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/deliveryPostgresAdapter.ts#L108-L112) where `SET LOCAL ROLE` failures are silently swallowed. Proves the privilege-escalation vulnerability where candidate transactions execute under physical superuser credentials, and specifies strict fail-closed requirements.
2. **Session-Locking Protocol Completeness & Privilege Scope:** Re-evaluates row-level locking (`SELECT ... FOR SHARE`) against existing writer implementations in [`sessionOrchestrator.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/sessionOrchestrator.ts), verifying that writers use `SELECT ... FOR UPDATE`, confirming the exact scope of column-level `GRANT UPDATE (lease_heartbeat_at)`, and proving why callers cannot manipulate session records.
3. **Explicit Termination Semantics & Proctor Preemption Model:** Models the security and product tradeoff between instantaneous proctor termination and transactional row locking. Defines the authorization lifespan, bounds delayed termination via strict statement and lock timeouts, and frames the preemption policy as a blocking Product Owner governance decision (`DEP-GOV-TERM-01`).
4. **Correction of Advisory-Lock Key Derivation & Collision Analysis:** Rectifies the mathematical fallacy in v4.1/v4.2 regarding `hashtext(...)::bigint`. Proves that PostgreSQL `hashtext` yields a signed 32-bit integer subject to birthday collisions at $\approx 65,536$ sessions, details true 64-bit derivation, and formally confirms why advisory locking remains unapproved due to non-participating writers.
5. **Deterministic Replay Invariant Across Nondeterministic Winners:** Formalizes the dual-branch concurrency race ($T_1$ vs $T_2$), proving that while the winner is nondeterministic, the guarantee that at most one transaction commits and consumes a given `jti` is strictly deterministic. Formulates the exact 5-minute post-expiry pruning lifecycle.
6. **Authoritative 18-Test Inventory:** Reconciles the full test inventory across specified adversarial scenarios, explicitly confirming that all 18 scenarios remain completely unexecuted.

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

## 2. Change Log (v4.2 $\rightarrow$ v4.3)

1. **Formalized Fail-Closed Database Role Switching:** Documented the exact failure mode of silent error swallowing in `deliveryPostgresAdapter.ts`. Mandated strict fail-closed abort semantics, client connection destruction on role failure, and distinguished physical connection identity from effective transaction roles.
2. **Explicitly Modeled Proctor Termination Semantics:** Analyzed the tradeoff where candidate `FOR SHARE` locks temporarily delay proctor `TERMINATED` commits. Introduced bounded transaction timeouts (`statement_timeout = '2000ms'`, `lock_timeout = '1000ms'`) and created governance dependency `DEP-GOV-TERM-01`.
3. **Corrected `hashtext` Width & Advisory-Lock Collision Math:** Corrected the erroneous assertion that `hashtext` provides 64-bit entropy. Proved that `hashtext` produces a 32-bit integer ($2^{32}$) with birthday collisions at $2^{16} = 65,536$ items. Specified true 64-bit key derivation and maintained advisory locking as rejected.
4. **Hardened Replay Invariant Specification:** Formulated dual-branch execution proofs for concurrent presentation, rollbacks, ambiguous commits (connection lost after commit before ACK), and ticket expiry during retries.
5. **Audited RLS Scope & Migration Gaps:** Re-verified blanket `ALL PRIVILEGES` on `uadue_app_user` across migrations and defined the required revocation and child-table RLS actions.
6. **Authoritative Test Reconciliation:** Verified the complete 18-test inventory (`ADV-01` through `ADV-18`) with explicit execution metadata.

---

## 3. Evidence Classification Taxonomy

- **`[A] Direct Repository Evidence`**: Verified by exact file path, line numbers, and repository contents.
- **`[B] Executed Test Evidence`**: Confirmed by executed test output in this workspace (all adversarial tests are explicitly marked *unexecuted*).
- **`[C] Verified PostgreSQL Semantics`**: Verified against official PostgreSQL engine documentation, parser/executor source behavior, locking semantics, and catalog specifications.
- **`[D] Proposed Design`**: Architectural design, schema migration, or code pattern proposed for implementation.
- **`[E] Unresolved External Dependency`**: Blocking prerequisite external to the immediate gateway codebase.
- **`[F] Unverified Runtime Assumption`**: State of the live deployed database, network topology, or hosting environment that cannot be verified statically from repository code.

---

## 4. Critical: Database Role Switch Must Fail Closed

### 4.1 Forensic Analysis of `deliveryPostgresAdapter.ts` `[A]`

Inspection of [`web/src/services/uadue/delivery/deliveryPostgresAdapter.ts:91-125`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/deliveryPostgresAdapter.ts#L91-L125) reveals a critical privilege-boundary vulnerability:

```typescript
// web/src/services/uadue/delivery/deliveryPostgresAdapter.ts:107-115
} else {
  try {
    await client.query('SET LOCAL ROLE uadue_app_user');
  } catch {
    // Fallback if role is not available  <-- CRITICAL DEFECT: SILENT ERROR SWALLOWING
  }
  await client.query("SELECT set_config('app.is_service_role', 'false', true)");
  await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
}
const result = await callback(client);
await client.query('COMMIT');
```

#### Vulnerability Trace (`[A]`, `[C]`):
1. **Silent Fallback to Physical Superuser:** If `SET LOCAL ROLE uadue_app_user` throws an exception (e.g., role does not exist, connection user lacks `SET ROLE` permission, or syntax error), the exception is **silently caught and discarded**.
2. **Execution Under Elevated Privileges:** The transaction continues directly to `callback(client)` executing under the **physical connection identity**.
3. Per lines 62–67 of `deliveryPostgresAdapter.ts`, the pool initializes using `process.env.DATABASE_URL` or local default `'postgres://shivarampatel:@localhost:5432/mockai_uadue_test'`. In local environments and standard Supabase connection strings, this physical user is `postgres` or the local superuser.
4. Superusers automatically possess `rolsuper = true` and `rolbypassrls = true`. Consequently, **Row-Level Security is completely bypassed**, and candidate queries run with unconstrained administrative access!
5. **Connection Pool Contamination:** In `finally { client.release(); }`, if an error or incomplete state change occurred on the socket, returning the client to the pool without explicit eviction (`client.release(err)`) risks leaking contaminated session state.

### 4.2 Separation of Identities & Privilege Layers `[C]`, `[D]`

To guarantee database least privilege, the architecture must strictly distinguish five separate layers:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Layer A: Physical Connection Identity (Pool Authenticator)                 │
│ • Authenticated via connection string (e.g. uadue_pool_authenticator).     │
│ • Strictly NOLOGIN for superuser; holds NO direct table permissions.        │
│ • Holds strictly: GRANT uadue_tenant_runtime TO uadue_pool_authenticator;  │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer B: Effective Transaction Role                                         │
│ • Assumed at transaction start via SET LOCAL ROLE uadue_tenant_runtime;     │
│ • Strictly reverts to pool authenticator at COMMIT or ROLLBACK.            │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer C: Role Memberships & SET ROLE Capabilities                          │
│ • Controlled via pg_auth_members; cannot assume postgres or admin roles.    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer D: Row-Level Security (RLS) Enforcement                               │
│ • ENABLE + FORCE RLS on all operational and canonical tables.              │
│ • uadue_tenant_runtime has rolbypassrls = FALSE; RLS is strictly enforced.  │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer E: Function-Owner Privileges (SECURITY DEFINER)                       │
│ • Owned by uadue_security_admin (NOLOGIN, NOINHERIT, bounded BYPASSRLS).   │
│ • Invoked strictly through compiled procedural interface uadue_auth.       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Mandatory Fail-Closed Specification `[D]`

The connection adapter contract must be redesigned to enforce the following mandatory invariants:
1. **Checkout Failure Abort:** If `pool.connect()` fails, abort the request immediately.
2. **Transaction Initialization Abort:** If `await client.query('BEGIN')` fails, abort immediately.
3. **Role Switch Fail-Closed Requirement:**
   ```typescript
   try {
     await client.query('SET LOCAL ROLE uadue_tenant_runtime');
   } catch (roleError) {
     await client.query('ROLLBACK').catch(() => {});
     client.release(roleError); // Destroy socket; do not return to pool
     throw new SecurityPrivilegeBoundaryError(
       'FATAL: Failed to assume candidate runtime role. Request aborted fail-closed.',
       roleError
     );
   }
   ```
4. **Prohibition of Protected Queries:** Zero protected projection queries may execute if role switching has not explicitly succeeded.
5. **Zero Silent Fallback:** Silent fallback to physical connection credentials is **strictly prohibited**.
6. **Contaminated Socket Destruction:** Any connection encountering a role switch failure or unhandled exception must be evicted from the pool using `client.release(err)`, forcing the `pg` driver to destroy the underlying TCP socket.

---

## 5. Audit of the Row-Locking Design (`SELECT ... FOR SHARE`)

### 5.1 Writer Protocol Verification in Existing Code `[A]`, `[C]`

Direct code audit of [`sessionOrchestrator.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/sessionOrchestrator.ts) confirms how session mutations execute:
1. **State Transitions (Lines 135–689):** All eight transition methods call `fetchSessionForUpdate` (line 871):
   ```sql
   SELECT * FROM public.exam_sessions WHERE exam_session_id = $1 FOR UPDATE
   ```
   followed by `UPDATE public.exam_sessions SET session_state = $1 ... WHERE exam_session_id = $13`.
2. **Heartbeats (Lines 447–455):** `updateHeartbeat` executes:
   ```sql
   UPDATE public.exam_sessions SET lease_heartbeat_at = $1, updated_at = $1 WHERE exam_session_id = $2
   ```
   In PostgreSQL, direct `UPDATE` statements acquire an exclusive tuple lock on the row being updated.

**Concurrency Engine Proof (`[C]`):**  
In PostgreSQL's tuple lock manager, `FOR SHARE` and `FOR UPDATE` (as well as direct `UPDATE`) on the same physical tuple are **mutually exclusive**:
- A candidate transaction holding `FOR SHARE` on `exam_sessions` causes any concurrent proctor `FOR UPDATE` or heartbeat `UPDATE` to **wait in the PostgreSQL lock queue**.
- A proctor transaction holding `FOR UPDATE` causes candidate `FOR SHARE` to wait until the proctor transaction commits or rolls back.
- **Zero code changes** are required in `sessionOrchestrator.ts`. The existing codebase already implements the required writer locking primitive (`FOR UPDATE`).

### 5.2 Transaction Boundary & Projection Read Lifespan `[C]`, `[D]`

To guarantee complete consistency, the candidate transaction boundary must encompass all projection reads:

```typescript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE uadue_tenant_runtime');
  
  // 1. Authorization Gate & Shared Lock Acquisition
  await client.query(
    'SELECT uadue_auth.bind_context($1, $2, $3)',
    [p_raw_canonical_payload, p_signature, p_key_id]
  );
  
  // 2. Protected Projection Retrieval (Row lock is continuously held!)
  const projectionRes = await client.query(
    'SELECT * FROM public.exam_session_projections WHERE exam_session_id = $1',
    [v_sid]
  );
  
  // 3. Commit: Releases FOR SHARE lock and permanently commits jti consumption
  await client.query('COMMIT');
  return projectionRes.rows[0];
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  throw err;
} finally {
  client.release();
}
```

#### Invariants Enforced by Boundary:
1. **Continuous Lock Hold:** The row lock acquired inside `bind_context` is held across the retrieval of `exam_session_projections` and canonical items.
2. **Automatic Lock Release on Error:** Any query error or network disconnect triggers `ROLLBACK` (either explicitly or via PostgreSQL socket teardown), immediately releasing the lock.
3. **No Alternate Projection Path:** `public.exam_session_projections` enforces RLS:
   ```sql
   CREATE POLICY p3_candidate_projection_read ON public.exam_session_projections
   FOR SELECT TO uadue_tenant_runtime
   USING (package_id = uadue_auth.get_current_package_id());
   ```
   If `bind_context` has not executed in this transaction, `get_current_package_id()` returns `NULL`, returning 0 rows.

### 5.3 Column-Level Privilege Scope on `lease_heartbeat_at` `[C]`, `[D]`

To satisfy PostgreSQL locking-clause privilege requirements without granting broad update rights:
```sql
GRANT SELECT (
    exam_session_id, tenant_id, candidate_id, package_id,
    package_integrity_seal, session_state, current_lease_id,
    actual_started_at, duration_seconds
) ON public.exam_sessions TO uadue_security_admin;

GRANT UPDATE (lease_heartbeat_at) ON public.exam_sessions TO uadue_security_admin;
```

#### Why Callers Cannot Manipulate Session State:
1. **Executable Surface Lockdown:** `uadue_security_admin` is the owner of `bind_context`. Inside the compiled PL/pgSQL body, the only query against `exam_sessions` is:
   ```sql
   SELECT tenant_id, candidate_id, package_id, package_integrity_seal, session_state, current_lease_id, actual_started_at, duration_seconds
   FROM public.exam_sessions WHERE exam_session_id = v_sid FOR SHARE;
   ```
   There is **no `UPDATE` statement anywhere in `bind_context`**.
2. **Caller Privilege Isolation:** The calling role `uadue_tenant_runtime` has `REVOKE ALL PRIVILEGES ON public.exam_sessions` and `REVOKE UPDATE`. It cannot execute arbitrary SQL under `uadue_security_admin`.
3. **Immutable Operational State:** Authoritative columns (`session_state`, `tenant_id`, `candidate_id`, `package_id`, `package_integrity_seal`) have zero update privileges granted to any role involved in candidate delivery.

---

## 6. Explicit Termination Semantics & Proctor Preemption Model

### 6.1 The Security/Product Tradeoff: Immediate vs Transactional Termination `[D]`

When a candidate is reading projection data under `SELECT ... FOR SHARE`, a proctor attempting to terminate or pause the session (`SELECT ... FOR UPDATE`) is **queued until the candidate transaction releases its lock**:

```
Timeline: Candidate Lock vs Proctor Termination Race
───────────────────────────────────────────────────────────────────────────────
Time T0: Candidate begins read: bind_context() acquires FOR SHARE lock.
Time T1 (T0 + 10ms): Proctor issues terminateSession() -> attempts FOR UPDATE.
                     --> Proctor query BLOCKS waiting on candidate FOR SHARE lock!
Time T2 (T0 + 40ms): Candidate projection query completes. Candidate COMMITS.
                     --> Candidate received projection for the ACTIVE session.
Time T3 (T0 + 41ms): Proctor query unblocks, acquires FOR UPDATE, commits TERMINATED.
───────────────────────────────────────────────────────────────────────────────
```

#### Architectural Implications:
1. **Candidate May Receive Questions After Termination Initiated:** If the candidate acquired the lock at $T_0$, and the proctor initiated termination at $T_1$, the candidate's read completes and returns questions before the proctor's termination commits.
2. **Termination is NOT Instantaneous:** The proctor transition is deferred until the in-flight read transaction finishes.

### 6.2 Protection Against Stalled or Slow Projection Reads `[C]`, `[D]`

If a candidate connection stalls (e.g. slow client network or malicious connection hold), the proctor's termination must not be delayed indefinitely.  
**Mandatory Transaction Safeguards:**
```sql
-- Enforced on candidate runtime connections:
SET statement_timeout = '2000ms';                 -- Max 2 seconds per query
SET lock_timeout = '1000ms';                      -- Max 1 second waiting for locks
SET idle_in_transaction_session_timeout = '2000ms'; -- Max 2 seconds idle in transaction
```
- **Maximum Proctor Delay:** The maximum time a proctor can be queued behind a candidate read is strictly bounded by `statement_timeout` ($2\text{ seconds}$).
- **Engine Cancellation:** If the candidate transaction exceeds 2 seconds, PostgreSQL automatically cancels the transaction, executes `ROLLBACK`, and releases the row lock, allowing the proctor's `TERMINATED` update to commit immediately.

### 6.3 Governance Decision: `DEP-GOV-TERM-01` (Blocking PO Policy) `[E]`

The Product Owner must explicitly choose between two operational policies:
- **Policy Alpha (Transactional Mutual Exclusion with Bounded Delay - Recommended):** Candidate reads finish if they acquired the lock first (up to 2s timeout); proctor updates queue behind them. Once proctor commits, all future candidate reads are rejected.
- **Policy Beta (Hard Proctor Preemption):** Proctor termination forcefully terminates active candidate backends via `pg_terminate_backend(pid)` before applying `TERMINATED`.

*Status:* **Marked as Blocking Governance Dependency `DEP-GOV-TERM-01`**.

---

## 7. Correction of Advisory-Lock Key Derivation & Collision Analysis

### 7.1 Mathematical Fallacy in v4.1/v4.2 `[C]`
Proposal v4.1 and v4.2 suggested:
```sql
pg_advisory_xact_lock(hashtext('mockai_exam_session:' || v_sid::text)::bigint)
```
and claimed negligible 64-bit collision probability ($1 \text{ in } 2^{64}$).

**PostgreSQL Engine Reality (`[C]`):**  
- In PostgreSQL, the built-in function `hashtext(text)` returns **`integer`** (a signed **32-bit integer**).
- Casting `hashtext(...)::bigint` merely sign-extends a 32-bit value into a 64-bit integer. It provides **strictly 32 bits of entropy** ($2^{32} \approx 4.29 \times 10^9$ possible values).
- Under the **Birthday Paradox**, collision probability reaches 50% at:
  $$N \approx \sqrt{2^{32}} \approx 65,536 \text{ sessions}$$
- For a system processing hundreds of thousands of exam sessions, a 32-bit hash guarantees that distinct sessions will experience hash collisions. While hash collisions on advisory locks cause false contention rather than unauthorized data access, it causes unrelated candidate sessions to block each other.

### 7.2 True 64-Bit Key Derivation `[C]`, `[D]`
To achieve a true 64-bit advisory lock key in PostgreSQL:
```sql
-- Extract 64 bits directly from the 128-bit UUID hex representation:
('x' || substr(replace(v_sid::text, '-', ''), 1, 16))::bit(64)::bigint
```
This achieves $2^{64}$ states with 50% collision probability at $\approx 4.3 \times 10^9$ sessions.

### 7.3 Why Advisory Locking Remains Rejected `[A]`, `[D]`
Even with 64-bit key derivation, advisory locking remains **completely unviable** because:
1. As proven in Section 4.1, **zero existing writers** in `sessionOrchestrator.ts` acquire advisory locks.
2. There is no database mechanism to prevent future developers from writing standard SQL `UPDATE exam_sessions` without acquiring the custom advisory lock.
3. Therefore, advisory locking is marked **REJECTED / UNVERIFIED**.

---

## 8. Replay Protection: Exact Guarantee & Pruning Semantics

### 8.1 Deterministic Invariant Across Nondeterministic Winners `[C]`, `[D]`

In an uncoordinated concurrent race where two requests present the identical `jti` ($T_1, T_2$), the winner is **nondeterministic** (governed by network packet arrival and PostgreSQL lock queue scheduling).  
However, the **security invariant is strictly deterministic**:  
**At most one transaction can successfully commit a given `jti`.**

### 8.2 Comprehensive Race & Failure Matrix

| Scenario | Race Winner | Winner Action | Loser Action | Ledger State | Retry Permitted? |
| :--- | :---: | :--- | :--- | :--- | :---: |
| **RACE-1** | **$T_1$** | **Commits** (200 OK projection delivered). | **Blocks, unblocks on commit, throws `P0006`** (403 Forbidden). | 1 row committed for `jti`. | 🔴 Forbidden with same `jti`. |
| **RACE-2** | **$T_1$** | **Rolls back** (e.g. transient query error). | **Blocks, unblocks on rollback, inserts `jti`, commits** (200 OK). | 1 row committed by $T_2$. | 🟢 Permitted for $T_2$. |
| **RACE-3** | **$T_2$** | **Commits** (200 OK projection delivered). | **Blocks, unblocks on commit, throws `P0006`** (403 Forbidden). | 1 row committed for `jti`. | 🔴 Forbidden with same `jti`. |
| **RACE-4** | **$T_2$** | **Rolls back** (e.g. statement timeout). | **Blocks, unblocks on rollback, inserts `jti`, commits** (200 OK). | 1 row committed by $T_1$. | 🟢 Permitted for $T_1$. |
| **AMBIG-1**| Winner | **Commits**, but TCP connection drops before HTTP ACK. | N/A | 1 row committed for `jti`. | 🔴 Forbidden with same `jti`. Client must obtain fresh ticket. |
| **EXPIRE-1**| Winner | **Rolls back**, but client retries after $T_{\text{clock}} > \text{exp}$. | N/A | Zero rows in ledger. | 🔴 Forbidden due to expiry (`P0005`). |

### 8.3 Expired-Ticket Ledger Pruning Lifecycle `[D]`
- A periodic maintenance job prunes rows from `uadue_auth.consumed_tickets`:
  ```sql
  DELETE FROM uadue_auth.consumed_tickets
  WHERE expires_at < clock_timestamp() - INTERVAL '5 minutes';
  ```
- **Post-Expiry Guarantee:** Once a ticket's `exp` has passed, replaying that ticket is **rejected at Gate 1** of `bind_context` before `consumed_tickets` is queried. Pruning rows older than 5 minutes has zero impact on valid-ticket replay protection.

---

## 9. Verification of RLS & Privilege Remediation Scope

### 9.1 Existing Repository Grants (`uadue_app_user`) `[A]`
Inspected migrations [`20261007_uadue_phase2d8_canonical.sql:366-369`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase2d8_canonical.sql#L366-L369) and [`20261007_uadue_phase3_database_foundation.sql:304-307`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase3_database_foundation.sql#L304-L307):
- Grants `USAGE` on schema `public` to `uadue_app_user`.
- Grants `ALL PRIVILEGES ON ALL TABLES IN SCHEMA public` to `uadue_app_user`.
- Grants `ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public` to `uadue_app_user`.
- Grants `ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public` to `uadue_app_user`.

### 9.2 Required Privilege Revocation & Role Hardening `[D]`
To eliminate excessive privileges:
1. `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM uadue_app_user;`
2. `REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM uadue_app_user;`
3. Create `uadue_tenant_runtime` with `NOLOGIN, NOINHERIT` and strictly `USAGE` on schema `public`.
4. Grant `SELECT` to `uadue_tenant_runtime` exclusively on canonical assessment tables and projections under RLS.
5. Create `uadue_pool_authenticator` with `LOGIN` and strictly `GRANT uadue_tenant_runtime TO uadue_pool_authenticator;`.

### 9.3 Child-Table Access Remediation Inventory `[A]`, `[D]`

| Table Name | Source Migration Lines | Required RLS Action | Required Runtime Permission (`uadue_tenant_runtime`) |
| :--- | :--- | :---: | :--- |
| `canonical_logical_families` | lines 115–123 | `ENABLE + FORCE RLS` | 🔴 **`REVOKE ALL`** (Candidate denied entirely) |
| `canonical_relationship_evaluations` | lines 126–139 | `ENABLE + FORCE RLS` | 🔴 **`REVOKE ALL`** (Forensic evaluations denied) |
| `canonical_family_memberships` | lines 142–151 | `ENABLE + FORCE RLS` | 🔴 **`REVOKE ALL`** (Internal memberships denied) |
| `canonical_quarantined_relationships`| lines 154–164 | `ENABLE + FORCE RLS` | 🔴 **`REVOKE ALL`** (Quarantine records denied) |
| `canonical_package_supersessions` | lines 177–186 | `ENABLE + FORCE RLS` | 🟢 `SELECT` (Gated to `get_current_package_id()`) |
| `canonical_assets` | lines 204–212 | `ENABLE + FORCE RLS` | 🔴 **`REVOKE ALL`** (Direct SQL binary access denied; pre-signed URLs only) |

---

## 10. Authoritative Test Inventory & Acceptance Criteria (18 Scenarios)

The test inventory is formally reconciled into eighteen (18) unique scenarios. **All 18 scenarios are unexecuted (`[B]`):**

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

## 11. Governance & Frozen Contracts

The following frozen Phase 3 governance boundaries are strictly preserved:
1. **Phase 3.5 Scoring Freeze:** Zero modifications to evaluation DAGs, scoring formulas, or dispute tables.
2. **`AP-DEC-013`:** Assessment policies locked; no candidate runtime bypasses or autonomous LLM policy conversions permitted.
3. **`ACTIVE`-Only Live Question Access:** Strictly locked; sessions in any non-`ACTIVE` state are rejected.
4. **Zero Question-Viewing Grace:** Strict deadline enforcement; zero question grace.
5. **Submission Transport Grace:** 15-second grace window reserved strictly for answer ingestion events (`candidate_submission_events`), strictly prohibited for question retrieval.
6. **`EXAM:SOLUTION_AUDIT` Capability Contract:** Post-exam answers released only after administrative `packageResultReleased` state transition.
7. **Child-Table RLS Inventory:** All 6 child tables remain audited and targeted for RLS remediation.

---

## 12. Deliverable & Final Implementation Gate

### 12.1 Repository Evidence Examined
- [`web/src/services/uadue/delivery/deliveryPostgresAdapter.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/deliveryPostgresAdapter.ts) (Lines 62–125): Confirmed silent error swallowing in `SET LOCAL ROLE` and fallback to physical connection credentials.
- [`web/src/services/uadue/delivery/sessionOrchestrator.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/sessionOrchestrator.ts) (Lines 135–902): Confirmed all 9 session writer methods use `SELECT ... FOR UPDATE` and zero writers acquire advisory locks.
- [`supabase/migrations/20261007_uadue_phase2d8_canonical.sql`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase2d8_canonical.sql) (Lines 115–370): Confirmed 6 unprotected child tables and blanket `ALL PRIVILEGES` to `uadue_app_user`.
- [`supabase/migrations/20261007_uadue_phase3_database_foundation.sql`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase3_database_foundation.sql) (Lines 18–307): Confirmed session table schema and duplicate blanket role grants.

### 12.2 Confirmed Defects & Unverified Deployment Assumptions
- **Confirmed Defect 1:** `deliveryPostgresAdapter.ts` swallows `SET LOCAL ROLE` failures, executing transactions as the physical superuser.
- **Confirmed Defect 2:** In migrations, `uadue_app_user` holds blanket `ALL PRIVILEGES` across all tables, functions, and sequences.
- **Unverified Assumption 1 (`[F]`):** Live deployment connection credentials and Supabase database role hierarchy.
- **Unverified Assumption 2 (`[F]`):** Target deployment availability of `pg_sodium` extension.

### 12.3 Product Owner Decisions Still Required
1. **Approval of Proctor Preemption Policy (`DEP-GOV-TERM-01`):** Decide between Policy Alpha (Transactional Mutual Exclusion with 2s Bounded Delay) and Policy Beta (Hard Backend Preemption).
2. **Authorization of Database Role & RLS Migration Phase (`DEP-SEC-CHILD-01`, `DEP-SEC-GUC-01`):** Authorize stripping `uadue_app_user` of blanket privileges, creating `uadue_tenant_runtime`, and applying RLS to child tables.

### 12.4 Final Implementation Gate Verdict

| Evaluation Dimension | Current Assessment | Gate Verdict |
| :--- | :--- | :---: |
| **Fail-Closed Role Boundary** | Defect confirmed in `deliveryPostgresAdapter.ts`; fail-closed specification completed; unmigrated. | 🔴 **BLOCKED** |
| **Row-Locking Writer Compatibility**| Natively coordinates with existing `FOR UPDATE` writers; column `UPDATE` scoped; timeouts modeled. | 🟢 **PASS (Design)** |
| **Advisory-Lock Alternative** | Proved non-viable due to 32-bit hash collision risk and lack of writer participation. | ❌ **REJECTED** |
| **Child-Table RLS Completeness** | Six child tables audited; least-privilege inventory complete; migrations unapplied. | 🔴 **BLOCKED** |
| **Cryptographic Byte Verification**| Raw canonical byte pipeline and `kid` assertion formalized; test suite unexecuted. | 🔴 **UNCERTIFIED** |
| **Replay Matrix & Retention** | Dual-branch race model and 5-minute post-expiry pruning formalized. | 🟢 **PASS (Design)** |
| **Projection Contract Alignment** | Authoritative `EXAM:SOLUTION_AUDIT` preserved; live projection gated strictly to `ACTIVE`. | 🟢 **PASS** |

### **Overall Gate: 🔴 RED — Implementation and Candidate-Facing Integration Strictly Blocked**

**Summary for Gatekeeper:**  
Proposal v4.3 formally proves the critical role-boundary defect in `deliveryPostgresAdapter.ts` where failed role switches fall back to physical superuser execution, and defines strict fail-closed abort semantics. It establishes that row-locking natively coordinates with existing writers in `sessionOrchestrator.ts`, models the proctor termination delay tradeoff, and refutes the advisory-lock design due to 32-bit `hashtext` collisions and missing writer coordination. Because role migrations, RLS policies, and all 18 adversarial test scenarios remain unapplied and unexecuted, the overall gate remains strictly **🔴 RED**. Exactly zero application source files were modified, zero migrations were applied, and zero tests were executed.
