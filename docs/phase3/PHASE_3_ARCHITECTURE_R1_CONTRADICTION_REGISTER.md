# UADUE Phase 3 — Architecture R1 Contradiction Register
**Document ID:** `UADUE-P3-REM-CNT-003`  
**Version:** `1.1.0-REMEDIATION-R1`  
**Status:** `DESIGN-ONLY / IMPLEMENTATION STRICTLY LOCKED`  
**Classification:** Contradiction Register & Defect Reconciliation  

---

## 1. Executive Summary

This register formally logs and tracks every architectural contradiction identified during the Phase 3 gate review. All 10 contradictions have been analyzed, reconciled against upstream Phase 2 contracts, and formally closed through explicit micro-hardening remediation rules.

---

## 2. Contradiction Catalog & Resolution Log

### CR-01: UUIDv7 vs Deterministic Structural Identity
- **Contradiction ID:** `CR-P3-01`
- **Detection Context:** Domain model asserted "non-timestamp identity" while specifying UUIDv7 as the identity anchor.
- **Nature of Contradiction:** UUIDv7 embeds a 48-bit UNIX millisecond timestamp. Logically identical objects created at different times would yield different UUIDv7 values, breaking deterministic equality.
- **Severity:** 🔴 **Critical**
- **Resolution Applied:** Established 4-Stratum Identity Taxonomy. UUIDv7 is strictly an operational database row locator (Stratum 2). Structural content identity is derived from SHA-256 hashes or frozen Phase 2 IRs (Stratum 1).
- **Status:** 🟢 **CLOSED**

---

### CR-02: Manifest Seal Competing with Package Integrity Seal
- **Contradiction ID:** `CR-P3-02`
- **Detection Context:** Introducing `manifestIntegritySeal` alongside `packageIntegritySeal` without hierarchical subordination.
- **Nature of Contradiction:** Risked creating a competing canonical package integrity authority, violating Phase 2D-8 where `packageIntegritySeal` is the sole canonical truth.
- **Severity:** 🔴 **Critical**
- **Resolution Applied:** Formally classified `presentationManifestIntegrity` as an ephemeral Phase 3 projection manifest hash. It explicitly references and nests `packageIntegritySeal` and cannot alter canonical truth.
- **Status:** 🟢 **CLOSED**

---

### CR-03: Unconditional Historical Reproducibility Claims
- **Contradiction ID:** `CR-P3-03`
- **Detection Context:** Asserting that future re-evaluation yields "bit-for-bit identical scores" unconditionally.
- **Nature of Contradiction:** Re-scoring cannot be guaranteed identical across decades if underlying scoring algorithms, numeric rounding rules, or JSON serialization versions drift.
- **Severity:** 🟠 **High**
- **Resolution Applied:** Bound evaluation determinism to the complete 10-tuple $\mathcal{T}_{\text{eval}}$ pinning algorithm ID, algorithm version, numeric semantics version, schema version, and canonical serialization version.
- **Status:** 🟢 **CLOSED**

---

### CR-04: Underspecified Offline Journal Key Lifecycle
- **Contradiction ID:** `CR-P3-04`
- **Detection Context:** Specifying AES-256-GCM encrypted local storage without detailing key origin, persistence, or crash recovery.
- **Nature of Contradiction:** In-memory keys are lost on browser crash, rendering local journals permanently unreadable; storing keys in unencrypted `localStorage` voids encryption guarantees.
- **Severity:** 🔴 **Critical**
- **Resolution Applied:** Key is derived deterministically on the client using WebCrypto `HKDF-SHA256` parameterized by candidate `sessionToken` and `examSessionId`. Upon crash, candidate re-authenticates to recover the key; storage is strictly transient buffering under an active lease.
- **Status:** 🟢 **CLOSED**

---

### CR-05: Ambiguous 15-Second Network Grace Semantics
- **Contradiction ID:** `CR-P3-05`
- **Detection Context:** Stating server timers are absolute while permitting a 15-second grace window without specifying whether grace applies to UI, transport, or scoring.
- **Nature of Contradiction:** Allowed conflicting interpretations where candidates could claim late clicks made within the 15-second window were legally valid exam time.
- **Severity:** 🔴 **Critical**
- **Resolution Applied:** Formally split into 6 temporal dimensions. Scoring eligibility is governed exclusively by $T_{\text{receipt}} \le T_{\text{cutoff}}$. The 15 seconds is strictly network transport in-flight tolerance. Client clocks have zero authority.
- **Status:** 🟢 **CLOSED**

---

### CR-06: Server Receipt Order vs Candidate Cognitive Intent Order
- **Contradiction ID:** `CR-P3-06`
- **Detection Context:** Asserting that server sequence numbers establish total order for submission state reduction.
- **Nature of Contradiction:** Network jitter can cause candidate click $E_2$ to arrive before $E_1$. Evaluating purely by server arrival sequence would overwrite $E_2$ with $E_1$, corrupting the candidate's intended response.
- **Severity:** 🟠 **High**
- **Resolution Applied:** Distinguished `clientSequenceNumber` (cognitive intent order) from `serverSequenceNumber` (physical ledger persistence order). The state reducer sorts events per question by `clientSequenceNumber ASC`.
- **Status:** 🟢 **CLOSED**

---

### CR-07: Unversioned Racing Session State Transitions
- **Contradiction ID:** `CR-P3-07`
- **Detection Context:** Relying on basic row locks without version checking during racing transitions (`ACTIVE -> SUBMITTED` vs `ACTIVE -> EXPIRED`).
- **Nature of Contradiction:** Two concurrent transactions observing state `ACTIVE` could both attempt to commit terminal state transitions.
- **Severity:** 🟠 **High**
- **Resolution Applied:** Established Invariant `P3-I21` and Optimistic Versioning (`state_version INTEGER`). All state update queries check `state_version = expectedVersion`. Defined a formal racing transition resolution matrix.
- **Status:** 🟢 **CLOSED**

---

### CR-08: Missing Representation Identity in Submission Payloads
- **Contradiction ID:** `CR-P3-08`
- **Detection Context:** Supporting multilingual/bilingual views without binding representation identity to candidate submissions.
- **Nature of Contradiction:** In bilingual papers (e.g. UPSC Prelims), post-exam translation disputes could not be verified because the server did not record which language representation the candidate viewed when answering.
- **Severity:** 🟠 **High**
- **Resolution Applied:** Enforced mandatory 7-tuple projection binding. Submission envelopes now explicitly include `representationId` alongside `canonicalQuestionId`.
- **Status:** 🟢 **CLOSED**

---

### CR-09: "Zero Unresolved Questions" vs Listed Performance Unknowns
- **Contradiction ID:** `CR-P3-09`
- **Detection Context:** Gate summary reported "0 unresolved architectural questions" while listing four major performance unknowns.
- **Nature of Contradiction:** Created an apparent contradiction between claims of total certainty and explicit unknown performance metrics.
- **Severity:** 🟡 **Medium**
- **Resolution Applied:** Replaced single metric with 5 discrete uncertainty classifications: Architectural Blockers (0), Performance Unknowns (4), Security Unknowns (2), Implementation Unknowns (3), Deployment Unknowns (2).
- **Status:** 🟢 **CLOSED**

---

### CR-10: Ingestion Re-execution Risk (Phase 3 Acting as Ingestion Engine)
- **Contradiction ID:** `CR-P3-10`
- **Detection Context:** Risk that Phase 3 player or projection engine re-parses raw PDF coordinates or reconstructs question relationships.
- **Nature of Contradiction:** Would violate upstream freeze by creating a second competing ingestion engine in Phase 3.
- **Severity:** 🔴 **Critical**
- **Resolution Applied:** Strictly enforced that Phase 3 is a pure, read-only consumer of sealed Phase 2D-8 packages. Phase 3 projection engine only queries pre-computed canonical question IRs.
- **Status:** 🟢 **CLOSED**

---

## 3. Summary of Contradiction Register

| Total Contradictions Identified | Critical (🔴) | High (🟠) | Medium (🟡) | Remaining Open |
| :---: | :---: | :---: | :---: | :---: |
| **10** | **5** | **4** | **1** | **0 (All 🟢 CLOSED)** |

🔒 **PHASE 3 IMPLEMENTATION REMAINS STRICTLY LOCKED.**
