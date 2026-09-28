import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { CommunityScreen } from './CommunityScreen';
import { CreatePostModal } from '../components/community/CreatePostModal';
import { PostDetailModal } from '../components/community/PostDetailModal';
import { communityService } from '../services/communityService';
import { UserProfile, CommunityPost } from '../types';

describe('CommunityScreen UI Integration Tests', () => {
  const mockUser: UserProfile = {
    uid: 'test-user-123',
    fullName: 'Ananya Roy',
    email: 'ananya@mockai.org',
    role: 'STUDENT',
    createdAt: Date.now(),
  };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders CreatePostModal directly when isOpen is true', () => {
    render(
      <CreatePostModal
        isOpen={true}
        onClose={() => {}}
        onPostCreated={() => {}}
        user={mockUser}
      />
    );
    expect(screen.getByText('Create Community Post')).toBeTruthy();
  });

  it('renders Community Hub header, badge, and tabs correctly', async () => {
    render(<CommunityScreen user={mockUser} />);

    // Header & Tagline
    expect(screen.getByText('Discuss, report, request, and help improve Mock.AI.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Community' })).toBeTruthy();

    // 6 Tabs
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Paper Requests' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Question Reports' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bug Reports' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Feature Requests' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Discussions' })).toBeTruthy();
  });

  it('automatically opens Create Post modal when initialContext is provided from question review', async () => {
    render(
      <CommunityScreen
        user={mockUser}
        initialContext={{
          type: 'QUESTION_REPORT',
          examId: 'ssc-chsl',
          editionYear: 2024,
          paperId: 'ssc-chsl-2024-01jul-s1',
          questionId: 'ssc-chsl-2024-01jul-s1-q18',
          questionNumber: 18,
          tier: 'Tier 1',
          shift: 'Shift 1',
        }}
      />
    );

    // Modal should be open with prefilled details
    await waitFor(() => {
      expect(screen.getByText('Create Community Post')).toBeTruthy();
      expect(screen.getByText(/Linked to SSC-CHSL Question #18/i)).toBeTruthy();
    });

    expect(screen.getByText('ssc-chsl-2024-01jul-s1')).toBeTruthy();
  });

  it('allows switching tabs and updates search filter', async () => {
    render(<CommunityScreen user={mockUser} />);

    const bugTab = screen.getByRole('button', { name: 'Bug Reports' });
    fireEvent.click(bugTab);

    // The Bug Reports tab should be active
    expect(bugTab.className).toContain('bg-brand-primary');

    const searchInput = screen.getByPlaceholderText(/Search discussions, paper requests, or question numbers/i) as HTMLInputElement;
    expect(searchInput).toBeTruthy();

    fireEvent.change(searchInput, { target: { value: 'GATE' } });
    expect(searchInput.value).toBe('GATE');
  });

  it('opens Create Post modal on "+ New Post" button click', async () => {
    render(<CommunityScreen user={mockUser} />);

    const newPostButtons = screen.getAllByRole('button', { name: /New Post/i });
    expect(newPostButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(newPostButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Create Community Post')).toBeTruthy();
    });
  });

  it('renders polished empty state with [Create Community Post] CTA when there are 0 posts in DB', async () => {
    vi.spyOn(communityService, 'getPosts').mockResolvedValueOnce({ posts: [], total: 0 });

    render(<CommunityScreen user={mockUser} />);

    await waitFor(() => {
      expect(screen.getByText('No community posts yet')).toBeTruthy();
      expect(
        screen.getByText('Be the first learner to start a discussion, report an issue, or request a question paper.')
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: /Create Community Post/i })).toBeTruthy();
    });
  });

  it('renders "No matching community posts" with [Clear Filters] when filter yields 0 posts', async () => {
    vi.spyOn(communityService, 'getPosts').mockResolvedValue({ posts: [], total: 0 });

    render(<CommunityScreen user={mockUser} />);

    // Type a query that yields no matches
    const searchInput = screen.getByPlaceholderText(/Search discussions, paper requests, or question numbers/i) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'nonexistent-post-query' } });

    await waitFor(() => {
      expect(screen.getByText('No matching community posts')).toBeTruthy();
      expect(screen.getByRole('button', { name: /Clear Filters/i })).toBeTruthy();
    });

    // Click Clear Filters
    fireEvent.click(screen.getByRole('button', { name: /Clear Filters/i }));

    await waitFor(() => {
      expect(searchInput.value).toBe('');
    });
  });

  it('renders error state with [Try Again] button when fetching posts fails', async () => {
    vi.spyOn(communityService, 'getPosts').mockRejectedValueOnce(new Error('Network error'));

    render(<CommunityScreen user={mockUser} />);

    await waitFor(() => {
      expect(screen.getByText("We couldn't load the community right now.")).toBeTruthy();
      expect(screen.getByRole('button', { name: /Try Again/i })).toBeTruthy();
    });
  });

  it('preserves React hook ordering in PostDetailModal when transitioning isOpen state', async () => {
    const mockPost: CommunityPost = {
      id: 'post-hook-test-1',
      authorId: 'test-user-123',
      authorName: 'Ananya Roy',
      authorRole: 'STUDENT',
      type: 'DISCUSSION',
      title: 'Hook Stability Verification Post',
      description: 'Testing that PostDetailModal does not throw hook order violations.',
      status: 'OPEN',
      priority: 'NORMAL',
      metadata: {},
      isPinned: false,
      isHidden: false,
      supportCount: 5,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hasUserSupported: false,
    };

    vi.spyOn(communityService, 'getPostById').mockResolvedValue({
      post: mockPost,
      comments: [],
    });

    // 1. Initial render with isOpen=false (as rendered on initial Community mount)
    const { rerender } = render(
      <PostDetailModal
        isOpen={false}
        postId={null}
        onClose={() => {}}
        user={mockUser}
      />
    );
    expect(screen.queryByText('Hook Stability Verification Post')).toBeNull();

    // 2. Rerender with isOpen=true and postId provided (clicking post)
    // If hooks count differs, React will throw a fatal error here!
    rerender(
      <PostDetailModal
        isOpen={true}
        postId="post-hook-test-1"
        onClose={() => {}}
        user={mockUser}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Hook Stability Verification Post')).toBeTruthy();
    });

    // 3. Rerender back to isOpen=false (closing modal)
    // Verifies no "rendered fewer hooks" error
    rerender(
      <PostDetailModal
        isOpen={false}
        postId={null}
        onClose={() => {}}
        user={mockUser}
      />
    );
    expect(screen.queryByText('Hook Stability Verification Post')).toBeNull();
  });

  it('opens PostDetailModal when clicking on a community post card', async () => {
    const mockPost: CommunityPost = {
      id: 'post-click-test-1',
      authorId: 'test-user-123',
      authorName: 'Ananya Roy',
      authorRole: 'STUDENT',
      type: 'PAPER_REQUEST',
      title: 'Need 2024 CGL Shift 2 Paper',
      description: 'Please upload the Shift 2 question paper for CGL 2024.',
      status: 'OPEN',
      priority: 'NORMAL',
      metadata: {},
      isPinned: false,
      isHidden: false,
      supportCount: 12,
      commentCount: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hasUserSupported: false,
    };

    vi.spyOn(communityService, 'getPosts').mockResolvedValue({
      posts: [mockPost],
      total: 1,
    });

    vi.spyOn(communityService, 'getPostById').mockResolvedValue({
      post: mockPost,
      comments: [],
    });

    render(<CommunityScreen user={mockUser} />);

    // Wait for the post card to appear
    await waitFor(() => {
      expect(screen.getByText('Need 2024 CGL Shift 2 Paper')).toBeTruthy();
    });

    // Click the post card
    fireEvent.click(screen.getByText('Need 2024 CGL Shift 2 Paper'));

    // Verify detail modal opens with role="dialog" without crashing into a white screen
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText('Please upload the Shift 2 question paper for CGL 2024.')).toBeTruthy();

    // Verify closing via Escape key closes dialog cleanly
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});

