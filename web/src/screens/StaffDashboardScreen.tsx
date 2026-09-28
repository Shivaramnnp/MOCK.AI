/**
 * MOCK.AI — Dedicated Staff Operations & Moderation Portal
 *
 * Exclusively accessible to verified Mock.AI Staff members.
 * Security is enforced via PostgreSQL Row-Level Security (RLS) and Security Definer RPCs.
 *
 * Core Capabilities:
 * 1. Moderation Queue & Content Quality Review (Question reports, paper requests, bug reports)
 * 2. Status & Public Resolution Management (with atomic audit logging)
 * 3. Isolated Internal Staff Notes (stored in staff_notes, protected by staff-only RLS)
 * 4. Official Verified Team Responses (cryptographically signed via staff_post_official_comment)
 * 5. Content Moderation (Hide, Restore, Pin, Unpin, Mark Duplicate, Mark Spam)
 * 6. User Community Restrictions (Posting Restricted, Suspended, Banned)
 * 7. Immutable Audit Log Inspection
 * 8. User Reports Review
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  FileQuestion,
  Bug,
  Lightbulb,
  MessageSquare,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Pin,
  EyeOff,
  Eye,
  Send,
  Lock,
  UserX,
  History,
  Flag,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  FileText,
  AlertCircle,
} from 'lucide-react';
import {
  UserProfile,
  CommunityPost,
  CommunityPostType,
  CommunityPostStatus,
  StaffAuthStatus,
  StaffNote,
  CommunityAuditLog,
  CommunityReport,
  CommunityUserRestrictionStatus,
  AppRoute,
} from '../types';
import { staffService } from '../services/staffService';
import { communityService } from '../services/communityService';

interface StaffDashboardScreenProps {
  user: UserProfile | null;
  onNavigate: (route: AppRoute) => void;
  onNavigateToQuestion?: (examId: string, paperId: string, questionNumber?: number) => void;
  onNavigateToPaper?: (paperId: string) => void;
}

export const StaffDashboardScreen: React.FC<StaffDashboardScreenProps> = ({
  user,
  onNavigate,
  onNavigateToQuestion,
  onNavigateToPaper,
}) => {
  // Authorization State
  const [authStatus, setAuthStatus] = useState<StaffAuthStatus | null>(null);
  const [isVerifyingAuth, setIsVerifyingAuth] = useState(true);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'queue' | 'reports' | 'restrictions' | 'audit'>('queue');

  // Queue State
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [typeFilter, setTypeFilter] = useState<CommunityPostType | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<CommunityPostStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Post Actions State
  const [newStatus, setNewStatus] = useState<CommunityPostStatus>('OPEN');
  const [publicResolution, setPublicResolution] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [updateReason, setUpdateReason] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Official Reply State
  const [officialReplyText, setOfficialReplyText] = useState('');
  const [isPostingReply, setIsPostingReply] = useState(false);

  // Internal Notes State
  const [staffNotes, setStaffNotes] = useState<StaffNote[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);

  // User Reports State
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<CommunityAuditLog[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // User Restriction Modal / Form State
  const [restrictionModalOpen, setRestrictionModalOpen] = useState(false);
  const [restrictUserId, setRestrictUserId] = useState('');
  const [restrictStatus, setRestrictStatus] = useState<CommunityUserRestrictionStatus>('POSTING_RESTRICTED');
  const [restrictReason, setRestrictReason] = useState('');
  const [restrictDurationHours, setRestrictDurationHours] = useState<number>(24);
  const [isRestricting, setIsRestricting] = useState(false);

  // 1. Verify Staff Authorization on mount / user change
  useEffect(() => {
    let isMounted = true;
    const checkAuth = async () => {
      setIsVerifyingAuth(true);
      try {
        const status = await staffService.getStaffAuthStatus(user?.uid);
        if (isMounted) {
          setAuthStatus(status);
        }
      } finally {
        if (isMounted) setIsVerifyingAuth(false);
      }
    };
    checkAuth();
    return () => {
      isMounted = false;
    };
  }, [user?.uid]);

  // 2. Fetch Queue Posts
  const fetchQueue = useCallback(async () => {
    setIsLoadingQueue(true);
    try {
      const res = await communityService.getPosts({
        type: typeFilter,
        status: statusFilter,
        search: searchQuery,
        sort: 'recent',
        userId: user?.uid,
      });
      setPosts(res.posts);
      // Sync selected post if open
      if (selectedPost) {
        const updated = res.posts.find((p) => p.id === selectedPost.id);
        if (updated) setSelectedPost(updated);
      }
    } finally {
      setIsLoadingQueue(false);
    }
  }, [typeFilter, statusFilter, searchQuery, user?.uid, selectedPost?.id]);

  useEffect(() => {
    if (authStatus?.isStaff && activeTab === 'queue') {
      fetchQueue();
    }
  }, [authStatus?.isStaff, activeTab, fetchQueue]);

  // 3. Fetch Reports
  const fetchReports = useCallback(async () => {
    setIsLoadingReports(true);
    try {
      const data = await staffService.getReports();
      setReports(data);
    } finally {
      setIsLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    if (authStatus?.isStaff && activeTab === 'reports') {
      fetchReports();
    }
  }, [authStatus?.isStaff, activeTab, fetchReports]);

  // 4. Fetch Audit Logs
  const fetchAuditLogs = useCallback(async () => {
    setIsLoadingAudit(true);
    try {
      const data = await staffService.getAuditLogs(100);
      setAuditLogs(data);
    } finally {
      setIsLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    if (authStatus?.isStaff && activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [authStatus?.isStaff, activeTab, fetchAuditLogs]);

  // 5. Fetch internal staff notes when a post is selected
  useEffect(() => {
    if (selectedPost) {
      setNewStatus(selectedPost.status);
      setPublicResolution(selectedPost.resolutionNotes || '');
      setInternalNote('');
      setUpdateReason('');
      setIsLoadingNotes(true);
      staffService
        .getStaffNotes(selectedPost.id)
        .then((notes) => setStaffNotes(notes))
        .finally(() => setIsLoadingNotes(false));
    } else {
      setStaffNotes([]);
    }
  }, [selectedPost?.id]);

  // Handle Save Staff Status & Resolution
  const handleSaveStatus = async () => {
    if (!selectedPost) return;
    setIsUpdatingStatus(true);
    try {
      const res = await staffService.staffUpdatePostStatus({
        postId: selectedPost.id,
        status: newStatus,
        publicResolution: publicResolution,
        internalNote: internalNote,
        reason: updateReason || `Status updated to ${newStatus}`,
      });

      // Synchronize local cache and broadcast update event to Community screens
      communityService.syncPostStatusLocally(
        selectedPost.id,
        newStatus,
        publicResolution,
        res?.resolvedByName || authStatus?.role || 'Mock.AI Team',
        user?.uid
      );

      alert('Status and resolution updated successfully!');
      setInternalNote('');
      setUpdateReason('');
      await fetchQueue();
      // Reload notes
      const notes = await staffService.getStaffNotes(selectedPost.id);
      setStaffNotes(notes);
    } catch (err: any) {
      alert(`Error updating status: ${err?.message || 'Server error'}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Handle Moderation Action (Hide, Restore, Pin, Unpin, Mark Spam, Mark Duplicate)
  const handleModeratePost = async (
    action: 'HIDE' | 'RESTORE' | 'PIN' | 'UNPIN' | 'MARK_DUPLICATE' | 'MARK_SPAM'
  ) => {
    if (!selectedPost) return;
    let duplicateOfId: string | undefined = undefined;
    let reason = '';

    if (action === 'MARK_DUPLICATE') {
      const input = prompt('Enter the original canonical Post ID to link this duplicate to:');
      if (!input || !input.trim()) return;
      duplicateOfId = input.trim();
      reason = `Marked duplicate of ${duplicateOfId}`;
    } else if (action === 'MARK_SPAM') {
      const confirmed = confirm('Mark this post as SPAM? It will be hidden and rejected.');
      if (!confirmed) return;
      reason = 'Spam violation';
    } else {
      const r = prompt(`Reason for ${action}:`, `Moderator action ${action}`);
      if (!r) return;
      reason = r;
    }

    try {
      await staffService.staffModeratePost({
        postId: selectedPost.id,
        action,
        reason,
        duplicateOfId,
      });

      alert(`Action ${action} completed successfully.`);
      await fetchQueue();
    } catch (err: any) {
      alert(`Failed to moderate post: ${err?.message || 'Permission denied'}`);
    }
  };

  // Handle Post Official Team Reply
  const handlePostOfficialReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPost || !officialReplyText.trim()) return;

    setIsPostingReply(true);
    try {
      await staffService.staffPostOfficialComment({
        postId: selectedPost.id,
        content: officialReplyText.trim(),
      });

      alert('Official team reply posted with verified badge!');
      setOfficialReplyText('');
      await fetchQueue();
    } catch (err: any) {
      alert(`Failed to post official reply: ${err?.message || 'Permission denied'}`);
    } finally {
      setIsPostingReply(false);
    }
  };

  // Handle Apply User Restriction
  const handleApplyRestriction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restrictUserId.trim() || !restrictReason.trim()) {
      alert('User ID and Reason are mandatory for the audit log.');
      return;
    }

    setIsRestricting(true);
    try {
      await staffService.staffRestrictUser({
        targetUserId: restrictUserId.trim(),
        status: restrictStatus,
        reason: restrictReason.trim(),
        durationHours: restrictDurationHours > 0 ? restrictDurationHours : undefined,
      });

      alert(`User restriction (${restrictStatus}) applied successfully.`);
      setRestrictionModalOpen(false);
      setRestrictReason('');
    } catch (err: any) {
      alert(`Failed to restrict user: ${err?.message || 'Server error'}`);
    } finally {
      setIsRestricting(false);
    }
  };

  // Handle Report Status Update
  const handleUpdateReportStatus = async (
    reportId: string,
    status: 'REVIEWED' | 'ACTIONED' | 'DISMISSED'
  ) => {
    try {
      await staffService.updateReportStatus(reportId, status);
      await fetchReports();
    } catch {
      alert('Failed to update report status.');
    }
  };

  // Loading Screen
  if (isVerifyingAuth) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-8 h-8 text-brand-primary animate-spin" />
        <p className="text-sm font-semibold text-surface-muted">
          Verifying cryptographic staff authorization...
        </p>
      </div>
    );
  }

  // 403 Forbidden Access Screen (When user is not verified staff)
  if (!authStatus?.isStaff) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-red-500/25 shadow-xl space-y-6 text-center animate-in fade-in duration-300">
        <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black font-display text-surface-text dark:text-darkSurface-text">
            403 Forbidden — Staff Portal
          </h1>
          <p className="text-sm text-surface-muted dark:text-darkSurface-muted max-w-md mx-auto">
            This portal is restricted exclusively to authorized Mock.AI operations team members. Access is enforced by PostgreSQL Row-Level Security.
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs text-surface-muted dark:text-darkSurface-muted border border-surface-border dark:border-darkSurface-border space-y-1">
          <p>
            Logged in as: <strong className="text-surface-text dark:text-darkSurface-text">{user?.email || 'Anonymous'}</strong>
          </p>
          <p>Assigned Role: <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">STUDENT / USER</span></p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('community')}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-glow"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Public Community</span>
        </button>
      </div>
    );
  }

  // Metric Computations
  const pendingCount = posts.filter((p) => p.status === 'OPEN' || p.status === 'INVESTIGATING').length;
  const questionCount = posts.filter((p) => p.type === 'QUESTION_REPORT').length;
  const paperCount = posts.filter((p) => p.type === 'PAPER_REQUEST').length;
  const bugCount = posts.filter((p) => p.type === 'BUG_REPORT').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 space-y-6 animate-in fade-in duration-300">
      {/* ── Top Staff Portal Header ───────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-emerald-500/10 via-brand-primary/5 to-transparent border border-emerald-500/20">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verified Staff Operations</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border text-[10px] font-mono text-surface-muted dark:text-darkSurface-muted">
              Role: {authStatus.role}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-surface-text dark:text-darkSurface-text">
            Mock.AI Staff Portal
          </h1>
          <p className="text-sm text-surface-muted dark:text-darkSurface-muted mt-1">
            Privileged moderation, content quality verification, and official community response hub.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('community')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-elev2 hover:bg-surface-elev3 text-surface-text dark:bg-darkSurface-elev2 dark:hover:bg-darkSurface-elev3 dark:text-darkSurface-text text-xs font-bold border border-surface-border dark:border-darkSurface-border transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Public Community</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeTab === 'queue') fetchQueue();
              if (activeTab === 'reports') fetchReports();
              if (activeTab === 'audit') fetchAuditLogs();
            }}
            className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-glow"
            title="Refresh current view"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Operational Metric Overview ──────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400">Pending Review</p>
          <p className="text-2xl font-black font-display text-surface-text dark:text-darkSurface-text mt-1">
            {pendingCount}
          </p>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
          <p className="text-xs font-bold text-red-600 dark:text-red-400">Question Reports</p>
          <p className="text-2xl font-black font-display text-surface-text dark:text-darkSurface-text mt-1">
            {questionCount}
          </p>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
          <p className="text-xs font-bold text-blue-600 dark:text-blue-400">Paper Requests</p>
          <p className="text-2xl font-black font-display text-surface-text dark:text-darkSurface-text mt-1">
            {paperCount}
          </p>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
          <p className="text-xs font-bold text-purple-600 dark:text-purple-400">Bug Reports</p>
          <p className="text-2xl font-black font-display text-surface-text dark:text-darkSurface-text mt-1">
            {bugCount}
          </p>
        </div>
      </div>

      {/* ── Operations Navigation Tabs ──────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-surface-border dark:border-darkSurface-border pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'queue'
              ? 'bg-brand-primary text-white shadow-glow'
              : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Moderation Queue ({posts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'reports'
              ? 'bg-brand-primary text-white shadow-glow'
              : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
          }`}
        >
          <Flag className="w-4 h-4" />
          <span>User Reports</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('restrictions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'restrictions'
              ? 'bg-brand-primary text-white shadow-glow'
              : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
          }`}
        >
          <UserX className="w-4 h-4" />
          <span>User Restrictions</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'audit'
              ? 'bg-brand-primary text-white shadow-glow'
              : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Immutable Audit Log</span>
        </button>
      </div>

      {/* ── Tab 1: Moderation Queue ───────────────────────────────────── */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-surface-muted dark:text-darkSurface-muted" />
              <input
                type="text"
                placeholder="Filter by keyword, title, paper ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-surface-text dark:text-darkSurface-text focus:outline-none placeholder-surface-muted dark:placeholder-darkSurface-muted"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              >
                <option value="ALL">All Categories</option>
                <option value="QUESTION_REPORT">Question Reports</option>
                <option value="PAPER_REQUEST">Paper Requests</option>
                <option value="BUG_REPORT">Bug Reports</option>
                <option value="FEATURE_REQUEST">Feature Requests</option>
                <option value="DISCUSSION">Discussions</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">🟡 Open</option>
                <option value="INVESTIGATING">🔵 Investigating</option>
                <option value="IN_PROGRESS">🟣 In Progress</option>
                <option value="RESOLVED">🟢 Resolved</option>
                <option value="DUPLICATE">⚪ Duplicate</option>
                <option value="REJECTED">🔴 Rejected</option>
                <option value="NEEDS_INFORMATION">🟠 Needs Information</option>
              </select>
            </div>
          </div>

          {/* Master-Detail Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Queue Table / List (7 cols) */}
            <div className="lg:col-span-7 space-y-3">
              {isLoadingQueue ? (
                <div className="p-8 text-center text-xs text-surface-muted dark:text-darkSurface-muted">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-primary" />
                  Loading moderation queue...
                </div>
              ) : posts.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border text-xs text-surface-muted dark:text-darkSurface-muted shadow-sm">
                  No queue items matching current filter.
                </div>
              ) : (
                posts.map((post) => (
                  <div
                    key={post.id}
                    onClick={() => setSelectedPost(post)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      selectedPost?.id === post.id
                        ? 'bg-brand-primary/5 dark:bg-brand-primary/10 border-brand-primary shadow-sm'
                        : 'bg-white dark:bg-darkSurface-elev1 border-surface-border dark:border-darkSurface-border hover:border-brand-primary/40 shadow-sm hover:shadow-card'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted dark:text-darkSurface-muted border border-surface-border dark:border-darkSurface-border">
                          {post.type.replace('_', ' ')}
                        </span>
                        {post.isPinned && (
                          <span className="text-[10px] font-bold text-amber-500 flex items-center gap-0.5">
                            <Pin className="w-3 h-3" /> Pinned
                          </span>
                        )}
                        {post.isHidden && (
                          <span className="text-[10px] font-bold text-red-500 flex items-center gap-0.5">
                            <EyeOff className="w-3 h-3" /> Hidden
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted dark:text-darkSurface-muted border border-surface-border dark:border-darkSurface-border">
                        {post.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      {(post.customExamName || post.metadata?.customExamName) && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                          ✨ Custom: {post.customExamName || post.metadata?.customExamName}
                          {(post.customYear || post.metadata?.customYear) ? ` ${post.customYear || post.metadata?.customYear}` : ''}
                        </span>
                      )}
                      {(post.customExamAuthority || post.metadata?.customExamAuthority) && (
                        <span className="px-2 py-0.5 rounded bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted dark:text-darkSurface-muted text-[10px]">
                          🏛️ {post.customExamAuthority || post.metadata?.customExamAuthority}
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-sm text-surface-text dark:text-darkSurface-text line-clamp-1">
                      {post.title}
                    </h3>
                    <p className="text-xs text-surface-muted dark:text-darkSurface-muted line-clamp-2 mt-1">
                      {post.description}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-surface-muted dark:text-darkSurface-muted mt-3 pt-2 border-t border-surface-border dark:border-darkSurface-border">
                      <span>Author: {post.authorName}</span>
                      <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Right: Inspection & Action Drawer (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              {selectedPost ? (
                <div className="p-5 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border space-y-5 sticky top-20 shadow-card">
                  {/* Selected Item Header */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-surface-muted dark:text-darkSurface-muted">
                        ID: {selectedPost.id}
                      </span>
                      <span className="text-xs font-bold text-brand-primary">
                        {selectedPost.type}
                      </span>
                    </div>
                    <h2 className="font-bold text-base text-surface-text dark:text-darkSurface-text">
                      {selectedPost.title}
                    </h2>
                    <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                      Reported by: <span className="font-semibold text-surface-text dark:text-darkSurface-text">{selectedPost.authorName}</span>
                      {selectedPost.authorId && ` (UID: ${selectedPost.authorId.substring(0, 8)}...)`}
                    </p>
                  </div>

                  {/* Context Links if Question report */}
                  {(selectedPost.metadata.paperId || selectedPost.metadata.questionId) && (
                    <div className="p-3 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs space-y-1.5 border border-surface-border dark:border-darkSurface-border">
                      <p className="font-bold text-surface-text dark:text-darkSurface-text flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        <span>Attached Academic Target</span>
                      </p>
                      {selectedPost.metadata.paperId && (
                        <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted">
                          Paper: <span className="font-mono text-brand-primary">{selectedPost.metadata.paperId}</span>
                        </p>
                      )}
                      {selectedPost.metadata.questionNumber && (
                        <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted">
                          Question #: <span className="font-bold text-surface-text dark:text-darkSurface-text">Q{selectedPost.metadata.questionNumber}</span>
                        </p>
                      )}
                      {selectedPost.metadata.supportingSource && (
                        <a
                          href={selectedPost.metadata.supportingSource}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-500 hover:underline pt-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>View Official PDF / Source Link</span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Context Details if Paper Request */}
                  {selectedPost.type === 'PAPER_REQUEST' && (
                    <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1.5">
                      <p className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        <span>Requested Paper Target</span>
                      </p>
                      {(selectedPost.customExamName || selectedPost.metadata?.customExamName) ? (
                        <div className="space-y-0.5 text-[11px]">
                          <p className="font-bold text-surface-text dark:text-darkSurface-text">
                            ✨ Custom Exam: <span className="text-amber-600 dark:text-amber-400 font-extrabold">{selectedPost.customExamName || selectedPost.metadata?.customExamName}</span>
                            {(selectedPost.customYear || selectedPost.metadata?.customYear) ? ` (${selectedPost.customYear || selectedPost.metadata?.customYear})` : ''}
                          </p>
                          {(selectedPost.customExamAuthority || selectedPost.metadata?.customExamAuthority) && (
                            <p className="text-surface-muted dark:text-darkSurface-muted">
                              Authority / State: <strong>{selectedPost.customExamAuthority || selectedPost.metadata?.customExamAuthority}</strong>
                            </p>
                          )}
                          {(selectedPost.customStage || selectedPost.metadata?.customStage) && (
                            <p className="text-surface-muted dark:text-darkSurface-muted">
                              Stage: <strong>{selectedPost.customStage || selectedPost.metadata?.customStage}</strong>
                            </p>
                          )}
                          {(selectedPost.customSession || selectedPost.metadata?.customSession) && (
                            <p className="text-surface-muted dark:text-darkSurface-muted">
                              Session / Shift: <strong>{selectedPost.customSession || selectedPost.metadata?.customSession}</strong>
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-0.5 text-[11px] text-surface-muted dark:text-darkSurface-muted">
                          <p className="font-bold text-surface-text dark:text-darkSurface-text">
                            Exam: {selectedPost.metadata?.examId?.toUpperCase()} · Year: {selectedPost.metadata?.editionYear}
                          </p>
                          <p>
                            {selectedPost.metadata?.tier} {selectedPost.metadata?.shift}
                          </p>
                        </div>
                      )}
                      {selectedPost.metadata?.sourceUrl && (
                        <a
                          href={selectedPost.metadata.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-500 hover:underline pt-0.5"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Official Source Link</span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Full Description */}
                  <div className="p-3 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border text-xs text-surface-text dark:text-darkSurface-text leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {selectedPost.description}
                  </div>

                  {/* Action 1: Status & Public Resolution */}
                  <div className="p-4 rounded-2xl bg-brand-primary/5 dark:bg-brand-primary/10 border border-brand-primary/20 space-y-3">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-brand-primary flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Set Status & Public Resolution</span>
                    </h4>

                    <div className="space-y-2">
                      <div>
                        <label className="block text-[11px] font-bold text-surface-muted dark:text-darkSurface-muted mb-1">
                          Operational Status
                        </label>
                        <select
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value as CommunityPostStatus)}
                          className="w-full px-3 py-1.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                        >
                          <option value="OPEN">🟡 Open</option>
                          <option value="INVESTIGATING">🔵 Investigating</option>
                          <option value="IN_PROGRESS">🟣 In Progress</option>
                          <option value="RESOLVED">🟢 Resolved (Verified)</option>
                          <option value="DUPLICATE">⚪ Duplicate</option>
                          <option value="REJECTED">🔴 Rejected</option>
                          <option value="NEEDS_INFORMATION">🟠 Needs Information</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-surface-muted dark:text-darkSurface-muted mb-1">
                          Public Resolution Note (Visible to Students)
                        </label>
                        <textarea
                          rows={2}
                          placeholder="e.g. Verified against GATE 2025 DA official key. Options A & D accepted."
                          value={publicResolution}
                          onChange={(e) => setPublicResolution(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-xs focus:outline-none focus:ring-2 focus:ring-brand-primary/20 placeholder-surface-muted dark:placeholder-darkSurface-muted"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-surface-muted dark:text-darkSurface-muted mb-1">
                          Private Internal Staff Note (Never Exposed to Students)
                        </label>
                        <input
                          type="text"
                          placeholder="Internal team note (e.g. Ingestion script repaired, rerun pipeline)"
                          value={internalNote}
                          onChange={(e) => setInternalNote(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-xs focus:outline-none focus:ring-2 focus:ring-brand-primary/20 placeholder-surface-muted dark:placeholder-darkSurface-muted"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleSaveStatus}
                        disabled={isUpdatingStatus}
                        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant hover:brightness-110 text-white font-bold text-xs transition-all shadow-glow active:scale-95 disabled:opacity-50"
                      >
                        {isUpdatingStatus ? 'Saving Status...' : 'Apply Status & Resolution'}
                      </button>
                    </div>
                  </div>

                  {/* Action 2: Quick Moderation Buttons */}
                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider">
                      Moderation Actions
                    </label>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {selectedPost.isHidden ? (
                        <button
                          type="button"
                          onClick={() => handleModeratePost('RESTORE')}
                          className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center gap-1.5 transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" /> Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleModeratePost('HIDE')}
                          className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-bold flex items-center justify-center gap-1.5 transition-all"
                        >
                          <EyeOff className="w-3.5 h-3.5" /> Hide Post
                        </button>
                      )}

                      {selectedPost.isPinned ? (
                        <button
                          type="button"
                          onClick={() => handleModeratePost('UNPIN')}
                          className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold flex items-center justify-center gap-1.5 transition-all"
                        >
                          <Pin className="w-3.5 h-3.5" /> Unpin
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleModeratePost('PIN')}
                          className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold flex items-center justify-center gap-1.5 transition-all"
                        >
                          <Pin className="w-3.5 h-3.5" /> Pin to Top
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleModeratePost('MARK_DUPLICATE')}
                        className="p-2 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 hover:bg-surface-elev3 dark:hover:bg-darkSurface-elev3 border border-surface-border dark:border-darkSurface-border text-surface-text dark:text-darkSurface-text font-bold flex items-center justify-center gap-1.5 transition-all"
                      >
                        Duplicate
                      </button>

                      <button
                        type="button"
                        onClick={() => handleModeratePost('MARK_SPAM')}
                        className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-bold flex items-center justify-center gap-1.5 transition-all"
                      >
                        Mark Spam
                      </button>
                    </div>

                    {selectedPost.authorId && (
                      <button
                        type="button"
                        onClick={() => {
                          setRestrictUserId(selectedPost.authorId || '');
                          setRestrictionModalOpen(true);
                        }}
                        className="w-full mt-2 p-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        <span>Restrict Author Community Access</span>
                      </button>
                    )}
                  </div>

                  {/* Action 3: Post Official Verified Reply */}
                  <form onSubmit={handlePostOfficialReply} className="space-y-2 pt-2 border-t border-surface-border dark:border-darkSurface-border">
                    <label className="block text-[11px] font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Post Official Team Reply (Verified Badge)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Compose verified response from Mock.AI Team..."
                        value={officialReplyText}
                        onChange={(e) => setOfficialReplyText(e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-xs focus:outline-none focus:ring-2 focus:ring-brand-primary/20 placeholder-surface-muted dark:placeholder-darkSurface-muted"
                      />
                      <button
                        type="submit"
                        disabled={isPostingReply || !officialReplyText.trim()}
                        className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-all"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </form>

                  {/* Private Internal Staff Notes History */}
                  <div className="space-y-2 pt-2 border-t border-surface-border dark:border-darkSurface-border">
                    <h5 className="font-bold text-[11px] text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider">
                      Internal Staff Notes ({staffNotes.length})
                    </h5>
                    {isLoadingNotes ? (
                      <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted">Loading private notes...</p>
                    ) : staffNotes.length === 0 ? (
                      <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted italic">No internal staff notes on this item.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {staffNotes.map((n) => (
                          <div
                            key={n.id}
                            className="p-2.5 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 text-[11px] space-y-0.5 border border-surface-border dark:border-darkSurface-border"
                          >
                            <div className="flex items-center justify-between text-surface-muted dark:text-darkSurface-muted font-semibold">
                              <span>{n.authorName}</span>
                              <span className="text-[9px]">{new Date(n.createdAt).toLocaleTimeString()}</span>
                            </div>
                            <p className="text-surface-text dark:text-darkSurface-text">{n.note}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border text-center text-xs text-surface-muted dark:text-darkSurface-muted space-y-2 shadow-sm">
                  <FileText className="w-8 h-8 mx-auto text-surface-muted/50 dark:text-darkSurface-muted/50" />
                  <p className="font-bold text-surface-text dark:text-darkSurface-text">No Post Selected</p>
                  <p>Click on any queue item on the left to inspect, verify, and resolve.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 2: User-Flagged Reports ──────────────────────────────── */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border flex items-center justify-between shadow-sm">
            <h3 className="font-bold text-sm text-surface-text dark:text-darkSurface-text">
              Community Flagged Reports ({reports.length})
            </h3>
            <button
              type="button"
              onClick={fetchReports}
              className="text-xs text-brand-primary font-bold hover:underline flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {isLoadingReports ? (
            <div className="p-8 text-center text-xs text-surface-muted dark:text-darkSurface-muted">Loading reports...</div>
          ) : reports.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border text-xs text-surface-muted dark:text-darkSurface-muted shadow-sm">
              Zero pending reports. The community queue is clean!
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="p-4 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border space-y-2 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 font-bold text-[10px] uppercase">
                        {report.reason}
                      </span>
                      <span className="text-xs font-mono text-surface-muted dark:text-darkSurface-muted">
                        Target: {report.targetType} ({report.targetId})
                      </span>
                    </div>
                    <span className="text-xs font-bold text-surface-muted dark:text-darkSurface-muted">{report.status}</span>
                  </div>

                  {report.details && (
                    <p className="text-xs text-surface-text dark:text-darkSurface-text">
                      Reporter note: "{report.details}"
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t border-surface-border dark:border-darkSurface-border text-xs">
                    <button
                      type="button"
                      onClick={() => handleUpdateReportStatus(report.id, 'ACTIONED')}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all"
                    >
                      Actioned
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateReportStatus(report.id, 'DISMISSED')}
                      className="px-3 py-1.5 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 hover:bg-surface-elev3 dark:hover:bg-darkSurface-elev3 border border-surface-border dark:border-darkSurface-border text-surface-text dark:text-darkSurface-text font-bold transition-all"
                    >
                      Dismiss (Allowed Criticism)
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 3: User Community Restrictions ────────────────────────── */}
      {activeTab === 'restrictions' && (
        <div className="space-y-4">
          <div className="p-6 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border space-y-4 max-w-xl shadow-card">
            <h3 className="font-bold text-base text-surface-text dark:text-darkSurface-text flex items-center gap-2">
              <UserX className="w-5 h-5 text-red-500" />
              <span>Apply User Community Restriction</span>
            </h3>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
              Restrictions prevent posting or commenting while preserving the user's exam-taking account access. All actions are immutably logged.
            </p>

            <form onSubmit={handleApplyRestriction} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1">
                  Target User UUID
                </label>
                <input
                  type="text"
                  placeholder="e.g. 6b8a0849-2827-4a8a-9967-..."
                  value={restrictUserId}
                  onChange={(e) => setRestrictUserId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-primary/20 placeholder-surface-muted dark:placeholder-darkSurface-muted"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1">
                  Restriction Severity
                </label>
                <select
                  value={restrictStatus}
                  onChange={(e) => setRestrictStatus(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                >
                  <option value="POSTING_RESTRICTED">Posting Restricted (Read & vote only)</option>
                  <option value="SUSPENDED">Suspended (Temporary complete lockout from community)</option>
                  <option value="BANNED">Banned (Permanent revocation of community access)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1">
                  Duration (Hours) — 0 for Permanent
                </label>
                <input
                  type="number"
                  min="0"
                  value={restrictDurationHours}
                  onChange={(e) => setRestrictDurationHours(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-xs focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1">
                  Mandatory Audit Reason (Explain specific guideline violated)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Repeated scam links in question comments after prior warning"
                  value={restrictReason}
                  onChange={(e) => setRestrictReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-xs focus:outline-none focus:ring-2 focus:ring-brand-primary/20 placeholder-surface-muted dark:placeholder-darkSurface-muted"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isRestricting}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-all shadow-glow active:scale-95 disabled:opacity-50"
              >
                {isRestricting ? 'Applying Restriction...' : 'Apply Restriction & Audit Log'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Tab 4: Immutable Audit Trail ──────────────────────────────── */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border flex items-center justify-between shadow-sm">
            <div>
              <h3 className="font-bold text-sm text-surface-text dark:text-darkSurface-text">
                Cryptographic Community Audit Log
              </h3>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                Append-only ledger of all staff status changes, content removals, and restrictions.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchAuditLogs}
              className="text-xs text-brand-primary font-bold hover:underline flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {isLoadingAudit ? (
            <div className="p-8 text-center text-xs text-surface-muted dark:text-darkSurface-muted">Loading audit ledger...</div>
          ) : auditLogs.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border text-xs text-surface-muted dark:text-darkSurface-muted shadow-sm">
              No audit logs recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-surface-border dark:border-darkSurface-border shadow-sm">
              <table className="w-full text-left text-xs bg-white dark:bg-darkSurface-elev1">
                <thead className="bg-surface-elev2 dark:bg-darkSurface-elev2 border-b border-surface-border dark:border-darkSurface-border text-surface-muted dark:text-darkSurface-muted font-bold">
                  <tr>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Staff Operator</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Target</th>
                    <th className="p-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border dark:divide-darkSurface-border">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-elev2/50 dark:hover:bg-darkSurface-elev2/50 transition-colors">
                      <td className="p-3 whitespace-nowrap text-surface-muted dark:text-darkSurface-muted">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="p-3 font-semibold text-surface-text dark:text-darkSurface-text">
                        {log.staffUserName}
                      </td>
                      <td className="p-3">
                        <span className="font-mono px-2 py-0.5 rounded bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border text-[10px] font-bold text-surface-text dark:text-darkSurface-text">
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[10px] text-surface-muted dark:text-darkSurface-muted">
                        {log.targetType}: {log.targetId.substring(0, 16)}...
                      </td>
                      <td className="p-3 text-surface-text dark:text-darkSurface-text">
                        {log.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* User Restriction Modal (Triggered from Post Drawer) */}
      {restrictionModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRestrictionModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <h3 className="font-bold text-base text-surface-text dark:text-darkSurface-text flex items-center gap-2">
              <UserX className="w-5 h-5 text-red-500" />
              <span>Restrict User Community Access</span>
            </h3>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
              Target User: <strong className="font-mono text-surface-text dark:text-darkSurface-text">{restrictUserId}</strong>
            </p>

            <form onSubmit={handleApplyRestriction} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1">
                  Restriction Action
                </label>
                <select
                  value={restrictStatus}
                  onChange={(e) => setRestrictStatus(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                >
                  <option value="POSTING_RESTRICTED">Posting Restricted (Read & vote only)</option>
                  <option value="SUSPENDED">Suspended (Complete temporary community ban)</option>
                  <option value="BANNED">Banned (Permanent community ban)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1">
                  Duration in Hours (0 for Permanent)
                </label>
                <input
                  type="number"
                  min="0"
                  value={restrictDurationHours}
                  onChange={(e) => setRestrictDurationHours(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-xs focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1">
                  Mandatory Audit Reason
                </label>
                <textarea
                  rows={2}
                  placeholder="Specify violation..."
                  value={restrictReason}
                  onChange={(e) => setRestrictReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-xs focus:outline-none focus:ring-2 focus:ring-brand-primary/20 placeholder-surface-muted dark:placeholder-darkSurface-muted"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRestrictionModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 hover:bg-surface-elev3 dark:hover:bg-darkSurface-elev3 border border-surface-border dark:border-darkSurface-border text-surface-text dark:text-darkSurface-text text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRestricting}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-glow transition-all active:scale-95 disabled:opacity-50"
                >
                  {isRestricting ? 'Applying...' : 'Confirm Restriction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
