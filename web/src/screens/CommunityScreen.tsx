/**
 * MOCK.AI — Dedicated Community & Feedback Hub Screen
 *
 * "Discuss, report, request, and help improve Mock.AI."
 *
 * Professional academic hub supporting:
 * - Paper Requests (demand aggregation)
 * - Question Reports (canonical question linking & content quality pipeline)
 * - Bug Reports (environment diagnostics)
 * - Feature Requests (upvotable improvements)
 * - Discussions (threaded academic prep)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Plus,
  FileQuestion,
  AlertTriangle,
  Bug,
  Lightbulb,
  MessageSquare,
  Users,
  CheckCircle2,
  Clock,
  Filter,
  ArrowUpDown,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  HelpCircle,
} from 'lucide-react';
import {
  CommunityPost,
  CommunityPostType,
  CommunityPostStatus,
  UserProfile,
  AppRoute,
  StaffAuthStatus,
} from '../types';
import { communityService } from '../services/communityService';
import { staffService } from '../services/staffService';
import { supabaseService } from '../services/supabase';
import { CreatePostModal } from '../components/community/CreatePostModal';
import { PostDetailModal } from '../components/community/PostDetailModal';
import { ReportContentModal } from '../components/community/ReportContentModal';
import { CommunityGuidelinesModal } from '../components/community/CommunityGuidelinesModal';
import { PostActionMenu } from '../components/community/PostActionMenu';
import { DeletePostModal } from '../components/community/DeletePostModal';
import { COMPETITIVE_EXAMS_CATALOG } from '../data/exams/catalog';

interface CommunityScreenProps {
  user: UserProfile | null;
  onNavigate?: (route: AppRoute) => void;
  onNavigateToQuestion?: (examId: string, paperId: string, questionNumber?: number) => void;
  onNavigateToPaper?: (paperId: string) => void;
  initialContext?: {
    postId?: string;
    type?: CommunityPostType;
    examId?: string;
    editionYear?: number;
    paperId?: string;
    questionId?: string;
    questionNumber?: number;
    tier?: string;
    shift?: string;
  };
}

export const CommunityScreen: React.FC<CommunityScreenProps> = ({
  user,
  onNavigate,
  onNavigateToQuestion,
  onNavigateToPaper,
  initialContext,
}) => {
  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<CommunityPostType | 'ALL'>(initialContext?.type || 'ALL');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<CommunityPostStatus | 'ALL'>('ALL');
  const [selectedExam, setSelectedExam] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'recent' | 'supported' | 'discussed'>('recent');

  // Posts State
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchRequestIdRef = useRef(0);

  // Modals & Action State
  const [createModalOpen, setCreateModalOpen] = useState(Boolean(initialContext));
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [deletingPost, setDeletingPost] = useState<CommunityPost | null>(null);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [reportModalData, setReportModalData] = useState<{ targetType: 'POST' | 'COMMENT'; targetId: string } | null>(null);
  const [guidelinesModalOpen, setGuidelinesModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  // Staff Authorization Status
  const [authStatus, setAuthStatus] = useState<StaffAuthStatus | null>(null);

  useEffect(() => {
    if (user?.uid) {
      staffService.getStaffAuthStatus(user.uid).then(setAuthStatus);
    } else {
      setAuthStatus(null);
    }
  }, [user?.uid]);

  // Sync tab, active post, and modal visibility if initialContext updates
  useEffect(() => {
    if (initialContext) {
      if (initialContext.type) {
        setActiveTab(initialContext.type);
      }
      if (initialContext.postId) {
        setActivePostId(initialContext.postId);
        setCreateModalOpen(false);
      } else {
        setCreateModalOpen(true);
      }
    }
  }, [initialContext]);

  const PAGE_SIZE = 20;

  const isFiltered =
    Boolean(searchQuery.trim()) ||
    activeTab !== 'ALL' ||
    selectedStatus !== 'ALL' ||
    selectedExam !== 'ALL';

  const handleClearFilters = () => {
    setSearchQuery('');
    setActiveTab('ALL');
    setSelectedStatus('ALL');
    setSelectedExam('ALL');
    setSortBy('recent');
  };

  const fetchPostsData = useCallback(
    async (offset = 0) => {
      return communityService.getPosts({
        type: activeTab,
        status: selectedStatus,
        examId: selectedExam !== 'ALL' && selectedExam !== 'CUSTOM_EXAMS' ? selectedExam : undefined,
        search: searchQuery,
        sort: sortBy,
        userId: user?.uid,
        limit: PAGE_SIZE,
        offset,
      });
    },
    [activeTab, selectedStatus, selectedExam, searchQuery, sortBy, user?.uid]
  );

  const loadPosts = useCallback(async () => {
    const currentReqId = ++fetchRequestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchPostsData(0);
      if (currentReqId !== fetchRequestIdRef.current) return;
      let fetched = res.posts;
      if (selectedExam === 'CUSTOM_EXAMS') {
        fetched = fetched.filter((p) => Boolean(p.customExamName || p.metadata?.customExamName));
      }
      setPosts(fetched);
      setTotalCount(res.total);
    } catch (err: any) {
      if (currentReqId !== fetchRequestIdRef.current) return;
      console.error('[CommunityScreen] Failed to load posts:', err);
      setError("We couldn't load the community right now.");
    } finally {
      if (currentReqId === fetchRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [fetchPostsData, selectedExam]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Real-time synchronization: update post status immediately when changed by staff, when tab is refocused, or when deleted
  useEffect(() => {
    const handlePostUpdated = (e: any) => {
      const detail = e.detail;
      if (!detail?.postId) return;
      setPosts((prev) =>
        prev.map((p) =>
          p.id === detail.postId
            ? {
                ...p,
                status: detail.status || p.status,
                resolutionNotes: detail.resolutionNotes !== undefined ? detail.resolutionNotes : p.resolutionNotes,
                resolvedByName: detail.resolvedByName || p.resolvedByName,
                resolvedAt: detail.status === 'RESOLVED' ? new Date().toISOString() : p.resolvedAt,
                updatedAt: new Date().toISOString(),
              }
            : p
        )
      );
    };

    const handlePostDeleted = (e: any) => {
      const deletedId = e.detail?.postId;
      if (!deletedId) return;
      setPosts((prev) => prev.filter((p) => p.id !== deletedId));
      setTotalCount((prev) => Math.max(0, prev - 1));
      if (activePostId === deletedId) {
        setActivePostId(null);
      }
      if (deletingPost?.id === deletedId) {
        setDeletingPost(null);
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'mockai_community_last_deleted_id' && e.newValue) {
        const deletedId = e.newValue.split(':')[0];
        if (deletedId) {
          setPosts((prev) => prev.filter((p) => p.id !== deletedId));
          setTotalCount((prev) => Math.max(0, prev - 1));
          if (activePostId === deletedId) {
            setActivePostId(null);
          }
        }
      }
    };

    const handleFocus = () => {
      loadPosts();
    };

    window.addEventListener('mockai_community_post_updated', handlePostUpdated);
    window.addEventListener('mockai_community_post_deleted', handlePostDeleted);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleFocus);

    // Supabase Realtime channel for live Postgres changes on community_posts
    const client = supabaseService.getClient();
    let channel: any = null;
    if (client) {
      try {
        channel = client
          .channel('public:community_posts_sync')
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'community_posts' },
            (payload: any) => {
              const deletedId = payload.old?.id;
              if (deletedId) {
                setPosts((prev) => prev.filter((p) => p.id !== deletedId));
                setTotalCount((prev) => Math.max(0, prev - 1));
              }
            }
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'community_posts' },
            (payload: any) => {
              const updated = payload.new;
              if (!updated?.id) return;
              if (updated.is_hidden) {
                setPosts((prev) => prev.filter((p) => p.id !== updated.id));
                setTotalCount((prev) => Math.max(0, prev - 1));
              } else {
                setPosts((prev) =>
                  prev.map((p) =>
                    p.id === updated.id
                      ? {
                          ...p,
                          status: updated.status || p.status,
                          isPinned: Boolean(updated.is_pinned),
                          supportCount: updated.support_count ?? p.supportCount,
                          commentCount: updated.comment_count ?? p.commentCount,
                        }
                      : p
                  )
                );
              }
            }
          )
          .subscribe();
      } catch {
        // ignore
      }
    }

    return () => {
      window.removeEventListener('mockai_community_post_updated', handlePostUpdated);
      window.removeEventListener('mockai_community_post_deleted', handlePostDeleted);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
      if (channel && client) {
        try {
          client.removeChannel(channel);
        } catch {
          // ignore
        }
      }
    };
  }, [loadPosts, activePostId, deletingPost?.id]);

  const handleLoadMore = async () => {
    if (isLoadingMore || posts.length >= totalCount) return;
    setIsLoadingMore(true);
    try {
      const res = await fetchPostsData(posts.length);
      let fetched = res.posts;
      if (selectedExam === 'CUSTOM_EXAMS') {
        fetched = fetched.filter((p) => Boolean(p.customExamName || p.metadata?.customExamName));
      }
      setPosts((prev) => [...prev, ...fetched]);
      setTotalCount(res.total);
    } catch (err: any) {
      console.error('[CommunityScreen] Failed to load more posts:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSupportClick = async (e: React.MouseEvent, post: CommunityPost) => {
    e.stopPropagation();
    if (!user) {
      alert('Please sign in to support this request.');
      return;
    }

    try {
      const res = await communityService.toggleSupport(post.id, user);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, hasUserSupported: res.supported, supportCount: res.supportCount } : p
        )
      );
    } catch {
      alert('Failed to update support count.');
    }
  };

  const handleCopyPostLink = (p: CommunityPost) => {
    const url = `${window.location.origin}${window.location.pathname}?tab=community&post=${p.id}#post-${p.id}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
    showToast('Post link copied to clipboard!');
  };

  const handleConfirmDelete = async (p: CommunityPost) => {
    try {
      await communityService.deletePost(p.id, user);
      setPosts((prev) => prev.filter((item) => item.id !== p.id));
      setTotalCount((prev) => Math.max(0, prev - 1));
      if (activePostId === p.id) {
        setActivePostId(null);
      }
      showToast('Post deleted successfully.');
    } catch (err: any) {
      const msg = err?.message || '';
      const isGone =
        msg.includes('no longer exists') ||
        msg.includes('not found') ||
        msg.includes('no longer available') ||
        msg.includes('already deleted') ||
        msg.includes('404');

      if (isGone) {
        // Prune the nonexistent post from UI state immediately
        setPosts((prev) => prev.filter((item) => item.id !== p.id));
        setTotalCount((prev) => Math.max(0, prev - 1));
        if (activePostId === p.id) {
          setActivePostId(null);
        }
        throw new Error('This post has already been deleted or is no longer available.');
      }
      throw err;
    }
  };

  const handleStaffPinToggle = async (p: CommunityPost) => {
    try {
      const newPinned = !p.isPinned;
      await staffService.staffModeratePost({
        postId: p.id,
        action: newPinned ? 'PIN' : 'UNPIN',
        reason: 'Staff action via post menu',
      });
      setPosts((prev) =>
        prev.map((item) => (item.id === p.id ? { ...item, isPinned: newPinned } : item))
      );
      showToast(newPinned ? 'Post pinned successfully.' : 'Post unpinned.');
    } catch (err: any) {
      alert(err?.message || 'Failed to update pin state.');
    }
  };

  const handleStaffHideToggle = async (p: CommunityPost) => {
    try {
      const newHidden = !p.isHidden;
      await staffService.staffModeratePost({
        postId: p.id,
        action: newHidden ? 'HIDE' : 'RESTORE',
        reason: 'Staff action via post menu',
      });
      setPosts((prev) =>
        prev.map((item) => (item.id === p.id ? { ...item, isHidden: newHidden } : item))
      );
      showToast(newHidden ? 'Post hidden from community.' : 'Post restored.');
    } catch (err: any) {
      alert(err?.message || 'Failed to update visibility state.');
    }
  };

  const getStatusBadge = (status: CommunityPostStatus) => {
    switch (status) {
      case 'OPEN':
        return <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-bold">🟡 Open</span>;
      case 'INVESTIGATING':
        return <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] font-bold">🔵 Investigating</span>;
      case 'IN_PROGRESS':
        return <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[11px] font-bold">🟣 In Progress</span>;
      case 'RESOLVED':
        return <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">🟢 Resolved</span>;
      case 'DUPLICATE':
        return <span className="px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-500 text-[11px] font-bold">⚪ Duplicate</span>;
      case 'REJECTED':
        return <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 text-[11px] font-bold">🔴 Rejected</span>;
      case 'NEEDS_INFORMATION':
        return <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 text-[11px] font-bold">🟠 Needs Info</span>;
    }
  };

  const getTypeBadge = (type: CommunityPostType) => {
    switch (type) {
      case 'PAPER_REQUEST':
        return <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><FileQuestion className="w-3 h-3" /> Paper Request</span>;
      case 'QUESTION_REPORT':
        return <span className="px-2 py-0.5 rounded-lg bg-red-500/15 text-red-700 dark:text-red-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Question Report</span>;
      case 'BUG_REPORT':
        return <span className="px-2 py-0.5 rounded-lg bg-purple-500/15 text-purple-700 dark:text-purple-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><Bug className="w-3 h-3" /> Bug Report</span>;
      case 'FEATURE_REQUEST':
        return <span className="px-2 py-0.5 rounded-lg bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><Lightbulb className="w-3 h-3" /> Feature Request</span>;
      default:
        return <span className="px-2 py-0.5 rounded-lg bg-brand-primary/15 text-brand-primary text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Discussion</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 space-y-6 animate-in fade-in duration-300">
      {/* ── Top Header Banner ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-brand-primary/10 via-brand-variant/5 to-transparent border border-brand-primary/15">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-bold uppercase tracking-wider mb-2">
            <span>🤝 Learner & Faculty Hub</span>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-display font-black text-surface-text dark:text-darkSurface-text">
            Community
          </h1>
          <p className="text-sm text-surface-muted dark:text-darkSurface-muted mt-1 max-w-xl">
            Discuss, report, request, and help improve Mock.AI.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setGuidelinesModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-surface-elev2 hover:bg-surface-elev3 text-surface-text dark:bg-darkSurface-elev2 dark:hover:bg-darkSurface-elev3 dark:text-darkSurface-text font-bold text-xs border border-surface-border dark:border-darkSurface-border transition-all"
          >
            <HelpCircle className="w-3.5 h-3.5 text-brand-primary" />
            <span>Guidelines</span>
          </button>

          {authStatus?.isStaff && onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('staff')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold text-xs hover:bg-emerald-500/25 transition-all shadow-sm"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Staff Portal</span>
            </button>
          )}

          <button
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white font-bold text-xs shadow-glow hover:brightness-110 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Post</span>
          </button>
        </div>
      </div>

      {/* ── Search & Primary Tabs ─────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-surface-muted dark:text-darkSurface-muted" />
          <input
            type="text"
            placeholder="Search discussions, paper requests, or question numbers (e.g. GATE DA Q17, SSC CHSL 2024)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs sm:text-sm text-surface-text dark:text-darkSurface-text placeholder:text-surface-muted dark:placeholder:text-darkSurface-muted focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary shadow-sm transition-all"
          />
        </div>

        {/* Primary Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-surface-border dark:border-darkSurface-border">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'PAPER_REQUEST', label: 'Paper Requests' },
            { id: 'QUESTION_REPORT', label: 'Question Reports' },
            { id: 'BUG_REPORT', label: 'Bug Reports' },
            { id: 'FEATURE_REQUEST', label: 'Feature Requests' },
            { id: 'DISCUSSION', label: 'Discussions' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-brand-primary text-white shadow-glow'
                  : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Secondary Sub-Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="px-3.5 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">🟡 Open</option>
              <option value="INVESTIGATING">🔵 Investigating</option>
              <option value="IN_PROGRESS">🟣 In Progress</option>
              <option value="RESOLVED">🟢 Resolved</option>
              <option value="DUPLICATE">⚪ Duplicate</option>
            </select>

            {/* Exam Filter */}
            <select
              value={selectedExam}
              onChange={(e) => setSelectedExam(e.target.value)}
              className="px-3.5 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
            >
              <option value="ALL">All Exams</option>
              <optgroup label="Catalog Exams">
                {COMPETITIVE_EXAMS_CATALOG.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Custom Requests">
                <option value="CUSTOM_EXAMS">✨ Custom / Unlisted Exams</option>
              </optgroup>
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1.5 text-surface-muted dark:text-darkSurface-muted">
            <ArrowUpDown className="w-3.5 h-3.5" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3.5 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
            >
              <option value="recent">Most Recent</option>
              <option value="supported">Most Supported</option>
              <option value="discussed">Most Discussed</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Post Cards Feed ───────────────────────────────────────────── */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="py-16 text-center text-surface-muted dark:text-darkSurface-muted space-y-3 animate-pulse">
            <RefreshCw className="w-6 h-6 mx-auto animate-spin text-brand-primary" />
            <p className="text-xs">Loading community posts...</p>
          </div>
        ) : error ? (
          <div className="p-8 sm:p-12 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-red-500/20 shadow-card text-center space-y-4">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto" />
            <div className="space-y-1">
              <h3 className="font-bold text-base font-display text-surface-text dark:text-darkSurface-text">
                We couldn't load the community right now.
              </h3>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted max-w-md mx-auto">
                There was a problem connecting to the server. Please check your connection and try again.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadPosts()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-xs font-bold shadow-glow hover:brightness-110 active:scale-95 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </button>
          </div>
        ) : posts.length === 0 ? (
          isFiltered ? (
            <div className="p-8 sm:p-12 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-card text-center space-y-3">
              <Filter className="w-10 h-10 text-surface-muted/50 dark:text-darkSurface-muted/50 mx-auto" />
              <h3 className="font-bold text-base font-display text-surface-text dark:text-darkSurface-text">
                No matching community posts
              </h3>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted max-w-md mx-auto">
                No discussions, reports, or requests match your current filters. Try changing or clearing filters.
              </p>
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-5 py-2.5 rounded-xl bg-surface-elev2 hover:bg-surface-elev3 text-surface-text dark:bg-darkSurface-elev2 dark:hover:bg-darkSurface-elev3 dark:text-darkSurface-text text-xs font-bold border border-surface-border dark:border-darkSurface-border transition-all"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="p-8 sm:p-12 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-card text-center space-y-3">
              <MessageSquare className="w-10 h-10 text-surface-muted/50 dark:text-darkSurface-muted/50 mx-auto" />
              <h3 className="font-bold text-base font-display text-surface-text dark:text-darkSurface-text">
                No community posts yet
              </h3>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted max-w-md mx-auto">
                Be the first learner to start a discussion, report an issue, or request a question paper.
              </p>
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-xs font-bold shadow-glow hover:brightness-110 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Create Community Post</span>
              </button>
            </div>
          )
        ) : (
          <>
            {posts.map((post) => (
              <div
                key={post.id}
                onClick={() => setActivePostId(post.id)}
                className="group cursor-pointer p-4 sm:p-5 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm hover:border-brand-primary/40 hover:shadow-card transition-all space-y-3"
              >
                {/* Card Header: Type Badge, Status Badge & Meta Chips */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {getTypeBadge(post.type)}
                    {getStatusBadge(post.status)}
                    {post.isPinned && (
                      <span className="px-2 py-0.5 rounded bg-brand-primary/10 text-brand-primary text-[10px] font-bold uppercase tracking-wider">
                        📌 Pinned
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-[11px] text-surface-muted dark:text-darkSurface-muted flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                      {post.isEdited && (
                        <span className="text-[10px] text-surface-muted/80 dark:text-darkSurface-muted/80 font-sans font-medium">
                          · Edited
                        </span>
                      )}
                    </span>

                    <PostActionMenu
                      post={post}
                      user={user}
                      authStatus={authStatus}
                      onEdit={(p) => {
                        setEditingPost(p);
                        setCreateModalOpen(true);
                      }}
                      onDelete={(p) => {
                        setDeletingPost(p);
                      }}
                      onReport={(p) => {
                        setReportModalData({ targetType: 'POST', targetId: p.id });
                      }}
                      onCopyLink={(p) => {
                        handleCopyPostLink(p);
                      }}
                      onStaffPinToggle={handleStaffPinToggle}
                      onStaffHideToggle={handleStaffHideToggle}
                    />
                  </div>
                </div>

                {/* Title & Description */}
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-surface-text dark:text-darkSurface-text group-hover:text-brand-primary transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-1 line-clamp-2 leading-relaxed">
                    {post.description}
                  </p>
                </div>

                {/* Context Badges (Exam / Paper / Question ID / Custom Exam) */}
                {(post.metadata?.examId || post.metadata?.questionNumber || post.metadata?.tier || post.customExamName || post.metadata?.customExamName) && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {(post.customExamName || post.metadata?.customExamName) ? (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-bold flex items-center gap-1">
                        ✨ {post.customExamName || post.metadata?.customExamName}
                        {(post.customYear || post.metadata?.customYear) ? ` ${post.customYear || post.metadata?.customYear}` : ''}
                      </span>
                    ) : (
                      post.metadata?.examId && (
                        <span className="px-2 py-0.5 rounded-md bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border text-[10px] font-bold text-surface-muted dark:text-darkSurface-muted">
                          {post.metadata.examId.toUpperCase()}
                        </span>
                      )
                    )}
                    {!(post.customExamName || post.metadata?.customExamName) && post.metadata?.editionYear && (
                      <span className="px-2 py-0.5 rounded-md bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border text-[10px] text-surface-muted dark:text-darkSurface-muted">
                        {post.metadata.editionYear}
                      </span>
                    )}
                    {(post.customExamAuthority || post.metadata?.customExamAuthority) && (
                      <span className="px-2 py-0.5 rounded-md bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border text-[10px] text-surface-muted dark:text-darkSurface-muted">
                        🏛️ {post.customExamAuthority || post.metadata?.customExamAuthority}
                      </span>
                    )}
                    {(post.customStage || post.metadata?.customStage || post.metadata?.tier) && (
                      <span className="px-2 py-0.5 rounded-md bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border text-[10px] text-surface-muted dark:text-darkSurface-muted">
                        {post.customStage || post.metadata?.customStage || post.metadata?.tier}
                      </span>
                    )}
                    {(post.customSession || post.metadata?.customSession || post.metadata?.shift) && (
                      <span className="px-2 py-0.5 rounded-md bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border text-[10px] text-surface-muted dark:text-darkSurface-muted">
                        {post.customSession || post.metadata?.customSession || post.metadata?.shift}
                      </span>
                    )}
                    {post.metadata?.questionNumber && (
                      <span className="px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-600 dark:text-red-400">
                        Q#{post.metadata.questionNumber}
                      </span>
                    )}
                  </div>
                )}

                {/* Card Footer: Author, Support button, Comments */}
                <div className="flex items-center justify-between pt-2.5 border-t border-surface-border dark:border-darkSurface-border text-xs">
                  <span className="text-surface-muted dark:text-darkSurface-muted">
                    By <strong className="text-surface-text dark:text-darkSurface-text font-semibold">{post.authorName || 'Mock.AI User'}</strong>
                  </span>

                  <div className="flex items-center gap-3">
                    {/* Support CTA Button */}
                    <button
                      type="button"
                      onClick={(e) => handleSupportClick(e, post)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        post.hasUserSupported
                          ? 'bg-brand-primary text-white shadow-glow'
                          : 'bg-surface-elev2 hover:bg-surface-elev3 text-surface-muted hover:text-surface-text dark:bg-darkSurface-elev2 dark:hover:bg-darkSurface-elev3 dark:text-darkSurface-muted dark:hover:text-darkSurface-text border border-surface-border dark:border-darkSurface-border'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>{post.supportCount}</span>
                    </button>

                    {/* Comment Count */}
                    <span className="inline-flex items-center gap-1 text-surface-muted dark:text-darkSurface-muted">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{post.commentCount}</span>
                    </span>

                    <ChevronRight className="w-4 h-4 text-surface-muted dark:text-darkSurface-muted group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            ))}

            {/* Load More Pagination */}
            {posts.length < totalCount && (
              <div className="pt-4 text-center">
                <button
                  type="button"
                  disabled={isLoadingMore}
                  onClick={handleLoadMore}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 text-xs font-bold text-surface-text dark:text-darkSurface-text transition-all shadow-sm"
                >
                  {isLoadingMore ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-primary" />
                      <span>Loading more posts...</span>
                    </>
                  ) : (
                    <>
                      <span>Load More Posts</span>
                      <span className="text-[11px] text-surface-muted dark:text-darkSurface-muted font-normal">
                        ({posts.length} of {totalCount})
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────── */}
      <CreatePostModal
        isOpen={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setEditingPost(null);
        }}
        user={user}
        initialType={initialContext?.type || (activeTab !== 'ALL' ? activeTab : 'DISCUSSION')}
        initialContext={initialContext}
        editPost={editingPost}
        onPostCreated={(newPost) => {
          setPosts((prev) => [newPost, ...prev]);
          setTotalCount((prev) => prev + 1);
          setActivePostId(newPost.id);
          showToast('Post created successfully!');
        }}
        onPostUpdated={(updated) => {
          setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          showToast('Post updated successfully!');
        }}
        onSelectExistingPost={(existing) => {
          setActivePostId(existing.id);
        }}
      />

      <DeletePostModal
        isOpen={Boolean(deletingPost)}
        post={deletingPost}
        onClose={() => setDeletingPost(null)}
        onConfirmDelete={handleConfirmDelete}
      />

      <PostDetailModal
        postId={activePostId}
        isOpen={Boolean(activePostId)}
        onClose={() => setActivePostId(null)}
        user={user}
        onSupportToggled={(id, supported, count) => {
          setPosts((prev) =>
            prev.map((p) => (p.id === id ? { ...p, hasUserSupported: supported, supportCount: count } : p))
          );
        }}
        onOpenReportContent={(targetType, targetId) => {
          setReportModalData({ targetType, targetId });
        }}
        onNavigateToQuestion={onNavigateToQuestion}
        onNavigateToPaper={onNavigateToPaper}
      />

      {reportModalData && (
        <ReportContentModal
          isOpen={Boolean(reportModalData)}
          onClose={() => setReportModalData(null)}
          targetType={reportModalData.targetType}
          targetId={reportModalData.targetId}
          user={user}
        />
      )}

      <CommunityGuidelinesModal
        isOpen={guidelinesModalOpen}
        onClose={() => setGuidelinesModalOpen(false)}
      />

      {/* Floating Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-surface-text text-white dark:bg-darkSurface-text dark:text-darkSurface-bg shadow-2xl text-xs font-semibold animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
