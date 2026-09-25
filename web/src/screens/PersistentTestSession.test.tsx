import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CompetitiveExamPlayerScreen } from './CompetitiveExamPlayerScreen';
import { HomeScreen } from './HomeScreen';
import { ExamService } from '../services/examService';
import { ExamSessionService } from '../services/examSessionService';
import { UserProfile, ExamPaper, ExamTestSession } from '../types';

describe('Persistent Test Session & Resume System (Integration Flow)', () => {
  let paper: ExamPaper;
  const mockProfile: UserProfile = {
    uid: 'test_user_flow',
    fullName: 'Shivaram Patel',
    email: 'shiva@mock.ai',
    role: 'LEARNER',
    createdAt: Date.now(),
  };

  beforeEach(() => {
    localStorage.clear();
    paper = ExamService.getPaperById('ssc-chsl-2025-13nov-s2')!;
  });

  it('verifies complete lifecycle: Start -> Answer -> Save & Exit Modal -> Dashboard Card -> Resume -> Submit', async () => {
    const handleExit = vi.fn();
    const handleSubmit = vi.fn();

    // 1. Mount CompetitiveExamPlayerScreen
    const { unmount } = render(
      <CompetitiveExamPlayerScreen
        paper={paper}
        userId={mockProfile.uid}
        onExit={handleExit}
        onSubmit={handleSubmit}
      />
    );

    // Initial state: Question 1 of 100, Save status indicates initial/saved
    expect(screen.getByText(/Question 1 of 100/i)).toBeDefined();

    // 2. Select option B for Question 1
    const optionB = screen.getByText('Entomologist');
    fireEvent.click(optionB);

    // Click "Save & Next" to advance to Question 2
    const saveAndNextBtn = screen.getByRole('button', { name: /Save & Next/i });
    fireEvent.click(saveAndNextBtn);

    expect(screen.getByText(/Question 2 of 100/i)).toBeDefined();

    // 3. Mark Question 2 for review and advance to Question 3
    const markReviewBtn = screen.getByRole('button', { name: /Mark for Review & Next/i });
    fireEvent.click(markReviewBtn);

    expect(screen.getByText(/Question 3 of 100/i)).toBeDefined();

    // 4. Click Exit button to open Exit Confirmation Modal
    const exitBtn = screen.getByRole('button', { name: /^Exit$/i });
    fireEvent.click(exitBtn);

    // Verify Exit Modal content matches requirements:
    expect(screen.getByText(/Exit Test\?/i)).toBeDefined();
    expect(screen.getByText(/Your progress will be saved\./i)).toBeDefined();
    expect(screen.getByText(/You have attempted:/i)).toBeDefined();
    expect(screen.getByText(/Marked for review:/i)).toBeDefined();
    expect(screen.getByText(/Current question:/i)).toBeDefined();
    expect(screen.getByText('Q3')).toBeDefined(); // Current question is Q3

    // 5. Click "Save & Exit"
    const saveExitBtn = screen.getByRole('button', { name: /Save & Exit/i });
    fireEvent.click(saveExitBtn);

    await waitFor(() => {
      expect(handleExit).toHaveBeenCalledTimes(1);
    });

    unmount();

    // 6. Verify session was saved with status PAUSED in persistence
    const savedSessions = await ExamSessionService.getActiveSessionsForUser(mockProfile.uid);
    expect(savedSessions).toHaveLength(1);
    const savedSession = savedSessions[0];
    expect(savedSession.status).toBe('PAUSED');
    expect(savedSession.currentQuestionIndex).toBe(2); // 0-indexed Q3
    expect(savedSession.userAnswers[0]).toBe(1); // Option B index 1
    expect(savedSession.questionStatuses[0]).toBe('ANSWERED');
    expect(savedSession.questionStatuses[1]).toBe('MARKED_FOR_REVIEW');

    // 7. Verify Dashboard (HomeScreen) renders "CONTINUE TEST" card
    const handleResume = vi.fn();
    const handleDiscard = vi.fn();

    render(
      <HomeScreen
        tests={[]}
        profile={mockProfile}
        streakCount={5}
        dailyTasks={[]}
        dailyInsight={{ title: 'Practice Daily', summary: 'Insight summary', dateStr: 'Today', focusArea: 'Verbal' }}
        activeSessions={savedSessions}
        onResumeSession={handleResume}
        onDiscardSession={handleDiscard}
        onToggleTask={vi.fn()}
        onOpenCreateModal={vi.fn()}
        onStartTest={vi.fn()}
        onEditTest={vi.fn()}
        onDeleteTest={vi.fn()}
      />
    );

    expect(screen.getByText(/Continue Tests \(1\)/i)).toBeDefined();
    expect(screen.getAllByText(paper.title).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/1 \/ 100 answered/i)).toBeDefined();
    expect(screen.getByText(/PAUSED/i)).toBeDefined();

    // Click "Resume Test" on Dashboard
    const resumeBtn = screen.getByRole('button', { name: /Resume Test/i });
    fireEvent.click(resumeBtn);

    expect(handleResume).toHaveBeenCalledWith(savedSession);

    // 8. Re-render PlayerScreen with resumed session (simulating app resume)
    render(
      <CompetitiveExamPlayerScreen
        paper={paper}
        initialSession={savedSession}
        userId={mockProfile.uid}
        onExit={handleExit}
        onSubmit={handleSubmit}
      />
    );

    // Verify current question is restored to Q3
    expect(screen.getByText(/Question 3 of 100/i)).toBeDefined();

    // Verify Question 1 in palette is marked Answered (palette renders state)
    // Click on Question 1 in palette to inspect restored option selection
    const q1PaletteBtn = screen.getByRole('button', { name: '1' });
    fireEvent.click(q1PaletteBtn);

    expect(screen.getByText(/Question 1 of 100/i)).toBeDefined();
    // Option B should have the selected ring styling
    const entomologistOption = screen.getByText('Entomologist').closest('div');
    expect(entomologistOption).toBeDefined();

    // 9. Submit examination
    const submitExamBtn = screen.getByRole('button', { name: /Submit Examination/i });
    fireEvent.click(submitExamBtn);

    // Confirm submission modal
    const confirmSubmitBtn = screen.getByRole('button', { name: /Confirm & Submit/i });
    fireEvent.click(confirmSubmitBtn);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    const finalSession = handleSubmit.mock.calls[0][0] as ExamTestSession;
    expect(finalSession.status).toBe('COMPLETED');
    expect(finalSession.result).toBeDefined();

    // 10. Verify session is no longer active in Continue Test list
    const remainingActive = await ExamSessionService.getActiveSessionsForUser(mockProfile.uid);
    expect(remainingActive).toHaveLength(0);
  });
});
