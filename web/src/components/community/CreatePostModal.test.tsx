/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CreatePostModal } from './CreatePostModal';
import { communityService } from '../../services/communityService';
import { UserProfile, CommunityPost } from '../../types';

describe('CreatePostModal Component Tests', () => {
  const mockUser: UserProfile = {
    uid: 'user_123',
    fullName: 'Shivaram Patel',
    email: 'shiva@example.com',
    role: 'STUDENT',
    createdAt: Date.now(),
  };

  const mockUserLegacyName: UserProfile = {
    uid: 'user_456',
    fullName: 'you',
    email: 'test@example.com',
    role: 'STUDENT',
    createdAt: Date.now(),
  };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders modal when open and displays real user display name and privacy notice in footer', () => {
    render(
      <CreatePostModal
        isOpen={true}
        onClose={vi.fn()}
        onPostCreated={vi.fn()}
        user={mockUser}
        initialType="PAPER_REQUEST"
      />
    );

    expect(screen.getByText('Create Community Post')).toBeTruthy();
    // Real authenticated user name
    expect(screen.getByText('Shivaram Patel')).toBeTruthy();
    expect(screen.getByText('Posting as:')).toBeTruthy();
    expect(screen.getByText('Your display name will be publicly visible with this post.')).toBeTruthy();
    // Must NOT say 'you' or 'Scholar (Guest)'
    expect(screen.queryByText('Scholar (Guest)')).toBeNull();
  });

  it('falls back to "Mock.AI User" instead of showing "you" in footer', () => {
    render(
      <CreatePostModal
        isOpen={true}
        onClose={vi.fn()}
        onPostCreated={vi.fn()}
        user={mockUserLegacyName}
        initialType="PAPER_REQUEST"
      />
    );

    expect(screen.getByText('Mock.AI User')).toBeTruthy();
    expect(screen.queryByText('Posting as: you')).toBeNull();
  });

  it('shows custom exam name and authority inputs when "Custom / Other Exam" is selected', () => {
    render(
      <CreatePostModal
        isOpen={true}
        onClose={vi.fn()}
        onPostCreated={vi.fn()}
        user={mockUser}
        initialType="PAPER_REQUEST"
      />
    );

    const examSelect = screen.getByLabelText(/Target Exam \*/i);
    fireEvent.change(examSelect, { target: { value: 'CUSTOM_EXAM' } });

    expect(screen.getByLabelText(/Custom Exam Name \*/i)).toBeTruthy();
    expect(screen.getByLabelText(/Exam Authority \/ State \(Optional\)/i)).toBeTruthy();
  });

  it('shows custom year input when "Custom / Other Year" is selected', () => {
    render(
      <CreatePostModal
        isOpen={true}
        onClose={vi.fn()}
        onPostCreated={vi.fn()}
        user={mockUser}
        initialType="PAPER_REQUEST"
      />
    );

    const yearSelect = screen.getByLabelText(/Edition Year \*/i);
    fireEvent.change(yearSelect, { target: { value: 'CUSTOM_YEAR' } });

    expect(screen.getByText(/Custom Exam Year \*/i)).toBeTruthy();
  });

  it('shows custom stage and custom session inputs when custom options are selected', () => {
    render(
      <CreatePostModal
        isOpen={true}
        onClose={vi.fn()}
        onPostCreated={vi.fn()}
        user={mockUser}
        initialType="PAPER_REQUEST"
      />
    );

    const stageSelect = screen.getByLabelText(/Tier \/ Stage/i);
    fireEvent.change(stageSelect, { target: { value: 'CUSTOM_STAGE' } });
    expect(screen.getByPlaceholderText('e.g. Prelims, Phase 1, Round 2')).toBeTruthy();

    const shiftSelect = screen.getByLabelText(/Shift \/ Session/i);
    fireEvent.change(shiftSelect, { target: { value: 'CUSTOM_SESSION' } });
    expect(screen.getByPlaceholderText('e.g. FN, AN, Day 1 Morning')).toBeTruthy();
  });

  it('dynamically computes title suggestion for custom exam and allows clicking "Use suggestion"', async () => {
    render(
      <CreatePostModal
        isOpen={true}
        onClose={vi.fn()}
        onPostCreated={vi.fn()}
        user={mockUser}
        initialType="PAPER_REQUEST"
      />
    );

    // Select custom exam and type POLYCET
    const examSelect = screen.getByLabelText(/Target Exam \*/i);
    fireEvent.change(examSelect, { target: { value: 'CUSTOM_EXAM' } });

    const customExamInput = screen.getByPlaceholderText('e.g. POLYCET, NDA, TS EAMCET');
    fireEvent.change(customExamInput, { target: { value: 'POLYCET' } });

    // Select custom year and type 2015
    const yearSelect = screen.getByLabelText(/Edition Year \*/i);
    fireEvent.change(yearSelect, { target: { value: 'CUSTOM_YEAR' } });

    const customYearInput = screen.getByPlaceholderText('e.g. 2015');
    fireEvent.change(customYearInput, { target: { value: '2015' } });

    // Check title auto-syncs when pristine
    const titleInput = screen.getByPlaceholderText('e.g. POLYCET 2015 question paper missing') as HTMLInputElement;
    expect(titleInput.value).toContain('POLYCET');
    expect(titleInput.value).toContain('2015');
    expect(titleInput.value).toContain('question paper missing');

    // Manually edit title
    fireEvent.change(titleInput, { target: { value: 'Custom user typed title' } });

    // Suggestion button appears
    await waitFor(() => {
      expect(screen.getByText(/Use suggestion:/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/Use suggestion:/i));
    expect(titleInput.value).toContain('POLYCET 2015');
  });

  it('submits custom exam request with structured metadata and calls onPostCreated', async () => {
    const onPostCreated = vi.fn();
    const onClose = vi.fn();
    const createSpy = vi.spyOn(communityService, 'createPost').mockResolvedValue({
      id: 'test-post-custom',
      type: 'PAPER_REQUEST',
      title: 'POLYCET 2015 question paper missing',
      description: 'Need Andhra Pradesh POLYCET 2015 entrance paper',
      authorId: mockUser.uid,
      authorName: 'Shivaram Patel',
      authorRole: 'STUDENT',
      status: 'OPEN',
      priority: 'NORMAL',
      supportCount: 1,
      commentCount: 0,
      metadata: {
        isCustomExam: true,
        customExamName: 'POLYCET',
        customExamAuthority: 'SBTET AP',
        isCustomYear: true,
        customYear: 2015,
      },
      isPinned: false,
      isHidden: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    render(
      <CreatePostModal
        isOpen={true}
        onClose={onClose}
        onPostCreated={onPostCreated}
        user={mockUser}
        initialType="PAPER_REQUEST"
      />
    );

    // Fill form
    fireEvent.change(screen.getByLabelText(/Target Exam \*/i), { target: { value: 'CUSTOM_EXAM' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. POLYCET, NDA, TS EAMCET'), { target: { value: 'POLYCET' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Andhra Pradesh / SBTET / UPSC'), { target: { value: 'SBTET AP' } });

    fireEvent.change(screen.getByLabelText(/Edition Year \*/i), { target: { value: 'CUSTOM_YEAR' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 2015'), { target: { value: '2015' } });

    fireEvent.change(screen.getByPlaceholderText(/Provide clear details/i), {
      target: { value: 'Need Andhra Pradesh POLYCET 2015 entrance paper for diploma prep' },
    });

    fireEvent.click(screen.getByText('Submit to Community'));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
      expect(onPostCreated).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    const calledArgs = createSpy.mock.calls[0][0];
    expect(calledArgs.metadata?.isCustomExam).toBe(true);
    expect(calledArgs.metadata?.customExamName).toBe('POLYCET');
    expect(calledArgs.metadata?.customExamAuthority).toBe('SBTET AP');
    expect(calledArgs.metadata?.isCustomYear).toBe(true);
    expect(calledArgs.metadata?.customYear).toBe(2015);
    expect(calledArgs.metadata?.examId).toBeUndefined(); // Zero fake canonical IDs!
  });

  it('preloads existing post data, locks post type, and calls onPostUpdated when in edit mode', async () => {
    const existingPost: CommunityPost = {
      id: 'post_edit_123',
      type: 'DISCUSSION',
      title: 'Original Preloaded Title',
      description: 'Original preloaded description that is sufficiently long.',
      authorId: mockUser.uid,
      authorName: mockUser.fullName,
      authorRole: 'STUDENT',
      status: 'OPEN',
      priority: 'NORMAL',
      supportCount: 3,
      commentCount: 1,
      metadata: {},
      isPinned: false,
      isHidden: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updateSpy = vi.spyOn(communityService, 'updatePost').mockResolvedValue({
      ...existingPost,
      title: 'Edited Title by User',
      description: 'Edited description that is also sufficiently long.',
      isEdited: true,
      editedAt: new Date().toISOString(),
    });

    const onPostUpdated = vi.fn();
    const onClose = vi.fn();

    render(
      <CreatePostModal
        isOpen={true}
        onClose={onClose}
        onPostUpdated={onPostUpdated}
        user={mockUser}
        editPost={existingPost}
      />
    );

    // Modal title should indicate Edit Mode
    expect(screen.getByText('Edit Community Post')).toBeTruthy();

    // Type should be locked
    expect(screen.getByText('🔒 Type is locked to maintain metadata consistency')).toBeTruthy();

    // Fields should be preloaded
    const titleInput = screen.getByDisplayValue('Original Preloaded Title');
    const descInput = screen.getByDisplayValue('Original preloaded description that is sufficiently long.');
    expect(titleInput).toBeTruthy();
    expect(descInput).toBeTruthy();

    // Button should say "Save Changes"
    expect(screen.getByText('Save Changes')).toBeTruthy();

    // Make edit
    fireEvent.change(titleInput, { target: { value: 'Edited Title by User' } });
    fireEvent.change(descInput, { target: { value: 'Edited description that is also sufficiently long.' } });

    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: existingPost.id,
          title: 'Edited Title by User',
          description: 'Edited description that is also sufficiently long.',
        })
      );
      expect(onPostUpdated).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});

