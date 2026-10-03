-- ==============================================================================
-- MOCK.AI — SOURCE PAIRING & VERIFICATION ENGINE SCHEMA
-- Independent Question Paper + Answer Key Storage, Identity, and Matching
-- ==============================================================================

-- 1. Exam Sources Table (Independent sources: Question Paper vs Answer Key)
CREATE TABLE IF NOT EXISTS public.exam_sources (
    id TEXT PRIMARY KEY,                       -- e.g. 'src_qp_a1b2c3d4'
    exam_id TEXT REFERENCES public.competitive_exams(id) ON DELETE CASCADE,
    paper_id TEXT REFERENCES public.exam_papers(id) ON DELETE CASCADE,
    source_role TEXT NOT NULL CHECK (source_role IN ('QUESTION_PAPER', 'ANSWER_KEY', 'SYLLABUS', 'OTHER')),
    file_name TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    source_version TEXT NOT NULL DEFAULT '1.0',
    page_count INT NOT NULL DEFAULT 1,
    paper_identity JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Raw Source Questions (Preserved exactly as extracted from Question Paper)
CREATE TABLE IF NOT EXISTS public.source_questions (
    id TEXT PRIMARY KEY,                       -- e.g. 'sq_a1b2c3d4_q1'
    source_id TEXT NOT NULL REFERENCES public.exam_sources(id) ON DELETE CASCADE,
    question_number INT NOT NULL,
    page_number INT NOT NULL DEFAULT 1,
    raw_text TEXT NOT NULL DEFAULT '',
    raw_structure JSONB NOT NULL DEFAULT '{}'::jsonb,
    bounding_box JSONB,
    section_name TEXT,
    detected_type TEXT,
    provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_source_question_number UNIQUE (source_id, question_number)
);

-- 3. Raw Source Answers (Preserved exactly as extracted from Answer Key)
CREATE TABLE IF NOT EXISTS public.source_answers (
    id TEXT PRIMARY KEY,                       -- e.g. 'sa_e5f6g7h8_q1'
    source_id TEXT NOT NULL REFERENCES public.exam_sources(id) ON DELETE CASCADE,
    question_number INT NOT NULL,
    page_number INT NOT NULL DEFAULT 1,
    raw_answer TEXT NOT NULL,
    normalized_answer JSONB NOT NULL DEFAULT '{}'::jsonb,
    answer_type TEXT NOT NULL DEFAULT 'MCQ',
    provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_source_answer_number UNIQUE (source_id, question_number)
);

-- 4. Question-Answer Matches (Deterministic link & verification state)
CREATE TABLE IF NOT EXISTS public.question_answer_matches (
    id TEXT PRIMARY KEY,                       -- e.g. 'match_q1_a1b2_e5f6'
    question_source_id TEXT NOT NULL REFERENCES public.exam_sources(id) ON DELETE CASCADE,
    answer_source_id TEXT REFERENCES public.exam_sources(id) ON DELETE SET NULL,
    question_number INT NOT NULL,
    match_status TEXT NOT NULL CHECK (
        match_status IN (
            'MATCHED',
            'PARTIAL_MATCH',
            'REVIEW_REQUIRED',
            'MISMATCH',
            'MISSING_KEY',
            'DUPLICATE_KEY',
            'INVALID_KEY',
            'QUESTION_PAPER_ONLY',
            'ANSWER_KEY_ONLY',
            'SOURCE_MISMATCH'
        )
    ),
    match_reason TEXT NOT NULL,
    confidence NUMERIC NOT NULL DEFAULT 1.0,
    canonical_question_id TEXT REFERENCES public.questions(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for lightning-fast queries
CREATE INDEX IF NOT EXISTS idx_exam_sources_hash ON public.exam_sources(file_hash);
CREATE INDEX IF NOT EXISTS idx_exam_sources_role ON public.exam_sources(source_role);
CREATE INDEX IF NOT EXISTS idx_exam_sources_paper_id ON public.exam_sources(paper_id);
CREATE INDEX IF NOT EXISTS idx_source_questions_source_id ON public.source_questions(source_id);
CREATE INDEX IF NOT EXISTS idx_source_answers_source_id ON public.source_answers(source_id);
CREATE INDEX IF NOT EXISTS idx_matches_question_source ON public.question_answer_matches(question_source_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.question_answer_matches(match_status);

-- Row Level Security (RLS) Configuration
ALTER TABLE public.exam_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_answer_matches ENABLE ROW LEVEL SECURITY;

-- Policies: Read access for authenticated & public exploration
CREATE POLICY "Public read exam sources" ON public.exam_sources FOR SELECT USING (true);
CREATE POLICY "Public read source questions" ON public.source_questions FOR SELECT USING (true);
CREATE POLICY "Public read source answers" ON public.source_answers FOR SELECT USING (true);
CREATE POLICY "Public read question answer matches" ON public.question_answer_matches FOR SELECT USING (true);
