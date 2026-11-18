# UADUE Phase 3 — Database Architecture & Relational Schema Design
**Document ID:** `UADUE-P3-DB-014`  
**Version:** `1.0.0-SPECIFICATION`  
**Status:** `DESIGN-ONLY / IMPLEMENTATION STRICTLY LOCKED`  
**Classification:** Relational Data Architecture & Storage Stratification  

---

## 1. Executive Summary & Storage Stratification

The Phase 3 database architecture strictly segregates data according to its persistence characteristics, immutability guarantees, and operational lifecycles.

**Core Principle:** *Immutable Package Truth and Operational Session State must NEVER be co-mingled in the same table.*

```mermaid
flowchart TD
    subgraph Stratum 1: Source of Truth (Phase 2D-8 Frozen)
        P1["canonical_assessment_packages<br/>(Immutable, Cryptographically Sealed)"]
        P2["canonical_package_events<br/>(Append-Only Lifecycle Ledger)"]
        P3["content_addressed_assets<br/>(Binary Storage via SHA-256)"]
    end

    subgraph Stratum 2: Operational State (Phase 3 Mutable)
        S1["exam_sessions<br/>(FSM Lifecycle, Active Leases, Timers)"]
        S2["candidate_scoring_disputes<br/>(Dispute Review, Staff Status)"]
    end

    subgraph Stratum 3: Event Stream (Phase 3 Append-Only)
        E1["candidate_submission_events<br/>(Monotonic Client/Server Sequence, Receipts)"]
    end

    subgraph Stratum 4: Derived & Evaluation (Phase 3 Immutable Projections)
        D1["exam_session_projections<br/>(Session Question/Option Layouts)"]
        D2["candidate_evaluation_runs<br/>(Scoring Runs, Scorecards, DAG Links)"]
        D3["candidate_question_scores<br/>(Item-level Marks & Penalties)"]
    end

    subgraph Stratum 5: Audit & Telemetry (Phase 3 Append-Only)
        A1["audit_events<br/>(Tamper-Evident Security Log)"]
    end

    P1 -.->|Foreign Key Read-Only| S1
    S1 -->|1 to 1 Projection| D1
    S1 -->|1 to Many Events| E1
    S1 -->|1 to Many Runs| D2
    D2 -->|1 to Many Scores| D3
```

---

## 2. Table Classification & Persistence Properties

| Table Name | Stratum / Classification | Mutability | Primary Partition Key | Retention Policy | Foreign Key Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `canonical_packages` | Source of Truth | IMMUTABLE | `tenant_id` | Permanent | Upstream Phase 2D-8 anchor. |
| `exam_sessions` | Operational State | MUTABLE (Controlled FSM) | `tenant_id` | 7 Years (Statutory) | `package_id` $\to$ `canonical_packages`. |
| `exam_session_projections`| Derived Projection | IMMUTABLE | `tenant_id` | 7 Years (Statutory) | `exam_session_id` $\to$ `exam_sessions`. |
| `candidate_submission_events` | Ingestion Event Stream | APPEND-ONLY | `tenant_id`, Hash(`exam_session_id`) | Permanent / Archived | `exam_session_id` $\to$ `exam_sessions`. |
| `candidate_evaluation_runs` | Derived Evaluation | APPEND-ONLY | `tenant_id` | Permanent | `exam_session_id` $\to$ `exam_sessions`. |
| `candidate_question_scores` | Granular Scoring | APPEND-ONLY | `tenant_id` | Permanent | `evaluation_run_id` $\to$ `candidate_evaluation_runs`. |
| `candidate_scoring_disputes`| Operational Review | MUTABLE | `tenant_id` | 7 Years | `evaluation_run_id` $\to$ `candidate_evaluation_runs`. |
| `audit_events` | Governance / Audit | APPEND-ONLY | `tenant_id`, Date(`recorded_at`) | Permanent / Cold S3 | Strict foreign key decoupling. |

---

## 3. Relational Schema Specification (DESIGN ONLY — DDL)

> [!CAUTION]
> The following SQL DDL is for **DESIGN SPECIFICATION ONLY**. No migrations, tables, or database objects are to be created during this gate.

### 3.1 Operational Session Table (`exam_sessions`)
```sql
CREATE TABLE exam_sessions (
    exam_session_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    candidate_id            UUID NOT NULL,
    package_id              UUID NOT NULL REFERENCES canonical_packages(package_id),
    package_integrity_seal  CHAR(64) NOT NULL,
    session_configuration   JSONB NOT NULL,
    session_state           VARCHAR(32) NOT NULL DEFAULT 'INITIALIZED',
    state_version           INTEGER NOT NULL DEFAULT 1,
    
    -- Active Lease Management (Single Device Enforcement)
    current_lease_id        UUID NOT NULL DEFAULT gen_random_uuid(),
    lease_heartbeat_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Authoritative Timer Governance
    scheduled_start_at      TIMESTAMPTZ NOT NULL,
    actual_started_at       TIMESTAMPTZ,
    duration_seconds        INTEGER NOT NULL,
    accumulated_pause_seconds INTEGER NOT NULL DEFAULT 0,
    pause_count             INTEGER NOT NULL DEFAULT 0,
    submitted_at            TIMESTAMPTZ,
    expired_at              TIMESTAMPTZ,
    terminated_at           TIMESTAMPTZ,
    
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_valid_state CHECK (
        session_state IN ('INITIALIZED', 'ACTIVE', 'PAUSED', 'RECOVERY_PENDING', 'SUBMITTED', 'EXPIRED', 'TERMINATED')
    ),
    CONSTRAINT uq_tenant_candidate_package UNIQUE (tenant_id, candidate_id, package_id)
);

CREATE INDEX idx_sessions_lookup ON exam_sessions (tenant_id, candidate_id, session_state);
CREATE INDEX idx_sessions_active_timers ON exam_sessions (session_state, actual_started_at) 
    WHERE session_state = 'ACTIVE';
```

### 3.2 Dedicated Session Transition Ledger (`exam_session_transitions`)
```sql
CREATE TABLE exam_session_transitions (
    transition_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_session_id         UUID NOT NULL REFERENCES exam_sessions(exam_session_id),
    transition_request_id   UUID NOT NULL,
    from_state              VARCHAR(32) NOT NULL,
    to_state                VARCHAR(32) NOT NULL,
    from_version            INTEGER NOT NULL,
    to_version              INTEGER NOT NULL,
    idempotency_hash        CHAR(64) NOT NULL, -- SHA256(canonicalJson({from_state, to_state, transition_request_id}))
    transition_receipt      JSONB NOT NULL,
    recorded_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_session_trans_req UNIQUE (exam_session_id, transition_request_id),
    CONSTRAINT uq_session_to_version UNIQUE (exam_session_id, to_version)
);

CREATE INDEX idx_transitions_session ON exam_session_transitions (exam_session_id, to_version ASC);
```

### 3.3 Session Projection Table (`exam_session_projections`)
```sql
CREATE TABLE exam_session_projections (
    projection_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_session_id         UUID NOT NULL REFERENCES exam_sessions(exam_session_id) ON DELETE CASCADE,
    tenant_id               UUID NOT NULL,
    package_id              UUID NOT NULL,
    shuffling_seed          CHAR(64) NOT NULL,
    
    -- Deterministic Layout Arrays
    question_display_order  JSONB NOT NULL, -- Array of canonicalQuestionId in display order
    option_display_order    JSONB NOT NULL, -- Map of { canonicalQuestionId: [optionId, ...] }
    default_language        VARCHAR(16) NOT NULL DEFAULT 'en',
    
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_session_projection UNIQUE (exam_session_id)
);
```

### 3.3 Candidate Submission Event Stream (`candidate_submission_events`)
```sql
CREATE TABLE candidate_submission_events (
    event_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_session_id         UUID NOT NULL REFERENCES exam_sessions(exam_session_id),
    tenant_id               UUID NOT NULL,
    canonical_question_id   UUID NOT NULL,
    package_id              UUID NOT NULL,
    package_integrity_seal  CHAR(64) NOT NULL,
    
    -- Monotonic Sequences
    client_sequence_number  BIGINT NOT NULL,
    server_sequence_number  BIGSERIAL NOT NULL,
    
    -- Identification & Payload
    client_event_id         UUID NOT NULL,
    event_type              VARCHAR(32) NOT NULL,
    candidate_response      JSONB NOT NULL,
    response_fingerprint    CHAR(64) NOT NULL, -- SHA256(canonical_json(candidate_response))
    
    -- Receipt Signature
    receipt_id              UUID NOT NULL,
    server_signature        TEXT NOT NULL,
    
    client_timestamp        TIMESTAMPTZ NOT NULL,
    server_timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Strict Idempotency Key (Advisory client sequence is NOT unique in database)
    CONSTRAINT uq_session_client_event UNIQUE (exam_session_id, client_event_id)
);

CREATE INDEX idx_submissions_session_order ON candidate_submission_events (exam_session_id, server_sequence_number ASC);
CREATE INDEX idx_submissions_server_ledger ON candidate_submission_events (tenant_id, server_sequence_number ASC);
```

### 3.4 Server-Authoritative Question State Table (`candidate_question_states`)
```sql
CREATE TABLE candidate_question_states (
    state_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_session_id         UUID NOT NULL REFERENCES exam_sessions(exam_session_id),
    tenant_id               UUID NOT NULL,
    canonical_question_id   UUID NOT NULL,
    current_state_version   INTEGER NOT NULL DEFAULT 0,
    selected_option_id      UUID,
    response_payload        JSONB,
    payload_fingerprint     CHAR(64),
    last_server_sequence    BIGINT NOT NULL REFERENCES candidate_submission_events(server_sequence_number),
    last_client_event_id    UUID NOT NULL,
    is_answered             BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_session_question_state UNIQUE (exam_session_id, canonical_question_id)
);

CREATE INDEX idx_question_states_session ON candidate_question_states (exam_session_id);
```

### 3.4 Append-Only Evaluation Runs Table (`candidate_evaluation_runs`)
```sql
CREATE TABLE candidate_evaluation_runs (
    evaluation_run_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_session_id         UUID NOT NULL REFERENCES exam_sessions(exam_session_id),
    tenant_id               UUID NOT NULL,
    package_id              UUID NOT NULL,
    package_integrity_seal  CHAR(64) NOT NULL,
    
    scoring_policy_version  VARCHAR(32) NOT NULL,
    answer_key_version      VARCHAR(32) NOT NULL,
    run_iteration           INTEGER NOT NULL DEFAULT 1,
    supersedes_run_id       UUID REFERENCES candidate_evaluation_runs(evaluation_run_id),
    
    total_raw_score         NUMERIC(8,4) NOT NULL,
    total_normalized_score  NUMERIC(8,4),
    questions_attempted     INTEGER NOT NULL,
    questions_correct       INTEGER NOT NULL,
    questions_incorrect     INTEGER NOT NULL,
    questions_unanswered    INTEGER NOT NULL,
    
    evaluation_signature    CHAR(64) NOT NULL, -- SHA256 of complete run output
    evaluated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_session_run_iteration UNIQUE (exam_session_id, run_iteration)
);

CREATE INDEX idx_evaluations_session ON candidate_evaluation_runs (exam_session_id, run_iteration DESC);
```

---

## 4. Transaction Boundaries & Concurrency Rules

1. **Submission Ingestion Transaction:**
   - Isolation Level: `READ COMMITTED`.
   - Actions: Verify session state and active lease $\to$ Insert into `candidate_submission_events` $\to$ Compute receipt hash $\to$ Commit.
   - If unique constraint violation on `(exam_session_id, client_event_id)`: Catch exception, return existing receipt without aborting.
2. **Session Termination Transaction:**
   - Isolation Level: `REPEATABLE READ`.
   - Actions: `SELECT * FROM exam_sessions WHERE exam_session_id = $1 FOR UPDATE` $\to$ Verify session is `ACTIVE` $\to$ Update `session_state = 'SUBMITTED', submitted_at = NOW()` $\to$ Commit.
3. **Scoring Evaluation Transaction:**
   - Isolation Level: `READ COMMITTED`.
   - Actions: Insert into `candidate_evaluation_runs` $\to$ Insert all rows into `candidate_question_scores` $\to$ Commit.

---

## 5. Prohibitions & Anti-Patterns

1. **PROHIBITION P3-DB01:** No operational code may perform `UPDATE` or `DELETE` on `candidate_submission_events` or `candidate_evaluation_runs`.
2. **PROHIBITION P3-DB02:** Tables must never use auto-incrementing serial integers as public primary keys.
3. **PROHIBITION P3-DB03:** Do not execute cross-tenant joins or queries without setting `app.current_tenant_id`.
