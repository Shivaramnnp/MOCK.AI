# UADUE Phase 3 — Architecture Traceability Matrix & Critical Stop Conditions
**Document ID:** `UADUE-P3-TRC-018`  
**Version:** `1.0.0-SPECIFICATION`  
**Status:** `DESIGN-ONLY / IMPLEMENTATION STRICTLY LOCKED`  
**Classification:** Upstream Traceability & Stop Condition Reconciliation  

---

## 1. Executive Summary & Governance Reconciliation

This document provides complete, bidirectional traceability between the operational delivery architecture of Phase 3 and the immutable upstream foundations established across Phase 2A through Phase 2D-8. It formally answers the **15 Mandatory Critical Stop Conditions** required by governance before any implementation activity may be considered.

---

## 2. Upstream Contract Traceability Matrix

| Phase 3 Subsystem / Feature | Upstream Phase 2 Contract Consumed | Architectural Invariant | Design Decision Rationale |
| :--- | :--- | :--- | :--- |
| **Package Ingestion & Hydration** | Phase 2D-8 Sealed PostgreSQL Package (`canonical_packages`, `package_integrity_seal`) | `P3-I01`, `P3-I02` | Guarantees that the exam delivered to candidates is bit-for-bit identical to the validated canonical entity. |
| **Question Display & Bilingual Views**| Phase 2C / 2D-5 Logical Question Family (`languageRepresentations`) | `P3-I14` | Preserves authentic question identity across English and Hindi views without duplicating question IDs. |
| **Answer Authority & Scoring** | Phase 2D-5 Answer Resolution Graph & Scoring Engine (`evaluationEngine`) | `P3-I07`, `P3-I10` | Eliminates duplicated scoring rules; Phase 3 wraps Phase 2D-5 as a pure deterministic evaluation function. |
| **Content-Addressed Asset Delivery** | Phase 2D-8 Asset Graph (`content_addressed_assets`, SHA-256 binary hashing) | `P3-I11` | Prevents URL guessing, tampering, or missing diagrams; assets are verified against their SHA-256 hashes. |
| **Multi-Tenancy Enforcement** | Phase 2D-8 Tenancy Model & PostgreSQL RLS Policies | `P3-I09` | Ensures institutional data hermeticism enforced by PostgreSQL engine kernel rather than error-prone application code. |
| **Publication & Version Control** | Phase 2D-8 Publication Gateway & Lifecycle FSM (`publicationRequestFingerprint`) | `P3-I03`, `P3-I04` | Guarantees idempotent exam release and prevents race conditions during administrative publishing. |

---

## 3. Explicit Reconciliation of the 15 Critical Stop Conditions

The 15 Critical Stop Conditions must be conclusively answered without speculation or ambiguity:

### 1. Who owns canonical question truth?
- **Owner:** Upstream Phase 2D-8 Sealed Canonical Assessment Package (`canonical_assessment_packages`).
- **Mechanism:** The Canonical Package is immutable, cryptographically sealed with `packageIntegritySeal`, and persisted in PostgreSQL. Neither the player, proctor, nor session orchestrator can alter question truth.

### 2. Who owns session truth?
- **Owner:** Server-Side Exam Session Orchestrator (`exam_sessions`).
- **Mechanism:** The server governs the session lifecycle finite state machine (`INITIALIZED`, `ACTIVE`, `PAUSED`, `SUBMITTED`, etc.). Timers, start times, and remaining durations are computed exclusively on the server using monotonic clocks.

### 3. Who owns submission truth?
- **Owner:** Server-Side Submission Event Ledger (`candidate_submission_events`).
- **Mechanism:** Submission truth is the ordered append-only sequence of verified events recorded in PostgreSQL. The client journal is strictly an unacknowledged candidate buffer until acknowledged by a signed server receipt.

### 4. Who owns scoring truth?
- **Owner:** Server-Side Asynchronous Scoring Evaluation Engine executing frozen Phase 2D-5 evaluators.
- **Mechanism:** Scoring truth is computed as a pure deterministic function $\mathcal{F}_{\text{eval}}(Attempt, Package, Policy, Key)$ and stored in immutable `candidate_evaluation_runs`. The client has zero scoring authority.

### 5. Who owns publication truth?
- **Owner:** Phase 2D-8 Publication Gateway (`canonical_package_events`).
- **Mechanism:** Governed by `publicationRequestFingerprint` and the lifecycle state machine. A package is only published when an authorized administrator executes a serialized transaction that reaches the `PUBLISHED` state.

### 6. How is answer leakage prevented?
- **Mechanism:** Strictly enforced 4-Tier Projection Model. The server-side projection adapter strips `authoritativeAnswer`, solution text, resolution DAGs, and scoring rubrics before serializing the Tier 3 Student Live JSON payload. The client receives only stems, options, and assets.

### 7. How is historical reproducibility guaranteed?
- **Mechanism:** Evaluation runs are append-only records parameterized by the complete 10-tuple input $\mathcal{T}_{\text{eval}}$ (binding `packageId`, `packageIntegritySeal`, answer resolution version, scoring policy version, algorithm ID/version, schema version, numeric semantics version, and canonical serialization version). Evaluation is deterministic for identical pinned input tuples.

### 8. How are retries made idempotent?
- **Mechanism:** Unique constraint on `(exam_session_id, client_event_id)` combined with SHA-256 fingerprint verification of the candidate response payload. Identical retries return the cached signed receipt without creating duplicate ledger rows; conflicting retries fail with `409 Conflict`.

### 9. How are concurrent submissions resolved?
- **Mechanism:** PostgreSQL row-level locks and transaction serialization per session. Concurrent submissions are assigned strictly monotonic `serverSequenceNumber` values in transaction commit order. The state reducer evaluates state by client sequence order.

### 10. How is tenant isolation enforced?
- **Mechanism:** PostgreSQL Row-Level Security (RLS) policies on all tables keyed by `tenant_id`. Every session, submission, evaluation, and asset request is bound to the active tenant context (`SET LOCAL app.current_tenant_id`). Cross-tenant requests fail closed with uniform 404 responses.

### 11. How are package and version identities preserved?
- **Mechanism:** Upstream `packageIntegritySeal` (SHA-256) serves as the sole canonical truth, complemented by ephemeral Phase-3 `presentationManifestIntegrity`. UUIDv7 is used strictly as an operational row locator. Every session, submission, and evaluation run permanently binds both `packageId` and `packageIntegritySeal`.

### 12. How are offline and reconnect semantics defined?
- **Mechanism:** Online-seeded, hybrid offline-tolerant model. The client stores in-flight responses in an AES-256-GCM encrypted IndexedDB journal with monotonic `clientSequenceNumber`. Upon reconnection, buffered events are submitted in an atomic batch. Server timer deadlines remain absolute (with a 15-second network grace window).

### 13. How are assets integrity-verified?
- **Mechanism:** Content-addressed storage. Asset identifiers are the hex SHA-256 hash of the binary file. Edge delivery CDNs and client download handlers verify the hash of the downloaded binary before rendering.

### 14. How are mutable operational states separated from immutable package truth?
- **Mechanism:** Physical relational storage stratification into distinct database tables. Immutable canonical content resides in `canonical_packages`; operational session lifecycles reside in `exam_sessions`; append-only submissions reside in `candidate_submission_events`. No operational updates touch canonical tables.

### 15. How does the system recover from partial failure?
- **Mechanism:** ACID database transactions, idempotency caches, and client journal replay. If a worker crashes or network drops mid-operation, uncommitted transactions roll back cleanly, and the client retries using unchanged `clientEventId` values to achieve deterministic recovery.

---

## 4. Verification & Certification Readiness

All 15 Critical Stop Conditions are definitively resolved. Zero contradictions, ambiguities, or missing boundaries exist between Phase 2D-8 and Phase 3 specifications.
