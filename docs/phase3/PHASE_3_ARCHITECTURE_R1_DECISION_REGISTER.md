# UADUE Phase 3 — Architecture R1 Decision Register
**Document ID:** `UADUE-P3-REM-DEC-004`  
**Version:** `1.1.0-REMEDIATION-R1`  
**Status:** `DESIGN-ONLY / IMPLEMENTATION STRICTLY LOCKED`  
**Classification:** Decision Register & Architectural Governance  

---

## 1. Executive Summary

This register contains the formal Architecture Decision Records (ADRs) instituted during the Phase 3 R1 Micro-Hardening cycle. Each decision establishes a permanent design rule, superseding prior ambiguous formulations and locking down boundaries prior to implementation authorization.

---

## 2. R1 Micro-Hardening Decisions (ADR-R1-01 through ADR-R1-10)

### ADR-R1-01: 4-Stratum Identity Taxonomy
- **Decision ID:** `ADR-R1-01`
- **Status:** 🟢 **APPROVED IN R1**
- **Context:** Conflating UUIDv7 operational primary keys with immutable structural content identities compromised deterministic hash equality.
- **Decision:** Split identity into 4 strata: (1) Content/Structural Identity (SHA-256 / frozen Phase 2 IRs), (2) Operational Identifiers (UUIDv7), (3) Cryptographic Integrity Seals (SHA-256), and (4) Operational Metadata (Timestamps). UUIDv7 is strictly an indexed operational locator.
- **Upstream Contract:** Phase 2D-8 Sealed Packages, Phase 2D-4 Canonical Questions, Phase 2D-8 Content-Addressed Assets.
- **Security Impact:** Eliminates horizontal IDOR spoofing and timing inference.
- **Consistency Impact:** Eliminates identity mutation across time.
- **Historical Reproducibility Impact:** Ensures historical reconstruction never relies on ephemeral time-ordered UUIDs.
- **Implementation Impact:** Enforces that equality logic evaluates Stratum 1 hashes, using UUIDv7 purely for indexed foreign keys.

---

### ADR-R1-02: Hierarchical Manifest Authority
- **Decision ID:** `ADR-R1-02`
- **Status:** 🟢 **APPROVED IN R1**
- **Context:** The introduction of `manifestIntegritySeal` risked creating a competing canonical package integrity authority.
- **Decision:** Classify `presentationManifestIntegrity` as an ephemeral Phase-3 projection manifest hash. It is explicitly subordinate to `packageIntegritySeal`. It seals presentation parameters (shuffling, display order, language bindings) and references `packageIntegritySeal` without replacing it.
- **Upstream Contract:** Phase 2D-8 `packageIntegritySeal` (Sole Canonical Package Authority).
- **Security Impact:** Unambiguous canonical authority hierarchy; prevents package substitution attacks.
- **Consistency Impact:** Strict layered consistency: Canonical Truth $\to$ Projection Truth $\to$ Session.
- **Historical Reproducibility Impact:** Both underlying question integrity and UI visual presentation can be independently audited.
- **Implementation Impact:** Projection engine computes `presentationManifestIntegrity` over canonical presentation JSON.

---

### ADR-R1-03: Pinned Parameterization for Deterministic Scoring Reproducibility
- **Decision ID:** `ADR-R1-03`
- **Status:** 🟢 **APPROVED IN R1**
- **Context:** Claiming unconditional "bit-for-bit identical scores" across decades ignores the possibility of compiler, numeric, or algorithm version drift.
- **Decision:** Formally parameterize evaluation by the complete 10-tuple $\mathcal{T}_{\text{eval}} = \langle \mathcal{P}_{\text{id}}, \mathcal{P}_{\text{seal}}, \mathcal{K}_{\text{ver}}, \Pi_{\text{ver}}, \mathcal{E}_{\text{id}}, \mathcal{E}_{\text{ver}}, \mathcal{S}_{\text{ver}}, \mathcal{N}_{\text{ver}}, \mathcal{C}_{\text{ver}}, \mathcal{A}_{\text{snap}} \rangle$. Scoring is deterministic for identical input tuples.
- **Upstream Contract:** Phase 2D-5 Answer Resolution Graph & Scoring Engine.
- **Security Impact:** Protects institutional credibility against legal challenges arising from rounding drift.
- **Consistency Impact:** Pure, side-effect-free evaluation function.
- **Historical Reproducibility Impact:** Guarantees exact score reproduction across decades by preserving execution environment versions.
- **Implementation Impact:** Scoring workers record and assert the complete 10-tuple on every evaluation run.

---

### ADR-R1-04: Transient-Buffering Offline Model with WebCrypto HKDF Keys
- **Decision ID:** `ADR-R1-04`
- **Status:** 🟢 **APPROVED IN R1**
- **Context:** Underspecified offline examination risked unrecoverable client storage or unauthorized exam continuation past deadlines.
- **Decision:** Formalize offline capability as "Answer buffering during transient disconnection under an active lease". Local IndexedDB is encrypted with AES-256-GCM using keys derived via WebCrypto `HKDF-SHA256` from `sessionToken` + ephemeral salt. Replay and copied journals fail server lease checks.
- **Upstream Contract:** Phase 2D-8 Session Lease Contracts.
- **Security Impact:** Prevents local devtools tampering and unauthorized session copying.
- **Consistency Impact:** Monotonic sequence reconciliation between client journal and server ledger.
- **Historical Reproducibility Impact:** Complete audit trail of client-generated sequences.
- **Implementation Impact:** Client player implements WebCrypto key derivation and encrypted IndexedDB storage adapter.

---

### ADR-R1-05: Server Receipt Monotonic Cutoff with Transport Grace Window
- **Decision ID:** `ADR-R1-05`
- **Status:** 🟢 **APPROVED IN R1**
- **Context:** A 15-second grace window without precise definitions of client vs server timestamps created scoring ambiguity.
- **Decision:** Deconstruct time into 6 temporal dimensions. Scoring eligibility is governed strictly by $T_{\text{receipt}} \le T_{\text{cutoff}}$ where $T_{\text{cutoff}} = T_{\text{deadline}} + 15.000\text{s}$. The 15 seconds is strictly network transport tolerance for in-flight packets. Client device clocks have zero scoring authority.
- **Upstream Contract:** Phase 2D-8 Session Timers and PostgreSQL transaction timestamps.
- **Security Impact:** Eliminates client clock manipulation attacks.
- **Consistency Impact:** Authoritative, server-monotonic determination of submission validity.
- **Historical Reproducibility Impact:** Submission receipts record exact server arrival timestamps.
- **Implementation Impact:** Gateway evaluates arrival timestamp against `session.scheduled_start_at + duration + pause + 15s`.

---

### ADR-R1-06: Dual-Sequence State Reduction
- **Decision ID:** `ADR-R1-06`
- **Status:** 🟢 **APPROVED IN R1**
- **Context:** Using server receipt order alone for state reduction causes network jitter to corrupt candidate answer choices if an earlier click arrives after a later click.
- **Decision:** Explicitly distinguish `clientSequenceNumber` (candidate cognitive intent order) from `serverSequenceNumber` (physical ledger persistence order). The state reducer sorts events per question by `clientSequenceNumber ASC` when computing `AttemptSnapshot`.
- **Upstream Contract:** Phase 2D-8 Append-Only Ledger Semantics.
- **Security Impact:** Prevents out-of-order network arrival from corrupting candidate answers.
- **Consistency Impact:** Decouples physical ledger arrival order from domain state reduction.
- **Historical Reproducibility Impact:** Ensures that re-reducing the event stream always recovers the exact final answer intended by the candidate.
- **Implementation Impact:** Reducer logic sorts by `clientSequenceNumber ASC` before computing state.

---

### ADR-R1-07: Optimistic Concurrency Invariant P3-I21 for Session Transitions
- **Decision ID:** `ADR-R1-07`
- **Status:** 🟢 **APPROVED IN R1**
- **Context:** Basic row locks without version checking allow racing transitions (`ACTIVE -> SUBMITTED` vs `ACTIVE -> EXPIRED`) to execute unpredictably.
- **Decision:** Enforce Invariant `P3-I21`: "At most one authoritative session-state transition may commit for a given session state version." The `exam_sessions` table includes `state_version INTEGER`. All update queries check `state_version = expectedVersion`.
- **Upstream Contract:** PostgreSQL Transactional ACID Semantics.
- **Security Impact:** Eliminates double-submission and unauthorized state transition race conditions.
- **Consistency Impact:** Exactly-once state machine transitions.
- **Historical Reproducibility Impact:** Clean linear state transition history in audit log.
- **Implementation Impact:** Schema includes `state_version` column on `exam_sessions`.

---

### ADR-R1-08: Mandatory 7-Tuple Representation Identity Binding
- **Decision ID:** `ADR-R1-08`
- **Status:** 🟢 **APPROVED IN R1**
- **Context:** In bilingual examinations, failure to record which language representation was rendered makes verifying translation disputes impossible.
- **Decision:** Mandate that every question delivered in Tier 3 projection permanently binds the 7-tuple $\langle \mathcal{Q}_{\text{id}}, \mathcal{F}_{\text{id}}, \mathcal{R}_{\text{id}}, \mathcal{P}_{\text{id}}, \mathcal{P}_{\text{seal}}, \Pi_{\text{pres\_ver}}, \mathcal{O}_{\text{display}} \rangle$. Submission envelopes explicitly include `representationId`.
- **Upstream Contract:** Phase 2C / 2D-5 Logical Question Family and Language Representation Candidates.
- **Security Impact:** Prevents ambiguous language substitution during examination delivery.
- **Consistency Impact:** Total alignment between question candidates, representations, and candidate submissions.
- **Historical Reproducibility Impact:** Enables bit-for-bit visual and linguistic reconstruction of what the candidate saw.
- **Implementation Impact:** Submission events carry `representationId` alongside `canonicalQuestionId`.

---

### ADR-R1-09: Multi-Dimensional Uncertainty Reporting Taxonomy
- **Decision ID:** `ADR-R1-09`
- **Status:** 🟢 **APPROVED IN R1**
- **Context:** Reporting "0 unresolved questions" alongside four known performance unknowns was contradictory and poorly calibrated.
- **Decision:** Establish 5 distinct uncertainty classifications: Architectural Blockers (0), Performance Unknowns (4), Security Unknowns (2), Implementation Unknowns (3), Deployment Unknowns (2).
- **Upstream Contract:** Phase 2D-8 Benchmark Methodology.
- **Security Impact:** Transparent identification of edge-case security verification requirements.
- **Consistency Impact:** Rigorous, calibrated engineering governance reporting.
- **Historical Reproducibility Impact:** No impact.
- **Implementation Impact:** Establishes explicit empirical acceptance gates for future Stage B testing.

---

### ADR-R1-10: Read-Only Upstream Consumption Guarantee
- **Decision ID:** `ADR-R1-10`
- **Status:** 🟢 **APPROVED IN R1**
- **Context:** The risk that Phase 3 might re-extract or re-interpret source PDF documents, acting as an uncertified second ingestion engine.
- **Decision:** Phase 3 is strictly a read-only consumer of sealed Phase 2D-8 packages. Phase 3 cannot re-parse raw PDF coordinates, mutate document graphs, re-run OCR, or alter answer keys.
- **Upstream Contract:** Phase 2A through Phase 2D-8 Frozen Contracts.
- **Security Impact:** Guarantees upstream tamper-evidence is maintained.
- **Consistency Impact:** Total architectural hermeticism.
- **Historical Reproducibility Impact:** Ensures canonical packages remain universally authoritative.
- **Implementation Impact:** Prohibits Phase 3 code from modifying upstream canonical schemas or packages.

---

## 3. Decision Register Summary

| Decision ID | Area | Status | Impact on Phase 2 Upstream |
| :--- | :--- | :---: | :---: |
| **ADR-R1-01** | 4-Stratum Identity Taxonomy | 🟢 APPROVED | Read-Only Consumer |
| **ADR-R1-02** | Hierarchical Manifest Authority | 🟢 APPROVED | Read-Only Consumer |
| **ADR-R1-03** | Pinned Parameterization for Scoring | 🟢 APPROVED | Read-Only Consumer |
| **ADR-R1-04** | Transient-Buffering Offline Model | 🟢 APPROVED | Read-Only Consumer |
| **ADR-R1-05** | Server Receipt Monotonic Cutoff | 🟢 APPROVED | Read-Only Consumer |
| **ADR-R1-06** | Dual-Sequence State Reduction | 🟢 APPROVED | Read-Only Consumer |
| **ADR-R1-07** | Session State Concurrency Invariant | 🟢 APPROVED | Read-Only Consumer |
| **ADR-R1-08** | Mandatory Representation Identity | 🟢 APPROVED | Read-Only Consumer |
| **ADR-R1-09** | Uncertainty Reporting Taxonomy | 🟢 APPROVED | Read-Only Consumer |
| **ADR-R1-10** | Read-Only Upstream Consumption | 🟢 APPROVED | Zero Upstream Modification |

🔒 **PHASE 3 IMPLEMENTATION REMAINS STRICTLY LOCKED.**
