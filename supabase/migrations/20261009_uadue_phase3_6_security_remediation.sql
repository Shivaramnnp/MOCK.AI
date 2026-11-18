-- ==============================================================================
-- MOCK.AI — UADUE PHASE 3.6 DATABASE SECURITY REMEDIATION MIGRATION
-- Specification: UADUE-P3-SEC-010 (Phase 3.6 Security Hardening)
-- Purpose:
--   0. Hardened Privilege Boundary: Redefine uadue_is_service_role() so that
--      caller-controlled GUCs ('app.is_service_role') cannot grant privilege to uadue_app_user.
--   1. Enable and force Row-Level Security on the six Phase 2D-8 canonical child tables.
--   2. Establish precise tenant-aware SELECT and INSERT policies.
--   3. Restrict blanket privileges of uadue_app_user to least-privilege matrix.
-- Status: PREPARED ONLY — NOT APPLIED TO PRODUCTION / HOSTED SUPABASE
-- ==============================================================================

-- 0. Hardened Authorization Helper Function:
-- GUC app.is_service_role is NEVER trusted on its own.
-- Strictly whitelists CURRENT_USER: only postgres, supabase_admin, or service_role can qualify.
-- All other active roles (including uadue_app_user, anon, authenticated) unconditionally evaluate to FALSE.
-- NOT SECURITY DEFINER: executes with the exact caller's current role identity.
CREATE OR REPLACE FUNCTION public.uadue_is_service_role() RETURNS BOOLEAN AS $$
BEGIN
    -- 1. Whitelist: Genuine superuser / admin executing directly as CURRENT_USER
    IF CURRENT_USER IN ('postgres', 'supabase_admin') THEN
        RETURN TRUE;
    END IF;

    -- 2. Whitelist: Dedicated service_role login or active membership
    IF CURRENT_USER = 'service_role' OR pg_has_role(CURRENT_USER, 'service_role', 'MEMBER') THEN
        RETURN (
            current_setting('app.is_service_role', true) = 'true'
            OR current_setting('request.jwt.claim.role', true) = 'service_role'
        );
    END IF;

    -- Fail-closed default: uadue_app_user, anon, authenticated, and all other roles evaluate to FALSE
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

-- Hardened Tenant Extraction Function:
-- Extracts tenant_id from application GUC, request JWT direct claim, or PostgREST request.jwt.claims JSON (app_metadata).
CREATE OR REPLACE FUNCTION public.uadue_current_tenant_id() RETURNS TEXT AS $$
DECLARE
    claims_json TEXT;
BEGIN
    -- 1. Explicit application setting
    IF NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL THEN
        RETURN current_setting('app.current_tenant_id', true);
    END IF;

    -- 2. Direct claim setting
    IF NULLIF(current_setting('request.jwt.claim.tenant_id', true), '') IS NOT NULL THEN
        RETURN current_setting('request.jwt.claim.tenant_id', true);
    END IF;

    -- 3. Supabase PostgREST request.jwt.claims JSON (app_metadata.tenant_id / tid)
    claims_json := current_setting('request.jwt.claims', true);
    IF claims_json IS NOT NULL AND claims_json <> '' THEN
        BEGIN
            RETURN COALESCE(
                claims_json::jsonb->'app_metadata'->>'tenant_id',
                claims_json::jsonb->'app_metadata'->>'tid',
                claims_json::jsonb->>'tenant_id',
                claims_json::jsonb->>'tid'
            );
        EXCEPTION WHEN OTHERS THEN
            RETURN NULL;
        END;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- 1. Enable and Force RLS on the Six Child Tables
ALTER TABLE public.canonical_logical_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_logical_families FORCE ROW LEVEL SECURITY;

ALTER TABLE public.canonical_relationship_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_relationship_evaluations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.canonical_family_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_family_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE public.canonical_quarantined_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_quarantined_relationships FORCE ROW LEVEL SECURITY;

ALTER TABLE public.canonical_package_supersessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_package_supersessions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.canonical_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_assets FORCE ROW LEVEL SECURITY;

-- 2. Define Tenant-Aware Policies for Package-Linked Tables (1 to 4)

-- Table 1: canonical_logical_families
DROP POLICY IF EXISTS p_canonical_logical_families_select ON public.canonical_logical_families;
CREATE POLICY p_canonical_logical_families_select ON public.canonical_logical_families
    FOR SELECT USING (
        uadue_is_service_role() OR
        EXISTS (
            SELECT 1 FROM public.canonical_package_tenancy t
            WHERE t.package_id = canonical_logical_families.package_id
              AND (
                  t.visibility_scope = 'PUBLIC' OR
                  t.tenant_id = uadue_current_tenant_id()
              )
        )
    );

DROP POLICY IF EXISTS p_canonical_logical_families_insert ON public.canonical_logical_families;
CREATE POLICY p_canonical_logical_families_insert ON public.canonical_logical_families
    FOR INSERT WITH CHECK (uadue_is_service_role() OR uadue_current_tenant_id() IS NOT NULL);

-- Table 2: canonical_relationship_evaluations
DROP POLICY IF EXISTS p_canonical_relationship_evals_select ON public.canonical_relationship_evaluations;
CREATE POLICY p_canonical_relationship_evals_select ON public.canonical_relationship_evaluations
    FOR SELECT USING (
        uadue_is_service_role() OR
        EXISTS (
            SELECT 1 FROM public.canonical_package_tenancy t
            WHERE t.package_id = canonical_relationship_evaluations.package_id
              AND (
                  t.visibility_scope = 'PUBLIC' OR
                  t.tenant_id = uadue_current_tenant_id()
              )
        )
    );

DROP POLICY IF EXISTS p_canonical_relationship_evals_insert ON public.canonical_relationship_evaluations;
CREATE POLICY p_canonical_relationship_evals_insert ON public.canonical_relationship_evaluations
    FOR INSERT WITH CHECK (uadue_is_service_role() OR uadue_current_tenant_id() IS NOT NULL);

-- Table 3: canonical_family_memberships
DROP POLICY IF EXISTS p_canonical_family_memberships_select ON public.canonical_family_memberships;
CREATE POLICY p_canonical_family_memberships_select ON public.canonical_family_memberships
    FOR SELECT USING (
        uadue_is_service_role() OR
        EXISTS (
            SELECT 1 FROM public.canonical_package_tenancy t
            WHERE t.package_id = canonical_family_memberships.package_id
              AND (
                  t.visibility_scope = 'PUBLIC' OR
                  t.tenant_id = uadue_current_tenant_id()
              )
        )
    );

DROP POLICY IF EXISTS p_canonical_family_memberships_insert ON public.canonical_family_memberships;
CREATE POLICY p_canonical_family_memberships_insert ON public.canonical_family_memberships
    FOR INSERT WITH CHECK (uadue_is_service_role() OR uadue_current_tenant_id() IS NOT NULL);

-- Table 4: canonical_quarantined_relationships
DROP POLICY IF EXISTS p_canonical_quarantined_rels_select ON public.canonical_quarantined_relationships;
CREATE POLICY p_canonical_quarantined_rels_select ON public.canonical_quarantined_relationships
    FOR SELECT USING (
        uadue_is_service_role() OR
        EXISTS (
            SELECT 1 FROM public.canonical_package_tenancy t
            WHERE t.package_id = canonical_quarantined_relationships.package_id
              AND (
                  t.visibility_scope = 'PUBLIC' OR
                  t.tenant_id = uadue_current_tenant_id()
              )
        )
    );

DROP POLICY IF EXISTS p_canonical_quarantined_rels_insert ON public.canonical_quarantined_relationships;
CREATE POLICY p_canonical_quarantined_rels_insert ON public.canonical_quarantined_relationships
    FOR INSERT WITH CHECK (uadue_is_service_role() OR uadue_current_tenant_id() IS NOT NULL);

-- 3. Define Policy for Table 5: canonical_package_supersessions
DROP POLICY IF EXISTS p_canonical_supersessions_select ON public.canonical_package_supersessions;
CREATE POLICY p_canonical_supersessions_select ON public.canonical_package_supersessions
    FOR SELECT USING (
        uadue_is_service_role() OR
        EXISTS (
            SELECT 1 FROM public.canonical_package_tenancy t
            WHERE (t.package_id = canonical_package_supersessions.predecessor_package_id
                OR t.package_id = canonical_package_supersessions.successor_package_id)
              AND (
                  t.visibility_scope = 'PUBLIC' OR
                  t.tenant_id = uadue_current_tenant_id()
              )
        )
    );

DROP POLICY IF EXISTS p_canonical_supersessions_insert ON public.canonical_package_supersessions;
CREATE POLICY p_canonical_supersessions_insert ON public.canonical_package_supersessions
    FOR INSERT WITH CHECK (uadue_is_service_role() OR uadue_current_tenant_id() IS NOT NULL);

-- 4. Define Policy for Table 6: canonical_assets
-- Assets are content-addressed by SHA-256 (CAS).
-- Because canonical_assets lacks a direct relational package-junction table,
-- granting direct tenant access would permit cross-tenant asset exfiltration.
-- Access is restricted exclusively to privileged service role callers.
DROP POLICY IF EXISTS p_canonical_assets_select ON public.canonical_assets;
DROP POLICY IF EXISTS p_canonical_assets_insert ON public.canonical_assets;
DROP POLICY IF EXISTS p_canonical_assets_update ON public.canonical_assets;
DROP POLICY IF EXISTS p_canonical_assets_service_only ON public.canonical_assets;

CREATE POLICY p_canonical_assets_service_only ON public.canonical_assets
    FOR ALL USING (uadue_is_service_role())
    WITH CHECK (uadue_is_service_role());

-- 5. Comprehensive Least-Privilege Role Grants for uadue_app_user
-- Explicit role attribute hardening: prevent database creation, role creation, and replication privileges
ALTER ROLE uadue_app_user WITH NOCREATEDB NOCREATEROLE NOREPLICATION;

-- Strip broad administrative privileges across all object types:
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM uadue_app_user;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM uadue_app_user;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM uadue_app_user;
GRANT USAGE ON SCHEMA public TO uadue_app_user;

-- Harden default privileges so future tables/sequences/functions do not leak permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM uadue_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM uadue_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM uadue_app_user;

-- Grant EXECUTE strictly on required authorization context functions
GRANT EXECUTE ON FUNCTION public.uadue_is_service_role() TO uadue_app_user;
GRANT EXECUTE ON FUNCTION public.uadue_current_tenant_id() TO uadue_app_user;

-- Grant SELECT, INSERT, UPDATE strictly on delivery lifecycle tables
GRANT SELECT, INSERT, UPDATE ON TABLE 
    public.exam_sessions,
    public.candidate_question_states,
    public.candidate_scoring_disputes
TO uadue_app_user;

-- Grant SELECT, INSERT strictly on append-only transition and event ledgers
GRANT SELECT, INSERT ON TABLE 
    public.exam_session_transitions,
    public.exam_session_projections,
    public.candidate_submission_events,
    public.candidate_evaluation_runs,
    public.candidate_question_scores,
    public.audit_events
TO uadue_app_user;

-- Grant SELECT strictly on tenant-authorized canonical assessment package tables
-- NOTE: public.canonical_assets is intentionally EXCLUDED from uadue_app_user grants.
GRANT SELECT ON TABLE 
    public.canonical_assessment_packages,
    public.canonical_package_events,
    public.canonical_questions,
    public.canonical_question_representations,
    public.canonical_logical_families,
    public.canonical_relationship_evaluations,
    public.canonical_family_memberships,
    public.canonical_quarantined_relationships,
    public.canonical_package_supersessions,
    public.canonical_package_tenancy
TO uadue_app_user;

-- Grant sequence nextval/usage strictly for submission event ordering
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO uadue_app_user;
