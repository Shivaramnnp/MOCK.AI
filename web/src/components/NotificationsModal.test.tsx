/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { NotificationsModal, formatRelativeTime } from './NotificationsModal';
import { notificationService } from '../services/notificationService';
import { supabaseService } from '../services/supabase';
import { UserProfile, CommunityNotification } from '../types';

describe('NotificationsModal Component Tests', () => {
  const mockUser: UserProfile = {
    uid: 'user_modal_test_123',
    fullName: 'Ananya Roy',
    email: 'ananya@example.com',
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

  describe('formatRelativeTime helper', () => {
    it('returns "just now" for dates within 60 seconds', () => {
      expect(formatRelativeTime(new Date().toISOString())).toBe('just now');
      expect(formatRelativeTime(Date.now() - 30000)).toBe('just now');
    });

    it('returns minutes ago for dates within 60 minutes', () => {
      expect(formatRelativeTime(Date.now() - 2 * 60 * 1000)).toBe('2 minutes ago');
      expect(formatRelativeTime(Date.now() - 1 * 60 * 1000)).toBe('1 minute ago');
    });

    it('returns hours ago for dates within 24 hours', () => {
      expect(formatRelativeTime(Date.now() - 3 * 60 * 60 * 1000)).toBe('3 hours ago');
      expect(formatRelativeTime(Date.now() - 1 * 60 * 60 * 1000)).toBe('1 hour ago');
    });

    it('returns "yesterday" for dates 1 day ago', () => {
      expect(formatRelativeTime(Date.now() - 26 * 60 * 60 * 1000)).toBe('yesterday');
    });

    it('returns days ago for dates under 7 days', () => {
      expect(formatRelativeTime(Date.now() - 4 * 24 * 60 * 60 * 1000)).toBe('4 days ago');
    });
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <NotificationsModal isOpen={false} onClose={vi.fn()} user={mockUser} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal header, tabs, and notifications when open', async () => {
    const notif: CommunityNotification = {
      id: 'notif_modal_1',
      recipientUserId: mockUser.uid,
      userId: mockUser.uid,
      postId: 'post_modal_01',
      type: 'POST_STATUS_CHANGED',
      title: 'Your paper request was updated',
      body: 'Status changed to Investigating',
      oldStatus: 'OPEN',
      newStatus: 'INVESTIGATING',
      isRead: false,
      createdAt: new Date().toISOString(),
      metadata: {
        postId: 'post_modal_01',
        postTitle: 'UPSC CSE 2024 Prelims GS Paper 1',
        oldStatus: 'OPEN',
        newStatus: 'INVESTIGATING',
      },
    };

    notificationService.addNotification(notif);

    render(
      <NotificationsModal isOpen={true} onClose={vi.fn()} user={mockUser} />
    );

    expect(screen.getByText('Notification Center')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('All (1)')).toBeTruthy();
      expect(screen.getByText('Unread (1)')).toBeTruthy();
      expect(screen.getByText('Your paper request was updated')).toBeTruthy();
      expect(screen.getByText('“UPSC CSE 2024 Prelims GS Paper 1”')).toBeTruthy();
    });
  });

  it('filters notifications when typing into search bar', async () => {
    const notif1: CommunityNotification = {
      id: 'notif_search_1',
      recipientUserId: mockUser.uid,
      userId: mockUser.uid,
      postId: 'post_1',
      type: 'POST_STATUS_CHANGED',
      title: 'GATE 2025 Paper issue',
      body: 'Question 17 typo updated',
      isRead: false,
      createdAt: new Date().toISOString(),
      metadata: { postTitle: 'GATE 2025 Data Science' },
    };

    const notif2: CommunityNotification = {
      id: 'notif_search_2',
      recipientUserId: mockUser.uid,
      userId: mockUser.uid,
      postId: 'post_2',
      type: 'POST_RESOLVED',
      title: 'SSC CHSL Resolved',
      body: 'Paper added to library',
      isRead: true,
      createdAt: new Date().toISOString(),
      metadata: { postTitle: 'SSC CHSL 2024' },
    };

    notificationService.addNotification(notif1);
    notificationService.addNotification(notif2);

    render(<NotificationsModal isOpen={true} onClose={vi.fn()} user={mockUser} />);

    await waitFor(() => {
      expect(screen.getByText('GATE 2025 Paper issue')).toBeTruthy();
      expect(screen.getByText('SSC CHSL Resolved')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText('Search updates...');
    fireEvent.change(searchInput, { target: { value: 'GATE' } });

    expect(screen.getByText('GATE 2025 Paper issue')).toBeTruthy();
    expect(screen.queryByText('SSC CHSL Resolved')).toBeNull();
  });

  it('navigates to post when clicking a notification item and closes modal', async () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    const notif: CommunityNotification = {
      id: 'notif_click_1',
      recipientUserId: mockUser.uid,
      userId: mockUser.uid,
      postId: 'post_target_nav',
      type: 'POST_RESOLVED',
      title: 'Report resolved',
      body: 'Thank you for your report',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    notificationService.addNotification(notif);

    render(
      <NotificationsModal
        isOpen={true}
        onClose={onClose}
        user={mockUser}
        onNavigateToPost={onNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Report resolved')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Report resolved'));

    expect(onClose).toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith('post_target_nav');
  });

  it('closes modal when clicking the backdrop overlay', async () => {
    const onClose = vi.fn();
    render(<NotificationsModal isOpen={true} onClose={onClose} user={mockUser} />);

    // The backdrop is the outer fixed element
    const backdrop = screen.getByText('Notification Center').closest('.fixed');
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes modal when pressing the Escape key', () => {
    const onClose = vi.fn();
    render(<NotificationsModal isOpen={true} onClose={onClose} user={mockUser} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders Dismiss button in empty state and calls onClose when clicked', async () => {
    const onClose = vi.fn();
    render(<NotificationsModal isOpen={true} onClose={onClose} user={mockUser} />);

    await waitFor(() => {
      expect(screen.getByText('No notifications found')).toBeTruthy();
    });

    const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
    expect(dismissBtn).toBeTruthy();
    fireEvent.click(dismissBtn);

    expect(onClose).toHaveBeenCalled();
  });
});
