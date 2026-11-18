# UADUE Phase 3 — Architecture R3 Contradiction Register
**Document ID:** `UADUE-P3-CNT-R3-003`  
**Version:** `1.3.0-HARDENING-R3`  
**Status:** `DESIGN-ONLY / IMPLEMENTATION STRICTLY LOCKED`  
**Classification:** Contradiction Analysis & Reconciliation Log  

---

## 1. Executive Summary

This register formally logs, analyzes, and closes all contradictions identified during the Phase 3 R3 Final Hardening review. Each contradiction is evaluated across security, consistency, historical reproducibility, failure behavior, upstream dependencies, and implementation consequences.

---

## 2. Granular Contradiction Resolutions

### CR-R3-01: Untrusted Client Sequence Determining Scored State
- **CONTRADICTION ID:** `CR-R3-01`
- **OLD CONTRACT:** Selected the effective scored answer via `EffectiveAnswer(q, s) = argmax(clientSequenceNumber)` while acknowledging that `clientSequenceNumber` is untrusted.
- **NEW CONTRACT:** Replaced `argmax()` with a **Server-Authoritative Question State Machine** (`candidate_question_states`). The scored answer is strictly the state committed in PostgreSQL at terminal session close.
- **FORMAL INVARIANT:** `P3-I07-R3`: *An untrusted client-controlled ordering field MUST NEVER be the authoritative selector for scored state.*
- **SECURITY EFFECT:** Eliminates sequence manipulation attacks and Byzantine client race injections.
- **CONSISTENCY EFFECT:** Question state transitions form a strictly serialized, monotonic chain in PostgreSQL.
- **FAILURE BEHAVIOR:** Conflicting transition requests fail with HTTP 409 Conflict (`E_PAYLOAD_TAMPERED`).
- **HISTORICAL REPRODUCIBILITY EFFECT:** Preserves the complete, auditable sequence of state versions for every question.
- **UPSTREAM DEPENDENCIES:** Phase 2D-5 scoring evaluators consume `candidate_question_states`.
- **IMPLEMENTATION CONSEQUENCES:** Ingestion gateway updates `candidate_question_states` atomically within transaction.
- **Resolution Status:** 🟢 **CLOSED**

---

### CR-R3-02: Global Uniqueness on Client Sequence vs Multi-Context Operation
- **CONTRADICTION ID:** `CR-R3-02`
- **OLD CONTRACT:** Enforced `UNIQUE(exam_session_id, client_sequence_number)`, rejecting valid events from multiple tabs, network reconnections, or counter resets.
- **NEW CONTRACT:** Removed `UNIQUE(exam_session_id, client_sequence_number)`. Reclassified `clientSequenceNumber` as advisory telemetry metadata. Primary idempotency is anchored strictly on `UNIQUE(exam_session_id, client_event_id)`.
- **FORMAL INVARIANT:** `P3-I06-R3`: *Event deduplication is anchored exclusively on `(exam_session_id, client_event_id)`.*
- **SECURITY EFFECT:** Enforces single active lease authorization across browser tabs while preventing sequence-based denial of service.
- **CONSISTENCY EFFECT:** Eliminates database key collisions caused by client-side counter resets or multiple contexts.
- **FAILURE BEHAVIOR:** Submissions from stale leases fail with HTTP 401 (`E_LEASE_REVOKED`); duplicate event IDs return cached receipts (HTTP 200).
- **HISTORICAL REPRODUCIBILITY EFFECT:** Retains advisory client sequences in telemetry logs without corrupting ledger primary keys.
- **UPSTREAM DEPENDENCIES:** Phase 2D-8 session lease contracts.
- **IMPLEMENTATION CONSEQUENCES:** Removed database constraint on `client_sequence_number`; gateway enforces lease check on `currentLeaseId`.
- **Resolution Status:** 🟢 **CLOSED**

---

### CR-R3-03: WebCrypto Non-Extractable Key Wrapped via Local APIs
- **CONTRADICTION ID:** `CR-R3-03`
- **OLD CONTRACT:** Claimed the Device Journal Key (DJK) was simultaneously a "non-extractable WebCrypto key" and "wrapped locally via AES-KW", which violates the W3C WebCrypto API specification (`InvalidAccessError`).
- **NEW CONTRACT:** Adopted **Model A (Persistent Encrypted Key Envelope)**. Raw DJK is imported into WebCrypto as a non-extractable `CryptoKey` for live memory operations, while a copy is encrypted via DSWK (derived from candidate PIN) into a Persistent Encrypted Journal Key Envelope (PEJKE) stored in IndexedDB. On crash, candidate re-enters PIN to decrypt PEJKE and re-import a non-extractable key.
- **FORMAL INVARIANT:** `P3-I22-R3`: *At no point shall an unextractable WebCrypto `CryptoKey` be passed to export or wrap APIs. Offline persistence is achieved via a dedicated key envelope encrypted under a candidate-derived key.*
- **SECURITY EFFECT:** 100% compliant with W3C WebCrypto API security model. Protects offline data-at-rest against casual disk inspection and cache sniffing.
- **CONSISTENCY EFFECT:** Guarantees deterministic key recovery across browser crashes and restarts.
- **FAILURE BEHAVIOR:** Corrupted envelope or invalid PIN fails decryption locally, forcing candidate to re-authenticate online to obtain fresh key.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Cryptographically binds local journal entries to the active device lease.
- **UPSTREAM DEPENDENCIES:** Phase 2D-8 session lease tokens.
- **IMPLEMENTATION CONSEQUENCES:** Client player implements WebCrypto PBKDF2/AES-GCM envelope handling.
- **Resolution Status:** 🟢 **CLOSED**

---

### CR-R3-04: Claim of "Exactly-Once Network Semantics"
- **CONTRADICTION ID:** `CR-R3-04`
- **OLD CONTRACT:** Claimed "exactly-once transition semantics backed by ACID transactions" without distinguishing network delivery from transition effects.
- **NEW CONTRACT:** Formally calibrated terminology:
  - Network Request Delivery: **At-Least-Once**
  - State Transition Effect: **Exactly-Once for a unique `(examSessionId, transitionRequestId)`**
- **FORMAL INVARIANT:** `P3-I21-R3`: *For a given `examSessionId`, `transitionRequestId`, and payload fingerprint, at most one state transition effect may commit in the database.*
- **SECURITY EFFECT:** Prevents double-transitions, state manipulation, and confusing retry errors.
- **CONSISTENCY EFFECT:** Exactly-once transition execution effect backed by ACID transactions.
- **FAILURE BEHAVIOR:** Retried transitions return cached receipts (HTTP 200); conflicting payloads return HTTP 409 (`E_TRANSITION_TAMPERED`).
- **HISTORICAL REPRODUCIBILITY EFFECT:** Transition ledger provides an immutable audit trail of state changes.
- **UPSTREAM DEPENDENCIES:** PostgreSQL ACID transaction serialization.
- **IMPLEMENTATION CONSEQUENCES:** Ingestion gateway uses `exam_session_transitions` table for transaction deduplication.
- **Resolution Status:** 🟢 **CLOSED**

---

### CR-R3-05: Application-Level Monotonic Clock Claim across Distributed Nodes
- **CONTRADICTION ID:** `CR-R3-05`
- **OLD CONTRACT:** Referenced an ambiguous "monotonic server clock" as if a single monotonic clock existed across distributed servers.
- **NEW CONTRACT:** Deconstructed time into 4 domains: (1) UTC Wall-Clock Timestamp, (2) Monotonic Process Duration, (3) Database Sequence Ordering, and (4) **Authoritative Deadline Evaluation**. Deadline authorization is evaluated exclusively within the PostgreSQL transaction engine via `clock_timestamp()`.
- **FORMAL INVARIANT:** `P3-I13-R3`: *Distributed application nodes have zero independent authority over deadline evaluation. The PostgreSQL transaction clock is the sole trusted authority for examination deadline cutoffs.*
- **SECURITY EFFECT:** Eliminates multi-server clock skew exploits and NTP step vulnerabilities.
- **CONSISTENCY EFFECT:** Universal, single-clock deadline arbitration across all application pods.
- **FAILURE BEHAVIOR:** Submissions arriving after PostgreSQL transaction timestamp exceeds cutoff return HTTP 403 (`E_SUBMISSION_EXPIRED`).
- **UPSTREAM DEPENDENCIES:** PostgreSQL transaction engine.
- **IMPLEMENTATION CONSEQUENCES:** SQL submission insert evaluates `clock_timestamp() <= cutoff_time` atomically.
- **Resolution Status:** 🟢 **CLOSED**

---

### CR-R3-06: Premature Assertion of Multi-Decade Reproducibility
- **CONTRADICTION ID:** `CR-R3-06`
- **OLD CONTRACT:** Used uncalibrated language claiming that historical reproducibility was "guaranteed across decades" in production.
- **NEW CONTRACT:** Replaced with a **Bounded Evaluation Contract**:
  > *"The architecture records the immutable evaluation contract required for deterministic future reproduction. Runtime and container validation is an implementation-stage acceptance gate."*
  Formally distinguishes *Architecturally Reproducible* (design bounds all 11 dimensions) from *Empirically Reproduced* (runtime verification in certified containers).
- **FORMAL INVARIANT:** `P3-I10-R3`: *Evaluation determinism is bounded by the complete 11-tuple $\mathcal{T}_{\text{eval\_contract}}$. Historical reproduction across decades requires verified execution environments.*
- **SECURITY EFFECT:** Protects institutional credibility against claims of unproven perpetual compatibility.
- **CONSISTENCY EFFECT:** Pure, side-effect-free evaluation function.
- **FAILURE BEHAVIOR:** Missing or mismatched tuple versions abort evaluation with `E_EVALUATION_VERSION_UNPINNED`.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Preserves all environment version metadata required for certified container re-runs.
- **UPSTREAM DEPENDENCIES:** Phase 2D-5 answer resolution graphs and scoring engines.
- **IMPLEMENTATION CONSEQUENCES:** Evaluation engine asserts complete 11-tuple before executing scoring logic.
- **Resolution Status:** 🟢 **CLOSED**

---

### CR-R3-07: Cross-Contract Upstream Freeze Verification
- **CONTRADICTION ID:** `CR-R3-07`
- **OLD CONTRACT:** General assumption of upstream compliance.
- **NEW CONTRACT:** Verified that R3 hardening introduces **zero modifications** to upstream Phase 2 contracts (`packageIntegritySeal`, `canonicalQuestionId`, `logicalFamilyId`, `representationId`, answer authority, scoring logic, or Phase 2 persistence schemas).
- **FORMAL INVARIANT:** `P3-I01-R3`: *Phase 2A through Phase 2D-8 contracts remain strictly immutable. Phase 3 is exclusively an operational delivery consumer.*
- **SECURITY EFFECT:** Preserves upstream cryptographic seals and tamper-evidence.
- **CONSISTENCY EFFECT:** Total cross-phase architectural hermeticism.
- **FAILURE BEHAVIOR:** Any attempted upstream schema mutation halts execution immediately with 🔴 BLOCKED.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Upstream packages remain permanently authoritative.
- **UPSTREAM DEPENDENCIES:** Phase 2A through Phase 2D-8 certified contracts.
- **IMPLEMENTATION CONSEQUENCES:** Prohibits authoring code in `web/src/services/uadue/canonical/`.
- **Resolution Status:** 🟢 **CLOSED**

---

## 3. Summary of Contradiction Closures

| Contradiction ID | Title | Severity | Final Status |
| :--- | :--- | :---: | :---: |
| **CR-R3-01** | Untrusted Client Sequence Scored State Selection | 🔴 Critical | 🟢 CLOSED |
| **CR-R3-02** | Global Uniqueness on Advisory Client Sequence | 🔴 Critical | 🟢 CLOSED |
| **CR-R3-03** | WebCrypto Non-Extractable Key Lifecycle | 🔴 Critical | 🟢 CLOSED |
| **CR-R3-04** | Distributed Exactly-Once Terminology | 🟠 High | 🟢 CLOSED |
| **CR-R3-05** | Distributed Time Source & Deadline Authority | 🟠 High | 🟢 CLOSED |
| **CR-R3-06** | Historical Reproducibility Calibration | 🟡 Medium | 🟢 CLOSED |
| **CR-R3-07** | Cross-Contract Upstream Freeze Audit | 🔴 Critical | 🟢 CLOSED |

**Total Open Contradictions: 0**
