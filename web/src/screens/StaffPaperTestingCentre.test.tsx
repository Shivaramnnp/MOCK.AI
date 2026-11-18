// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { StaffDashboardScreen } from './StaffDashboardScreen';
import { StaffPaperTestingCentre } from '../components/staff/StaffPaperTestingCentre';
import { ExamDetailScreen } from './ExamDetailScreen';
import { Navbar } from '../components/Navbar';
import { staffService } from '../services/staffService';
import { supabaseService } from '../services/supabase';
import { ExamService } from '../services/examService';
import { UserProfile, StaffPaperTestingSession } from '../types';

describe('Stage 1 — Staff Paper Testing Centre & Defect Logging Test Suite', () => {
  const verifiedStaffUser: UserProfile = {
    uid: 'staff_auditor_007',
    fullName: 'Senior Content Auditor',
    email: 'auditor@mock.ai',
    role: 'TEACHER' as any,
    createdAt: Date.now(),
  };

  const studentUser: UserProfile = {
    uid: 'student_user_123',
    fullName: 'Aspirant Student',
    email: 'student@example.com',
    role: 'STUDENT',
    createdAt: Date.now(),
  };

  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
    vi.restoreAllMocks();
    vi.spyOn(supabaseService, 'getClient').mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    window.location.hash = '';
  });

  describe('1. Security Boundary & Unauthorized Access Enforcement', () => {
    it('rejects student user with 403 Forbidden screen when accessing staff portal', async () => {
      vi.spyOn(staffService, 'getStaffAuthStatus').mockResolvedValue({
        isStaff: false,
        role: null,
        permissions: [],
      });

      render(<StaffDashboardScreen user={studentUser} onNavigate={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/403 forbidden/i)).toBeDefined();
        expect(screen.queryByText(/paper testing centre/i)).toBeNull();
      });
    });

    it('denies non-staff user from reporting defects in staffService', async () => {
      vi.spyOn(staffService, 'getStaffAuthStatus').mockResolvedValue({
        isStaff: false,
        role: null,
        permissions: [],
      });

      const res = await staffService.reportQuestionDefect({
        paperId: 'ssc-chsl-2019-01jul-s3',
        questionId: 'ssc-chsl-2019-01jul-s3-q1',
        questionNumber: 1,
        staffId: studentUser.uid,
        defectCategory: 'INCORRECT_ANSWER_KEY',
        defectDescription: 'Attempted defect report by unverified student.',
        questionSnapshot: {},
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Unauthorized');
      expect(res.defect).toBeUndefined();
    });
  });

  describe('2. Paper Testing Dashboard & Navigation for Authorized Staff', () => {
    beforeEach(() => {
      vi.spyOn(staffService, 'getStaffAuthStatus').mockResolvedValue({
        isStaff: true,
        role: 'ADMIN',
        permissions: ['can_manage_content', 'can_review_reports'],
      });
    });

    it('renders "Paper Testing Centre" tab in Staff Dashboard', async () => {
      render(<StaffDashboardScreen user={verifiedStaffUser} onNavigate={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /paper testing centre/i })).toBeDefined();
      });
    });

    it('lists available papers with total questions, tested questions, and defect counts', async () => {
      render(<StaffPaperTestingCentre user={verifiedStaffUser} />);

      await waitFor(() => {
        expect(screen.getByText(/total papers/i)).toBeDefined();
        expect(screen.getByPlaceholderText(/search papers by name/i)).toBeDefined();
      });

      // SSC CHSL 2019 paper is listed
      expect(await screen.findByText(/01 Jul 2019/i)).toBeDefined();
    });

    it('filters paper list by search query', async () => {
      render(<StaffPaperTestingCentre user={verifiedStaffUser} />);

      const searchInput = await screen.findByPlaceholderText(/search papers by name/i);
      fireEvent.change(searchInput, { target: { value: '2019' } });

      await waitFor(() => {
        expect(screen.getByText(/01 Jul 2019/i)).toBeDefined();
      });
    });

    it('clicking Paper Testing Centre tab opens the component', async () => {
      render(<StaffDashboardScreen user={verifiedStaffUser} onNavigate={vi.fn()} />);

      const tabBtn = await screen.findByRole('button', { name: /paper testing centre/i });
      fireEvent.click(tabBtn);

      await waitFor(() => {
        expect(screen.getByText(/total papers/i)).toBeDefined();
        expect(screen.getByPlaceholderText(/search papers by name/i)).toBeDefined();
      });
    });

    it('renders Staff Portal button in Navbar for staff user and hides it for student', () => {
      const { unmount } = render(
        <Navbar
          currentRoute="home"
          onNavigate={vi.fn()}
          streakCount={3}
          userRole="LEARNER"
          isDark={false}
          onToggleTheme={vi.fn()}
          onOpenCreateModal={vi.fn()}
          isStaff={true}
        />
      );

      expect(screen.getByRole('button', { name: /staff portal/i })).toBeDefined();
      unmount();

      render(
        <Navbar
          currentRoute="home"
          onNavigate={vi.fn()}
          streakCount={3}
          userRole="STUDENT"
          isDark={false}
          onToggleTheme={vi.fn()}
          onOpenCreateModal={vi.fn()}
          isStaff={false}
        />
      );

      expect(screen.queryByRole('button', { name: /staff portal/i })).toBeNull();
    });
  });

  describe('3. Question Review Interface & Defect Logging', () => {
    beforeEach(() => {
      vi.spyOn(staffService, 'getStaffAuthStatus').mockResolvedValue({
        isStaff: true,
        role: 'ADMIN',
        permissions: ['can_manage_content'],
      });
    });

    it('opens a paper testing session and renders question stem and official answer key', async () => {
      render(<StaffPaperTestingCentre user={verifiedStaffUser} />);

      // Find and click "Start Testing" or "Resume Testing"
      const startBtns = await screen.findAllByRole('button', { name: /testing/i });
      fireEvent.click(startBtns[0]);

      // Question view rendered
      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
        expect(screen.getAllByText(/official answer key/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByRole('button', { name: /pass/i })).toBeDefined();
        expect(screen.getByRole('button', { name: /needs review/i })).toBeDefined();
        expect(screen.getByRole('button', { name: /report defect/i })).toBeDefined();
      });
    });

    it('records a PASS verdict on question and advances progress', async () => {
      render(<StaffPaperTestingCentre user={verifiedStaffUser} />);

      const startBtns = await screen.findAllByRole('button', { name: /testing/i });
      fireEvent.click(startBtns[0]);

      const passBtn = await screen.findByRole('button', { name: /pass/i });
      fireEvent.click(passBtn);

      await waitFor(() => {
        // Advanced to Question 2
        expect(screen.getByText(/question 2 of/i)).toBeDefined();
      });
    });

    it('reports a defect with category, evidence reference, and preserves question snapshot', async () => {
      render(<StaffPaperTestingCentre user={verifiedStaffUser} />);

      const startBtns = await screen.findAllByRole('button', { name: /testing/i });
      fireEvent.click(startBtns[0]);

      // Click Report Defect button to open form
      const reportDefectBtn = await screen.findByRole('button', { name: /report defect/i });
      fireEvent.click(reportDefectBtn);

      // Defect form inputs
      const descInput = await screen.findByPlaceholderText(/detail the exact defect/i);
      const evidenceInput = screen.getByPlaceholderText(/candidate sheet page/i);
      const notesInput = screen.getByPlaceholderText(/private notes/i);

      fireEvent.change(descInput, { target: { value: 'Formula rendering truncated in option B.' } });
      fireEvent.change(evidenceReferenceInput(screen) || evidenceInput, {
        target: { value: 'Official TCS Response Sheet Page 16' },
      });
      fireEvent.change(notesInput, { target: { value: 'Requires LaTeX fraction wrapper.' } });

      const submitBtn = screen.getByRole('button', { name: /submit defect report/i });
      fireEvent.click(submitBtn);

      // Automatically advances to Question 2 upon successful defect logging
      await waitFor(() => {
        expect(screen.getByText(/question 2 of/i)).toBeDefined();
      });

      // Navigate back to Question 1 to verify persisted verdict and defect card
      const prevBtn = screen.getAllByRole('button', { name: /previous question/i })[0];
      fireEvent.click(prevBtn);

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
        expect(screen.getByText(/active defect\(s\) logged/i)).toBeDefined();
        expect(screen.getByText(/Formula rendering truncated in option B/i)).toBeDefined();
        expect(screen.getByText(/local draft \(pending sync\)/i)).toBeDefined();
      });

      // Verify defect persistence in local storage
      const savedDefects = staffService.getAllLocalDefects();
      expect(savedDefects.length).toBe(1);
      expect(savedDefects[0].defectDescription).toBe('Formula rendering truncated in option B.');
      expect(savedDefects[0].evidenceReference).toBe('Official TCS Response Sheet Page 16');
      expect(savedDefects[0].status).toBe('reported');
      expect(savedDefects[0].storageBackend).toBe('local_only');
      expect(savedDefects[0].isPendingSync).toBe(true);
      expect(savedDefects[0].questionSnapshot).toBeDefined();
      expect(savedDefects[0].questionFingerprint).toMatch(/^fp_/);
    });

    it('does not count question as completed if session saving fails', async () => {
      render(<StaffPaperTestingCentre user={verifiedStaffUser} />);
      const startBtns = await screen.findAllByRole('button', { name: /testing/i });
      fireEvent.click(startBtns[0]);

      await screen.findByRole('button', { name: /pass/i });
      vi.spyOn(staffService, 'savePaperTestingProgress').mockResolvedValue(false);

      const passBtn = screen.getByRole('button', { name: /pass/i });
      fireEvent.click(passBtn);

      await waitFor(() => {
        expect(screen.getByText(/failed to persist session review progress/i)).toBeDefined();
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });
    });

    it('prevents duplicate defect submissions for the same category on the same question', async () => {
      const qSnap = { questionText: 'Sample Q', options: ['A', 'B', 'C', 'D'], correctAnswer: 'A' };

      // First submission
      const firstRes = await staffService.reportQuestionDefect({
        paperId: 'ssc-chsl-2019-01jul-s3',
        questionId: 'ssc-chsl-2019-01jul-s3-q1',
        questionNumber: 1,
        staffId: verifiedStaffUser.uid,
        defectCategory: 'CORRUPTED_LANGUAGE_OR_TEXT',
        defectDescription: 'Mojibake characters detected in stem.',
        questionSnapshot: qSnap,
      });
      expect(firstRes.success).toBe(true);

      // Duplicate submission attempt
      const dupRes = await staffService.reportQuestionDefect({
        paperId: 'ssc-chsl-2019-01jul-s3',
        questionId: 'ssc-chsl-2019-01jul-s3-q1',
        questionNumber: 1,
        staffId: verifiedStaffUser.uid,
        defectCategory: 'CORRUPTED_LANGUAGE_OR_TEXT',
        defectDescription: 'Accidental second click with identical category.',
        questionSnapshot: qSnap,
      });

      expect(dupRes.success).toBe(false);
      expect(dupRes.error).toContain('already logged on this question');
    });

    it('allows reporting new defect after earlier defect was resolved/approved', async () => {
      const qSnap = { questionText: 'Sample Q', options: ['A', 'B', 'C', 'D'], correctAnswer: 'A' };

      // Manually simulate an existing closed/approved defect in local storage
      const LOCAL_DEFECTS_KEY = 'mockai_staff_question_defects';
      const existingClosed = {
        defectId: 'defect_ssc-chsl-2019-01jul-s3_q2_12345',
        paperId: 'ssc-chsl-2019-01jul-s3',
        questionId: 'ssc-chsl-2019-01jul-s3-q2',
        questionNumber: 2,
        reportingStaffId: verifiedStaffUser.uid,
        defectCategory: 'CORRUPTED_LANGUAGE_OR_TEXT',
        defectDescription: 'Previous corrupted text was fixed and approved.',
        questionSnapshot: qSnap,
        questionFingerprint: 'fp_123',
        status: 'approved',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(LOCAL_DEFECTS_KEY, JSON.stringify([existingClosed]));

      // New defect submission for question 2 with same category should succeed because previous is approved
      const newRes = await staffService.reportQuestionDefect({
        paperId: 'ssc-chsl-2019-01jul-s3',
        questionId: 'ssc-chsl-2019-01jul-s3-q2',
        questionNumber: 2,
        staffId: verifiedStaffUser.uid,
        defectCategory: 'CORRUPTED_LANGUAGE_OR_TEXT',
        defectDescription: 'Subsequent new defect found after previous fix.',
        questionSnapshot: qSnap,
      });

      expect(newRes.success).toBe(true);
      expect(newRes.defect?.defectId).toBeDefined();
    });

    it('rejects defect reporting with empty description', async () => {
      const res = await staffService.reportQuestionDefect({
        paperId: 'ssc-chsl-2019-01jul-s3',
        questionId: 'ssc-chsl-2019-01jul-s3-q1',
        questionNumber: 1,
        staffId: verifiedStaffUser.uid,
        defectCategory: 'OTHER',
        defectDescription: '   ',
        questionSnapshot: {},
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('description is required');
    });

    it('does not persist to local drafts when database RPC explicitly rejects with 403 Forbidden', async () => {
      const mockClient = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '42501', message: '403 Forbidden: Caller lacks verified staff permissions.' },
        }),
        from: vi.fn(),
      } as any;
      vi.spyOn(supabaseService, 'getClient').mockReturnValue(mockClient);

      const res = await staffService.reportQuestionDefect({
        paperId: 'ssc-chsl-2019-01jul-s3',
        questionId: 'ssc-chsl-2019-01jul-s3-q3',
        questionNumber: 3,
        staffId: verifiedStaffUser.uid,
        defectCategory: 'OTHER',
        defectDescription: 'Attempted defect report that fails DB authorization check.',
        questionSnapshot: {},
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Unauthorized');
      // Verify nothing was saved into local storage
      const localDefects = staffService.getAllLocalDefects();
      expect(localDefects.find((d) => d.questionId === 'ssc-chsl-2019-01jul-s3-q3')).toBeUndefined();
    });

    it('does not persist to local drafts when database RPC reports a duplicate constraint violation', async () => {
      const mockClient = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint' },
        }),
        from: vi.fn(),
      } as any;
      vi.spyOn(supabaseService, 'getClient').mockReturnValue(mockClient);

      const res = await staffService.reportQuestionDefect({
        paperId: 'ssc-chsl-2019-01jul-s3',
        questionId: 'ssc-chsl-2019-01jul-s3-q4',
        questionNumber: 4,
        staffId: verifiedStaffUser.uid,
        defectCategory: 'OTHER',
        defectDescription: 'Attempted duplicate defect report that DB rejected.',
        questionSnapshot: {},
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('already logged on this question');
      // Verify nothing was saved into local storage
      const localDefects = staffService.getAllLocalDefects();
      expect(localDefects.find((d) => d.questionId === 'ssc-chsl-2019-01jul-s3-q4')).toBeUndefined();
    });

    it('persists testing session across refresh/reloads', async () => {
      const initialSession = await staffService.getPaperTestingSession('ssc-chsl-2019-01jul-s3', verifiedStaffUser.uid);
      initialSession.currentQuestionIndex = 14;
      initialSession.testedCount = 5;
      initialSession.status = 'IN_PROGRESS';

      await staffService.savePaperTestingProgress(initialSession);

      // Re-fetch (simulates page reload)
      const restoredSession = await staffService.getPaperTestingSession('ssc-chsl-2019-01jul-s3', verifiedStaffUser.uid);
      expect(restoredSession.currentQuestionIndex).toBe(14);
      expect(restoredSession.testedCount).toBe(5);
      expect(restoredSession.status).toBe('IN_PROGRESS');
    });
  });

  describe('4. Dedicated Staff Testing Navigation vs Student Exam Player Isolation', () => {
    beforeEach(() => {
      vi.spyOn(staffService, 'getStaffAuthStatus').mockResolvedValue({
        isStaff: true,
        role: 'ADMIN',
        permissions: ['can_manage_content', 'can_review_reports'],
      });
      window.location.hash = '';
    });

    it('selecting a paper opens staff testing mode and never renders student timer or Submit Examination', async () => {
      render(<StaffPaperTestingCentre user={verifiedStaffUser} />);

      const startBtns = await screen.findAllByRole('button', { name: /testing/i });
      fireEvent.click(startBtns[0]);

      await waitFor(() => {
        // Staff testing mode is rendered
        expect(screen.getByText(/back to paper testing centre/i)).toBeDefined();
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
        expect(screen.getByRole('button', { name: /pass/i })).toBeDefined();
        expect(screen.getByRole('button', { name: /report defect/i })).toBeDefined();
      });

      // Strict assertions: Student exam player controls MUST NOT exist
      expect(screen.queryByText(/time left/i)).toBeNull();
      expect(screen.queryByRole('button', { name: /submit examination/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /save & next/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /clear response/i })).toBeNull();

      // Verify no student exam session was created in ExamService
      const studentSession = ExamService.getActiveSession('ssc-chsl-2019-01jul-s3');
      expect(studentSession).toBeNull();
    });

    it('supports direct hash navigation (#staff#paper-testing#<paperId>) directly opening staff review mode', async () => {
      window.location.hash = '#staff#paper-testing#ssc-chsl-2019-01jul-s3';

      render(<StaffPaperTestingCentre user={verifiedStaffUser} />);

      await waitFor(() => {
        expect(screen.getByText(/back to paper testing centre/i)).toBeDefined();
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
        expect(screen.getAllByText(/official answer key/i).length).toBeGreaterThanOrEqual(1);
      });

      // Student timer and submit buttons remain absent
      expect(screen.queryByText(/time left/i)).toBeNull();
      expect(screen.queryByRole('button', { name: /submit examination/i })).toBeNull();
    });

    it('allows navigating between questions in staff testing mode and returning back to paper list', async () => {
      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });

      // Navigate to next question
      const nextBtn = screen.getAllByRole('button', { name: /next question/i })[0];
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText(/question 2 of/i)).toBeDefined();
      });

      // Click "Back to Paper Testing Centre"
      const backBtn = screen.getByRole('button', { name: /back to paper testing centre/i });
      fireEvent.click(backBtn);

      await waitFor(() => {
        expect(screen.getByText(/total papers/i)).toBeDefined();
        expect(screen.getByPlaceholderText(/search papers by name/i)).toBeDefined();
      });
    });

    it('opens directly to paper testing when StaffDashboardScreen receives initialPaperId', async () => {
      render(
        <StaffDashboardScreen
          user={verifiedStaffUser}
          onNavigate={vi.fn()}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/back to paper testing centre/i)).toBeDefined();
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });
      expect(screen.queryByText(/time left/i)).toBeNull();
      expect(screen.queryByRole('button', { name: /submit examination/i })).toBeNull();
    });

    it('renders "Staff Testing Mode" in ExamDetailScreen for staff, routing to staff testing without launching student player', async () => {
      const mockOnStaffTestPaper = vi.fn();
      const mockOnStartPaper = vi.fn();

      render(
        <ExamDetailScreen
          examId="ssc-chsl"
          onBack={vi.fn()}
          onStartPaper={mockOnStartPaper}
          isStaff={true}
          onStaffTestPaper={mockOnStaffTestPaper}
        />
      );

      const staffTestBtns = await screen.findAllByRole('button', { name: /staff testing mode/i });
      expect(staffTestBtns.length).toBeGreaterThan(0);

      // Clicking Staff Testing Mode triggers staff handler, NOT student onStartPaper
      fireEvent.click(staffTestBtns[0]);
      expect(mockOnStaffTestPaper).toHaveBeenCalledTimes(1);
      expect(mockOnStartPaper).not.toHaveBeenCalled();
    });

    it('hides "Staff Testing Mode" in ExamDetailScreen for ordinary student users and preserves student simulation', async () => {
      const mockOnStartPaper = vi.fn();

      render(
        <ExamDetailScreen
          examId="ssc-chsl"
          onBack={vi.fn()}
          onStartPaper={mockOnStartPaper}
          isStaff={false}
        />
      );

      // Staff testing button is hidden for student
      expect(screen.queryByRole('button', { name: /staff testing mode/i })).toBeNull();

      // Student Start Simulation button is present and works unchanged
      const simBtns = await screen.findAllByRole('button', { name: /start simulation|resume exam/i });
      expect(simBtns.length).toBeGreaterThan(0);
      fireEvent.click(simBtns[0]);
      expect(mockOnStartPaper).toHaveBeenCalledTimes(1);
    });
  });

  describe('5. Question Navigation, Auto-Advance, Keyboard Support & Final Question Completion', () => {
    it('records a NEEDS_REVIEW verdict and automatically advances to the next question', async () => {
      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });

      const reviewBtn = screen.getByRole('button', { name: /needs review/i });
      fireEvent.click(reviewBtn);

      // Auto-advances to Question 2
      await waitFor(() => {
        expect(screen.getByText(/question 2 of/i)).toBeDefined();
      });

      // Revisit Question 1 to verify persisted verdict and badge
      const prevBtn = screen.getAllByRole('button', { name: /previous question/i })[0];
      fireEvent.click(prevBtn);

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
        expect(screen.getByText(/needs_review/i)).toBeDefined();
      });
    });

    it('does not advance if verdict saving fails and displays an actionable error', async () => {
      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });

      vi.spyOn(staffService, 'savePaperTestingProgress').mockResolvedValue(false);

      const reviewBtn = screen.getByRole('button', { name: /needs review/i });
      fireEvent.click(reviewBtn);

      await waitFor(() => {
        expect(screen.getByText(/failed to persist session review progress/i)).toBeDefined();
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });
    });

    it('disables Previous Question on first question and Next Question on final question', async () => {
      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });

      // First question: Previous Question is disabled, Next Question is enabled
      const prevBtns = screen.getAllByRole('button', { name: /previous question/i });
      const nextBtns = screen.getAllByRole('button', { name: /next question/i });

      expect((prevBtns[0] as HTMLButtonElement).disabled).toBe(true);
      expect((nextBtns[0] as HTMLButtonElement).disabled).toBe(false);

      // Advance to Question 2: Previous Question becomes enabled
      fireEvent.click(nextBtns[0]);
      await waitFor(() => {
        expect(screen.getByText(/question 2 of/i)).toBeDefined();
      });

      expect((prevBtns[0] as HTMLButtonElement).disabled).toBe(false);

      // Navigate to final question (index 99 for SSC CHSL paper with 100 questions)
      const paletteBtn100 = screen.getByRole('button', { name: '100' });
      fireEvent.click(paletteBtn100);

      await waitFor(() => {
        expect(screen.getByText(/question 100 of 100/i)).toBeDefined();
      });

      expect((nextBtns[0] as HTMLButtonElement).disabled).toBe(true);
      expect((prevBtns[0] as HTMLButtonElement).disabled).toBe(false);
    });

    it('navigates with Left and Right arrow keys when not typing', async () => {
      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });

      // Pressing Left Arrow on question 1 does not error and stays on Q1
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByText(/question 1 of/i)).toBeDefined();

      // Pressing Right Arrow advances to Question 2
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      await waitFor(() => {
        expect(screen.getByText(/question 2 of/i)).toBeDefined();
      });

      // Pressing Left Arrow returns to Question 1
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });
    });

    it('ignores arrow keys when user is typing in an input or textarea', async () => {
      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });

      // Open defect form and focus textarea
      const reportDefectBtn = screen.getByRole('button', { name: /report defect/i });
      fireEvent.click(reportDefectBtn);

      const descTextarea = await screen.findByPlaceholderText(/detail the exact defect/i);
      descTextarea.focus();

      // Arrow keys while typing inside textarea must not trigger question navigation
      fireEvent.keyDown(descTextarea, { key: 'ArrowRight' });
      expect(screen.getByText(/question 1 of/i)).toBeDefined();

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText(/question 1 of/i)).toBeDefined();
    });

    it('protects unsaved defect notes and prompts before navigating away', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm');

      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });

      // Open defect form and type notes
      const reportDefectBtn = screen.getByRole('button', { name: /report defect/i });
      fireEvent.click(reportDefectBtn);

      const descTextarea = await screen.findByPlaceholderText(/detail the exact defect/i);
      fireEvent.change(descTextarea, { target: { value: 'Draft defect description that is unsaved.' } });

      // Staff member tries to navigate to Question 2 but cancels confirmation
      confirmSpy.mockReturnValueOnce(false);
      const nextBtn = screen.getAllByRole('button', { name: /next question/i })[0];
      fireEvent.click(nextBtn);

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      // Stays on Question 1 and defect form is preserved
      expect(screen.getByText(/question 1 of/i)).toBeDefined();
      expect((descTextarea as HTMLTextAreaElement).value).toBe('Draft defect description that is unsaved.');

      // Staff member tries again and confirms navigation
      confirmSpy.mockReturnValueOnce(true);
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText(/question 2 of/i)).toBeDefined();
      });
    });

    it('displays the completion banner when all questions have been reviewed', async () => {
      // Pre-populate a session where all 100 questions are tested
      const allReviewedSession: StaffPaperTestingSession = {
        sessionId: 'session_ssc-chsl-2019-01jul-s3_staff_test',
        paperId: 'ssc-chsl-2019-01jul-s3',
        paperName: 'SSC CHSL 2019 Paper',
        examId: 'ssc-chsl',
        staffId: verifiedStaffUser.uid,
        currentQuestionIndex: 99,
        totalQuestions: 100,
        testedCount: 100,
        defectsCount: 1,
        status: 'COMPLETED',
        questionReviews: {},
        testedQuestionIds: Array.from({ length: 100 }, (_, i) => `q_${i + 1}`),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(staffService, 'getPaperTestingSession').mockResolvedValue(allReviewedSession);

      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('paper-audit-completed-banner')).toBeDefined();
        expect(screen.getByText(/paper verification completed/i)).toBeDefined();
        expect(screen.getByText(/all 100 questions in this paper have been reviewed/i)).toBeDefined();
      });
    });

    it('prevents duplicate submissions and ignores rapid navigation during saving', async () => {
      let resolveSave: (val: boolean) => void = () => {};
      const delayedSavePromise = new Promise<boolean>((resolve) => {
        resolveSave = resolve;
      });

      const saveSpy = vi.spyOn(staffService, 'savePaperTestingProgress').mockReturnValue(delayedSavePromise);

      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });

      const passBtn = screen.getByRole('button', { name: /pass/i });
      fireEvent.click(passBtn);

      // Second immediate click while save is pending
      fireEvent.click(passBtn);
      // Arrow keys pressed while save is pending
      fireEvent.keyDown(window, { key: 'ArrowRight' });

      expect(saveSpy).toHaveBeenCalledTimes(1);

      // Now resolve the pending save
      resolveSave(true);

      await waitFor(() => {
        expect(screen.getByText(/question 2 of/i)).toBeDefined();
      });

      // Still only called once (no duplicate calls)
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    it('displays the keyboard shortcut hint near the verdict panel', async () => {
      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('keyboard-shortcuts-hint')).toBeDefined();
        expect(screen.getByText(/Space = Pass \| N = Needs Review \| M = Report Defect/i)).toBeDefined();
        expect(screen.getByText(/← Previous \| → Next/i)).toBeDefined();
      });
    });

    it('triggers PASS verdict and auto-advances when Space key is pressed', async () => {
      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });

      // Press Space to mark Pass
      fireEvent.keyDown(window, { key: ' ', code: 'Space' });

      // Automatically advances to Question 2
      await waitFor(() => {
        expect(screen.getByText(/question 2 of/i)).toBeDefined();
      });

      // Verify verdict on Question 1 was persisted as PASS
      const prevBtn = screen.getAllByRole('button', { name: /previous question/i })[0];
      fireEvent.click(prevBtn);

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
        expect(screen.getByText('PASS')).toBeDefined();
      });
    });

    it('triggers NEEDS_REVIEW verdict and auto-advances when N key is pressed', async () => {
      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });

      // Press 'n' to mark Needs Review
      fireEvent.keyDown(window, { key: 'n' });

      // Automatically advances to Question 2
      await waitFor(() => {
        expect(screen.getByText(/question 2 of/i)).toBeDefined();
      });

      // Revisit Question 1 to verify persisted verdict
      const prevBtn = screen.getAllByRole('button', { name: /previous question/i })[0];
      fireEvent.click(prevBtn);

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
        expect(screen.getByText(/needs_review/i)).toBeDefined();
      });
    });

    it('opens defect reporting form when M key is pressed', async () => {
      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });

      // Press 'm' to open defect report
      fireEvent.keyDown(window, { key: 'm' });

      await waitFor(() => {
        expect(screen.getByText(/log question defect/i)).toBeDefined();
        expect(screen.getByPlaceholderText(/detail the exact defect/i)).toBeDefined();
      });
    });

    it('displays error and remains on current question when Space verdict saving fails', async () => {
      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });

      vi.spyOn(staffService, 'savePaperTestingProgress').mockResolvedValue(false);

      // Press Space
      fireEvent.keyDown(window, { key: ' ', code: 'Space' });

      await waitFor(() => {
        expect(screen.getByText(/failed to persist session review progress/i)).toBeDefined();
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });
    });

    it('ignores Space, N, M, and arrows when modifier keys (Ctrl/Cmd/Alt) are pressed', async () => {
      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });

      // Ctrl+N or Cmd+M or Alt+ArrowRight
      fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
      fireEvent.keyDown(window, { key: 'm', metaKey: true });
      fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true });

      // Stays on Question 1, defect panel NOT opened
      expect(screen.getByText(/question 1 of/i)).toBeDefined();
      expect(screen.queryByText(/log question defect/i)).toBeNull();
    });

    it('ignores repeated keydown events (e.repeat) from holding down keys', async () => {
      const saveSpy = vi.spyOn(staffService, 'savePaperTestingProgress');

      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });

      // First initial press
      fireEvent.keyDown(window, { key: ' ', code: 'Space' });
      // Subsequent repeated events from holding down Space
      fireEvent.keyDown(window, { key: ' ', code: 'Space', repeat: true });
      fireEvent.keyDown(window, { key: ' ', code: 'Space', repeat: true });

      await waitFor(() => {
        expect(screen.getByText(/question 2 of/i)).toBeDefined();
      });

      expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    it('ignores Space, N, and M shortcuts while defect panel is open', async () => {
      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
      });

      // Open defect form
      fireEvent.keyDown(window, { key: 'm' });
      await screen.findByText(/log question defect/i);

      // Press Space and N while defect form is open
      fireEvent.keyDown(window, { key: ' ' });
      fireEvent.keyDown(window, { key: 'n' });

      // Form remains open and did not advance or change verdict
      expect(screen.getByText(/question 1 of/i)).toBeDefined();
      expect(screen.getByText(/log question defect/i)).toBeDefined();
    });
  });

  describe('6. Return to Dashboard Logic and Hash Synchronization', () => {
    beforeEach(() => {
      vi.spyOn(staffService, 'getStaffAuthStatus').mockResolvedValue({
        isStaff: true,
        role: 'ADMIN',
        permissions: ['can_manage_content', 'can_review_reports'],
      });
    });

    it('clicking "Return to Dashboard" in completion banner closes review mode, triggers onReturnToDashboard, and shows dashboard metrics', async () => {
      const allReviewedSession: StaffPaperTestingSession = {
        sessionId: 'session_ssc-chsl-2019-01jul-s3_staff_test',
        paperId: 'ssc-chsl-2019-01jul-s3',
        paperName: 'SSC CHSL 2019 Paper',
        examId: 'ssc-chsl',
        staffId: verifiedStaffUser.uid,
        currentQuestionIndex: 99,
        totalQuestions: 100,
        testedCount: 100,
        defectsCount: 19,
        status: 'COMPLETED',
        questionReviews: {},
        testedQuestionIds: Array.from({ length: 100 }, (_, i) => `q_${i + 1}`),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(staffService, 'getPaperTestingSession').mockResolvedValue(allReviewedSession);
      const onReturnMock = vi.fn();
      const onNavigateMock = vi.fn();

      render(
        <StaffPaperTestingCentre
          user={verifiedStaffUser}
          initialPaperId="ssc-chsl-2019-01jul-s3"
          onReturnToDashboard={onReturnMock}
          onNavigateToPaper={onNavigateMock}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('paper-audit-completed-banner')).toBeDefined();
        expect(screen.getByText(/paper verification completed/i)).toBeDefined();
      });

      const returnBtn = screen.getByRole('button', { name: /return to dashboard/i });
      fireEvent.click(returnBtn);

      await waitFor(() => {
        expect(screen.getByText(/total papers/i)).toBeDefined();
        expect(screen.getByText(/total defects/i)).toBeDefined();
        expect(screen.getByPlaceholderText(/search papers by name/i)).toBeDefined();
        expect(screen.queryByTestId('paper-audit-completed-banner')).toBeNull();
      });

      expect(onReturnMock).toHaveBeenCalledTimes(1);
      expect(onNavigateMock).toHaveBeenCalledWith(null);
      expect(window.location.hash).toBe('#staff#paper-testing');
    });

    it('clicking "Return to Dashboard" inside StaffDashboardScreen returns to dashboard and does not re-open review view', async () => {
      const allReviewedSession: StaffPaperTestingSession = {
        sessionId: 'session_ssc-chsl-2019-02jul-s1_staff_test',
        paperId: 'ssc-chsl-2019-02jul-s1',
        paperName: 'SSC CHSL 2019 Paper 02 Jul S1',
        examId: 'ssc-chsl',
        staffId: verifiedStaffUser.uid,
        currentQuestionIndex: 99,
        totalQuestions: 100,
        testedCount: 100,
        defectsCount: 19,
        status: 'COMPLETED',
        questionReviews: {},
        testedQuestionIds: Array.from({ length: 100 }, (_, i) => `q_${i + 1}`),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(staffService, 'getPaperTestingSession').mockResolvedValue(allReviewedSession);
      const onNavigatePaperMock = vi.fn();

      render(
        <StaffDashboardScreen
          user={verifiedStaffUser}
          onNavigate={vi.fn()}
          onNavigateToPaper={onNavigatePaperMock}
          initialPaperId="ssc-chsl-2019-02jul-s1"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('paper-audit-completed-banner')).toBeDefined();
        expect(screen.getByText(/paper verification completed/i)).toBeDefined();
      });

      const returnBtn = screen.getByRole('button', { name: /return to dashboard/i });
      fireEvent.click(returnBtn);

      await waitFor(() => {
        expect(screen.getByText(/total papers/i)).toBeDefined();
        expect(screen.getByText(/total defects/i)).toBeDefined();
        expect(screen.queryByTestId('paper-audit-completed-banner')).toBeNull();
      });

      expect(onNavigatePaperMock).toHaveBeenCalledWith(null);
      expect(window.location.hash).toBe('#staff#paper-testing');

      // Subsequent click on "Resume Testing" / "Start Testing" opens paper cleanly
      const resumeButtons = screen.getAllByRole('button', { name: /resume testing|start testing/i });
      expect(resumeButtons.length).toBeGreaterThan(0);
      fireEvent.click(resumeButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/question \d+ of/i)).toBeDefined();
      });
    });

    it('clicking top "Back to Paper Testing Centre" inside StaffDashboardScreen returns to paper list cleanly', async () => {
      render(
        <StaffDashboardScreen
          user={verifiedStaffUser}
          onNavigate={vi.fn()}
          initialPaperId="ssc-chsl-2019-01jul-s3"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/question 1 of/i)).toBeDefined();
        expect(screen.getByRole('button', { name: /back to paper testing centre/i })).toBeDefined();
      });

      const backBtn = screen.getByRole('button', { name: /back to paper testing centre/i });
      fireEvent.click(backBtn);

      await waitFor(() => {
        expect(screen.getByText(/total papers/i)).toBeDefined();
        expect(screen.getByPlaceholderText(/search papers by name/i)).toBeDefined();
        expect(screen.queryByText(/question 1 of/i)).toBeNull();
      });

      expect(window.location.hash).toBe('#staff#paper-testing');
    });
  });
});

function evidenceReferenceInput(s: any) {
  try {
    return s.getByPlaceholderText(/candidate sheet page/i);
  } catch {
    return null;
  }
}
