/**
 * MOCK.AI — Production User Notification Service
 *
 * Provides database-backed notification management for:
 * 1. Community post status changes (OPEN -> INVESTIGATING -> RESOLVED, etc.)
 * 2. Official Mock.AI Team responses and resolutions
 * 3. System announcements
 *
 * Guarantees:
 * - Single source of truth backed by Supabase community_notifications table.
 * - Strict RLS: Users can only read and update their own notifications.
 * - Real-time updates via Supabase Realtime channel with resilient polling fallback.
 * - Efficient indexed queries for unread badges without expensive full-table scans.
 * - Offline/local storage cache fallback.
 */

import { supabaseService } from './supabase';
import { CommunityNotification, NotificationType, CommunityPostStatus } from '../types';

const NOTIFICATIONS_CACHE_PREFIX = 'mockai_notifications_';

class NotificationService {
  /**
   * Helper to load cached notifications from localStorage.
   */
  private getLocalNotifications(userId: string): CommunityNotification[] {
    if (typeof localStorage === 'undefined' || !userId) return [];
    try {
      const raw = localStorage.getItem(`${NOTIFICATIONS_CACHE_PREFIX}${userId}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Helper to persist notifications in localStorage.
   */
  private saveLocalNotifications(userId: string, notifs: CommunityNotification[]): void {
    if (typeof localStorage === 'undefined' || !userId) return;
    try {
      localStorage.setItem(`${NOTIFICATIONS_CACHE_PREFIX}${userId}`, JSON.stringify(notifs.slice(0, 100)));
    } catch {
      // ignore
    }
  }

  /**
   * Fetch user notifications with optional filtering (all, unread, community, system).
   */
  async getNotifications(
    userId?: string | null,
    filter: 'all' | 'unread' | 'community' | 'system' = 'all'
  ): Promise<CommunityNotification[]> {
    if (!userId) return [];

    const client = supabaseService.getClient();
    let remoteNotifs: CommunityNotification[] = [];

    if (client) {
      try {
        let query = client
          .from('community_notifications')
          .select('*')
          .or(`recipient_user_id.eq.${userId},user_id.eq.${userId}`)
          .order('created_at', { ascending: false })
          .limit(50);

        if (filter === 'unread') {
          query = query.eq('is_read', false);
        } else if (filter === 'community') {
          query = query.eq('entity_type', 'community_post');
        } else if (filter === 'system') {
          query = query.eq('type', 'SYSTEM_ANNOUNCEMENT');
        }

        const { data, error } = await query;

        if (!error && Array.isArray(data)) {
          remoteNotifs = data.map((d: any) => ({
            id: d.id,
            recipientUserId: d.recipient_user_id || d.user_id,
            userId: d.recipient_user_id || d.user_id,
            postId: d.entity_id || d.post_id || d.metadata?.post_id || '',
            type: d.type as NotificationType,
            title: d.title,
            body: d.body || d.message || '',
            message: d.body || d.message || '',
            entityType: d.entity_type || 'community_post',
            entityId: d.entity_id || d.post_id,
            metadata: d.metadata || {},
            oldStatus: (d.old_status || d.metadata?.old_status) as CommunityPostStatus | undefined,
            newStatus: (d.new_status || d.metadata?.new_status) as CommunityPostStatus | undefined,
            isRead: Boolean(d.is_read),
            readAt: d.read_at || null,
            createdAt: d.created_at,
          }));

          // Synchronize local cache with latest authoritative remote data
          const currentLocals = this.getLocalNotifications(userId);
          const remoteIds = new Set(remoteNotifs.map((n) => n.id));
          const merged = [...remoteNotifs];
          for (const ln of currentLocals) {
            if (!remoteIds.has(ln.id)) {
              if (
                filter === 'all' ||
                (filter === 'unread' && !ln.isRead) ||
                (filter === 'community' && ln.entityType === 'community_post') ||
                (filter === 'system' && ln.type === 'SYSTEM_ANNOUNCEMENT')
              ) {
                merged.push(ln);
              }
            }
          }
          this.saveLocalNotifications(userId, merged);
          return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
      } catch (err) {
        console.warn('[NotificationService] Supabase getNotifications error, using cache:', err);
      }
    }

    // Fallback to local storage
    const locals = this.getLocalNotifications(userId);
    let filtered = locals;
    if (filter === 'unread') {
      filtered = locals.filter((n) => !n.isRead);
    } else if (filter === 'community') {
      filtered = locals.filter((n) => n.entityType === 'community_post');
    } else if (filter === 'system') {
      filtered = locals.filter((n) => n.type === 'SYSTEM_ANNOUNCEMENT');
    }
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Fast unread count query for the notification bell badge.
   */
  async getUnreadCount(userId?: string | null): Promise<number> {
    if (!userId) return 0;

    const client = supabaseService.getClient();
    if (client) {
      try {
        const { count, error } = await client
          .from('community_notifications')
          .select('id', { count: 'exact', head: true })
          .or(`recipient_user_id.eq.${userId},user_id.eq.${userId}`)
          .eq('is_read', false);

        if (!error && typeof count === 'number') {
          return count;
        }
      } catch {
        // ignore
      }
    }

    const locals = this.getLocalNotifications(userId);
    return locals.filter((n) => !n.isRead).length;
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(notificationId: string, userId?: string | null): Promise<boolean> {
    if (!notificationId) return false;

    const client = supabaseService.getClient();
    if (client) {
      try {
        await client
          .from('community_notifications')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('id', notificationId);
      } catch (err) {
        console.warn('[NotificationService] markAsRead remote error:', err);
      }
    }

    if (userId) {
      const list = this.getLocalNotifications(userId);
      const target = list.find((n) => n.id === notificationId);
      if (target) {
        target.isRead = true;
        target.readAt = new Date().toISOString();
        this.saveLocalNotifications(userId, list);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mockai_notifications_updated'));
    }
    return true;
  }

  /**
   * Mark all unread notifications as read for a user.
   */
  async markAllAsRead(userId?: string | null): Promise<boolean> {
    if (!userId) return false;

    const client = supabaseService.getClient();
    if (client) {
      try {
        await client
          .from('community_notifications')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .or(`recipient_user_id.eq.${userId},user_id.eq.${userId}`)
          .eq('is_read', false);
      } catch (err) {
        console.warn('[NotificationService] markAllAsRead remote error:', err);
      }
    }

    const list = this.getLocalNotifications(userId);
    const updated = list.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }));
    this.saveLocalNotifications(userId, updated);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mockai_notifications_updated'));
    }
    return true;
  }

  /**
   * Add a notification locally and broadcast event (used for offline actions and testing).
   */
  addNotification(notif: CommunityNotification): void {
    if (!notif?.recipientUserId) return;
    const userId = notif.recipientUserId;
    const list = this.getLocalNotifications(userId);

    // Idempotency: prevent duplicates for identical post and status within 1 minute
    const isDup = list.some(
      (n) =>
        n.postId === notif.postId &&
        n.newStatus === notif.newStatus &&
        n.type === notif.type &&
        Date.now() - new Date(n.createdAt).getTime() < 60000
    );

    if (!isDup) {
      list.unshift(notif);
      this.saveLocalNotifications(userId, list);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mockai_notification_received', { detail: notif }));
        window.dispatchEvent(new CustomEvent('mockai_notifications_updated'));
      }
    }
  }

  /**
   * Realtime subscription to notifications channel with polling fallback.
   */
  subscribe(userId: string, onUpdate: () => void): () => void {
    if (!userId) return () => {};

    const client = supabaseService.getClient();
    let channel: any = null;

    if (client) {
      try {
        channel = client
          .channel(`user-notifications-${userId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'community_notifications',
              filter: `recipient_user_id=eq.${userId}`,
            },
            () => {
              onUpdate();
            }
          )
          .subscribe();
      } catch {
        // ignore
      }
    }

    // Polling fallback every 30 seconds
    const interval = setInterval(() => {
      onUpdate();
    }, 30000);

    return () => {
      if (channel && client) {
        try {
          client.removeChannel(channel);
        } catch {
          // ignore
        }
      }
      clearInterval(interval);
    };
  }
}

export const notificationService = new NotificationService();
