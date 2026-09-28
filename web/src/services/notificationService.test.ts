/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { notificationService } from './notificationService';
import { supabaseService } from './supabase';
import { CommunityNotification } from '../types';

describe('NotificationService Unit Tests', () => {
  const testUserId = 'test_user_scholar_789';

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(supabaseService, 'getClient').mockReturnValue(null);
  });

  it('starts with 0 unread notifications for a clean user', async () => {
    const count = await notificationService.getUnreadCount(testUserId);
    const notifications = await notificationService.getNotifications(testUserId);
    expect(count).toBe(0);
    expect(notifications).toEqual([]);
  });

  it('adds a local notification and retrieves it with unread count 1', async () => {
    const notif: CommunityNotification = {
      id: 'notif_1001',
      recipientUserId: testUserId,
      userId: testUserId,
      postId: 'post_ssc_123',
      type: 'POST_STATUS_CHANGED',
      title: 'Your paper request was updated',
      body: 'Status changed to Investigating for "SSC CHSL 2024 Tier 1 Shift 2 paper missing".',
      entityType: 'community_post',
      entityId: 'post_ssc_123',
      oldStatus: 'OPEN',
      newStatus: 'INVESTIGATING',
      isRead: false,
      createdAt: new Date().toISOString(),
      metadata: {
        postId: 'post_ssc_123',
        postTitle: 'SSC CHSL 2024 Tier 1 Shift 2 paper missing',
        oldStatus: 'OPEN',
        newStatus: 'INVESTIGATING',
      },
    };

    notificationService.addNotification(notif);

    const count = await notificationService.getUnreadCount(testUserId);
    const list = await notificationService.getNotifications(testUserId);

    expect(count).toBe(1);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('notif_1001');
    expect(list[0].newStatus).toBe('INVESTIGATING');
    expect(list[0].isRead).toBe(false);
  });

  it('marks a single notification as read', async () => {
    const notif: CommunityNotification = {
      id: 'notif_1002',
      recipientUserId: testUserId,
      userId: testUserId,
      postId: 'post_gate_456',
      type: 'POST_RESOLVED',
      title: 'Your report was resolved',
      body: 'Mock.AI Team marked your report as resolved.',
      entityType: 'community_post',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    notificationService.addNotification(notif);
    expect(await notificationService.getUnreadCount(testUserId)).toBe(1);

    const marked = await notificationService.markAsRead('notif_1002', testUserId);
    expect(marked).toBe(true);

    const countAfter = await notificationService.getUnreadCount(testUserId);
    const list = await notificationService.getNotifications(testUserId);

    expect(countAfter).toBe(0);
    expect(list[0].isRead).toBe(true);
    expect(list[0].readAt).toBeDefined();
  });

  it('marks all notifications as read', async () => {
    const notif1: CommunityNotification = {
      id: 'notif_a',
      recipientUserId: testUserId,
      userId: testUserId,
      postId: 'post_1',
      type: 'POST_STATUS_CHANGED',
      title: 'Post 1 updated',
      body: 'Status changed to Investigating',
      isRead: false,
      createdAt: new Date(Date.now() - 5000).toISOString(),
    };

    const notif2: CommunityNotification = {
      id: 'notif_b',
      recipientUserId: testUserId,
      userId: testUserId,
      postId: 'post_2',
      type: 'POST_RESOLVED',
      title: 'Post 2 resolved',
      body: 'Status changed to Resolved',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    notificationService.addNotification(notif1);
    notificationService.addNotification(notif2);

    expect(await notificationService.getUnreadCount(testUserId)).toBe(2);

    await notificationService.markAllAsRead(testUserId);

    expect(await notificationService.getUnreadCount(testUserId)).toBe(0);
    const list = await notificationService.getNotifications(testUserId);
    expect(list.every((n) => n.isRead)).toBe(true);
  });

  it('filters notifications correctly by category', async () => {
    const communityNotif: CommunityNotification = {
      id: 'notif_comm',
      recipientUserId: testUserId,
      userId: testUserId,
      postId: 'post_comm',
      type: 'POST_STATUS_CHANGED',
      title: 'Community update',
      body: 'Post status changed',
      entityType: 'community_post',
      isRead: false,
      createdAt: new Date(Date.now() - 10000).toISOString(),
    };

    const systemNotif: CommunityNotification = {
      id: 'notif_sys',
      recipientUserId: testUserId,
      userId: testUserId,
      postId: '',
      type: 'SYSTEM_ANNOUNCEMENT',
      title: 'Scheduled Maintenance',
      body: 'MOCK.AI will undergo maintenance on Sunday.',
      entityType: 'system',
      isRead: true,
      createdAt: new Date().toISOString(),
    };

    notificationService.addNotification(communityNotif);
    notificationService.addNotification(systemNotif);

    const all = await notificationService.getNotifications(testUserId, 'all');
    expect(all).toHaveLength(2);

    const unreadOnly = await notificationService.getNotifications(testUserId, 'unread');
    expect(unreadOnly).toHaveLength(1);
    expect(unreadOnly[0].id).toBe('notif_comm');

    const commOnly = await notificationService.getNotifications(testUserId, 'community');
    expect(commOnly).toHaveLength(1);
    expect(commOnly[0].id).toBe('notif_comm');

    const sysOnly = await notificationService.getNotifications(testUserId, 'system');
    expect(sysOnly).toHaveLength(1);
    expect(sysOnly[0].id).toBe('notif_sys');
  });

  it('enforces idempotency and prevents duplicate notifications within 1 minute', () => {
    const nowIso = new Date().toISOString();
    const notif: CommunityNotification = {
      id: 'notif_dup_1',
      recipientUserId: testUserId,
      userId: testUserId,
      postId: 'post_dup',
      type: 'POST_RESOLVED',
      title: 'Post resolved',
      body: 'Mock.AI Team marked your post as resolved',
      newStatus: 'RESOLVED',
      isRead: false,
      createdAt: nowIso,
    };

    notificationService.addNotification(notif);
    // Duplicate submission with same post and status
    notificationService.addNotification({
      ...notif,
      id: 'notif_dup_2',
    });

    const locals = JSON.parse(localStorage.getItem(`mockai_notifications_${testUserId}`) || '[]');
    expect(locals).toHaveLength(1);
    expect(locals[0].id).toBe('notif_dup_1');
  });

  it('dispatches custom window events on receipt and updates', () => {
    const receivedSpy = vi.fn();
    const updatedSpy = vi.fn();

    window.addEventListener('mockai_notification_received', receivedSpy);
    window.addEventListener('mockai_notifications_updated', updatedSpy);

    const notif: CommunityNotification = {
      id: 'notif_evt',
      recipientUserId: testUserId,
      userId: testUserId,
      postId: 'post_evt',
      type: 'POST_STATUS_CHANGED',
      title: 'Event test',
      body: 'Testing event dispatch',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    notificationService.addNotification(notif);

    expect(receivedSpy).toHaveBeenCalledTimes(1);
    expect(updatedSpy).toHaveBeenCalledTimes(1);

    window.removeEventListener('mockai_notification_received', receivedSpy);
    window.removeEventListener('mockai_notifications_updated', updatedSpy);
  });
});
