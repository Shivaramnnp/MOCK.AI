/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  communityService,
  sanitizeInput,
  checkRateLimit,
  normalizeExamName,
  getCommunityDisplayName,
} from './communityService';
import { staffService } from './staffService';
import { supabaseService } from './supabase';
import { UserProfile } from '../types';

describe('CommunityService Tests', () => {
  const mockStudent: UserProfile = {
    uid: 'user_std_123',
    fullName: 'Aarav Sharma',
    email: 'aarav@mockai.org',
    role: 'STUDENT',
    createdAt: Date.now(),
  };

  const mockStaff: UserProfile = {
    uid: 'user_teacher_456',
    fullName: 'Prof. Mukherjee',
    email: 'mukherjee@mockai.org',
    role: 'TEACHER',
    createdAt: Date.now(),
  };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(supabaseService, 'getClient').mockReturnValue(null);
  });

  describe('Input Sanitization & Rate Limiting', () => {
    it('strips <script>, <iframe>, and javascript: protocols to prevent XSS', () => {
      const malicious = '<script>alert("hack")</script>Hello <iframe src="evil.com"></iframe> World javascript:steal() onmouseover=alert(1)';
      const cleaned = sanitizeInput(malicious);
      expect(cleaned).not.toContain('<script>');
      expect(cleaned).not.toContain('alert("hack")');
      expect(cleaned).not.toContain('<iframe>');
      expect(cleaned).not.toContain('javascript:');
      expect(cleaned).not.toContain('onmouseover=');
      expect(cleaned).toContain('Hello');
      expect(cleaned).toContain('World');
    });

    it('enforces posting rate limit (max 5 posts per 5 minutes)', () => {
      // 5 calls should succeed
      for (let i = 0; i < 5; i++) {
        expect(checkRateLimit('post')).toBe(true);
      }
      // 6th call should be blocked
      expect(checkRateLimit('post')).toBe(false);
    });

    it('enforces comment rate limit (max 10 comments per 5 minutes)', () => {
      for (let i = 0; i < 10; i++) {
        expect(checkRateLimit('comment')).toBe(true);
      }
      expect(checkRateLimit('comment')).toBe(false);
    });
  });

  describe('Duplicate Detection Engine', () => {
    it('detects duplicate Question Report by canonical questionId', async () => {
      // Create an existing question report
      await communityService.createPost({
        type: 'QUESTION_REPORT',
        title: 'Formula error in Question 15',
        description: 'Question 15 displays wrong denominator.',
        metadata: {
          examId: 'ssc-chsl',
          editionYear: 2024,
          paperId: 'ssc-chsl-2024-01jul-s1',
          questionId: 'ssc-chsl-2024-01jul-s1-q15',
          questionNumber: 15,
        },
        user: mockStudent,
      });

      // Query for duplicates with exact same questionId
      const duplicates = await communityService.findDuplicates({
        type: 'QUESTION_REPORT',
        questionId: 'ssc-chsl-2024-01jul-s1-q15',
      });

      expect(duplicates.length).toBeGreaterThanOrEqual(1);
      expect(duplicates[0].metadata?.questionId).toBe('ssc-chsl-2024-01jul-s1-q15');

      // Different questionId should not duplicate
      const noDuplicates = await communityService.findDuplicates({
        type: 'QUESTION_REPORT',
        questionId: 'ssc-chsl-2024-01jul-s1-q16',
      });
      expect(noDuplicates.length).toBe(0);
    });

    it('detects duplicate Paper Request by normalized examId, year, tier, and shift', async () => {
      await communityService.createPost({
        type: 'PAPER_REQUEST',
        title: 'Need SSC CHSL 2024 Tier 1 Shift 3',
        description: 'Please upload this paper',
        metadata: {
          examId: 'ssc-chsl',
          editionYear: 2024,
          tier: 'Tier 1',
          shift: 'Shift 3',
        },
        user: mockStudent,
      });

      // Exact match (case insensitive)
      const dupes = await communityService.findDuplicates({
        type: 'PAPER_REQUEST',
        examId: 'SSC-CHSL',
        editionYear: 2024,
        tier: 'tier 1',
        shift: 'shift 3',
      });

      expect(dupes.length).toBeGreaterThanOrEqual(1);
      expect(dupes[0].metadata?.editionYear).toBe(2024);

      // Different shift should not be considered duplicate
      const differentShift = await communityService.findDuplicates({
        type: 'PAPER_REQUEST',
        examId: 'ssc-chsl',
        editionYear: 2024,
        tier: 'Tier 1',
        shift: 'Shift 4',
      });
      expect(differentShift.length).toBe(0);
    });

    it('detects duplicate Feature Requests by keyword similarity', async () => {
      await communityService.createPost({
        type: 'FEATURE_REQUEST',
        title: 'Add dark mode theme toggle to test player',
        description: 'The test player should support dark mode.',
        user: mockStudent,
      });

      const dupes = await communityService.findDuplicates({
        type: 'FEATURE_REQUEST',
        title: 'Dark mode in player screen',
      });

      expect(dupes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Atomic Support & Vote System', () => {
    it('allows 1 vote per user, toggles correctly, and updates count atomically', async () => {
      const post = await communityService.createPost({
        type: 'PAPER_REQUEST',
        title: 'UPSC CSE Prelims 2024 GS Paper 1',
        description: 'Please add UPSC CSE Prelims 2024',
        user: mockStaff,
      });

      const initialCount = post.supportCount;

      // 1. Aarav supports the post
      const firstVote = await communityService.toggleSupport(post.id, mockStudent);
      expect(firstVote.supported).toBe(true);
      expect(firstVote.supportCount).toBe(initialCount + 1);

      // 2. Aarav clicks again -> toggles off (unsupported)
      const unvote = await communityService.toggleSupport(post.id, mockStudent);
      expect(unvote.supported).toBe(false);
      expect(unvote.supportCount).toBe(initialCount);

      // 3. Aarav clicks once more -> re-supported
      const revote = await communityService.toggleSupport(post.id, mockStudent);
      expect(revote.supported).toBe(true);
      expect(revote.supportCount).toBe(initialCount + 1);
    });
  });

  describe('Threaded Comments & Moderation', () => {
    it('creates threaded replies and nests them properly', async () => {
      const post = await communityService.createPost({
        type: 'DISCUSSION',
        title: 'How to prepare for Quantitative Aptitude?',
        description: 'Looking for advice on Algebra and Trigonometry.',
        user: mockStudent,
      });

      // Root comment by staff
      const rootComment = await communityService.createComment({
        postId: post.id,
        content: 'Focus on Previous Year Questions first.',
        user: mockStaff,
        isOfficial: true,
      });

      // Child reply to root comment
      const replyComment = await communityService.createComment({
        postId: post.id,
        parentCommentId: rootComment.id,
        content: 'Thank you Sir! Which years should I prioritize?',
        user: mockStudent,
      });

      const postWithComments = await communityService.getPostById(post.id, mockStudent.uid);
      expect(postWithComments).not.toBeNull();
      expect(postWithComments!.comments.length).toBe(1); // 1 root comment
      expect(postWithComments!.comments[0].replies?.length).toBe(1); // 1 child reply
      expect(postWithComments!.comments[0].replies![0].id).toBe(replyComment.id);
      expect(postWithComments!.comments[0].isOfficialResponse).toBe(true);
    });

    it('allows staff to update post status with resolution audit notes', async () => {
      vi.spyOn(staffService, 'staffUpdatePostStatus').mockResolvedValue({
        success: true,
        postId: 'post-id',
        status: 'RESOLVED',
        resolvedByName: mockStaff.fullName,
      });

      const post = await communityService.createPost({
        type: 'PAPER_REQUEST',
        title: 'GATE 2025 Data Science & AI Paper',
        description: 'Request for official GATE 2025 DA paper with solutions',
        user: mockStudent,
      });

      const success = await communityService.updatePostStatus(
        post.id,
        'RESOLVED',
        'Paper has been ingested and verified into canonical catalog under gate-2025-da.',
        mockStaff.fullName
      );

      expect(success).toBe(true);

      const refreshed = await communityService.getPostById(post.id);
      expect(refreshed?.post.status).toBe('RESOLVED');
      expect(refreshed?.post.resolutionNotes).toContain('gate-2025-da');
      expect(refreshed?.post.resolvedByName).toBe(mockStaff.fullName);
    });

    it('allows submitting content moderation reports', async () => {
      const post = await communityService.createPost({
        type: 'DISCUSSION',
        title: 'Report moderation test post',
        description: 'Post created specifically for moderation testing',
        user: mockStudent,
      });

      const success = await communityService.submitReport({
        targetType: 'POST',
        targetId: post.id,
        reason: 'SPAM',
        details: 'Self-promotion link in comments',
        user: mockStudent,
      });

      expect(success).toBe(true);
    });
  });

  describe('User Display Name Resolution (Privacy & Polish)', () => {
    it('returns student real name when valid', () => {
      expect(getCommunityDisplayName({ fullName: 'Shivaram Patel' })).toBe('Shivaram Patel');
      expect(getCommunityDisplayName({ fullName: 'Aarav Sharma', displayName: 'Aarav' })).toBe('Aarav');
    });

    it('falls back to "Mock.AI User" for "you", "me", "null", or empty', () => {
      expect(getCommunityDisplayName({ fullName: 'you' })).toBe('Mock.AI User');
      expect(getCommunityDisplayName({ fullName: 'YOU' })).toBe('Mock.AI User');
      expect(getCommunityDisplayName({ fullName: 'me' })).toBe('Mock.AI User');
      expect(getCommunityDisplayName({ fullName: 'Scholar (Guest)' })).toBe('Mock.AI User');
      expect(getCommunityDisplayName({ fullName: '' })).toBe('Mock.AI User');
      expect(getCommunityDisplayName(null)).toBe('Mock.AI User');
    });

    it('never exposes email address or internal UUID', () => {
      expect(getCommunityDisplayName({ fullName: 'shiva@example.com' })).toBe('Mock.AI User');
      expect(getCommunityDisplayName({ fullName: 'c9066661-ee23-455b-8086-4ef53fcb7496' })).toBe('Mock.AI User');
    });
  });

  describe('Custom Exam Normalization & Duplicate Detection', () => {
    it('normalizes custom exam names correctly', () => {
      expect(normalizeExamName('POLYCET')).toBe('polycet');
      expect(normalizeExamName('Poly CET')).toBe('polycet');
      expect(normalizeExamName('POLYCET - 2015')).toBe('polycet2015');
      expect(normalizeExamName(' TS  EAMCET ')).toBe('tseamcet');
    });

    it('creates custom exam paper request without creating fake canonical exam records', async () => {
      const post = await communityService.createPost({
        type: 'PAPER_REQUEST',
        title: 'POLYCET 2015 question paper missing',
        description: 'Need Andhra Pradesh POLYCET 2015 diploma entrance question paper.',
        user: { ...mockStudent, fullName: 'Shivaram Patel' },
        metadata: {
          isCustomExam: true,
          customExamName: 'POLYCET',
          customExamAuthority: 'Andhra Pradesh SBTET',
          isCustomYear: true,
          customYear: 2015,
          customStage: 'Single Stage',
          customSession: 'Morning',
        },
      });

      expect(post.authorName).toBe('Shivaram Patel');
      expect(post.customExamName).toBe('POLYCET');
      expect(post.customExamNormalized).toBe('polycet');
      expect(post.customExamAuthority).toBe('Andhra Pradesh SBTET');
      expect(post.customYear).toBe(2015);
      expect(post.customStage).toBe('Single Stage');
      expect(post.customSession).toBe('Morning');

      // Canonical examId must NOT be set to a fake string
      expect(post.metadata.examId).toBeUndefined();
      expect(post.metadata.editionYear).toBeUndefined();
    });

    it('detects duplicate custom exam requests across casing and spacing variations', async () => {
      // 1. Existing post created for POLYCET 2015
      await communityService.createPost({
        type: 'PAPER_REQUEST',
        title: 'POLYCET 2015 question paper missing',
        description: 'Need official POLYCET 2015 paper',
        user: mockStudent,
        metadata: {
          isCustomExam: true,
          customExamName: 'POLYCET',
          isCustomYear: true,
          customYear: 2015,
        },
      });

      // 2. Candidate 1: "Poly CET" 2015
      const dupes1 = await communityService.findDuplicates({
        type: 'PAPER_REQUEST',
        isCustomExam: true,
        customExamName: 'Poly CET',
        customYear: 2015,
      });
      expect(dupes1.length).toBeGreaterThanOrEqual(1);

      // 3. Candidate 2: "POLYCET - 2015"
      const dupes2 = await communityService.findDuplicates({
        type: 'PAPER_REQUEST',
        isCustomExam: true,
        customExamName: 'POLYCET - 2015',
        customYear: 2015,
      });
      expect(dupes2.length).toBeGreaterThanOrEqual(1);

      // 4. Candidate 3: Different year "POLYCET" 2020 should NOT duplicate
      const noDupes = await communityService.findDuplicates({
        type: 'PAPER_REQUEST',
        isCustomExam: true,
        customExamName: 'POLYCET',
        customYear: 2020,
      });
      expect(noDupes.length).toBe(0);
    });

    it('allows searching posts by custom exam name and authority', async () => {
      await communityService.createPost({
        type: 'PAPER_REQUEST',
        title: 'TS ECET 2018 Mechanical Question Paper',
        description: 'Need ECET diploma lateral entry exam question paper',
        user: mockStudent,
        metadata: {
          isCustomExam: true,
          customExamName: 'TS ECET',
          customExamAuthority: 'TSCHE Hyderabad',
          isCustomYear: true,
          customYear: 2018,
        },
      });

      const searchByName = await communityService.getPosts({ search: 'TS ECET' });
      expect(searchByName.posts.some((p) => p.customExamName === 'TS ECET')).toBe(true);

      const searchByAuthority = await communityService.getPosts({ search: 'TSCHE' });
      expect(searchByAuthority.posts.some((p) => p.customExamAuthority === 'TSCHE Hyderabad')).toBe(true);
    });
  });

  describe('Post Management: Edit, Delete & Authorization Enforcement', () => {
    const userA: UserProfile = {
      uid: 'user_author_aaa',
      fullName: 'Alice Walker',
      email: 'alice@example.com',
      role: 'STUDENT',
      createdAt: Date.now(),
    };

    const userB: UserProfile = {
      uid: 'user_malicious_bbb',
      fullName: 'Bob Smith',
      email: 'bob@example.com',
      role: 'STUDENT',
      createdAt: Date.now(),
    };

    const staffUser: UserProfile = {
      uid: 'staff_officer_sss',
      fullName: 'Staff Officer Karen',
      email: 'staff@mockai.org',
      role: 'TEACHER',
      createdAt: Date.now(),
    };

    it('allows author (User A) to edit their post and updates title, description, and isEdited flag', async () => {
      const post = await communityService.createPost({
        type: 'DISCUSSION',
        title: 'Original Title for Discussion',
        description: 'Original detailed description for the academic thread.',
        user: userA,
      });

      expect(post.isEdited).toBeFalsy();

      const updated = await communityService.updatePost({
        postId: post.id,
        title: 'Updated Title for Discussion',
        description: 'Updated detailed description with additional academic insights.',
        user: userA,
      });

      expect(updated.title).toBe('Updated Title for Discussion');
      expect(updated.description).toBe('Updated detailed description with additional academic insights.');
      expect(updated.isEdited).toBe(true);
      expect(updated.editedAt).toBeDefined();

      // System-controlled fields must NOT be tampered with
      expect(updated.authorId).toBe(userA.uid);
      expect(updated.authorRole).toBe('STUDENT');
      expect(updated.status).toBe('OPEN');
    });

    it('blocks other users (User B) from editing User A\'s post with permission error', async () => {
      const post = await communityService.createPost({
        type: 'PAPER_REQUEST',
        title: 'UPSC CSE 2024 Prelims General Studies',
        description: 'Need official UPSC CSE GS Paper 1 with answer keys.',
        user: userA,
      });

      await expect(
        communityService.updatePost({
          postId: post.id,
          title: 'Hacked Title by Malicious User',
          description: 'Hacked description by Malicious User trying to deface content.',
          user: userB,
        })
      ).rejects.toThrow("You don't have permission to edit this post.");

      // Verify post content in cache was untouched
      const fetched = await communityService.getPostById(post.id);
      expect(fetched?.post.title).toBe('UPSC CSE 2024 Prelims General Studies');
    });

    it('blocks unauthenticated callers from editing or deleting posts', async () => {
      const post = await communityService.createPost({
        type: 'DISCUSSION',
        title: 'Gate Math Strategy for 2025',
        description: 'Linear Algebra and Calculus focus points.',
        user: userA,
      });

      await expect(
        communityService.updatePost({
          postId: post.id,
          title: 'Anonymous Edit Attempt',
          description: 'Anonymous edit attempt description.',
          user: null,
        })
      ).rejects.toThrow('Please sign in to edit this post.');

      await expect(
        communityService.deletePost(post.id, null)
      ).rejects.toThrow('Please sign in to delete this post.');
    });

    it('allows author (User A) to soft-delete their post and hides it from listings', async () => {
      const post = await communityService.createPost({
        type: 'BUG_REPORT',
        title: 'Timer anomaly in Section B',
        description: 'Timer resets unexpectedly when switching questions.',
        user: userA,
      });

      const beforeDelete = await communityService.getPosts({ search: 'Timer anomaly' });
      expect(beforeDelete.posts.some((p) => p.id === post.id)).toBe(true);

      const deleted = await communityService.deletePost(post.id, userA);
      expect(deleted).toBe(true);

      // Must be filtered out of normal listings
      const afterDelete = await communityService.getPosts({ search: 'Timer anomaly' });
      expect(afterDelete.posts.some((p) => p.id === post.id)).toBe(false);

      // Direct getPostById should return null for soft-deleted post
      const single = await communityService.getPostById(post.id);
      expect(single).toBeNull();
    });

    it('blocks other users (User B) from deleting User A\'s post', async () => {
      const post = await communityService.createPost({
        type: 'FEATURE_REQUEST',
        title: 'Add LaTeX preview in formula editor',
        description: 'Preview LaTeX rendered output while typing questions.',
        user: userA,
      });

      await expect(
        communityService.deletePost(post.id, userB)
      ).rejects.toThrow("You don't have permission to delete this post.");

      // Post should still exist
      const fetched = await communityService.getPostById(post.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.post.id).toBe(post.id);
    });

    it('allows verified staff member to delete any user\'s post', async () => {
      vi.spyOn(staffService, 'checkIsStaff').mockResolvedValue(true);

      const post = await communityService.createPost({
        type: 'DISCUSSION',
        title: 'Inappropriate content requiring staff moderation',
        description: 'Spam or guideline violating text needing staff removal.',
        user: userA,
      });

      const deletedByStaff = await communityService.deletePost(post.id, staffUser);
      expect(deletedByStaff).toBe(true);

      const fetched = await communityService.getPostById(post.id);
      expect(fetched).toBeNull();
    });
  });

  describe('Staff Status Synchronization & Author Notifications', () => {
    it('synchronizes post status to RESOLVED and creates notification for the author', async () => {
      const author: UserProfile = {
        uid: 'user_author_777',
        fullName: 'Deepak Verma',
        email: 'deepak@example.com',
        role: 'STUDENT',
        createdAt: Date.now(),
      };

      const post = await communityService.createPost({
        type: 'PAPER_REQUEST',
        title: 'SSC CHSL 2024 Tier 1 Shift 2 paper missing',
        description: 'Please add the official answer key and paper for Shift 2.',
        user: author,
      });

      expect(post.status).toBe('OPEN');

      // Staff updates status to RESOLVED
      communityService.syncPostStatusLocally(
        post.id,
        'RESOLVED',
        'Official paper and answer key have been digitized and added.',
        'Mock.AI Team',
        'staff_reviewer_888'
      );

      // Verify post state updated locally
      const updated = await communityService.getPostById(post.id);
      expect(updated?.post.status).toBe('RESOLVED');
      expect(updated?.post.resolvedByName).toBe('Mock.AI Team');
      expect(updated?.post.resolutionNotes).toContain('Official paper and answer key');

      // Verify author received notification
      const notifs = await communityService.getUserNotifications(author.uid);
      expect(notifs).toHaveLength(1);
      expect(notifs[0].newStatus).toBe('RESOLVED');
      expect(notifs[0].title).toBe('Your report was resolved');
      expect(notifs[0].isRead).toBe(false);
    });

    it('prevents self-notification when acting staff member is the post author', async () => {
      const staffAuthor: UserProfile = {
        uid: 'staff_author_999',
        fullName: 'Prof. Mukherjee',
        email: 'mukherjee@mockai.org',
        role: 'TEACHER',
        createdAt: Date.now(),
      };

      const post = await communityService.createPost({
        type: 'QUESTION_REPORT',
        title: 'Formula formatting issue in Gate CS question',
        description: 'Equation rendering glitch.',
        user: staffAuthor,
      });

      // Staff updates their own post status
      communityService.syncPostStatusLocally(
        post.id,
        'RESOLVED',
        'Fixed by myself',
        'Prof. Mukherjee',
        'staff_author_999' // same acting user as author
      );

      // Verify NO self-notification was created
      const notifs = await communityService.getUserNotifications(staffAuthor.uid);
      expect(notifs).toHaveLength(0);
    });
  });
});



