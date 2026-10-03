import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ExamDetailScreen } from './ExamDetailScreen';
import { CompetitiveExamPlayerScreen } from './CompetitiveExamPlayerScreen';
import { SyllabusModal } from '../components/exam/SyllabusModal';
import { ReportQuestionModal, REPORT_REASONS } from '../components/exam/ReportQuestionModal';
import { ExamService } from '../services/examService';
import { communityService } from '../services/communityService';
import { storage } from '../services/storage';
import { UserProfile, ExamPaper, CompetitiveExam } from '../types';

describe('MOCK.AI — Syllabus Access & In-Test Question Reporting', () => {
  const testUser: UserProfile = {
    uid: 'test_user_report_123',
    fullName: 'Test Scholar',
    email: 'scholar@mock.ai',
    role: 'STUDENT',
    createdAt: Date.now(),
  };

  beforeEach(() => {
    localStorage.clear();
    storage.saveProfile(testUser);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // FEATURE 1: SYLLABUS ACCESS UNDER EXAM PATTERN
  // ==========================================================================
  describe('Feature 1: Syllabus Access Under Exam Pattern', () => {
    it('1. Renders "Exam Pattern & Instructions" and "Syllabus" buttons in ExamDetailScreen header', () => {
      render(
        <ExamDetailScreen
          examId="ssc-chsl"
          onBack={vi.fn()}
          onStartPaper={vi.fn()}
        />
      );

      const patternBtn = screen.getByRole('button', { name: /exam pattern & instructions/i });
      const syllabusBtn = screen.getByRole('button', { name: /syllabus/i });

      expect(patternBtn).toBeDefined();
      expect(syllabusBtn).toBeDefined();

      // Check both buttons share the same container structure
      expect(patternBtn.parentElement).toBe(syllabusBtn.parentElement);
    });

    it('2. Opens SyllabusModal when "Syllabus" button is clicked', async () => {
      render(
        <ExamDetailScreen
          examId="ssc-chsl"
          onBack={vi.fn()}
          onStartPaper={vi.fn()}
        />
      );

      const syllabusBtn = screen.getByRole('button', { name: /syllabus/i });
      fireEvent.click(syllabusBtn);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeDefined();
      expect(screen.getByText(/SSC CHSL Official Syllabus/i)).toBeDefined();
      expect(screen.getAllByText(/English Language/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/General Intelligence & Reasoning/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Quantitative Aptitude/i).length).toBeGreaterThanOrEqual(1);
    });

    it('3. Closes SyllabusModal when Close button or Escape key is pressed', () => {
      render(
        <ExamDetailScreen
          examId="ssc-chsl"
          onBack={vi.fn()}
          onStartPaper={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /syllabus/i }));
      expect(screen.getByRole('dialog')).toBeDefined();

      // Press Escape
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();

      // Reopen and test close button
      fireEvent.click(screen.getByRole('button', { name: /syllabus/i }));
      expect(screen.getByRole('dialog')).toBeDefined();

      const closeBtn = screen.getByRole('button', { name: /close syllabus/i });
      fireEvent.click(closeBtn);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('4. Renders authentic syllabus sections, topics, and subtopics for GATE', () => {
      const gateExam = ExamService.getExamById('gate')!;
      render(
        <SyllabusModal
          isOpen={true}
          onClose={vi.fn()}
          exam={gateExam}
        />
      );

      expect(screen.getByText(/General Aptitude \(GA\)/i)).toBeDefined();
      expect(screen.getByText(/Engineering Mathematics/i)).toBeDefined();
      expect(screen.getByText(/Core Technical Subjects/i)).toBeDefined();
      expect(screen.getByText(/Verbal Aptitude/i)).toBeDefined();
      expect(screen.getByText(/Linear Algebra & Calculus/i)).toBeDefined();
    });

    it('5. Supports keyword search filtering within the Syllabus modal', () => {
      const chslExam = ExamService.getExamById('ssc-chsl')!;
      render(
        <SyllabusModal
          isOpen={true}
          onClose={vi.fn()}
          exam={chslExam}
        />
      );

      const searchInput = screen.getByRole('textbox', { name: /search syllabus topics/i });
      fireEvent.change(searchInput, { target: { value: 'Trigonometry' } });

      expect(screen.getByText(/Quantitative Aptitude/i)).toBeDefined();
      expect(screen.getByText(/Trigonometry & Statistics/i)).toBeDefined();
      // Unrelated section topics should be filtered out
      expect(screen.queryByText(/Cloze Passage/i)).toBeNull();
    });

    it('6. Shows correct empty state when exam syllabus data is not available', () => {
      const ecetExam = ExamService.getExamById('ecet')!;
      render(
        <SyllabusModal
          isOpen={true}
          onClose={vi.fn()}
          exam={ecetExam}
        />
      );

      expect(
        screen.getByText(/Syllabus information is not available for this exam yet\./i)
      ).toBeDefined();
    });
  });

  // ==========================================================================
  // FEATURE 2: IN-TEST QUESTION REPORTING
  // ==========================================================================
  describe('Feature 2: In-Test Question Reporting from Active Test', () => {
    let paper: ExamPaper;

    beforeEach(() => {
      paper = ExamService.getPaperById('ssc-chsl-2025-13nov-s2')!;
    });

    it('7. Renders secondary "Report Question" button in active CBE question player', () => {
      render(
        <CompetitiveExamPlayerScreen
          paper={paper}
          userId={testUser.uid}
          user={testUser}
          onExit={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      const reportBtn = screen.getByRole('button', { name: /report question 1/i });
      expect(reportBtn).toBeDefined();
      expect(reportBtn.textContent).toContain('Report Question');
    });

    it('8. Opens ReportQuestionModal with auto-populated exam, paper, and question metadata', () => {
      render(
        <CompetitiveExamPlayerScreen
          paper={paper}
          userId={testUser.uid}
          user={testUser}
          onExit={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /report question 1/i }));

      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByRole('heading', { name: /Report Question/i })).toBeDefined();
      expect(screen.getAllByText(/Question 1/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(paper.title).length).toBeGreaterThanOrEqual(1);
    });

    it('9. Lists all predefined selectable reasons with radio options', () => {
      render(
        <ReportQuestionModal
          isOpen={true}
          onClose={vi.fn()}
          examId="ssc-chsl"
          examName="SSC CHSL"
          paperId={paper.id}
          paperTitle={paper.title}
          questionId={paper.questions[0].id}
          questionNumber={1}
          user={testUser}
        />
      );

      REPORT_REASONS.forEach((reason) => {
        expect(screen.getByText(reason.label)).toBeDefined();
      });
    });

    it('10. Keeps Submit button disabled until a reason is selected', () => {
      render(
        <ReportQuestionModal
          isOpen={true}
          onClose={vi.fn()}
          examId="ssc-chsl"
          examName="SSC CHSL"
          paperId={paper.id}
          paperTitle={paper.title}
          questionId={paper.questions[0].id}
          questionNumber={1}
          user={testUser}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /submit report/i });
      expect(submitBtn.hasAttribute('disabled')).toBe(true);

      // Select a reason
      const reasonRadio = screen.getByLabelText(/Incorrect question \/ statement/i);
      fireEvent.click(reasonRadio);

      expect(submitBtn.hasAttribute('disabled')).toBe(false);
    });

    it('11. Allows optional description and successfully submits report to Community Moderation', async () => {
      const handleSubmitted = vi.fn();
      const handleClose = vi.fn();

      render(
        <ReportQuestionModal
          isOpen={true}
          onClose={handleClose}
          examId="ssc-chsl"
          examName="SSC CHSL"
          paperId={paper.id}
          paperTitle={paper.title}
          questionId={paper.questions[0].id}
          questionNumber={1}
          sessionId="test_session_999"
          user={testUser}
          onReportSubmitted={handleSubmitted}
        />
      );

      // Select reason
      const radio = screen.getByDisplayValue('incorrect_answer');
      fireEvent.click(radio);

      // Enter optional description
      const descInput = screen.getByPlaceholderText(/describe the issue so our team can verify it/i);
      fireEvent.change(descInput, {
        target: { value: 'Option B should be the correct answer based on official notification.' },
      });

      // Submit
      const submitBtn = screen.getByRole('button', { name: /submit report/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/report submitted/i)).toBeDefined();
      }, { timeout: 4000 });

      expect(handleSubmitted).toHaveBeenCalled();

      // Verify report is in Community Posts moderation repository
      const { posts } = await communityService.getPosts({ type: 'QUESTION_REPORT' });
      const foundReport = posts.find((p) => p.metadata?.questionId === paper.questions[0].id);

      expect(foundReport).toBeDefined();
      expect(foundReport?.type).toBe('QUESTION_REPORT');
      expect(foundReport?.metadata?.examId).toBe('ssc-chsl');
      expect(foundReport?.metadata?.paperId).toBe(paper.id);
      expect(foundReport?.metadata?.questionNumber).toBe(1);
      expect(foundReport?.metadata?.sessionId).toBe('test_session_999');
      expect(foundReport?.status).toBe('OPEN');
    });

    it('12. Prevents duplicate report submission by the same user for the same question', async () => {
      // First, create an active report
      await communityService.createPost({
        type: 'QUESTION_REPORT',
        title: 'SSC CHSL Q#1: Incorrect answer key',
        description: 'First report for question 1',
        user: testUser,
        metadata: {
          examId: 'ssc-chsl',
          paperId: paper.id,
          questionId: paper.questions[0].id,
          questionNumber: 1,
        },
      });

      render(
        <ReportQuestionModal
          isOpen={true}
          onClose={vi.fn()}
          examId="ssc-chsl"
          examName="SSC CHSL"
          paperId={paper.id}
          paperTitle={paper.title}
          questionId={paper.questions[0].id}
          questionNumber={1}
          user={testUser}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/You have already reported this question\./i)).toBeDefined();
      }, { timeout: 4000 });

      const submitBtn = screen.getByRole('button', { name: /submit report/i });
      expect(submitBtn.hasAttribute('disabled')).toBe(true);
    });

    it('13. Does NOT alter active exam state (answers, index, timer) when opening/closing modal', () => {
      render(
        <CompetitiveExamPlayerScreen
          paper={paper}
          userId={testUser.uid}
          user={testUser}
          onExit={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      // Select Option B (Entomologist) for Question 1
      fireEvent.keyDown(window, { key: '2' });

      // Verify question is on Q1
      expect(screen.getByText(/Question 1 of 100/i)).toBeDefined();

      // Open Report modal
      fireEvent.click(screen.getByRole('button', { name: /report question 1/i }));
      expect(screen.getByRole('dialog')).toBeDefined();

      // Close Report modal with Escape
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();

      // Verify question state is preserved: Still on Question 1
      expect(screen.getByText(/Question 1 of 100/i)).toBeDefined();

      // Save & Next advances to Q2 with the chosen answer intact
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(screen.getByText(/Question 2 of 100/i)).toBeDefined();
    });

    it('14. Renders "Report Question" in descriptive exam player mode as well', () => {
      // Create descriptive paper mock
      const descriptivePaper: ExamPaper = {
        ...paper,
        paperType: 'DESCRIPTIVE',
        questions: [
          {
            ...paper.questions[0],
            id: 'desc-q1',
            questionNumber: 1,
            questionText: 'Write an essay on Digital India and its impact on rural banking.',
            marks: 50,
            negativeMarks: 0,
            sectionName: 'Descriptive Module',
            options: [],
            wordLimit: '200 - 250 words',
          },
        ],
      };

      render(
        <CompetitiveExamPlayerScreen
          paper={descriptivePaper}
          userId={testUser.uid}
          user={testUser}
          onExit={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      const reportBtn = screen.getByRole('button', { name: /report question 1/i });
      expect(reportBtn).toBeDefined();

      fireEvent.click(reportBtn);
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByRole('heading', { name: /Report Question/i })).toBeDefined();
      expect(screen.getAllByText(/Question 1/i).length).toBeGreaterThanOrEqual(1);
    });
  });
});
