# UADUE Phase 3 — Architecture R3 Decision Register
**Document ID:** `UADUE-P3-DEC-R3-002`  
**Version:** `1.3.0-HARDENING-R3`  
**Status:** `DESIGN-ONLY / IMPLEMENTATION STRICTLY LOCKED`  
**Classification:** Architecture Decision Records & Governance Log  

---

## 1. Executive Summary

This register contains the formal Architecture Decision Records (ADRs) instituted during the Phase 3 R3 Final Hardening cycle. It covers the resolution of findings R3-01 through R3-07, replacing prior ambiguous or vulnerable contracts with mathematically formal specifications.

---

## 2. Granular R3 Decision Records

### ADR-R3-01: Server-Authoritative Question State Machine
- **OLD CONTRACT:** Selected the effective scored answer via `EffectiveAnswer(q, s) = argmax(clientSequenceNumber)`.
- **NEW CONTRACT:** Replaced `argmax()` with a **Server-Authoritative Question State Machine** (`candidate_question_states`). State transitions advance monotonically ($N \to N+1$). The scored answer is strictly the state committed in PostgreSQL at terminal session close.
- **FORMAL INVARIANT:** `P3-I07-R3`: *An untrusted client-controlled ordering field MUST NEVER be the authoritative selector for scored state. The candidate response eligible for scoring evaluation for question $q$ is strictly the value recorded in `candidate_question_states` at terminal session transition.*
- **SECURITY EFFECT:** Eliminates adversarial sequence-advancement attacks and race injection.
- **CONSISTENCY EFFECT:** Question state transitions form a strictly serialized, monotonic chain in PostgreSQL.
- **FAILURE BEHAVIOR:** Out-of-order transitions are staged in the submission ledger and reconciled sequentially; conflicting payloads fail with HTTP 409 Conflict (`E_PAYLOAD_TAMPERED`).
- **HISTORICAL REPRODUCIBILITY EFFECT:** Preserves the complete, auditable sequence of state versions for every question.
- **UPSTREAM DEPENDENCIES:** Phase 2D-5 scoring evaluators consume `candidate_question_states`.
- **IMPLEMENTATION CONSEQUENCES:** Ingestion gateway updates `candidate_question_states` inside the ingestion transaction.
- **Status:** 🟢 **RESOLVED**

---

### ADR-R3-02: Advisory Multi-Context Client Sequencing & Global Event Identity
- **OLD CONTRACT:** Enforced `UNIQUE(exam_session_id, client_sequence_number)`, rejecting valid events from multiple tabs or after counter resets.
- **NEW CONTRACT:** Removed `UNIQUE(exam_session_id, client_sequence_number)`. Reclassified `clientSequenceNumber` as advisory telemetry metadata. Primary idempotency is anchored strictly on `UNIQUE(exam_session_id, client_event_id)`.
- **FORMAL INVARIANT:** `P3-I06-R3`: *Client sequence counters are advisory metadata within an active lease. Event deduplication is anchored exclusively on `(exam_session_id, client_event_id)`.*
- **SECURITY EFFECT:** Enforces single active lease authorization across browser tabs while preventing sequence-based denial of service.
- **CONSISTENCY EFFECT:** Eliminates database key collisions caused by client-side counter resets or multiple contexts.
- **FAILURE BEHAVIOR:** Submissions from stale leases fail with HTTP 401 (`E_LEASE_REVOKED`); duplicate event IDs return cached receipts (HTTP 200).
- **HISTORICAL REPRODUCIBILITY EFFECT:** Retains advisory client sequences in telemetry logs without corrupting ledger primary keys.
- **UPSTREAM DEPENDENCIES:** Phase 2D-8 session lease contracts.
- **IMPLEMENTATION CONSEQUENCES:** Removed database constraint on `client_sequence_number`; gateway enforces lease check on `currentLeaseId`.
- **Status:** 🟢 **RESOLVED**

---

### ADR-R3-03: WebCrypto Encrypted Key Envelope Lifecycle (Model A)
- **OLD CONTRACT:** Claimed the Device Journal Key (DJK) was simultaneously a "non-extractable WebCrypto key" and "wrapped locally via AES-KW", which is invalid under the W3C WebCrypto specification.
- **NEW CONTRACT:** Adopted **Model A (Persistent Encrypted Key Envelope)**. Raw DJK is imported into WebCrypto as a non-extractable `CryptoKey` for live memory operations, while a copy is encrypted via DSWK (derived from candidate PIN) into a Persistent Encrypted Journal Key Envelope (PEJKE) stored in IndexedDB. On crash, candidate re-enters PIN to decrypt PEJKE and re-import a non-extractable key.
- **FORMAL INVARIANT:** `P3-I22-R3`: *At no point shall an unextractable WebCrypto `CryptoKey` be passed to export or wrap APIs. Offline persistence is achieved via a dedicated key envelope encrypted under a candidate-derived key.*
- **SECURITY EFFECT:** 100% compliant with W3C WebCrypto API security model. Protects offline data-at-rest against casual disk inspection and cache sniffing.
- **CONSISTENCY EFFECT:** Guarantees deterministic key recovery across browser crashes and restarts.
- **FAILURE BEHAVIOR:** Corrupted envelope or invalid PIN fails decryption locally, forcing candidate to re-authenticate online to obtain fresh key.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Cryptographically binds local journal entries to the active device lease.
- **UPSTREAM DEPENDENCIES:** Phase 2D-8 session lease tokens.
- **IMPLEMENTATION CONSEQUENCES:** Client player implements WebCrypto PBKDF2/AES-GCM envelope handling.
- **Status:** 🟢 **RESOLVED**

---

### ADR-R3-04: Distributed Idempotency Terminology Calibration
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
- **Status:** 🟢 **RESOLVED**

---

### ADR-R3-05: PostgreSQL Authoritative Deadline Evaluation Clock
- **OLD CONTRACT:** Referenced an ambiguous "monotonic server clock" as if a single monotonic clock existed across distributed servers.
- **NEW CONTRACT:** Deconstructed time into 4 domains: (1) UTC Wall-Clock Timestamp, (2) Monotonic Process Duration, (3) Database Sequence Ordering, and (4) **Authoritative Deadline Evaluation**. Deadline authorization is evaluated exclusively within the PostgreSQL transaction engine via `clock_timestamp()`.
- **FORMAL INVARIANT:** `P3-I13-R3`: *Distributed application nodes have zero independent authority over deadline evaluation. The PostgreSQL transaction clock is the sole trusted authority for examination deadline cutoffs.*
- **SECURITY EFFECT:** Eliminates multi-server clock skew exploits and NTP step vulnerabilities.
- **CONSISTENCY EFFECT:** Universal, single-clock deadline arbitration across all application pods.
- **FAILURE BEHAVIOR:** Submissions arriving after PostgreSQL transaction timestamp exceeds cutoff return HTTP 403 (`E_SUBMISSION_EXPIRED`).
- **UPSTREAM DEPENDENCIES:** PostgreSQL transaction engine.
- **IMPLEMENTATION CONSEQUENCES:** SQL submission insert evaluates `clock_timestamp() <= cutoff_time` atomically.
- **Status:** 🟢 **RESOLVED**

---

### ADR-R3-06: Calibrated Historical Reproducibility Contract
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
- **Status:** 🟢 **RESOLVED**

---

### ADR-R3-07: Phase 2 Upstream Freeze Verification
- **OLD CONTRACT:** General assumption of upstream compliance.
- **NEW CONTRACT:** Verified that R3 hardening introduces **zero modifications** to upstream Phase 2 contracts (`packageIntegritySeal`, `canonicalQuestionId`, `logicalFamilyId`, `representationId`, answer authority, scoring logic, or Phase 2 persistence schemas).
- **FORMAL INVARIANT:** `P3-I01-R3`: *Phase 2A through Phase 2D-8 contracts remain strictly immutable. Phase 3 is exclusively an operational delivery consumer.*
- **SECURITY EFFECT:** Preserves upstream cryptographic seals and tamper-evidence.
- **CONSISTENCY EFFECT:** Total cross-phase architectural hermeticism.
- **FAILURE BEHAVIOR:** Any attempted upstream schema mutation halts execution immediately with 🔴 BLOCKED.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Upstream packages remain permanently authoritative.
- **UPSTREAM DEPENDENCIES:** Phase 2A through Phase 2D-8 certified contracts.
- **IMPLEMENTATION CONSEQUENCES:** Prohibits authoring code in `web/src/services/uadue/canonical/`.
- **Status:** 🟢 **RESOLVED**
