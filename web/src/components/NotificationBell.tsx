import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  ExternalLink,
  Inbox,
  CheckCircle2,
  Clock,
  Activity,
  AlertCircle,
  XCircle,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { CommunityNotification, UserProfile } from '../types';
import { notificationService } from '../services/notificationService';
import { NotificationsModal, formatRelativeTime } from './NotificationsModal';

interface NotificationBellProps {
  user: UserProfile | null;
  onNavigateToPost?: (postId: string) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ user, onNavigateToPost }) => {
  const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = async () => {
    if (!user?.uid) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    setIsLoading(true);
    try {
      const [list, count] = await Promise.all([
        notificationService.getNotifications(user.uid, 'all'),
        notificationService.getUnreadCount(user.uid),
      ]);
      setNotifications(list);
      setUnreadCount(count);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [user?.uid]);

  // Real-time Supabase subscription + fallback polling
  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribe = notificationService.subscribe(user.uid, () => {
      loadNotifications();
    });

    const handleNewNotif = (e: any) => {
      const notif = e.detail as CommunityNotification;
      if (notif && (!user?.uid || notif.userId === user.uid || notif.recipientUserId === user.uid)) {
        setNotifications((prev) => [notif, ...prev.filter((n) => n.id !== notif.id)]);
        setUnreadCount((prev) => (notif.isRead ? prev : prev + 1));
      }
    };

    const handleUpdated = () => {
      loadNotifications();
    };

    window.addEventListener('mockai_notification_received', handleNewNotif);
    window.addEventListener('mockai_notifications_updated', handleUpdated);

    return () => {
      unsubscribe();
      window.removeEventListener('mockai_notification_received', handleNewNotif);
      window.removeEventListener('mockai_notifications_updated', handleUpdated);
    };
  }, [user?.uid]);

  // Click outside to close popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleNotificationClick = async (notif: CommunityNotification) => {
    setIsOpen(false);
    if (onNavigateToPost && notif.postId) {
      onNavigateToPost(notif.postId);
    }
    if (!notif.isRead && user?.uid) {
      await notificationService.markAsRead(notif.id, user.uid);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  };

  const handleMarkAllRead = async () => {
    if (!user?.uid) return;
    await notificationService.markAllAsRead(user.uid);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const getStatusIcon = (notif: CommunityNotification) => {
    const status = notif.newStatus || notif.metadata?.newStatus;
    if (notif.type === 'POST_RESOLVED' || status === 'RESOLVED') {
      return (
        <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" />
        </div>
      );
    }
    if (status === 'INVESTIGATING') {
      return (
        <div className="w-7 h-7 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
          <Clock className="w-3.5 h-3.5" />
        </div>
      );
    }
    if (status === 'IN_PROGRESS') {
      return (
        <div className="w-7 h-7 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
          <Activity className="w-3.5 h-3.5" />
        </div>
      );
    }
    if (status === 'CLOSED') {
      return (
        <div className="w-7 h-7 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
          <AlertCircle className="w-3.5 h-3.5" />
        </div>
      );
    }
    if (status === 'REJECTED') {
      return (
        <div className="w-7 h-7 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
          <XCircle className="w-3.5 h-3.5" />
        </div>
      );
    }
    if (notif.type === 'POST_COMMENTED' || notif.type === 'POST_REPLY') {
      return (
        <div className="w-7 h-7 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
          <MessageSquare className="w-3.5 h-3.5" />
        </div>
      );
    }
    return (
      <div className="w-7 h-7 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
        <Sparkles className="w-3.5 h-3.5" />
      </div>
    );
  };

  if (!user) return null;

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {/* Bell Action Button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={`Notifications (${unreadCount} unread)`}
          className="relative p-2 rounded-xl text-surface-muted hover:text-surface-text dark:text-darkSurface-muted dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors select-none"
        >
          <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-black leading-none animate-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Popover Dropdown */}
        {isOpen && (
          <div className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-white dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-3.5 border-b border-surface-border dark:border-darkSurface-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-surface-text dark:text-darkSurface-text">
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-bold">
                    {unreadCount} new
                  </span>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[11px] font-semibold text-brand-primary hover:underline flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-surface-border/50 dark:divide-darkSurface-border/50">
              {isLoading && notifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-surface-muted">
                  Loading notifications...
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <Inbox className="w-8 h-8 text-surface-muted/50 mx-auto" />
                  <p className="text-xs font-semibold text-surface-muted">No notifications yet</p>
                  <p className="text-[11px] text-surface-muted/80">
                    Updates on your reports and requests will appear here.
                  </p>
                </div>
              ) : (
                notifications.slice(0, 10).map((notif) => {
                  const postTitle = notif.metadata?.postTitle;
                  return (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`p-3.5 transition-colors cursor-pointer flex gap-3 items-start group ${
                        notif.isRead
                          ? 'hover:bg-surface-elev1/50 dark:hover:bg-darkSurface-elev1/50 opacity-80'
                          : 'bg-brand-primary/5 hover:bg-brand-primary/10'
                      }`}
                    >
                      {/* Icon indicator */}
                      {getStatusIcon(notif)}

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-surface-text dark:text-darkSurface-text truncate">
                            {notif.title}
                          </span>
                          <span
                            className="text-[10px] text-surface-muted shrink-0 font-mono"
                            title={new Date(notif.createdAt).toLocaleString()}
                          >
                            {formatRelativeTime(notif.createdAt)}
                          </span>
                        </div>

                        {/* Post title quote if available */}
                        {postTitle && (
                          <p className="text-[11px] font-semibold text-surface-text dark:text-darkSurface-text line-clamp-1">
                            &ldquo;{postTitle}&rdquo;
                          </p>
                        )}

                        <p className="text-xs text-surface-muted dark:text-darkSurface-muted leading-relaxed line-clamp-2">
                          {notif.body || notif.message}
                        </p>

                        <div className="pt-0.5 flex items-center gap-1 text-[10px] font-semibold text-brand-primary group-hover:underline">
                          <span>View Community Post</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </div>
                      </div>

                      {/* Unread dot */}
                      {!notif.isRead && (
                        <div className="w-2 h-2 mt-1.5 rounded-full bg-brand-primary shrink-0" />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer: View all notifications */}
            <div className="p-2.5 border-t border-surface-border dark:border-darkSurface-border bg-surface-elev1/40 dark:bg-darkSurface-elev2/40 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setIsModalOpen(true);
                }}
                className="w-full py-1 text-xs font-bold text-brand-primary hover:text-brand-variant transition-colors"
              >
                View all notifications
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notifications Modal Center */}
      <NotificationsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        user={user}
        onNavigateToPost={onNavigateToPost}
      />
    </>
  );
};
