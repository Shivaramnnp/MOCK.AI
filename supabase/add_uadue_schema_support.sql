-- ==============================================================================
-- MOCK.AI — UADUE FOUNDATIONAL SCHEMA EXTENSIONS (PHASE 1)
-- Purpose: Relaxes exam-specific option constraints and introduces support for
--          Universal DocumentIR, Question Graph metadata, and 1% Review Queue.
--
-- Target: Supabase Project 2 (Exam Content)
-- Idempotent and Non-Destructive. Safe to apply on live databases.
-- ==============================================================================

-- 1. Relax question_options constraints to support any exam format (Banking 5-opt, SAT 6-opt, etc.)
DO $$
BEGIN
    -- Drop old 4-option check constraint if present
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'question_options_option_label_check'
    ) THEN
        ALTER TABLE public.question_options DROP CONSTRAINT question_options_option_label_check;
    END IF;

    -- Drop old 0-3 index check constraint if present
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'question_options_option_index_check'
    ) THEN
        ALTER TABLE public.question_options DROP CONSTRAINT question_options_option_index_check;
    END IF;
END $$;

-- Alter column to allow flexible option labels (e.g. 'E', 'F', '1', '2', '(a)', '(iv)')
ALTER TABLE public.question_options 
    ALTER COLUMN option_label TYPE VARCHAR(10);

-- Add universal non-negative index constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_question_options_index_non_negative'
    ) THEN
        ALTER TABLE public.question_options 
            ADD CONSTRAINT chk_question_options_index_non_negative CHECK (option_index >= 0);
    END IF;
END $$;

-- 2. Add UADUE Metadata Columns to public.questions
ALTER TABLE public.questions
    ADD COLUMN IF NOT EXISTS source_evidence JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS question_graph JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS uadue_version TEXT DEFAULT '1.0';

-- 3. Add UADUE DocumentIR Column to public.exam_papers
ALTER TABLE public.exam_papers
    ADD COLUMN IF NOT EXISTS document_ir JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS uadue_certified BOOL DEFAULT false;

-- 4. Create the 1% Staff Review Queue Table
CREATE TABLE IF NOT EXISTS public.review_queue_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id TEXT REFERENCES public.questions(id) ON DELETE CASCADE,
    paper_id TEXT REFERENCES public.exam_papers(id) ON DELETE CASCADE,
    anomaly_category TEXT NOT NULL CHECK (
        anomaly_category IN ('MATH_SYNTAX', 'OPTION_STRUCTURE', 'DIAGRAM_ALIGNMENT', 'ANSWER_KEY', 'LAYOUT_AMBIGUITY', 'OTHER')
    ),
    severity TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (
        severity IN ('FATAL', 'REVIEW_REQUIRED', 'WARNING')
    ),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    crop_url TEXT,
    suggested_patch JSONB,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'APPROVED', 'REJECTED', 'RESOLVED')
    ),
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_queue_status ON public.review_queue_items(status);
CREATE INDEX IF NOT EXISTS idx_review_queue_paper ON public.review_queue_items(paper_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_question ON public.review_queue_items(question_id);

-- Enable RLS on review_queue_items
ALTER TABLE public.review_queue_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read review queue items" ON public.review_queue_items;
CREATE POLICY "Public read review queue items" ON public.review_queue_items FOR SELECT USING (true);
