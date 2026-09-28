-- ==============================================================================
-- MOCK.AI — SUPABASE PROJECT 1: COMMUNITY & FEEDBACK HUB SCHEMA
-- Purpose: Authoritative persistence for paper requests, question reports,
--          bug reports, feature requests, discussions, comments, and moderation.
--
-- IMPORTANT:
--   Run this in Supabase Project 1 Dashboard → SQL Editor → Run
--   This script is idempotent. Safe to run multiple times.
-- ==============================================================================

-- 1. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create community_posts table
CREATE TABLE IF NOT EXISTS public.community_posts (
    id TEXT PRIMARY KEY DEFAULT ('post_' || gen_random_uuid()),
    type TEXT NOT NULL CHECK (type IN ('PAPER_REQUEST', 'QUESTION_REPORT', 'BUG_REPORT', 'FEATURE_REQUEST', 'DISCUSSION')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL DEFAULT 'Scholar',
    author_role TEXT NOT NULL DEFAULT 'STUDENT',
    status TEXT NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'INVESTIGATING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'DUPLICATE', 'NEEDS_INFORMATION')),
    priority TEXT NOT NULL DEFAULT 'NORMAL'
        CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
    support_count INT NOT NULL DEFAULT 0,
    comment_count INT NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    duplicate_of_id TEXT REFERENCES public.community_posts(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    resolved_by_name TEXT,
    resolved_at TIMESTAMPTZ,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    is_hidden BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create community_comments table (Threaded replies)
CREATE TABLE IF NOT EXISTS public.community_comments (
    id TEXT PRIMARY KEY DEFAULT ('comment_' || gen_random_uuid()),
    post_id TEXT NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
    parent_comment_id TEXT REFERENCES public.community_comments(id) ON DELETE CASCADE,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL DEFAULT 'Scholar',
    author_role TEXT NOT NULL DEFAULT 'STUDENT',
    is_official_response BOOLEAN NOT NULL DEFAULT false,
    content TEXT NOT NULL,
    is_hidden BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create community_supports table (Prevent duplicate supports)
CREATE TABLE IF NOT EXISTS public.community_supports (
    id TEXT PRIMARY KEY DEFAULT ('sup_' || gen_random_uuid()),
    post_id TEXT NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_community_supports_post_user UNIQUE (post_id, user_id)
);

-- 5. Create community_reports table (Content moderation)
CREATE TABLE IF NOT EXISTS public.community_reports (
    id TEXT PRIMARY KEY DEFAULT ('rep_' || gen_random_uuid()),
    target_type TEXT NOT NULL CHECK (target_type IN ('POST', 'COMMENT')),
    target_id TEXT NOT NULL,
    reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL CHECK (reason IN ('SPAM', 'ABUSE', 'INAPPROPRIATE', 'SCAM', 'INCORRECT', 'OTHER')),
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'REVIEWED', 'DISMISSED', 'ACTIONED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Indexes for Performance & Scale
CREATE INDEX IF NOT EXISTS idx_comm_posts_type ON public.community_posts(type);
CREATE INDEX IF NOT EXISTS idx_comm_posts_status ON public.community_posts(status);
CREATE INDEX IF NOT EXISTS idx_comm_posts_created ON public.community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_posts_author ON public.community_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_comm_posts_support_count ON public.community_posts(support_count DESC);
CREATE INDEX IF NOT EXISTS idx_comm_posts_metadata ON public.community_posts USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_comm_comments_post_id ON public.community_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comm_comments_parent ON public.community_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comm_supports_post ON public.community_supports(post_id);
CREATE INDEX IF NOT EXISTS idx_comm_reports_target ON public.community_reports(target_type, target_id);

-- 7. Trigger to maintain comment_count automatically
CREATE OR REPLACE FUNCTION public.sync_community_comment_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.community_posts
        SET comment_count = comment_count + 1, updated_at = now()
        WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.community_posts
        SET comment_count = GREATEST(0, comment_count - 1), updated_at = now()
        WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_community_comment_count ON public.community_comments;
CREATE TRIGGER trg_sync_community_comment_count
    AFTER INSERT OR DELETE ON public.community_comments
    FOR EACH ROW EXECUTE FUNCTION public.sync_community_comment_count();

-- 8. RPC: Atomic Support Toggle with Count Synchronization
CREATE OR REPLACE FUNCTION public.toggle_community_post_support(p_post_id TEXT, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_exists BOOLEAN;
    v_new_count INT;
    v_is_supported BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.community_supports
        WHERE post_id = p_post_id AND user_id = p_user_id
    ) INTO v_exists;

    IF v_exists THEN
        DELETE FROM public.community_supports
        WHERE post_id = p_post_id AND user_id = p_user_id;

        UPDATE public.community_posts
        SET support_count = GREATEST(0, support_count - 1)
        WHERE id = p_post_id
        RETURNING support_count INTO v_new_count;

        v_is_supported := false;
    ELSE
        INSERT INTO public.community_supports (post_id, user_id)
        VALUES (p_post_id, p_user_id);

        UPDATE public.community_posts
        SET support_count = support_count + 1
        WHERE id = p_post_id
        RETURNING support_count INTO v_new_count;

        v_is_supported := true;
    END IF;

    RETURN jsonb_build_object(
        'postId', p_post_id,
        'supported', v_is_supported,
        'supportCount', COALESCE(v_new_count, 0)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_community_post_support(TEXT, UUID) TO anon, authenticated, service_role;

-- 9. Enable Row Level Security (RLS)
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_supports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

-- 10. RLS Policies
-- Community Posts:
-- Anyone (including anon) can view non-hidden, non-deleted posts
DROP POLICY IF EXISTS "Public view non-hidden community posts" ON public.community_posts;
CREATE POLICY "Public view non-hidden community posts"
    ON public.community_posts FOR SELECT
    USING (is_hidden = false AND is_deleted = false);

-- Authenticated users can create community posts
DROP POLICY IF EXISTS "Authenticated users create community posts" ON public.community_posts;
CREATE POLICY "Authenticated users create community posts"
    ON public.community_posts FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = author_id);

-- Authors can update their own posts
DROP POLICY IF EXISTS "Authors update own community posts" ON public.community_posts;
CREATE POLICY "Authors update own community posts"
    ON public.community_posts FOR UPDATE
    TO authenticated
    USING (auth.uid() = author_id)
    WITH CHECK (auth.uid() = author_id);

-- Authors can delete their own posts
DROP POLICY IF EXISTS "Authors delete own community posts" ON public.community_posts;
CREATE POLICY "Authors delete own community posts"
    ON public.community_posts FOR DELETE
    TO authenticated
    USING (auth.uid() = author_id);

-- Community Comments:
-- Anyone can read non-hidden comments
DROP POLICY IF EXISTS "Public view non-hidden comments" ON public.community_comments;
CREATE POLICY "Public view non-hidden comments"
    ON public.community_comments FOR SELECT
    USING (is_hidden = false);

-- Authenticated users can post comments
DROP POLICY IF EXISTS "Authenticated users post comments" ON public.community_comments;
CREATE POLICY "Authenticated users post comments"
    ON public.community_comments FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = author_id);

-- Authors can edit/delete own comments
DROP POLICY IF EXISTS "Authors update own comments" ON public.community_comments;
CREATE POLICY "Authors update own comments"
    ON public.community_comments FOR UPDATE
    TO authenticated
    USING (auth.uid() = author_id)
    WITH CHECK (auth.uid() = author_id);

-- Community Supports:
-- Authenticated users can view their own supports
DROP POLICY IF EXISTS "Users view own supports" ON public.community_supports;
CREATE POLICY "Users view own supports"
    ON public.community_supports FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Authenticated users can insert supports
DROP POLICY IF EXISTS "Users insert own supports" ON public.community_supports;
CREATE POLICY "Users insert own supports"
    ON public.community_supports FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Authenticated users can delete own supports
DROP POLICY IF EXISTS "Users delete own supports" ON public.community_supports;
CREATE POLICY "Users delete own supports"
    ON public.community_supports FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Community Reports:
-- Authenticated users can submit reports
DROP POLICY IF EXISTS "Users submit reports" ON public.community_reports;
CREATE POLICY "Users submit reports"
    ON public.community_reports FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = reporter_id);

-- ==============================================================================
-- 10. Custom Exam & Custom Year Fields for Community Posts
-- ==============================================================================
ALTER TABLE public.community_posts
    ADD COLUMN IF NOT EXISTS custom_exam_name TEXT,
    ADD COLUMN IF NOT EXISTS custom_exam_normalized TEXT,
    ADD COLUMN IF NOT EXISTS custom_exam_authority TEXT,
    ADD COLUMN IF NOT EXISTS custom_year INT,
    ADD COLUMN IF NOT EXISTS custom_stage TEXT,
    ADD COLUMN IF NOT EXISTS custom_session TEXT;

CREATE INDEX IF NOT EXISTS idx_comm_posts_custom_exam_norm
    ON public.community_posts (custom_exam_normalized);

CREATE INDEX IF NOT EXISTS idx_comm_posts_custom_year
    ON public.community_posts (custom_year);

-- ==============================================================================
-- 11. Post Management: Edit & Soft Delete Architecture
-- ==============================================================================
ALTER TABLE public.community_posts
    ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comm_posts_is_deleted
    ON public.community_posts (is_deleted);

-- RPC: Secure Author / Staff Soft Delete with Authorization Verification
CREATE OR REPLACE FUNCTION public.delete_community_post(p_post_id TEXT, p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_post RECORD;
    v_is_staff BOOLEAN;
BEGIN
    v_caller_id := COALESCE(auth.uid(), p_user_id);
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION '401: Unauthorized - Please sign in to delete this post';
    END IF;

    SELECT id, author_id, title INTO v_post
    FROM public.community_posts
    WHERE id = p_post_id;

    IF v_post.id IS NULL THEN
        RAISE EXCEPTION '404: Post not found';
    END IF;

    -- Check if user is the author or a verified staff member
    v_is_staff := public.check_is_staff(v_caller_id);
    IF v_post.author_id IS DISTINCT FROM v_caller_id AND NOT v_is_staff THEN
        RAISE EXCEPTION '403: Forbidden - You do not have permission to delete this post';
    END IF;

    -- Soft delete post
    UPDATE public.community_posts
    SET is_deleted = true,
        deleted_at = now(),
        deleted_by = v_caller_id,
        updated_at = now()
    WHERE id = p_post_id;

    -- Log staff deletion in audit log if performed by staff on another user's post
    IF v_is_staff AND v_post.author_id IS DISTINCT FROM v_caller_id THEN
        INSERT INTO public.community_audit_logs (
            staff_user_id,
            staff_user_name,
            action,
            target_type,
            target_id,
            reason
        ) VALUES (
            v_caller_id,
            'Mock.AI Staff',
            'POST_SOFT_DELETED',
            'POST',
            p_post_id,
            'Post deleted by staff moderation'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'postId', p_post_id,
        'deletedAt', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_community_post(TEXT, UUID) TO anon, authenticated, service_role;


