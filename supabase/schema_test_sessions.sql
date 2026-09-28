-- ==============================================================================
-- MOCK.AI — SUPABASE PROJECT 1: USER TEST SESSIONS & ATTEMPTS SCHEMA
-- Purpose: Authoritative persistence for in-progress and completed exam attempts.
--
-- IMPORTANT:
--   This schema is for PROJECT 1 (auth & user data) ONLY.
--   Run this in: Supabase Project 1 Dashboard → SQL Editor → Run
--
-- This script is idempotent. Safe to run multiple times.
-- ==============================================================================

-- 1. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create or update user_exam_attempts table
CREATE TABLE IF NOT EXISTS public.user_exam_attempts (
    id TEXT PRIMARY KEY,                                      -- e.g. 'session_ssc-chsl-2025-13nov-s2_1790328900'
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Authenticated user who owns this session
    paper_id TEXT NOT NULL,                                   -- Reference to source paper in Project 2 / catalog
    exam_id TEXT NOT NULL,                                    -- e.g. 'ssc-chsl', 'gate'
    paper_title TEXT NOT NULL DEFAULT '',
    edition_year INT NOT NULL DEFAULT 2025,
    tier TEXT DEFAULT '',
    shift TEXT DEFAULT '',
    exam_date TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS' 
        CHECK (status IN ('IN_PROGRESS', 'PAUSED', 'SUBMITTED', 'EXPIRED', 'ABANDONED')),
    current_question_index INT NOT NULL DEFAULT 0,
    current_section_id TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    duration_seconds INT NOT NULL DEFAULT 3600,
    time_remaining_seconds INT NOT NULL DEFAULT 3600,
    elapsed_seconds INT NOT NULL DEFAULT 0,
    user_answers JSONB NOT NULL DEFAULT '{}'::jsonb,              -- { "0": 1, "1": 3, ... } (MCQ option index)
    user_msq_answers JSONB NOT NULL DEFAULT '{}'::jsonb,          -- { "0": [0, 2], ... } (MSQ selected indices)
    user_nat_answers JSONB NOT NULL DEFAULT '{}'::jsonb,          -- { "0": "42.5", ... } (NAT numeric text)
    user_descriptive_answers JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { "0": "Essay text...", ... }
    question_statuses JSONB NOT NULL DEFAULT '{}'::jsonb,         -- { "0": "ANSWERED", "1": "NOT_VISITED", ... }
    result_summary JSONB,                                         -- Full score, percentage, and section breakdowns upon submission
    version INT NOT NULL DEFAULT 1,                               -- Optimistic locking revision counter
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_user_attempts_user_id ON public.user_exam_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_attempts_paper_id ON public.user_exam_attempts(paper_id);
CREATE INDEX IF NOT EXISTS idx_user_attempts_status ON public.user_exam_attempts(status);
CREATE INDEX IF NOT EXISTS idx_user_attempts_user_status ON public.user_exam_attempts(user_id, status);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.user_exam_attempts ENABLE ROW LEVEL SECURITY;

-- 5. Strict RLS Policies: A user can ONLY read, create, modify, or delete their own sessions
DROP POLICY IF EXISTS "Users can view own test sessions" ON public.user_exam_attempts;
CREATE POLICY "Users can view own test sessions"
    ON public.user_exam_attempts FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own test sessions" ON public.user_exam_attempts;
CREATE POLICY "Users can insert own test sessions"
    ON public.user_exam_attempts FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own test sessions" ON public.user_exam_attempts;
CREATE POLICY "Users can update own test sessions"
    ON public.user_exam_attempts FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own test sessions" ON public.user_exam_attempts;
CREATE POLICY "Users can delete own test sessions"
    ON public.user_exam_attempts FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- 6. Anonymous / Guest sessions are kept securely in local client storage.
-- Cloud persistence strictly requires authenticated user identity to prevent cross-user IDOR attacks.
DROP POLICY IF EXISTS "Allow anonymous test sessions" ON public.user_exam_attempts;
