/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { NotificationBell } from './NotificationBell';
import { notificationService } from '../services/notificationService';
import { supabaseService } from '../services/supabase';
import { UserProfile, CommunityNotification } from '../types';

describe('NotificationBell Component Tests', () => {
  const mockUser: UserProfile = {
    uid: 'user_bell_test_123',
    fullName: 'Ravi Teja',
    email: 'ravi@example.com',
    role: 'STUDENT',
    createdAt: Date.now(),
  };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(supabaseService, 'getClient').mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when user is null', () => {
    const { container } = render(<NotificationBell user={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders bell icon without badge when unread count is 0', async () => {
    render(<NotificationBell user={mockUser} />);

    const button = screen.getByRole('button', { name: /notifications/i });
    expect(button).toBeTruthy();
    // Badge span should not exist
    expect(screen.queryByText(/^[0-9]+$/)).toBeNull();
  });

  it('displays badge with unread count when notifications are present', async () => {
    const notif: CommunityNotification = {
      id: 'notif_1',
      recipientUserId: mockUser.uid,
      userId: mockUser.uid,
      postId: 'post_gate_01',
      type: 'POST_STATUS_CHANGED',
      title: 'Your paper request was updated',
      body: 'Status changed to Investigating for "GATE DA 2025".',
      newStatus: 'INVESTIGATING',
      isRead: false,
      createdAt: new Date().toISOString(),
      metadata: {
        postId: 'post_gate_01',
        postTitle: 'GATE DA 2025 paper',
      },
    };

    notificationService.addNotification(notif);

    render(<NotificationBell user={mockUser} />);

    await waitFor(() => {
      expect(screen.getByText('1')).toBeTruthy();
    });
  });

  it('toggles dropdown popover on click and shows notification details', async () => {
    const notif: CommunityNotification = {
      id: 'notif_2',
      recipientUserId: mockUser.uid,
      userId: mockUser.uid,
      postId: 'post_ssc_02',
      type: 'POST_RESOLVED',
      title: 'Your report was resolved',
      body: 'Mock.AI Team marked your report as resolved.',
      newStatus: 'RESOLVED',
      isRead: false,
      createdAt: new Date().toISOString(),
      metadata: {
        postId: 'post_ssc_02',
        postTitle: 'SSC CHSL Tier 1 Shift 2 paper missing',
      },
    };

    notificationService.addNotification(notif);

    render(<NotificationBell user={mockUser} />);

    await waitFor(() => {
      expect(screen.getByText('1')).toBeTruthy();
    });

    // Click bell
    const button = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(button);

    // Popover content should be visible
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.getByText('1 new')).toBeTruthy();
    expect(screen.getByText('Your report was resolved')).toBeTruthy();
    expect(screen.getByText('“SSC CHSL Tier 1 Shift 2 paper missing”')).toBeTruthy();
  });

  it('navigates to community post and marks notification read on click', async () => {
    const onNavigate = vi.fn();
    const notif: CommunityNotification = {
      id: 'notif_3',
      recipientUserId: mockUser.uid,
      userId: mockUser.uid,
      postId: 'post_target_99',
      type: 'POST_STATUS_CHANGED',
      title: 'Your question report was updated',
      body: 'Status changed to In Progress',
      newStatus: 'IN_PROGRESS',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    notificationService.addNotification(notif);

    render(<NotificationBell user={mockUser} onNavigateToPost={onNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('1')).toBeTruthy();
    });

    const button = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(button);

    const item = screen.getByText('Your question report was updated');
    fireEvent.click(item);

    expect(onNavigate).toHaveBeenCalledWith('post_target_99');

    // Should have marked notification as read
    await waitFor(async () => {
      const count = await notificationService.getUnreadCount(mockUser.uid);
      expect(count).toBe(0);
    });
  });

  it('marks all as read when clicking "Mark all read"', async () => {
    const notif1: CommunityNotification = {
      id: 'notif_4',
      recipientUserId: mockUser.uid,
      userId: mockUser.uid,
      postId: 'post_1',
      type: 'POST_STATUS_CHANGED',
      title: 'Update 1',
      body: 'Body 1',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    const notif2: CommunityNotification = {
      id: 'notif_5',
      recipientUserId: mockUser.uid,
      userId: mockUser.uid,
      postId: 'post_2',
      type: 'POST_STATUS_CHANGED',
      title: 'Update 2',
      body: 'Body 2',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    notificationService.addNotification(notif1);
    notificationService.addNotification(notif2);

    render(<NotificationBell user={mockUser} />);

    await waitFor(() => {
      expect(screen.getByText('2')).toBeTruthy();
    });

    const button = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(button);

    const markAllBtn = screen.getByRole('button', { name: /mark all read/i });
    fireEvent.click(markAllBtn);

    await waitFor(async () => {
      const count = await notificationService.getUnreadCount(mockUser.uid);
      expect(count).toBe(0);
    });
  });

  it('opens NotificationsModal when clicking "View all notifications"', async () => {
    render(<NotificationBell user={mockUser} />);

    const button = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(button);

    const viewAllBtn = screen.getByRole('button', { name: /view all notifications/i });
    fireEvent.click(viewAllBtn);

    // Modal header should be in the DOM
    expect(screen.getByText('Notification Center')).toBeTruthy();
  });
});
