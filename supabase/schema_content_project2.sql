-- ==============================================================================
-- MOCK.AI — SUPABASE PROJECT 2: EXAM CONTENT SCHEMA
-- Purpose: Stores all exam content — exams, papers, sections, questions,
--          options, answers, and asset metadata.
--
-- IMPORTANT:
--   This schema is for PROJECT 2 (content) ONLY.
--   It does NOT reference auth.users — that belongs to PROJECT 1.
--   Run this in: Supabase Project 2 Dashboard → SQL Editor → Run
--
-- This script is idempotent. Safe to run multiple times.
-- ==============================================================================

-- =============================================================================
-- EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- =============================================================================
-- 1. EXAM CATALOG
-- =============================================================================
-- One row per exam type (ssc-chsl, gate, upsc-cse, etc.)
CREATE TABLE IF NOT EXISTS public.competitive_exams (
    id             TEXT PRIMARY KEY,      -- e.g. 'ssc-chsl', 'gate'
    name           TEXT NOT NULL,         -- e.g. 'SSC CHSL'
    full_name      TEXT NOT NULL,
    organization   TEXT NOT NULL,
    category       TEXT NOT NULL,         -- e.g. 'SSC / Government', 'Engineering'
    description    TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'COMING_SOON'
                   CHECK (status IN ('AVAILABLE', 'COMING_SOON')),
    available_years INT[] DEFAULT '{}',
    paper_count    INT  NOT NULL DEFAULT 0,
    tier           TEXT,                  -- e.g. 'Tier 1 & Tier 2', 'Single Stage'
    default_pattern JSONB NOT NULL DEFAULT '{}'::jsonb,
    highlights      TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2. EXAM PAPERS
-- =============================================================================
-- One row per paper/session/shift.
-- GATE 2025 CS-1 and SSC CHSL 2025 13-Nov S2 are both exam_papers rows.
CREATE TABLE IF NOT EXISTS public.exam_papers (
    id               TEXT PRIMARY KEY,    -- e.g. 'gate-2025-cs-1', 'ssc-chsl-2025-13nov-s2'
    exam_id          TEXT NOT NULL REFERENCES public.competitive_exams(id) ON DELETE CASCADE,
    edition_year     INT  NOT NULL,
    title            TEXT NOT NULL,
    sub_title        TEXT,
    date             DATE,               -- Null for GATE (no fixed date per shift)
    shift            TEXT NOT NULL DEFAULT '',
    tier             TEXT NOT NULL DEFAULT '',
    paper_type       TEXT NOT NULL DEFAULT 'CBE_OBJECTIVE'
                     CHECK (paper_type IN ('CBE_OBJECTIVE','DESCRIPTIVE')),
    paper_code       TEXT,               -- GATE discipline code: 'CS', 'ME', etc.
    discipline       TEXT,               -- Full discipline name
    language         TEXT NOT NULL DEFAULT 'English',
    duration_minutes INT  NOT NULL DEFAULT 60,
    total_marks      NUMERIC NOT NULL DEFAULT 100,
    total_questions  INT  NOT NULL DEFAULT 65,
    is_complete      BOOL NOT NULL DEFAULT true,
    marking_scheme   JSONB NOT NULL DEFAULT '{
        "marksPerCorrect": 1.0,
        "negativeMarks": 0.33,
        "unansweredMarks": 0.0
    }'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Prevent same paper being inserted twice
    CONSTRAINT uq_paper_identity UNIQUE (exam_id, edition_year, shift, tier, paper_code, language)
);

-- =============================================================================
-- 3. EXAM SECTIONS
-- =============================================================================
-- Sections within a paper (e.g. "General Aptitude", "Core Subject")
CREATE TABLE IF NOT EXISTS public.exam_sections (
    id             TEXT PRIMARY KEY,      -- e.g. 'gate-2025-cs-1-ga'
    paper_id       TEXT NOT NULL REFERENCES public.exam_papers(id) ON DELETE CASCADE,
    section_order  INT  NOT NULL DEFAULT 0,
    name           TEXT NOT NULL,         -- 'General Aptitude'
    section_key    TEXT NOT NULL,         -- 'ga', 'english', 'reasoning'
    question_count INT  NOT NULL DEFAULT 0,
    max_marks      NUMERIC NOT NULL DEFAULT 0,
    start_index    INT  NOT NULL DEFAULT 0,
    end_index      INT  NOT NULL DEFAULT 0,
    CONSTRAINT uq_section_per_paper UNIQUE (paper_id, section_key)
);

-- =============================================================================
-- 4. CONTENT ASSETS (IMAGE METADATA)
-- =============================================================================
-- Metadata record for every image stored in Supabase Storage.
-- PostgreSQL stores only the reference; the binary lives in Storage.
CREATE TABLE IF NOT EXISTS public.content_assets (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_path     TEXT NOT NULL UNIQUE, -- path inside bucket, e.g. 'gate/2025/cs-1/q5_diag.png'
    bucket           TEXT NOT NULL DEFAULT 'exam-assets',
    public_url       TEXT,                 -- full CDN URL (cached after upload)
    mime_type        TEXT NOT NULL DEFAULT 'image/png',
    width_px         INT,
    height_px        INT,
    file_size_bytes  BIGINT,
    content_hash     TEXT NOT NULL UNIQUE, -- SHA-256 of file bytes (dedup key)
    asset_type       TEXT NOT NULL DEFAULT 'diagram'
                     CHECK (asset_type IN ('diagram','option_image','graph','table','matrix','figure')),
    source_paper_id  TEXT REFERENCES public.exam_papers(id) ON DELETE SET NULL,
    source_file      TEXT,                 -- original local path (for provenance)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 5. QUESTIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.questions (
    id                   TEXT PRIMARY KEY,   -- e.g. 'gate-2025-cs-1-q1'
    paper_id             TEXT NOT NULL REFERENCES public.exam_papers(id) ON DELETE CASCADE,
    section_id           TEXT REFERENCES public.exam_sections(id) ON DELETE SET NULL,
    question_number      INT  NOT NULL,
    question_text        TEXT NOT NULL DEFAULT '',
    question_type        TEXT NOT NULL DEFAULT 'MCQ'
                         CHECK (question_type IN ('MCQ','MSQ','NAT','DESCRIPTIVE')),
    marks                NUMERIC NOT NULL DEFAULT 1,
    negative_marks       NUMERIC NOT NULL DEFAULT 0,
    -- Answer fields (denormalized for read performance)
    correct_answer       TEXT,              -- 'A', 'B', 'C', 'D' or range string for NAT
    correct_answer_index INT,               -- 0-3 for MCQ, -1 for NAT/MSQ
    correct_answer_set   TEXT[],            -- for MSQ: ['A','C']
    correct_answer_sets  JSONB,             -- for MSQ with OR alternatives: [['A','D'],['C','D']]
    correct_answer_indices INT[],           -- for MSQ: [0,2]
    answer_range         JSONB,             -- for NAT: {"min": 0.16, "max": 0.17}
    answer_ranges        JSONB,             -- for NAT with OR ranges
    is_mta               BOOL NOT NULL DEFAULT false,  -- Marks To All
    explanation          TEXT NOT NULL DEFAULT '',
    -- Visual assets
    diagram_asset_id     UUID REFERENCES public.content_assets(id) ON DELETE SET NULL,
    diagram_asset_ids    UUID[],            -- multiple diagrams
    -- Extra metadata
    word_limit           TEXT,              -- for DESCRIPTIVE
    model_solution       TEXT,              -- for DESCRIPTIVE
    rubrics              TEXT[],
    raw_data             JSONB,             -- preserve original JSON for schema evolution
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_question_per_paper UNIQUE (paper_id, question_number)
);

-- =============================================================================
-- 6. QUESTION OPTIONS
-- =============================================================================
-- Individual A/B/C/D options. Separated for clean text+image support.
CREATE TABLE IF NOT EXISTS public.question_options (
    id           TEXT PRIMARY KEY,          -- e.g. 'gate-2025-cs-1-q1-A'
    question_id  TEXT NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    option_label CHAR(1) NOT NULL CHECK (option_label IN ('A','B','C','D')),
    option_index INT  NOT NULL CHECK (option_index BETWEEN 0 AND 3),
    option_text  TEXT,                      -- NULL if image-only option
    asset_id     UUID REFERENCES public.content_assets(id) ON DELETE SET NULL,
    CONSTRAINT uq_option_per_question UNIQUE (question_id, option_label)
);

-- =============================================================================
-- 7. INGESTION RUNS (PROVENANCE / AUDIT LOG)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ingestion_runs (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    run_label                   TEXT,          -- e.g. 'gate-2025-full' or 'ssc-chsl-2019'
    papers_discovered           INT NOT NULL DEFAULT 0,
    papers_imported             INT NOT NULL DEFAULT 0,
    papers_skipped_duplicate    INT NOT NULL DEFAULT 0,
    questions_imported          INT NOT NULL DEFAULT 0,
    images_uploaded             INT NOT NULL DEFAULT 0,
    images_skipped_duplicate    INT NOT NULL DEFAULT 0,
    images_rejected_watermark   INT NOT NULL DEFAULT 0,
    images_rejected_promo       INT NOT NULL DEFAULT 0,
    errors                      JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary                     TEXT,
    completed_at                TIMESTAMPTZ
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_papers_exam_id         ON public.exam_papers(exam_id);
CREATE INDEX IF NOT EXISTS idx_papers_year            ON public.exam_papers(edition_year);
CREATE INDEX IF NOT EXISTS idx_papers_exam_year       ON public.exam_papers(exam_id, edition_year);
CREATE INDEX IF NOT EXISTS idx_sections_paper_id      ON public.exam_sections(paper_id);
CREATE INDEX IF NOT EXISTS idx_questions_paper_id     ON public.questions(paper_id);
CREATE INDEX IF NOT EXISTS idx_questions_section_id   ON public.questions(section_id);
CREATE INDEX IF NOT EXISTS idx_questions_paper_num    ON public.questions(paper_id, question_number);
CREATE INDEX IF NOT EXISTS idx_options_question_id    ON public.question_options(question_id);
CREATE INDEX IF NOT EXISTS idx_assets_content_hash    ON public.content_assets(content_hash);
CREATE INDEX IF NOT EXISTS idx_assets_storage_path    ON public.content_assets(storage_path);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- All exam content is publicly readable (SELECT).
-- INSERT / UPDATE / DELETE only via service_role (admin/migration tooling).
-- No auth.users dependency — Project 2 has no auth schema.

ALTER TABLE public.competitive_exams  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_papers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_assets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_runs     ENABLE ROW LEVEL SECURITY;

-- Public SELECT policies (anyone can read exam content)
DROP POLICY IF EXISTS "Public read competitive_exams"  ON public.competitive_exams;
DROP POLICY IF EXISTS "Public read exam_papers"        ON public.exam_papers;
DROP POLICY IF EXISTS "Public read exam_sections"      ON public.exam_sections;
DROP POLICY IF EXISTS "Public read questions"          ON public.questions;
DROP POLICY IF EXISTS "Public read question_options"   ON public.question_options;
DROP POLICY IF EXISTS "Public read content_assets"     ON public.content_assets;
DROP POLICY IF EXISTS "Admin read ingestion_runs"      ON public.ingestion_runs;

CREATE POLICY "Public read competitive_exams"
    ON public.competitive_exams FOR SELECT USING (true);

CREATE POLICY "Public read exam_papers"
    ON public.exam_papers FOR SELECT USING (true);

CREATE POLICY "Public read exam_sections"
    ON public.exam_sections FOR SELECT USING (true);

CREATE POLICY "Public read questions"
    ON public.questions FOR SELECT USING (true);

CREATE POLICY "Public read question_options"
    ON public.question_options FOR SELECT USING (true);

CREATE POLICY "Public read content_assets"
    ON public.content_assets FOR SELECT USING (true);

-- ingestion_runs: only service_role can see (no anon policy = denied)
-- service_role bypasses RLS automatically

-- =============================================================================
-- INITIAL SEED: EXAM CATALOG
-- =============================================================================
INSERT INTO public.competitive_exams
  (id, name, full_name, organization, category, description, status,
   available_years, paper_count, tier, default_pattern, highlights)
VALUES
  (
    'ssc-chsl',
    'SSC CHSL',
    'Combined Higher Secondary (10+2) Level Examination',
    'Staff Selection Commission (SSC)',
    'SSC / Government',
    'Premier national competitive examination for recruitment to Lower Division Clerk (LDC), Junior Secretariat Assistant (JSA), and Data Entry Operator (DEO) positions.',
    'AVAILABLE',
    ARRAY[2025, 2024, 2023, 2022, 2021, 2020, 2019],
    204,
    'Tier 1 & Tier 2',
    '{
      "durationMinutes": 60, "totalQuestions": 100, "totalMarks": 200,
      "markingScheme": {"marksPerCorrect": 2.0, "negativeMarks": 0.5, "unansweredMarks": 0.0},
      "sections": ["English Language","General Intelligence & Reasoning","Quantitative Aptitude","General Awareness"]
    }'::jsonb,
    ARRAY[
      'Official 2019–2025 Tier 1 (196 Papers) & Tier 2 (8 Papers)',
      'Accurate +2/-0.5 (Tier 1) & +3/-1 (Tier 2) Scoring Engines',
      'Dedicated Tier 2 Descriptive Exam Simulation',
      'Complete Diagrams, Graphs, and Visual Option Figures'
    ]
  ),
  (
    'gate',
    'GATE',
    'Graduate Aptitude Test in Engineering',
    'IISc & IITs (Joint Committee)',
    'Engineering',
    'High-stakes examination for admission to postgraduate engineering programs and PSU recruitment.',
    'AVAILABLE',
    ARRAY[2025, 2024],
    76,
    'Single Stage',
    '{
      "durationMinutes": 180, "totalQuestions": 65, "totalMarks": 100,
      "markingScheme": {"marksPerCorrect": 1.0, "negativeMarks": 0.33, "unansweredMarks": 0.0},
      "sections": ["General Aptitude","Engineering Mathematics","Core Technical Subject"]
    }'::jsonb,
    ARRAY[
      '76 Official Papers across 2025 (IIT Roorkee) & 2024 (IISc Bangalore)',
      'Full Fidelity MCQ, MSQ (Multiple Select) & NAT (Numerical Answer Type)',
      'High-Resolution Diagrams, Circuit Schematics & Mathematical Formulations',
      'Official Master Answer Keys with Range-Tolerance Verification'
    ]
  )
ON CONFLICT (id) DO UPDATE SET
    status          = EXCLUDED.status,
    available_years = EXCLUDED.available_years,
    paper_count     = EXCLUDED.paper_count,
    default_pattern = EXCLUDED.default_pattern,
    highlights      = EXCLUDED.highlights,
    updated_at      = now();

-- ==============================================================================
-- END OF SCHEMA
-- Run this entire script in Supabase Project 2 → SQL Editor → Run
-- ==============================================================================
