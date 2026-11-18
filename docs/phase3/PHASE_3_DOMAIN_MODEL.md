# UADUE Phase 3 — Domain Model & Ubiquitous Language Specification
**Document ID:** `UADUE-P3-DOMAIN-003`  
**Version:** `1.0.0-SPECIFICATION`  
**Status:** `DESIGN-ONLY / IMPLEMENTATION STRICTLY LOCKED`  
**Classification:** Core Domain Modeling  

---

## 1. Ubiquitous Language & Core Terminology

To avoid semantic ambiguity across engineering teams, proctors, and reviewers, the following ubiquitous language is formally established:

| Term | Formal Definition | Immutability Class |
| :--- | :--- | :--- |
| **Canonical Assessment Package (CAP)** | The frozen, sealed assessment unit persisted in Phase 2D-8 containing questions, families, answer resolutions, and dual seals. | **Strictly Immutable** |
| **Exam Publication** | An authorized, tenancy-scoped release event of a CAP for scheduled examination. | **Append-Only** |
| **Exam Session** | An operational bounded context representing a single scheduled or active sitting by an authorized candidate. | **Stateful Operational** |
| **Session Configuration** | The immutable policy governing a session (duration, section constraints, shuffle seed, allowed aids, offline policy). | **Strictly Immutable** |
| **Exam Attempt** | The formal container capturing candidate participation, from first question view to final submission or expiry. | **Append-Only / Closed** |
| **Submission Event** | A discrete, granular action taken by a candidate (selecting an option, typing a numeric value, clearing a response, marking for review). | **Append-Only Event Stream** |
| **Submission Receipt** | A cryptographically signed server acknowledgment proving that a specific submission event was committed to the ledger. | **Strictly Immutable** |
| **Evaluation Run** | An execution of the Phase 2D-5 scoring engine against an Attempt, pinned to a specific Package and Scoring Policy version. | **Append-Only Record** |
| **Result Projection** | A candidate-facing scorecard and solution report generated from an Evaluation Run. | **Derived Projection** |
| **Corrigendum** | An official administrative adjustment to an answer key, question validity, or scoring policy applied post-examination. | **Append-Only Authority Event** |

---

## 2. Identity Concepts & Non-Timestamp Principles

> **Rule P3-ID-01 (Identity Independence):**  
> Timestamps shall NEVER be used as entity identity, primary keys, idempotency keys, or uniqueness discriminators. Timestamps are mutable, subject to clock drift, non-monotonic across distributed systems, and vulnerable to manipulation.

### Identity Standards:
1. **Durable Entities (`examSessionId`, `attemptId`, `evaluationRunId`):**
   - Format: `UUIDv7` (RFC 9562).
   - Rationale: Combines 48 bits of Unix epoch timestamp with 74 bits of cryptographically strong randomness. Provides strictly monotonic, b-tree index-friendly sorting while preventing distributed collisions.
2. **Deterministic Cryptographic Entities (`packageId`, `receiptId`, `responseFingerprint`):**
   - Format: `SHA-256` hexadecimal digest computed via RFC 8785 Canonical JSON.
   - Rationale: Deterministic, collision-resistant, reproducible across independent runtimes.
3. **Event Monotonic Identifiers (`clientSequenceNumber`, `serverSequenceNumber`):**
   - Format: Positive 64-bit unsigned integers (`BIGINT >= 1`).
   - Rationale: Client sequence numbers ensure order-of-action within an offline journal. Server sequence numbers ensure strictly serial append ordering in the relational event log.

---

## 3. Core Entity Specifications

### 3.1 Entity: `ExamSession`
Represents an authorized sitting instance.
```text
Entity ExamSession:
  examSessionId:               UUIDv7 [Primary Key]
  tenantId:                    TEXT [Non-empty]
  organizationId:              TEXT [Non-empty]
  candidateId:                 TEXT [Tenant Candidate Identifier]
  packageId:                   TEXT [References canonical_assessment_packages.package_id]
  packageIntegritySeal:        TEXT [64-char hex SHA-256]
  sessionConfigFingerprint:    TEXT [SHA-256 of SessionConfiguration]
  sessionStatus:               Enum [INITIALIZED, ACTIVE, PAUSED, SUBMITTED, EXPIRED, TERMINATED]
  allocatedDurationSeconds:    INT [Positive integer]
  remainingSeconds:            INT [Server-computed]
  sessionAuthTokenHash:        TEXT [SHA-256 of session bearer secret]
  deviceFingerprint:           TEXT [Client environment binding]
  createdAt:                   TIMESTAMPTZ
  startedAt:                   TIMESTAMPTZ [Nullable]
  completedAt:                 TIMESTAMPTZ [Nullable]
  lastHeartbeatAt:             TIMESTAMPTZ
```

### 3.2 Value Object: `SessionConfiguration`
Defines operational policies locked at session creation.
```text
Value Object SessionConfiguration:
  allowOfflineContinuation:    BOOLEAN [Default: FALSE]
  shuffleQuestions:            BOOLEAN [Default: FALSE]
  shuffleOptions:              BOOLEAN [Default: FALSE]
  deterministicSeed:           TEXT [Optional seed for pseudo-random shuffling]
  allowedLanguageScripts:      List<String> [e.g., ['LATIN', 'DEVANAGARI']]
  sectionNavigationPolicy:     Enum [FREE_NAVIGATION, STRICT_SEQUENTIAL]
  allowReviewMarking:          BOOLEAN [Default: TRUE]
  maxAllowedPauses:            INT [Default: 0]
  heartbeatIntervalSeconds:    INT [Default: 15]
```

### 3.3 Entity: `SubmissionEvent`
Append-only granular candidate response event.
```text
Entity SubmissionEvent:
  eventId:                     UUIDv7 [Primary Key]
  examSessionId:               UUIDv7 [Foreign Key -> ExamSession]
  canonicalQuestionId:         TEXT [Foreign Key -> CanonicalQuestionIR]
  clientSequenceNumber:        BIGINT [Monotonic per candidate session]
  serverSequenceNumber:        BIGINT [Monotonic per session in database]
  clientEventId:               TEXT [Client-generated UUID for idempotency]
  eventType:                   Enum [RESPONSE_RECORDED, RESPONSE_CLEARED, MARKED_FOR_REVIEW, UNMARKED_REVIEW]
  responsePayload:             CandidateResponseValue [JSONB]
  clientReportedEpochMs:       BIGINT [Client untrusted time]
  serverReceivedAt:            TIMESTAMPTZ [Server authoritative time]
  receiptSignature:            TEXT [HMAC-SHA256 signature]
```

### 3.4 Value Object: `CandidateResponseValue`
Structured representation of a student answer.
```text
Variant CandidateResponseValue:
  | SingleChoiceResponse:
      selectedOptionId:        TEXT [Option identifier from canonical representation]
      representationId:        TEXT [Representation viewed when answering]
  | MultipleChoiceResponse:
      selectedOptionIds:       List<TEXT> [Sorted deterministically]
      representationId:        TEXT
  | NumericalResponse:
      rawInputString:          TEXT [Exact string typed by student]
      normalizedDecimalValue:  TEXT [Normalized RFC 8785 representation]
  | ExtendedTextResponse:
      textPayload:             TEXT
      characterCount:          INT
```

### 3.5 Entity: `EvaluationRun`
Formal scoring event produced by Subsystem F.
```text
Entity EvaluationRun:
  evaluationRunId:             UUIDv7 [Primary Key]
  examSessionId:               UUIDv7 [Foreign Key -> ExamSession]
  packageId:                   TEXT
  packageIntegritySeal:        TEXT
  scoringPolicyVersion:        TEXT [e.g., '1.0.0']
  authorityResolutionVersion:  TEXT [e.g., 'FINAL_OFFICIAL']
  totalMarksAwarded:           DECIMAL(8,4)
  maximumPossibleMarks:        DECIMAL(8,4)
  totalQuestionsAttempted:     INT
  totalQuestionsCorrect:       INT
  totalQuestionsIncorrect:     INT
  totalQuestionsUnanswered:    INT
  evaluationStatus:            Enum [FINAL, RE_EVALUATED_SUPERSEDED]
  corrigendumEventId:          UUIDv7 [Nullable, references CorrigendumEvent]
  evaluatedAt:                 TIMESTAMPTZ
  evaluatorHmacSignature:      TEXT
```

---

## 4. Immutability & Lifecycle Classification

```text
+-----------------------+--------------------+------------------------------------------------+
| ENTITY / AGGREGATE    | MUTABILITY CLASS   | LIFECYCLE RULES                                |
+-----------------------+--------------------+------------------------------------------------+
| Canonical Package     | STRICTLY IMMUTABLE | Frozen in Phase 2D-8. No changes permitted.     |
| SessionConfiguration  | STRICTLY IMMUTABLE | Created once; immutable throughout session.    |
| SubmissionEvent       | APPEND-ONLY        | Inserts only. UPDATE / DELETE strictly blocked.|
| SubmissionReceipt     | STRICTLY IMMUTABLE | Cryptographic receipt issued upon commit.      |
| ExamAttemptSnapshot   | APPEND-ONLY        | Sealed upon session submission or expiry.      |
| EvaluationRun         | APPEND-ONLY        | Superseded only by new distinct EvaluationRun. |
| CorrigendumEvent      | APPEND-ONLY        | Authority adjustment log.                      |
| ExamSession           | STATEFUL (FSM)     | State transitions governed strictly by FSM.    |
+-----------------------+--------------------+------------------------------------------------+
```
