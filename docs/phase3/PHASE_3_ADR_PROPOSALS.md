# UADUE Phase 3 — Architecture Decision Records (ADRs)
**Document ID:** `UADUE-P3-ADR-017`  
**Version:** `1.0.0-SPECIFICATION`  
**Status:** `DESIGN-ONLY / IMPLEMENTATION STRICTLY LOCKED`  
**Classification:** Architectural Governance & Decision Log  

---

## 1. Index of Proposed Architecture Decision Records

- **ADR-001:** Separation of Canonical Package Truth from Operational Session State
- **ADR-002:** Append-Only Event Sourcing for Candidate Submissions
- **ADR-003:** Ephemeral 4-Tier Projection Model for Answer Key Leakage Prevention
- **ADR-004:** Pure-Function Scoring Boundary Parameterized by Immutable Tuples
- **ADR-005:** Hybrid Offline-Tolerant Examination Model with Encrypted Local Journal
- **ADR-006:** Server-Monotonic Sequence Numbers with Dual Client Sequence Tracking
- **ADR-007:** Cryptographic Submission Receipts for Non-Repudiable Candidate Proof
- **ADR-008:** Database-Level Row-Level Security (RLS) for Multi-Tenant Isolation
- **ADR-009:** Deterministic Pseudo-Random Question and Option Shuffling
- **ADR-010:** Asynchronous Scoring Ingestion with Backpressure Decoupling

---

## 2. Granular ADR Specifications

### ADR-001: Separation of Canonical Package Truth from Operational Session State
- **Status:** `PROPOSED`
- **Context:** Examination platforms frequently modify question records during live delivery to attach candidate answers, proctor flags, or provisional scores, leading to corrupted source truth and non-reproducible exams.
- **Decision:** Strictly isolate upstream Phase 2D-8 Canonical Assessment Packages into immutable, read-only tables. Operational session records (`exam_sessions`) maintain foreign key references but can never mutate canonical packages.
- **Alternatives Considered:** 
  - *Unified Attempt-Package Document:* Store candidate answers inside a mutable copy of the package JSON. *Rejected:* Causes massive database write amplification and destroys content-addressed hash guarantees.
- **Consequences:** Eliminates content corruption; guarantees that packages can be reused safely across millions of candidates.

---

### ADR-002: Append-Only Event Sourcing for Candidate Submissions
- **Status:** `PROPOSED`
- **Context:** Storing answers as mutable rows (`UPDATE candidate_answers SET selected_option = 'B'`) destroys the historical interaction trail, makes concurrent request conflict resolution unpredictable, and eliminates forensic proof of candidate interaction timing.
- **Decision:** Model all candidate submissions as an append-only event stream (`candidate_submission_events`). Every click, option toggle, or clear action is an immutable event with client and server sequences.
- **Alternatives Considered:**
  - *Mutable Row per Question:* A table with one row per question per student updated on every click. *Rejected:* Row-level write locks cause database thread exhaustion under high concurrency; no undo history or forensic timeline.
- **Consequences:** Complete auditability, zero lock contention on question rows, linear ingestion throughput, deterministic state reduction.

---

### ADR-003: Ephemeral 4-Tier Projection Model for Answer Key Leakage Prevention
- **Status:** `PROPOSED`
- **Context:** Sending canonical package JSON to browsers and hiding answers via client-side CSS or JavaScript is the leading cause of cheating in modern web-based assessments.
- **Decision:** Establish a strict 4-Tier information barrier where the Tier 3 Student Live projection is synthesized entirely on the server, stripping all answer keys, solutions, and scoring rules before network transmission.
- **Alternatives Considered:**
  - *Client-Side Answer Masking:* Bundling obfuscated answer keys with the web client. *Rejected:* Easily reversed via browser developer tools or memory inspection.
- **Consequences:** Eliminates client-side answer leakage; ensures examination integrity even if the candidate completely reverse-engineers the web client.

---

### ADR-004: Pure-Function Scoring Boundary Parameterized by Immutable Tuples
- **Status:** `PROPOSED`
- **Context:** Post-exam challenges, legal disputes, and corrigenda often require re-scoring exams weeks or months after administration. If scoring relies on mutable current state, past results cannot be verified.
- **Decision:** Treat the scoring engine as a pure, deterministic function of four immutable parameters: $(AttemptSnapshot, PackageSnapshot, ScoringPolicyVersion, AnswerKeyVersion)$. Evaluations are stored in append-only `candidate_evaluation_runs` linked via a DAG.
- **Alternatives Considered:**
  - *In-Place Score Updating:* Overwriting scores upon corrigendum. *Rejected:* Erases original results, invalidating legal audit trails and candidate dispute history.
- **Consequences:** Perfect historical reproducibility; seamless auditing of multi-iteration corrigenda.

---

### ADR-005: Hybrid Offline-Tolerant Examination Model with Encrypted Local Journal
- **Status:** `PROPOSED`
- **Context:** Candidates face unreliable internet connectivity. A pure online-only model causes lost submissions and high candidate anxiety, while a pure offline model risks clock manipulation and cheating.
- **Decision:** Require online authentication to start, buffer transient offline interactions in an AES-256-GCM encrypted IndexedDB journal, and flush idempotently upon reconnection while strictly enforcing server-authoritative deadlines.
- **Alternatives Considered:**
  - *Pure Online (Fail-Closed on Disconnect):* Immediately block test-taker on network drop. *Rejected:* Unusable in regions with periodic cellular/Wi-Fi packet loss.
  - *Unrestricted Offline:* Allow candidate to finish offline and upload hours later. *Rejected:* Enables client clock manipulation and offline collaboration attacks.
- **Consequences:** High resilience against real-world network drops with zero compromise on deadline enforcement.

---

### ADR-006: Server-Monotonic Sequence Numbers with Dual Client Sequence Tracking
- **Status:** `PROPOSED`
- **Context:** Network latency and socket reconnections cause submission events to arrive out of order or duplicated at the server.
- **Decision:** Track both `clientSequenceNumber` (monotonic counter per candidate) and `serverSequenceNumber` (PostgreSQL `BIGSERIAL`). The server sequence provides unambiguous total order in the ledger; the client sequence allows the state reducer to detect gaps and reorder events deterministically.
- **Alternatives Considered:**
  - *Server-Only Timestamp Ordering:* Order events by server arrival time. *Rejected:* Flaky networks can cause an earlier candidate click to arrive after a later click.
- **Consequences:** Deterministic state reduction regardless of network arrival interleaving.

---

### ADR-007: Cryptographic Submission Receipts for Non-Repudiable Candidate Proof
- **Status:** `PROPOSED`
- **Context:** Candidates may dispute examination outcomes by claiming their answers were dropped by the system or altered post-submission.
- **Decision:** Issue an Ed25519-signed `SubmissionReceipt` containing the hash of the candidate's response payload, sequence numbers, and server timestamp for every accepted submission.
- **Alternatives Considered:**
  - *Simple HTTP 200 OK:* Return generic success without cryptographic payload. *Rejected:* Does not provide non-repudiable legal proof in dispute arbitration.
- **Consequences:** Provides mathematically verifiable evidence for legal, accreditation, and dispute defense.

---

### ADR-008: Database-Level Row-Level Security (RLS) for Multi-Tenant Isolation
- **Status:** `PROPOSED`
- **Context:** Application-level bugs in SQL queries can lead to catastrophic cross-tenant data leaks in shared-database architectures.
- **Decision:** Enforce PostgreSQL Row-Level Security (RLS) policies on all tables, requiring transactions to set `app.current_tenant_id`. Any query failing to set tenant context fails closed.
- **Alternatives Considered:**
  - *Application-Level WHERE Clauses:* Rely exclusively on ORM query filters. *Rejected:* A single missing WHERE clause in custom reporting code causes a data breach.
  - *Separate Database per Tenant:* High operational complexity and cost overhead for thousands of institutional tenants.
- **Consequences:** Defense-in-depth isolation enforced by the PostgreSQL database engine kernel.

---

### ADR-009: Deterministic Pseudo-Random Question and Option Shuffling
- **Status:** `PROPOSED`
- **Context:** Shuffling questions and options deters candidate collusion. However, if shuffling is non-deterministic or performed on the client, reviewing candidate logs becomes intractable.
- **Decision:** Perform shuffling on the server using a deterministic HMAC-SHA256 pseudo-random sequence seeded by `(sessionEntropyKey, examSessionId, packageIntegritySeal)`. The derived mapping is persisted immutably in `exam_session_projections`.
- **Alternatives Considered:**
  - *Client-Side JavaScript Shuffling:* Randomizing arrays in React/Vue component state. *Rejected:* Untrusted; breaks synchronization between option keys and submission payloads.
- **Consequences:** Prevents cheating while ensuring that proctors and auditors can reconstruct the candidate's exact visual view.

---

### ADR-010: Asynchronous Scoring Ingestion with Backpressure Decoupling
- **Status:** `PROPOSED`
- **Context:** When 100,000 candidates finish an exam simultaneously at 12:00:00, executing synchronous scoring calculations during submission would crash application servers.
- **Decision:** Decouple exam completion from scoring evaluation via an asynchronous job queue (Kafka / PostgreSQL background workers). Session submission immediately transitions to `SUBMITTED` and issues a completion receipt; scoring runs asynchronously with controlled backpressure.
- **Alternatives Considered:**
  - *Synchronous Grading on Submit:* Evaluating all answers within the HTTP submit request. *Rejected:* Causes timeout cascading and gateway collapse at exam conclusion.
- **Consequences:** Sub-50ms session submission latency regardless of exam scale; smooth, resilient evaluation throughput.
