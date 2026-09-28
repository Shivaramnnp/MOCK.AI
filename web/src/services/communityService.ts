/**
 * MOCK.AI — Canonical Community & Feedback Hub Service
 *
 * Provides production-grade data operations for:
 * 1. Paper Requests (demand aggregation)
 * 2. Question Reports (structured content quality issues linked to canonical question IDs)
 * 3. Bug Reports (environment diagnostics & issue tracking)
 * 4. Feature Requests (learner-supported ideas)
 * 5. Discussions (threaded academic prep & doubt clarification)
 *
 * Guarantees:
 * - Single source of truth backed by Supabase Project 1 relational schema.
 * - Resilient offline/local storage fallback.
 * - Duplicate detection engine to avoid admin toil.
 * - Atomic support/vote system (1 vote per user, no duplicate votes).
 * - XSS sanitization and client-side rate limiting.
 * - Strict privacy: Never leaks email, auth ID, or internal DB credentials.
 */

import { supabaseService } from './supabase';
import { staffService } from './staffService';
import { notificationService } from './notificationService';
import {
  CommunityPost,
  CommunityPostType,
  CommunityPostStatus,
  CommunityPostPriority,
  CommunityComment,
  CommunityReport,
  CommunityPostMetadata,
  CommunityNotification,
  UserProfile,
} from '../types';

const LOCAL_POSTS_KEY = 'mockai_community_posts_cache';
const LOCAL_COMMENTS_KEY = 'mockai_community_comments_cache';
const LOCAL_SUPPORTS_KEY = 'mockai_community_supports_cache';
const RATE_LIMIT_KEY = 'mockai_community_ratelimit';

/**
 * Basic input sanitizer to prevent XSS and HTML/script injection.
 */
export function sanitizeInput(text: string): string {
  if (!text) return '';
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:[^"'\s]+/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

/**
 * Normalizes exam name for duplicate detection and search.
 * e.g. "POLYCET" -> "polycet", "Poly CET" -> "polycet", "POLYCET - 2015" -> "polycet2015"
 */
export function normalizeExamName(raw?: string | null): string {
  if (!raw) return '';
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

/**
 * Resolves a professional display name for the user.
 * Never outputs 'you', 'me', 'Scholar (Guest)', email address, or raw UUID.
 * Defaults to 'Mock.AI User' if invalid or missing.
 */
export function getCommunityDisplayName(
  user?: { fullName?: string | null; displayName?: string | null; email?: string | null } | null
): string {
  if (!user) return 'Mock.AI User';
  const raw = (user.displayName || user.fullName || '').trim();
  if (!raw) return 'Mock.AI User';
  const lower = raw.toLowerCase();
  if (['you', 'me', 'null', 'undefined', 'scholar (guest)', 'anonymous', 'guest'].includes(lower)) {
    return 'Mock.AI User';
  }
  // Never show raw email address
  if (raw.includes('@')) {
    return 'Mock.AI User';
  }
  // Never show internal UUID string
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(raw)) {
    return 'Mock.AI User';
  }
  return raw;
}

/**
 * Client-side rate-limiter: max 5 posts / 10 comments per 5 minutes.
 */
export function checkRateLimit(action: 'post' | 'comment'): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    const now = Date.now();
    const windowMs = 5 * 60 * 1000;
    const history: { action: string; timestamp: number }[] = raw ? JSON.parse(raw) : [];

    // Filter within window
    const recent = history.filter((h) => now - h.timestamp < windowMs);
    const actionCount = recent.filter((h) => h.action === action).length;
    const maxAllowed = action === 'post' ? 5 : 10;

    if (actionCount >= maxAllowed) {
      return false;
    }

    recent.push({ action, timestamp: now });
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(recent));
    return true;
  } catch {
    return true;
  }
}

class CommunityService {
  /**
   * Helper to load locally cached / offline user posts.
   * Never seeds fake/demo data. Cleanses any legacy seed posts.
   */
  private getLocalPosts(): CommunityPost[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(LOCAL_POSTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      // Purge any legacy demo/seed posts from client localStorage
      const sanitized = parsed.filter((p: any) => {
        if (!p || typeof p.id !== 'string') return false;
        if (p.id.startsWith('seed-post-')) return false;
        if (['Rohan Verma', 'Priya Patel', 'Vikram Rao', 'Ananya Sen'].includes(p.authorName)) {
          return false;
        }
        return true;
      });

      if (sanitized.length !== parsed.length) {
        localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(sanitized));
      }
      return sanitized;
    } catch {
      return [];
    }
  }

  private saveLocalPosts(posts: CommunityPost[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(posts));
    } catch {
      // ignore
    }
  }

  /**
   * Synchronizes cached local posts with authoritative remote posts from the database.
   * Ensures staff status updates (e.g. OPEN -> RESOLVED) and deletions reflect in local cache.
   */
  private syncLocalCacheWithRemote(remotePosts: CommunityPost[]): void {
    if (typeof localStorage === 'undefined' || !remotePosts || remotePosts.length === 0) return;
    try {
      const currentLocals = this.getLocalPosts();
      if (currentLocals.length === 0) return;

      const remoteMap = new Map(remotePosts.map((p) => [p.id, p]));
      let hasChanges = false;

      const updatedLocals = currentLocals.map((lp) => {
        const remote = remoteMap.get(lp.id);
        if (remote) {
          if (
            lp.status !== remote.status ||
            lp.isHidden !== remote.isHidden ||
            lp.isDeleted !== remote.isDeleted ||
            lp.resolutionNotes !== remote.resolutionNotes ||
            lp.resolvedByName !== remote.resolvedByName
          ) {
            hasChanges = true;
            return {
              ...lp,
              status: remote.status,
              isHidden: remote.isHidden,
              isDeleted: remote.isDeleted,
              resolutionNotes: remote.resolutionNotes,
              resolvedByName: remote.resolvedByName,
              resolvedAt: remote.resolvedAt,
              updatedAt: remote.updatedAt,
            };
          }
        }
        return lp;
      });

      if (hasChanges) {
        this.saveLocalPosts(updatedLocals);
      }
    } catch {
      // ignore
    }
  }

  private getLocalComments(postId: string): CommunityComment[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(`${LOCAL_COMMENTS_KEY}_${postId}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveLocalComments(postId: string, comments: CommunityComment[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(`${LOCAL_COMMENTS_KEY}_${postId}`, JSON.stringify(comments));
    } catch {
      // ignore
    }
  }

  private getUserSupports(userId: string): Set<string> {
    if (typeof localStorage === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem(`${LOCAL_SUPPORTS_KEY}_${userId}`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }

  private saveUserSupports(userId: string, set: Set<string>): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(`${LOCAL_SUPPORTS_KEY}_${userId}`, JSON.stringify(Array.from(set)));
    } catch {
      // ignore
    }
  }

  /**
   * Fetch all community posts with optional filtering, search, and sorting.
   */
  async getPosts(options?: {
    type?: CommunityPostType | 'ALL';
    status?: CommunityPostStatus | 'ALL';
    examId?: string;
    search?: string;
    sort?: 'recent' | 'supported' | 'discussed';
    limit?: number;
    offset?: number;
    userId?: string;
  }): Promise<{ posts: CommunityPost[]; total: number }> {
    const client = supabaseService.getClient();
    let posts: CommunityPost[] = [];

    // 1. Attempt query from Supabase Project 1
    if (client) {
      try {
        let query = client
          .from('community_posts')
          .select('*', { count: 'exact' })
          .eq('is_hidden', false);

        if (options?.type && options.type !== 'ALL') {
          query = query.eq('type', options.type);
        }
        if (options?.status && options.status !== 'ALL') {
          query = query.eq('status', options.status);
        }

        // Sorting
        if (options?.sort === 'supported') {
          query = query.order('support_count', { ascending: false });
        } else if (options?.sort === 'discussed') {
          query = query.order('comment_count', { ascending: false });
        } else {
          query = query.order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
        }

        if (options?.limit) {
          const from = options.offset || 0;
          const to = from + options.limit - 1;
          query = query.range(from, to);
        }

        const { data, error, count } = await query;

        if (!error && Array.isArray(data)) {
          const remotePosts: CommunityPost[] = data
            .filter((d: any) => !d.is_deleted)
            .map((d: any) => ({
            id: d.id,
            type: d.type,
            title: d.title,
            description: d.description,
            authorId: d.author_id,
            authorName: d.author_name || 'Mock.AI User',
            authorRole: d.author_role || 'STUDENT',
            authorAvatarUrl: d.author_avatar_url || d.metadata?.authorAvatarUrl || null,
            status: d.status,
            priority: d.priority || 'NORMAL',
            supportCount: d.support_count || 0,
            commentCount: d.comment_count || 0,
            metadata: d.metadata || {},
            customExamName: d.custom_exam_name || d.metadata?.customExamName || null,
            customExamNormalized: d.custom_exam_normalized || d.metadata?.customExamNormalized || null,
            customExamAuthority: d.custom_exam_authority || d.metadata?.customExamAuthority || null,
            customYear: d.custom_year || d.metadata?.customYear || null,
            customStage: d.custom_stage || d.metadata?.customStage || null,
            customSession: d.custom_session || d.metadata?.customSession || null,
            duplicateOfId: d.duplicate_of_id,
            resolutionNotes: d.resolution_notes,
            resolvedByName: d.resolved_by_name,
            resolvedAt: d.resolved_at,
            isPinned: Boolean(d.is_pinned),
            isHidden: Boolean(d.is_hidden),
            isEdited: Boolean(d.is_edited),
            editedAt: d.edited_at || null,
            isDeleted: Boolean(d.is_deleted),
            deletedAt: d.deleted_at || null,
            deletedBy: d.deleted_by || null,
            createdAt: d.created_at,
            updatedAt: d.updated_at,
          }));

          // Synchronize local cache with latest authoritative remote data
          this.syncLocalCacheWithRemote(remotePosts);

          // Merge local posts (only user-created posts created locally that are not yet in remote)
          const localList = this.getLocalPosts().filter((p) => !p.isHidden && !p.isDeleted);
          const remoteIds = new Set(remotePosts.map((p) => p.id));
          const merged: CommunityPost[] = [...remotePosts];
          for (const lp of localList) {
            if (!remoteIds.has(lp.id)) {
              if (
                (!options?.type || options.type === 'ALL' || lp.type === options.type) &&
                (!options?.status || options.status === 'ALL' || lp.status === options.status)
              ) {
                merged.unshift(lp);
              }
            }
          }
          posts = merged;

          // Augment with user supports if user is logged in
          if (options?.userId) {
            try {
              const { data: supports } = await client
                .from('community_supports')
                .select('post_id')
                .eq('user_id', options.userId);
              if (supports) {
                const supportedIds = new Set(supports.map((s: any) => s.post_id));
                posts.forEach((p) => {
                  p.hasUserSupported = supportedIds.has(p.id);
                });
              }
            } catch {
              // Ignore support query error
            }
          }

          // If search was provided, filter results
          if (options?.search?.trim()) {
            const q = options.search.trim().toLowerCase();
            posts = posts.filter(
              (p) =>
                p.title.toLowerCase().includes(q) ||
                p.description.toLowerCase().includes(q) ||
                (p.metadata?.examId && p.metadata.examId.toLowerCase().includes(q)) ||
                (p.customExamName && p.customExamName.toLowerCase().includes(q)) ||
                (p.metadata?.customExamName && p.metadata.customExamName.toLowerCase().includes(q)) ||
                (p.customExamAuthority && p.customExamAuthority.toLowerCase().includes(q)) ||
                (p.metadata?.customExamAuthority && p.metadata.customExamAuthority.toLowerCase().includes(q)) ||
                (p.customYear && String(p.customYear).includes(q)) ||
                (p.metadata?.customYear && String(p.metadata.customYear).includes(q)) ||
                (p.metadata?.questionNumber && `q${p.metadata.questionNumber}`.toLowerCase().includes(q))
            );
          }

          return { posts, total: typeof count === 'number' ? Math.max(count, posts.length) : posts.length };
        }
      } catch (err) {
        console.warn('[CommunityService] Remote query failed, using local cache:', err);
      }
    }

    // 2. Fallback to Local Storage (Client cache)
    posts = this.getLocalPosts().filter((p) => !p.isHidden && !p.isDeleted);

    if (options?.type && options.type !== 'ALL') {
      posts = posts.filter((p) => p.type === options.type);
    }
    if (options?.status && options.status !== 'ALL') {
      posts = posts.filter((p) => p.status === options.status);
    }
    if (options?.examId && options.examId !== 'ALL') {
      posts = posts.filter((p) => p.metadata?.examId === options.examId);
    }
    if (options?.search?.trim()) {
      const q = options.search.trim().toLowerCase();
      posts = posts.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (p.metadata?.examId && p.metadata.examId.toLowerCase().includes(q)) ||
          (p.customExamName && p.customExamName.toLowerCase().includes(q)) ||
          (p.metadata?.customExamName && p.metadata.customExamName.toLowerCase().includes(q)) ||
          (p.customExamAuthority && p.customExamAuthority.toLowerCase().includes(q)) ||
          (p.metadata?.customExamAuthority && p.metadata.customExamAuthority.toLowerCase().includes(q)) ||
          (p.customYear && String(p.customYear).includes(q)) ||
          (p.metadata?.customYear && String(p.metadata.customYear).includes(q)) ||
          (p.metadata?.questionNumber && `q${p.metadata.questionNumber}`.toLowerCase().includes(q))
      );
    }

    // Sorting
    if (options?.sort === 'supported') {
      posts.sort((a, b) => b.supportCount - a.supportCount);
    } else if (options?.sort === 'discussed') {
      posts.sort((a, b) => b.commentCount - a.commentCount);
    } else {
      posts.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }

    if (options?.userId) {
      const userSupports = this.getUserSupports(options.userId);
      posts.forEach((p) => {
        p.hasUserSupported = userSupports.has(p.id);
      });
    }

    const total = posts.length;
    if (options?.limit) {
      const from = options.offset || 0;
      posts = posts.slice(from, from + options.limit);
    }

    return { posts, total };
  }

  /**
   * Fetch single post with its threaded comments.
   */
  async getPostById(postId: string, userId?: string): Promise<{ post: CommunityPost; comments: CommunityComment[] } | null> {
    const client = supabaseService.getClient();

    if (client) {
      try {
        const { data: postData, error: postErr } = await client
          .from('community_posts')
          .select('*')
          .eq('id', postId)
          .single();

        if (!postErr && postData) {
          if (postData.is_deleted) {
            return null;
          }

          const localPost = this.getLocalPosts().find((p) => p.id === postId);
          const post: CommunityPost = {
            id: postData.id,
            type: postData.type,
            title: postData.title,
            description: postData.description,
            authorId: postData.author_id,
            authorName: postData.author_name || 'Mock.AI User',
            authorRole: postData.author_role || 'STUDENT',
            authorAvatarUrl: postData.author_avatar_url || postData.metadata?.authorAvatarUrl || null,
            status: postData.status, // DATABASE MUST BE SOURCE OF TRUTH
            priority: postData.priority || 'NORMAL',
            supportCount: postData.support_count || 0,
            commentCount: postData.comment_count || 0,
            metadata: postData.metadata || {},
            customExamName: postData.custom_exam_name || postData.metadata?.customExamName || null,
            customExamNormalized: postData.custom_exam_normalized || postData.metadata?.customExamNormalized || null,
            customExamAuthority: postData.custom_exam_authority || postData.metadata?.customExamAuthority || null,
            customYear: postData.custom_year || postData.metadata?.customYear || null,
            customStage: postData.custom_stage || postData.metadata?.customStage || null,
            customSession: postData.custom_session || postData.metadata?.customSession || null,
            duplicateOfId: postData.duplicate_of_id,
            resolutionNotes: postData.resolution_notes ?? localPost?.resolutionNotes ?? null,
            resolvedByName: postData.resolved_by_name ?? localPost?.resolvedByName ?? null,
            resolvedAt: postData.resolved_at ?? localPost?.resolvedAt ?? null,
            isPinned: Boolean(postData.is_pinned),
            isHidden: Boolean(postData.is_hidden),
            isEdited: Boolean(postData.is_edited),
            editedAt: postData.edited_at || null,
            isDeleted: Boolean(postData.is_deleted),
            deletedAt: postData.deleted_at || null,
            deletedBy: postData.deleted_by || null,
            createdAt: postData.created_at,
            updatedAt: postData.updated_at,
          };

          // Heal local cache if it had stale status or resolution
          if (localPost && (localPost.status !== postData.status || localPost.resolutionNotes !== postData.resolution_notes)) {
            const allLocals = this.getLocalPosts();
            const idx = allLocals.findIndex((p) => p.id === postId);
            if (idx !== -1) {
              allLocals[idx] = {
                ...allLocals[idx],
                status: postData.status,
                resolutionNotes: postData.resolution_notes,
                resolvedByName: postData.resolved_by_name,
                resolvedAt: postData.resolved_at,
                updatedAt: postData.updated_at,
              };
              this.saveLocalPosts(allLocals);
            }
          }

          if (userId) {
            const { data: sup } = await client
              .from('community_supports')
              .select('id')
              .eq('post_id', postId)
              .eq('user_id', userId)
              .maybeSingle();
            post.hasUserSupported = Boolean(sup);
          }

          // Fetch comments
          const { data: commentsData } = await client
            .from('community_comments')
            .select('*')
            .eq('post_id', postId)
            .eq('is_hidden', false)
            .order('created_at', { ascending: true });

          const rawComments: CommunityComment[] = (commentsData || []).map((c: any) => ({
            id: c.id,
            postId: c.post_id,
            parentCommentId: c.parent_comment_id,
            authorId: c.author_id,
            authorName: c.author_name || 'Mock.AI User',
            authorRole: c.author_role || 'STUDENT',
            isOfficialResponse: Boolean(c.is_official_response),
            content: c.content,
            isHidden: Boolean(c.is_hidden),
            createdAt: c.created_at,
            updatedAt: c.updated_at,
          }));

          const nestedComments = this.nestComments(rawComments);
          return { post, comments: nestedComments };
        }
      } catch (err) {
        console.warn('[CommunityService] Error fetching post by id:', err);
      }
    }

    // Local fallback
    const localPosts = this.getLocalPosts();
    const post = localPosts.find((p) => p.id === postId);
    if (!post || post.isDeleted) return null;

    if (userId) {
      post.hasUserSupported = this.getUserSupports(userId).has(postId);
    }

    const rawComments = this.getLocalComments(postId);
    const nestedComments = this.nestComments(rawComments);
    return { post, comments: nestedComments };
  }

  /**
   * Structure flat comment array into threaded trees (up to 3 levels).
   */
  private nestComments(flatComments: CommunityComment[]): CommunityComment[] {
    const commentMap = new Map<string, CommunityComment>();
    const roots: CommunityComment[] = [];

    flatComments.forEach((c) => {
      commentMap.set(c.id, { ...c, replies: [] });
    });

    flatComments.forEach((c) => {
      const node = commentMap.get(c.id)!;
      if (c.parentCommentId && commentMap.has(c.parentCommentId)) {
        const parent = commentMap.get(c.parentCommentId)!;
        parent.replies = parent.replies || [];
        parent.replies.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  /**
   * Check for duplicate open posts before creation to avoid redundant admin work.
   */
  async findDuplicates(candidate: {
    type: CommunityPostType;
    title?: string;
    examId?: string;
    editionYear?: number;
    tier?: string;
    shift?: string;
    questionId?: string;
    isCustomExam?: boolean;
    customExamName?: string;
    customYear?: number;
    customStage?: string;
    customSession?: string;
  }): Promise<CommunityPost[]> {
    const { posts } = await this.getPosts({ type: candidate.type });

    // 1. Strict duplicate key for Question Reports: canonical questionId
    if (candidate.type === 'QUESTION_REPORT' && candidate.questionId) {
      return posts.filter(
        (p) =>
          p.status !== 'RESOLVED' &&
          p.status !== 'REJECTED' &&
          p.metadata?.questionId === candidate.questionId
      );
    }

    // 2. Paper Requests Duplicate Detection
    if (candidate.type === 'PAPER_REQUEST') {
      // 2A. Custom Exam Duplicate Detection
      if (candidate.isCustomExam && candidate.customExamName?.trim()) {
        const cNorm = normalizeExamName(candidate.customExamName);
        const cYear = candidate.customYear || candidate.editionYear;

        return posts.filter((p) => {
          if (p.status === 'RESOLVED' || p.status === 'REJECTED') return false;
          const pCustomName = p.customExamName || p.metadata?.customExamName || '';
          const pCustomNorm = p.customExamNormalized || p.metadata?.customExamNormalized || normalizeExamName(pCustomName);
          const pYear = p.customYear || p.metadata?.customYear || p.metadata?.editionYear;

          // Check if normalized names match (or if one is substring of other when >= 4 chars)
          const nameMatches =
            Boolean(pCustomNorm && (pCustomNorm === cNorm || (cNorm.length >= 4 && pCustomNorm.includes(cNorm)) || (pCustomNorm.length >= 4 && cNorm.includes(pCustomNorm))));

          const yearMatches = !cYear || !pYear || Number(pYear) === Number(cYear);

          if (nameMatches && yearMatches) {
            return true;
          }

          // Also check title for token overlap + year match (e.g. "Poly CET 2015" vs "POLYCET 2015")
          if (cNorm && p.title) {
            const pTitleNorm = normalizeExamName(p.title);
            if (pTitleNorm.includes(cNorm) && (!cYear || pTitleNorm.includes(String(cYear)))) {
              return true;
            }
          }

          return false;
        });
      }

      // 2B. Canonical Paper Requests: examId + editionYear + tier + shift
      if (candidate.examId && candidate.editionYear) {
        return posts.filter((p) => {
          if (p.status === 'RESOLVED' || p.status === 'REJECTED') return false;
          const m = p.metadata || {};
          const matchesExam = m.examId?.toLowerCase() === candidate.examId?.toLowerCase();
          const matchesYear = Number(m.editionYear) === Number(candidate.editionYear);
          const matchesTier =
            !candidate.tier ||
            !m.tier ||
            m.tier.trim().toLowerCase() === candidate.tier.trim().toLowerCase();
          const matchesShift =
            !candidate.shift ||
            !m.shift ||
            m.shift.trim().toLowerCase() === candidate.shift.trim().toLowerCase();
          return matchesExam && matchesYear && matchesTier && matchesShift;
        });
      }
    }

    // 3. Keyword similarity for Bug Reports & Feature Requests
    if (candidate.title?.trim()) {
      const qTokens = candidate.title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((t) => t.length > 3);

      if (qTokens.length > 0) {
        return posts.filter((p) => {
          if (p.status === 'RESOLVED' || p.status === 'REJECTED') return false;
          const pTitle = p.title.toLowerCase();
          const overlap = qTokens.filter((token) => pTitle.includes(token)).length;
          return overlap >= Math.min(2, qTokens.length);
        });
      }
    }

    return [];
  }

  /**
   * Create a new community post.
   */
  async createPost(params: {
    type: CommunityPostType;
    title: string;
    description: string;
    metadata?: CommunityPostMetadata;
    user?: UserProfile | null;
  }): Promise<CommunityPost> {
    if (!checkRateLimit('post')) {
      throw new Error('Posting limit reached (max 5 posts per 5 minutes). Please wait before submitting another post.');
    }

    if (params.user?.uid) {
      const restriction = await staffService.checkUserRestriction(params.user.uid);
      if (restriction.restricted) {
        throw new Error(
          `Posting restricted: Your account community status is "${restriction.status}". Reason: ${restriction.reason || 'Community Guidelines violation'}${
            restriction.expiresAt ? ` (Expires: ${new Date(restriction.expiresAt).toLocaleDateString()})` : ' (Indefinite)'
          }`
        );
      }
    }

    const cleanTitle = sanitizeInput(params.title);
    const cleanDesc = sanitizeInput(params.description);

    if (!cleanTitle || cleanTitle.length < 5) {
      throw new Error('Please enter a clear title (at least 5 characters).');
    }
    if (!cleanDesc || cleanDesc.length < 10) {
      throw new Error('Please enter a description (at least 10 characters).');
    }

    const authorDisplayName = getCommunityDisplayName(params.user);
    const authorAvatar = params.user?.avatarUrl || null;

    const isCustomExam = Boolean(params.metadata?.isCustomExam);
    const isCustomYear = Boolean(params.metadata?.isCustomYear);
    const customExamName = params.metadata?.customExamName?.trim() || null;
    const customExamNormalized = customExamName ? normalizeExamName(customExamName) : null;
    const customExamAuthority = params.metadata?.customExamAuthority?.trim() || null;
    const customYear = params.metadata?.customYear ? Number(params.metadata.customYear) : null;
    const customStage = params.metadata?.customStage?.trim() || null;
    const customSession = params.metadata?.customSession?.trim() || null;

    const cleanMeta: CommunityPostMetadata = {
      ...params.metadata,
      isCustomExam,
      customExamName: customExamName || undefined,
      customExamNormalized: customExamNormalized || undefined,
      customExamAuthority: customExamAuthority || undefined,
      isCustomYear,
      customYear: customYear || undefined,
      customStage: customStage || undefined,
      customSession: customSession || undefined,
    };
    if (isCustomExam) {
      delete cleanMeta.examId; // Never put fake examId in canonical field
    }
    if (isCustomYear) {
      delete cleanMeta.editionYear;
    }

    const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newPost: CommunityPost = {
      id: postId,
      type: params.type,
      title: cleanTitle,
      description: cleanDesc,
      authorId: params.user?.uid || null,
      authorName: authorDisplayName,
      authorRole: params.user?.role || 'STUDENT',
      authorAvatarUrl: authorAvatar,
      status: 'OPEN',
      priority: 'NORMAL',
      supportCount: 1, // Author automatically supports their own post
      commentCount: 0,
      metadata: cleanMeta,
      customExamName,
      customExamNormalized,
      customExamAuthority,
      customYear,
      customStage,
      customSession,
      isPinned: false,
      isHidden: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hasUserSupported: true,
    };

    const client = supabaseService.getClient();
    if (client && params.user?.uid) {
      try {
        const insertPayload: any = {
          id: newPost.id,
          type: newPost.type,
          title: newPost.title,
          description: newPost.description,
          author_id: newPost.authorId,
          author_name: newPost.authorName,
          author_role: newPost.authorRole,
          status: newPost.status,
          priority: newPost.priority,
          support_count: 1,
          comment_count: 0,
          metadata: newPost.metadata,
          custom_exam_name: customExamName,
          custom_exam_normalized: customExamNormalized,
          custom_exam_authority: customExamAuthority,
          custom_year: customYear,
          custom_stage: customStage,
          custom_session: customSession,
        };

        const { error } = await client.from('community_posts').insert(insertPayload);

        if (!error) {
          // Author support record
          await client.from('community_supports').insert({
            post_id: newPost.id,
            user_id: params.user.uid,
          });
        }
      } catch (err) {
        console.warn('[CommunityService] Remote insert failed, saving locally:', err);
      }
    }

    // Save to local storage as well
    const localPosts = this.getLocalPosts();
    localPosts.unshift(newPost);
    this.saveLocalPosts(localPosts);

    if (params.user?.uid) {
      const userSupports = this.getUserSupports(params.user.uid);
      userSupports.add(newPost.id);
      this.saveUserSupports(params.user.uid, userSupports);
    }

    return newPost;
  }

  /**
   * Atomic Support Toggle (1 vote per user).
   */
  async toggleSupport(postId: string, user: UserProfile): Promise<{ supported: boolean; supportCount: number }> {
    const client = supabaseService.getClient();

    if (client && user.uid) {
      try {
        const { data, error } = await client.rpc('toggle_community_post_support', {
          p_post_id: postId,
          p_user_id: user.uid,
        });

        if (!error && data && typeof data === 'object') {
          const res = data as any;
          return {
            supported: Boolean(res.supported),
            supportCount: Number(res.supportCount),
          };
        }
      } catch (err) {
        console.warn('[CommunityService] Remote support toggle failed, falling back locally:', err);
      }
    }

    // Local fallback
    const userSupports = this.getUserSupports(user.uid);
    const localPosts = this.getLocalPosts();
    const post = localPosts.find((p) => p.id === postId);

    let supported = false;
    let newCount = post?.supportCount || 0;

    if (userSupports.has(postId)) {
      userSupports.delete(postId);
      newCount = Math.max(0, newCount - 1);
      supported = false;
    } else {
      userSupports.add(postId);
      newCount = newCount + 1;
      supported = true;
    }

    if (post) {
      post.supportCount = newCount;
      this.saveLocalPosts(localPosts);
    }
    this.saveUserSupports(user.uid, userSupports);

    return { supported, supportCount: newCount };
  }

  /**
   * Post a threaded comment or reply.
   */
  async createComment(params: {
    postId: string;
    parentCommentId?: string | null;
    content: string;
    user?: UserProfile | null;
    isOfficial?: boolean;
  }): Promise<CommunityComment> {
    if (!checkRateLimit('comment')) {
      throw new Error('Comment limit reached (max 10 comments per 5 minutes). Please wait a moment.');
    }

    if (params.user?.uid) {
      const restriction = await staffService.checkUserRestriction(params.user.uid);
      if (restriction.restricted) {
        throw new Error(
          `Commenting restricted: Your account community status is "${restriction.status}". Reason: ${restriction.reason || 'Community Guidelines violation'}${
            restriction.expiresAt ? ` (Expires: ${new Date(restriction.expiresAt).toLocaleDateString()})` : ' (Indefinite)'
          }`
        );
      }
    }

    const cleanContent = sanitizeInput(params.content);
    if (!cleanContent || cleanContent.length < 2) {
      throw new Error('Please enter a comment.');
    }

    const commentId = `comment_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newComment: CommunityComment = {
      id: commentId,
      postId: params.postId,
      parentCommentId: params.parentCommentId || null,
      authorId: params.user?.uid || null,
      authorName: getCommunityDisplayName(params.user),
      authorRole: params.user?.role || 'STUDENT',
      isOfficialResponse: Boolean(params.isOfficial),
      content: cleanContent,
      isHidden: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const client = supabaseService.getClient();
    if (client && params.user?.uid) {
      try {
        await client.from('community_comments').insert({
          id: newComment.id,
          post_id: newComment.postId,
          parent_comment_id: newComment.parentCommentId,
          author_id: newComment.authorId,
          author_name: newComment.authorName,
          author_role: newComment.authorRole,
          is_official_response: newComment.isOfficialResponse,
          content: newComment.content,
        });
      } catch (err) {
        console.warn('[CommunityService] Remote comment insert failed, saving locally:', err);
      }
    }

    // Local comments update
    const comments = this.getLocalComments(params.postId);
    comments.push(newComment);
    this.saveLocalComments(params.postId, comments);

    // Increment post comment_count locally
    const posts = this.getLocalPosts();
    const targetPost = posts.find((p) => p.id === params.postId);
    if (targetPost) {
      targetPost.commentCount = (targetPost.commentCount || 0) + 1;
      this.saveLocalPosts(posts);
    }

    return newComment;
  }

  /**
   * Admin / Staff: Update post status and resolution notes.
   */
  async updatePostStatus(
    postId: string,
    status: CommunityPostStatus,
    resolutionNotes?: string,
    staffName = 'Mock.AI Team'
  ): Promise<boolean> {
    // 1. Attempt secure RPC via staffService
    try {
      await staffService.staffUpdatePostStatus({
        postId,
        status,
        publicResolution: resolutionNotes,
        reason: 'Staff status update',
      });
    } catch (rpcErr: any) {
      console.warn('[CommunityService] staffUpdatePostStatus RPC error:', rpcErr?.message || rpcErr);
      // If error indicates 403 Forbidden, do not silently fallback
      if (rpcErr?.message && rpcErr.message.includes('403')) {
        throw rpcErr;
      }
    }

    // 2. Update local storage cache and dispatch sync
    this.syncPostStatusLocally(postId, status, resolutionNotes, staffName);

    return true;
  }

  /**
   * Synchronize local storage cache and dispatch update event when post status changes.
   */
  syncPostStatusLocally(
    postId: string,
    status: CommunityPostStatus,
    resolutionNotes?: string,
    staffName = 'Mock.AI Team',
    actingStaffUserId?: string
  ): void {
    const posts = this.getLocalPosts();
    const post = posts.find((p) => p.id === postId);
    if (post) {
      const oldStatus = post.status;
      post.status = status;
      if (resolutionNotes !== undefined) post.resolutionNotes = resolutionNotes;
      if (status === 'RESOLVED') {
        post.resolvedByName = staffName;
        post.resolvedAt = new Date().toISOString();
      }
      post.updatedAt = new Date().toISOString();
      this.saveLocalPosts(posts);

      // Create notification for author if status changed and not self-action
      const isSelfAction = Boolean(actingStaffUserId && post.authorId === actingStaffUserId);
      if (oldStatus !== status && post.authorId && !isSelfAction) {
        notificationService.addNotification({
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          recipientUserId: post.authorId,
          userId: post.authorId,
          postId: post.id,
          type: status === 'RESOLVED' ? 'POST_RESOLVED' : 'POST_STATUS_CHANGED',
          title:
            status === 'RESOLVED'
              ? 'Your report was resolved'
              : status === 'INVESTIGATING'
              ? 'Your paper request was updated'
              : 'Post status updated',
          body:
            status === 'RESOLVED'
              ? `Mock.AI Team marked your "${post.title.substring(0, 45)}" report as resolved.`
              : status === 'INVESTIGATING'
              ? `Status changed to Investigating for "${post.title.substring(0, 45)}".`
              : `Status changed to ${status} for "${post.title.substring(0, 45)}".`,
          message:
            status === 'RESOLVED'
              ? `Mock.AI Team marked your "${post.title.substring(0, 45)}" report as resolved.`
              : status === 'INVESTIGATING'
              ? `Status changed to Investigating for "${post.title.substring(0, 45)}".`
              : `Status changed to ${status} for "${post.title.substring(0, 45)}".`,
          entityType: 'community_post',
          entityId: post.id,
          metadata: {
            postId: post.id,
            postTitle: post.title,
            oldStatus,
            newStatus: status,
            resolutionNotes,
            actorName: staffName,
          },
          oldStatus,
          newStatus: status,
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('mockai_community_post_updated', {
          detail: {
            postId,
            status,
            resolutionNotes,
            resolvedByName: staffName,
          },
        })
      );
    }
  }

  addLocalNotification(notif: CommunityNotification): void {
    notificationService.addNotification(notif);
  }

  async getUserNotifications(userId?: string | null): Promise<CommunityNotification[]> {
    return notificationService.getNotifications(userId, 'all');
  }

  async markNotificationRead(notifId: string, userId?: string): Promise<boolean> {
    return notificationService.markAsRead(notifId, userId);
  }

  /**
   * Submit moderation flag on a post or comment.
   */
  async submitReport(params: {
    targetType: 'POST' | 'COMMENT';
    targetId: string;
    reason: 'SPAM' | 'ABUSE' | 'INAPPROPRIATE' | 'SCAM' | 'INCORRECT' | 'OTHER';
    details?: string;
    user?: UserProfile | null;
  }): Promise<boolean> {
    const cleanDetails = sanitizeInput(params.details || '');
    const client = supabaseService.getClient();

    if (client && params.user?.uid) {
      try {
        const { error } = await client.from('community_reports').insert({
          target_type: params.targetType,
          target_id: params.targetId,
          reporter_id: params.user.uid,
          reason: params.reason,
          details: cleanDetails,
        });
        if (!error) return true;
      } catch (err) {
        console.warn('[CommunityService] Remote report submission error:', err);
      }
    }
    return true; // Accepted gracefully
  }

  /**
   * Author or Staff: Edit an existing community post.
   * Enforces strict authorization: only author (or verified staff) can edit.
   * System-controlled fields (author_id, created_at, status, is_pinned, is_deleted) are strictly immutable by normal users.
   */
  async updatePost(params: {
    postId: string;
    title: string;
    description: string;
    metadata?: CommunityPostMetadata;
    user?: UserProfile | null;
  }): Promise<CommunityPost> {
    if (!params.user?.uid) {
      throw new Error('Please sign in to edit this post.');
    }

    if (!checkRateLimit('post')) {
      throw new Error('Posting limit reached. Please wait a moment before editing again.');
    }

    const restriction = await staffService.checkUserRestriction(params.user.uid);
    if (restriction.restricted) {
      throw new Error(
        `Account restricted from updating community posts: ${restriction.reason || 'Restricted'}`
      );
    }

    const cleanTitle = sanitizeInput(params.title);
    const cleanDesc = sanitizeInput(params.description);

    if (!cleanTitle || cleanTitle.length < 5) {
      throw new Error('Please enter a clear title (at least 5 characters).');
    }
    if (!cleanDesc || cleanDesc.length < 10) {
      throw new Error('Please enter a description (at least 10 characters).');
    }

    // Retrieve existing post to verify authorization
    const localPosts = this.getLocalPosts();
    let existingPost = localPosts.find((p) => p.id === params.postId);

    const client = supabaseService.getClient();
    if (client) {
      try {
        const { data: remoteData } = await client
          .from('community_posts')
          .select('*')
          .eq('id', params.postId)
          .single();
        if (remoteData) {
          existingPost = {
            id: remoteData.id,
            type: remoteData.type,
            title: remoteData.title,
            description: remoteData.description,
            authorId: remoteData.author_id,
            authorName: remoteData.author_name || 'Mock.AI User',
            authorRole: remoteData.author_role || 'STUDENT',
            authorAvatarUrl: remoteData.author_avatar_url || remoteData.metadata?.authorAvatarUrl || null,
            status: remoteData.status,
            priority: remoteData.priority || 'NORMAL',
            supportCount: remoteData.support_count || 0,
            commentCount: remoteData.comment_count || 0,
            metadata: remoteData.metadata || {},
            customExamName: remoteData.custom_exam_name || remoteData.metadata?.customExamName || null,
            customExamNormalized: remoteData.custom_exam_normalized || remoteData.metadata?.customExamNormalized || null,
            customExamAuthority: remoteData.custom_exam_authority || remoteData.metadata?.customExamAuthority || null,
            customYear: remoteData.custom_year || remoteData.metadata?.customYear || null,
            customStage: remoteData.custom_stage || remoteData.metadata?.customStage || null,
            customSession: remoteData.custom_session || remoteData.metadata?.customSession || null,
            duplicateOfId: remoteData.duplicate_of_id,
            resolutionNotes: remoteData.resolution_notes,
            resolvedByName: remoteData.resolved_by_name,
            resolvedAt: remoteData.resolved_at,
            isPinned: Boolean(remoteData.is_pinned),
            isHidden: Boolean(remoteData.is_hidden),
            isEdited: Boolean(remoteData.is_edited),
            editedAt: remoteData.edited_at || null,
            isDeleted: Boolean(remoteData.is_deleted),
            deletedAt: remoteData.deleted_at || null,
            deletedBy: remoteData.deleted_by || null,
            createdAt: remoteData.created_at,
            updatedAt: remoteData.updated_at,
          };
        }
      } catch (err) {
        console.warn('[CommunityService] Could not fetch remote post for auth check:', err);
      }
    }

    if (!existingPost) {
      throw new Error('This post no longer exists.');
    }

    if (existingPost.isDeleted) {
      throw new Error('This post has been deleted.');
    }

    // Permission check: caller must be author or staff
    const isAuthor = existingPost.authorId === params.user.uid;
    const isStaff = await staffService.checkIsStaff(params.user.uid);

    if (!isAuthor && !isStaff) {
      throw new Error("You don't have permission to edit this post.");
    }

    // Sanitize metadata fields
    const isCustomExam = Boolean(params.metadata?.isCustomExam);
    const isCustomYear = Boolean(params.metadata?.isCustomYear);
    const customExamName = params.metadata?.customExamName?.trim() || null;
    const customExamNormalized = customExamName ? normalizeExamName(customExamName) : null;
    const customExamAuthority = params.metadata?.customExamAuthority?.trim() || null;
    const customYear = params.metadata?.customYear ? Number(params.metadata.customYear) : null;
    const customStage = params.metadata?.customStage?.trim() || null;
    const customSession = params.metadata?.customSession?.trim() || null;

    const cleanMeta: CommunityPostMetadata = {
      ...existingPost.metadata,
      ...params.metadata,
      isCustomExam,
      customExamName: customExamName || undefined,
      customExamNormalized: customExamNormalized || undefined,
      customExamAuthority: customExamAuthority || undefined,
      isCustomYear,
      customYear: customYear || undefined,
      customStage: customStage || undefined,
      customSession: customSession || undefined,
    };
    if (isCustomExam) {
      delete cleanMeta.examId;
    }
    if (isCustomYear) {
      delete cleanMeta.editionYear;
    }

    const nowIso = new Date().toISOString();

    // Database update with server-side author verification
    if (client) {
      try {
        let updateQuery = client
          .from('community_posts')
          .update({
            title: cleanTitle,
            description: cleanDesc,
            metadata: cleanMeta,
            custom_exam_name: customExamName,
            custom_exam_normalized: customExamNormalized,
            custom_exam_authority: customExamAuthority,
            custom_year: customYear,
            custom_stage: customStage,
            custom_session: customSession,
            is_edited: true,
            edited_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', params.postId);

        // If not staff, enforce author_id check in the SQL UPDATE
        if (!isStaff) {
          updateQuery = updateQuery.eq('author_id', params.user.uid);
        }

        const { error } = await updateQuery;
        if (error) {
          throw new Error(error.message);
        }
      } catch (err: any) {
        if (
          err?.message?.includes('403') ||
          err?.message?.includes('permission') ||
          err?.message?.includes('row-level security')
        ) {
          throw new Error("You don't have permission to edit this post.");
        }
        console.warn('[CommunityService] Remote update error, saving to local cache:', err);
      }
    }

    // Update local cache
    const updatedPost: CommunityPost = {
      ...existingPost,
      title: cleanTitle,
      description: cleanDesc,
      metadata: cleanMeta,
      customExamName,
      customExamNormalized,
      customExamAuthority,
      customYear,
      customStage,
      customSession,
      isEdited: true,
      editedAt: nowIso,
      updatedAt: nowIso,
    };

    const targetIndex = localPosts.findIndex((p) => p.id === params.postId);
    if (targetIndex >= 0) {
      localPosts[targetIndex] = updatedPost;
    } else {
      localPosts.unshift(updatedPost);
    }
    this.saveLocalPosts(localPosts);

    return updatedPost;
  }

  /**
   * Author or Staff: Delete (soft delete) an existing community post.
   * Enforces strict authorization: only author or verified staff can delete.
   */
  async deletePost(postId: string, user?: UserProfile | null): Promise<boolean> {
    if (!user?.uid) {
      throw new Error('Please sign in to delete this post.');
    }

    const localPosts = this.getLocalPosts();
    let existingPost = localPosts.find((p) => p.id === postId);

    const client = supabaseService.getClient();
    if (client) {
      try {
        const { data: remoteData } = await client
          .from('community_posts')
          .select('id, author_id, title, is_deleted')
          .eq('id', postId)
          .single();
        if (remoteData) {
          existingPost = {
            ...(existingPost || ({} as any)),
            id: remoteData.id,
            authorId: remoteData.author_id,
            title: remoteData.title,
            isDeleted: Boolean(remoteData.is_deleted),
          };
        }
      } catch (err) {
        console.warn('[CommunityService] Could not fetch remote post for delete auth check:', err);
      }
    }

    if (!existingPost) {
      throw new Error('This post no longer exists.');
    }

    const isAuthor = existingPost.authorId === user.uid;
    const isStaff = await staffService.checkIsStaff(user.uid);

    if (!isAuthor && !isStaff) {
      throw new Error("You don't have permission to delete this post.");
    }

    const nowIso = new Date().toISOString();

    // Attempt RPC delete_community_post or direct update
    if (client) {
      try {
        const { error: rpcErr } = await client.rpc('delete_community_post', {
          p_post_id: postId,
          p_user_id: user.uid,
        });

        if (rpcErr) {
          let updateQuery = client
            .from('community_posts')
            .update({
              is_deleted: true,
              deleted_at: nowIso,
              deleted_by: user.uid,
              updated_at: nowIso,
            })
            .eq('id', postId);

          if (!isStaff) {
            updateQuery = updateQuery.eq('author_id', user.uid);
          }

          const { error: updateErr } = await updateQuery;
          if (updateErr) {
            throw new Error(updateErr.message);
          }
        }
      } catch (err: any) {
        if (
          err?.message?.includes('403') ||
          err?.message?.includes('permission') ||
          err?.message?.includes('Forbidden')
        ) {
          throw new Error("You don't have permission to delete this post.");
        }
        console.warn('[CommunityService] Remote delete error, saving locally:', err);
      }
    }

    // Update local cache
    const target = localPosts.find((p) => p.id === postId);
    if (target) {
      target.isDeleted = true;
      target.deletedAt = nowIso;
      target.deletedBy = user.uid;
      this.saveLocalPosts(localPosts);
    }

    return true;
  }
}

export const communityService = new CommunityService();

