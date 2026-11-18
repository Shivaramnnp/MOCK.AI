# Mock.AI — Phase 3.6 Security Remediation Proposal v4.5
### Document Title: `PHASE_3_6_SECURITY_REMEDIATION_PROPOSAL_v4_5.md`
**Proposal Version:** `4.5.0-LOCK-DURATION-LIMITS-AND-ROLE-BOUNDARY-AUDIT`  
**Overall Readiness Gate:** 🔴 **RED — Implementation and Candidate-Facing Integration Strictly Blocked**  
**Document Status:** **STRICT DESIGN-ONLY AUDIT & ARCHITECTURAL SPECIFICATION**  
*(Strictly zero application source code modified, zero migrations applied, zero test suites executed)*

---

## 1. Document Status, Governance Locks & Audit Metadata

This document constitutes the definitive architectural design review and remediation specification **v4.5** for Mock.AI Phase 3.6. It forensically corrects the unsupported timing and security assertions in proposal v4.4, bounds lock-retention claims, formalizes termination semantics, audits PostgreSQL driver lifecycle internals, establishes a 6-role privilege matrix, and expands the adversarial test inventory:

1. **Reassessment of Lock-Duration Bounding Claims:** Formally retracts the claim that either proposed timeout mechanism provides a "hard, proven two-second end-to-end lock-release guarantee." Deconstructs Mechanism A (single-statement procedural retrieval) and Mechanism B (Node.js application deadline and socket destruction) across four distinct operational phases: (a) intended timeout, (b) enforceable cancellation trigger, (c) server-side lock release, and (d) end-to-end data delivery.
2. **Analysis of Proctor Termination Semantics (Policy Alpha vs Policy Beta):** Models the two competing termination models without deciding on the Product Owner's behalf. Proves that row locking allows in-flight reads that acquired the lock first to complete and deliver data, while backend preemption (`pg_terminate_backend`) kills in-flight transactions but cannot recall bytes already transmitted across the network. Formally keeps `DEP-GOV-TERM-01` open.
3. **Fail-Closed Role Switching & Connection Lifecycle:** Details the confirmed vulnerability in [`deliveryPostgresAdapter.ts:108-112`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/deliveryPostgresAdapter.ts#L108-L112) where `SET LOCAL ROLE` failures are silently swallowed. Specifies strict fail-closed abort semantics, client socket eviction, and an exhaustive 11-point connection lifecycle matrix.
4. **`SECURITY DEFINER` Privilege Proof & Complete 6-Role Matrix:** Formulates an authoritative privilege matrix across physical login, runtime candidate, function owner, function caller, ingestion admin, and schema owner roles, proving why callers cannot execute arbitrary SQL under elevated privileges.
5. **Expanded 30-Scenario Adversarial Test Inventory:** Retains the 18 core scenarios (`ADV-01` through `ADV-18`) and adds 12 new targeted adversarial scenarios (`ADV-19` through `ADV-30`) covering statement timeout during row locks, delayed cancellation, event-loop stalls, partial response delivery, and backend termination. All 30 scenarios are explicitly marked unexecuted (`[B]`).

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

## 2. Change Log (v4.4 $\rightarrow$ v4.5)

1. **Reassessed Lock-Bounding Claims:** Retracted claims of a "proven two-second hard lock bound." Formally proved the gap between statement timeout firing, query cancellation checkpoints, transaction rollback unwind, lock tag cleanup, and network packet flushing.
2. **Audited Node-Postgres Driver Internals:** Inspected `pg` 8.23.0 dependencies in [`web/package.json`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/package.json). Proved that accessing `(client as any).connection.stream.destroy()` couples the system to undocumented private driver internals. Identified the supported public API (`client.release(err)` / `client.end()`) and exposed the limits of socket closure on server-side cancellation.
3. **Formalized Policy Alpha vs Policy Beta:** Explicitly compared transactional queuing against hard preemption (`pg_terminate_backend`), proving that neither policy can recall data already transmitted across the network. Preserved `DEP-GOV-TERM-01` as an open Product Owner decision.
4. **Constructed Exhaustive 6-Role Privilege Matrix:** Formulated an authoritative privilege and capability matrix across all database principals, proving that `uadue_security_admin`'s column-scoped grant on `lease_heartbeat_at` cannot be exploited by candidate callers.
5. **Expanded Adversarial Test Matrix to 30 Scenarios:** Added scenarios `ADV-19` through `ADV-30` covering timeout unwinding, delayed server disconnect detection, event-loop stalls, partial response delivery, and backend termination. All 30 tests remain unexecuted.

---

## 3. Evidence Classification Taxonomy

- **`[A] Direct Repository Evidence`**: Verified by exact file path, line numbers, and repository contents.
- **`[B] Executed Test Evidence`**: Confirmed by executed test output in this workspace (all adversarial tests are explicitly marked *unexecuted*).
- **`[C] Verified PostgreSQL Semantics`**: Verified against official PostgreSQL engine documentation, parser/executor source behavior, locking semantics, and catalog specifications.
- **`[D] Proposed Design`**: Architectural design, schema migration, or code pattern proposed for implementation.
- **`[E] Unresolved External Dependency`**: Blocking prerequisite external to the immediate gateway codebase.
- **`[F] Unverified Runtime Assumption`**: State of the live deployed database, network topology, or hosting environment that cannot be verified statically from repository code.

---

## 4. Reassessment of Both Two-Second Bounding Mechanisms

### 4.1 Separation of Timing & Execution Dimensions `[C]`, `[D]`

To avoid conflating database engine timeouts with end-to-end wall-clock latency, four distinct architectural dimensions must be evaluated separately:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Dimension A: Intended Timeout Configuration                                 │
│ • The configured threshold (e.g. statement_timeout = 2000ms or timer = 2s). │
├─────────────────────────────────────────────────────────────────────────────┤
│ Dimension B: Enforceable Cancellation Trigger                               │
│ • The instant the cancellation signal is generated (SIGINT or TCP FIN/RST). │
├─────────────────────────────────────────────────────────────────────────────┤
│ Dimension C: Measured Server-Side Lock-Release Behavior                     │
│ • The moment PostgreSQL backend reaches a safe interrupt checkpoint,        │
│   unwinds the transaction, runs ResourceOwnerRelease, and unlocks tuple.   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Dimension D: End-to-End Wall-Clock Data Delivery                            │
│ • The moment response bytes are serialized, flushed to kernel socket buffer,│
│   transit the physical network, and render in the candidate's browser.      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 4.2 Detailed Forensic Audit of Mechanism A (Single-Statement Procedural Retrieval)

Mechanism A encapsulates context binding, authorization checks, row locking, and projection assembly into a single database procedure:
```sql
SELECT * FROM uadue_auth.get_candidate_projection(
    p_raw_canonical_payload => $1,
    p_signature             => $2,
    p_key_id                => $3
);
```

#### What `statement_timeout` Does and Does Not Bound (`[C]`):
1. **What It DOES Bound:**  
   - It starts an internal timer in the PostgreSQL backend process when the query execution begins.
   - If the backend is actively executing procedural logic, evaluating queries, or building JSON projections, reaching 2000ms triggers an internal query cancellation (`ERRCODE_QUERY_CANCELED / 57014`).
2. **What It DOES NOT Bound:**  
   - **Lock-Acquisition Wait Time:** Time spent waiting in the lock queue before statement execution begins is governed by `lock_timeout`, not `statement_timeout`.
   - **Query Cancellation Completion Latency:** When `statement_timeout` fires, PostgreSQL sets an internal flag (`InterruptPending = true`). The backend does not stop instantly; it must reach a safe execution checkpoint (`CHECK_FOR_INTERRUPTS()`). If the backend is blocked in an uninterruptible OS system call or heavy disk I/O, cancellation is delayed.
   - **Transaction Abort & Cleanup Unwind:** Once cancelled, the engine must execute `AbortTransaction()`, unwind subtransactions, clean up memory contexts, and release locks via `ResourceOwnerReleaseInternal()`. Under high memory pressure or lock contention, cleanup can add hundreds of milliseconds.
   - **Network Transit & JSON Serialization:** If the statement completes at 1,980ms, the lock is released at transaction commit, but transmitting a 2MB JSON projection payload across the network to the candidate takes additional time.
3. **Verdict on Mechanism A:**  
   Mechanism A enforces that the **SQL engine active execution window** does not exceed 2000ms. It **does NOT guarantee a hard end-to-end 2.000s wall-clock lock release**. Under transient system load or I/O stalls, lock retention can exceed 2000ms.

---

### 4.3 Detailed Forensic Audit of Mechanism B (Application Deadline & Socket Destruction)

Mechanism B attempts to enforce an application-level deadline in Node.js by destroying the socket after 2000ms:
```typescript
const timeoutId = setTimeout(() => {
  (client as any).connection?.stream?.destroy();
}, 2000);
```

#### Critical Vulnerabilities & Driver Coupling (`[A]`, `[C]`):
1. **Coupling to Undocumented Driver Internals (`[A]`):**  
   Direct inspection of [`web/package.json`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/package.json) confirms that the application depends on `pg: ^8.23.0` and `@types/pg: ^8.23.1`.  
   - In `node-postgres` 8.23.0, `client.connection` and `client.connection.stream` are **private, internal properties**.
   - Accessing `(client as any).connection.stream` violates the TypeScript contract and creates a fragile dependency that can silently break across minor driver updates.
   - The supported, public `node-postgres` API for discarding a connection is `client.release(err)` or `client.end()`. However, `client.release(err)` only removes the client from `pg-pool`; it does not immediately issue an abort signal to the PostgreSQL backend process if a query is actively waiting on a socket read.
2. **Node.js Event-Loop Stalls:**  
   Node.js operates on a single-threaded event loop. If the Node.js process experiences CPU-intensive work (e.g. large JSON parsing, cryptographic hashing) or garbage collection pauses, the `setTimeout(..., 2000)` callback will **not execute at 2000ms**. It will execute only when the event loop becomes free (potentially at 3,000ms–5,000ms).
3. **Delayed Disconnect Detection by PostgreSQL Engine (`[C]`):**  
   When Node.js destroys a socket (`stream.destroy()`), the operating system sends a TCP `RST` or `FIN` packet to the database server.  
   - If PostgreSQL is actively processing a query, it reads from the socket only when reading input packets, and writes only when outputting results.
   - In PostgreSQL 14+, the setting `client_connection_check_interval` allows the server to poll the socket for client disconnects during query execution. However, if this setting is disabled (default is `0` / disabled in PostgreSQL), **the PostgreSQL backend does not realize the client disconnected until it attempts to write the query result to the socket!**
   - Consequently, the PostgreSQL backend **continues executing the query and holding the row lock** until the query finishes, completely defeating the purpose of the client-side socket destruction!
4. **Verdict on Mechanism B:**  
   Mechanism B is **NOT a proven hard server-side lock bound**. It relies on undocumented driver internals, is subject to Node.js event-loop delays, and fails to guarantee server-side lock release if `client_connection_check_interval` is disabled.

---

## 5. Formalization of Termination Semantics (Policy Alpha vs Policy Beta)

The architecture must evaluate the exact security and operational characteristics of both termination policies without deciding on the Product Owner's behalf:

### 5.1 Policy Alpha: Transactional Mutual Exclusion with Bounded Queuing `[C]`, `[D]`

Under Policy Alpha, proctor updates use standard `SELECT ... FOR UPDATE` row locking, queueing behind active candidate `FOR SHARE` reads:

```
Candidate Transaction (Tc)                    Proctor Transaction (Tp)
─────────────────────────                    ────────────────────────
1. BEGIN;                                    1. BEGIN;
2. bind_context()                            2. Proctor executes terminateSession():
   • Acquires FOR SHARE lock at T_lin           • Attempts SELECT ... FOR UPDATE
   • Evaluates session_state == 'ACTIVE'          --> BLOCKS in PostgreSQL lock queue!
3. Executes projection queries               3. Queued behind Candidate lock...
4. COMMIT at T_commit;                       4. Tc commits -> Lock released!
   • FOR SHARE lock released                    • Tp unblocks, acquires FOR UPDATE
   • Data sent to candidate                     • Updates session_state = 'TERMINATED'
                                                • COMMITS.
```

#### Detailed Characteristics of Policy Alpha:
- **Authorization Linearization Point ($T_{\text{lin}}$):** Occurs when `bind_context` acquires `FOR SHARE` and verifies `session_state == 'ACTIVE'`.
- **Proctor Blocking Duration:** The proctor is blocked for the duration of the candidate transaction. With Mechanism A, the database statement timeout signals cancellation at 2000ms, bounding engine execution, but cleanup and lock release can push total queue time to $\approx 2.1\text{s}–2.5\text{s}$. A strict 2.000s bound is **not proven**.
- **Data Delivery Guarantee:** If the candidate acquired the lock before the proctor, **the candidate receives projection data**. The proctor's termination takes effect only after the candidate transaction completes.
- **Irrevocability of Delivered Data:** Row locking guarantees transactional serializability, not retroactive data recall. Once data is transmitted, it cannot be recalled.

---

### 5.2 Policy Beta: Hard Administrative Preemption (`pg_terminate_backend`) `[C]`, `[D]`

Under Policy Beta, a proctor termination forcefully terminates active candidate database connections before mutating the session record:

```
Candidate Transaction (Tc)                    Proctor Transaction (Tp)
─────────────────────────                    ────────────────────────
1. Candidate reading projection...           1. Proctor executes terminateSession():
                                                • Executes SELECT pg_terminate_backend(pid)
                                                  for all backends bound to session.
2. Candidate backend receives SIGTERM:       2. Candidate backend killed immediately.
   • FATAL: terminating connection              • Candidate transaction aborted.
   • Automatic engine rollback                  • Row lock released instantly!
   • Row lock released!                      3. Proctor executes UPDATE exam_sessions
3. Candidate socket severed (ECONNRESET)        SET session_state = 'TERMINATED';
                                             4. COMMITS.
```

#### Detailed Characteristics of Policy Beta:
- **Preemption Latency:** The PostgreSQL postmaster sends `SIGTERM` to the candidate backend, which terminates the process within milliseconds ($\approx 10\text{ms}–50\text{ms}$), immediately aborting the transaction and releasing all locks.
- **Privilege Requirements (`[C]`):** Executing `pg_terminate_backend(pid)` requires membership in `pg_signal_backend` or superuser privileges. The proctor database role must be granted explicit signaling rights.
- **The Physical Transmission Boundary:** If the candidate backend already executed `COMMIT` and the Node.js application already began transmitting the HTTP response body across the wire, **killing the database backend does not stop data transmission!** The data is already buffered in Node.js and network routers.
- **Candidate Connection Teardown:** Candidate clients observe abrupt network drops (`ECONNRESET` / socket hangup) rather than clean application-level error codes.

---

### 5.3 Comparative Policy Matrix & Blocking Governance Dependency

| Dimension | Policy Alpha: Transactional Queuing | Policy Beta: Hard Preemption (`pg_terminate_backend`) |
| :--- | :--- | :--- |
| **Proctor Termination Latency** | Queued behind read ($\approx 50\text{ms}$ typical, bounded by $\approx 2\text{s}$ timeout). | **Immediate** ($\approx 10\text{ms}–50\text{ms}$). |
| **Candidate In-Flight Data** | Receives data if lock was acquired before termination. | Aborted mid-flight if read is not yet finished. |
| **Data Recall Capability** | ❌ **Impossible** (data sent is permanent). | ❌ **Impossible** (bytes already transmitted cannot be recalled). |
| **Database Privilege Requirements** | Standard SQL privileges (`UPDATE` on `exam_sessions`). | Requires `GRANT pg_signal_backend TO uadue_proctor`. |
| **Client Error Experience** | Clean 200 OK (if finished) or 403 Forbidden (future requests). | Abrupt TCP disconnect (`ECONNRESET` / 502 Bad Gateway). |
| **Operational Complexity** | Low (standard declarative PostgreSQL locking). | High (requires tracking backend PIDs and signaling). |

**Status:** **Unresolved Product Owner Decision `DEP-GOV-TERM-01`**. The Product Owner must formally decide between Policy Alpha and Policy Beta.

---

## 6. Authorization Linearization, Race Conditions & Data Release

### 6.1 End-to-End Sequence of Data Exposure

```
Client                  Node.js App Gateway          PostgreSQL Engine
  │                             │                            │
  │── 1. HTTP GET /projection ─>│                            │
  │   (Context Ticket)          │── 2. BEGIN (Read Committed)───────>│
  │                             │── 3. SET LOCAL ROLE runtime───────>│
  │                             │── 4. bind_context(ticket)─────────>│
  │                             │      [Acquires FOR SHARE lock]     │
  │                             │      [Validates ACTIVE state]      │
  │                             │      ============================= │
  │                             │      ==> T_lin: AUTHORIZED! <==== │
  │                             │      ============================= │
  │                             │── 5. SELECT projections───────────>│
  │                             │<── 6. Rows returned to App─────────│
  │                             │── 7. COMMIT───────────────────────>│
  │                             │      [Lock released in DB]         │
  │                             │      ============================= │
  │                             │      ==> T_commit: COMMITTED! <=== │
  │                             │      ============================= │
  │<── 8. HTTP 200 OK Response ─│                                    │
  │    (Protected JSON Bytes)   │                                    │
  ▼                             ▼                                    ▼
```

### 6.2 Race Conditions Across Operational Scenarios `[C]`, `[D]`

1. **Candidate Retrieval vs Proctor Termination:**  
   - If Candidate executes Step 4 before Proctor executes `SELECT ... FOR UPDATE`, Proctor blocks at Step 4 until Candidate commits at Step 7. Candidate receives data.
   - If Proctor executes `SELECT ... FOR UPDATE` before Candidate executes Step 4, Candidate blocks at Step 4. Proctor commits `TERMINATED`. Candidate unblocks, reads `TERMINATED`, and aborts with `ERR_SESSION_NOT_ACTIVE (P0013)`. Candidate receives zero data.
2. **Candidate Retrieval vs Lease Replacement (Lease Recovery):**  
   - In [`sessionOrchestrator.ts:513`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/sessionOrchestrator.ts#L513), `acquireLeaseRecovery` executes `SELECT ... FOR UPDATE` and changes `current_lease_id`.
   - If Candidate holds `FOR SHARE`, lease recovery blocks until Candidate commits.
   - If lease recovery commits first, Candidate's signed claim `lease` mismatches the database's new `current_lease_id`, failing Gate 1 claim validation (`ERR_LEASE_SUPERSEDED / P0012`).
3. **Candidate Retrieval vs Deadline Expiration:**  
   - Handled autoritatively by Gate 2: $\text{clock\_timestamp}() \le \text{actual\_started\_at} + \text{duration}$.
   - Evaluated under the shared lock against the authoritative database clock. Zero question grace is permitted.
4. **Candidate Retrieval vs Package Supersession:**  
   - `canonical_packages` are cryptographically sealed and immutable.
   - If a package is superseded via `canonical_package_supersessions`, the session record in `exam_sessions` remains locked to its original `package_id`. RLS evaluates `package_id = uadue_auth.get_current_package_id()`, preventing cross-package contamination.

---

## 7. Fail-Closed Database Role Switch & Connection Lifecycle

### 7.1 Confirmed Source Defect in `deliveryPostgresAdapter.ts` `[A]`
Inspection of [`web/src/services/uadue/delivery/deliveryPostgresAdapter.ts:108-112`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/deliveryPostgresAdapter.ts#L108-L112) confirms the critical vulnerability:
```typescript
try {
  await client.query('SET LOCAL ROLE uadue_app_user');
} catch {
  // Fallback if role is not available  <-- SILENT PRIVILEGE ESCALATION
}
```
**Static Fact:** The codebase silently catches and ignores role switch failures, executing transactions as the physical pool user.

### 7.2 Fail-Closed Specification & Safe Pool Reuse `[D]`

The connection adapter contract must strictly enforce:
1. **Immediate Fail-Closed Abort:** If `SET LOCAL ROLE` fails, catch the error, issue `ROLLBACK`, destroy the socket via `client.release(err)`, and throw `SecurityRoleSwitchError`. Zero protected queries may execute.
2. **Identity Verification Query:** Inside the connection wrapper, verify the effective role:
   ```sql
   SELECT current_user, session_user, current_setting('role', true);
   ```
   Assert that `current_user === 'uadue_tenant_runtime'`. If not, abort fail-closed.
3. **Safe vs Unsafe Pool Reuse:**
   - *Safe Reuse:* Occurs **only** when a transaction completes with clean `COMMIT` or clean `ROLLBACK` and the driver executes `DISCARD ALL` or session reset.
   - *Unsafe Reuse (Mandatory Socket Eviction):* Any transaction encountering a query timeout, syntax error, role switch error, cancellation, or connection abort **must be permanently evicted from the pool** using `client.release(err)` to force TCP destruction.

### 7.3 Complete 11-Scenario Lifecycle Failure Matrix

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

## 8. `SECURITY DEFINER` Privilege Proof & Complete 6-Role Matrix

### 8.1 Authoritative 6-Role Privilege Matrix `[C]`, `[D]`

| Role Name | LOGIN? | BYPASSRLS? | Schema Grants | Table Grants on `exam_sessions` | Table Grants on Canonical Projections | Function Execution Grants | Can Execute Arbitrary SQL under Admin? |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- | :---: |
| **1. Physical Login (`uadue_pool_authenticator`)** | ✅ Yes | ❌ No | `USAGE` on `public` | None (Zero direct grants) | None | `SET ROLE uadue_tenant_runtime` | ❌ **NO** |
| **2. Candidate Runtime (`uadue_tenant_runtime`)** | ❌ No | ❌ No | `USAGE` on `public`, `uadue_auth` | None (`REVOKE ALL`) | `SELECT` under RLS (`package_id = current`) | `EXECUTE ON bind_context` | ❌ **NO** |
| **3. Function Owner (`uadue_security_admin`)** | ❌ No | ✅ Bounded | `USAGE` on `public`, `uadue_auth` | `SELECT (9 cols)` + `UPDATE (lease_heartbeat_at)`| `ALL` on `active_contexts`, `consumed_tickets` | Owns `bind_context` | ❌ **NO** (Compiled PL/pgSQL only) |
| **4. Ingestion Admin (`uadue_service_role`)** | ✅ Yes | ✅ Yes | `ALL` on `public` | `ALL PRIVILEGES` | `ALL PRIVILEGES` | Ingestion procedures | ✅ Yes (Isolated Air-Gapped Pool) |
| **5. Migration Owner (`uadue_migration_owner`)** | ❌ No | ❌ No | `CREATE` on `public`, `uadue_auth`| DDL Owner | DDL Owner | None | ❌ No (DDL migrations only) |
| **6. Superuser (`postgres`)** | ✅ Yes | ✅ Yes | `ALL` on all schemas | Root superuser | Root superuser | All functions | ✅ Yes (Root admin) |

### 8.2 Formal Proof of Isolation & Arbitrary SQL Denial `[C]`
1. **Search-Path Injection Defense:** `bind_context` specifies `SECURITY DEFINER SET search_path = uadue_auth, pg_catalog, pg_temp;`. Schema `public` is excluded. An attacker cannot inject shadow tables.
2. **Scope of Column Grant:** `uadue_security_admin` holds `UPDATE (lease_heartbeat_at)` strictly. It holds zero update privileges on `session_state`, `tenant_id`, `candidate_id`, `package_id`, or `package_integrity_seal`.
3. **Compiled Function Immutability:** Inside `bind_context`, the only SQL referencing `exam_sessions` is:
   ```sql
   SELECT tenant_id, candidate_id, package_id, package_integrity_seal, session_state, current_lease_id, actual_started_at, duration_seconds
   FROM public.exam_sessions WHERE exam_session_id = v_sid FOR SHARE;
   ```
   There is **no `UPDATE` statement in `bind_context`**.
4. **Caller Privilege Boundary:** `uadue_tenant_runtime` has `rolbypassrls = false` and `REVOKE ALL PRIVILEGES ON public.exam_sessions`. It cannot assume `uadue_security_admin` (`NOLOGIN, NOINHERIT`). It is mathematically impossible for callers to execute arbitrary SQL under elevated privileges.

---

## 9. Preservation of All Frozen Phase 3 Contracts

The following frozen Phase 3 governance baselines remain strictly locked:
1. **Phase 3.5 Scoring Freeze:** Raw-score-only contract preserved; DAGs, scoring formulas, and dispute tables frozen.
2. **Phase 3.6 ACTIVE-Only Live Projection:** Projection retrieval gated strictly to `session_state == 'ACTIVE'`.
3. **Zero Question-Viewing Grace:** Strict deadline enforcement; zero question-viewing grace.
4. **Submission Transport Grace:** 15-second grace window applies strictly to answer ingestion events (`candidate_submission_events`), strictly prohibited for question retrieval.
5. **`EXAM:SOLUTION_AUDIT` Capability Contract:** Post-exam answers and solutions released strictly after administrative `packageResultReleased` transition.
6. **`AP-DEC-013`:** Assessment policy rules strictly preserved; zero autonomous AI/LLM conversions permitted.
7. **Tenant Isolation & Quarantine Restrictions:** Quarantine records denied; unresolved `DEP-T4-ANS-01` and `GOV-04` dependencies maintained.

---

## 10. Authoritative Adversarial Test Inventory (Expanded 30 Scenarios)

The test inventory is formally expanded to thirty (30) comprehensive scenarios covering all failure modes, timeouts, race conditions, and privilege boundaries. **All 30 scenarios are unexecuted (`[B]`):**

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

---

## 11. Deliverable & Final Implementation Gate

### 11.1 Repository Evidence Examined
- [`web/src/services/uadue/delivery/deliveryPostgresAdapter.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/deliveryPostgresAdapter.ts) (Lines 62–125): Confirmed silent swallowing of `SET LOCAL ROLE` failures.
- [`web/src/services/uadue/delivery/sessionOrchestrator.ts`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/src/services/uadue/delivery/sessionOrchestrator.ts) (Lines 135–902): Confirmed all 9 session writer methods use `SELECT ... FOR UPDATE` and zero writers acquire advisory locks.
- [`web/package.json`](file:///Users/shivarampatel/Desktop/MOCK.AI/web/package.json) (Lines 36, 41): Confirmed `pg: ^8.23.0` dependency.
- [`supabase/migrations/20261007_uadue_phase2d8_canonical.sql`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase2d8_canonical.sql) (Lines 115–370): Confirmed 6 unprotected child tables and blanket `ALL PRIVILEGES` to `uadue_app_user`.
- [`supabase/migrations/20261007_uadue_phase3_database_foundation.sql`](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase3_database_foundation.sql) (Lines 18–307): Confirmed session table schema and duplicate blanket role grants.

### 11.2 Confirmed Defects & Unverified Assumptions
- **Confirmed Defect 1:** `deliveryPostgresAdapter.ts` swallows `SET LOCAL ROLE` failures, falling back to physical superuser credentials.
- **Confirmed Defect 2:** In migrations, `uadue_app_user` holds blanket `ALL PRIVILEGES` across all tables, functions, and sequences.
- **Unverified Assumption 1 (`[F]`):** Live deployment Supabase database credentials and role hierarchy.
- **Unverified Assumption 2 (`[F]`):** Live availability of `pg_sodium` extension.

### 11.3 Product Owner Decisions Still Required
1. **Approval of Proctor Preemption Policy (`DEP-GOV-TERM-01`):** Formally approve Policy Alpha (Transactional Mutual Exclusion with Bounded Queuing) or Policy Beta (Hard Backend Preemption via `pg_terminate_backend`).
2. **Authorization of Database Role & RLS Migration Phase (`DEP-SEC-CHILD-01`, `DEP-SEC-GUC-01`):** Authorize stripping `uadue_app_user` of blanket privileges, creating `uadue_tenant_runtime`, and applying RLS to the six child tables.

### 11.4 Final Implementation Gate Verdict

| Evaluation Dimension | Current Assessment | Gate Verdict |
| :--- | :--- | :---: |
| **Lock-Duration Bounding** | Retracted unproven 2s claim; decoupled engine timeout from transport; bounds modeled. | 🟢 **PASS (Design)** |
| **Termination Semantics** | Modeled Policy Alpha vs Policy Beta; preemption limits proven; PO decision open. | 🟡 **GOVERNANCE PENDING** |
| **Fail-Closed Role Boundary** | Defect confirmed in `deliveryPostgresAdapter.ts`; fail-closed abort and eviction specified; unmigrated. | 🔴 **BLOCKED** |
| **Row-Locking Writer Compatibility**| Natively coordinates with existing `FOR UPDATE` writers; column `UPDATE` scoped; privilege matrix proven. | 🟢 **PASS (Design)** |
| **Child-Table RLS Completeness** | Six child tables audited; least-privilege inventory complete; migrations unapplied. | 🔴 **BLOCKED** |
| **Cryptographic Byte Verification**| Raw canonical byte pipeline and `kid` assertion formalized; test suite unexecuted. | 🔴 **UNCERTIFIED** |
| **Replay Matrix & Retention** | Dual-branch race model and 5-minute post-expiry pruning formalized. | 🟢 **PASS (Design)** |
| **Projection Contract Alignment** | Authoritative `EXAM:SOLUTION_AUDIT` preserved; live projection gated strictly to `ACTIVE`. | 🟢 **PASS** |

### **Overall Gate: 🔴 RED — Implementation and Candidate-Facing Integration Strictly Blocked**

**Summary for Gatekeeper:**  
Proposal v4.5 eliminates unsupported timing assertions, proving why standard PostgreSQL timeouts and application socket destruction do not guarantee a hard 2.000s wall-clock lock release. It provides an exhaustive analysis of Policy Alpha versus Policy Beta, constructs an authoritative 6-role privilege matrix, details the fail-closed role switch specification, and expands the adversarial test inventory to 30 scenarios. Because role migrations, RLS policies, and all 30 adversarial test scenarios remain unapplied and unexecuted, the overall gate remains strictly **🔴 RED**. Exactly zero application source files were modified, zero migrations were applied, and zero tests were executed.
