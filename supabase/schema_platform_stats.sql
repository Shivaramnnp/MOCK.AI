-- ==============================================================================
-- MOCK.AI — SUPABASE PROJECT 1: PLATFORM STATISTICS RPC & AGGREGATE SECURITY
-- Purpose: Safely compute and return aggregate platform metrics to both
--          unauthenticated (anon) and authenticated users without exposing PII.
--
-- Metrics computed:
--   1. Registered Students: Count of unique registered user accounts (auth.users / public.profiles)
--   2. Tests Taken: Count of finalized/submitted test sessions (public.user_exam_attempts status = 'SUBMITTED' or 'COMPLETED')
--   3. Available Papers: Total available exam papers catalog count
--
-- Run this in: Supabase Project 1 Dashboard → SQL Editor → Run
-- This script is idempotent. Safe to run multiple times.
-- ==============================================================================

-- 1. Create or replace the aggregate RPC function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_registered_students BIGINT := 0;
    v_tests_taken BIGINT := 0;
BEGIN
    -- 1. Registered Students: Count unique registered users in auth.users
    -- SECURITY DEFINER allows this function to read auth.users safely
    BEGIN
        SELECT COUNT(*) INTO v_registered_students FROM auth.users;
    EXCEPTION WHEN OTHERS THEN
        -- Fallback to public.profiles if auth.users is restricted by engine settings
        SELECT COUNT(*) INTO v_registered_students FROM public.profiles;
    END;

    -- If auth.users returned 0 or null, check public.profiles as secondary source
    IF v_registered_students IS NULL OR v_registered_students = 0 THEN
        SELECT COUNT(*) INTO v_registered_students FROM public.profiles;
    END IF;

    -- 2. Tests Taken: Count ONLY test sessions that were successfully finalized/submitted/completed
    -- Strict filter: status IN ('SUBMITTED', 'COMPLETED')
    -- Excludes: 'IN_PROGRESS', 'PAUSED', 'EXPIRED', 'ABANDONED', or any draft/local states
    SELECT COUNT(*) INTO v_tests_taken
    FROM public.user_exam_attempts
    WHERE status IN ('SUBMITTED', 'COMPLETED');

    RETURN jsonb_build_object(
        'registeredStudents', COALESCE(v_registered_students, 0),
        'testsTaken', COALESCE(v_tests_taken, 0)
    );
END;
$$;

-- 2. Explicitly grant execute permission to anon, authenticated, and service_role
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon, authenticated, service_role;

-- 3. Document function purpose and security guarantee
COMMENT ON FUNCTION public.get_platform_stats() IS 
  'Returns aggregate platform counts (registeredStudents, testsTaken) safely to anonymous visitors and authenticated users without exposing any raw user or attempt rows.';
