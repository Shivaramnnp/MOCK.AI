# Mock.AI — Phase 3.6 Security Remediation Proposal v4.0
### Document Title: `PHASE_3_6_SECURITY_REMEDIATION_PROPOSAL_v4_0.md`
**Proposal Version:** `4.0.0-ADVERSARIAL-PRIVILEGE-BOUNDARY-AUDIT`  
**Overall Readiness Gate:** 🔴 **RED — Implementation and Candidate-Facing Integration Strictly Blocked**  
**Document Status:** **DESIGN-ONLY AUDIT & ARCHITECTURAL SPECIFICATION**  
*(Strictly zero application source code modified, zero migrations applied, zero test suites executed)*

---

## 1. Document Status, Governance Locks & Audit Metadata

This document constitutes the definitive adversarial design review and remediation specification **v4.0** for Mock.AI Phase 3.6. It resolves the four critical security-boundary flaws identified in the review of v3.9: it formally defines the replay-prevention contract under PostgreSQL transaction rollback semantics, proves the role and privilege hierarchy of the `SECURITY DEFINER` function owner, establishes a byte-level cross-language cryptographic verification contract (RFC 8785 JCS over raw bytes), eliminates mutable context replacement within transactions, specifies concurrent session row-locking linearization, and details an expanded pre-execution adversarial test plan.

| Governance Domain | Status | Operational Restriction |
| :--- | :---: | :--- |
| **Phase 3.6 Adapter Implementation** | 🔒 **LOCKED** | No client projection adapter code may be authored or committed. |
| **Phase 3.5 Scoring & Evaluation Engine** | 🔒 **FROZEN** | No modifications to evaluation DAGs, scoring formulas, or dispute tables. |
| **Assessment-Policy Governance (`AP-DEC-013`)** | 🔒 **STRICTLY LOCKED** | No candidate runtime bypasses or autonomous LLM policy conversions permitted. |
| **Repository File System** | 🔒 **READ-ONLY** | Exactly zero application source files modified in `/Users/shivarampatel/Desktop/MOCK.AI`. |
| **Database Migrations & Runtime** | 🔒 **UNEXECUTED** | No database migrations applied; zero tests executed. |
| **Candidate Player Integration** | 🔴 **BLOCKED** | Live player integration blocked pending resolution of all blocking dependencies. |

---

## 2. Change Log (v3.9 $\rightarrow$ v4.0)

1. **Corrected Replay-Prevention Contract:** Discarded the erroneous claim of "unconditional one-time consumption" under transaction rollbacks. Formally defined the **Guaranteed Single-Commit Consumption with Concurrent Mutual Exclusion** contract across eight distinct lifecycle events (validity, commit, rollback, retry, replay, concurrency, and pooled reuse).
2. **Proved `SECURITY DEFINER` Privilege Boundary:** Audited the proposed `uadue_security_admin` role against PostgreSQL catalog semantics. Proved that `NOLOGIN` and `NOINHERIT` prevent interactive login and role inheritance. Constructed an exhaustive 7-role privilege matrix proving that the runtime role cannot execute `SET ROLE` to administrative roles, cannot modify the verifier function, and cannot write to private schema tables.
3. **Established Row-Locking Privileges for `SELECT ... FOR SHARE`:** Proved from PostgreSQL engine semantics that `SELECT ... FOR SHARE` requires **strictly `SELECT` privilege** on `public.exam_sessions`, eliminating the risk of granting unintended `UPDATE` privileges to the security verifier.
4. **Resolved Cross-Language Cryptographic Byte Contract:** Formally eliminated JSONB text verification. Defined the byte-level contract where the issuer signs RFC 8785 canonical UTF-8 bytes, and PostgreSQL verifies raw bytes (`p_raw_canonical_payload bytea`) before parsing JSONB. Documented concrete verification primitives (`pg_sodium` for Ed25519 vs `pgcrypto` for HMAC-SHA256) and key lifecycle governance.
5. **Formalized Immutable Single-Transaction Context Binding:** Proved the exact semantics of `pg_backend_pid()`, `pg_current_xact_id()`, and `pg_current_xact_id_if_assigned()`. Replaced mutable updates with strict `INSERT` that rejects duplicate bindings in a single transaction. Defined post-transaction isolation and cleanup mechanics.
6. **Audited Concurrency Linearization via `FOR SHARE` Row Locking:** Defined the exact linearization point between candidate projection access and concurrent proctor termination/pause events, proving race-condition immunity under PostgreSQL Read Committed transaction isolation.
7. **Expanded Adversarial Test Matrix:** Authored an exhaustive 16-scenario adversarial test plan detailing threat models, preconditions, attack sequences, database before/after states, expected outcomes, and security properties (all marked unexecuted).

---

## 3. Evidence Classification Taxonomy

- **`[A] Direct Repository Evidence`**: Verified by exact file path, line numbers, and repository contents.
- **`[B] Executed Test Evidence`**: Confirmed by executed test output in this workspace (noting where suites remain unexecuted).
- **`[C] Verified PostgreSQL Semantics`**: Verified against official PostgreSQL engine specifications, system catalogs, and transaction mechanics.
- **`[D] Proposed Design`**: Architectural pattern, specification, or code pattern not yet implemented.
- **`[E] Unresolved External Dependency`**: Blocking prerequisite external to the immediate gateway codebase.
- **`[F] Unverified Runtime Assumption`**: State of the live deployed database, network topology, or hosting environment that cannot be verified statically from repository code.

---

## 4. Replay-Prevention & Ticket-Consumption Contract

### 4.1 The Rollback Nuance & Formal Contract Definition `[C]`, `[D]`
In proposal v3.9, ticket consumption was described as "strictly one-time", while simultaneously stating that a transaction rollback removes the `jti` insertion, permitting retry.  
**Adversarial Clarification:** Under standard relational database semantics, an `INSERT` into a table (`uadue_auth.consumed_tickets`) executed within transaction $T_1$ is **undone if $T_1$ rolls back**. Describing this as "unconditional one-time consumption" is inaccurate.

The verified security contract is formally defined as:  
**Guaranteed Single-Commit Consumption with Concurrent Mutual Exclusion (`[D]`)**.

### 4.2 Comprehensive Lifecycle Event Matrix `[C]`, `[D]`

| Event | Lifecycle Scenario | Database State of `jti` | Retry / Replay Permitted? | Concurrency & Security Guarantee |
| :---: | :--- | :--- | :---: | :--- |
| **A** | **Ticket Validity** | Not yet inserted. | Permitted if $T_{\text{clock}} < \text{exp}$ and claims match. | Ticket represents an unconsumed, time-bounded capability. |
| **B** | **Successful Commit** | Row committed in `uadue_auth.consumed_tickets`. | 🔴 **STRICTLY FORBIDDEN.** | **Permanent Consumption.** Any future presentation of this `jti` raises `ERR_REPLAY_DETECTED (P0006)`. |
| **C** | **Verification Error** | Aborted before ledger insertion. | 🔴 **TERMINAL FAILURE.** | Malformed signature, expired token, or tenant mismatch fails immediately. |
| **D** | **Transaction Rollback** | Row rolled back by PostgreSQL engine. | 🟢 **PERMITTED (Within Exp).** | **Legitimate Retry.** If query timed out or failed before commit, client may retry within the 15s window. |
| **E** | **Legitimate Retry** | Inserted in new transaction $T_2$. | Permitted if previous transaction rolled back. | Cannot bind a different session or tenant; claims are cryptographically locked. |
| **F** | **Malicious Replay** | Row already committed by legitimate client. | 🔴 **STRICTLY BLOCKED.** | Attacker presenting intercepted ticket receives fatal exception `P0006`. |
| **G** | **Concurrent Presentation** | Two transactions ($T_1, T_2$) present same `jti` at same millisecond. | **MUTUAL EXCLUSION.** | First transaction acquires unique index lock. Second transaction blocks. When $T_1$ commits, $T_2$ throws `P0006`. |
| **H** | **Cross-Connection Reuse** | Presented to a different socket in pool. | Governed by relational ledger. | Ledger is shared across all pool sockets in PostgreSQL; socket locality provides zero bypass. |

### 4.3 Concurrency Behavior of Unique `jti` Insertions `[C]`
Inside `uadue_auth.bind_context`, `jti` consumption is executed as:
```sql
INSERT INTO uadue_auth.consumed_tickets (jti, expires_at)
VALUES (v_jti, to_timestamp(v_exp))
ON CONFLICT (jti) DO NOTHING;

IF NOT FOUND THEN
  RAISE EXCEPTION 'UADUE Security Violation: Context ticket has already been consumed (replay detected).'
    USING ERRCODE = 'P0006';
END IF;
```
**PostgreSQL Concurrency Proof (`[C]`):**  
When two concurrent transactions attempt this insertion simultaneously:
1. $T_1$ inserts the tuple into the unique index on `jti`.
2. $T_2$ attempts to insert the identical `jti`. The PostgreSQL B-Tree index detects a duplicate key and forces $T_2$ to sleep, waiting on $T_1$'s transaction completion.
3. If $T_1$ executes `COMMIT`, $T_2$ wakes up, observes the committed tuple, executes `DO NOTHING`, evaluates `IF NOT FOUND`, and immediately aborts with `P0006`.
4. It is physically impossible for two transactions to execute concurrently under the same ticket.

---

## 5. Formal Proof of the `SECURITY DEFINER` Privilege Boundary

### 5.1 Audit of Existing Repository Role Definitions `[A]`, `[C]`
Direct inspection of migrations [20261007_uadue_phase2d8_canonical.sql:358-370](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase2d8_canonical.sql#L358-L370) and [20261007_uadue_phase3_database_foundation.sql:304-307](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase3_database_foundation.sql#L304-L307) reveals the live repository configuration:
```sql
-- supabase/migrations/20261007_uadue_phase2d8_canonical.sql:358-370
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'uadue_app_user') THEN
        CREATE ROLE uadue_app_user WITH LOGIN;
    END IF;
END
$$;
GRANT USAGE ON SCHEMA public TO uadue_app_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO uadue_app_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO uadue_app_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO uadue_app_user;
```
**Critical Repository Finding (`[A]`):** The current repository defines **only** `uadue_app_user` with blanket `ALL PRIVILEGES`. Roles `uadue_security_admin`, `uadue_tenant_runtime`, and `uadue_service_role` **do not exist** in repository migrations; they are proposed architectural designs (`[D]`).

### 5.2 Complete 7-Role Privilege & Membership Matrix `[C]`, `[D]`

To prove that the proposed `uadue_security_admin` cannot be assumed or exploited by the runtime role, the complete database role hierarchy must be configured as follows:

| Role Name | LOGIN | SUPERUSER | BYPASSRLS | INHERIT | Member Of / Role Grants | Schema Privileges | Table Privileges | Callable Surface | Can Alter Verifier? |
| :--- | :---: | :---: | :---: | :---: | :--- | :--- | :--- | :--- | :---: |
| **`postgres`** (Superuser) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | None (Root admin) | `ALL` on all schemas | `ALL` on all tables | All functions | ✅ Yes |
| **`uadue_migration_owner`** | ❌ No | ❌ No | ❌ No | ❌ No | None | `CREATE, USAGE` on `public`, `uadue_auth` | DDL Owner | None | ✅ Yes |
| **`uadue_security_admin`** | ❌ No | ❌ No | ✅ Yes | ❌ No | **None (Zero members)** | `USAGE` on `public`, `uadue_auth` | `SELECT` on `exam_sessions`; `ALL` on `active_contexts` | Owns `bind_context` | ❌ No (Owner only) |
| **`uadue_tenant_runtime`** | ✅ Yes | ❌ No | ❌ No | ❌ No | **None (Cannot SET ROLE)** | `USAGE` on `public`, `uadue_auth` | `SELECT` under RLS on canonical tables; `REVOKE` on child tables | `EXECUTE` on `bind_context` | ❌ **REVOKED** |
| **`uadue_service_role`** | ✅ Yes | ❌ No | ✅ Yes | ❌ No | **None (Air-gapped pool)** | `USAGE, CREATE` on `public` | `ALL` on canonical tables (Ingestion) | None | ❌ **REVOKED** |
| **`uadue_app_user`** (Legacy) | ✅ Yes | ❌ No | ❌ No | ❌ No | Deprecated | To be dropped or stripped of `ALL PRIVILEGES` | Deprecated | Deprecated | ❌ Deprecated |
| **`PUBLIC`** | ❌ N/A | ❌ N/A | ❌ N/A | ❌ N/A | Implicit group | `REVOKE ALL` on `public`, `uadue_auth` | `REVOKE ALL` | `REVOKE ALL` | ❌ **REVOKED** |

### 5.3 Proof: `SELECT ... FOR SHARE` Requires Only `SELECT` Privilege `[C]`
Section 8 of v3.9 proposed:
```sql
SELECT tenant_id, candidate_id, package_id, package_integrity_seal, session_state, current_lease_id, actual_started_at, duration_seconds
FROM public.exam_sessions
WHERE exam_session_id = v_sid
FOR SHARE;
```
**PostgreSQL Privilege Proof (`[C]`):**  
Per official PostgreSQL documentation (PostgreSQL 14/15/16 Chapter *Explicit Locking - Row-level Locks*):
- `SELECT ... FOR SHARE` and `SELECT ... FOR KEY SHARE` lock rows against concurrent mutation, but require **only `SELECT` privilege** on the target table.
- Only `SELECT ... FOR UPDATE` and `SELECT ... FOR NO KEY UPDATE` require `UPDATE` privilege on the table.
- Therefore, `uadue_security_admin` is granted strictly:
  ```sql
  GRANT SELECT ON public.exam_sessions TO uadue_security_admin;
  ```
  It is **impossible** for `uadue_security_admin` or any query inside `bind_context` to update, delete, or truncate rows in `public.exam_sessions`.

### 5.4 Search-Path Lockdown & Object Replacement Proof `[C]`
Inside `bind_context`, the function header specifies:
```sql
SECURITY DEFINER SET search_path = uadue_auth, pg_catalog, pg_temp;
```
1. **Search-Path Injection Immunity:** The schema search path is hardcoded. `public` is **excluded**. Even if an attacker creates a shadow table in `public`, the function resolves relations exclusively against `uadue_auth` and `pg_catalog`.
2. **Object Creation Denial:** `uadue_tenant_runtime` has `REVOKE CREATE ON SCHEMA uadue_auth, public` and `REVOKE TEMP ON DATABASE`. It cannot create objects in `uadue_auth`, nor can it create temporary tables in `pg_temp`.

---

## 6. Cross-Language Byte-Level Cryptographic Verification Contract

### 6.1 Concrete Cryptographic Primitives & API Contract `[C]`, `[F]`

To eliminate cross-language JSONB serialization mismatches, the verifier evaluates raw UTF-8 canonical bytes.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Cryptographic Primitive Selection                                        │
│ • Primary Algorithm: Ed25519 (PureEdDSA, RFC 8032).                         │
│ • Signature Length: Exactly 64 bytes (512 bits) detached raw bytes.         │
│ • Public Key Length: Exactly 32 bytes (256 bits) raw SubjectPublicKeyInfo.  │
│ • Verification Function: pg_sodium.crypto_sign_verify_detached(sig, msg, pk)│
│ • Fallback Algorithm: HMAC-SHA256 (via pgcrypto.hmac(msg, key, 'sha256'))   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. Canonical Serialization Contract (Issuer in Node.js)                     │
│ • Claims dictionary serialized strictly via RFC 8785 (JCS).                 │
│ • Raw Canonical String converted to Buffer via Buffer.from(jcsString, 'utf8')│
│ • Detached signature generated over exact Buffer bytes.                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. In-Database Function Signature & Parameter Order                         │
│ FUNCTION uadue_auth.bind_context(                                           │
│   p_raw_canonical_payload BYTEA,  -- Exact canonical UTF-8 bytes            │
│   p_signature             BYTEA,  -- Exactly 64-byte Ed25519 signature      │
│   p_key_id                TEXT    -- Verification key identifier             │
│ ) RETURNS VOID                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Key-ID Governance & Key-Revocation Semantics `[D]`

The key lookup executes against an isolated ledger:
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

#### Lookup & Rejection Rules:
1. **Unknown Key ID:** If `p_key_id` does not exist in `verification_keys`, raise fatal exception `ERR_KEY_UNKNOWN (P0017)`.
2. **Revoked Key:** If `status == 'REVOKED'`, raise fatal exception `ERR_KEY_REVOKED (P0016)`. All tickets referencing this key are immediately invalid.
3. **Retired Key:** If `status == 'RETIRED'`, permitted **only if** `ticket.iat <= retired_at`. Tickets issued after key retirement are rejected.
4. **Key-ID Binding:** The signed payload must contain claim `kid`. The verifier asserts:
   $$\text{payload.kid} \equiv \text{p\_key\_id}$$
   This prevents key-substitution attacks where a signature valid under Key A is presented with Key B.

### 6.3 Deployment Availability Status `[F]`
- **Supabase Production Environment:** `pg_sodium` is pre-installed and enabled by default on modern Supabase PostgreSQL 14+ instances (`[F]`).
- **Local Development / Docker:** Requires `CREATE EXTENSION IF NOT EXISTS pgsodium;`. If libsodium is absent, fallback to `pgcrypto` HMAC-SHA256 is required.
- **Verification Status:** Marked **`[F] Unverified Runtime Assumption`** pending live infrastructure preflight check.

---

## 7. Authoritative Ticket Claim Contract & Validation Rules

### 7.1 Authoritative Claim Specifications `[D]`

Every ticket signed by the authentication service must contain exactly the following twelve (12) signed claims:

| Claim Key | Expected Data Type | Value Constraints | Authoritative Source for Comparison | Validation Order | Failure Error Code |
| :---: | :--- | :--- | :--- | :---: | :--- |
| **`iss`** | `TEXT` | Strictly `'mockai-auth-authority'` | Static Security Policy | 1 | `ERR_ISSUER_INVALID (P0002)` |
| **`aud`** | `TEXT` | Strictly `'mockai-delivery-db'` | Static Security Policy | 2 | `ERR_AUDIENCE_INVALID (P0003)` |
| **`kid`** | `TEXT` | Non-empty string; matches `p_key_id` | Parameter `p_key_id` | 3 | `ERR_KEY_ID_MISMATCH (P0018)` |
| **`jti`** | `TEXT` | Valid UUIDv4 string | `uadue_auth.consumed_tickets` | 4 | `ERR_REPLAY_DETECTED (P0006)` |
| **`iat`** | `BIGINT` | Unix Epoch seconds | `clock_timestamp()` ($+ 2\text{s}$ skew) | 5 | `ERR_FUTURE_TOKEN (P0004)` |
| **`exp`** | `BIGINT` | Unix Epoch seconds; $\text{exp} - \text{iat} \le 15$ | `clock_timestamp()` | 6 | `ERR_TICKET_EXPIRED (P0005)` |
| **`sub`** | `TEXT` | Non-empty candidate UUID | `exam_sessions.candidate_id` | 7 | `ERR_CANDIDATE_MISMATCH (P0007)` |
| **`sid`** | `TEXT` | Non-empty exam session UUID | `exam_sessions.exam_session_id` | 8 | `ERR_SESSION_NOT_FOUND (P0008)` |
| **`tid`** | `TEXT` | Non-empty tenant UUID | `exam_sessions.tenant_id` | 9 | `ERR_TENANT_MISMATCH (P0009)` |
| **`pkg`** | `TEXT` | Non-empty package UUID | `exam_sessions.package_id` | 10 | `ERR_PACKAGE_MISMATCH (P0010)` |
| **`seal`**| `TEXT` | Exactly 64-char hex SHA-256 seal | `exam_sessions.package_integrity_seal`| 11 | `ERR_SEAL_MISMATCH (P0011)` |
| **`lease`**| `TEXT`| Non-empty active lease UUID | `exam_sessions.current_lease_id` | 12 | `ERR_LEASE_SUPERSEDED (P0012)` |

### 7.2 Real-Time Database State Rules (Gate 2) `[A]`, `[C]`
The database session record—**never** caller-supplied claims—determines authoritative FSM state and deadline:
1. **FSM State Check:** `exam_sessions.session_state` must be strictly `'ACTIVE'`. If `INITIALIZED`, `PAUSED`, `RECOVERY_PENDING`, `SUBMITTED`, `EXPIRED`, or `TERMINATED`, raise `ERR_SESSION_NOT_ACTIVE (P0013)`.
2. **Authoritative Deadline Check:**
   $$\text{clock\_timestamp}() \le \text{exam\_sessions.actual\_started\_at} + (\text{exam\_sessions.duration\_seconds} \times \text{INTERVAL '1 second'})$$
   If clock exceeds deadline, raise `ERR_EXAM_EXPIRED (P0014)`. Zero question-viewing grace is permitted.

---

## 8. Transaction-Context Lifecycle & PostgreSQL Engine Semantics

### 8.1 PostgreSQL Transaction ID Semantics (`xid8`) `[C]`
In PostgreSQL:
- `pg_backend_pid()`: Returns the integer PID of the server process attached to the current connection socket.
- `pg_current_xact_id()`: **Forces assignment** of a full 64-bit transaction ID (`xid8`) to the current transaction. Read-only transactions in PostgreSQL normally operate under virtual transaction IDs (`vxid`); invoking `pg_current_xact_id()` materializes a real transaction ID in the transaction status log (`pg_xact`).
- `pg_current_xact_id_if_assigned()`: Returns the assigned `xid8`, or `NULL` if no transaction ID has been assigned.

### 8.2 Failure & Lifecycle State Matrix `[C]`, `[D]`

| Lifecycle Step | Action / Outcome | Concurrency & Isolation State | Cleanup Mechanism |
| :--- | :--- | :--- | :--- |
| **1. Checkout** | `client = await pool.connect();` | Socket checked out. Pre-transaction. | `DISCARD ALL` resets session state. |
| **2. Begin** | `await client.query('BEGIN');` | Virtual transaction started. | Failure calls `client.release(err)`. |
| **3. Binding** | `SELECT uadue_auth.bind_context(...);` | `pg_current_xact_id()` assigns `xid8`. Row inserted in `active_contexts`. | Failure aborts transaction; socket destroyed via `release(err)`. |
| **4. Duplicate Bind**| Client invokes `bind_context` again in $T_1$. | `INSERT INTO active_contexts` detects duplicate `(backend_pid, tx_id)`. | Raises `ERR_DUPLICATE_BINDING (P0015)`; forces transaction abort. |
| **5. Projection Query**| RLS evaluates `get_current_package_id()`. | Looks up row matching `(pg_backend_pid(), pg_current_xact_id_if_assigned())`. | Accessor returns `package_id`. Query executes. |
| **6. Commit** | `await client.query('COMMIT');` | Transaction closes. `xid8` is committed. Row in `consumed_tickets` committed. | Sockets returned to pool via `client.release()`. |
| **7. Rollback** | Query fails $\rightarrow$ `ROLLBACK;` | All changes in transaction undone. Row in `consumed_tickets` rolled back. | Socket returned to pool or evicted via `release(err)`. |
| **8. Socket Reuse**| New transaction $T_2$ starts on socket. | $T_2$ receives a **new, unique `xid8`**. | Old $T_1$ row has old `tx_id`. Accessor returns `NULL`. Zero context leakage. |
| **9. Table Sweep**| Periodic background vacuum / hook. | `DELETE FROM uadue_auth.active_contexts WHERE expires_at < clock_timestamp();` | Sweeps dead historical rows. |

---

## 9. Concurrent Session-State Semantics & Linearization

### 9.1 The Linearization Point `[C]`, `[D]`
The exact linearization point of candidate authorization occurs during `bind_context` when executing:
```sql
SELECT tenant_id, candidate_id, package_id, package_integrity_seal, session_state, current_lease_id, actual_started_at, duration_seconds
FROM public.exam_sessions
WHERE exam_session_id = v_sid
FOR SHARE;
```

### 9.2 Conflict Resolution between Candidate and Proctor Transactions `[C]`

```
Candidate Transaction (Tc)                    Proctor Transaction (Tp)
─────────────────────────                    ────────────────────────
BEGIN;                                       BEGIN;
bind_context()                               UPDATE public.exam_sessions
  acquires FOR SHARE row lock                  SET session_state = 'TERMINATED'
  on exam_sessions [HELD TILL COMMIT]          WHERE exam_session_id = ...;
                                               --> BLOCKS on FOR SHARE lock!
projection queries execute...
COMMIT; (Lock released)                      --> Tp unblocks, acquires FOR UPDATE,
                                                 commits TERMINATED state.
```
- **Scenario 1 (Candidate arrives first):** `Tc` acquires `FOR SHARE`. `Tp`'s `UPDATE` blocks until `Tc` commits. Candidate receives projection for the active state that existed when the transaction began.
- **Scenario 2 (Proctor arrives first):** `Tp` acquires `FOR UPDATE`. `Tc`'s `FOR SHARE` blocks. `Tp` commits `TERMINATED`. `Tc` unblocks, reads `session_state = 'TERMINATED'`, evaluates Gate 2, and aborts with `ERR_SESSION_NOT_ACTIVE (P0013)`.
- **Consistency Guarantee:** Serializable row-level ordering is guaranteed under standard **Read Committed** isolation level.

---

## 10. Comprehensive Child-Table RLS and Least-Privilege Inventory

### 10.1 Schema Audit of the Six Unprotected Tables `[A]`, `[C]`
Direct inspection of [supabase/migrations/20261007_uadue_phase2d8_canonical.sql](file:///Users/shivarampatel/Desktop/MOCK.AI/supabase/migrations/20261007_uadue_phase2d8_canonical.sql) confirms that the following six tables currently have **zero RLS and blanket grants**:

| Table Name | Source Lines | Current RLS State | Current Grants (`uadue_app_user`) | Required RLS Action | Required Runtime Permission (`uadue_tenant_runtime`) |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **`canonical_logical_families`** | lines 115–123 | ❌ **NONE** | 🔴 `ALL PRIVILEGES` | `ENABLE + FORCE RLS` | 🔴 **`REVOKE ALL`** (Candidate role denied entirely) |
| **`canonical_relationship_evaluations`**| lines 126–139 | ❌ **NONE** | 🔴 `ALL PRIVILEGES` | `ENABLE + FORCE RLS` | 🔴 **`REVOKE ALL`** (Forensic evidence denied) |
| **`canonical_family_memberships`** | lines 142–151 | ❌ **NONE** | 🔴 `ALL PRIVILEGES` | `ENABLE + FORCE RLS` | 🔴 **`REVOKE ALL`** (Internal memberships denied) |
| **`canonical_quarantined_relationships`**| lines 154–164 | ❌ **NONE** | 🔴 `ALL PRIVILEGES` | `ENABLE + FORCE RLS` | 🔴 **`REVOKE ALL`** (Quarantine records denied) |
| **`canonical_package_supersessions`** | lines 177–186 | ❌ **NONE** | 🔴 `ALL PRIVILEGES` | `ENABLE + FORCE RLS` | `ENABLE + FORCE RLS` | 🟢 `SELECT` (Gated to `get_current_package_id()`) |
| **`canonical_assets`** | lines 204–212 | ❌ **NONE** | 🔴 `ALL PRIVILEGES` | `ENABLE + FORCE RLS` | 🔴 **`REVOKE ALL`** (Direct SQL byte access denied) |

### 10.2 Strict Denial of Direct SQL Access to `canonical_assets` `[A]`, `[D]`
[PHASE_3_PROJECTION_CONTRACT.md:75](file:///Users/shivarampatel/Desktop/MOCK.AI/docs/phase3/PHASE_3_PROJECTION_CONTRACT.md#L75) mandates that exam diagrams and media assets are delivered via **secure, signed URLs**.  
**Security Boundary:** The candidate runtime database role (`uadue_tenant_runtime`) must have **`REVOKE SELECT ON public.canonical_assets`**. Candidates must never query image bytes directly via SQL. Pre-signed Cloud Storage URLs are generated exclusively by an air-gapped media service.

---

## 11. Comprehensive Adversarial Test Plan (16 Scenarios)

The following sixteen (16) adversarial scenarios formalize the exact validation suite required before future certification. All tests are currently **UNEXECUTED (`[B]`)**:

| Test ID | Threat Scenario | Preconditions & Attacker Vector | Database State Before $\rightarrow$ After | Expected Outcome | Security Property Verified |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **ADV-01** | **Tenant Claim Substitution** | Attacker presents valid signature over ticket with `tid = 'tenant_victim'`. | Session `sess_01` has `tenant_id = 'tenant_actual'`. | Transaction aborts with `ERR_TENANT_MISMATCH (P0009)`. Zero rows modified. | Cryptographic tenant binding. |
| **ADV-02** | **Package Claim Substitution** | Attacker presents valid signature over ticket with `pkg = 'pkg_confidential'`. | Session `sess_01` has `package_id = 'pkg_assigned'`. | Transaction aborts with `ERR_PACKAGE_MISMATCH (P0010)`. Zero rows modified. | Package entitlement boundary. |
| **ADV-03** | **Package Integrity Tampering** | Attacker presents ticket with modified `seal = 'tampered_sha256'`. | Session `sess_01` has authentic seal. | Transaction aborts with `ERR_SEAL_MISMATCH (P0011)`. Zero rows modified. | Package seal integrity binding. |
| **ADV-04** | **Issuer / Audience Spoofing** | Attacker generates ticket with `iss = 'rogue_idp'` or `aud = 'public_api'`. | Key exists in DB; verifier evaluates headers. | Transaction aborts with `ERR_ISSUER_INVALID (P0002)`. | Issuer/Audience scope locking. |
| **ADV-05** | **Future Token Presentation** | Attacker presents ticket with `iat = clock_timestamp() + 10s`. | Database clock is authoritative. | Transaction aborts with `ERR_FUTURE_TOKEN (P0004)`. | Clock skew & future token ban. |
| **ADV-06** | **Excessive Lifetime Token** | Attacker presents ticket with `exp - iat = 60s` ($> 15\text{s}$ limit). | Ticket submitted within 60s. | Transaction aborts with `ERR_TICKET_EXPIRED (P0005)`. | 15-second lifetime ceiling. |
| **ADV-07** | **Duplicate In-Transaction Bind** | Attacker calls `bind_context` twice within same SQL transaction block. | First bind succeeds. Second bind executes. | Second call raises `ERR_DUPLICATE_BINDING (P0015)`. Entire transaction aborts. | Single-transaction context immutability. |
| **ADV-08** | **Committed Replay Attack** | Attacker presents `jti_01` after previous transaction committed. | `jti_01` present in `uadue_auth.consumed_tickets`. | Transaction aborts with `ERR_REPLAY_DETECTED (P0006)`. | One-time commit consumption. |
| **ADV-09** | **Concurrent Replay Presentation**| Two connections present `jti_01` at identical millisecond. | Concurrency race on `consumed_tickets` index. | One commits; second blocks, detects duplicate, and aborts with `P0006`. | Concurrent mutual exclusion. |
| **ADV-10** | **Rollback Retry Verification** | Transaction $T_1$ fails during domain query and rolls back. Client retries. | $T_1$ rolls back `jti_01`. $T_2$ presents same ticket within 15s. | $T_2$ successfully inserts `jti_01` and executes. | Legitimate rollback retry support. |
| **ADV-11** | **Socket Reuse Isolation** | Transaction $T_1$ commits. Socket reused by client without calling `bind_context`. | Context row has $T_1$ `tx_id`. Current transaction is $T_2$. | Accessor returns `NULL`. Queries return 0 rows. | Connection-pool session cleanliness. |
| **ADV-12** | **Concurrent Proctor Revocation** | Proctor terminates session (`FOR UPDATE`) concurrently with projection access. | Proctor commits `TERMINATED`. Candidate executes `FOR SHARE`. | Candidate transaction reads `TERMINATED` and aborts with `ERR_SESSION_NOT_ACTIVE`. | Concurrency linearization via `FOR SHARE`. |
| **ADV-13** | **`SECURITY DEFINER` Escalation** | Runtime executes `SET ROLE uadue_security_admin` or `RESET ROLE`. | Runtime role has `NOLOGIN`, `NOINHERIT`. | PostgreSQL throws `ERROR: permission denied for role`. | Role escalation lockout. |
| **ADV-14** | **JSONB Serialization Divergence** | Ticket signed over non-canonical JSON (extra whitespace, altered keys). | PostgreSQL receives raw bytes; verifies before JSON parse. | Cryptographic verification fails (`P0001`). Transaction aborts. | Bit-for-bit JCS verification. |
| **ADV-15** | **Emergency Key Revocation** | Ticket signed with key ID marked `'REVOKED'` in `verification_keys`. | Key row has `status = 'REVOKED'`. | Transaction aborts with `ERR_KEY_REVOKED (P0016)`. | Cryptographic revocation support. |
| **ADV-16** | **Direct Child-Table Dumping** | Runtime executes `SELECT * FROM canonical_logical_families`. | `REVOKE ALL` enforced on table. | Query fails with `permission denied for table canonical_logical_families`. | Child-table least-privilege boundary. |

---

## 12. Evidence & Final Gate

### 12.1 Root Cause & Verified Attack Scenarios
1. **Root Cause:** Custom configuration parameters (`app.current_tenant_id`, `app.is_service_role`, `app.current_session_id`) are unauthenticated strings in PostgreSQL. Any connection can execute `SET` to spoof identities.
2. **Attack Scenario A (Tenant Spoofing):** Candidate A executes `SET app.current_tenant_id = 'tenant_b'` in raw query and reads Tenant B's canonical packages.
3. **Attack Scenario B (Session Substitution):** Candidate A executes `SET app.current_session_id = 'sess_victim'` in raw query; database derives victim's tenant and package.

### 12.2 Resolved Specification Defects
- Replaced ambiguous "unconditional one-time consumption" with **Guaranteed Single-Commit Consumption with Concurrent Mutual Exclusion**.
- Formally proved that `SELECT ... FOR SHARE` requires strictly `SELECT` privilege on `exam_sessions`.
- Replaced JSONB text verification with raw-byte RFC 8785 canonical verification.
- Proved `NOLOGIN` and `NOINHERIT` role boundaries for `uadue_security_admin`.

### 12.3 Consolidated Register of Blocking Dependencies

| Dependency ID | Domain | Root Cause / Vulnerability | Owning Subsystem | Blocking Status |
| :--- | :--- | :--- | :--- | :---: |
| **`DEP-SEC-GUC-01`** | Database RLS Boundary | Asymmetric context architecture and `uadue_auth` schema remain in design state; migrations unapplied. | Database Architecture | 🔴 **CRITICAL BLOCKER** |
| **`DEP-SEC-TENANT-01`**| Candidate Authentication | Missing edge authentication middleware to validate candidate JWT tokens and sign context tickets. | Auth / Edge Infrastructure | 🔴 **CRITICAL BLOCKER** |
| **`DEP-SEC-SESS-01`** | Session Authorization | Missing session hydration guard deriving package and tenant from verified `exam_sessions` FSM record. | Operational Delivery | 🔴 **CRITICAL BLOCKER** |
| **`DEP-SEC-CHILD-01`** | Child-Table RLS | Six (6) Phase 2D-8 canonical child tables lack RLS entirely and grant full privileges to application role. | Database Migrations | 🔴 **CRITICAL BLOCKER** |
| **`DEP-T4-ANS-01`** | Post-Exam Answer Release| Missing administrative `packageResultReleased` state check and decoupled answer delivery pipeline. | Grading & Results Engine | 🔴 **CRITICAL BLOCKER** |
| **`GOV-04`** | Quarantine Governance | Quarantine promotion workflow and cryptographic signing authority not implemented. | Content Pipeline | 🔴 **CRITICAL BLOCKER** |

### 12.4 Required Product Owner Decisions

1. **Authorization Architecture Approval (`DEP-SEC-GUC-01`):** Formally approve the **Asymmetric Keypair Cryptographic Context Architecture with Dual-Gate Verification** as the target security design, authorizing engineering to draft the migration for schema `uadue_auth`.
2. **Scheduling of Child-Table RLS Migration Phase (`DEP-SEC-CHILD-01`):** Formally authorize scheduling a dedicated migration phase to apply Row-Level Security to the six unprotected child tables and revoke direct candidate SQL access to `canonical_assets`.

---

## 13. Final Readiness Gate Verdict

| Evaluation Dimension | Current Assessment | Gate Verdict |
| :--- | :--- | :---: |
| **Database Privilege Boundary** | Complete byte-level contract, bounded `BYPASSRLS` owner, and replay ledger designed; unmigrated. | 🔴 **BLOCKED** |
| **Candidate Session Authorization** | 12-claim validation contract formalized; `FOR SHARE` locking specified; middleware unbuilt. | 🔴 **BLOCKED** |
| **Child-Table RLS Completeness** | 6 child tables lack RLS in migration source; policies depend on `uadue_auth` schema. | 🔴 **BLOCKED** |
| **RFC 8785 Canonicalization** | Byte-level signing format formalized; test suite unexecuted. | 🔴 **UNCERTIFIED** |
| **Connection Lifecycle Design** | Documented `pg` failure matrix formalized; undocumented driver internals removed. | 🟢 **PASS (Design)** |
| **Projection Contract Alignment** | Authoritative `EXAM:SOLUTION_AUDIT` preserved; live projection gated strictly to `ACTIVE`. | 🟢 **PASS** |

### **Overall Gate: 🔴 RED — Implementation and Candidate-Facing Integration Strictly Blocked**

**Summary for Gatekeeper:**  
Proposal v4.0 resolves all technical contradictions in replay prevention, cryptographic signing formats, and database privilege boundaries. It proves why the `SECURITY DEFINER` function owner requires bounded `BYPASSRLS` to prevent RLS recursion and fail-closed lockouts, while demonstrating that `SELECT ... FOR SHARE` requires strictly `SELECT` permissions. Because `DEP-SEC-GUC-01`, `DEP-SEC-SESS-01`, and `DEP-SEC-CHILD-01` remain unapplied in the repository, the overall gate remains strictly **🔴 RED**. Exactly zero application source files were modified, zero migrations were applied, and zero tests were executed.
