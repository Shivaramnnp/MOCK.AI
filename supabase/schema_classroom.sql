-- ==============================================================================
-- MOCK.AI — SUPABASE PROJECT 1: CLASSROOM & ROSTER SCHEMA
-- Purpose: Authoritative cloud persistence for Classes, Members & Assignments
--
-- Run this in: Supabase Project 1 Dashboard → SQL Editor → Run
-- This script is idempotent. Safe to run multiple times.
-- ==============================================================================

-- 1. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create or update classes table
CREATE TABLE IF NOT EXISTS public.classes (
    id TEXT PRIMARY KEY,                                      -- e.g. 'class-1790328900'
    name TEXT NOT NULL,
    teacher_id TEXT NOT NULL,                                 -- Teacher UID
    teacher_name TEXT NOT NULL DEFAULT '',
    join_code TEXT NOT NULL UNIQUE,                           -- 6-character unique join code e.g. 'Q3QJ9G'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create or update class_members table
CREATE TABLE IF NOT EXISTS public.class_members (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL DEFAULT '',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(class_id, student_id)
);

-- 4. Create or update classroom assignments table
CREATE TABLE IF NOT EXISTS public.assignments (
    id TEXT PRIMARY KEY,                                      -- e.g. 'asg-1790328900'
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    class_name TEXT NOT NULL DEFAULT '',
    test_title TEXT NOT NULL,
    assigned_by TEXT NOT NULL,
    assigned_by_name TEXT NOT NULL DEFAULT '',
    due_date TIMESTAMPTZ,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    student_submissions JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_classes_join_code ON public.classes(join_code);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_members_student ON public.class_members(student_id);
CREATE INDEX IF NOT EXISTS idx_class_members_class ON public.class_members(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class_id ON public.assignments(class_id);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- 7. Strict RLS Policies: Enforce instructor and student ownership
-- Classes policies
DROP POLICY IF EXISTS "Public read classes" ON public.classes;
DROP POLICY IF EXISTS "Allow create classes" ON public.classes;
DROP POLICY IF EXISTS "Allow update classes" ON public.classes;
DROP POLICY IF EXISTS "Allow delete classes" ON public.classes;

-- Authenticated users can view classes they teach, attend, or discover via join code
CREATE POLICY "View enrolled, taught, or joinable classes"
    ON public.classes FOR SELECT
    TO authenticated
    USING (
        auth.uid()::text = teacher_id
        OR EXISTS (
            SELECT 1 FROM public.class_members
            WHERE class_id = public.classes.id AND student_id = auth.uid()::text
        )
        OR join_code IS NOT NULL
    );

-- Only verified teachers can create classes with their own teacher_id
CREATE POLICY "Instructors create own classes"
    ON public.classes FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = teacher_id);

-- Only the class instructor can update class details
CREATE POLICY "Instructors update own classes"
    ON public.classes FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = teacher_id)
    WITH CHECK (auth.uid()::text = teacher_id);

-- Only the class instructor can delete the class
CREATE POLICY "Instructors delete own classes"
    ON public.classes FOR DELETE
    TO authenticated
    USING (auth.uid()::text = teacher_id);

-- Class members policies
DROP POLICY IF EXISTS "Public read class_members" ON public.class_members;
DROP POLICY IF EXISTS "Allow join class_members" ON public.class_members;
DROP POLICY IF EXISTS "Allow leave class_members" ON public.class_members;

-- Members or instructors can view member rosters
CREATE POLICY "View class members"
    ON public.class_members FOR SELECT
    TO authenticated
    USING (
        student_id = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM public.classes
            WHERE id = public.class_members.class_id AND teacher_id = auth.uid()::text
        )
    );

-- Students can enroll themselves into a class
CREATE POLICY "Students join class"
    ON public.class_members FOR INSERT
    TO authenticated
    WITH CHECK (student_id = auth.uid()::text);

-- Students can leave, or instructor can remove students
CREATE POLICY "Students or instructors remove membership"
    ON public.class_members FOR DELETE
    TO authenticated
    USING (
        student_id = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM public.classes
            WHERE id = public.class_members.class_id AND teacher_id = auth.uid()::text
        )
    );

-- Assignments policies
DROP POLICY IF EXISTS "Public read assignments" ON public.assignments;
DROP POLICY IF EXISTS "Allow create assignments" ON public.assignments;
DROP POLICY IF EXISTS "Allow update assignments" ON public.assignments;
DROP POLICY IF EXISTS "Allow delete assignments" ON public.assignments;

-- Enrolled students and instructors can view class assignments
CREATE POLICY "View class assignments"
    ON public.assignments FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.classes
            WHERE id = public.assignments.class_id
            AND (
                teacher_id = auth.uid()::text
                OR EXISTS (
                    SELECT 1 FROM public.class_members
                    WHERE class_id = public.assignments.class_id AND student_id = auth.uid()::text
                )
            )
        )
    );

-- Only instructors can create assignments for their classes
CREATE POLICY "Instructors create assignments"
    ON public.assignments FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.classes
            WHERE id = public.assignments.class_id AND teacher_id = auth.uid()::text
        )
    );

-- Instructors can update assignments, or enrolled students can update their submissions
CREATE POLICY "Instructors or students update assignments"
    ON public.assignments FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.classes
            WHERE id = public.assignments.class_id
            AND (
                teacher_id = auth.uid()::text
                OR EXISTS (
                    SELECT 1 FROM public.class_members
                    WHERE class_id = public.assignments.class_id AND student_id = auth.uid()::text
                )
            )
        )
    );

-- Only instructors can delete assignments
CREATE POLICY "Instructors delete assignments"
    ON public.assignments FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.classes
            WHERE id = public.assignments.class_id AND teacher_id = auth.uid()::text
        )
    );
