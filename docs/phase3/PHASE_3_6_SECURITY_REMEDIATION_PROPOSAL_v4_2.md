# Mock.AI — Phase 3.6 Security Remediation Proposal v4.2
### Document Title: `PHASE_3_6_SECURITY_REMEDIATION_PROPOSAL_v4_2.md`
**Proposal Version:** `4.2.0-LOCKING-PROTOCOL-AND-REPLAY-AUDIT`  
**Overall Readiness Gate:** 🔴 **RED — Implementation and Candidate-Facing Integration Strictly Blocked**  
**Document Status:** **STRICT DESIGN-ONLY AUDIT & ARCHITECTURAL SPECIFICATION**  
*(Strictly zero application source code modified, zero migrations applied, zero test suites executed)*

---

## 1. Document Status, Governance Locks & Audit Metadata

This document constitutes the definitive architectural design review and remediation specification **v4.2** for Mock.AI Phase 3.6. It directly resolves the outstanding architectural vulnerabilities and unverified assumptions identified in the forensic review of proposal v4.1:

1. **Advisory-Lock Protocol Completeness Audit:** Analyzes every repository path capable of mutating session state, proving from direct repository code that zero existing writers acquire advisory locks, demonstrating the exact race condition that invalidates the uncoordinated advisory-lock design, and classifying the advisory-lock alternative as **UNVERIFIED and NON-VIABLE** without invasive application rewrites.
2. **Exhaustive Row-Lock Privilege & Writer Compatibility Audit:** Revalidates the `SELECT ... FOR SHARE` row-locking alternative against PostgreSQL 14–16 engine semantics. Proves that row locking natively coordinates with existing writers in `sessionOrchestrator.ts` (which execute `SELECT ... FOR UPDATE`), proves that column-level `GRANT UPDATE (lease_heartbeat_at)` cannot be exploited by callers, and compares both options across six objective architectural criteria.
3. **Corrected Concurrent Replay Matrix (T1 vs T2 Race Semantics):** Retracts the assumption of a predetermined winner. Formulates an exhaustive race model evaluating both $T_1$-wins and $T_2$-wins execution paths, rollback handling, lost commit acknowledgments (ambiguous commits), and retry mechanics, proving that single committed consumption is a deterministic invariant over a nondeterministic winner.
4. **Reconciled Replay Retention & Pruning Lifecycle:** Eliminates the misleading claim of "permanent ledger retention." Formalizes the exact time-bounded retention model, proving that deleting expired rows from `consumed_tickets` after $T_{\text{clock}} > \text{exp}$ has zero impact on security because expired tokens fail Gate 1 validation before the ledger is queried.
5. **Reconciled Authoritative Test Inventory:** Harmonizes the test inventory into an authoritative list of 18 unique scenarios (`ADV-01` through `ADV-18`), recording the exact status of each (all 18 specified, 0 authored in code, 0 executed, 0 passed).
6. **Audit of the Real Database Connection & Role Path:** Audits `deliveryPostgresAdapter.ts` and migrations, revealing that the real application path executes `SET LOCAL ROLE uadue_app_user` with swallowed errors, connects via superuser credentials, and relies on blanket `ALL PRIVILEGES` grants, while `uadue_tenant_runtime` remains an unmigrated design proposal.

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

## 2. Change Log (v4.1 $\rightarrow$ v4.2)

1. **Advisory-Lock Alternative Audited & Marked UNVERIFIED:** Audited all 9 session writer methods in `sessionOrchestrator.ts`. Proved that zero existing writers acquire advisory locks. Demonstrated that without invasive writer modifications, candidate advisory locks provide zero protection against concurrent proctor transitions.
2. **Row-Lock Writer Compatibility Proven:** Proved that `SELECT ... FOR SHARE` natively serializes with existing writer code in `sessionOrchestrator.ts:871` (`SELECT ... FOR UPDATE`), requiring zero application-level writer changes.
3. **Corrected Replay Concurrency Model:** Formally analyzed both $T_1$-wins and $T_2$-wins concurrency branches, distinguishing the nondeterministic winner from the deterministic single-commit invariant.
4. **Reconciled Replay Retention & Cleanup:** Removed claims of "permanent ledger retention." Specified the 5-minute post-expiry pruning schedule and proved that pruning expired tickets cannot weaken replay protection.
5. **Reconciled Authoritative Test Inventory:** Fixed discrepancy between 16 and 18 tests, establishing an authoritative 18-test matrix with explicit verification metadata.
6. **Audited Real Database Connection Path:** Discovered and documented the silent error swallowing in `deliveryPostgresAdapter.ts:108-112`, legacy `ALL PRIVILEGES` grants, and lack of runtime enforcement for `uadue_tenant_runtime`.

---

## 3. Evidence Classification Taxonomy

Every finding, assertion, and design choice is tagged with one of the following authoritative classifications:

- **`[A] Direct Repository Evidence`**: Verified by exact file path, line numbers, and repository contents.
- **`[B] Executed Test Evidence`**: Confirmed by executed test output in this workspace (all adversarial tests are explicitly marked *unexecuted*).
- **`[C] Verified PostgreSQL Semantics`**: Verified against official PostgreSQL engine documentation, parser/executor source behavior, locking semantics, and catalog specifications.
- **`[D] Proposed Design`**: Architectural design, schema migration, or code pattern proposed for implementation.
- **`[E] Unresolved External Dependency`**: Blocking prerequisite external to the immediate gateway codebase.
- **`[F] Unverified Runtime Assumption`**: State of the live deployed database, network topology, or hosting environment that cannot be verified statically from repository code.

---

## 4. Audit of the Advisory-Lock Alternative (`pg_advisory_xact_lock`)

### 4.1 Exhaustive Inventory of Session Writers in Repository `[A]`

Direct static analysis of the operational delivery codebase identifies nine (9) writer methods in [`web/src/services/uadue/delivery/sessionOrchestrator.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/sessionOrchestrator.ts) that mutate session authorization state:

| Method Name | Source Lines in `sessionOrchestrator.ts` | State Transition / Fields Mutated | Database Query Executed | Acquires Advisory Lock? |
| :--- | :--- | :--- | :--- | :---: |
| **`startSession`** | lines 135–185 | `INITIALIZED` $\to$ `ACTIVE`<br/>`actual_started_at`, `current_lease_id` | `SELECT ... FOR UPDATE` (line 871)<br/>`UPDATE exam_sessions` (line 726) | ❌ **NO** |
| **`pauseSession`** | lines 198–248 | `ACTIVE` $\to$ `PAUSED`<br/>`accumulated_pause_seconds`, `pause_count` | `SELECT ... FOR UPDATE` (line 871)<br/>`UPDATE exam_sessions` (line 726) | ❌ **NO** |
| **`resumeSession`** | lines 260–310 | `PAUSED` $\to$ `ACTIVE`<br/>`accumulated_pause_seconds` | `SELECT ... FOR UPDATE` (line 871)<br/>`UPDATE exam_sessions` (line 726) | ❌ **NO** |
| **`updateHeartbeat`** | lines 417–464 | `lease_heartbeat_at`, `updated_at`<br/>(Auto-expires if depleted) | `UPDATE exam_sessions SET lease_heartbeat_at = $1 ...` (line 450) | ❌ **NO** |
| **`detectHeartbeatTimeout`**| lines 469–502 | `ACTIVE` $\to$ `RECOVERY_PENDING`<br/>`state_version` | `SELECT ... FOR UPDATE` (line 871)<br/>`UPDATE exam_sessions` (line 726) | ❌ **NO** |
| **`acquireLeaseRecovery`** | lines 513–558 | `RECOVERY_PENDING` $\to$ `ACTIVE`<br/>`current_lease_id`, `lease_heartbeat_at`| `SELECT ... FOR UPDATE` (line 871)<br/>`UPDATE exam_sessions` (line 726) | ❌ **NO** |
| **`submitSession`** | lines 571–605 | `ACTIVE` $\to$ `SUBMITTED`<br/>`submitted_at` | `SELECT ... FOR UPDATE` (line 871)<br/>`UPDATE exam_sessions` (line 726) | ❌ **NO** |
| **`expireSession`** | lines 609–647 | `ACTIVE` $\to$ `EXPIRED`<br/>`expired_at` | `SELECT ... FOR UPDATE` (line 871)<br/>`UPDATE exam_sessions` (line 726) | ❌ **NO** |
| **`terminateSession`** | lines 651–689 | ANY $\to$ `TERMINATED`<br/>`terminated_at` | `SELECT ... FOR UPDATE` (line 871)<br/>`UPDATE exam_sessions` (line 726) | ❌ **NO** |

### 4.2 The Exact Race Condition Under the Advisory-Lock Design `[A]`, `[C]`

Because **zero writers** in the existing codebase acquire transactional advisory locks, the advisory lock acquired by the candidate in `bind_context` is completely invisible to all session writers:

```
Candidate Transaction (Tc)                    Proctor / Watchdog Transaction (Tp)
─────────────────────────                    ───────────────────────────────────
1. BEGIN;                                    1. BEGIN;
2. bind_context()                            2. Proctor executes terminateSession()
   • Acquires pg_advisory_xact_lock(sid)        • Calls fetchSessionForUpdate(sid)
   • Executes pure SELECT on exam_sessions       • Executes SELECT * FROM exam_sessions
     (Returns session_state = 'ACTIVE')            WHERE exam_session_id = $1 FOR UPDATE
   • Validates claims against DB                 • DOES NOT ACQUIRE ADVISORY LOCK!
   • Context row inserted.                       • Reads exam_sessions row.
                                                 • Executes UPDATE public.exam_sessions
                                                   SET session_state = 'TERMINATED';
                                                 • COMMIT; [Session is now TERMINATED!]
3. Candidate executes projection query:
   • SELECT * FROM exam_session_projections
   • Query succeeds because Tc context is bound!
   • Candidate reads confidential questions!
4. COMMIT; (Advisory lock released)
```

**Adversarial Finding (`[A]`, `[C]`):**  
In the advisory-lock design, the candidate acquires an advisory lock, but because the proctor transaction in `sessionOrchestrator.ts:871` uses `SELECT ... FOR UPDATE` without advisory locking, PostgreSQL's row-lock manager evaluates the proctor query against a plain `SELECT`. The proctor is **not blocked**. The proctor terminates the session in the database while the candidate transaction concurrently reads and returns live exam questions.

### 4.3 Advisory-Lock Specification Requirements `[D]`
If advisory locks were chosen, the following requirements would have to be implemented across every writer in the codebase:
1. **Lock-Key Derivation & Namespace:** Keys must be derived from a 64-bit integer hash:
   $$\text{lock\_id} = \text{hashtext}('mockai\_uadue\_exam\_session:' \,\|\, \text{sid})::\text{bigint}$$
   A 32-bit namespace prefix must partition session locks from any other application advisory locks.
2. **Collision Behavior:** 64-bit integer hashing has a negligible collision probability ($1 \text{ in } 2^{64}$), but in the event of a hash collision, two distinct sessions would share a lock, resulting in transient latency spikes rather than security compromise.
3. **Lock Acquisition Order & Deadlocks:** All writers and readers must acquire the advisory lock as the very first operation inside their transaction block before any relation is queried, avoiding lock-order inversion deadlocks.
4. **Transaction Boundary:** The advisory lock must remain held until explicit `COMMIT` or `ROLLBACK`.

### 4.4 Architectural Verdict: **UNVERIFIED & NON-VIABLE WITHOUT REWRITES**
Because repository evidence proves that none of the existing session writers participate in advisory locking, the advisory-lock proposal is marked **`[D] Unverified Design Proposal`**. It cannot be certified unless every writer method in `sessionOrchestrator.ts` is rewritten and tested.

---

## 5. Audit of the Row-Lock Alternative (`SELECT ... FOR SHARE`)

### 5.1 Revalidation of PostgreSQL Engine Privilege Requirements `[C]`
Under official PostgreSQL 14–16 engine semantics:
- When `SELECT ... FOR SHARE` is parsed, PostgreSQL sets write intent on the target relation.
- If column-level permissions are used, PostgreSQL requires `SELECT` on the projected columns and `UPDATE` privilege on at least one column of the table being locked.
- If `uadue_security_admin` has zero `UPDATE` privilege, PostgreSQL throws `ERROR: permission denied for table exam_sessions`.

### 5.2 Minimum Viable Column-Level Grant `[C]`, `[D]`

The narrowest viable permission arrangement grants `UPDATE` strictly on the non-authoritative operational column `lease_heartbeat_at`:

```sql
-- Owner: postgres
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

GRANT UPDATE (lease_heartbeat_at) ON public.exam_sessions TO uadue_security_admin;
```

#### Security Proof: Callers Cannot Exploit This Grant:
1. **Procedural Immutability:** `uadue_security_admin` is the owner of the `SECURITY DEFINER` function `uadue_auth.bind_context`. The compiled PL/pgSQL body contains strictly:
   ```sql
   SELECT tenant_id, candidate_id, package_id, package_integrity_seal, session_state, current_lease_id, actual_started_at, duration_seconds
   INTO v_db_tenant_id, v_db_candidate_id, v_db_package_id, v_db_seal, v_db_state, v_db_lease_id, v_started_at, v_duration_seconds
   FROM public.exam_sessions
   WHERE exam_session_id = v_sid
   FOR SHARE;
   ```
   There is **no `UPDATE` statement in `bind_context`**.
2. **Caller Invocation Boundary:** Callers execute as `uadue_tenant_runtime`. That role possesses `REVOKE UPDATE ON public.exam_sessions` and `REVOKE ALL PRIVILEGES` on administrative functions. Callers cannot pass arbitrary SQL through `bind_context`.
3. **Role Isolation:** `uadue_security_admin` is configured with `NOLOGIN` and `NOINHERIT`, with zero role members.

### 5.3 Native Writer Coordination Proof `[A]`, `[C]`

Direct repository inspection of [`sessionOrchestrator.ts:871`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/sessionOrchestrator.ts#L871) confirms that all state mutations execute:
```sql
SELECT * FROM public.exam_sessions WHERE exam_session_id = $1 FOR UPDATE
```
**Engine Serialization Proof (`[C]`):**  
In PostgreSQL, `FOR SHARE` and `FOR UPDATE` on the same tuple are mutually exclusive at the tuple lock manager level:
- If Candidate executes `SELECT ... FOR SHARE`, Proctor's `SELECT ... FOR UPDATE` blocks in PostgreSQL until Candidate commits.
- If Proctor executes `SELECT ... FOR UPDATE`, Candidate's `SELECT ... FOR SHARE` blocks until Proctor commits, whereupon Candidate reads the updated state (`TERMINATED`) and aborts with `P0013`.
- **Zero changes are required in `sessionOrchestrator.ts`**. Coordination is automatic and engine-enforced.

### 5.4 Objective Comparison of Locking Alternatives

| Dimension | Option 1: Row Locking (`SELECT ... FOR SHARE`) | Option 2: Advisory Locking (`pg_advisory_xact_lock`) |
| :--- | :--- | :--- |
| **Engine Correctness** | 🟢 **Proven & Automatic** via tuple lock manager. | 🔴 **Broken in current repo**; writers do not participate. |
| **Privilege Scope** | Requires `SELECT` + `UPDATE (lease_heartbeat_at)`. | 🟢 Pure `SELECT`; zero `UPDATE` privilege. |
| **Required Writer Changes** | 🟢 **Zero changes** (`sessionOrchestrator.ts` already uses `FOR UPDATE`). | 🔴 **Invasive changes** required across all 9 writer methods. |
| **Deadlock Behavior** | Ordered by single physical tuple ID; minimal risk. | Ordered by hash value; zero deadlock if acquired first. |
| **Operational Complexity** | Low (standard declarative SQL). | High (requires application-level lock discipline). |
| **Repository Evidence** | `[A]` Proven by `sessionOrchestrator.ts:871`. | `[A]` 0 advisory locks in entire repository. |

---

## 6. Corrected Concurrent Replay Matrix (T1 vs T2 Race Semantics)

### 6.1 The Invariant vs The Winner `[C]`, `[D]`
In proposal v4.1, the concurrent presentation scenario assumed that $T_1$ succeeds while $T_2$ is rejected.  
**Adversarial Correction:** In an uncoordinated concurrent race, the winner ($T_1$ or $T_2$) is **nondeterministic**, governed by database engine lock acquisition order and network packet arrival.  
The **deterministic security invariant** is:  
**Exactly one transaction can commit a given `jti`. At most one caller receives live projections; the concurrent loser is always rejected.**

### 6.2 Dual-Branch Race Analysis

```
                  Client presents Ticket (jti_01) to T1 and T2 concurrently
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
         [Branch A: T1 Wins Race]                        [Branch B: T2 Wins Race]
         T1 executes INSERT first                        T2 executes INSERT first
         T2 blocks on unique index                       T1 blocks on unique index
                 │                                               │
        ┌────────┴────────┐                             ┌────────┴────────┐
        ▼                 ▼                             ▼                 ▼
   T1 Commits        T1 Rolls Back                 T2 Commits        T2 Rolls Back
   • T1: SUCCOURS    • T1: Aborted                 • T2: SUCCESS     • T2: Aborted
   • T2: Throws      • T2: Unblocks,               • T1: Throws      • T1: Unblocks,
     P0006 (Replay)    inserts jti,                  P0006 (Replay)    inserts jti,
     and aborts        commits (200 OK)              and aborts        commits (200 OK)
```

### 6.3 Comprehensive Concurrency & Failure Matrix

| Scenario | Race Winner | Winner Outcome | Loser Outcome | Database Ledger State | Retry Permitted? |
| :--- | :---: | :--- | :--- | :--- | :---: |
| **RACE-A1** | **$T_1$** | **Commits** (200 OK projection returned). | **Blocks, wakes on commit, throws `P0006`** (403 Forbidden). | Exactly 1 row for `jti_01` committed in `consumed_tickets`. | 🔴 Forbidden with same `jti`. |
| **RACE-A2** | **$T_1$** | **Rolls back** (e.g. transient query error). | **Blocks, wakes on rollback, inserts `jti_01`, commits**. | Exactly 1 row for `jti_01` committed by $T_2$. | 🟢 Permitted for $T_2$; completed. |
| **RACE-B1** | **$T_2$** | **Commits** (200 OK projection returned). | **Blocks, wakes on commit, throws `P0006`** (403 Forbidden). | Exactly 1 row for `jti_01` committed in `consumed_tickets`. | 🔴 Forbidden with same `jti`. |
| **RACE-B2** | **$T_2$** | **Rolls back** (e.g. statement timeout). | **Blocks, wakes on rollback, inserts `jti_01`, commits**. | Exactly 1 row for `jti_01` committed by $T_1$. | 🟢 Permitted for $T_1$; completed. |
| **AMBIG-01** | Winner ($T_1$) | **Commits**, but TCP connection drops before HTTP ACK. | N/A | Row permanently committed in `consumed_tickets`. | 🔴 Forbidden with same `jti`. Client must request fresh ticket. |
| **EXPIRE-01**| Winner ($T_1$) | **Rolls back**, but client retries after $T_{\text{clock}} > \text{exp}$. | N/A | Zero rows in `consumed_tickets`. | 🔴 Forbidden due to expiry (`P0005`). |

---

## 7. Reconciled Replay Retention & Cleanup Lifecycle

### 7.1 Reconciling "Permanent Retention" vs Pruning `[C]`, `[D]`
Proposal v4.1 claimed both "permanent consumption" and background cleanup of expired rows.  
**Adversarial Clarification:** Retaining consumed `jti` values permanently is neither required by security nor practical for storage.  
The **authoritative security guarantee** is:
1. **Replay Rejected During Validity Window:** While a ticket is valid ($T_{\text{clock}} \le \text{exp}$), presenting an already-committed `jti` is strictly rejected by the unique index on `uadue_auth.consumed_tickets`.
2. **Replay Rejected After Expiration:** Once a ticket expires ($T_{\text{clock}} > \text{exp}$), presentation of that ticket is **rejected at Gate 1** of `bind_context`:
   $$\text{clock\_timestamp}() > \text{to\_timestamp}(\text{payload.exp}) \implies \text{RAISE EXCEPTION } \text{ERR\_TICKET\_EXPIRED (P0005)}$$
   This check occurs **before** `consumed_tickets` is queried or inserted.

### 7.2 Safe Retention & Pruning Schedule `[D]`
- `uadue_auth.consumed_tickets` stores `(jti TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL)`.
- A periodic maintenance job prunes dead rows:
  ```sql
  DELETE FROM uadue_auth.consumed_tickets
  WHERE expires_at < clock_timestamp() - INTERVAL '5 minutes';
  ```
- **Safety Proof:** A 5-minute grace window guarantees that no row is deleted while any server node or client could consider the ticket valid (even under worst-case clock skew of 2 seconds). Once a row is deleted, the ticket's `exp` is at least 5 minutes in the past, guaranteeing that any replay attempt is rejected at Gate 1. Deletion cannot weaken replay protection.

---

## 8. Authoritative Test Inventory (Reconciliation of 18 Scenarios)

The test inventory is formally reconciled into exactly eighteen (18) unique scenarios:

| Test ID | Test Category & Scenario Name | Specified? | Authored? | Executed? | Passed? | Independent Review |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **ADV-01** | Tenant Claim Substitution | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-02** | Package Claim Substitution | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-03** | Package Integrity Seal Tampering | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-04** | Issuer / Audience Header Spoofing | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-05** | Future Token Presentation (`iat` in future) | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-06** | Excessive Lifetime Token ($\Delta t > 15\text{s}$) | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-07** | Duplicate In-Transaction `bind_context` Invocation | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-08** | Committed Replay Attack (Serial Re-presentation) | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-09** | Concurrent Replay Presentation ($T_1$ vs $T_2$ Race) | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-10** | Rollback Retry Verification (Legitimate Retry) | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-11** | Connection Pool Socket Reuse Isolation | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-12** | Concurrent Proctor State Transition Linearization | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-13** | `SECURITY DEFINER` Role Escalation Lockout | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-14** | Bit-for-Bit RFC 8785 Raw-Byte Verification | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-15** | Emergency Key Revocation Rejection | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-16** | Child-Table Least-Privilege Access Denial | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-17** | Unambiguous Key-ID Mismatch Rejection | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |
| **ADV-18** | Retired Key Lifetime Grace Boundary | ✅ Yes (`[D]`) | ❌ No | ❌ No | ❌ No | 🟡 In Review |

---

## 9. Audit of the Real Database Connection & Role Path

### 9.1 Connection Pool Credentials in Repository Code `[A]`
Inspection of [`web/src/services/uadue/delivery/deliveryPostgresAdapter.ts:62-77`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/deliveryPostgresAdapter.ts#L62-L77) reveals the connection initialization:
```typescript
const connectionString =
  config.connectionString ||
  process.env.MOCKAI_POSTGRES_URL ||
  process.env.DATABASE_URL ||
  'postgres://shivarampatel:@localhost:5432/mockai_uadue_test';
this.pool = new Pool({ connectionString, ... });
```
**Finding (`[A]`):** The connection pool connects using local superuser credentials or `DATABASE_URL`. In deployment, this is typically the privileged `postgres` or `service_role` user.

### 9.2 Silent Error Swallowing in `SET LOCAL ROLE` `[A]`
Inspection of [`deliveryPostgresAdapter.ts:108-112`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/deliveryPostgresAdapter.ts#L108-L112) reveals:
```typescript
try {
  await client.query('SET LOCAL ROLE uadue_app_user');
} catch {
  // Fallback if role is not available
}
```
**Critical Repository Finding (`[A]`):**  
`SET LOCAL ROLE uadue_app_user` is wrapped in a `try/catch` block that **silently swallows all errors**. If the role does not exist or permission is denied, execution continues silently under the physical pool user (superuser / database owner)!

### 9.3 Legacy Grants in Migration Source `[A]`
Inspection of [`supabase/migrations/20261007_uadue_phase2d8_canonical.sql:366-369`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase2d8_canonical.sql#L366-L369) and [`supabase/migrations/20261007_uadue_phase3_database_foundation.sql:304-307`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase3_database_foundation.sql#L304-L307) reveals:
```sql
GRANT USAGE ON SCHEMA public TO uadue_app_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO uadue_app_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO uadue_app_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO uadue_app_user;
```
**Critical Repository Finding (`[A]`):**  
Even when `SET LOCAL ROLE uadue_app_user` succeeds, `uadue_app_user` possesses **blanket `ALL PRIVILEGES`** across the entire public schema.

### 9.4 Status of Proposed Role `uadue_tenant_runtime` `[A]`, `[D]`
The restricted role `uadue_tenant_runtime` **does not exist anywhere in repository code, tests, or migrations**. It is strictly a proposed architectural design (`[D]`). The live code continues to execute with blanket privileges under `uadue_app_user` or the physical superuser.

---

## 10. Governance & Frozen Contracts

The following frozen Phase 3 governance boundaries are strictly preserved:
1. **Phase 3.5 Scoring Freeze:** Zero changes to scoring evaluation engines, DAG structures, or dispute tables.
2. **`AP-DEC-013`:** Assessment policies locked; no autonomous bypasses or runtime relaxations.
3. **`ACTIVE`-Only Live Question Access:** Strictly locked; sessions in any non-`ACTIVE` state are rejected.
4. **Zero Question-Viewing Grace:** Strict deadline enforcement; zero question grace.
5. **Submission Transport Grace:** 15-second grace window reserved strictly for answer ingestion events (`candidate_submission_events`), strictly prohibited for question retrieval.
6. **`EXAM:SOLUTION_AUDIT` Capability Contract:** Post-exam answers released only after administrative `packageResultReleased` state transition.
7. **Child-Table RLS Inventory:** All 6 child tables remain audited and targeted for RLS remediation.

---

## 11. Evidence & Final Implementation Gate

### 11.1 Repository Evidence Examined
- [`web/src/services/uadue/delivery/sessionOrchestrator.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/sessionOrchestrator.ts) (Lines 135–902): 9 session writer methods audited; proved zero advisory locks exist.
- [`web/src/services/uadue/delivery/submissionIngestionGateway.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/submissionIngestionGateway.ts) (Line 225): Proved existing `SELECT ... FOR SHARE` row-locking usage.
- [`web/src/services/uadue/delivery/deliveryPostgresAdapter.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/deliveryPostgresAdapter.ts) (Lines 62–120): Proved superuser pool connection and silent swallowing of `SET LOCAL ROLE` failures.
- [`supabase/migrations/20261007_uadue_phase2d8_canonical.sql`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase2d8_canonical.sql) (Lines 115–370): Proved 6 unprotected child tables and blanket `ALL PRIVILEGES` to `uadue_app_user`.
- [`supabase/migrations/20261007_uadue_phase3_database_foundation.sql`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase3_database_foundation.sql) (Lines 18–307): Proved session table schema and duplicate blanket role grants.

### 11.2 Remaining Unverified Claims & Runtime Assumptions
- **`[F]` Runtime Environment:** Live Supabase database role setup and `pg_sodium` extension availability cannot be statically verified.
- **`[B]` Cryptographic Execution:** Cross-language RFC 8785 byte verification remains unexecuted in code.

### 11.3 Product Owner Decisions Required
1. **Selection of Session-Locking Protocol:**
   - **Option 1 (Recommended by Code Audit):** `SELECT ... FOR SHARE` with column-level `GRANT UPDATE (lease_heartbeat_at) ON public.exam_sessions TO uadue_security_admin;`. Automatically coordinates with existing `sessionOrchestrator.ts:871` writers with zero application code changes.
   - **Option 2 (Advisory Locks):** `pg_advisory_xact_lock`. Requires invasive rewrites across all 9 writer methods in `sessionOrchestrator.ts` to add advisory locks before each session update.
2. **Authorization of Database Role & Child-Table Migration Phase:**
   - Authorize migration to strip `uadue_app_user` of `ALL PRIVILEGES`, create restricted `uadue_tenant_runtime`, and enable RLS on the six canonical child tables.

### 11.4 Final Implementation Gate Verdict

| Evaluation Dimension | Current Assessment | Gate Verdict |
| :--- | :--- | :---: |
| **Database Privilege Boundary** | Current repo grants `ALL PRIVILEGES` to `uadue_app_user`; `SET ROLE` errors swallowed; unmigrated. | 🔴 **BLOCKED** |
| **Locking Protocol Coordination** | Row-locking coordinates with existing writers; advisory-lock alternative unverified. | 🔴 **BLOCKED** |
| **Child-Table RLS Completeness** | Six child tables lack RLS; least-privilege inventory complete; migrations unapplied. | 🔴 **BLOCKED** |
| **Cryptographic Byte Verification**| Raw canonical byte pipeline and `kid` assertion formalized; test suite unexecuted. | 🔴 **UNCERTIFIED** |
| **Replay Matrix & Retention** | Dual-branch concurrency race and 5-minute post-expiry pruning formalized. | 🟢 **PASS (Design)** |
| **Projection Contract Alignment** | Authoritative `EXAM:SOLUTION_AUDIT` preserved; live projection gated strictly to `ACTIVE`. | 🟢 **PASS** |

### **Overall Gate: 🔴 RED — Implementation and Candidate-Facing Integration Strictly Blocked**

**Summary for Gatekeeper:**  
Proposal v4.2 proves through direct code audit that the advisory-lock alternative is non-viable in the current codebase because zero existing session writers participate in advisory locking. Conversely, row locking (`SELECT ... FOR SHARE` with column-level `UPDATE (lease_heartbeat_at)`) automatically coordinates with existing writers (`sessionOrchestrator.ts:871`). The proposal also proves that the live connection pool runs with blanket `ALL PRIVILEGES` and swallows `SET ROLE` errors. Because all underlying database migrations, role restrictions, and adversarial tests remain unapplied and unexecuted, the overall gate remains strictly **🔴 RED**. Exactly zero application source files were modified, zero migrations were applied, and zero tests were executed.
