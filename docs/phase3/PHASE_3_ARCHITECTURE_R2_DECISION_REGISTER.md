# UADUE Phase 3 — Architecture R2 Decision Register
**Document ID:** `UADUE-P3-DEC-R2-002`  
**Version:** `1.2.0-HARDENING-R2`  
**Status:** `DESIGN-ONLY / IMPLEMENTATION STRICTLY LOCKED`  
**Classification:** Architecture Decision Records & Governance Log  

---

## 1. Executive Summary

This register contains the formal Architecture Decision Records (ADRs) instituted during the Phase 3 R2 Hardening cycle. It covers the resolution of findings R2-01 through R2-06, replacing prior ambiguous or uncalibrated contracts with mathematically formal specifications.

---

## 2. Granular R2 Decision Records

### ADR-R2-01: Receipt-Based Deadline & Network Grace Architecture
- **OLD CONTRACT:** Stated that "transport grace is for packets already in flight before deadline" while simultaneously evaluating $T_{\text{receipt}} \le T_{\text{cutoff}}$, creating a contradiction between unprovable intent and arrival verification.
- **NEW CONTRACT:** Adopted the **Receipt-Based Grace Policy**. An event is accepted iff $T_{\text{receipt}} \le T_{\text{deadline}} + \Delta_{\text{receipt\_grace}}$ ($15.000\text{s}$). Client click time is advisory metadata; client clocks have zero authority; server receipt monotonic time is the sole authority; the 15-second window is an operational receipt grace period; the system makes zero claim to prove pre-deadline transmission.
- **RATIONALE:** Proving true pre-deadline transmission over standard TCP/IP without trusting client device clocks or specialized hardware is unverifiable. A receipt-based policy is verifiable, deterministic, and legally defensible.
- **SECURITY EFFECT:** Completely eliminates client clock manipulation attacks, replay attacks with falsified timestamps, and clock-skew exploits.
- **CONSISTENCY EFFECT:** Ingestion state is a pure deterministic function of server-observed ingress time.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Audit logs record verifiable server receipt timestamps alongside receipt grace status.
- **FAILURE BEHAVIOR:** Packets arriving at $T_{\text{receipt}} > T_{\text{cutoff}}$ are rejected immediately with HTTP 403 Forbidden (`E_SUBMISSION_EXPIRED`).
- **UPSTREAM DEPENDENCIES:** Consumes Phase 2D-8 session configuration and PostgreSQL transaction timestamping.
- **IMPLEMENTATION CONSEQUENCES:** Ingestion gateway compares high-resolution monotonic server time against pre-calculated $T_{\text{cutoff}}$ at the HTTP/WebSocket ingress layer.
- **Status:** 🟢 **RESOLVED**

---

### ADR-R2-02: Client Sequence Trust Boundary & Authoritative Answer Reduction
- **OLD CONTRACT:** Described `clientSequenceNumber` as establishing "candidate cognitive intent order" and sorted the attempt reducer by client sequence without bounded validation.
- **NEW CONTRACT:** Classifies `clientSequenceNumber` as an untrusted, advisory client-side sequencing signal. Establishes the **Authoritative Final-Answer Reduction Rule**:
  $$\text{EffectiveAnswer}(q, s) = \arg\max_{e \in \mathcal{E}_q} \big( e.\text{clientSequenceNumber} \big)$$
  Enforces bounded sequence jumps ($\Delta \le 100$), database uniqueness on `(exam_session_id, client_sequence_number)`, sequence gap tracking, and fallback to `serverSequenceNumber` if sequence corruption occurs.
- **RATIONALE:** Client sequence numbers describe the order the client process emitted events, but cannot be trusted as metaphysical proof of human intent. Bounding sequence jumps and enforcing unique constraints prevents malicious counter injection.
- **SECURITY EFFECT:** Prevents sequence-counter exhaustion attacks, split-brain tab collisions, and arbitrary state skipping.
- **CONSISTENCY EFFECT:** Guarantees deterministic state reduction for any valid subset of accepted events.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Event ledger preserves both client intent order and physical arrival sequence.
- **FAILURE BEHAVIOR:** Sequence jumps $> 100$ fail with HTTP 422 (`E_SEQUENCE_JUMP_EXCESSIVE`); duplicate sequence numbers fail with HTTP 409 (`E_DUPLICATE_CLIENT_SEQUENCE`).
- **UPSTREAM DEPENDENCIES:** Phase 2D-8 append-only ledger semantics.
- **IMPLEMENTATION CONSEQUENCES:** Gateway checks sequence bounds in memory before database write; reducer implements deterministic argmax sort.
- **Status:** 🟢 **RESOLVED**

---

### ADR-R2-03: Three-Tier Cryptographic Session Key Hierarchy for Offline Journals
- **OLD CONTRACT:** Derived the local journal encryption key directly from `sessionToken`, which failed when access tokens rotated during examinations.
- **NEW CONTRACT:** Established a **Three-Tier Cryptographic Session Key Hierarchy**:
  1. *Master Session Encryption Key (MSEK):* 256-bit server secret generated at session provisioning, encrypted under server KMS envelope.
  2. *Device Journal Key (DJK):* Derived server-side per active lease: $\text{HKDF-SHA256}(\text{MSEK}, \text{salt}=\text{sessionId}, \text{info}=\text{leaseId})$. Transmitted over TLS 1.3, held in memory as non-extractable WebCrypto key, wrapped locally with candidate PIN via AES-KW.
  3. *Ephemeral Auth Tokens (EAT):* Short-lived JWTs (15 min TTL) that rotate continuously without affecting DJK.
- **RATIONALE:** Decouples short-lived authentication token lifecycles from long-lived journal encryption, allowing credentials to rotate safely without invalidating local encrypted storage.
- **SECURITY EFFECT:** Protects offline data-at-rest against casual disk inspection or cache sniffing; lease-bound derivation prevents copied journal injection. Calibrated language acknowledges browser memory remains vulnerable if host OS is compromised.
- **CONSISTENCY EFFECT:** Journal decryption remains stable across routine token rotations and browser crashes.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Preserves cryptographic traceability of which device lease encrypted which journal batch.
- **FAILURE BEHAVIOR:** Stale or rotated lease submissions fail with HTTP 401 (`E_LEASE_REVOKED`); corrupted local tags trigger client-side re-hydration.
- **UPSTREAM DEPENDENCIES:** Phase 2D-8 session lease contracts.
- **IMPLEMENTATION CONSEQUENCES:** Client player integrates WebCrypto key wrapping and derivation; server implements KMS envelope storage for MSEK.
- **Status:** 🟢 **RESOLVED**

---

### ADR-R2-04: Session Transition Request Idempotency & Error Taxonomy
- **OLD CONTRACT:** Retained basic optimistic versioning (`UPDATE ... WHERE state_version = N`), which caused retried successful transitions to return misleading generic zero-row errors.
- **NEW CONTRACT:** Introduced an immutable **Transition Request Identity** (`transitionRequestId`, `transitionPayloadHash`) and a dedicated ledger table `exam_session_transitions`. Established a 6-tier deterministic error taxonomy:
  - *Case 1 (Idempotent Replay):* Returns cached receipt with HTTP 200 OK.
  - *Case 2 (Tampered Request):* HTTP 409 Conflict (`E_TRANSITION_TAMPERED`).
  - *Case 3 (Already Terminal):* HTTP 409 Conflict (`E_SESSION_ALREADY_TERMINAL`).
  - *Case 4 (Stale Version):* HTTP 409 Conflict (`E_SESSION_STATE_STALE`).
  - *Case 5 (Illegal Transition):* HTTP 422 Unprocessable (`E_ILLEGAL_STATE_TRANSITION`).
  - *Case 6 (Missing Session):* HTTP 404 Not Found (`E_SESSION_NOT_FOUND`).
- **RATIONALE:** High-consequence lifecycle changes (e.g. `ACTIVE -> SUBMITTED`) must handle network drops and retries idempotently without false failures.
- **SECURITY EFFECT:** Prevents double-transitions, state manipulation, and confusing error loops.
- **CONSISTENCY EFFECT:** Exactly-once transition semantics backed by ACID transactions.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Transition ledger provides an immutable audit trail of who triggered what state change and when.
- **FAILURE BEHAVIOR:** Non-idempotent or invalid transition attempts return explicit, actionable HTTP status codes.
- **UPSTREAM DEPENDENCIES:** PostgreSQL ACID transaction serialization.
- **IMPLEMENTATION CONSEQUENCES:** Database migration adds `exam_session_transitions` table; FSM controller checks transition ledger before evaluating row lock.
- **Status:** 🟢 **RESOLVED**

---

### ADR-R2-05: Bounded Evaluation Reproducibility Contract
- **OLD CONTRACT:** Claimed that the architecture "guarantees exact score reproduction across decades" without pinning runtime environment execution semantics.
- **NEW CONTRACT:** Adopted a **Bounded Deterministic Evaluation Contract**:
  > *"The evaluation is deterministic for identical immutable inputs and pinned evaluation contract."*
  Explicitly parameterized by the 11-tuple $\mathcal{T}_{\text{eval\_contract}}$ including algorithm ID/version, fixed-point numeric specification ($\mathcal{N}_{\text{spec}}$), canonical JSON serialization ($\mathcal{C}_{\text{spec}}$), and pinned runtime target ($\mathcal{R}_{\text{target}}$).
- **RATIONALE:** Eliminates uncalibrated claims of perpetual future compatibility. Scoring determinism is achievable only when the execution environment and arithmetic rounding rules are strictly pinned.
- **SECURITY EFFECT:** Shields institution from accreditation and legal challenges over subtle floating-point drift.
- **CONSISTENCY EFFECT:** Pure, side-effect-free evaluation function.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Preserves all environment version metadata required to re-run historical audits in certified containers.
- **FAILURE BEHAVIOR:** Missing or mismatched tuple version flags trigger evaluation pre-flight abort (`E_EVALUATION_VERSION_UNPINNED`).
- **UPSTREAM DEPENDENCIES:** Phase 2D-5 answer resolution graphs and scoring engines.
- **IMPLEMENTATION CONSEQUENCES:** Evaluation engine validates complete 11-tuple before executing scoring logic.
- **Status:** 🟢 **RESOLVED**

---

### ADR-R2-06: Cross-Contract Upstream Freeze Verification
- **OLD CONTRACT:** Implicit assumption of upstream freeze.
- **NEW CONTRACT:** Formal verification confirming that R2 hardening requires **zero changes** to upstream Phase 2 contracts (`packageIntegritySeal`, `canonicalQuestionId`, `logicalFamilyId`, `representationId`, answer authority, scoring semantics, or Phase 2 persistence schemas).
- **RATIONALE:** Phase 3 must operate strictly as an operational delivery layer and cannot alter or destabilize frozen upstream foundations.
- **SECURITY EFFECT:** Preserves cryptographic integrity seals and tamper-evidence established in Phase 2.
- **CONSISTENCY EFFECT:** Absolute cross-phase hermeticism.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Guarantees upstream packages remain permanently valid.
- **FAILURE BEHAVIOR:** If any future requirement demands upstream modification, pipeline must stop and report 🔴 BLOCKED.
- **UPSTREAM DEPENDENCIES:** Phase 2A through Phase 2D-8 certified contracts.
- **IMPLEMENTATION CONSEQUENCES:** Strictly prohibits writing code in `web/src/services/uadue/canonical/`.
- **Status:** 🟢 **RESOLVED**
