/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PostActionMenu } from './PostActionMenu';
import { CommunityPost, UserProfile, StaffAuthStatus } from '../../types';

describe('PostActionMenu Component Tests', () => {
  const authorUser: UserProfile = {
    uid: 'user_author_123',
    fullName: 'Author User',
    email: 'author@mockai.org',
    role: 'STUDENT',
    createdAt: Date.now(),
  };

  const otherUser: UserProfile = {
    uid: 'user_other_456',
    fullName: 'Other User',
    email: 'other@mockai.org',
    role: 'STUDENT',
    createdAt: Date.now(),
  };

  const samplePost: CommunityPost = {
    id: 'post_test_999',
    type: 'DISCUSSION',
    title: 'Test Discussion Title',
    description: 'Detailed description of test discussion.',
    authorId: 'user_author_123',
    authorName: 'Author User',
    authorRole: 'STUDENT',
    status: 'OPEN',
    priority: 'NORMAL',
    supportCount: 5,
    commentCount: 2,
    metadata: {},
    isPinned: false,
    isHidden: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the 3-dot menu button with accessible aria-label', () => {
    render(
      <PostActionMenu
        post={samplePost}
        user={authorUser}
      />
    );

    const button = screen.getByRole('button', { name: /Post actions/i });
    expect(button).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens menu when 3-dot button is clicked', () => {
    render(
      <PostActionMenu
        post={samplePost}
        user={authorUser}
      />
    );

    const button = screen.getByRole('button', { name: /Post actions/i });
    fireEvent.click(button);

    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('shows Edit Post, Delete Post, and Copy Link for the author, and excludes Report Post', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onCopyLink = vi.fn();

    render(
      <PostActionMenu
        post={samplePost}
        user={authorUser}
        onEdit={onEdit}
        onDelete={onDelete}
        onCopyLink={onCopyLink}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Post actions/i }));

    expect(screen.getByText('Edit Post')).toBeTruthy();
    expect(screen.getByText('Delete Post')).toBeTruthy();
    expect(screen.getByText('Copy Link')).toBeTruthy();
    expect(screen.queryByText('Report Post')).toBeNull();

    // Trigger Edit Post
    fireEvent.click(screen.getByText('Edit Post'));
    expect(onEdit).toHaveBeenCalledWith(samplePost);
    expect(screen.queryByRole('menu')).toBeNull(); // Menu closes after action
  });

  it('shows Delete Post callback execution for author', () => {
    const onDelete = vi.fn();

    render(
      <PostActionMenu
        post={samplePost}
        user={authorUser}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Post actions/i }));
    fireEvent.click(screen.getByText('Delete Post'));
    expect(onDelete).toHaveBeenCalledWith(samplePost);
  });

  it('shows Report Post and Copy Link for another user, and strictly hides Edit and Delete', () => {
    const onReport = vi.fn();
    const onCopyLink = vi.fn();

    render(
      <PostActionMenu
        post={samplePost}
        user={otherUser}
        onReport={onReport}
        onCopyLink={onCopyLink}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Post actions/i }));

    expect(screen.getByText('Report Post')).toBeTruthy();
    expect(screen.getByText('Copy Link')).toBeTruthy();
    expect(screen.queryByText('Edit Post')).toBeNull();
    expect(screen.queryByText('Delete Post')).toBeNull();

    fireEvent.click(screen.getByText('Report Post'));
    expect(onReport).toHaveBeenCalledWith(samplePost);
  });

  it('strictly hides staff-only actions from normal users', () => {
    render(
      <PostActionMenu
        post={samplePost}
        user={authorUser}
        authStatus={{ isStaff: false, role: null, permissions: [] }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Post actions/i }));

    expect(screen.queryByText('Staff Moderation')).toBeNull();
    expect(screen.queryByText(/Pin Post/i)).toBeNull();
    expect(screen.queryByText(/Hide Post/i)).toBeNull();
  });

  it('displays staff moderation controls when authenticated user is staff', () => {
    const staffAuth: StaffAuthStatus = {
      isStaff: true,
      role: 'MODERATOR',
      permissions: ['PIN_POSTS', 'HIDE_POSTS'],
    };

    const onStaffPinToggle = vi.fn();
    const onStaffHideToggle = vi.fn();

    render(
      <PostActionMenu
        post={samplePost}
        user={otherUser}
        authStatus={staffAuth}
        onStaffPinToggle={onStaffPinToggle}
        onStaffHideToggle={onStaffHideToggle}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Post actions/i }));

    expect(screen.getByText('Staff Moderation')).toBeTruthy();
    expect(screen.getByText('Pin Post')).toBeTruthy();
    expect(screen.getByText('Hide Post')).toBeTruthy();

    fireEvent.click(screen.getByText('Pin Post'));
    expect(onStaffPinToggle).toHaveBeenCalledWith(samplePost);
  });

  it('closes menu when Escape key is pressed', () => {
    render(
      <PostActionMenu
        post={samplePost}
        user={authorUser}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Post actions/i }));
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('stops click propagation to avoid triggering post card selection', () => {
    const cardOnClick = vi.fn();

    render(
      <div onClick={cardOnClick}>
        <PostActionMenu
          post={samplePost}
          user={authorUser}
        />
      </div>
    );

    const button = screen.getByRole('button', { name: /Post actions/i });
    fireEvent.click(button);

    // Card click must NOT have been triggered
    expect(cardOnClick).not.toHaveBeenCalled();
  });
});
