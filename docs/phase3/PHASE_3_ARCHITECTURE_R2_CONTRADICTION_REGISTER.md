# UADUE Phase 3 — Architecture R2 Contradiction Register
**Document ID:** `UADUE-P3-CNT-R2-003`  
**Version:** `1.2.0-HARDENING-R2`  
**Status:** `DESIGN-ONLY / IMPLEMENTATION STRICTLY LOCKED`  
**Classification:** Contradiction Analysis & Reconciliation Log  

---

## 1. Executive Summary

This register formally catalogs, analyzes, and closes all contradictions identified during the Phase 3 R2 Hardening review. Each contradiction is evaluated across security, consistency, historical reproducibility, failure behavior, upstream dependencies, and implementation consequences.

---

## 2. Granular Contradiction Resolutions

### CR-R2-01: Transport Grace Intent vs Arrival Cutoff Rule
- **CONTRADICTION ID:** `CR-R2-01`
- **OLD CONTRACT:** Claimed that the 15-second grace window was "for packets already in flight before the deadline" while simultaneously evaluating $T_{\text{receipt}} \le T_{\text{cutoff}}$.
- **NEW CONTRACT:** Adopted the **Receipt-Based Grace Policy**. Accepted if and only if $T_{\text{receipt}} \le T_{\text{deadline}} + 15.000\text{s}$. The system explicitly disclaims proving pre-deadline packet transmission; server arrival time is the sole arbiter.
- **RATIONALE:** Proving pre-deadline transmission without trusting client timestamps or specialized network appliances is unverifiable over TCP/IP. The receipt-based policy removes this logical contradiction.
- **SECURITY EFFECT:** Eliminates client clock spoofing and forged timestamp exploits.
- **CONSISTENCY EFFECT:** Pure, deterministic gate based on server-observed ingress time.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Audit receipts record exact server arrival timestamps.
- **FAILURE BEHAVIOR:** Submissions arriving after $T_{\text{cutoff}}$ return HTTP 403 Forbidden (`E_SUBMISSION_EXPIRED`).
- **UPSTREAM DEPENDENCIES:** Phase 2D-8 session timer specifications.
- **IMPLEMENTATION CONSEQUENCES:** Ingress reverse proxy / gateway evaluates arrival time against pre-computed cutoff timestamp.
- **Resolution Status:** 🟢 **CLOSED**

---

### CR-R2-02: Client Sequence as "Human Intent" vs Untrusted Client Boundary
- **CONTRADICTION ID:** `CR-R2-02`
- **OLD CONTRACT:** Described `clientSequenceNumber` as establishing "candidate cognitive intent order" and used it for state reduction without bounding checks.
- **NEW CONTRACT:** Reclassified `clientSequenceNumber` as an untrusted advisory sequencing signal within an active lease. Enforced sequence bounds ($\Delta \le 100$), gap detection, database uniqueness, and defined the deterministic **Authoritative Final-Answer Reduction Rule** ($\arg\max$ client sequence with fallback to server sequence).
- **RATIONALE:** The client device is an untrusted environment; sequence numbers describe process event generation order, not unforgeable human cognitive intent.
- **SECURITY EFFECT:** Prevents sequence counter flooding, split-brain collisions, and state skipping attacks.
- **CONSISTENCY EFFECT:** State reduction is fully deterministic regardless of network arrival interleaving.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Preserves dual sequence tracking for complete audit reconstruction.
- **FAILURE BEHAVIOR:** Sequence jumps $> 100$ return HTTP 422 (`E_SEQUENCE_JUMP_EXCESSIVE`); duplicate sequence numbers return HTTP 409 (`E_DUPLICATE_CLIENT_SEQUENCE`).
- **UPSTREAM DEPENDENCIES:** Phase 2D-8 append-only ledger semantics.
- **IMPLEMENTATION CONSEQUENCES:** Ingestion gateway performs in-memory sequence delta validation before transaction commit.
- **Resolution Status:** 🟢 **CLOSED**

---

### CR-R2-03: Single-Key Token Derivation vs Token Rotation Eviction
- **CONTRADICTION ID:** `CR-R2-03`
- **OLD CONTRACT:** Derived local journal encryption keys directly from `sessionToken`, which broke journal decryption when access tokens rotated during long exams.
- **NEW CONTRACT:** Established the **Three-Tier Cryptographic Session Key Hierarchy** (MSEK $\to$ DJK $\to$ EAT). Ephemeral auth tokens rotate continuously without affecting the long-lived Device Journal Key (DJK).
- **RATIONALE:** Cryptographic encryption keys must have lifecycles decoupled from short-lived HTTP authorization tokens.
- **SECURITY EFFECT:** Protects offline data-at-rest; lease-scoped derivation prevents copied journal injection across workstations.
- **CONSISTENCY EFFECT:** Journal decryption remains stable across routine token refreshes and browser restarts.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Cryptographically binds journal batches to the specific active lease that created them.
- **FAILURE BEHAVIOR:** Revoked leases fail with HTTP 401 (`E_LEASE_REVOKED`); corrupted local tags trigger client-side re-hydration.
- **UPSTREAM DEPENDENCIES:** Phase 2D-8 session lease contracts.
- **IMPLEMENTATION CONSEQUENCES:** Client player manages WebCrypto key wrapping; server stores MSEK encrypted via KMS.
- **Resolution Status:** 🟢 **CLOSED**

---

### CR-R2-04: Optimistic Versioning 0-Row Update Ambiguity
- **CONTRADICTION ID:** `CR-R2-04`
- **OLD CONTRACT:** Mapped all 0-row updates in optimistic concurrency (`UPDATE ... WHERE state_version = N`) to generic concurrency conflict errors, causing retried successful transitions to report false failures.
- **NEW CONTRACT:** Introduced an immutable **Transition Request Identity** (`transitionRequestId`, `transitionPayloadHash`) and a dedicated ledger table `exam_session_transitions`. Established a 6-tier deterministic error taxonomy distinguishing idempotent retries from actual conflicts.
- **RATIONALE:** High-stakes lifecycle transitions (e.g., submitting an exam) must handle network drops and retries idempotently without returning confusing conflict errors to the student.
- **SECURITY EFFECT:** Eliminates double-submission, state fixation, and unauthorized state race conditions.
- **CONSISTENCY EFFECT:** Exactly-once transition semantics backed by ACID transactions.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Immutable log of all transition attempts and their deterministic receipts.
- **FAILURE BEHAVIOR:** Retried successful transitions return cached receipts (HTTP 200); conflicting transitions return explicit HTTP 409 codes.
- **UPSTREAM DEPENDENCIES:** PostgreSQL ACID transaction serialization.
- **IMPLEMENTATION CONSEQUENCES:** Added `exam_session_transitions` table to schema; transition controller queries transition log before row lock.
- **Resolution Status:** 🟢 **CLOSED**

---

### CR-R2-05: Perpetual Reproducibility Claims vs Unpinned Runtime Divergence
- **CONTRADICTION ID:** `CR-R2-05`
- **OLD CONTRACT:** Claimed unconditional "exact score reproduction across decades" without pinning execution runtime semantics or numeric rounding rules.
- **NEW CONTRACT:** Replaced with a **Bounded Deterministic Evaluation Contract**:
  > *"The evaluation is deterministic for identical immutable inputs and pinned evaluation contract."*
  Formally parameterized by the complete 11-tuple $\mathcal{T}_{\text{eval\_contract}}$ including algorithm ID/version, fixed-point numeric specification ($\mathcal{N}_{\text{spec}}$), and pinned runtime target ($\mathcal{R}_{\text{target}}$).
- **RATIONALE:** Re-evaluation across decades cannot be guaranteed identical if floating-point implementations or runtime compilers drift.
- **SECURITY EFFECT:** Eliminates legal liability arising from subtle compiler or numeric rounding changes.
- **CONSISTENCY EFFECT:** Pure, deterministic scoring evaluation.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Preserves all necessary environment versions to execute certified audit re-runs.
- **FAILURE BEHAVIOR:** Unpinned runtime or missing tuple versions abort evaluation with `E_EVALUATION_VERSION_UNPINNED`.
- **UPSTREAM DEPENDENCIES:** Phase 2D-5 answer resolution graphs and scoring engines.
- **IMPLEMENTATION CONSEQUENCES:** Evaluation engine validates complete 11-tuple before executing scoring logic.
- **Resolution Status:** 🟢 **CLOSED**

---

### CR-R2-06: Operational Flexibility vs Upstream Phase 2 Freeze Boundary
- **CONTRADICTION ID:** `CR-R2-06`
- **OLD CONTRACT:** Risk of introducing Phase 3 operational features that subtly modify or reinterpret frozen Phase 2 canonical packages.
- **NEW CONTRACT:** Formally verified that all R2 hardening mechanisms are strictly confined to the Phase 3 operational delivery layer. Phase 2 identities, `packageIntegritySeal`, answer authority, and scoring logic remain 100% frozen and read-only.
- **RATIONALE:** Preserves the certified integrity of Phase 2A through Phase 2D-8.
- **SECURITY EFFECT:** Guarantees upstream tamper-evidence remains intact.
- **CONSISTENCY EFFECT:** Total architectural hermeticism.
- **HISTORICAL REPRODUCIBILITY EFFECT:** Upstream packages remain permanently authoritative.
- **FAILURE BEHAVIOR:** Any attempt to modify upstream schemas halts the pipeline with 🔴 BLOCKED.
- **UPSTREAM DEPENDENCIES:** Phase 2A through Phase 2D-8 certified contracts.
- **IMPLEMENTATION CONSEQUENCES:** Zero code permitted in `web/src/services/uadue/canonical/`.
- **Resolution Status:** 🟢 **CLOSED**

---

## 3. Summary of Contradiction Closures

| Contradiction ID | Area | Severity | Final Status |
| :--- | :--- | :---: | :---: |
| **CR-R2-01** | Deadline / Network Grace Semantics | 🔴 Critical | 🟢 CLOSED |
| **CR-R2-02** | Client Sequence Trust Boundary | 🔴 Critical | 🟢 CLOSED |
| **CR-R2-03** | Offline Journal Key Hierarchy | 🔴 Critical | 🟢 CLOSED |
| **CR-R2-04** | Session Transition Idempotency | 🟠 High | 🟢 CLOSED |
| **CR-R2-05** | Historical Reproducibility Language | 🟠 High | 🟢 CLOSED |
| **CR-R2-06** | Cross-Contract Upstream Freeze | 🔴 Critical | 🟢 CLOSED |

**Total Open Contradictions: 0**
