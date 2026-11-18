-- ==============================================================================
-- MOCK.AI — UADUE PHASE 3.1 DATABASE FOUNDATION MIGRATION
-- Specification: UADUE-P3-HARD-R3-001 (R3 Final Hardened Contract)
-- Purpose: Real PostgreSQL relational schema, lifecycle tables, immutability triggers,
--          indexes, and Row-Level Security (RLS) for Phase 3 Operational Delivery.
-- ==============================================================================

-- 1. Ensure immutability trigger function exists
CREATE OR REPLACE FUNCTION uadue_prevent_record_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'UADUE Immutability Violation: In-place % operation is forbidden on table %.', TG_OP, TG_TABLE_NAME
        USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

-- 2. Table: exam_sessions (Operational session FSM & lease authority)
CREATE TABLE IF NOT EXISTS public.exam_sessions (
    exam_session_id         TEXT PRIMARY KEY,
    tenant_id               TEXT NOT NULL,
    candidate_id            TEXT NOT NULL,
    package_id              TEXT NOT NULL REFERENCES public.canonical_assessment_packages(package_id) ON DELETE RESTRICT,
    package_integrity_seal  TEXT NOT NULL,
    session_configuration   JSONB NOT NULL DEFAULT '{}'::jsonb,
    session_state           TEXT NOT NULL DEFAULT 'INITIALIZED',
    state_version           INT NOT NULL DEFAULT 1,
    current_lease_id        TEXT NOT NULL,
    lease_heartbeat_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    scheduled_start_at      TIMESTAMPTZ NOT NULL,
    actual_started_at       TIMESTAMPTZ,
    duration_seconds        INT NOT NULL,
    accumulated_pause_seconds INT NOT NULL DEFAULT 0,
    pause_count             INT NOT NULL DEFAULT 0,
    submitted_at            TIMESTAMPTZ,
    expired_at              TIMESTAMPTZ,
    terminated_at           TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_session_state CHECK (
        session_state IN ('INITIALIZED', 'ACTIVE', 'PAUSED', 'RECOVERY_PENDING', 'SUBMITTED', 'EXPIRED', 'TERMINATED')
    ),
    CONSTRAINT chk_session_duration_pos CHECK (duration_seconds > 0),
    CONSTRAINT uq_tenant_candidate_package UNIQUE (tenant_id, candidate_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_lookup ON public.exam_sessions (tenant_id, candidate_id, session_state);
CREATE INDEX IF NOT EXISTS idx_sessions_active_timers ON public.exam_sessions (session_state, actual_started_at) 
    WHERE session_state = 'ACTIVE';

-- 3. Table: exam_session_transitions (Dedicated idempotent transition ledger)
CREATE TABLE IF NOT EXISTS public.exam_session_transitions (
    transition_id           TEXT PRIMARY KEY,
    exam_session_id         TEXT NOT NULL REFERENCES public.exam_sessions(exam_session_id) ON DELETE RESTRICT,
    tenant_id               TEXT NOT NULL,
    transition_request_id   TEXT NOT NULL,
    from_state              TEXT NOT NULL,
    to_state                TEXT NOT NULL,
    from_version            INT NOT NULL,
    to_version              INT NOT NULL,
    idempotency_hash        TEXT NOT NULL,
    transition_receipt      JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_session_trans_req UNIQUE (exam_session_id, transition_request_id),
    CONSTRAINT uq_session_to_version UNIQUE (exam_session_id, to_version)
);

CREATE INDEX IF NOT EXISTS idx_transitions_session ON public.exam_session_transitions (exam_session_id, to_version ASC);

DROP TRIGGER IF EXISTS trg_session_transitions_immutable ON public.exam_session_transitions;
CREATE TRIGGER trg_session_transitions_immutable
    BEFORE UPDATE OR DELETE ON public.exam_session_transitions
    FOR EACH ROW
    EXECUTE FUNCTION uadue_prevent_record_mutation();

-- 4. Table: exam_session_projections (Deterministic session layout mappings)
CREATE TABLE IF NOT EXISTS public.exam_session_projections (
    projection_id                   TEXT PRIMARY KEY,
    exam_session_id                 TEXT NOT NULL REFERENCES public.exam_sessions(exam_session_id) ON DELETE RESTRICT,
    tenant_id                       TEXT NOT NULL,
    package_id                      TEXT NOT NULL,
    shuffling_seed                  TEXT NOT NULL,
    presentation_manifest_integrity TEXT NOT NULL,
    question_display_order          JSONB NOT NULL DEFAULT '[]'::jsonb,
    option_display_order            JSONB NOT NULL DEFAULT '{}'::jsonb,
    default_language                TEXT NOT NULL DEFAULT 'en',
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_session_projection UNIQUE (exam_session_id)
);

-- 5. Table: candidate_submission_events (Append-only raw interaction event stream)
CREATE TABLE IF NOT EXISTS public.candidate_submission_events (
    event_id                TEXT PRIMARY KEY,
    exam_session_id         TEXT NOT NULL REFERENCES public.exam_sessions(exam_session_id) ON DELETE RESTRICT,
    tenant_id               TEXT NOT NULL,
    canonical_question_id   TEXT NOT NULL,
    representation_id       TEXT NOT NULL,
    package_id              TEXT NOT NULL,
    package_integrity_seal  TEXT NOT NULL,
    client_sequence_number  BIGINT NOT NULL,
    server_sequence_number  BIGSERIAL NOT NULL,
    client_event_id         TEXT NOT NULL,
    event_type              TEXT NOT NULL,
    candidate_response      JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_fingerprint    TEXT NOT NULL,
    receipt_id              TEXT NOT NULL,
    server_signature        TEXT NOT NULL,
    client_timestamp        TIMESTAMPTZ NOT NULL,
    server_timestamp        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_submission_client_event UNIQUE (exam_session_id, client_event_id),
    CONSTRAINT uq_submission_server_seq UNIQUE (server_sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_submissions_session_server ON public.candidate_submission_events (exam_session_id, server_sequence_number ASC);
CREATE INDEX IF NOT EXISTS idx_submissions_tenant_server ON public.candidate_submission_events (tenant_id, server_sequence_number ASC);

DROP TRIGGER IF EXISTS trg_submission_events_immutable ON public.candidate_submission_events;
CREATE TRIGGER trg_submission_events_immutable
    BEFORE UPDATE OR DELETE ON public.candidate_submission_events
    FOR EACH ROW
    EXECUTE FUNCTION uadue_prevent_record_mutation();

-- 6. Table: candidate_question_states (Server-authoritative operational question state)
CREATE TABLE IF NOT EXISTS public.candidate_question_states (
    state_id                TEXT PRIMARY KEY,
    exam_session_id         TEXT NOT NULL REFERENCES public.exam_sessions(exam_session_id) ON DELETE RESTRICT,
    tenant_id               TEXT NOT NULL,
    canonical_question_id   TEXT NOT NULL,
    current_state_version   INT NOT NULL DEFAULT 0,
    selected_option_id      TEXT,
    response_payload        JSONB,
    payload_fingerprint     TEXT,
    last_server_sequence    BIGINT NOT NULL REFERENCES public.candidate_submission_events(server_sequence_number) ON DELETE RESTRICT,
    last_client_event_id    TEXT NOT NULL,
    is_answered             BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_session_question_state UNIQUE (exam_session_id, canonical_question_id)
);

CREATE INDEX IF NOT EXISTS idx_question_states_lookup ON public.candidate_question_states (exam_session_id, canonical_question_id);

-- 7. Table: candidate_evaluation_runs (Append-only scorecard runs)
CREATE TABLE IF NOT EXISTS public.candidate_evaluation_runs (
    evaluation_run_id           TEXT PRIMARY KEY,
    exam_session_id             TEXT NOT NULL REFERENCES public.exam_sessions(exam_session_id) ON DELETE RESTRICT,
    tenant_id                   TEXT NOT NULL,
    package_id                  TEXT NOT NULL,
    package_integrity_seal      TEXT NOT NULL,
    scoring_policy_version      TEXT NOT NULL,
    answer_key_version          TEXT NOT NULL,
    evaluation_contract_tuple   JSONB NOT NULL DEFAULT '{}'::jsonb,
    run_iteration               INT NOT NULL DEFAULT 1,
    supersedes_run_id           TEXT REFERENCES public.candidate_evaluation_runs(evaluation_run_id) ON DELETE RESTRICT,
    total_raw_score             NUMERIC(8,4) NOT NULL,
    total_normalized_score      NUMERIC(8,4),
    questions_attempted         INT NOT NULL,
    questions_correct           INT NOT NULL,
    questions_incorrect         INT NOT NULL,
    questions_unanswered        INT NOT NULL,
    evaluation_signature        TEXT NOT NULL,
    evaluated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_session_run_iteration UNIQUE (exam_session_id, run_iteration)
);

CREATE INDEX IF NOT EXISTS idx_evaluations_session_iter ON public.candidate_evaluation_runs (exam_session_id, run_iteration DESC);

DROP TRIGGER IF EXISTS trg_evaluations_immutable ON public.candidate_evaluation_runs;
CREATE TRIGGER trg_evaluations_immutable
    BEFORE UPDATE OR DELETE ON public.candidate_evaluation_runs
    FOR EACH ROW
    EXECUTE FUNCTION uadue_prevent_record_mutation();

-- 8. Table: candidate_question_scores (Granular item scores per evaluation run)
CREATE TABLE IF NOT EXISTS public.candidate_question_scores (
    question_score_id       TEXT PRIMARY KEY,
    evaluation_run_id       TEXT NOT NULL REFERENCES public.candidate_evaluation_runs(evaluation_run_id) ON DELETE RESTRICT,
    tenant_id               TEXT NOT NULL,
    canonical_question_id   TEXT NOT NULL,
    candidate_response_raw  JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolved_correct_key    JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_correct              BOOLEAN NOT NULL DEFAULT FALSE,
    is_partially_correct    BOOLEAN NOT NULL DEFAULT FALSE,
    marks_awarded           NUMERIC(6,4) NOT NULL DEFAULT 0.0000,
    penalty_deducted        NUMERIC(6,4) NOT NULL DEFAULT 0.0000,
    net_score               NUMERIC(6,4) NOT NULL DEFAULT 0.0000,
    disposition             TEXT NOT NULL DEFAULT 'NORMAL',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_scores_eval ON public.candidate_question_scores (evaluation_run_id, canonical_question_id);

DROP TRIGGER IF EXISTS trg_question_scores_immutable ON public.candidate_question_scores;
CREATE TRIGGER trg_question_scores_immutable
    BEFORE UPDATE OR DELETE ON public.candidate_question_scores
    FOR EACH ROW
    EXECUTE FUNCTION uadue_prevent_record_mutation();

-- 9. Table: candidate_scoring_disputes (Operational candidate appeals)
CREATE TABLE IF NOT EXISTS public.candidate_scoring_disputes (
    dispute_id              TEXT PRIMARY KEY,
    exam_session_id         TEXT NOT NULL REFERENCES public.exam_sessions(exam_session_id) ON DELETE RESTRICT,
    tenant_id               TEXT NOT NULL,
    candidate_id            TEXT NOT NULL,
    canonical_question_id   TEXT NOT NULL,
    evaluation_run_id       TEXT NOT NULL REFERENCES public.candidate_evaluation_runs(evaluation_run_id) ON DELETE RESTRICT,
    dispute_reason          TEXT NOT NULL,
    dispute_status          TEXT NOT NULL DEFAULT 'PENDING',
    resolution_notes        TEXT,
    resolved_by             TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_disputes_session ON public.candidate_scoring_disputes (exam_session_id, canonical_question_id);

-- 10. Table: audit_events (Governance & tamper-evident audit log)
CREATE TABLE IF NOT EXISTS public.audit_events (
    audit_event_id          TEXT PRIMARY KEY,
    tenant_id               TEXT NOT NULL,
    event_type              TEXT NOT NULL,
    severity                TEXT NOT NULL,
    actor_type              TEXT NOT NULL,
    actor_id                TEXT NOT NULL,
    resource_type           TEXT NOT NULL,
    resource_id             TEXT NOT NULL,
    event_payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON public.audit_events (tenant_id, recorded_at DESC);

DROP TRIGGER IF EXISTS trg_audit_events_immutable ON public.audit_events;
CREATE TRIGGER trg_audit_events_immutable
    BEFORE UPDATE OR DELETE ON public.audit_events
    FOR EACH ROW
    EXECUTE FUNCTION uadue_prevent_record_mutation();

ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_session_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_session_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_submission_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_question_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_evaluation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_question_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_scoring_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.exam_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.exam_session_transitions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.exam_session_projections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_submission_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_question_states FORCE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_evaluation_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_question_scores FORCE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_scoring_disputes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;

-- Standard tenant isolation policies
DROP POLICY IF EXISTS p3_tenant_exam_sessions ON public.exam_sessions;
CREATE POLICY p3_tenant_exam_sessions ON public.exam_sessions
    FOR ALL USING (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true))
    WITH CHECK (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS p3_tenant_session_transitions ON public.exam_session_transitions;
CREATE POLICY p3_tenant_session_transitions ON public.exam_session_transitions
    FOR ALL USING (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true))
    WITH CHECK (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS p3_tenant_session_projections ON public.exam_session_projections;
CREATE POLICY p3_tenant_session_projections ON public.exam_session_projections
    FOR ALL USING (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true))
    WITH CHECK (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS p3_tenant_submission_events ON public.candidate_submission_events;
CREATE POLICY p3_tenant_submission_events ON public.candidate_submission_events
    FOR ALL USING (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true))
    WITH CHECK (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS p3_tenant_question_states ON public.candidate_question_states;
CREATE POLICY p3_tenant_question_states ON public.candidate_question_states
    FOR ALL USING (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true))
    WITH CHECK (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS p3_tenant_evaluation_runs ON public.candidate_evaluation_runs;
CREATE POLICY p3_tenant_evaluation_runs ON public.candidate_evaluation_runs
    FOR ALL USING (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true))
    WITH CHECK (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS p3_tenant_question_scores ON public.candidate_question_scores;
CREATE POLICY p3_tenant_question_scores ON public.candidate_question_scores
    FOR ALL USING (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true))
    WITH CHECK (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS p3_tenant_scoring_disputes ON public.candidate_scoring_disputes;
CREATE POLICY p3_tenant_scoring_disputes ON public.candidate_scoring_disputes
    FOR ALL USING (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true))
    WITH CHECK (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS p3_tenant_audit_events ON public.audit_events;
CREATE POLICY p3_tenant_audit_events ON public.audit_events
    FOR ALL USING (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true))
    WITH CHECK (uadue_is_service_role() OR tenant_id = current_setting('app.current_tenant_id', true));

-- 12. Permissions for non-superuser application role
GRANT USAGE ON SCHEMA public TO uadue_app_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO uadue_app_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO uadue_app_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO uadue_app_user;
