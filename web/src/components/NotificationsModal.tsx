/**
 * MOCK.AI — Notifications Center Modal
 *
 * Dedicated full modal allowing users to:
 * - View all historical notifications across Community, Reports, and System announcements.
 * - Filter by All, Unread, Community, and System.
 * - Search by keyword, post title, or status.
 * - Mark individual or all notifications as read.
 * - Deep link directly to the relevant Community post.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Bell,
  Check,
  CheckCheck,
  Search,
  ExternalLink,
  Inbox,
  CheckCircle2,
  Clock,
  Activity,
  AlertCircle,
  XCircle,
  MessageSquare,
  Sparkles,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { CommunityNotification, UserProfile, CommunityPostStatus } from '../types';
import { notificationService } from '../services/notificationService';

export interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  onNavigateToPost?: (postId: string) => void;
}

export function formatRelativeTime(dateInput: string | number | Date): string {
  if (!dateInput) return '';
  const date =
    typeof dateInput === 'string' || typeof dateInput === 'number'
      ? new Date(dateInput)
      : dateInput;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) return 'just now';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) return '1 minute ago';
  if (diffMin < 60) return `${diffMin} minutes ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

  return date.toLocaleDateString();
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  user,
  onNavigateToPost,
}) => {
  const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'community' | 'system'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loadNotifications = async () => {
    if (!user?.uid) {
      setNotifications([]);
      return;
    }
    setIsLoading(true);
    try {
      const data = await notificationService.getNotifications(user.uid, 'all');
      setNotifications(data);
    } catch {
      // fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen, user?.uid]);

  // Real-time listener
  useEffect(() => {
    if (!isOpen) return;

    const handleUpdate = () => {
      loadNotifications();
    };

    window.addEventListener('mockai_notification_received', handleUpdate);
    window.addEventListener('mockai_notifications_updated', handleUpdate);

    return () => {
      window.removeEventListener('mockai_notification_received', handleUpdate);
      window.removeEventListener('mockai_notifications_updated', handleUpdate);
    };
  }, [isOpen, user?.uid]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scroll when modal is active
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  const handleMarkAllRead = async () => {
    if (!user?.uid) return;
    await notificationService.markAllAsRead(user.uid);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleNotificationClick = async (notif: CommunityNotification) => {
    onClose();
    if (onNavigateToPost && notif.postId) {
      onNavigateToPost(notif.postId);
    }
    if (!notif.isRead && user?.uid) {
      await notificationService.markAsRead(notif.id, user.uid);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
      );
    }
  };

  const handleToggleRead = async (e: React.MouseEvent, notif: CommunityNotification) => {
    e.stopPropagation();
    if (!user?.uid) return;
    if (!notif.isRead) {
      await notificationService.markAsRead(notif.id, user.uid);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
      );
    }
  };

  const getStatusIcon = (notif: CommunityNotification) => {
    const status = notif.newStatus || notif.metadata?.newStatus;
    if (notif.type === 'POST_RESOLVED' || status === 'RESOLVED') {
      return (
        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4 h-4" />
        </div>
      );
    }
    if (status === 'INVESTIGATING') {
      return (
        <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
          <Clock className="w-4 h-4" />
        </div>
      );
    }
    if (status === 'IN_PROGRESS') {
      return (
        <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
          <Activity className="w-4 h-4" />
        </div>
      );
    }
    if (status === 'CLOSED') {
      return (
        <div className="w-8 h-8 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
          <AlertCircle className="w-4 h-4" />
        </div>
      );
    }
    if (status === 'REJECTED') {
      return (
        <div className="w-8 h-8 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
          <XCircle className="w-4 h-4" />
        </div>
      );
    }
    if (notif.type === 'POST_COMMENTED' || notif.type === 'POST_REPLY') {
      return (
        <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
          <MessageSquare className="w-4 h-4" />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4" />
      </div>
    );
  };

  const getStatusBadge = (status?: CommunityPostStatus | string) => {
    switch (status) {
      case 'RESOLVED':
        return (
          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
            🟢 Resolved
          </span>
        );
      case 'INVESTIGATING':
        return (
          <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold">
            🔵 Investigating
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-bold">
            🟣 In Progress
          </span>
        );
      case 'OPEN':
        return (
          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
            🟡 Open
          </span>
        );
      case 'CLOSED':
        return (
          <span className="px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-400 text-[10px] font-bold">
            ⚪ Closed
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-bold">
            🔴 Rejected
          </span>
        );
      default:
        return null;
    }
  };

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter((notif) => {
      // Tab filter
      if (activeTab === 'unread' && notif.isRead) return false;
      if (activeTab === 'community' && notif.entityType && notif.entityType !== 'community_post') {
        return false;
      }
      if (activeTab === 'system' && notif.type !== 'SYSTEM_ANNOUNCEMENT') {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const postTitle = (notif.metadata?.postTitle || '').toLowerCase();
        const title = (notif.title || '').toLowerCase();
        const body = (notif.body || notif.message || '').toLowerCase();
        const note = (notif.metadata?.resolutionNotes || '').toLowerCase();
        return (
          title.includes(q) ||
          body.includes(q) ||
          postTitle.includes(q) ||
          note.includes(q)
        );
      }

      return true;
    });
  }, [notifications, activeTab, searchQuery]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const communityCount = notifications.filter(
    (n) => !n.entityType || n.entityType === 'community_post'
  ).length;
  const systemCount = notifications.filter((n) => n.type === 'SYSTEM_ANNOUNCEMENT').length;

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-surface-border dark:border-darkSurface-border flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold font-display text-surface-text dark:text-darkSurface-text truncate">
                  Notification Center
                </h2>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-bold shrink-0">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted truncate">
                Official Mock.AI updates on your reports, requests, and announcements.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-surface-border dark:border-darkSurface-border text-xs font-semibold text-surface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5 text-brand-primary" />
                <span>Mark all as read</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-surface-muted hover:text-surface-text dark:text-darkSurface-muted dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Controls & Search */}
        <div className="p-3 sm:px-6 border-b border-surface-border dark:border-darkSurface-border bg-surface-elev1/40 dark:bg-darkSurface-elev2/40 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'all'
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text'
              }`}
            >
              All ({notifications.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('unread')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'unread'
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text'
              }`}
            >
              Unread ({unreadCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('community')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'community'
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text'
              }`}
            >
              Community ({communityCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('system')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'system'
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text'
              }`}
            >
              System ({systemCount})
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative min-w-[180px] sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-surface-muted dark:text-darkSurface-muted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search updates..."
              className="w-full pl-8 pr-3 py-1 text-xs rounded-xl bg-white dark:bg-darkSurface border border-surface-border dark:border-darkSurface-border text-surface-text dark:text-darkSurface-text placeholder:text-surface-muted/60 focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
        </div>

        {/* Notifications Scroll List */}
        <div className="flex-1 overflow-y-auto divide-y divide-surface-border/50 dark:divide-darkSurface-border/50 p-2 sm:p-4">
          {isLoading && notifications.length === 0 ? (
            <div className="p-12 text-center text-xs text-surface-muted">
              Loading your notifications...
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Inbox className="w-10 h-10 text-surface-muted/40 mx-auto" />
              <p className="text-sm font-semibold text-surface-muted">No notifications found</p>
              <p className="text-xs text-surface-muted/70 max-w-sm mx-auto">
                {searchQuery
                  ? 'No notifications match your search query.'
                  : activeTab === 'unread'
                  ? 'All caught up! You have no unread notifications.'
                  : 'When Mock.AI Team updates your reported questions or paper requests, they will appear here.'}
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 rounded-xl border border-surface-border dark:border-darkSurface-border text-xs font-semibold text-surface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : (
            filteredNotifications.map((notif) => {
              const oldSt = notif.oldStatus || notif.metadata?.oldStatus;
              const newSt = notif.newStatus || notif.metadata?.newStatus;
              const postTitle = notif.metadata?.postTitle;

              return (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3.5 sm:p-4 rounded-2xl transition-all cursor-pointer flex gap-3.5 items-start group ${
                    notif.isRead
                      ? 'hover:bg-surface-elev2/60 dark:hover:bg-darkSurface-elev2/60 opacity-85'
                      : 'bg-brand-primary/5 hover:bg-brand-primary/10 border border-brand-primary/20 shadow-sm'
                  }`}
                >
                  {/* Status Indicator Icon */}
                  {getStatusIcon(notif)}

                  {/* Body Content */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-surface-text dark:text-darkSurface-text">
                          {notif.title}
                        </span>
                        {!notif.isRead && (
                          <span className="w-2 h-2 rounded-full bg-brand-primary shrink-0" />
                        )}
                      </div>

                      <span
                        className="text-[10px] text-surface-muted dark:text-darkSurface-muted font-mono shrink-0"
                        title={new Date(notif.createdAt).toLocaleString()}
                      >
                        {formatRelativeTime(notif.createdAt)}
                      </span>
                    </div>

                    {/* Post Title if available */}
                    {postTitle && (
                      <p className="text-xs font-semibold text-surface-text dark:text-darkSurface-text line-clamp-1">
                        &ldquo;{postTitle}&rdquo;
                      </p>
                    )}

                    {/* Status Transition Badges */}
                    {(oldSt || newSt) && (
                      <div className="flex items-center gap-1.5 pt-0.5">
                        {oldSt && getStatusBadge(oldSt)}
                        {oldSt && newSt && (
                          <ArrowRight className="w-3 h-3 text-surface-muted dark:text-darkSurface-muted" />
                        )}
                        {newSt && getStatusBadge(newSt)}
                      </div>
                    )}

                    {/* Notification message body */}
                    <p className="text-xs text-surface-muted dark:text-darkSurface-muted leading-relaxed">
                      {notif.body || notif.message}
                    </p>

                    {/* Resolution Note if available */}
                    {notif.metadata?.resolutionNotes && (
                      <div className="mt-1 p-2 rounded-xl bg-surface-elev2/70 dark:bg-darkSurface-elev2/70 border border-surface-border dark:border-darkSurface-border text-[11px] text-surface-text dark:text-darkSurface-text">
                        <span className="font-semibold text-brand-primary">Team Note: </span>
                        <span>{notif.metadata.resolutionNotes}</span>
                      </div>
                    )}

                    {/* Action Links */}
                    {notif.postId && (
                      <div className="pt-1 flex items-center gap-1 text-[11px] font-bold text-brand-primary group-hover:underline">
                        <span>View Community Post</span>
                        <ExternalLink className="w-3 h-3" />
                      </div>
                    )}
                  </div>

                  {/* Mark as read button if unread */}
                  {!notif.isRead && (
                    <button
                      type="button"
                      title="Mark as read"
                      onClick={(e) => handleToggleRead(e, notif)}
                      className="p-1.5 rounded-lg text-surface-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Mobile Mark All Read Footer */}
        {unreadCount > 0 && (
          <div className="sm:hidden p-3 border-t border-surface-border dark:border-darkSurface-border bg-surface-elev1/40 dark:bg-darkSurface-elev2/40">
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="w-full py-2 rounded-xl bg-brand-primary/10 text-brand-primary text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Mark all as read</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
