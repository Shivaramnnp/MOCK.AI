/**
 * MOCK.AI — Staff Operations & Security Service
 *
 * Dedicated service for Mock.AI Team operations:
 * - Server-side staff authorization checks via Security Definer RPCs
 * - Post status updates with mandatory audit logging and isolated internal notes
 * - Moderation actions (Hide, Restore, Pin, Unpin, Mark Duplicate, Mark Spam)
 * - Official verified team comments
 * - User community access restrictions (Posting restricted, Suspended, Banned)
 * - Audit log retrieval (immutable append-only log)
 * - Internal staff notes management (RLS protected, never leaked to public queries)
 */

import { supabaseService } from './supabase';
import {
  StaffAuthStatus,
  StaffRole,
  UserRestrictionCheckResult,
  CommunityUserRestrictionStatus,
  CommunityPostStatus,
  StaffNote,
  CommunityAuditLog,
  CommunityReport,
} from '../types';

class StaffService {
  private authCache: Map<string, { status: StaffAuthStatus; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute cache

  /**
   * Check if user has staff privileges via secure server-side RPC.
   * Never relies on client-side state or localStorage.
   */
  async getStaffAuthStatus(userId?: string | null): Promise<StaffAuthStatus> {
    if (!userId) {
      return { isStaff: false, role: null, permissions: [] };
    }

    // Check memory cache
    const cached = this.authCache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.status;
    }

    const client = supabaseService.getClient();
    if (!client) {
      return { isStaff: false, role: null, permissions: [] };
    }

    try {
      const { data, error } = await client.rpc('get_staff_auth_status', {
        p_user_id: userId,
      });

      if (error) {
        console.warn('[StaffService] get_staff_auth_status RPC error:', error.message);
        return { isStaff: false, role: null, permissions: [] };
      }

      const status: StaffAuthStatus = {
        isStaff: Boolean(data?.isStaff),
        role: (data?.role as StaffRole) || null,
        permissions: Array.isArray(data?.permissions) ? data.permissions : [],
      };

      this.authCache.set(userId, { status, timestamp: Date.now() });
      return status;
    } catch (err) {
      console.warn('[StaffService] RPC call failed:', err);
      return { isStaff: false, role: null, permissions: [] };
    }
  }

  /**
   * Helper: check if a user has verified staff privileges.
   */
  async checkIsStaff(userId?: string | null): Promise<boolean> {
    if (!userId) return false;
    const status = await this.getStaffAuthStatus(userId);
    return status.isStaff;
  }

  /**
   * Invalidate auth cache on sign-out or role change.
   */
  clearAuthCache(userId?: string) {
    if (userId) {
      this.authCache.delete(userId);
    } else {
      this.authCache.clear();
    }
  }

  /**
   * Check if a user is restricted from community actions (posting, commenting).
   */
  async checkUserRestriction(userId?: string | null): Promise<UserRestrictionCheckResult> {
    if (!userId) {
      return { restricted: false };
    }

    const client = supabaseService.getClient();
    if (!client) {
      return { restricted: false };
    }

    try {
      const { data, error } = await client.rpc('is_user_community_restricted', {
        p_user_id: userId,
      });

      if (error || !data) {
        return { restricted: false };
      }

      return {
        restricted: Boolean(data.restricted),
        status: data.status as CommunityUserRestrictionStatus,
        reason: data.reason,
        expiresAt: data.expiresAt,
      };
    } catch {
      return { restricted: false };
    }
  }

  /**
   * Staff: Update post status, public resolution note, and internal staff note.
   * Enforced server-side with code 403 if caller lacks required staff role.
   */
  async staffUpdatePostStatus(params: {
    postId: string;
    status: CommunityPostStatus;
    publicResolution?: string;
    internalNote?: string;
    reason?: string;
  }): Promise<{ success: boolean; postId: string; status: string; resolvedByName: string }> {
    const client = supabaseService.getClient();
    if (!client) {
      throw new Error('Database client not available');
    }

    const { data, error } = await client.rpc('staff_update_post_status', {
      p_post_id: params.postId,
      p_status: params.status,
      p_public_resolution: params.publicResolution?.trim() || null,
      p_internal_note: params.internalNote?.trim() || null,
      p_reason: params.reason?.trim() || 'Staff status update',
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Staff: Moderate post (Hide, Restore, Pin, Unpin, Mark Duplicate, Mark Spam).
   */
  async staffModeratePost(params: {
    postId: string;
    action: 'HIDE' | 'RESTORE' | 'PIN' | 'UNPIN' | 'MARK_DUPLICATE' | 'MARK_SPAM';
    reason: string;
    duplicateOfId?: string;
  }): Promise<{ success: boolean; action: string; postId: string }> {
    const client = supabaseService.getClient();
    if (!client) {
      throw new Error('Database client not available');
    }

    const { data, error } = await client.rpc('staff_moderate_post', {
      p_post_id: params.postId,
      p_action: params.action,
      p_reason: params.reason.trim(),
      p_duplicate_of_id: params.duplicateOfId?.trim() || null,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Staff: Post Official Verified Reply with Mock.AI Team badge.
   * Guaranteed impossible for normal users to post with this badge.
   */
  async staffPostOfficialComment(params: {
    postId: string;
    parentCommentId?: string | null;
    content: string;
  }): Promise<{ success: boolean; commentId: string; authorName: string; isOfficial: boolean }> {
    const client = supabaseService.getClient();
    if (!client) {
      throw new Error('Database client not available');
    }

    const { data, error } = await client.rpc('staff_post_official_comment', {
      p_post_id: params.postId,
      p_parent_comment_id: params.parentCommentId || null,
      p_content: params.content.trim(),
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Staff: Restrict user from community (POSTING_RESTRICTED, SUSPENDED, BANNED).
   */
  async staffRestrictUser(params: {
    targetUserId: string;
    status: CommunityUserRestrictionStatus;
    reason: string;
    durationHours?: number;
  }): Promise<{ success: boolean; userId: string; status: string; expiresAt?: string }> {
    const client = supabaseService.getClient();
    if (!client) {
      throw new Error('Database client not available');
    }

    const { data, error } = await client.rpc('staff_restrict_user', {
      p_target_user_id: params.targetUserId,
      p_status: params.status,
      p_reason: params.reason.trim(),
      p_duration_hours: params.durationHours || null,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Fetch internal staff notes for a specific post.
   * Staff RLS strictly blocks any unauthorized user.
   */
  async getStaffNotes(postId: string): Promise<StaffNote[]> {
    const client = supabaseService.getClient();
    if (!client) return [];

    try {
      const { data, error } = await client
        .from('staff_notes')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error || !data) return [];

      return data.map((row: any) => ({
        id: row.id,
        postId: row.post_id,
        authorId: row.author_id,
        authorName: row.author_name,
        note: row.note,
        createdAt: row.created_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Add a standalone internal staff note without changing status.
   */
  async addStaffNote(postId: string, note: string): Promise<boolean> {
    const client = supabaseService.getClient();
    if (!client) return false;

    try {
      const { data: authData } = await client.auth.getUser();
      if (!authData?.user) return false;

      const { error } = await client.from('staff_notes').insert({
        post_id: postId,
        author_id: authData.user.id,
        author_name: authData.user.user_metadata?.full_name || 'Mock.AI Staff',
        note: note.trim(),
      });

      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Fetch immutable audit logs for staff inspection.
   * Protected by staff-only RLS.
   */
  async getAuditLogs(limit = 100): Promise<CommunityAuditLog[]> {
    const client = supabaseService.getClient();
    if (!client) return [];

    try {
      const { data, error } = await client
        .from('community_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error || !data) return [];

      return data.map((row: any) => ({
        id: row.id,
        staffUserId: row.staff_user_id,
        staffUserName: row.staff_user_name,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        previousState: row.previous_state,
        newState: row.new_state,
        reason: row.reason,
        createdAt: row.created_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Fetch user reports for moderation queue.
   */
  async getReports(statusFilter?: string): Promise<CommunityReport[]> {
    const client = supabaseService.getClient();
    if (!client) return [];

    try {
      let query = client.from('community_reports').select('*').order('created_at', { ascending: false });

      if (statusFilter && statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error || !data) return [];

      return data.map((row: any) => ({
        id: row.id,
        targetType: row.target_type,
        targetId: row.target_id,
        reporterId: row.reporter_id,
        reason: row.reason,
        details: row.details,
        status: row.status,
        createdAt: row.created_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Update status of a user report (e.g. REVIEWED, ACTIONED, DISMISSED).
   */
  async updateReportStatus(
    reportId: string,
    status: 'PENDING' | 'REVIEWED' | 'DISMISSED' | 'ACTIONED'
  ): Promise<boolean> {
    const client = supabaseService.getClient();
    if (!client) return false;

    try {
      const { error } = await client
        .from('community_reports')
        .update({ status })
        .eq('id', reportId);

      return !error;
    } catch {
      return false;
    }
  }
}

export const staffService = new StaffService();
