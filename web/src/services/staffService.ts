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
  StaffQuestionDefect,
  StaffPaperTestingSession,
  StaffPaperTestingSummary,
  StaffDefectCategory,
  StaffDefectStatus,
  ReportDefectParams,
} from '../types';
import { EXAM_PAPERS_MAP, COMPETITIVE_EXAMS_CATALOG } from '../data/exams/catalog';

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

      if (!error && data) {
        const status: StaffAuthStatus = {
          isStaff: Boolean(data?.isStaff),
          role: (data?.role as StaffRole) || null,
          permissions: Array.isArray(data?.permissions) ? data.permissions : [],
        };

        this.authCache.set(userId, { status, timestamp: Date.now() });
        return status;
      }

      // Fallback 1: Check authoritative is_verified_staff RPC created by Staff Paper Testing Centre migration
      const { data: isVerified, error: isVerifiedErr } = await client.rpc('is_verified_staff');
      if (!isVerifiedErr && isVerified === true) {
        let detectedRole: StaffRole = 'STAFF';
        let detectedPerms: string[] = [];

        try {
          const { data: roleRow } = await client
            .from('staff_roles')
            .select('role, permissions')
            .eq('user_id', userId)
            .maybeSingle();

          if (roleRow?.role) {
            detectedRole = roleRow.role as StaffRole;
            detectedPerms = Array.isArray(roleRow.permissions) ? roleRow.permissions : [];
          }
        } catch {}

        const status: StaffAuthStatus = {
          isStaff: true,
          role: detectedRole,
          permissions: detectedPerms,
        };

        this.authCache.set(userId, { status, timestamp: Date.now() });
        return status;
      }

      // Fallback 2: Check staff_roles table directly
      const { data: directRole } = await client
        .from('staff_roles')
        .select('role, permissions')
        .eq('user_id', userId)
        .maybeSingle();

      if (directRole?.role) {
        const status: StaffAuthStatus = {
          isStaff: true,
          role: directRole.role as StaffRole,
          permissions: Array.isArray(directRole.permissions) ? directRole.permissions : [],
        };

        this.authCache.set(userId, { status, timestamp: Date.now() });
        return status;
      }

      return { isStaff: false, role: null, permissions: [] };
    } catch (err) {
      console.warn('[StaffService] Staff auth check fallback:', err);
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

  /**
   * Fetch 1% Staff Review Queue items (UADUE automated anomaly queue).
   */
  async getReviewQueueItems(status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESOLVED' | 'ALL'): Promise<any[]> {
    const LOCAL_KEY = 'mockai_review_queue_items';
    const client = supabaseService.getClient();

    if (client) {
      try {
        let query = client
          .from('review_queue_items')
          .select('*')
          .order('created_at', { ascending: false });

        if (status && status !== 'ALL') {
          query = query.eq('status', status);
        }

        const { data, error } = await query;
        if (!error && data) {
          return data.map((row: any) => ({
            id: row.id,
            questionId: row.question_id,
            paperId: row.paper_id,
            anomalyCategory: row.anomaly_category,
            severity: row.severity,
            details: row.details,
            cropUrl: row.crop_url,
            suggestedPatch: row.suggested_patch,
            status: row.status,
            reviewedBy: row.reviewed_by,
            reviewedAt: row.reviewed_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }));
        }
      } catch (err) {
        console.warn('[StaffService] Remote review queue fetch error, falling back to local cache:', err);
      }
    }

    // Local storage fallback
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        const items = raw ? JSON.parse(raw) : [];
        if (status && status !== 'ALL') {
          return items.filter((it: any) => it.status === status);
        }
        return items;
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * Resolves or updates a 1% Review Queue Item (APPROVE / REJECT / RESOLVE).
   */
  async resolveReviewQueueItem(
    itemId: string,
    action: 'APPROVED' | 'REJECTED' | 'RESOLVED',
    staffId: string,
    notes?: string
  ): Promise<boolean> {
    const LOCAL_KEY = 'mockai_review_queue_items';
    const client = supabaseService.getClient();
    const now = new Date().toISOString();

    if (client) {
      try {
        const { error } = await client
          .from('review_queue_items')
          .update({
            status: action,
            reviewed_by: staffId,
            reviewed_at: now,
            updated_at: now,
            details: notes ? { staffNotes: notes } : undefined,
          })
          .eq('id', itemId);

        if (!error) return true;
      } catch (err) {
        console.warn('[StaffService] Remote review queue update failed:', err);
      }
    }

    // Local cache fallback
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        let items = raw ? JSON.parse(raw) : [];
        items = items.map((it: any) =>
          it.id === itemId
            ? { ...it, status: action, reviewedBy: staffId, reviewedAt: now, updatedAt: now }
            : it
        );
        localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  // ── Paper Testing Centre & Defect Logging (Stage 1) ──────────────────────

  private getAllLocalTestingSessions(): StaffPaperTestingSession[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem('mockai_staff_testing_sessions_index');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private updateTestingSessionsIndex(session: StaffPaperTestingSession): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const list = this.getAllLocalTestingSessions();
      const idx = list.findIndex((s) => s.paperId === session.paperId && s.staffId === session.staffId);
      if (idx >= 0) {
        list[idx] = session;
      } else {
        list.push(session);
      }
      localStorage.setItem('mockai_staff_testing_sessions_index', JSON.stringify(list));
    } catch {}
  }

  public getAllLocalDefects(): StaffQuestionDefect[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem('mockai_staff_question_defects');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Get all papers eligible for staff testing with aggregated metrics.
   */
  async getStaffTestingSummaries(search?: string, statusFilter?: string): Promise<StaffPaperTestingSummary[]> {
    const papers = Object.values(EXAM_PAPERS_MAP);
    const sessions = this.getAllLocalTestingSessions();
    const defects = this.getAllLocalDefects();

    const summaries: StaffPaperTestingSummary[] = papers.map((paper) => {
      const exam = COMPETITIVE_EXAMS_CATALOG.find((e) => e.id === paper.examId);
      const session = sessions.find((s) => s.paperId === paper.id);
      const paperDefects = defects.filter((d) => d.paperId === paper.id);
      const unresolvedDefects = paperDefects.filter(
        (d) => d.status !== 'approved' && d.status !== 'rejected'
      );

      const totalQuestions = paper.questions?.length || 0;
      const testedQuestions = session?.testedCount || 0;
      let status: StaffPaperTestingSummary['status'] = 'NOT_STARTED';

      if (unresolvedDefects.length > 0) {
        status = 'HAS_DEFECTS';
      } else if (testedQuestions >= totalQuestions && totalQuestions > 0) {
        status = 'COMPLETED';
      } else if (testedQuestions > 0) {
        status = 'IN_PROGRESS';
      }

      return {
        paperId: paper.id,
        paperName: paper.title || paper.examName || paper.id,
        examId: paper.examId,
        examName: exam?.name || paper.examName || paper.examId.toUpperCase(),
        totalQuestions,
        testedQuestions,
        reportedDefects: paperDefects.length,
        unresolvedDefects: unresolvedDefects.length,
        status,
        lastTestedAt: session?.updatedAt,
      };
    });

    return summaries.filter((s) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesName = s.paperName.toLowerCase().includes(q);
        const matchesExam = s.examName.toLowerCase().includes(q) || s.examId.toLowerCase().includes(q);
        if (!matchesName && !matchesExam) return false;
      }
      if (statusFilter && statusFilter !== 'ALL') {
        if (s.status !== statusFilter) return false;
      }
      return true;
    });
  }

  /**
   * Synchronously retrieve existing local testing session for instant zero-latency loading.
   */
  getLocalPaperTestingSession(paperId: string, staffId?: string): StaffPaperTestingSession | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      if (staffId) {
        const raw = localStorage.getItem(`mockai_staff_test_session_${paperId}_${staffId}`);
        if (raw) return JSON.parse(raw);
      }
      const list = this.getAllLocalTestingSessions();
      const match = list.find((s) => s.paperId === paperId && (!staffId || s.staffId === staffId));
      if (match) return match;
      const anyMatch = list.find((s) => s.paperId === paperId);
      if (anyMatch) return anyMatch;
    } catch {}
    return null;
  }

  /**
   * Retrieve active testing session for a paper and staff member.
   */
  async getPaperTestingSession(paperId: string, staffId: string): Promise<StaffPaperTestingSession> {
    const LOCAL_KEY = `mockai_staff_test_session_${paperId}_${staffId}`;
    const localExisting = this.getLocalPaperTestingSession(paperId, staffId);
    const client = supabaseService.getClient();

    if (client) {
      try {
        const fetchPromise = client
          .from('staff_paper_testing_sessions')
          .select('*')
          .eq('paper_id', paperId)
          .eq('staff_id', staffId)
          .maybeSingle();

        const timeoutPromise = new Promise<{ data: null; error: Error }>((_, reject) =>
          setTimeout(() => reject(new Error('Supabase session fetch timeout')), 2500)
        );

        const { data, error } = (await Promise.race([fetchPromise, timeoutPromise])) as any;

        if (!error && data) {
          const remoteSession: StaffPaperTestingSession = {
            sessionId: data.session_id,
            paperId: data.paper_id,
            paperName: data.paper_name,
            examId: data.exam_id,
            staffId: data.staff_id,
            currentQuestionIndex: data.current_question_index,
            testedQuestionIds: data.tested_question_ids || [],
            questionReviews: data.question_reviews || {},
            totalQuestions: data.total_questions,
            testedCount: data.tested_count,
            defectsCount: data.defects_count,
            status: data.status,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(LOCAL_KEY, JSON.stringify(remoteSession));
            this.updateTestingSessionsIndex(remoteSession);
          }
          return remoteSession;
        }
      } catch (err) {
        console.warn('[StaffService] Remote session fetch fallback:', err);
      }
    }

    if (localExisting) {
      return localExisting;
    }

    const paper = EXAM_PAPERS_MAP[paperId];
    const initialSession: StaffPaperTestingSession = {
      sessionId: `sess_${paperId}_${staffId}`,
      paperId,
      paperName: paper?.title || paper?.examName || paperId,
      examId: paper?.examId || 'unknown',
      staffId,
      currentQuestionIndex: 0,
      testedQuestionIds: [],
      questionReviews: {},
      totalQuestions: paper?.questions?.length || 0,
      testedCount: 0,
      defectsCount: 0,
      status: 'NOT_STARTED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(initialSession));
      this.updateTestingSessionsIndex(initialSession);
    }
    return initialSession;
  }

  /**
   * Persists testing progress and question verdicts.
   */
  async savePaperTestingProgress(session: StaffPaperTestingSession): Promise<boolean> {
    const LOCAL_KEY = `mockai_staff_test_session_${session.paperId}_${session.staffId}`;
    const client = supabaseService.getClient();
    const updated = { ...session, updatedAt: new Date().toISOString() };

    // Update in local storage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(updated));
      this.updateTestingSessionsIndex(updated);
    }

    if (client) {
      try {
        await client.from('staff_paper_testing_sessions').upsert({
          session_id: updated.sessionId,
          paper_id: updated.paperId,
          paper_name: updated.paperName,
          exam_id: updated.examId,
          staff_id: updated.staffId,
          current_question_index: updated.currentQuestionIndex,
          tested_question_ids: updated.testedQuestionIds,
          question_reviews: updated.questionReviews,
          total_questions: updated.totalQuestions,
          tested_count: updated.testedCount,
          defects_count: updated.defectsCount,
          status: updated.status,
          updated_at: updated.updatedAt,
        });
      } catch (err) {
        console.warn('[StaffService] Remote session save fallback:', err);
      }
    }
    return true;
  }

  /**
   * Report a defect on a specific question with duplicate prevention.
   */
  async reportQuestionDefect(params: ReportDefectParams): Promise<{ success: boolean; defect?: StaffQuestionDefect; error?: string }> {
    // 1. Authorization verification
    const isStaff = await this.checkIsStaff(params.staffId);
    if (!isStaff) {
      return { success: false, error: 'Unauthorized: Only verified staff members may report paper defects.' };
    }

    // 2. Validate input
    if (!params.defectDescription || params.defectDescription.trim().length === 0) {
      return { success: false, error: 'Defect description is required.' };
    }

    const LOCAL_DEFECTS_KEY = 'mockai_staff_question_defects';
    const defects = this.getAllLocalDefects();

    // 3. Duplicate prevention: check for active defect with same paperId, questionId, defectCategory
    const existingActive = defects.find(
      (d) =>
        d.paperId === params.paperId &&
        d.questionId === params.questionId &&
        d.defectCategory === params.defectCategory &&
        (d.status === 'reported' ||
          d.status === 'queued_for_repair' ||
          d.status === 'repair_in_progress' ||
          d.status === 'fix_prepared' ||
          d.status === 'validation_failed' ||
          d.status === 'ready_for_staff_review')
    );

    if (existingActive) {
      return {
        success: false,
        error: `An active defect of category "${params.defectCategory}" is already logged on this question (${existingActive.defectId}).`,
      };
    }

    const now = new Date().toISOString();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const defectId = `defect_${params.paperId}_q${params.questionNumber}_${Date.now()}_${randomSuffix}`;

    // Simple deterministic fingerprint
    const snap = params.questionSnapshot || {};
    const contentToHash = `${snap.questionText || ''}::${JSON.stringify(snap.options || [])}::${snap.correctAnswer || snap.correctAnswerIndex}`;
    let hash = 0;
    for (let i = 0; i < contentToHash.length; i++) {
      hash = (hash << 5) - hash + contentToHash.charCodeAt(i);
      hash |= 0;
    }
    const fingerprint = `fp_${Math.abs(hash).toString(16)}`;

    const newDefect: StaffQuestionDefect = {
      defectId,
      paperId: params.paperId,
      questionId: params.questionId,
      questionNumber: params.questionNumber,
      reportingStaffId: params.staffId,
      reportingStaffEmail: params.staffEmail,
      defectCategory: params.defectCategory,
      defectDescription: params.defectDescription.trim(),
      evidenceReference: params.evidenceReference?.trim() || undefined,
      staffNotes: params.staffNotes?.trim() || undefined,
      questionSnapshot: params.questionSnapshot,
      questionFingerprint: fingerprint,
      status: 'reported',
      repairHistory: [
        {
          timestamp: now,
          action: 'REPORTED',
          staffId: params.staffId,
          notes: 'Initial defect reported by staff reviewer',
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    let storageBackend: 'remote_db' | 'local_only' = 'local_only';
    let isPendingSync = true;

    // Attempt remote Supabase
    const client = supabaseService.getClient();
    if (client) {
      try {
        // 1. Try secure Security Definer RPC with server-side validation and auth verification
        const { data: rpcData, error: rpcErr } = await client.rpc('staff_report_question_defect', {
          p_paper_id: newDefect.paperId,
          p_question_id: newDefect.questionId,
          p_question_number: newDefect.questionNumber,
          p_defect_category: newDefect.defectCategory,
          p_defect_description: newDefect.defectDescription,
          p_evidence_reference: newDefect.evidenceReference || null,
          p_staff_notes: newDefect.staffNotes || null,
          p_question_snapshot: newDefect.questionSnapshot || {},
          p_question_fingerprint: newDefect.questionFingerprint || '',
        });

        if (rpcErr) {
          // Check for authoritative database rejection (security, duplicate, or validation)
          if (rpcErr.code === '42501' || rpcErr.message?.includes('403') || rpcErr.message?.includes('Forbidden')) {
            return { success: false, error: 'Unauthorized: Caller lacks verified staff permissions.' };
          }
          if (rpcErr.code === '23505' || rpcErr.message?.includes('duplicate') || rpcErr.message?.includes('already exists')) {
            return {
              success: false,
              error: `An active defect of category "${params.defectCategory}" is already logged on this question.`,
            };
          }
          if (rpcErr.code === '22023') {
            return { success: false, error: rpcErr.message };
          }

          // If RPC is missing on remote instance (code PGRST202 / 42883), attempt direct insert as interim fallback
          if (rpcErr.code === 'PGRST202' || rpcErr.code === '42883' || rpcErr.message?.includes('not found')) {
            const { error: insertErr } = await client.from('staff_question_defects').insert({
              defect_id: newDefect.defectId,
              paper_id: newDefect.paperId,
              question_id: newDefect.questionId,
              question_number: newDefect.questionNumber,
              reporting_staff_id: newDefect.reportingStaffId,
              reporting_staff_email: newDefect.reportingStaffEmail,
              defect_category: newDefect.defectCategory,
              defect_description: newDefect.defectDescription,
              evidence_reference: newDefect.evidenceReference,
              staff_notes: newDefect.staffNotes,
              question_snapshot: newDefect.questionSnapshot,
              question_fingerprint: newDefect.questionFingerprint,
              status: newDefect.status,
              repair_history: newDefect.repairHistory,
            });

            if (!insertErr) {
              storageBackend = 'remote_db';
              isPendingSync = false;
            } else {
              if (insertErr.code === '42501') {
                return { success: false, error: 'Unauthorized: Database RLS rejected insert.' };
              }
              if (insertErr.code === '23505') {
                return {
                  success: false,
                  error: `An active defect of category "${params.defectCategory}" is already logged on this question.`,
                };
              }
              console.warn('[StaffService] Remote defect direct insert fallback failed:', insertErr.message);
            }
          } else {
            console.warn('[StaffService] Remote defect RPC failed with transient error:', rpcErr.message);
          }
        } else if (rpcData) {
          if (rpcData.success) {
            if (rpcData.defect_id) {
              newDefect.defectId = rpcData.defect_id;
            }
            storageBackend = 'remote_db';
            isPendingSync = false;
          } else if (rpcData.duplicate) {
            return {
              success: false,
              error: rpcData.message || `An active defect of category "${params.defectCategory}" is already logged on this question.`,
            };
          } else {
            return {
              success: false,
              error: rpcData.message || 'Defect submission failed on server.',
            };
          }
        }
      } catch (err: any) {
        console.warn('[StaffService] Remote defect save network fallback:', err);
      }
    }

    newDefect.storageBackend = storageBackend;
    newDefect.isPendingSync = isPendingSync;

    // Save to local storage (acts as local cache / offline backup)
    if (typeof localStorage !== 'undefined') {
      defects.push(newDefect);
      localStorage.setItem(LOCAL_DEFECTS_KEY, JSON.stringify(defects));
    }

    return { success: true, defect: newDefect };
  }

  /**
   * Fetch defects for a specific paper.
   */
  async getPaperDefects(paperId: string): Promise<StaffQuestionDefect[]> {
    const localDefects = this.getAllLocalDefects().filter((d) => d.paperId === paperId);
    const client = supabaseService.getClient();

    if (client) {
      try {
        const fetchPromise = client
          .from('staff_question_defects')
          .select('*')
          .eq('paper_id', paperId);

        const timeoutPromise = new Promise<{ data: null; error: Error }>((_, reject) =>
          setTimeout(() => reject(new Error('Supabase defects fetch timeout')), 2500)
        );

        const { data, error } = (await Promise.race([fetchPromise, timeoutPromise])) as any;

        if (!error && Array.isArray(data)) {
          const remoteDefects: StaffQuestionDefect[] = data.map((d: any) => ({
            defectId: d.defect_id,
            paperId: d.paper_id,
            questionId: d.question_id,
            questionNumber: d.question_number,
            reportingStaffId: d.reporting_staff_id,
            reportingStaffEmail: d.reporting_staff_email,
            defectCategory: d.defect_category,
            defectDescription: d.defect_description,
            evidenceReference: d.evidence_reference,
            staffNotes: d.staff_notes,
            questionSnapshot: d.question_snapshot,
            questionFingerprint: d.question_fingerprint,
            status: d.status,
            repairHistory: d.repair_history,
            storageBackend: 'remote_db' as const,
            isPendingSync: false,
            createdAt: d.created_at,
            updatedAt: d.updated_at,
          }));

          const remoteIds = new Set(remoteDefects.map((d) => d.defectId));
          const unsyncedLocal = localDefects.filter((d) => !remoteIds.has(d.defectId));
          return [...remoteDefects, ...unsyncedLocal];
        }
      } catch (err) {
        console.warn('[StaffService] Remote getPaperDefects fallback:', err);
      }
    }

    return localDefects;
  }

  /**
   * Fetch all staff defects with optional filter.
   */
  async getAllStaffDefects(filter?: { status?: StaffDefectStatus; category?: StaffDefectCategory }): Promise<StaffQuestionDefect[]> {
    const defects = this.getAllLocalDefects();
    return defects.filter((d) => {
      if (filter?.status && d.status !== filter.status) return false;
      if (filter?.category && d.defectCategory !== filter.category) return false;
      return true;
    });
  }

  /**
   * Update defect status (e.g. approve, reject, queue_for_repair).
   */
  async updateDefectStatus(
    defectId: string,
    newStatus: StaffDefectStatus,
    staffId: string,
    notes?: string
  ): Promise<boolean> {
    const isStaff = await this.checkIsStaff(staffId);
    if (!isStaff) return false;

    const LOCAL_DEFECTS_KEY = 'mockai_staff_question_defects';
    const defects = this.getAllLocalDefects();
    const idx = defects.findIndex((d) => d.defectId === defectId);
    if (idx === -1) return false;

    const now = new Date().toISOString();
    const history = defects[idx].repairHistory || [];
    history.push({
      timestamp: now,
      action: `STATUS_CHANGE_TO_${newStatus.toUpperCase()}`,
      staffId,
      notes: notes || `Status updated to ${newStatus}`,
    });

    defects[idx] = {
      ...defects[idx],
      status: newStatus,
      repairHistory: history,
      updatedAt: now,
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_DEFECTS_KEY, JSON.stringify(defects));
    }

    const client = supabaseService.getClient();
    if (client) {
      try {
        await client
          .from('staff_question_defects')
          .update({
            status: newStatus,
            repair_history: history,
            updated_at: now,
          })
          .eq('defect_id', defectId);
      } catch (err) {
        console.warn('[StaffService] Remote defect status update fallback:', err);
      }
    }

    return true;
  }
}

export const staffService = new StaffService();
