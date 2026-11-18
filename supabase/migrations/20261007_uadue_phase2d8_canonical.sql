-- ==============================================================================
-- MOCK.AI — UADUE PHASE 2D-8 CANONICAL ASSESSMENT PERSISTENCE MIGRATION
-- Document Version: 7.3.1-CONSISTENCY-ALIGNED
-- Purpose: Real PostgreSQL relational schema, constraints, immutability triggers,
--          and Row-Level Security (RLS) for the UADUE Canonical Pipeline.
-- ==============================================================================

-- 1. Create Immutability Trigger Function
CREATE OR REPLACE FUNCTION uadue_prevent_record_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'UADUE Immutability Violation: In-place % operation is forbidden on table %.', TG_OP, TG_TABLE_NAME
        USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

-- 2. Table: canonical_assessment_packages
CREATE TABLE IF NOT EXISTS public.canonical_assessment_packages (
    package_id TEXT PRIMARY KEY,
    source_snapshot_id TEXT NOT NULL,
    source_document_id TEXT NOT NULL,
    package_integrity_seal TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    pipeline_algorithm_id TEXT NOT NULL,
    pipeline_algorithm_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: Prevent UPDATE and DELETE on packages
DROP TRIGGER IF EXISTS trg_canonical_packages_immutable ON public.canonical_assessment_packages;
CREATE TRIGGER trg_canonical_packages_immutable
    BEFORE UPDATE OR DELETE ON public.canonical_assessment_packages
    FOR EACH ROW
    EXECUTE FUNCTION uadue_prevent_record_mutation();

-- 3. Table: canonical_package_events (Append-only lifecycle event ledger)
CREATE TABLE IF NOT EXISTS public.canonical_package_events (
    event_id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL REFERENCES public.canonical_assessment_packages(package_id) ON DELETE RESTRICT,
    sequence_number INT NOT NULL,
    event_type TEXT NOT NULL,
    publication_request_fingerprint TEXT,
    event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_canonical_package_event_seq UNIQUE (package_id, sequence_number),
    CONSTRAINT chk_canonical_event_seq_pos CHECK (sequence_number > 0),
    CONSTRAINT chk_canonical_event_type CHECK (
        event_type IN (
            'PERSISTENCE_COMMITTED',
            'VALIDATION_RECORDED',
            'PUBLICATION_ISSUED',
            'QUARANTINE_APPLIED',
            'QUARANTINE_RELEASED',
            'SUPERSESSION_REGISTERED'
        )
    ),
    CONSTRAINT chk_pub_fingerprint CHECK (
        event_type != 'PUBLICATION_ISSUED' OR (
            publication_request_fingerprint IS NOT NULL AND
            length(trim(publication_request_fingerprint)) > 0
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_canonical_events_pkg_seq ON public.canonical_package_events(package_id, sequence_number);

-- Trigger: Prevent UPDATE and DELETE on historical events
DROP TRIGGER IF EXISTS trg_canonical_events_immutable ON public.canonical_package_events;
CREATE TRIGGER trg_canonical_events_immutable
    BEFORE UPDATE OR DELETE ON public.canonical_package_events
    FOR EACH ROW
    EXECUTE FUNCTION uadue_prevent_record_mutation();

-- 4. Table: canonical_questions
CREATE TABLE IF NOT EXISTS public.canonical_questions (
    package_id TEXT NOT NULL REFERENCES public.canonical_assessment_packages(package_id) ON DELETE RESTRICT,
    canonical_question_id TEXT NOT NULL,
    question_index INT NOT NULL,
    logical_family_id TEXT NOT NULL,
    family_role TEXT,
    synthesized_question_type TEXT,
    canonical_fingerprint TEXT NOT NULL,
    source_discrepancies JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (package_id, canonical_question_id),
    CONSTRAINT uq_canonical_question_order UNIQUE (package_id, question_index),
    CONSTRAINT chk_canonical_question_index_pos CHECK (question_index >= 0)
);

CREATE INDEX IF NOT EXISTS idx_canonical_questions_order ON public.canonical_questions(package_id, question_index);

-- 5. Table: canonical_question_representations
CREATE TABLE IF NOT EXISTS public.canonical_question_representations (
    package_id TEXT NOT NULL,
    canonical_question_id TEXT NOT NULL,
    representation_index INT NOT NULL,
    representation_id TEXT NOT NULL,
    language_script TEXT NOT NULL,
    source_physical_instance_id TEXT NOT NULL,
    source_question_number TEXT,
    stem_ast JSONB NOT NULL DEFAULT '[]'::jsonb,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    tables JSONB,
    diagrams JSONB,
    math_blocks JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (package_id, canonical_question_id, representation_index),
    FOREIGN KEY (package_id, canonical_question_id) REFERENCES public.canonical_questions(package_id, canonical_question_id) ON DELETE RESTRICT,
    CONSTRAINT chk_canonical_rep_index_pos CHECK (representation_index >= 0)
);

CREATE INDEX IF NOT EXISTS idx_canonical_reps_lookup ON public.canonical_question_representations(package_id, canonical_question_id, representation_index);

-- 6. Table: canonical_logical_families
CREATE TABLE IF NOT EXISTS public.canonical_logical_families (
    package_id TEXT NOT NULL REFERENCES public.canonical_assessment_packages(package_id) ON DELETE RESTRICT,
    family_id TEXT NOT NULL,
    family_type TEXT,
    family_anchor_physical_instance_id TEXT,
    members JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (package_id, family_id)
);

-- 7. Table: canonical_relationship_evaluations
CREATE TABLE IF NOT EXISTS public.canonical_relationship_evaluations (
    package_id TEXT NOT NULL REFERENCES public.canonical_assessment_packages(package_id) ON DELETE RESTRICT,
    evaluation_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    source_candidate_id TEXT NOT NULL,
    target_candidate_id TEXT NOT NULL,
    source_physical_instance_id TEXT NOT NULL,
    target_physical_instance_id TEXT NOT NULL,
    confidence_score NUMERIC(5, 4) NOT NULL,
    verification_status TEXT NOT NULL,
    evidence_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (package_id, evaluation_id)
);

-- 8. Table: canonical_family_memberships
CREATE TABLE IF NOT EXISTS public.canonical_family_memberships (
    package_id TEXT NOT NULL REFERENCES public.canonical_assessment_packages(package_id) ON DELETE RESTRICT,
    membership_fingerprint TEXT NOT NULL,
    family_candidate_id TEXT NOT NULL,
    candidate_physical_instance_id TEXT NOT NULL,
    role TEXT NOT NULL,
    verification_status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (package_id, membership_fingerprint)
);

-- 9. Table: canonical_quarantined_relationships
CREATE TABLE IF NOT EXISTS public.canonical_quarantined_relationships (
    package_id TEXT NOT NULL REFERENCES public.canonical_assessment_packages(package_id) ON DELETE RESTRICT,
    relationship_id TEXT NOT NULL,
    source_candidate_id TEXT,
    target_candidate_id TEXT,
    relationship_type TEXT,
    quarantine_reason TEXT,
    quarantined_at BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (package_id, relationship_id)
);

-- 10. Table: canonical_answer_authority_resolutions
CREATE TABLE IF NOT EXISTS public.canonical_answer_authority_resolutions (
    package_id TEXT NOT NULL,
    canonical_question_id TEXT NOT NULL,
    resolution_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (package_id, canonical_question_id),
    FOREIGN KEY (package_id, canonical_question_id) REFERENCES public.canonical_questions(package_id, canonical_question_id) ON DELETE RESTRICT
);

-- 11. Table: canonical_package_supersessions
CREATE TABLE IF NOT EXISTS public.canonical_package_supersessions (
    supersession_id TEXT PRIMARY KEY,
    predecessor_package_id TEXT NOT NULL REFERENCES public.canonical_assessment_packages(package_id) ON DELETE RESTRICT,
    successor_package_id TEXT NOT NULL REFERENCES public.canonical_assessment_packages(package_id) ON DELETE RESTRICT,
    supersession_reason TEXT NOT NULL,
    authority_document_source_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_no_self_supersession CHECK (predecessor_package_id != successor_package_id),
    CONSTRAINT uq_supersession_pair UNIQUE (predecessor_package_id, successor_package_id)
);

CREATE INDEX IF NOT EXISTS idx_supersessions_pred ON public.canonical_package_supersessions(predecessor_package_id);
CREATE INDEX IF NOT EXISTS idx_supersessions_succ ON public.canonical_package_supersessions(successor_package_id);

-- 12. Table: canonical_package_tenancy
CREATE TABLE IF NOT EXISTS public.canonical_package_tenancy (
    package_id TEXT NOT NULL REFERENCES public.canonical_assessment_packages(package_id) ON DELETE RESTRICT,
    tenant_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    visibility_scope TEXT NOT NULL CHECK (visibility_scope IN ('PUBLIC', 'TENANT_RESTRICTED', 'PRIVATE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (package_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenancy_tenant ON public.canonical_package_tenancy(tenant_id);

-- 13. Table: canonical_assets
CREATE TABLE IF NOT EXISTS public.canonical_assets (
    content_hash TEXT PRIMARY KEY,
    storage_uri TEXT NOT NULL UNIQUE,
    byte_size BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    exam_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    asset_bytes BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 14. ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.canonical_assessment_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_assessment_packages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_question_representations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_question_representations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_package_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_package_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_answer_authority_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_answer_authority_resolutions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_package_tenancy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_package_tenancy FORCE ROW LEVEL SECURITY;

-- Helper function to check if current session is superuser/service-role
CREATE OR REPLACE FUNCTION uadue_is_service_role() RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        current_setting('app.is_service_role', true) = 'true' OR
        current_setting('request.jwt.claim.role', true) = 'service_role'
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper function to get current tenant ID from session context
CREATE OR REPLACE FUNCTION uadue_current_tenant_id() RETURNS TEXT AS $$
BEGIN
    RETURN COALESCE(
        NULLIF(current_setting('app.current_tenant_id', true), ''),
        NULLIF(current_setting('request.jwt.claim.tenant_id', true), '')
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Package SELECT Policy:
-- Service role OR public visibility OR matching tenant
DROP POLICY IF EXISTS p_canonical_packages_select ON public.canonical_assessment_packages;
CREATE POLICY p_canonical_packages_select ON public.canonical_assessment_packages
    FOR SELECT USING (
        uadue_is_service_role() OR
        EXISTS (
            SELECT 1 FROM public.canonical_package_tenancy t
            WHERE t.package_id = canonical_assessment_packages.package_id
              AND (
                  t.visibility_scope = 'PUBLIC' OR
                  t.tenant_id = uadue_current_tenant_id()
              )
        )
    );

-- Questions SELECT Policy
DROP POLICY IF EXISTS p_canonical_questions_select ON public.canonical_questions;
CREATE POLICY p_canonical_questions_select ON public.canonical_questions
    FOR SELECT USING (
        uadue_is_service_role() OR
        EXISTS (
            SELECT 1 FROM public.canonical_package_tenancy t
            WHERE t.package_id = canonical_questions.package_id
              AND (
                  t.visibility_scope = 'PUBLIC' OR
                  t.tenant_id = uadue_current_tenant_id()
              )
        )
    );

-- Representations SELECT Policy
DROP POLICY IF EXISTS p_canonical_reps_select ON public.canonical_question_representations;
CREATE POLICY p_canonical_reps_select ON public.canonical_question_representations
    FOR SELECT USING (
        uadue_is_service_role() OR
        EXISTS (
            SELECT 1 FROM public.canonical_package_tenancy t
            WHERE t.package_id = canonical_question_representations.package_id
              AND (
                  t.visibility_scope = 'PUBLIC' OR
                  t.tenant_id = uadue_current_tenant_id()
              )
        )
    );

-- Answer Authority SELECT Policy (Staff/Service role only or authorized tenant post-exam)
DROP POLICY IF EXISTS p_canonical_answers_select ON public.canonical_answer_authority_resolutions;
CREATE POLICY p_canonical_answers_select ON public.canonical_answer_authority_resolutions
    FOR SELECT USING (
        uadue_is_service_role() OR
        EXISTS (
            SELECT 1 FROM public.canonical_package_tenancy t
            WHERE t.package_id = canonical_answer_authority_resolutions.package_id
              AND t.tenant_id = uadue_current_tenant_id()
        )
    );

-- Tenancy SELECT Policy
DROP POLICY IF EXISTS p_canonical_tenancy_select ON public.canonical_package_tenancy;
CREATE POLICY p_canonical_tenancy_select ON public.canonical_package_tenancy
    FOR SELECT USING (
        uadue_is_service_role() OR
        tenant_id = uadue_current_tenant_id() OR
        visibility_scope = 'PUBLIC'
    );

-- Events SELECT Policy
DROP POLICY IF EXISTS p_canonical_events_select ON public.canonical_package_events;
CREATE POLICY p_canonical_events_select ON public.canonical_package_events
    FOR SELECT USING (
        uadue_is_service_role() OR
        EXISTS (
            SELECT 1 FROM public.canonical_package_tenancy t
            WHERE t.package_id = canonical_package_events.package_id
              AND (
                  t.visibility_scope = 'PUBLIC' OR
                  t.tenant_id = uadue_current_tenant_id()
              )
        )
    );

-- INSERT Policies (Service role or authorized tenant)
DROP POLICY IF EXISTS p_canonical_packages_insert ON public.canonical_assessment_packages;
CREATE POLICY p_canonical_packages_insert ON public.canonical_assessment_packages
    FOR INSERT WITH CHECK (uadue_is_service_role() OR uadue_current_tenant_id() IS NOT NULL);

DROP POLICY IF EXISTS p_canonical_events_insert ON public.canonical_package_events;
CREATE POLICY p_canonical_events_insert ON public.canonical_package_events
    FOR INSERT WITH CHECK (uadue_is_service_role() OR uadue_current_tenant_id() IS NOT NULL);

DROP POLICY IF EXISTS p_canonical_questions_insert ON public.canonical_questions;
CREATE POLICY p_canonical_questions_insert ON public.canonical_questions
    FOR INSERT WITH CHECK (uadue_is_service_role() OR uadue_current_tenant_id() IS NOT NULL);

DROP POLICY IF EXISTS p_canonical_reps_insert ON public.canonical_question_representations;
CREATE POLICY p_canonical_reps_insert ON public.canonical_question_representations
    FOR INSERT WITH CHECK (uadue_is_service_role() OR uadue_current_tenant_id() IS NOT NULL);

DROP POLICY IF EXISTS p_canonical_answers_insert ON public.canonical_answer_authority_resolutions;
CREATE POLICY p_canonical_answers_insert ON public.canonical_answer_authority_resolutions
    FOR INSERT WITH CHECK (uadue_is_service_role() OR uadue_current_tenant_id() IS NOT NULL);

DROP POLICY IF EXISTS p_canonical_tenancy_insert ON public.canonical_package_tenancy;
CREATE POLICY p_canonical_tenancy_insert ON public.canonical_package_tenancy
    FOR INSERT WITH CHECK (uadue_is_service_role() OR uadue_current_tenant_id() IS NOT NULL);

-- Application non-superuser role for RLS isolation verification
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'uadue_app_user') THEN
        CREATE ROLE uadue_app_user WITH LOGIN;
    END IF;
END
$$;
GRANT USAGE ON SCHEMA public TO uadue_app_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO uadue_app_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO uadue_app_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO uadue_app_user;
