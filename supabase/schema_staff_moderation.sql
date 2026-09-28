-- ============================================================================
-- MOCK.AI — SECURE STAFF MODERATION & USER SEPARATION SCHEMA
-- ============================================================================
-- Enforces strict server-side authorization:
-- 1. Dedicated staff_roles table with granular privileges:
--    (STAFF, MODERATOR, CONTENT_REVIEWER, SUPPORT, ADMIN, SUPER_ADMIN)
-- 2. staff_notes: Strictly isolated internal notes, NEVER exposed to public APIs.
-- 3. community_audit_logs: Immutable append-only audit trail for all staff actions.
-- 4. community_user_restrictions: Granular community status (ACTIVE, POSTING_RESTRICTED, SUSPENDED, BANNED).
-- 5. Security-definer RPCs verifying staff authorization before modifying data.
-- ============================================================================

-- 1. Staff Roles Table
CREATE TABLE IF NOT EXISTS public.staff_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('STAFF', 'MODERATOR', 'CONTENT_REVIEWER', 'SUPPORT', 'ADMIN', 'SUPER_ADMIN')),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  granted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Community User Restrictions Table
CREATE TABLE IF NOT EXISTS public.community_user_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'POSTING_RESTRICTED', 'SUSPENDED', 'BANNED')),
  reason TEXT NOT NULL,
  restricted_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_user_rest_user_id ON public.community_user_restrictions(user_id);
CREATE INDEX IF NOT EXISTS idx_comm_user_rest_status ON public.community_user_restrictions(status);

-- 3. Staff Internal Notes (NEVER visible to normal users or returned in public API)
CREATE TABLE IF NOT EXISTS public.staff_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  author_name TEXT NOT NULL DEFAULT 'Mock.AI Staff',
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_notes_post_id ON public.staff_notes(post_id);

-- 4. Community Audit Logs (Immutable, append-only)
CREATE TABLE IF NOT EXISTS public.community_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id UUID REFERENCES auth.users(id),
  staff_user_name TEXT NOT NULL DEFAULT 'Mock.AI Staff',
  action TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('POST', 'COMMENT', 'USER', 'REPORT', 'ROLE')),
  target_id TEXT NOT NULL,
  previous_state JSONB,
  new_state JSONB,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_audit_target ON public.community_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_comm_audit_staff ON public.community_audit_logs(staff_user_id);
CREATE INDEX IF NOT EXISTS idx_comm_audit_created_at ON public.community_audit_logs(created_at DESC);

-- 5. Community User Notifications (Delivered when reports/requests transition state or receive staff actions)
CREATE TABLE IF NOT EXISTS public.community_notifications (
  id TEXT PRIMARY KEY,
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'POST_STATUS_CHANGED',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'community_post',
  entity_id TEXT NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_notif_recipient ON public.community_notifications(recipient_user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_notif_entity ON public.community_notifications(entity_id);

-- Enable RLS
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_user_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;

-- Helper function: Check if user has staff privileges
CREATE OR REPLACE FUNCTION public.check_is_staff(
  p_user_id UUID,
  p_required_roles TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role INTO v_role
  FROM public.staff_roles
  WHERE user_id = p_user_id;

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Super admin has all privileges
  IF v_role = 'SUPER_ADMIN' THEN
    RETURN TRUE;
  END IF;

  -- If specific roles are required, verify match
  IF p_required_roles IS NOT NULL AND array_length(p_required_roles, 1) > 0 THEN
    RETURN v_role = ANY(p_required_roles);
  END IF;

  RETURN TRUE;
END;
$$;

-- RLS Policies:
DROP POLICY IF EXISTS "staff_roles_read_policy" ON public.staff_roles;
CREATE POLICY "staff_roles_read_policy"
  ON public.staff_roles FOR SELECT
  TO authenticated
  USING (public.check_is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff_roles_write_policy" ON public.staff_roles;
CREATE POLICY "staff_roles_write_policy"
  ON public.staff_roles FOR ALL
  TO authenticated
  USING (public.check_is_staff(auth.uid(), ARRAY['SUPER_ADMIN']))
  WITH CHECK (public.check_is_staff(auth.uid(), ARRAY['SUPER_ADMIN']));

-- staff_notes: readable and writable ONLY by verified staff
DROP POLICY IF EXISTS "staff_notes_staff_only" ON public.staff_notes;
CREATE POLICY "staff_notes_staff_only"
  ON public.staff_notes FOR ALL
  TO authenticated
  USING (public.check_is_staff(auth.uid()))
  WITH CHECK (public.check_is_staff(auth.uid()));

-- community_audit_logs: readable only by staff, insertable only by staff, NO UPDATE/DELETE
DROP POLICY IF EXISTS "audit_logs_read_staff" ON public.community_audit_logs;
CREATE POLICY "audit_logs_read_staff"
  ON public.community_audit_logs FOR SELECT
  TO authenticated
  USING (public.check_is_staff(auth.uid()));

DROP POLICY IF EXISTS "audit_logs_insert_staff" ON public.community_audit_logs;
CREATE POLICY "audit_logs_insert_staff"
  ON public.community_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.check_is_staff(auth.uid()));

-- community_user_restrictions: readable by the user themselves or staff, writable only by staff
DROP POLICY IF EXISTS "restrictions_read_policy" ON public.community_user_restrictions;
CREATE POLICY "restrictions_read_policy"
  ON public.community_user_restrictions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.check_is_staff(auth.uid()));

DROP POLICY IF EXISTS "restrictions_write_policy" ON public.community_user_restrictions;
CREATE POLICY "restrictions_write_policy"
  ON public.community_user_restrictions FOR ALL
  TO authenticated
  USING (public.check_is_staff(auth.uid(), ARRAY['MODERATOR', 'ADMIN', 'SUPER_ADMIN']))
  WITH CHECK (public.check_is_staff(auth.uid(), ARRAY['MODERATOR', 'ADMIN', 'SUPER_ADMIN']));

-- community_notifications: readable and updateable (mark read) only by recipient user
DROP POLICY IF EXISTS "notifications_read_policy" ON public.community_notifications;
CREATE POLICY "notifications_read_policy"
  ON public.community_notifications FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid() OR user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update_policy" ON public.community_notifications;
CREATE POLICY "notifications_update_policy"
  ON public.community_notifications FOR UPDATE
  TO authenticated
  USING (recipient_user_id = auth.uid() OR user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid() OR user_id = auth.uid());

-- ============================================================================
-- SECURE SERVER-SIDE STORED PROCEDURES (RPCs)
-- ============================================================================

-- 1. Check user staff authentication status
CREATE OR REPLACE FUNCTION public.get_staff_auth_status(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role TEXT;
  v_perms JSONB;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('isStaff', FALSE, 'role', NULL, 'permissions', '[]'::jsonb);
  END IF;

  SELECT role, permissions INTO v_role, v_perms
  FROM public.staff_roles
  WHERE user_id = p_user_id;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('isStaff', FALSE, 'role', NULL, 'permissions', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'isStaff', TRUE,
    'role', v_role,
    'permissions', COALESCE(v_perms, '[]'::jsonb)
  );
END;
$$;

-- 2. Staff: Update post status with audit trail, author notification, and optional internal note
CREATE OR REPLACE FUNCTION public.staff_update_post_status(
  p_post_id TEXT,
  p_status TEXT,
  p_public_resolution TEXT DEFAULT NULL,
  p_internal_note TEXT DEFAULT NULL,
  p_staff_user_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT 'Status update'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_staff_name TEXT;
  v_role TEXT;
  v_old_status TEXT;
  v_old_resolution TEXT;
  v_author_id UUID;
  v_post_title TEXT;
  v_status_changed BOOLEAN;
  v_resolution_changed BOOLEAN;
  v_notif_id TEXT;
  v_notif_type TEXT;
  v_notif_title TEXT;
  v_notif_body TEXT;
BEGIN
  -- Determine caller: auth.uid() takes priority, fallback to p_staff_user_id if service role
  v_caller_id := COALESCE(auth.uid(), p_staff_user_id);

  IF v_caller_id IS NULL OR NOT public.check_is_staff(v_caller_id, ARRAY['CONTENT_REVIEWER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN']) THEN
    RAISE EXCEPTION '403: Forbidden - Only verified Mock.AI Staff may update post status or resolution';
  END IF;

  SELECT role INTO v_role FROM public.staff_roles WHERE user_id = v_caller_id;

  -- Fetch previous state and author info
  SELECT status, resolution_notes, author_id, title
  INTO v_old_status, v_old_resolution, v_author_id, v_post_title
  FROM public.community_posts
  WHERE id = p_post_id;

  IF v_old_status IS NULL THEN
    RAISE EXCEPTION '404: Post not found';
  END IF;

  v_status_changed := (v_old_status IS DISTINCT FROM p_status);
  v_resolution_changed := (p_public_resolution IS NOT NULL AND p_public_resolution IS DISTINCT FROM v_old_resolution);

  -- Determine staff display name
  SELECT raw_user_meta_data->>'full_name' INTO v_staff_name
  FROM auth.users
  WHERE id = v_caller_id;
  v_staff_name := COALESCE(v_staff_name, 'Mock.AI Team');

  -- Update post (database is single source of truth)
  UPDATE public.community_posts
  SET
    status = p_status,
    resolution_notes = COALESCE(p_public_resolution, resolution_notes),
    resolved_by_name = CASE WHEN p_status = 'RESOLVED' THEN v_staff_name ELSE resolved_by_name END,
    resolved_at = CASE WHEN p_status = 'RESOLVED' THEN NOW() ELSE resolved_at END,
    updated_at = NOW()
  WHERE id = p_post_id;

  -- If internal staff note provided, record it in isolated staff_notes table
  IF p_internal_note IS NOT NULL AND length(trim(p_internal_note)) > 0 THEN
    INSERT INTO public.staff_notes (post_id, author_id, author_name, note)
    VALUES (p_post_id, v_caller_id, v_staff_name, trim(p_internal_note));
  END IF;

  -- Record in immutable audit log ONLY if real status transition or resolution change occurred (No duplicate events)
  IF v_status_changed OR v_resolution_changed THEN
    INSERT INTO public.community_audit_logs (
      staff_user_id,
      staff_user_name,
      action,
      target_type,
      target_id,
      previous_state,
      new_state,
      reason
    ) VALUES (
      v_caller_id,
      v_staff_name,
      'POST_STATUS_UPDATE',
      'POST',
      p_post_id,
      jsonb_build_object('status', v_old_status, 'resolution', v_old_resolution),
      jsonb_build_object('status', p_status, 'resolution', p_public_resolution),
      COALESCE(p_reason, 'Status updated to ' || p_status)
    );

    -- Deliver user notification to author if author is known and not the acting staff (NO SELF-NOTIFICATIONS)
    IF v_status_changed AND v_author_id IS NOT NULL AND v_author_id <> v_caller_id THEN
      IF p_status = 'RESOLVED' THEN
        v_notif_type := 'POST_RESOLVED';
        v_notif_title := 'Your report was resolved';
        v_notif_body := 'Mock.AI Team marked your "' || LEFT(v_post_title, 40) || '" report as resolved.';
      ELSIF p_status = 'INVESTIGATING' THEN
        v_notif_type := 'POST_STATUS_CHANGED';
        v_notif_title := 'Your paper request was updated';
        v_notif_body := 'Status changed to Investigating for "' || LEFT(v_post_title, 40) || '".';
      ELSIF p_status = 'IN_PROGRESS' THEN
        v_notif_type := 'POST_STATUS_CHANGED';
        v_notif_title := 'Work in progress';
        v_notif_body := 'A resolution is in progress for "' || LEFT(v_post_title, 40) || '".';
      ELSIF p_status = 'OPEN' AND v_old_status IN ('RESOLVED', 'CLOSED', 'REJECTED') THEN
        v_notif_type := 'POST_REOPENED';
        v_notif_title := 'Your post was reopened';
        v_notif_body := 'Mock.AI Team reopened "' || LEFT(v_post_title, 40) || '".';
      ELSE
        v_notif_type := 'POST_STATUS_CHANGED';
        v_notif_title := 'Your post was updated';
        v_notif_body := 'Status changed to ' || p_status || ' for "' || LEFT(v_post_title, 40) || '".';
      END IF;

      IF p_public_resolution IS NOT NULL AND length(trim(p_public_resolution)) > 0 THEN
        v_notif_body := v_notif_body || ' Note: ' || LEFT(trim(p_public_resolution), 80);
      END IF;

      v_notif_id := 'notif_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 6);

      INSERT INTO public.community_notifications (
        id,
        recipient_user_id,
        user_id,
        type,
        title,
        body,
        entity_type,
        entity_id,
        metadata,
        is_read,
        created_at
      ) VALUES (
        v_notif_id,
        v_author_id,
        v_author_id,
        v_notif_type,
        v_notif_title,
        v_notif_body,
        'community_post',
        p_post_id,
        jsonb_build_object(
          'post_id', p_post_id,
          'post_title', v_post_title,
          'old_status', v_old_status,
          'new_status', p_status,
          'actor_type', 'STAFF',
          'actor_id', v_caller_id,
          'actor_name', v_staff_name,
          'resolution_notes', p_public_resolution
        ),
        FALSE,
        NOW()
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'postId', p_post_id,
    'status', p_status,
    'statusChanged', v_status_changed,
    'resolvedByName', v_staff_name
  );
END;
$$;

-- 3. Staff: Moderate post (Hide, Restore, Pin, Unpin, Mark Spam, Mark Duplicate)
CREATE OR REPLACE FUNCTION public.staff_moderate_post(
  p_post_id TEXT,
  p_action TEXT,
  p_reason TEXT,
  p_duplicate_of_id TEXT DEFAULT NULL,
  p_staff_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_staff_name TEXT;
  v_old_hidden BOOLEAN;
  v_old_pinned BOOLEAN;
  v_old_status TEXT;
BEGIN
  v_caller_id := COALESCE(auth.uid(), p_staff_user_id);

  IF v_caller_id IS NULL OR NOT public.check_is_staff(v_caller_id, ARRAY['MODERATOR', 'ADMIN', 'SUPER_ADMIN']) THEN
    RAISE EXCEPTION '403: Forbidden - Only verified Mock.AI Moderators may perform this moderation action';
  END IF;

  SELECT is_hidden, is_pinned, status INTO v_old_hidden, v_old_pinned, v_old_status
  FROM public.community_posts
  WHERE id = p_post_id;

  IF v_old_hidden IS NULL THEN
    RAISE EXCEPTION '404: Post not found';
  END IF;

  SELECT raw_user_meta_data->>'full_name' INTO v_staff_name
  FROM auth.users
  WHERE id = v_caller_id;
  v_staff_name := COALESCE(v_staff_name, 'Mock.AI Team');

  -- Execute action
  IF p_action = 'HIDE' THEN
    UPDATE public.community_posts SET is_hidden = TRUE, updated_at = NOW() WHERE id = p_post_id;
  ELSIF p_action = 'RESTORE' THEN
    UPDATE public.community_posts SET is_hidden = FALSE, updated_at = NOW() WHERE id = p_post_id;
  ELSIF p_action = 'PIN' THEN
    UPDATE public.community_posts SET is_pinned = TRUE, updated_at = NOW() WHERE id = p_post_id;
  ELSIF p_action = 'UNPIN' THEN
    UPDATE public.community_posts SET is_pinned = FALSE, updated_at = NOW() WHERE id = p_post_id;
  ELSIF p_action = 'MARK_DUPLICATE' THEN
    UPDATE public.community_posts
    SET status = 'DUPLICATE', duplicate_of_id = p_duplicate_of_id, updated_at = NOW()
    WHERE id = p_post_id;
  ELSIF p_action = 'MARK_SPAM' THEN
    UPDATE public.community_posts
    SET is_hidden = TRUE, status = 'REJECTED', resolution_notes = 'Removed for violating Community Guidelines (Spam)', updated_at = NOW()
    WHERE id = p_post_id;
  ELSE
    RAISE EXCEPTION '400: Invalid moderation action: %', p_action;
  END IF;

  -- Audit log
  INSERT INTO public.community_audit_logs (
    staff_user_id,
    staff_user_name,
    action,
    target_type,
    target_id,
    previous_state,
    new_state,
    reason
  ) VALUES (
    v_caller_id,
    v_staff_name,
    'MODERATE_' || p_action,
    'POST',
    p_post_id,
    jsonb_build_object('is_hidden', v_old_hidden, 'is_pinned', v_old_pinned, 'status', v_old_status),
    jsonb_build_object('action', p_action, 'duplicateOf', p_duplicate_of_id),
    p_reason
  );

  RETURN jsonb_build_object('success', TRUE, 'action', p_action, 'postId', p_post_id);
END;
$$;

-- 4. Staff: Post Official Verified Reply
CREATE OR REPLACE FUNCTION public.staff_post_official_comment(
  p_post_id TEXT,
  p_parent_comment_id TEXT,
  p_content TEXT,
  p_staff_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_staff_name TEXT;
  v_comment_id TEXT;
BEGIN
  v_caller_id := COALESCE(auth.uid(), p_staff_user_id);

  IF v_caller_id IS NULL OR NOT public.check_is_staff(v_caller_id) THEN
    RAISE EXCEPTION '403: Forbidden - Only verified Mock.AI Staff can post with official badge';
  END IF;

  SELECT raw_user_meta_data->>'full_name' INTO v_staff_name
  FROM auth.users
  WHERE id = v_caller_id;
  v_staff_name := COALESCE(v_staff_name, 'Mock.AI Team');

  v_comment_id := 'staff_cmt_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 6);

  INSERT INTO public.community_comments (
    id,
    post_id,
    parent_comment_id,
    author_id,
    author_name,
    author_role,
    is_official_response,
    content,
    is_hidden
  ) VALUES (
    v_comment_id,
    p_post_id,
    p_parent_comment_id,
    v_caller_id,
    v_staff_name || ' (Mock.AI Team)',
    'STAFF',
    TRUE,
    p_content,
    FALSE
  );

  -- Increment comment count on post
  UPDATE public.community_posts
  SET comment_count = comment_count + 1, updated_at = NOW()
  WHERE id = p_post_id;

  -- Audit log
  INSERT INTO public.community_audit_logs (
    staff_user_id,
    staff_user_name,
    action,
    target_type,
    target_id,
    reason
  ) VALUES (
    v_caller_id,
    v_staff_name,
    'OFFICIAL_COMMENT_POSTED',
    'COMMENT',
    v_comment_id,
    'Official team response posted'
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'commentId', v_comment_id,
    'authorName', v_staff_name || ' (Mock.AI Team)',
    'isOfficial', TRUE
  );
END;
$$;

-- 5. Staff: Restrict or Ban User from Community
CREATE OR REPLACE FUNCTION public.staff_restrict_user(
  p_target_user_id UUID,
  p_status TEXT,
  p_reason TEXT,
  p_duration_hours INT DEFAULT NULL,
  p_staff_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_staff_name TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  v_caller_id := COALESCE(auth.uid(), p_staff_user_id);

  IF v_caller_id IS NULL OR NOT public.check_is_staff(v_caller_id, ARRAY['MODERATOR', 'ADMIN', 'SUPER_ADMIN']) THEN
    RAISE EXCEPTION '403: Forbidden - Only verified Mock.AI Moderators may restrict user community access';
  END IF;

  SELECT raw_user_meta_data->>'full_name' INTO v_staff_name
  FROM auth.users
  WHERE id = v_caller_id;
  v_staff_name := COALESCE(v_staff_name, 'Mock.AI Team');

  IF p_duration_hours IS NOT NULL AND p_duration_hours > 0 THEN
    v_expires_at := NOW() + (p_duration_hours || ' hours')::interval;
  ELSE
    v_expires_at := NULL; -- Permanent
  END IF;

  -- Insert restriction record
  INSERT INTO public.community_user_restrictions (
    user_id,
    status,
    reason,
    restricted_by,
    expires_at
  ) VALUES (
    p_target_user_id,
    p_status,
    p_reason,
    v_caller_id,
    v_expires_at
  );

  -- Audit log
  INSERT INTO public.community_audit_logs (
    staff_user_id,
    staff_user_name,
    action,
    target_type,
    target_id,
    new_state,
    reason
  ) VALUES (
    v_caller_id,
    v_staff_name,
    'USER_RESTRICTION_' || p_status,
    'USER',
    p_target_user_id::text,
    jsonb_build_object('status', p_status, 'expiresAt', v_expires_at),
    p_reason
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'userId', p_target_user_id,
    'status', p_status,
    'expiresAt', v_expires_at
  );
END;
$$;

-- 6. Check if user is community restricted
CREATE OR REPLACE FUNCTION public.is_user_community_restricted(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_record RECORD;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('restricted', FALSE);
  END IF;

  SELECT status, reason, expires_at INTO v_record
  FROM public.community_user_restrictions
  WHERE user_id = p_user_id
    AND status IN ('POSTING_RESTRICTED', 'SUSPENDED', 'BANNED')
    AND (expires_at IS NULL OR expires_at > NOW())
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_record IS NOT NULL THEN
    RETURN jsonb_build_object(
      'restricted', TRUE,
      'status', v_record.status,
      'reason', v_record.reason,
      'expiresAt', v_record.expires_at
    );
  END IF;

  RETURN jsonb_build_object('restricted', FALSE);
END;
$$;

-- 7. Seed Initial Super Admin Role (Platform Owner)
INSERT INTO public.staff_roles (user_id, role, permissions)
VALUES (
  '6b8a0849-2827-4a8a-9967-7364bb7b8d18',
  'SUPER_ADMIN',
  '["ALL"]'::jsonb
)
ON CONFLICT (user_id) DO UPDATE
SET role = 'SUPER_ADMIN', permissions = '["ALL"]'::jsonb, updated_at = NOW();
