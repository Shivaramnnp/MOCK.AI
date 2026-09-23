-- ==============================================================================
-- MOCK.AI Competitive Exams & Previous Year Papers (PYP) Schema
-- Provides idempotent database entities, stable unique constraints,
-- and Row Level Security (RLS) for multi-tenant practice.
-- ==============================================================================

-- 1. Competitive Exams Table
CREATE TABLE IF NOT EXISTS public.competitive_exams (
    id TEXT PRIMARY KEY,                       -- e.g. 'ssc-chsl', 'gate', 'upsc-cse'
    name TEXT NOT NULL,                        -- e.g. 'SSC CHSL'
    full_name TEXT NOT NULL,                   -- e.g. 'Combined Higher Secondary Level Examination'
    organization TEXT NOT NULL,                -- e.g. 'Staff Selection Commission (SSC)'
    category TEXT NOT NULL,                    -- e.g. 'SSC / Government', 'Engineering'
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'COMING_SOON' CHECK (status IN ('AVAILABLE', 'COMING_SOON')),
    available_years INT[] DEFAULT '{}',
    tier TEXT,
    default_pattern JSONB NOT NULL DEFAULT '{}'::jsonb,
    highlights TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Exam Papers Table (Immutable paper definitions with deterministic identities)
CREATE TABLE IF NOT EXISTS public.exam_papers (
    id TEXT PRIMARY KEY,                       -- e.g. 'ssc-chsl-2025-13nov-s2'
    exam_id TEXT NOT NULL REFERENCES public.competitive_exams(id) ON DELETE CASCADE,
    edition_year INT NOT NULL,                 -- e.g. 2025
    title TEXT NOT NULL,                       -- e.g. 'SSC CHSL Tier 1 — 13 Nov 2025 (Shift 2)'
    sub_title TEXT,
    exam_date DATE NOT NULL,                   -- e.g. '2025-11-13'
    shift TEXT NOT NULL,                       -- e.g. 'Shift 2'
    tier TEXT NOT NULL,                        -- e.g. 'Tier 1'
    language TEXT NOT NULL DEFAULT 'English',  -- e.g. 'English'
    duration_minutes INT NOT NULL DEFAULT 60,
    total_marks NUMERIC NOT NULL DEFAULT 200,
    total_questions INT NOT NULL DEFAULT 100,
    marking_scheme JSONB NOT NULL DEFAULT '{"marksPerCorrect": 2.0, "negativeMarks": 0.5, "unansweredMarks": 0.0}'::jsonb,
    sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    -- Strict deterministic constraint: same paper can never be inserted twice
    CONSTRAINT uq_exam_paper_identity UNIQUE (exam_id, edition_year, exam_date, shift, tier, language)
);

-- 3. Reusable Competitive Questions Table
CREATE TABLE IF NOT EXISTS public.competitive_questions (
    id TEXT PRIMARY KEY,                       -- e.g. 'chsl-2025-13nov-s2-q1'
    paper_id TEXT NOT NULL REFERENCES public.exam_papers(id) ON DELETE CASCADE,
    question_number INT NOT NULL,              -- 1 to 100
    section_id TEXT NOT NULL,                  -- 'english', 'reasoning', 'quant', 'general_awareness'
    section_name TEXT NOT NULL,                -- 'English Language', etc.
    question_text TEXT NOT NULL,
    options JSONB NOT NULL,                    -- Array of 4 string options
    correct_answer CHAR(1) NOT NULL CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
    correct_answer_index INT NOT NULL CHECK (correct_answer_index BETWEEN 0 AND 3),
    explanation TEXT NOT NULL,
    diagram_url TEXT,
    diagram_urls JSONB DEFAULT '[]'::jsonb,
    option_images JSONB DEFAULT '[]'::jsonb,
    question_assets JSONB DEFAULT '[]'::jsonb,
    marks NUMERIC NOT NULL DEFAULT 2.0,
    negative_marks NUMERIC NOT NULL DEFAULT 0.5,
    exam_id TEXT NOT NULL REFERENCES public.competitive_exams(id) ON DELETE CASCADE,
    edition_year INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    -- Strict constraint: question number must be unique per paper
    CONSTRAINT uq_paper_question_number UNIQUE (paper_id, question_number)
);

-- 4. User Exam Attempts (Test Sessions & Results)
CREATE TABLE IF NOT EXISTS public.user_exam_attempts (
    id TEXT PRIMARY KEY,                       -- Unique session UUID or attempt token
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    paper_id TEXT NOT NULL REFERENCES public.exam_papers(id) ON DELETE CASCADE,
    exam_id TEXT NOT NULL REFERENCES public.competitive_exams(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED')),
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    duration_seconds INT NOT NULL DEFAULT 3600,
    time_remaining_seconds INT NOT NULL DEFAULT 3600,
    elapsed_seconds INT NOT NULL DEFAULT 0,
    user_answers JSONB NOT NULL DEFAULT '{}'::jsonb,        -- { "0": 1, "1": 3, ... }
    question_statuses JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { "0": "ANSWERED", ... }
    result_summary JSONB,                                   -- Detailed score, accuracy, section breakdowns
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_exam_papers_exam_id ON public.exam_papers(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_papers_year ON public.exam_papers(edition_year);
CREATE INDEX IF NOT EXISTS idx_questions_paper_id ON public.competitive_questions(paper_id);
CREATE INDEX IF NOT EXISTS idx_questions_section ON public.competitive_questions(paper_id, section_id);
CREATE INDEX IF NOT EXISTS idx_user_attempts_user_id ON public.user_exam_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_attempts_paper_id ON public.user_exam_attempts(paper_id);

-- 5. Row Level Security (RLS) Configuration
ALTER TABLE public.competitive_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitive_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_exam_attempts ENABLE ROW LEVEL SECURITY;

-- Catalog, Papers, and Questions are publicly readable by all authenticated and anonymous clients
DROP POLICY IF EXISTS "Public can view competitive exams" ON public.competitive_exams;
CREATE POLICY "Public can view competitive exams"
    ON public.competitive_exams FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Public can view exam papers" ON public.exam_papers;
CREATE POLICY "Public can view exam papers"
    ON public.exam_papers FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Public can view competitive questions" ON public.competitive_questions;
CREATE POLICY "Public can view competitive questions"
    ON public.competitive_questions FOR SELECT
    USING (true);

-- User Exam Attempts: Users can only view, create, and update their own attempts
DROP POLICY IF EXISTS "Users can view own exam attempts" ON public.user_exam_attempts;
CREATE POLICY "Users can view own exam attempts"
    ON public.user_exam_attempts FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can insert own exam attempts" ON public.user_exam_attempts;
CREATE POLICY "Users can insert own exam attempts"
    ON public.user_exam_attempts FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can update own exam attempts" ON public.user_exam_attempts;
CREATE POLICY "Users can update own exam attempts"
    ON public.user_exam_attempts FOR UPDATE
    USING (auth.uid() = user_id OR user_id IS NULL);

-- 6. Initial Seed: Register SSC CHSL in catalog
INSERT INTO public.competitive_exams (id, name, full_name, organization, category, description, status, available_years, tier, default_pattern, highlights)
VALUES (
    'ssc-chsl',
    'SSC CHSL',
    'Combined Higher Secondary (10+2) Level Examination',
    'Staff Selection Commission (SSC)',
    'SSC / Government',
    'Premier national competitive examination for recruitment to Lower Division Clerk (LDC), Junior Secretariat Assistant (JSA), and Data Entry Operator (DEO) positions.',
    'AVAILABLE',
    ARRAY[2025],
    'Tier 1',
    '{"durationMinutes": 60, "totalQuestions": 100, "totalMarks": 200, "markingScheme": {"marksPerCorrect": 2.0, "negativeMarks": 0.5, "unansweredMarks": 0.0}, "sections": ["English Language", "General Intelligence & Reasoning", "Quantitative Aptitude", "General Awareness"]}'::jsonb,
    ARRAY[
        'Official 2025 Shift-wise Papers with Full Solutions',
        'Accurate +2 / -0.5 Negative Marking Calculator',
        'Step-by-step LaTeX Formatted Mathematical Explanations',
        'Section-wise Timing & Accuracy Analytics'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    available_years = EXCLUDED.available_years,
    default_pattern = EXCLUDED.default_pattern,
    highlights = EXCLUDED.highlights;
