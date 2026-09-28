import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { PostDetailModal } from '../components/community/PostDetailModal';
import { StaffDashboardScreen } from './StaffDashboardScreen';
import { staffService } from '../services/staffService';
import { communityService } from '../services/communityService';
import { UserProfile, CommunityPost, CommunityComment } from '../types';

describe('Staff Moderation & Community Separation Security Tests', () => {
  const normalUser: UserProfile = {
    uid: 'student-uuid-456',
    fullName: 'Rahul Sharma',
    email: 'rahul@student.org',
    role: 'STUDENT',
    createdAt: Date.now(),
  };

  const teacherUser: UserProfile = {
    uid: 'teacher-uuid-789',
    fullName: 'Prof. Vikram Rao',
    email: 'vikram@faculty.edu',
    role: 'TEACHER',
    createdAt: Date.now(),
  };

  const staffUser: UserProfile = {
    uid: '6b8a0849-2827-4a8a-9967-7364bb7b8d18',
    fullName: 'Platform Admin',
    email: 'admin@mockai.org',
    role: 'TEACHER',
    createdAt: Date.now(),
  };

  const mockPost: CommunityPost = {
    id: 'post-test-101',
    type: 'QUESTION_REPORT',
    title: 'GATE 2025 DA Q17 Relational Algebra Incorrect Ingestion',
    description: 'The relational algebra expression has broken symbols and the schema definitions are concatenated.',
    authorId: normalUser.uid,
    authorName: normalUser.fullName,
    authorRole: 'STUDENT',
    status: 'RESOLVED',
    priority: 'HIGH',
    supportCount: 15,
    commentCount: 1,
    metadata: {
      paperId: 'gate-da-2025',
      questionNumber: 17,
    },
    resolutionNotes: 'Verified against official GATE 2025 DA PDF. Schema tables and mathematical symbols restored.',
    resolvedByName: 'Mock.AI Engineering Team',
    resolvedAt: new Date().toISOString(),
    isPinned: false,
    isHidden: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    hasUserSupported: true,
  };

  const mockOfficialComment: CommunityComment = {
    id: 'comment-staff-001',
    postId: mockPost.id,
    authorId: staffUser.uid,
    authorName: 'Mock.AI Team',
    authorRole: 'STAFF',
    isOfficialResponse: true,
    content: 'Thank you for reporting. The parser fix has been deployed and the question now renders all relational algebra symbols correctly.',
    isHidden: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('CRITICAL REGRESSION: PostDetailModal does NOT expose staff moderation controls to normal users', async () => {
    vi.spyOn(communityService, 'getPostById').mockResolvedValue({
      post: mockPost,
      comments: [mockOfficialComment],
    });

    render(
      <PostDetailModal
        postId={mockPost.id}
        isOpen={true}
        onClose={() => {}}
        user={normalUser}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(mockPost.title)).toBeTruthy();
    });

    // 1. Staff Moderation & Status Controls must NOT exist in the DOM
    expect(screen.queryByText('Staff Moderation & Status Controls')).toBeNull();
    expect(screen.queryByText('Save Staff Status')).toBeNull();
    expect(screen.queryByText('Resolution / Staff Notes')).toBeNull();
    expect(screen.queryByText('Reply with Official Mock.AI Team badge')).toBeNull();

    // 2. Verified public resolution must be visible to students
    expect(screen.getByText(/Verified against official GATE 2025 DA PDF/i)).toBeTruthy();

    // 3. Official badge must be rendered for official responses
    expect(screen.getByText('Mock.AI Team ✓')).toBeTruthy();
  });

  it('CRITICAL REGRESSION: PostDetailModal does NOT expose staff controls even if user has TEACHER role', async () => {
    vi.spyOn(communityService, 'getPostById').mockResolvedValue({
      post: mockPost,
      comments: [mockOfficialComment],
    });

    render(
      <PostDetailModal
        postId={mockPost.id}
        isOpen={true}
        onClose={() => {}}
        user={teacherUser}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(mockPost.title)).toBeTruthy();
    });

    // Still completely absent from public post modal
    expect(screen.queryByText('Staff Moderation & Status Controls')).toBeNull();
    expect(screen.queryByText('Save Staff Status')).toBeNull();
    expect(screen.queryByText('Reply with Official Mock.AI Team badge')).toBeNull();
  });

  it('StaffDashboardScreen blocks unauthorized normal users with 403 Forbidden', async () => {
    vi.spyOn(staffService, 'getStaffAuthStatus').mockResolvedValue({
      isStaff: false,
      role: null,
      permissions: [],
    });

    render(
      <StaffDashboardScreen
        user={normalUser}
        onNavigate={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('403 Forbidden — Staff Portal')).toBeTruthy();
    });

    expect(
      screen.getByText(/This portal is restricted exclusively to authorized Mock.AI operations team members/i)
    ).toBeTruthy();
  });

  it('StaffDashboardScreen grants access to verified staff with privileged role', async () => {
    vi.spyOn(staffService, 'getStaffAuthStatus').mockResolvedValue({
      isStaff: true,
      role: 'SUPER_ADMIN',
      permissions: ['ALL'],
    });

    vi.spyOn(communityService, 'getPosts').mockResolvedValue({
      posts: [mockPost],
      total: 1,
    });

    render(
      <StaffDashboardScreen
        user={staffUser}
        onNavigate={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Mock.AI Staff Portal')).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText('Verified Staff Operations')).toBeTruthy();
      expect(screen.getByText('Role: SUPER_ADMIN')).toBeTruthy();
      expect(screen.getByText(/Moderation Queue/)).toBeTruthy();
    });
  });

  it('CommunityService enforces user restrictions before creating posts', async () => {
    vi.spyOn(staffService, 'checkUserRestriction').mockResolvedValue({
      restricted: true,
      status: 'POSTING_RESTRICTED',
      reason: 'Automated spam detected',
    });

    await expect(
      communityService.createPost({
        type: 'PAPER_REQUEST',
        title: 'Valid Title Here',
        description: 'Valid Description with enough length here',
        user: normalUser,
      })
    ).rejects.toThrow(/Posting restricted: Your account community status is "POSTING_RESTRICTED"/);
  });

  it('CommunityService enforces user restrictions before creating comments', async () => {
    vi.spyOn(staffService, 'checkUserRestriction').mockResolvedValue({
      restricted: true,
      status: 'BANNED',
      reason: 'Repeated guideline violations',
    });

    await expect(
      communityService.createComment({
        postId: 'post-test-101',
        content: 'This comment should be blocked',
        user: normalUser,
      })
    ).rejects.toThrow(/Commenting restricted: Your account community status is "BANNED"/);
  });
});
