# UADUE Phase 3 — Architecture R1 Traceability Matrix
**Document ID:** `UADUE-P3-REM-TRC-002`  
**Version:** `1.1.0-REMEDIATION-R1`  
**Status:** `DESIGN-ONLY / IMPLEMENTATION STRICTLY LOCKED`  
**Classification:** Traceability Matrix & Impact Analysis  

---

## 1. Executive Summary

This document provides formal, multi-dimensional traceability for all 10 micro-hardening remediations executed in Phase 3 R1. For each remediation, it details the transition from the Old Contract to the New Contract, the motivating rationale, upstream dependencies, and impacts across Security, Consistency, Historical Reproducibility, and Implementation.

---

## 2. Granular Remediation Traceability Matrix

### R1-01: Identity Model vs UUIDv7 Reconciliation
- **Old Contract:** Stated that Phase 3 uses "non-timestamp identity principles (UUIDv7, SHA-256)" and bound immutable entities to UUIDv7 identifiers.
- **New Contract:** Established a formal 4-Stratum Identity Taxonomy. UUIDv7 is strictly an operational database row locator (Stratum 2). Structural and content identities are SHA-256 derived or frozen Phase 2 identities (Stratum 1).
- **Reason:** UUIDv7 contains a 48-bit UNIX millisecond timestamp. Using it as a structural identity would mean two logically identical objects created at different milliseconds would have different identities, violating deterministic hashing.
- **Upstream Dependency:** Consumes frozen Phase 2 identities: `packageId`, `canonicalQuestionId`, `logicalFamilyId`, `representationId`, `assetId` (`sha256(bytes)`).
- **Security Impact:** Prevents horizontal entity spoofing and timing inference.
- **Consistency Impact:** Restores absolute mathematical consistency between Phase 2 deterministic IRs and Phase 3 persistence.
- **Historical Reproducibility Impact:** Ensures historical reconstruction never relies on ephemeral time-ordered UUIDs.
- **Implementation Impact:** Enforces that uniqueness checks and hashes compute over Stratum 1 fields, using UUIDv7 purely for indexed foreign keys.

---

### R1-02: Manifest Integrity Reconciliation
- **Old Contract:** Introduced `manifestIntegritySeal` alongside `packageIntegritySeal` without clearly defining its relationship to the canonical package.
- **New Contract:** Formally classified `manifestIntegritySeal` as Option A (`presentationManifestIntegrity`). It is an ephemeral Phase-3 projection manifest hash over presentation parameters and explicitly references, but NEVER replaces or competes with, the authoritative `packageIntegritySeal`.
- **Reason:** Phase 3 must consume canonical packages without inventing competing package-integrity authorities.
- **Upstream Dependency:** Phase 2D-8 `packageIntegritySeal` remains the sole canonical truth.
- **Security Impact:** Eliminates ambiguity over which hash governs the canonical exam truth.
- **Consistency Impact:** Clear hierarchy: Canonical Truth (`packageIntegritySeal`) $\to$ Projection Truth (`presentationManifestIntegrity`) $\to$ Session.
- **Historical Reproducibility Impact:** Guarantees that both the underlying questions and their visual presentation arrangement can be audited independently.
- **Implementation Impact:** Projection engine computes `presentationManifestIntegrity` over the canonical JSON of presentation orders and seals it.

---

### R1-03: Bounded Deterministic Historical Reproducibility
- **Old Contract:** Asserted unconditionally that "re-running evaluation at any future date yields bit-for-bit identical scores."
- **New Contract:** Replaced with a formally bounded deterministic contract parameterized by the complete 10-tuple $\mathcal{T}_{\text{eval}} = \langle \mathcal{P}_{\text{id}}, \mathcal{P}_{\text{seal}}, \mathcal{K}_{\text{ver}}, \Pi_{\text{ver}}, \mathcal{E}_{\text{id}}, \mathcal{E}_{\text{ver}}, \mathcal{S}_{\text{ver}}, \mathcal{N}_{\text{ver}}, \mathcal{C}_{\text{ver}}, \mathcal{A}_{\text{snap}} \rangle$.
- **Reason:** Future evaluation is only deterministic if the runtime environment, scoring algorithm version, schema version, and numeric rounding rules are pinned.
- **Upstream Dependency:** Phase 2D-5 answer resolution graphs and scoring engines.
- **Security Impact:** Prevents legal and accreditation challenges due to subtle runtime or compiler rounding discrepancies.
- **Consistency Impact:** Mathematically sound evaluation reproducibility contract.
- **Historical Reproducibility Impact:** Guarantees bit-for-bit reproducibility across decades by explicitly preserving execution environment metadata.
- **Implementation Impact:** Requires scoring worker to log and check the 10-tuple before executing evaluation.

---

### R1-04: Formal Offline Journal Contract & Mode Definition
- **Old Contract:** High-level mention of AES-256-GCM IndexedDB journal and 15-second grace window without specifying key lifecycle, restart behavior, or authorization boundaries.
- **New Contract:** Formally specified: (1) Mode is strictly "Answer buffering during transient disconnection under an active lease"; (2) Key derived via WebCrypto `HKDF-SHA256` from `sessionToken` + ephemeral salt with `extractable = false`; (3) Crash recovery re-derives key from session credentials; (4) Copied journals fail lease validation; (5) Multi-device enforced via single active lease.
- **Reason:** Client offline capabilities without explicit cryptographic and lease boundaries become vectors for cheating, clock tampering, and unrecoverable storage.
- **Upstream Dependency:** Phase 2D-8 session lease contracts.
- **Security Impact:** Eliminates local devtools tampering and offline session duplication.
- **Consistency Impact:** Strict monotonic sequence reconciliation between client journal and server ledger.
- **Historical Reproducibility Impact:** Complete audit trail of client-recorded sequences.
- **Implementation Impact:** Requires client player to implement WebCrypto HKDF key derivation and encrypted IndexedDB storage adapter.

---

### R1-05: Time, Deadline & Network Grace Semantics
- **Old Contract:** Stated that "server timer deadlines remain absolute, with a 15-second network grace window" without defining whether grace applied to UI, transport, or scoring.
- **New Contract:** Separated into 6 distinct temporal dimensions ($T_{\text{deadline}}, T_{\text{client}}, T_{\text{receipt}}, T_{\text{cutoff}}, \Delta_{\text{transport\_grace}}, \Delta_{\text{ui\_sync}}$). Defined authoritative scoring rule ($T_{\text{receipt}} \le T_{\text{cutoff}}$) and provided 5 concrete edge scenarios.
- **Reason:** Ambiguity between client click time and server arrival time causes legal disputes in competitive exams.
- **Upstream Dependency:** Phase 2D-8 session timing and transaction timestamps.
- **Security Impact:** Eliminates client clock manipulation attacks completely.
- **Consistency Impact:** Unambiguous server-monotonic determination of submission validity.
- **Historical Reproducibility Impact:** Ingestion receipts record exact server timestamps and grace status.
- **Implementation Impact:** Gateway evaluates arrival timestamp against `session.scheduled_start_at + duration + pause + 15s`.

---

### R1-06: Client vs Server Event Order Reconciliation
- **Old Contract:** Stated that "server sequence numbers establish an unambiguous total ledger order."
- **New Contract:** Explicitly distinguished `clientSequenceNumber` (candidate cognitive intent order) from `serverSequenceNumber` (authoritative ledger persistence order). Defined state reducer rule: reducer sorts by `clientSequenceNumber ASC` to construct `AttemptSnapshot`.
- **Reason:** Network packet reordering can cause an earlier candidate click to arrive after a later click; server receipt sequence alone would distort candidate intent.
- **Upstream Dependency:** Phase 2D-8 append-only ledger semantics.
- **Security Impact:** Prevents racing network requests from overwriting candidate choices out of order.
- **Consistency Impact:** Clean separation between physical ledger sequencing and domain state reduction.
- **Historical Reproducibility Impact:** Guarantees that re-reducing the event stream always recovers the exact final answer intended by the candidate.
- **Implementation Impact:** State reducer sorts by `clientSequenceNumber ASC` per question before applying reducer logic.

---

### R1-07: Session State Concurrency & Single-Writer Model
- **Old Contract:** General assertion that PostgreSQL row locks serialize concurrent session operations.
- **New Contract:** Formalized Invariant `P3-I21` and Optimistic Versioning Protocol (`state_version INTEGER NOT NULL DEFAULT 1`). Transition updates check `state_version = expectedVersion`. Defined racing transition resolution matrix.
- **Reason:** Prevents race conditions between candidate `SUBMIT` and server timer `EXPIRE` from causing duplicate or contradictory state transitions.
- **Upstream Dependency:** PostgreSQL transactional ACID semantics.
- **Security Impact:** Eliminates double-submission or unauthorized state transition race conditions.
- **Consistency Impact:** Exactly-once state machine transition semantics.
- **Historical Reproducibility Impact:** Clean linear state transition history in audit log.
- **Implementation Impact:** Database schema includes `state_version` column on `exam_sessions`.

---

### R1-08: Mandatory Representation Identity in Student Projection
- **Old Contract:** Stated that language representations are supported without enforcing representation identity as a permanent projection binding.
- **New Contract:** Mandated that every question delivered in Tier 3 projection permanently binds the 7-tuple $\langle \mathcal{Q}_{\text{id}}, \mathcal{F}_{\text{id}}, \mathcal{R}_{\text{id}}, \mathcal{P}_{\text{id}}, \mathcal{P}_{\text{seal}}, \Pi_{\text{pres\_ver}}, \mathcal{O}_{\text{display}} \rangle$.
- **Reason:** In bilingual examinations, candidates may contest a question based on a translation error in the specific language they viewed; auditors must know exactly which language text was rendered.
- **Upstream Dependency:** Phase 2C / 2D-5 Logical Question Family and Language Representation Candidates.
- **Security Impact:** Prevents ambiguous language substitution during examination delivery.
- **Consistency Impact:** Complete alignment between question candidates, representations, and candidate submissions.
- **Historical Reproducibility Impact:** Full reconstruction of the visual and linguistic representation seen by the candidate.
- **Implementation Impact:** Submission events carry `representationId` alongside `canonicalQuestionId`.

---

### R1-09: Architecture Questions vs Validation Unknowns Taxonomy
- **Old Contract:** Stated "0 unresolved architectural questions" while listing four performance unknowns, creating apparent contradiction.
- **New Contract:** Formally separated Architectural Blockers (0) from empirical unknowns across Performance (4), Security (2), Implementation (3), and Deployment (2).
- **Reason:** Distinguishes complete architectural design from empirical benchmarks that can only be measured during implementation testing.
- **Upstream Dependency:** Phase 2D-8 benchmark methodology.
- **Security Impact:** Transparent identification of edge-case security verification requirements (e.g. WebCrypto on low-end Android).
- **Consistency Impact:** Honest, calibrated engineering reporting.
- **Historical Reproducibility Impact:** No impact.
- **Implementation Impact:** Defines explicit acceptance gates for future Stage B testing.

---

### R1-10: Phase 2 Upstream Contract Immutability Audit
- **Old Contract:** Implicit consumption of Phase 2 contracts.
- **New Contract:** Explicit verification confirming zero changes to Phase 2 identities, answer resolution graphs, scoring semantics, or canonical persistence models.
- **Reason:** Prevents Phase 3 from silently mutating or destabilizing upstream frozen contracts.
- **Upstream Dependency:** Phase 2A through Phase 2D-8 frozen specifications and tests.
- **Security Impact:** Preserves the cryptographic seals and tamper-evidence of Phase 2.
- **Consistency Impact:** Complete architectural hermeticism.
- **Historical Reproducibility Impact:** Guarantees upstream packages remain permanently reproducible.
- **Implementation Impact:** Prohibits any Phase 3 code from touching `web/src/services/uadue/canonical/` or Phase 2 schemas.
