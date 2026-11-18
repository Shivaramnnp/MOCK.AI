-- ==============================================================================
-- MOCK.AI — STAGE 1: STAFF PAPER TESTING CENTRE & DEFECT TRACKING MIGRATION
-- Specification: STAGE1-STAFF-PAPER-TESTING-001
-- Target Database: Supabase Project 1 (Authentication & Staff — oczbznehlsdmgjdzdeax)
-- Purpose:
--   1. Create staff_paper_testing_sessions to track staff testing progress per exam paper.
--   2. Create staff_question_defects for rigorous logging of question defects, evidence,
--      question snapshots, and status tracking for future repair worker consumption.
--   3. Apply Row-Level Security (RLS) restricting all access exclusively to verified staff,
--      enforcing per-staff session ownership so reviewers cannot overwrite peers.
--   4. Apply partial unique index for active duplicate suppression without blocking
--      subsequent legitimate reports after an earlier defect is resolved.
--   5. Expose Security Definer RPC with strict input validation, collision-safe ID
--      generation, and search_path isolation.
-- Status: PREPARED ONLY — REQUIRES MANUAL APPLICATION TO HOSTED SUPABASE (PROJECT 1)
-- ==============================================================================

-- 1. Helper function: verify staff privileges server-side
CREATE OR REPLACE FUNCTION public.is_verified_staff(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_is_staff BOOLEAN;
BEGIN
    IF check_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check authoritative staff_roles table (tamper-proof, admin-granted only)
    SELECT EXISTS (
        SELECT 1 FROM public.staff_roles
        WHERE user_id = check_user_id
          AND role IN ('ADMIN', 'SUPER_ADMIN', 'STAFF', 'MODERATOR', 'CONTENT_REVIEWER')
    ) INTO v_is_staff;

    RETURN coalesce(v_is_staff, false);
END;
$$;

-- 2. Table: staff_paper_testing_sessions
CREATE TABLE IF NOT EXISTS public.staff_paper_testing_sessions (
    session_id              TEXT PRIMARY KEY,
    paper_id                TEXT NOT NULL,
    paper_name              TEXT NOT NULL,
    exam_id                 TEXT NOT NULL,
    staff_id                TEXT NOT NULL,
    current_question_index  INT NOT NULL DEFAULT 0,
    tested_question_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
    question_reviews        JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_questions         INT NOT NULL DEFAULT 0,
    tested_count            INT NOT NULL DEFAULT 0,
    defects_count           INT NOT NULL DEFAULT 0,
    status                  TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_testing_session_status CHECK (
        status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'HAS_DEFECTS')
    ),
    CONSTRAINT uq_staff_paper_session UNIQUE (paper_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_testing_sessions_paper ON public.staff_paper_testing_sessions(paper_id);
CREATE INDEX IF NOT EXISTS idx_testing_sessions_staff ON public.staff_paper_testing_sessions(staff_id);
CREATE INDEX IF NOT EXISTS idx_testing_sessions_status ON public.staff_paper_testing_sessions(status);

-- 3. Table: staff_question_defects
CREATE TABLE IF NOT EXISTS public.staff_question_defects (
    defect_id               TEXT PRIMARY KEY,
    paper_id                TEXT NOT NULL,
    question_id             TEXT NOT NULL,
    question_number         INT NOT NULL,
    reporting_staff_id      TEXT NOT NULL,
    reporting_staff_email   TEXT,
    defect_category         TEXT NOT NULL,
    defect_description      TEXT NOT NULL,
    evidence_reference      TEXT,
    staff_notes             TEXT,
    question_snapshot       JSONB NOT NULL DEFAULT '{}'::jsonb,
    question_fingerprint    TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'reported',
    repair_history          JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_defect_category CHECK (
        defect_category IN (
            'INCORRECT_OR_INCOMPLETE_QUESTION',
            'MISSING_OR_INCORRECT_OPTION',
            'INCORRECT_ANSWER_KEY',
            'INCORRECT_EXPLANATION',
            'MATHEMATICAL_OR_FORMULA_ERROR',
            'CORRUPTED_LANGUAGE_OR_TEXT',
            'MISSING_OR_INCORRECT_IMAGE_DIAGRAM',
            'DUPLICATE_QUESTION',
            'SOURCE_MISMATCH',
            'RENDERING_OR_NAVIGATION_PROBLEM',
            'OTHER'
        )
    ),
    CONSTRAINT chk_defect_status CHECK (
        status IN (
            'reported',
            'queued_for_repair',
            'repair_in_progress',
            'fix_prepared',
            'validation_failed',
            'ready_for_staff_review',
            'approved',
            'rejected',
            'repair_blocked'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_defects_paper ON public.staff_question_defects(paper_id);
CREATE INDEX IF NOT EXISTS idx_defects_question ON public.staff_question_defects(question_id);
CREATE INDEX IF NOT EXISTS idx_defects_status ON public.staff_question_defects(status);
CREATE INDEX IF NOT EXISTS idx_defects_category ON public.staff_question_defects(defect_category);

-- Remove old rigid table-level unique constraint if it was created in a previous run
ALTER TABLE public.staff_question_defects DROP CONSTRAINT IF EXISTS uq_active_defect_question;

-- Partial unique index for active duplicate suppression:
-- Only blocks concurrent/duplicate active reports on the same question in the same category.
-- Once an earlier defect is resolved (approved, rejected, fixed), new reports are safely permitted.
DROP INDEX IF EXISTS public.uq_active_defect_per_category;
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_defect_per_category
ON public.staff_question_defects (paper_id, question_id, defect_category)
WHERE status IN ('reported', 'queued_for_repair', 'repair_in_progress', 'fix_prepared', 'validation_failed', 'ready_for_staff_review');

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.staff_paper_testing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_question_defects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (ensures idempotent repeatable execution)
DROP POLICY IF EXISTS "Staff read paper testing sessions" ON public.staff_paper_testing_sessions;
DROP POLICY IF EXISTS "Staff insert/update paper testing sessions" ON public.staff_paper_testing_sessions;
DROP POLICY IF EXISTS "Staff write own paper testing sessions" ON public.staff_paper_testing_sessions;
DROP POLICY IF EXISTS "Staff insert own paper testing sessions" ON public.staff_paper_testing_sessions;
DROP POLICY IF EXISTS "Staff update own paper testing sessions" ON public.staff_paper_testing_sessions;
DROP POLICY IF EXISTS "Staff delete own paper testing sessions" ON public.staff_paper_testing_sessions;

DROP POLICY IF EXISTS "Staff read question defects" ON public.staff_question_defects;
DROP POLICY IF EXISTS "Staff insert/update question defects" ON public.staff_question_defects;
DROP POLICY IF EXISTS "Staff write own question defects" ON public.staff_question_defects;
DROP POLICY IF EXISTS "Staff insert question defects" ON public.staff_question_defects;
DROP POLICY IF EXISTS "Staff update question defects" ON public.staff_question_defects;

-- Restrictive RLS for Sessions:
-- 1. All verified staff can read any testing session (for team dashboards and oversight)
CREATE POLICY "Staff read paper testing sessions"
    ON public.staff_paper_testing_sessions
    FOR SELECT
    USING (public.is_verified_staff());

-- 2. Staff members can only insert their OWN testing sessions (ownership enforced)
CREATE POLICY "Staff insert own paper testing sessions"
    ON public.staff_paper_testing_sessions
    FOR INSERT
    WITH CHECK (public.is_verified_staff() AND staff_id = auth.uid()::text);

-- 3. Staff members can only update their OWN testing sessions (cannot overwrite peers)
CREATE POLICY "Staff update own paper testing sessions"
    ON public.staff_paper_testing_sessions
    FOR UPDATE
    USING (public.is_verified_staff() AND staff_id = auth.uid()::text)
    WITH CHECK (public.is_verified_staff() AND staff_id = auth.uid()::text);

-- 4. Staff members can only delete their OWN testing sessions
CREATE POLICY "Staff delete own paper testing sessions"
    ON public.staff_paper_testing_sessions
    FOR DELETE
    USING (public.is_verified_staff() AND staff_id = auth.uid()::text);

-- Restrictive RLS for Question Defects:
-- 1. All verified staff can view reported defects
CREATE POLICY "Staff read question defects"
    ON public.staff_question_defects
    FOR SELECT
    USING (public.is_verified_staff());

-- 2. Verified staff can insert defect reports, bound to their own reporting_staff_id
CREATE POLICY "Staff insert question defects"
    ON public.staff_question_defects
    FOR INSERT
    WITH CHECK (public.is_verified_staff() AND reporting_staff_id = auth.uid()::text);

-- 3. Verified staff can update defects (triage, status transitions, repair history)
CREATE POLICY "Staff update question defects"
    ON public.staff_question_defects
    FOR UPDATE
    USING (public.is_verified_staff())
    WITH CHECK (public.is_verified_staff());

-- 5. Security Definer RPC: Report Defect with strict validation & collision-proof ID
CREATE OR REPLACE FUNCTION public.staff_report_question_defect(
    p_paper_id              TEXT,
    p_question_id           TEXT,
    p_question_number       INT,
    p_defect_category       TEXT,
    p_defect_description    TEXT,
    p_evidence_reference    TEXT DEFAULT NULL,
    p_staff_notes           TEXT DEFAULT NULL,
    p_question_snapshot     JSONB DEFAULT '{}'::jsonb,
    p_question_fingerprint  TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_staff_id UUID;
    v_staff_email TEXT;
    v_defect_id TEXT;
    v_existing_id TEXT;
    v_trimmed_desc TEXT;
    v_clean_paper_id TEXT;
    v_clean_question_id TEXT;
BEGIN
    -- 1. Authorization: Verify caller identity against authoritative staff_roles
    v_staff_id := auth.uid();
    IF v_staff_id IS NULL OR NOT public.is_verified_staff(v_staff_id) THEN
        RAISE EXCEPTION '403 Forbidden: Caller lacks verified staff permissions.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Strict Input Validation
    v_clean_paper_id := trim(coalesce(p_paper_id, ''));
    v_clean_question_id := trim(coalesce(p_question_id, ''));
    v_trimmed_desc := trim(coalesce(p_defect_description, ''));

    IF length(v_clean_paper_id) < 3 OR length(v_clean_paper_id) > 120 THEN
        RAISE EXCEPTION 'Invalid paper_id: Must be between 3 and 120 characters.'
            USING ERRCODE = '22023';
    END IF;

    IF length(v_clean_question_id) < 3 OR length(v_clean_question_id) > 120 THEN
        RAISE EXCEPTION 'Invalid question_id: Must be between 3 and 120 characters.'
            USING ERRCODE = '22023';
    END IF;

    IF p_question_number IS NULL OR p_question_number < 1 OR p_question_number > 500 THEN
        RAISE EXCEPTION 'Invalid question_number: Must be an integer between 1 and 500.'
            USING ERRCODE = '22023';
    END IF;

    IF p_defect_category NOT IN (
        'INCORRECT_OR_INCOMPLETE_QUESTION',
        'MISSING_OR_INCORRECT_OPTION',
        'INCORRECT_ANSWER_KEY',
        'INCORRECT_EXPLANATION',
        'MATHEMATICAL_OR_FORMULA_ERROR',
        'CORRUPTED_LANGUAGE_OR_TEXT',
        'MISSING_OR_INCORRECT_IMAGE_DIAGRAM',
        'DUPLICATE_QUESTION',
        'SOURCE_MISMATCH',
        'RENDERING_OR_NAVIGATION_PROBLEM',
        'OTHER'
    ) THEN
        RAISE EXCEPTION 'Invalid defect_category: "%" is not a recognized category.', p_defect_category
            USING ERRCODE = '22023';
    END IF;

    IF length(v_trimmed_desc) < 5 OR length(v_trimmed_desc) > 5000 THEN
        RAISE EXCEPTION 'Invalid defect_description: Must be between 5 and 5000 characters.'
            USING ERRCODE = '22023';
    END IF;

    IF p_evidence_reference IS NOT NULL AND length(trim(p_evidence_reference)) > 1000 THEN
        RAISE EXCEPTION 'Invalid evidence_reference: Exceeds 1000 characters.'
            USING ERRCODE = '22023';
    END IF;

    IF p_staff_notes IS NOT NULL AND length(trim(p_staff_notes)) > 5000 THEN
        RAISE EXCEPTION 'Invalid staff_notes: Exceeds 5000 characters.'
            USING ERRCODE = '22023';
    END IF;

    IF p_question_snapshot IS NULL OR jsonb_typeof(p_question_snapshot) != 'object' THEN
        RAISE EXCEPTION 'Invalid question_snapshot: Must be a non-null JSON object.'
            USING ERRCODE = '22023';
    END IF;

    IF p_question_fingerprint IS NOT NULL AND length(trim(p_question_fingerprint)) > 200 THEN
        RAISE EXCEPTION 'Invalid question_fingerprint: Exceeds 200 characters.'
            USING ERRCODE = '22023';
    END IF;

    -- Retrieve caller's verified email from auth.users or profiles
    SELECT email INTO v_staff_email FROM auth.users WHERE id = v_staff_id;
    IF v_staff_email IS NULL THEN
        SELECT email INTO v_staff_email FROM public.profiles WHERE id = v_staff_id;
    END IF;

    -- 3. Duplicate Prevention: Check for existing OPEN defect on same paper, question, category
    SELECT defect_id INTO v_existing_id
    FROM public.staff_question_defects
    WHERE paper_id = v_clean_paper_id
      AND question_id = v_clean_question_id
      AND defect_category = p_defect_category
      AND status IN ('reported', 'queued_for_repair', 'repair_in_progress', 'fix_prepared', 'validation_failed', 'ready_for_staff_review')
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'duplicate', true,
            'defect_id', v_existing_id,
            'message', 'An active defect report for this category already exists on this question (' || v_existing_id || ').'
        );
    END IF;

    -- 4. Collision-Proof Defect ID: includes epoch ms + cryptographic random token
    v_defect_id := 'defect_' || v_clean_paper_id || '_q' || p_question_number || '_' ||
                   to_char(now(), 'YYYYMMDD_HH24MISS') || '_' ||
                   substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8);

    -- 5. Insert Defect Record (with atomic race condition recovery)
    BEGIN
        INSERT INTO public.staff_question_defects (
            defect_id,
            paper_id,
            question_id,
            question_number,
            reporting_staff_id,
            reporting_staff_email,
            defect_category,
            defect_description,
            evidence_reference,
            staff_notes,
            question_snapshot,
            question_fingerprint,
            status,
            repair_history
        ) VALUES (
            v_defect_id,
            v_clean_paper_id,
            v_clean_question_id,
            p_question_number,
            v_staff_id::text,
            v_staff_email,
            p_defect_category,
            v_trimmed_desc,
            nullif(trim(p_evidence_reference), ''),
            nullif(trim(p_staff_notes), ''),
            p_question_snapshot,
            coalesce(nullif(trim(p_question_fingerprint), ''), md5(p_question_snapshot::text)),
            'reported',
            jsonb_build_array(jsonb_build_object(
                'timestamp', now(),
                'action', 'REPORTED',
                'staff_id', v_staff_id::text,
                'notes', 'Initial defect report logged by staff'
            ))
        );
    EXCEPTION WHEN unique_violation THEN
        -- Handle concurrent race condition caught by uq_active_defect_per_category index
        SELECT defect_id INTO v_existing_id
        FROM public.staff_question_defects
        WHERE paper_id = v_clean_paper_id
          AND question_id = v_clean_question_id
          AND defect_category = p_defect_category
          AND status IN ('reported', 'queued_for_repair', 'repair_in_progress', 'fix_prepared', 'validation_failed', 'ready_for_staff_review')
        LIMIT 1;

        RETURN jsonb_build_object(
            'success', false,
            'duplicate', true,
            'defect_id', coalesce(v_existing_id, 'concurrent_active_defect'),
            'message', 'An active defect report for this category already exists on this question (' || coalesce(v_existing_id, 'concurrent') || ').'
        );
    END;

    RETURN jsonb_build_object(
        'success', true,
        'duplicate', false,
        'defect_id', v_defect_id,
        'message', 'Defect report recorded successfully.'
    );
END;
$$;

-- 6. Grants & Access Restrictions
REVOKE ALL ON FUNCTION public.is_verified_staff FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_verified_staff TO authenticated;

REVOKE ALL ON FUNCTION public.staff_report_question_defect FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_report_question_defect TO authenticated;
