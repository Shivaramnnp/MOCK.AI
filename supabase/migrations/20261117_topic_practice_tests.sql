-- ==============================================================================
-- MOCK.AI — PHASE 3: TOPIC-WISE PRACTICE CLOUD PERSISTENCE & CLASSIFICATION AUDIT
-- Specification: TOPIC-PRACTICE-CLOUD-PERSISTENCE-003 (Stage 4A Remediated)
-- Target Database: Supabase Project 1 (Authentication, Sessions & Staff — oczbznehlsdmgjdzdeax)
-- Status: PREPARED FOR REVIEW — DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL
--
-- Pre-requisites required in target schema:
--   - auth.users (Supabase Auth)
--   - public.staff_roles (authoritative admin-managed staff roles table)
--   - public.is_verified_staff(UUID) (from 20261016_staff_paper_testing_centre.sql)
--
-- Security & Integrity Guarantees:
--   1. Idempotent DDL (CREATE TABLE IF NOT EXISTS, schema-qualified checks, DO $$ guards).
--   2. Zero destructive DDL (no DROP TABLE, no mutation of existing user_exam_attempts).
--   3. Immutable audit trail: no DELETE policy/grant on question_topic_classifications,
--      ON DELETE RESTRICT on audit FK, append-only mutation trigger on audit log.
--   4. Atomic staff classification decisions via SECURITY DEFINER RPC deriving
--      reviewed_by = auth.uid() and timestamps server-side with idempotency & concurrency checks.
--   5. Least-privilege explicit REVOKE/GRANT on all tables, views, and functions.
--   6. Security-invoker verified view + tightly scoped public projection RPC exposing
--      non-PII VERIFIED / REJECTED / PENDING_REVIEW / REVIEW_REQUIRED overrides only.
--   7. Tamper-resistant student_topic_practice_history (insert-only, no student UPDATE/DELETE)
--      and validated composite-keyed topic_practice_papers.
-- ==============================================================================

-- 0. Prerequisite Verification Guard (Fail fast before creating partial objects)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'staff_roles'
    ) THEN
        RAISE EXCEPTION 'PREREQUISITE_MISSING: public.staff_roles must exist before applying 20261117_topic_practice_tests.sql';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'is_verified_staff'
          AND p.pronargs = 1
    ) THEN
        RAISE EXCEPTION 'PREREQUISITE_MISSING: public.is_verified_staff(UUID) must exist (apply 20261016_staff_paper_testing_centre.sql first)';
    END IF;
END $$;

-- 1. Testing Mode Enum (Strictly Two Official Product Modes: FULL_LENGTH and TOPIC_PRACTICE)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'exam_testing_mode'
    ) THEN
        CREATE TYPE public.exam_testing_mode AS ENUM (
            'FULL_LENGTH',
            'TOPIC_PRACTICE'
        );
    END IF;
END $$;

-- Helper trigger function: authoritative server-side updated_at maintenance
CREATE OR REPLACE FUNCTION public.set_topic_practice_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- Helper trigger function: enforce immutability of completed student practice history
CREATE OR REPLACE FUNCTION public.prevent_practice_history_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_at := now();
        NEW.updated_at := now();
        IF NEW.attempted_at IS NULL THEN
            NEW.attempted_at := now();
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'IMMUTABLE_HISTORY: Completed student_topic_practice_history rows cannot be modified'
            USING ERRCODE = '42501';
    END IF;

    RETURN OLD;
END;
$$;

-- Helper trigger function: enforce append-only immutability on question_classification_audit_log
CREATE OR REPLACE FUNCTION public.prevent_classification_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'IMMUTABLE_AUDIT_LOG: question_classification_audit_log is strictly append-only and cannot be modified or deleted'
        USING ERRCODE = '42501';
END;
$$;

-- 2. Table: public.student_topic_practice_history
-- Per-session cloud persistence of submitted Topic-wise Practice attempts and topic breakdown.
-- Insert-only for authenticated students; deduplicated via UNIQUE (user_id, session_id)
-- so offline retries use ON CONFLICT DO NOTHING without overwriting completed records.
CREATE TABLE IF NOT EXISTS public.student_topic_practice_history (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id              TEXT NOT NULL CHECK (char_length(btrim(session_id)) BETWEEN 4 AND 160),
    paper_id                TEXT NOT NULL CHECK (char_length(btrim(paper_id)) BETWEEN 4 AND 160),
    exam_id                 TEXT NOT NULL CHECK (char_length(btrim(exam_id)) BETWEEN 1 AND 64),
    subject_id              TEXT NOT NULL CHECK (char_length(btrim(subject_id)) BETWEEN 1 AND 128),
    testing_mode            public.exam_testing_mode NOT NULL DEFAULT 'TOPIC_PRACTICE'
                            CHECK (testing_mode = 'TOPIC_PRACTICE'),
    selected_topic_ids      TEXT[] NOT NULL DEFAULT '{}',
    question_count          INT NOT NULL CHECK (question_count >= 1 AND question_count <= 200),
    score                   NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    max_score               NUMERIC(8, 2) NOT NULL DEFAULT 0.00 CHECK (max_score >= 0),
    accuracy                NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (accuracy >= 0 AND accuracy <= 100),
    time_spent_seconds      INT NOT NULL DEFAULT 0 CHECK (time_spent_seconds >= 0),
    topic_results           JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(topic_results) = 'object'),
    difficulty_results      JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(difficulty_results) = 'object'),
    attempted_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_student_practice_session UNIQUE (user_id, session_id)
);

ALTER TABLE public.student_topic_practice_history
    ADD COLUMN IF NOT EXISTS testing_mode public.exam_testing_mode NOT NULL DEFAULT 'TOPIC_PRACTICE';

CREATE INDEX IF NOT EXISTS idx_student_practice_history_user_exam
    ON public.student_topic_practice_history (user_id, exam_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_practice_history_subject
    ON public.student_topic_practice_history (user_id, exam_id, subject_id);

DROP TRIGGER IF EXISTS trg_student_practice_history_immutable ON public.student_topic_practice_history;
CREATE TRIGGER trg_student_practice_history_immutable
    BEFORE INSERT OR UPDATE ON public.student_topic_practice_history
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_practice_history_tampering();

-- 3. Table: public.topic_practice_papers
-- Cross-device persistence of generated synthetic Topic-wise Practice papers.
-- Collision-safe composite PK (user_id, paper_id) with strict JSONB structural & size validation.
CREATE TABLE IF NOT EXISTS public.topic_practice_papers (
    user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    paper_id                TEXT NOT NULL CHECK (paper_id ~ '^practice_[a-zA-Z0-9_-]{4,140}$'),
    exam_id                 TEXT NOT NULL CHECK (char_length(btrim(exam_id)) BETWEEN 1 AND 64),
    subject_id              TEXT NOT NULL CHECK (char_length(btrim(subject_id)) BETWEEN 1 AND 128),
    testing_mode            public.exam_testing_mode NOT NULL DEFAULT 'TOPIC_PRACTICE'
                            CHECK (testing_mode = 'TOPIC_PRACTICE'),
    selected_topic_ids      TEXT[] NOT NULL DEFAULT '{}',
    question_count          INT NOT NULL CHECK (question_count >= 1 AND question_count <= 200),
    is_untimed              BOOLEAN NOT NULL DEFAULT FALSE,
    duration_minutes        INT NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
    paper_payload           JSONB NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, paper_id),
    CONSTRAINT chk_paper_payload_valid_structure CHECK (
        jsonb_typeof(paper_payload) = 'object'
        AND paper_payload ? 'id'
        AND jsonb_typeof(paper_payload->'id') = 'string'
        AND (paper_payload->>'id') = paper_id
        AND paper_payload ? 'examId'
        AND jsonb_typeof(paper_payload->'examId') = 'string'
        AND (paper_payload->>'examId') = exam_id
        AND paper_payload ? 'title'
        AND jsonb_typeof(paper_payload->'title') = 'string'
        AND paper_payload ? 'questions'
        AND jsonb_typeof(paper_payload->'questions') = 'array'
        AND jsonb_array_length(paper_payload->'questions') >= 1
        AND jsonb_array_length(paper_payload->'questions') <= 200
        AND jsonb_array_length(paper_payload->'questions') = question_count
        AND paper_payload ? 'sections'
        AND jsonb_typeof(paper_payload->'sections') = 'array'
        AND octet_length(paper_payload::text) <= 2097152
    )
);

ALTER TABLE public.topic_practice_papers
    ADD COLUMN IF NOT EXISTS testing_mode public.exam_testing_mode NOT NULL DEFAULT 'TOPIC_PRACTICE';

CREATE INDEX IF NOT EXISTS idx_topic_practice_papers_user_recent
    ON public.topic_practice_papers (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topic_practice_papers_user_exam
    ON public.topic_practice_papers (user_id, exam_id);

DROP TRIGGER IF EXISTS trg_topic_practice_papers_updated_at ON public.topic_practice_papers;
CREATE TRIGGER trg_topic_practice_papers_updated_at
    BEFORE UPDATE ON public.topic_practice_papers
    FOR EACH ROW
    EXECUTE FUNCTION public.set_topic_practice_updated_at();

-- 4. Table: public.question_topic_classifications
-- Authoritative staff-managed question-to-topic classification catalog.
-- All mutations must go through public.staff_record_topic_classification(...).
CREATE TABLE IF NOT EXISTS public.question_topic_classifications (
    question_id             TEXT PRIMARY KEY CHECK (char_length(btrim(question_id)) BETWEEN 2 AND 160),
    exam_id                 TEXT NOT NULL CHECK (char_length(btrim(exam_id)) BETWEEN 1 AND 64),
    source_paper_id         TEXT NOT NULL CHECK (char_length(btrim(source_paper_id)) BETWEEN 1 AND 160),
    subject_id              TEXT NOT NULL CHECK (char_length(btrim(subject_id)) BETWEEN 1 AND 128),
    subject_name            TEXT NOT NULL CHECK (char_length(btrim(subject_name)) BETWEEN 1 AND 200),
    topic_id                TEXT,
    topic_name              TEXT,
    subtopic_id             TEXT,
    subtopic_name           TEXT,
    classification_status   TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    classification_source   TEXT NOT NULL DEFAULT 'STAFF',
    confidence              NUMERIC(3, 2) NOT NULL DEFAULT 1.00 CHECK (confidence >= 0 AND confidence <= 1),
    reviewed_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    review_notes            TEXT,
    verified_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_classification_status CHECK (
        classification_status IN (
            'VERIFIED',
            'PENDING_REVIEW',
            'REVIEW_REQUIRED',
            'UNCLASSIFIED',
            'UNCATEGORIZED',
            'REJECTED'
        )
    ),
    CONSTRAINT chk_classification_source CHECK (
        classification_source IN ('OFFICIAL', 'STAFF', 'RULE_BASED', 'AI_ASSISTED', 'MANUAL')
    ),
    CONSTRAINT chk_verified_requires_topic CHECK (
        classification_status <> 'VERIFIED'
        OR (topic_id IS NOT NULL AND btrim(topic_id) <> '' AND lower(btrim(topic_id)) <> 'uncategorized')
    ),
    CONSTRAINT chk_staff_verified_requires_provenance CHECK (
        classification_status <> 'VERIFIED'
        OR classification_source <> 'STAFF'
        OR (reviewed_by IS NOT NULL AND verified_at IS NOT NULL)
    ),
    CONSTRAINT chk_rejected_clears_topic CHECK (
        classification_status <> 'REJECTED'
        OR (topic_id IS NULL AND subtopic_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_question_topic_lookup
    ON public.question_topic_classifications (exam_id, subject_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_question_topic_status
    ON public.question_topic_classifications (exam_id, classification_status);
CREATE INDEX IF NOT EXISTS idx_question_topic_paper
    ON public.question_topic_classifications (source_paper_id);

DROP TRIGGER IF EXISTS trg_question_topic_classifications_updated_at ON public.question_topic_classifications;
CREATE TRIGGER trg_question_topic_classifications_updated_at
    BEFORE UPDATE ON public.question_topic_classifications
    FOR EACH ROW
    EXECUTE FUNCTION public.set_topic_practice_updated_at();

-- 5. Table: public.question_classification_audit_log
-- Strictly append-only immutable audit history of every staff classification decision.
-- FK uses ON DELETE RESTRICT (never CASCADE) so deleting a classification cannot wipe audit history.
CREATE TABLE IF NOT EXISTS public.question_classification_audit_log (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id             TEXT NOT NULL REFERENCES public.question_topic_classifications(question_id) ON DELETE RESTRICT,
    exam_id                 TEXT NOT NULL,
    source_paper_id         TEXT NOT NULL,
    subject_id              TEXT NOT NULL,
    topic_id                TEXT,
    topic_name              TEXT,
    subtopic_id             TEXT,
    subtopic_name           TEXT,
    previous_status         TEXT,
    new_status              TEXT NOT NULL,
    review_notes            TEXT,
    reviewed_by             UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    reviewed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_request_id       TEXT,
    CONSTRAINT chk_audit_previous_status CHECK (
        previous_status IS NULL OR previous_status IN (
            'VERIFIED',
            'PENDING_REVIEW',
            'REVIEW_REQUIRED',
            'UNCLASSIFIED',
            'UNCATEGORIZED',
            'REJECTED'
        )
    ),
    CONSTRAINT chk_audit_new_status CHECK (
        new_status IN (
            'VERIFIED',
            'PENDING_REVIEW',
            'REVIEW_REQUIRED',
            'UNCLASSIFIED',
            'UNCATEGORIZED',
            'REJECTED'
        )
    )
);

ALTER TABLE public.question_classification_audit_log
    ADD COLUMN IF NOT EXISTS client_request_id TEXT;

CREATE INDEX IF NOT EXISTS idx_classification_audit_question
    ON public.question_classification_audit_log (question_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_classification_audit_reviewer
    ON public.question_classification_audit_log (reviewed_by, reviewed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_classification_audit_client_request
    ON public.question_classification_audit_log (reviewed_by, client_request_id)
    WHERE client_request_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_classification_audit_immutable ON public.question_classification_audit_log;
CREATE TRIGGER trg_classification_audit_immutable
    BEFORE UPDATE OR DELETE ON public.question_classification_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_classification_audit_mutation();

-- 6. Atomic Transactional Staff Classification RPC
-- Single transactional entry point for all staff approvals, pending flags, and rejections.
-- Derives reviewer identity and timestamps exclusively on the server.
CREATE OR REPLACE FUNCTION public.staff_record_topic_classification(
    p_question_id TEXT,
    p_exam_id TEXT,
    p_source_paper_id TEXT,
    p_subject_id TEXT,
    p_subject_name TEXT,
    p_status TEXT,
    p_topic_id TEXT DEFAULT NULL,
    p_topic_name TEXT DEFAULT NULL,
    p_subtopic_id TEXT DEFAULT NULL,
    p_subtopic_name TEXT DEFAULT NULL,
    p_review_notes TEXT DEFAULT NULL,
    p_expected_updated_at TIMESTAMPTZ DEFAULT NULL,
    p_client_request_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_staff_id UUID;
    v_now TIMESTAMPTZ := now();
    v_clean_status TEXT := upper(btrim(COALESCE(p_status, '')));
    v_clean_topic_id TEXT := NULLIF(btrim(COALESCE(p_topic_id, '')), '');
    v_clean_topic_name TEXT := NULLIF(btrim(COALESCE(p_topic_name, '')), '');
    v_clean_subtopic_id TEXT := NULLIF(btrim(COALESCE(p_subtopic_id, '')), '');
    v_clean_subtopic_name TEXT := NULLIF(btrim(COALESCE(p_subtopic_name, '')), '');
    v_clean_notes TEXT := NULLIF(btrim(COALESCE(p_review_notes, '')), '');
    v_clean_request_id TEXT := NULLIF(btrim(COALESCE(p_client_request_id, '')), '');
    v_existing public.question_topic_classifications%ROWTYPE;
    v_has_existing BOOLEAN := FALSE;
    v_existing_audit RECORD;
    v_previous_status TEXT := NULL;
    v_verified_at TIMESTAMPTZ := NULL;
    v_confidence NUMERIC(3, 2) := 0.00;
    v_audit_id UUID;
BEGIN
    -- 1. Authoritative server-side caller & staff verification
    v_staff_id := auth.uid();
    IF v_staff_id IS NULL OR NOT public.is_verified_staff(v_staff_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Verified staff authorization required'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Strict input validation
    IF p_question_id IS NULL OR char_length(btrim(p_question_id)) < 2 OR char_length(btrim(p_question_id)) > 160 THEN
        RAISE EXCEPTION 'INVALID_PARAMETER: p_question_id is required (2..160 chars)' USING ERRCODE = '22023';
    END IF;
    IF p_exam_id IS NULL OR char_length(btrim(p_exam_id)) < 1 OR char_length(btrim(p_exam_id)) > 64 THEN
        RAISE EXCEPTION 'INVALID_PARAMETER: p_exam_id is required' USING ERRCODE = '22023';
    END IF;
    IF p_source_paper_id IS NULL OR char_length(btrim(p_source_paper_id)) < 1 OR char_length(btrim(p_source_paper_id)) > 160 THEN
        RAISE EXCEPTION 'INVALID_PARAMETER: p_source_paper_id is required' USING ERRCODE = '22023';
    END IF;
    IF p_subject_id IS NULL OR char_length(btrim(p_subject_id)) < 1 OR char_length(btrim(p_subject_id)) > 128 THEN
        RAISE EXCEPTION 'INVALID_PARAMETER: p_subject_id is required' USING ERRCODE = '22023';
    END IF;
    IF p_subject_name IS NULL OR char_length(btrim(p_subject_name)) < 1 OR char_length(btrim(p_subject_name)) > 200 THEN
        RAISE EXCEPTION 'INVALID_PARAMETER: p_subject_name is required' USING ERRCODE = '22023';
    END IF;
    IF v_clean_notes IS NOT NULL AND char_length(v_clean_notes) > 2000 THEN
        RAISE EXCEPTION 'INVALID_PARAMETER: p_review_notes exceeds 2000 characters' USING ERRCODE = '22023';
    END IF;
    IF v_clean_request_id IS NOT NULL AND char_length(v_clean_request_id) > 128 THEN
        RAISE EXCEPTION 'INVALID_PARAMETER: p_client_request_id exceeds 128 characters' USING ERRCODE = '22023';
    END IF;

    -- Allowed staff review target states only (cannot revert to UNCLASSIFIED/UNCATEGORIZED)
    IF v_clean_status NOT IN ('VERIFIED', 'PENDING_REVIEW', 'REVIEW_REQUIRED', 'REJECTED') THEN
        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Staff status must be VERIFIED, PENDING_REVIEW, REVIEW_REQUIRED, or REJECTED'
            USING ERRCODE = '22023';
    END IF;

    IF v_clean_status = 'VERIFIED' THEN
        IF v_clean_topic_id IS NULL OR lower(v_clean_topic_id) = 'uncategorized' THEN
            RAISE EXCEPTION 'INVALID_PARAMETER: VERIFIED classification requires a canonical topic_id'
                USING ERRCODE = '22023';
        END IF;
        v_verified_at := v_now;
        v_confidence := 1.00;
    ELSIF v_clean_status = 'REJECTED' THEN
        v_clean_topic_id := NULL;
        v_clean_topic_name := NULL;
        v_clean_subtopic_id := NULL;
        v_clean_subtopic_name := NULL;
        v_verified_at := NULL;
        v_confidence := 0.00;
    ELSE
        v_verified_at := NULL;
        v_confidence := 0.50;
    END IF;

    -- 3. Idempotent retry check (prevents duplicate audit entries on network replay)
    IF v_clean_request_id IS NOT NULL THEN
        SELECT a.id, a.question_id, a.new_status, a.reviewed_by, a.reviewed_at
        INTO v_existing_audit
        FROM public.question_classification_audit_log a
        WHERE a.reviewed_by = v_staff_id
          AND a.client_request_id = v_clean_request_id
        LIMIT 1;

        IF FOUND THEN
            IF v_existing_audit.question_id <> btrim(p_question_id) THEN
                RAISE EXCEPTION 'CONFLICT: client_request_id already used for a different question'
                    USING ERRCODE = '23505';
            END IF;

            SELECT * INTO v_existing
            FROM public.question_topic_classifications
            WHERE question_id = btrim(p_question_id);

            RETURN jsonb_build_object(
                'question_id', v_existing.question_id,
                'classification_status', v_existing.classification_status,
                'classification_source', v_existing.classification_source,
                'reviewed_by', v_existing.reviewed_by,
                'verified_at', v_existing.verified_at,
                'updated_at', v_existing.updated_at,
                'audit_id', v_existing_audit.id,
                'deduplicated', true
            );
        END IF;
    END IF;

    -- 4. Lock existing classification row & guard against stale overwrites
    SELECT *
    INTO v_existing
    FROM public.question_topic_classifications
    WHERE question_id = btrim(p_question_id)
    FOR UPDATE;

    v_has_existing := FOUND;
    IF v_has_existing THEN
        v_previous_status := v_existing.classification_status;
        IF p_expected_updated_at IS NOT NULL AND v_existing.updated_at > p_expected_updated_at THEN
            -- Use P0001 (not 40001 serialization_failure) so PostgREST returns immediately instead of retrying until timeout
            RAISE EXCEPTION 'STALE_WRITE_CONFLICT: Classification was updated more recently by another reviewer'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- 5. Atomic upsert of authoritative classification
    INSERT INTO public.question_topic_classifications (
        question_id,
        exam_id,
        source_paper_id,
        subject_id,
        subject_name,
        topic_id,
        topic_name,
        subtopic_id,
        subtopic_name,
        classification_status,
        classification_source,
        confidence,
        reviewed_by,
        review_notes,
        verified_at,
        created_at,
        updated_at
    ) VALUES (
        btrim(p_question_id),
        btrim(p_exam_id),
        btrim(p_source_paper_id),
        btrim(p_subject_id),
        btrim(p_subject_name),
        v_clean_topic_id,
        v_clean_topic_name,
        v_clean_subtopic_id,
        v_clean_subtopic_name,
        v_clean_status,
        'STAFF',
        v_confidence,
        v_staff_id,
        v_clean_notes,
        v_verified_at,
        v_now,
        v_now
    )
    ON CONFLICT (question_id) DO UPDATE SET
        exam_id = EXCLUDED.exam_id,
        source_paper_id = EXCLUDED.source_paper_id,
        subject_id = EXCLUDED.subject_id,
        subject_name = EXCLUDED.subject_name,
        topic_id = EXCLUDED.topic_id,
        topic_name = EXCLUDED.topic_name,
        subtopic_id = EXCLUDED.subtopic_id,
        subtopic_name = EXCLUDED.subtopic_name,
        classification_status = EXCLUDED.classification_status,
        classification_source = 'STAFF',
        confidence = EXCLUDED.confidence,
        reviewed_by = v_staff_id,
        review_notes = EXCLUDED.review_notes,
        verified_at = EXCLUDED.verified_at,
        updated_at = v_now;

    -- 6. Atomic append-only audit log entry (same transaction)
    INSERT INTO public.question_classification_audit_log (
        question_id,
        exam_id,
        source_paper_id,
        subject_id,
        topic_id,
        topic_name,
        subtopic_id,
        subtopic_name,
        previous_status,
        new_status,
        review_notes,
        reviewed_by,
        reviewed_at,
        client_request_id
    ) VALUES (
        btrim(p_question_id),
        btrim(p_exam_id),
        btrim(p_source_paper_id),
        btrim(p_subject_id),
        v_clean_topic_id,
        v_clean_topic_name,
        v_clean_subtopic_id,
        v_clean_subtopic_name,
        v_previous_status,
        v_clean_status,
        v_clean_notes,
        v_staff_id,
        v_now,
        v_clean_request_id
    )
    RETURNING id INTO v_audit_id;

    RETURN jsonb_build_object(
        'question_id', btrim(p_question_id),
        'classification_status', v_clean_status,
        'classification_source', 'STAFF',
        'reviewed_by', v_staff_id,
        'verified_at', v_verified_at,
        'updated_at', v_now,
        'audit_id', v_audit_id,
        'deduplicated', false
    );
END;
$$;

-- 7. Secure Public Classification Projection RPC & Security-Invoker View
-- Exposes ONLY non-PII classification fields (NEVER reviewed_by or review_notes).
-- Propagates authoritative STAFF/OFFICIAL VERIFIED, REJECTED, PENDING_REVIEW, and REVIEW_REQUIRED
-- decisions with deterministic pagination so stale local rule-based tags cannot survive rejections.
CREATE OR REPLACE FUNCTION public.get_public_topic_classifications(
    p_exam_id TEXT DEFAULT NULL,
    p_limit INT DEFAULT 1000,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    question_id TEXT,
    exam_id TEXT,
    source_paper_id TEXT,
    subject_id TEXT,
    subject_name TEXT,
    topic_id TEXT,
    topic_name TEXT,
    subtopic_id TEXT,
    subtopic_name TEXT,
    classification_status TEXT,
    classification_source TEXT,
    confidence NUMERIC(3, 2),
    verified_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT
        q.question_id,
        q.exam_id,
        q.source_paper_id,
        q.subject_id,
        q.subject_name,
        CASE WHEN q.classification_status = 'VERIFIED' THEN q.topic_id ELSE NULL END AS topic_id,
        CASE WHEN q.classification_status = 'VERIFIED' THEN q.topic_name ELSE NULL END AS topic_name,
        CASE WHEN q.classification_status = 'VERIFIED' THEN q.subtopic_id ELSE NULL END AS subtopic_id,
        CASE WHEN q.classification_status = 'VERIFIED' THEN q.subtopic_name ELSE NULL END AS subtopic_name,
        q.classification_status,
        q.classification_source,
        q.confidence,
        q.verified_at,
        q.updated_at
    FROM public.question_topic_classifications q
    WHERE (p_exam_id IS NULL OR q.exam_id = p_exam_id)
      AND q.classification_source IN ('STAFF', 'OFFICIAL')
      AND q.classification_status IN ('VERIFIED', 'REJECTED', 'PENDING_REVIEW', 'REVIEW_REQUIRED')
    ORDER BY q.question_id ASC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 1000)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- Security-invoker view (zero security_definer_view warning; respects caller RLS)
CREATE OR REPLACE VIEW public.verified_question_topic_classifications
WITH (security_invoker = true) AS
SELECT
    question_id,
    exam_id,
    source_paper_id,
    subject_id,
    subject_name,
    topic_id,
    topic_name,
    subtopic_id,
    subtopic_name,
    classification_status,
    classification_source,
    confidence,
    verified_at,
    updated_at
FROM public.question_topic_classifications
WHERE classification_status = 'VERIFIED'
  AND classification_source IN ('STAFF', 'OFFICIAL');

-- 8. Explicit Least-Privilege Grants (Never rely on RLS alone)
REVOKE ALL ON TABLE public.student_topic_practice_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.topic_practice_papers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.question_topic_classifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.question_classification_audit_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.verified_question_topic_classifications FROM PUBLIC, anon, authenticated;

-- Student-owned tables: INSERT + SELECT only (tamper-resistant; no UPDATE/DELETE via REST)
GRANT SELECT, INSERT ON TABLE public.student_topic_practice_history TO authenticated;
GRANT SELECT, INSERT ON TABLE public.topic_practice_papers TO authenticated;

-- Staff-owned tables: SELECT only via RLS; all writes MUST go through transactional RPC
GRANT SELECT ON TABLE public.question_topic_classifications TO authenticated;
GRANT SELECT ON TABLE public.question_classification_audit_log TO authenticated;
GRANT SELECT ON TABLE public.verified_question_topic_classifications TO authenticated;

-- Function execution permissions
REVOKE ALL ON FUNCTION public.set_topic_practice_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_practice_history_tampering() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_classification_audit_mutation() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.staff_record_topic_classification(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_record_topic_classification(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.get_public_topic_classifications(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_topic_classifications(TEXT, INT, INT) TO anon, authenticated;

-- 9. Row-Level Security (RLS) Policies — Strict Least-Privilege Isolation
ALTER TABLE public.student_topic_practice_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_practice_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_topic_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_classification_audit_log ENABLE ROW LEVEL SECURITY;

-- 9a. student_topic_practice_history: User-scoped SELECT and INSERT only (no UPDATE/DELETE)
DROP POLICY IF EXISTS "Students read own topic practice history" ON public.student_topic_practice_history;
CREATE POLICY "Students read own topic practice history"
    ON public.student_topic_practice_history
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Students insert own topic practice history" ON public.student_topic_practice_history;
CREATE POLICY "Students insert own topic practice history"
    ON public.student_topic_practice_history
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Students update own topic practice history" ON public.student_topic_practice_history;
DROP POLICY IF EXISTS "Students delete own topic practice history" ON public.student_topic_practice_history;

-- 9b. topic_practice_papers: User-scoped SELECT and INSERT only (immutable generated paper)
DROP POLICY IF EXISTS "Students read own topic practice papers" ON public.topic_practice_papers;
CREATE POLICY "Students read own topic practice papers"
    ON public.topic_practice_papers
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Students insert own topic practice papers" ON public.topic_practice_papers;
CREATE POLICY "Students insert own topic practice papers"
    ON public.topic_practice_papers
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Students update own topic practice papers" ON public.topic_practice_papers;
DROP POLICY IF EXISTS "Students delete own topic practice papers" ON public.topic_practice_papers;

-- 9c. question_topic_classifications: Staff-only SELECT (all writes via staff_record_topic_classification RPC; NO DELETE)
DROP POLICY IF EXISTS "Public read verified question classifications" ON public.question_topic_classifications;
DROP POLICY IF EXISTS "Staff manage question classifications" ON public.question_topic_classifications;
DROP POLICY IF EXISTS "Staff read all question classifications" ON public.question_topic_classifications;
DROP POLICY IF EXISTS "Staff insert question classifications" ON public.question_topic_classifications;
DROP POLICY IF EXISTS "Staff update question classifications" ON public.question_topic_classifications;
DROP POLICY IF EXISTS "Staff delete question classifications" ON public.question_topic_classifications;

CREATE POLICY "Staff read all question classifications"
    ON public.question_topic_classifications
    FOR SELECT
    TO authenticated
    USING (public.is_verified_staff(auth.uid()));

-- 9d. question_classification_audit_log: Staff-only SELECT (append-only inserts exclusively via RPC; NO UPDATE/DELETE)
DROP POLICY IF EXISTS "Staff read classification audit log" ON public.question_classification_audit_log;
DROP POLICY IF EXISTS "Staff insert classification audit log" ON public.question_classification_audit_log;

CREATE POLICY "Staff read classification audit log"
    ON public.question_classification_audit_log
    FOR SELECT
    TO authenticated
    USING (public.is_verified_staff(auth.uid()));
