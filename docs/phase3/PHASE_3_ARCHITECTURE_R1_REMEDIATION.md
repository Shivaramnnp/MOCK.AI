# UADUE Phase 3 — Architecture Micro-Hardening Remediation (R1)
**Document ID:** `UADUE-P3-REM-001`  
**Version:** `1.1.0-REMEDIATION-R1`  
**Status:** `DESIGN-ONLY / IMPLEMENTATION STRICTLY LOCKED`  
**Classification:** Micro-Hardening Architecture Specification  

---

## 1. Executive Summary & Remediation Mandate

Following the Phase 3 Architecture & Scope Gate review, this document executes the **R1 Micro-Hardening Remediation**. It formally resolves the 10 identified architecture findings (R1-01 through R1-10), eliminates ambiguities around identity vs operational IDs, removes competing manifest integrity authorities, tightens time/grace semantics, formalizes the offline resilience protocol, and defines strict session concurrency models.

**Governance Boundary:**
- 🔴 **IMPLEMENTATION REMAINS STRICTLY FORBIDDEN.**
- 🔒 **Phase 2A–2D8 upstream contracts remain frozen and immutable.**
- 🚫 Zero production code, zero migrations, zero schema modifications, zero player/UI changes.

---

## 2. R1-01 — Identity Model vs UUIDv7 Reconciliation

### 2.1 The Architectural Defect in Initial Spec
The initial specification conflated operational row-level database primary keys (UUIDv7) with immutable structural and content identities, stating that entities were "bound to immutable UUIDv7 IDs". Because UUIDv7 contains a time-ordered component (48-bit UNIX timestamp), using it as a content identity violates the core UADUE principle that structural identity must be deterministic, reproducible, and independent of wall-clock generation time.

### 2.2 Formal Four-Stratum Identity Taxonomy
Phase 3 formally establishes a four-stratum identity taxonomy:

```text
Stratum 1: Content & Structural Identity (Deterministic, Reproducible)
    Derived from canonical data contents via cryptographic hashing or frozen upstream Phase 2 IRs.
    Examples: packageIntegritySeal (SHA-256), assetId (SHA-256), canonicalQuestionId, logicalFamilyId.

Stratum 2: Operational Identifiers (Time-Ordered, Ephemeral)
    Locally unique row locators used for database indexing, clustering, and foreign key traversal.
    Type: UUIDv7.
    Examples: examSessionId, clientEventId, evaluationRunId.

Stratum 3: Integrity Seals (Cryptographic Attestation)
    Bit-level verification hashes sealing immutable collections.
    Type: Hex SHA-256 (64 characters).
    Examples: packageIntegritySeal, presentationManifestIntegrity.

Stratum 4: Operational Metadata & Telemetry
    Wall-clock timestamps, client advisory timestamps, latency markers.
    Strictly non-authoritative for identity, deduplication, or grading.
```

### 2.3 Authoritative Upstream Phase 2 Identity Mapping
Phase 3 consumes existing upstream Phase 2 identities without replacement:

| Domain Entity | Authoritative Phase 2 Identity | Nature of Identity | Phase 3 Operational Locator |
| :--- | :--- | :--- | :--- |
| **Assessment Package** | `packageId` (UUID) + `packageIntegritySeal` (SHA-256) | Phase 2D-8 Sealed Canonical Package Envelope | Foreign key anchor |
| **Canonical Question** | `canonicalQuestionId` (UUID) | Phase 2D-4 Canonical Question IR | Target question reference |
| **Logical Question Family** | `logicalQuestionFamilyId` (UUID) | Phase 2C / 2D-2 Logical Question Family | Projection family binding |
| **Language Representation** | `representationId` (UUID / lang code) | Phase 2C / 2D-5 Language Representation Candidate | Display representation |
| **Answer Authority** | `answerResolutionVersion` / `resolvedAnswerAuthority` | Phase 2D-5 Resolved Answer Graph & Key | Evaluation input parameter |
| **Scoring Policy** | `scoringPolicyVersion` (String / Hash) | Phase 2D-5 Scoring Policy Definition | Evaluation input parameter |
| **Asset Binary** | `assetId` = `SHA256(binary_bytes)` | Phase 2D-8 Content-Addressed Binary Storage | Static asset delivery URL |

UUIDv7 is restricted strictly to Stratum 2 (operational locators). Two submission records or evaluation runs are logically equivalent if and only if their Stratum 1 structural identities match, regardless of their operational UUIDv7 values.

---

## 3. R1-02 — Manifest Integrity Reconciliation

### 3.1 Defect & Ambiguity Analysis
The initial report introduced `manifestIntegritySeal` alongside `packageIntegritySeal`, risking the creation of a competing canonical package integrity authority.

### 3.2 Formal Resolution: Option A (Presentation Manifest Integrity)
Phase 3 explicitly rules out Option B. `packageIntegritySeal` remains the **sole and absolute canonical package integrity authority**.

`presentationManifestIntegrity` is formally defined as an ephemeral, Phase-3-scoped projection manifest hash that references, but never replaces, the canonical package seals:

```text
Upstream Truth (Phase 2D-8):
    packageId: UUID
    packageIntegritySeal: SHA-256 (Canonical Package Truth)
          │
          ▼ Consumed by Phase 3
Phase 3 Projection Truth:
    presentationManifestId: UUIDv7
    presentationManifestIntegrity: SHA-256 (Derived Presentation Projection Truth)
          │
          ▼ Binds
    Exam Session: examSessionId
```

### 3.3 Exact Canonical Fields Entering the Presentation Manifest Hash
The `presentationManifestIntegrity` hash is computed over the deterministic canonical JSON serialization of the presentation parameters:

$$\text{presentationManifestIntegrity} = \text{SHA256}\Big(\text{CanonicalJSON}\big(\mathcal{M}_{\text{pres}}\big)\Big)$$

Where $\mathcal{M}_{\text{pres}}$ contains precisely:
```json
{
  "packageId": "018f3a9e-1111-7d1a-8e5f-package000001",
  "packageIntegritySeal": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "presentationPolicyVersion": "v1.0.0",
  "presentationOrderPolicy": "SHUFFLED_DETERMINISTIC",
  "shufflingSeed": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "questionDisplayOrder": [
    "018f3a9e-4b2c-7d1a-8e5f-question0001",
    "018f3a9e-4b2c-7d1a-8e5f-question0002"
  ],
  "optionDisplayOrders": {
    "018f3a9e-4b2c-7d1a-8e5f-question0001": ["opt_c", "opt_a", "opt_b", "opt_d"]
  },
  "representationBindings": {
    "018f3a9e-4b2c-7d1a-8e5f-question0001": {
      "logicalFamilyId": "018f3a9e-3333-7d1a-8e5f-family000001",
      "availableRepresentations": ["en", "hi"],
      "defaultLanguage": "en"
    }
  }
}
```

The presentation manifest guarantees that the candidate's exact visual arrangement is verifiable, while `packageIntegritySeal` guarantees the question content and answers remain untouched.

---

## 4. R1-03 — Bounded Deterministic Historical Reproducibility

### 4.1 Replacement of Unconditional Statement
The previous assertion that "re-running evaluation at any future date yields bit-for-bit identical scores" is formally retired.

**Replaced With:**
> *"The evaluation is deterministic for the same immutable input identities and pinned algorithm/policy versions."*

### 4.2 Complete Immutable Evaluation Input Tuple
An evaluation run is reproducible if and only if all components of the input tuple $\mathcal{T}_{\text{eval}}$ are pinned:

$$\mathcal{T}_{\text{eval}} = \Big\langle \mathcal{P}_{\text{id}}, \mathcal{P}_{\text{seal}}, \mathcal{K}_{\text{ver}}, \Pi_{\text{ver}}, \mathcal{E}_{\text{id}}, \mathcal{E}_{\text{ver}}, \mathcal{S}_{\text{ver}}, \mathcal{N}_{\text{ver}}, \mathcal{C}_{\text{ver}}, \mathcal{A}_{\text{snap}} \Big\rangle$$

Where:
1. $\mathcal{P}_{\text{id}}$: `packageId` (UUID)
2. $\mathcal{P}_{\text{seal}}$: `packageIntegritySeal` (SHA-256, 64-char hex)
3. $\mathcal{K}_{\text{ver}}$: `answerResolutionVersion` (Pinned string/hash from Phase 2D-5)
4. $\Pi_{\text{ver}}$: `scoringPolicyVersion` (Pinned string/hash from Phase 2D-5)
5. $\mathcal{E}_{\text{id}}$: `evaluationAlgorithmId` (e.g., `UADUE_STANDARD_MCQ_GATE_V1`)
6. $\mathcal{E}_{\text{ver}}$: `evaluationAlgorithmVersion` (Semantic version, e.g., `1.2.0`)
7. $\mathcal{S}_{\text{ver}}$: `evaluationSchemaVersion` (Version of scorecard JSON schema)
8. $\mathcal{N}_{\text{ver}}$: `numericSemanticsVersion` (Floating-point vs 4-decimal fixed-point rounding rules)
9. $\mathcal{C}_{\text{ver}}$: `canonicalSerializationVersion` (Canonical JSON RFC 8785 version)
10. $\mathcal{A}_{\text{snap}}$: `attemptSnapshot` (Reduced, verified candidate response map)

### 4.3 Deterministic Evaluation Function Contract
$$\text{DeterministicEvaluation}\big(\mathcal{T}_{\text{eval}}\big) \longrightarrow \Big\langle \text{Scorecard}, \text{RunSignature} \Big\rangle$$

- The function is pure, stateless, and side-effect free.
- It executes with zero external I/O and zero database queries.
- Given identical $\mathcal{T}_{\text{eval}}$, any certified runtime environment produces the identical `Scorecard` and `RunSignature = SHA256(Scorecard)`.

---

## 5. R1-04 — Formal Offline Journal Contract & Mode Definition

### 5.1 Formal Mode Definition: Transient Buffering Only
Phase 3 explicitly defines its offline support:
> **Phase 3 Offline Mode is strictly "Answer Buffering during Transient Disconnection under an Active Lease".**  
> It is NOT an air-gapped examination appliance, nor does it allow indefinite offline test-taking.

### 5.2 Encryption Key Derivation & Lifecycle
To ensure the local journal cannot be extracted or tampered with:
1. **Derivation:** At session initialization (while online), the player derives an AES-256-GCM encryption key using the Web Crypto API:
   $$\text{JournalKey} = \text{HKDF-SHA256}\Big(\text{sessionToken}, \text{salt}=\text{examSessionId}, \text{info}=\text{"UADUE_LOCAL_JOURNAL_V1"}\Big)$$
2. **Non-Exportability:** The derived `CryptoKey` is marked `extractable = false` and held in client memory.
3. **Crash Recovery & Browser Restart:**
   - If the browser crashes, the in-memory key is lost.
   - The candidate relaunches the player. The player authenticates against the server (if online) or uses the securely cached `sessionToken` in memory/cookies to re-derive the identical `JournalKey`.
   - The player opens the IndexedDB store, verifies the AES-GCM authentication tags, and resumes journal state.

### 5.3 Journal Identity & Monotonic Sequence
- Each journal record is identified by:
  ```json
  {
    "journalRecordId": "018f3a9e-8888-7d1a-8e5f-clientevt00001",
    "examSessionId": "018f3a9e-4b2c-7d1a-8e5f-1a2b3c4d5e6f",
    "clientSequenceNumber": 14,
    "encryptedPayload": "base64_aes_gcm_ciphertext",
    "iv": "base64_12byte_iv",
    "authTag": "base64_16byte_tag",
    "acknowledgmentStatus": "PENDING"
  }
  ```
- `clientSequenceNumber` must be strictly monotonic: $S_{k+1} = S_k + 1$.

### 5.4 Offline Replay, Copied Journals & Multi-Device Governance
1. **Copied Journal Protection:**
   - If an attacker clones the IndexedDB to a second device, the second device lacks the active session token and lease.
   - When the second device attempts to flush the journal, the server checks the request's lease ID. If the lease does not match the server's `currentLeaseId`, the entire request fails with `401 Unauthorized (E_LEASE_REVOKED)`.
2. **Corrupted Journal Handling:**
   - If IndexedDB fails authentication tag verification, the client flags the local storage as corrupted.
   - The client drops local uncommitted buffer and fetches the authoritative server-committed state via `GET /api/v1/sessions/{id}/state`.
3. **Session Expiry While Offline:**
   - If a client disconnects at $T_0 + 60\text{m}$ and reconnects at $T_0 + 130\text{m}$ (where exam duration was 120m), the server has already transitioned the session to `EXPIRED`.
   - All events in the flushed batch with `serverReceiptTime > submissionAcceptanceDeadline` are dropped. The session evaluates strictly on events received prior to expiration.

---

## 6. R1-05 — Time, Deadline & Network Grace Semantics

### 6.1 Formal Distinction Across Six Temporal Dimensions

| Dimension | Formal Symbol | Authority | Definition / Purpose |
| :--- | :---: | :---: | :--- |
| **1. Examination Deadline** | $T_{\text{deadline}}$ | Server | Absolute wall-clock cutoff: $T_{\text{start}} + \text{Duration} + \text{AccumulatedPause}$. At this instant, the exam officially concludes. |
| **2. Client Event Creation Time** | $T_{\text{client}}$ | Client (Advisory) | Local device clock time when candidate clicked. Strictly advisory telemetry; zero scoring authority. |
| **3. Server Receipt Time** | $T_{\text{receipt}}$ | Server (Monotonic) | PostgreSQL ingestion arrival timestamp recorded via server monotonic clock. |
| **4. Submission Acceptance Cutoff** | $T_{\text{cutoff}}$ | Server | $T_{\text{deadline}} + \Delta_{\text{transport\_grace}}$. The final microsecond the server will accept incoming HTTP submission packets. |
| **5. Network Transport Tolerance** | $\Delta_{\text{transport\_grace}}$ | Server Config | **15.000 seconds**. Strictly accommodates network packet latency for submissions sent before $T_{\text{deadline}}$ that experienced transit delay. |
| **6. UI Synchronization Tolerance** | $\Delta_{\text{ui\_sync}}$ | Advisory | $\pm 500\text{ms}$ clock drift compensation applied to client visual timer to prevent premature countdown termination. |

### 6.2 The Authoritative Scoring Rule
> **Scoring Eligibility Rule:**  
> A submission event $e$ is valid for scoring evaluation if and only if:  
> $$T_{\text{receipt}}(e) \le T_{\text{cutoff}}$$  
> Client timestamps ($T_{\text{client}}$) have **zero authority** over scoring eligibility.

### 6.3 Five Concrete Timing Scenarios

```text
Exam Window: 08:00:00 to 10:00:00 (Duration: 2 hours)
T_deadline = 10:00:00.000
Transport Grace (Δ) = 15.000s
T_cutoff = 10:00:15.000
```

#### Example 1: Timely submission with network transit delay
- Candidate clicks: $T_{\text{client}} = \text{09:59:59.100}$
- Network packet reaches server: $T_{\text{receipt}} = \text{10:00:11.450}$
- Rule Check: $T_{\text{receipt}} \le T_{\text{cutoff}}$ ($\text{10:00:11.450} \le \text{10:00:15.000}$).
- **Verdict: 🟢 ACCEPTED.** Scored normally.

#### Example 2: Desynchronized/Slow client clock clicks at deadline
- Candidate clicks: $T_{\text{client}} = \text{10:00:08.000}$ (Candidate device clock is 10s slow)
- Network packet reaches server: $T_{\text{receipt}} = \text{10:00:09.200}$
- Rule Check: $T_{\text{receipt}} \le T_{\text{cutoff}}$ ($\text{10:00:09.200} \le \text{10:00:15.000}$).
- **Verdict: 🟢 ACCEPTED.** Server receipt controls; client clock is ignored.

#### Example 3: Severe network delay exceeding grace window
- Candidate clicks: $T_{\text{client}} = \text{09:59:50.000}$
- Cellular network buffers packet; packet reaches server: $T_{\text{receipt}} = \text{10:00:18.200}$
- Rule Check: $T_{\text{receipt}} > T_{\text{cutoff}}$ ($\text{10:00:18.200} > \text{10:00:15.000}$).
- **Verdict: 🔴 REJECTED.** Returns `403 Forbidden (E_SUBMISSION_EXPIRED)`. Event dropped from scoring.

#### Example 4: Duplicate retry of timely submission arrives after cutoff
- Candidate submits at 09:59:58; accepted at $T_{\text{receipt}} = \text{10:00:04.000}$. Receipt 1 issued.
- Network drops receipt; client retry arrives at $T_{\text{receipt}} = \text{10:00:25.000}$.
- Rule Check: Server detects existing `clientEventId` with matching fingerprint.
- **Verdict: 🟢 ACCEPTED (IDEMPOTENT).** Returns cached Receipt 1. No new event appended.

#### Example 5: Offline batch submitted after exam expiration
- Candidate disconnects at 09:50:00; answers 10 questions offline until 10:04:00.
- Reconnects and flushes batch at: $T_{\text{receipt}} = \text{10:05:30.000}$.
- Rule Check: Entire batch arrives after $T_{\text{cutoff}}$ ($\text{10:05:30.000} > \text{10:00:15.000}$).
- **Verdict: 🔴 REJECTED.** Batch rejected with `E_SESSION_EXPIRED`. Attempt evaluated on pre-disconnect answers only.

---

## 7. R1-06 — Client vs Server Event Order Reconciliation

### 7.1 Formal Distinction Between Sequences
- **`clientSequenceNumber` (Monotonic Intent):** Generated by the client session journal. Describes the candidate's cognitive interaction order ($E_1 \to E_2 \to E_3$).
- **`serverSequenceNumber` (Monotonic Ledger Order):** Generated by PostgreSQL `BIGSERIAL` upon commit. Describes the absolute physical arrival and persistence order in the ledger.

### 7.2 Out-of-Order Network Reconciliation Rule
When network jitter or parallel HTTP/WebSocket connections cause events to arrive out of order:
1. **Ledger Storage:** Events are written in arrival order and assigned `serverSequenceNumber`:
   ```text
   Arrival 1: clientSeq = 14, serverSeq = 101, Question Q1 = 'B'
   Arrival 2: clientSeq = 13, serverSeq = 102, Question Q1 = 'A'
   ```
2. **State Reduction Rule:** When reducing the event stream to construct the `AttemptSnapshot` for a question $Q$:
   $$\text{Events}_Q = \text{SortBy}\big(\text{events}, \text{clientSequenceNumber ASC}\big)$$
   $$\text{FinalState}_Q = \text{Reduce}\big(\text{Events}_Q\big)$$
   In the example above, `clientSeq = 14` overrides `clientSeq = 13`. The candidate's final intended answer is `'B'`.
3. **Prohibition:** Client timestamps ($T_{\text{client}}$) are strictly forbidden from determining reducer sort order. Only monotonic `clientSequenceNumber` is used.

---

## 8. R1-07 — Session State Concurrency & Single-Writer Model

### 8.1 Formal Concurrency Invariant (P3-I21)
> **Session Transition Invariant (P3-I21):**  
> *At most one authoritative session-state transition may commit for a given session state version.*

### 8.2 Optimistic Versioning Protocol
The `exam_sessions` table includes an atomic version column: `state_version INTEGER NOT NULL DEFAULT 1`.

Every transition is executed via an atomic conditional SQL statement:
```sql
UPDATE exam_sessions
SET 
    session_state = :targetState,
    state_version = state_version + 1,
    updated_at = NOW()
WHERE 
    exam_session_id = :sessionId
    AND session_state = :expectedCurrentState
    AND state_version = :expectedVersion;
```

### 8.3 Racing Transition Resolution Matrix

| Racing Request A | Racing Request B | Concurrency Winner | Behavior & Error Code |
| :--- | :--- | :--- | :--- |
| `ACTIVE -> SUBMITTED` (Candidate) | `ACTIVE -> EXPIRED` (Server Timer) | First to commit | Winner transitions state. Loser observes `ROWS UPDATED = 0`, detects terminal state, returns `409 Conflict (E_SESSION_TERMINAL)`. |
| `ACTIVE -> SUBMITTED` (Candidate) | `ACTIVE -> TERMINATED` (Proctor) | First to commit | If Proctor commits first, candidate receives `403 Forbidden (E_SESSION_TERMINATED)`. |
| `ACTIVE -> SUBMITTED` (Req 1) | `ACTIVE -> SUBMITTED` (Req 2 - Retry) | Req 1 commits | Req 2 detects `SUBMITTED` with identical payload; returns cached submission acknowledgment idempotently. |
| `ACTIVE -> PAUSED` (Proctor) | `ACTIVE -> SUBMITTED` (Candidate) | First to commit | If Paused commits first, candidate submission rejected with `409 Conflict (E_SESSION_PAUSED)`. |

---

## 9. R1-08 — Mandatory Representation Identity in Student Projection

### 9.1 Defect in Prior Projection Model
The initial projection model specified language switching at the presentation level without mandating that the specific chosen representation be bound as a permanent identity in the projection contract.

### 9.2 The Minimum Immutable Projection Binding
Every question delivered to the Exam Player must permanently bind the following 7-tuple:

$$\text{ProjectionItemBinding} = \Big\langle \mathcal{Q}_{\text{id}}, \mathcal{F}_{\text{id}}, \mathcal{R}_{\text{id}}, \mathcal{P}_{\text{id}}, \mathcal{P}_{\text{seal}}, \Pi_{\text{pres\_ver}}, \mathcal{O}_{\text{display}} \Big\rangle$$

Where:
- $\mathcal{Q}_{\text{id}}$: `canonicalQuestionId` (UUID)
- $\mathcal{F}_{\text{id}}$: `logicalFamilyId` (UUID)
- $\mathcal{R}_{\text{id}}$: `representationId` (UUID of the specific language candidate, e.g. English stem vs Hindi stem)
- $\mathcal{P}_{\text{id}}$: `packageId` (UUID)
- $\mathcal{P}_{\text{seal}}$: `packageIntegritySeal` (SHA-256)
- $\Pi_{\text{pres\_ver}}$: `presentationPolicyVersion` (String)
- $\mathcal{O}_{\text{display}}$: `presentationOrder` (Integer display index)

### 9.3 Historical Audit Guarantee
When a submission is recorded, the event payload includes `representationId`. If a candidate later disputes a translation ambiguity in a bilingual examination (e.g., UPSC Prelims Hindi translation error), auditors can reconstruct the exact linguistic representation, stem wording, and option layout rendered on the candidate's screen.

---

## 10. R1-09 — Taxonomy of Uncertainties & Unknowns

The previous statement "0 unresolved architectural questions" is corrected by separating architectural completeness from empirical validation unknowns:

```text
1. Architectural Blockers: 0
   All boundaries, state machines, ownership rules, and protocols are architecturally resolved.

2. Performance Validation Unknowns: 4
   - WAL contention and IOPS saturation under 100,000+ concurrent submission writes.
   - PgBouncer transaction-mode connection pool saturation under 1,000,000 concurrent clients.
   - CDN edge cache invalidation latency across globally distributed geographic regions.
   - Worker pool autoscaling latency during the final 120-second exam completion surge.

3. Security Validation Unknowns: 2
   - Browser WebCrypto performance across legacy budget Android devices under memory pressure.
   - Client-side IndexedDB quota behavior under private browsing / incognito mode across browser vendors.

4. Implementation Validation Unknowns: 3
   - Exact throughput of Ed25519 cryptographic receipt signing on Node.js / Go worker threads.
   - PostgreSQL hash-partitioning routing latency on 64 sub-tables.
   - Redis Streams memory footprint when buffering in-flight batch flushes.

5. Deployment / Environment Unknowns: 2
   - Multi-region database replication lag during primary failover.
   - Hosted Supabase cloud infrastructure connection concurrency limits.
```

---

## 11. R1-10 — Phase 2 Upstream Contract Immutability Audit

A comprehensive verification confirms that Phase 3 does not modify or violate any upstream Phase 2 contract:
- 🟢 **Zero Modification to Phase 2 Identity:** `packageId`, `canonicalQuestionId`, `logicalFamilyId`, and `assetId` remain immutable.
- 🟢 **Zero Competing Package Truth:** `presentationManifestIntegrity` is strictly a Phase 3 projection hash; `packageIntegritySeal` remains the sole canonical truth.
- 🟢 **Zero Modification to Answer Authority:** Phase 2D-5 answer resolution graphs and dispute models are consumed read-only.
- 🟢 **Zero Modification to Scoring Semantics:** Phase 2D-5 evaluation logic is executed as an immutable pure function.
- 🟢 **Zero Exam-Specific Logic:** All presentation, ordering, and timing rules are universal and parameterized by configuration.

---

## 12. Remediation Gate Verdict

| Area | Initial Gate | Remediation R1 Status | Final Verdict |
| :--- | :---: | :---: | :---: |
| **R1-01: Identity Model** | 🔴 | Resolved via 4-Stratum Identity Taxonomy | 🟢 RESOLVED |
| **R1-02: Manifest Integrity** | 🔴 | Resolved via Option A (Projection Manifest Hash) | 🟢 RESOLVED |
| **R1-03: Historical Reproducibility** | 🟠 | Bounded via $\mathcal{T}_{\text{eval}}$ Pinned Tuple | 🟢 RESOLVED |
| **R1-04: Offline Journal Contract** | 🔴 | Formally specified WebCrypto & Transient Buffering | 🟢 RESOLVED |
| **R1-05: Time / Grace Semantics** | 🔴 | 6 Temporal Dimensions & 5 Concrete Scenarios | 🟢 RESOLVED |
| **R1-06: Event Order Reconciliation** | 🟠 | `clientSeq` (Intent) vs `serverSeq` (Ledger) | 🟢 RESOLVED |
| **R1-07: Session State Concurrency** | 🟠 | P3-I21 Invariant & Optimistic Concurrency Protocol | 🟢 RESOLVED |
| **R1-08: Representation Identity** | 🟠 | Mandatory 7-Tuple Projection Binding | 🟢 RESOLVED |
| **R1-09: Uncertainties Taxonomy** | 🟢 | Corrected to 5 explicit uncertainty categories | 🟢 RESOLVED |
| **R1-10: Upstream Immutability** | 🟢 | Zero Phase 2 changes verified | 🟢 RESOLVED |

🔒 **PHASE 3 IMPLEMENTATION REMAINS STRICTLY LOCKED.**
