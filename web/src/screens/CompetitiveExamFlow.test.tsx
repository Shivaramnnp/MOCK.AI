import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ExploreScreen } from './ExploreScreen';
import { ExamDetailScreen } from './ExamDetailScreen';
import { CompetitiveExamPlayerScreen } from './CompetitiveExamPlayerScreen';
import { CompetitiveExamResultsScreen } from './CompetitiveExamResultsScreen';
import { ExamService } from '../services/examService';
import { ExamPaper, ExamTestSession } from '../types';

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('Competitive Exam Journey (Explore → SSC CHSL → Test → Results)', () => {
  let paper: ExamPaper;

  beforeEach(() => {
    localStorage.clear();
    const loadedPaper = ExamService.getPaperById('ssc-chsl-2025-13nov-s2');
    expect(loadedPaper).toBeDefined();
    paper = loadedPaper!;
  });

  afterEach(() => {
    cleanup();
  });

  it('1. ExploreScreen should display SSC CHSL and GATE as Available with paper counts', () => {
    const handleSelectExam = vi.fn();
    render(<ExploreScreen onSelectExam={handleSelectExam} />);

    expect(screen.getByText('Competitive Examinations Hub')).toBeDefined();
    expect(screen.getByText('SSC CHSL')).toBeDefined();
    expect(screen.getByText(/Available \(204 Papers\)/i)).toBeDefined();
    expect(screen.getByText('GATE')).toBeDefined();
    expect(screen.getByText(/Available \(76 Papers\)/i)).toBeDefined();

    // Click on SSC CHSL
    const viewButtons = screen.getAllByText('View Previous-Year Papers');
    expect(viewButtons.length).toBe(2);
    fireEvent.click(viewButtons[0]);
    expect(handleSelectExam).toHaveBeenCalledWith('ssc-chsl');

    // Click on GATE
    fireEvent.click(viewButtons[1]);
    expect(handleSelectExam).toHaveBeenCalledWith('gate');
  });

  it('2. ExamDetailScreen should display 2025 Tier 1 13 Nov S2 paper and support switching across 2019-2025', () => {
    const handleStartPaper = vi.fn();
    const handleBack = vi.fn();

    render(
      <ExamDetailScreen
        examId="ssc-chsl"
        onBack={handleBack}
        onStartPaper={handleStartPaper}
      />
    );

    expect(screen.getByText(/Combined Higher Secondary/i)).toBeDefined();
    expect(screen.getByText(/100 MCQs/i)).toBeDefined();
    expect(screen.getByText(/60 Minutes/i)).toBeDefined();
    expect(screen.getByText(/\+2 \/ -0.5 Marks/i)).toBeDefined();
    expect(screen.getByText('SSC CHSL Tier 1 — 13 Nov 2025 (Shift 2)')).toBeDefined();

    // Click Start Simulation on first paper
    const startButtons = screen.getAllByText('Start Simulation');
    expect(startButtons.length).toBe(10);
    fireEvent.click(startButtons[0]);
    expect(handleStartPaper).toHaveBeenCalledWith(paper);

    // Switch to 2024 (36 papers)
    const btn2024 = screen.getByText('2024');
    fireEvent.click(btn2024);
    const start2024Buttons = screen.getAllByText('Start Simulation');
    expect(start2024Buttons.length).toBe(36);

    // Switch to 2023 (36 papers)
    const btn2023 = screen.getByText('2023');
    fireEvent.click(btn2023);
    const start2023Buttons = screen.getAllByText('Start Simulation');
    expect(start2023Buttons.length).toBe(36);

    // Switch to 2022 (33 Tier 1 papers)
    const btn2022 = screen.getByText('2022');
    fireEvent.click(btn2022);
    const start2022Buttons = screen.getAllByText('Start Simulation');
    expect(start2022Buttons.length).toBe(33);

    // Switch to 2021 (42 papers)
    const btn2021 = screen.getByText('2021');
    fireEvent.click(btn2021);
    const start2021Buttons = screen.getAllByText('Start Simulation');
    expect(start2021Buttons.length).toBe(42);

    // Switch to 2020 (14 papers)
    const btn2020 = screen.getByText('2020');
    fireEvent.click(btn2020);
    const start2020Buttons = screen.getAllByText('Start Simulation');
    expect(start2020Buttons.length).toBe(14);

    // Switch to 2019 (25 papers)
    const btn2019 = screen.getByText('2019');
    fireEvent.click(btn2019);
    const start2019Buttons = screen.getAllByText('Start Simulation');
    expect(start2019Buttons.length).toBe(25);
  });

  it('3. CompetitiveExamPlayerScreen should simulate NTA/SSC CBT interface and support answering', () => {
    const handleExit = vi.fn();
    const handleSubmit = vi.fn();

    render(
      <CompetitiveExamPlayerScreen
        paper={paper}
        onExit={handleExit}
        onSubmit={handleSubmit}
      />
    );

    // Should display Title & Question 1
    const titles = screen.getAllByText('SSC CHSL Tier 1 — 13 Nov 2025 (Shift 2)');
    expect(titles.length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText(/Question 1 of 100/i)).toBeDefined();
    expect(screen.getAllByText(/English Language/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/\+2/i)).toBeDefined();
    expect(screen.getByText(/-0.5/i)).toBeDefined();

    // Select Option B (Entomologist) for Q1
    const optB = screen.getByText('B');
    fireEvent.click(optB);

    // Click Save & Next -> Moves to Q2
    const saveNextBtn = screen.getByText('Save & Next');
    fireEvent.click(saveNextBtn);

    expect(screen.getByText(/Question 2 of 100/i)).toBeDefined();

    // Open Submit modal
    const submitBtn = screen.getByText('Submit Examination');
    fireEvent.click(submitBtn);

    expect(screen.getByText('Submit Examination?')).toBeDefined();
    expect(screen.getByText(/Please review your section summary/i)).toBeDefined();

    // Confirm submit
    const confirmBtn = screen.getByText('Confirm & Submit');
    fireEvent.click(confirmBtn);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    const submittedSession = handleSubmit.mock.calls[0][0] as ExamTestSession;
    expect(submittedSession.status).toBe('COMPLETED');
    expect(submittedSession.result).toBeDefined();
    expect(submittedSession.result?.correctCount).toBe(1);
    expect(submittedSession.result?.totalScore).toBe(2.0);
  });

  it('4. CompetitiveExamResultsScreen should display score with negative marking and question review', () => {
    const session = ExamService.createExamSession(paper);
    // Answer Q1 correctly (B -> index 1), Q2 incorrectly (C -> index 2, answer is A)
    session.userAnswers[0] = 1;
    session.userAnswers[1] = 2;
    const completedSession = ExamService.submitExamSession(session, paper);

    const handleRetake = vi.fn();
    const handleExplore = vi.fn();

    render(
      <CompetitiveExamResultsScreen
        session={completedSession}
        paper={paper}
        onRetake={handleRetake}
        onExplore={handleExplore}
      />
    );

    expect(screen.getByText('Official Examination Result')).toBeDefined();
    // Correct: +2.0, Wrong: -0.5 => Total: 1.5 Marks
    expect(screen.getByText('1.5')).toBeDefined();
    expect(screen.getByText(/Net Score/i)).toBeDefined();
    expect(screen.getByText('Detailed Question Review & Verified Solutions')).toBeDefined();
  });

  it('5. CompetitiveExamPlayerScreen renders question diagrams, visual options, and suppresses generic placeholders', () => {
    const chsl2024Paper = ExamService.getPaperById('ssc-chsl-2024-01jul-s1');
    expect(chsl2024Paper).toBeDefined();

    // Verify Q27 has diagram and 4 visual option images
    const q27 = chsl2024Paper!.questions[26];
    expect(q27.diagramUrl).toBe('/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q27_diag.png');
    expect(q27.optionImages).toHaveLength(4);
    expect(q27.optionImages?.[0]).toBe('/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q27_opt_a.png');

    // Create session starting at Q27 (index 26)
    const session = ExamService.createExamSession(chsl2024Paper!);
    session.currentQuestionIndex = 26;
    ExamService.saveActiveSession(session);

    const handleExit = vi.fn();
    const handleSubmit = vi.fn();

    render(
      <CompetitiveExamPlayerScreen
        paper={chsl2024Paper!}
        onExit={handleExit}
        onSubmit={handleSubmit}
      />
    );

    // Q27 prompt should be visible
    expect(screen.getByText(/Select the correct mirror image of the given figure/i)).toBeDefined();

    // Diagram image should be present
    const diagImg = screen.getByAltText('Figure 1 for question 27') as HTMLImageElement;
    expect(diagImg).toBeDefined();
    expect(diagImg.src).toContain('/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q27_diag.png');

    // All 4 option figures should be rendered
    const optAImg = screen.getByAltText('Option A figure') as HTMLImageElement;
    const optBImg = screen.getByAltText('Option B figure') as HTMLImageElement;
    const optCImg = screen.getByAltText('Option C figure') as HTMLImageElement;
    const optDImg = screen.getByAltText('Option D figure') as HTMLImageElement;
    expect(optAImg.src).toContain('q27_opt_a.png');
    expect(optBImg.src).toContain('q27_opt_b.png');
    expect(optCImg.src).toContain('q27_opt_c.png');
    expect(optDImg.src).toContain('q27_opt_d.png');

    // Redundant placeholder text like "Option (A)" should NOT exist
    expect(screen.queryByText('Option (A)')).toBeNull();
    expect(screen.queryByText('Option (B)')).toBeNull();
  });

  it('6. ExamDetailScreen supports Tier 1 vs Tier 2 tabs with dynamic specs and paper listings', () => {
    const handleStartPaper = vi.fn();
    const handleBack = vi.fn();

    render(
      <ExamDetailScreen
        examId="ssc-chsl"
        onBack={handleBack}
        onStartPaper={handleStartPaper}
      />
    );

    // Verify Tier tabs exist
    const tier1Tab = screen.getByRole('button', { name: /Tier 1/i });
    const tier2Tab = screen.getByRole('button', { name: /Tier 2/i });
    expect(tier1Tab).toBeDefined();
    expect(tier2Tab).toBeDefined();

    // Click Tier 2 tab
    fireEvent.click(tier2Tab);

    // Should now display Tier 2 papers. 2025 Tier 2 is CBE Objective (135 MCQs, 135 Mins, +3 / -1 Marks)
    expect(screen.getByText(/135 MCQs/i)).toBeDefined();
    expect(screen.getByText(/135 Minutes/i)).toBeDefined();
    expect(screen.getByText(/\+3 \/ -1 Marks/i)).toBeDefined();

    // Check 2019 Tier 2 Descriptive paper
    const btn2019 = screen.getByText('2019');
    fireEvent.click(btn2019);

    expect(screen.getByText('SSC CHSL Tier 2 Descriptive — 14 Feb 2021')).toBeDefined();
    expect(screen.getByText(/Descriptive \(Pen & Paper Mode\)/i)).toBeDefined();
    expect(screen.getByText('Start Descriptive Practice')).toBeDefined();
  });

  it('7. Tier 2 Descriptive Exam Simulation Journey (Player -> Drafting -> Results Review)', () => {
    const descriptivePaper = ExamService.getPaperById('ssc-chsl-2019-14feb-tier2-descriptive');
    expect(descriptivePaper).toBeDefined();
    expect(descriptivePaper?.paperType).toBe('DESCRIPTIVE');

    const handleExit = vi.fn();
    const handleSubmit = vi.fn();

    render(
      <CompetitiveExamPlayerScreen
        paper={descriptivePaper!}
        onExit={handleExit}
        onSubmit={handleSubmit}
      />
    );

    // Descriptive UI elements
    expect(screen.getByText('Question Prompt')).toBeDefined();
    expect(screen.getByText(/Draft Your Response:/i)).toBeDefined();
    expect(screen.getByText(/Official SSC Evaluation Rubrics & Guidelines/i)).toBeDefined();

    // Find drafting textarea and type essay
    const textarea = screen.getByPlaceholderText(/Type your formal essay \/ letter response here/i);
    fireEvent.change(textarea, {
      target: {
        value: 'Freedom of speech and expression is essential for democratic discourse and accountability in governance.',
      },
    });

    // Submit the descriptive paper
    const submitBtn = screen.getByText('Submit Examination');
    fireEvent.click(submitBtn);

    expect(screen.getByText('Submit Examination?')).toBeDefined();
    const confirmBtn = screen.getByText('Confirm & Submit');
    fireEvent.click(confirmBtn);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    const submittedSession = handleSubmit.mock.calls[0][0] as ExamTestSession;
    expect(submittedSession.status).toBe('COMPLETED');
    expect(submittedSession.userDescriptiveAnswers?.[0]).toContain('Freedom of speech and expression');

    // Now render CompetitiveExamResultsScreen with this submitted session
    cleanup();
    const handleRetake = vi.fn();
    const handleExplore = vi.fn();

    render(
      <CompetitiveExamResultsScreen
        session={submittedSession}
        paper={descriptivePaper!}
        onRetake={handleRetake}
        onExplore={handleExplore}
      />
    );

    // Verify Descriptive Results UI
    expect(screen.getByText('Descriptive Modules Attempted')).toBeDefined();
    expect(screen.getAllByText('Official Question Topic').length).toBe(2);
    expect(screen.getAllByText('Your Drafted Submission').length).toBe(2);
    expect(screen.getByText(/Freedom of speech and expression is essential/i)).toBeDefined();
    expect(screen.getAllByText('Official Evaluation Rubrics').length).toBe(2);
    expect(screen.getAllByText('Official SSC Model Benchmark Solution').length).toBe(2);
  });

  it('8. GATE 2025 ExamDetailScreen should display 38 papers and support discipline search', () => {
    const handleStartPaper = vi.fn();
    const handleBack = vi.fn();

    render(
      <ExamDetailScreen
        examId="gate"
        onBack={handleBack}
        onStartPaper={handleStartPaper}
      />
    );

    expect(screen.getByText('GATE')).toBeDefined();
    expect(screen.getByText(/Graduate Aptitude Test in Engineering/i)).toBeDefined();

    // Verify all 38 papers are rendered
    const startButtons = screen.getAllByText('Start Simulation');
    expect(startButtons.length).toBe(38);

    // Search for CS-1
    const searchInput = screen.getByPlaceholderText(/Search paper or code/i);
    fireEvent.change(searchInput, { target: { value: 'CS-1' } });

    const filteredButtons = screen.getAllByText('Start Simulation');
    expect(filteredButtons.length).toBe(1);
    expect(screen.getByText(/Computer Science and Information Technology/i)).toBeDefined();
    expect(screen.getByText('CS-1')).toBeDefined();

    // Start simulation
    fireEvent.click(filteredButtons[0]);
    expect(handleStartPaper).toHaveBeenCalledTimes(1);
    const selectedGatePaper = handleStartPaper.mock.calls[0][0] as ExamPaper;
    expect(selectedGatePaper.id).toBe('gate-2025-cs-1');
    expect(selectedGatePaper.totalQuestions).toBe(65);
    expect(selectedGatePaper.durationMinutes).toBe(180);
  });

  it('9. GATE Player Screen should support MSQ checkboxes, NAT virtual keypad, and MCQ radios', () => {
    const gatePaper = ExamService.getPaperById('gate-2025-cs-1');
    expect(gatePaper).toBeDefined();

    const handleExit = vi.fn();
    const handleSubmit = vi.fn();

    render(
      <CompetitiveExamPlayerScreen
        paper={gatePaper!}
        onExit={handleExit}
        onSubmit={handleSubmit}
      />
    );

    // Verify GATE branding
    expect(screen.getByText('GATE')).toBeDefined();
    expect(screen.getByText(/IIT Roorkee \/ IISc/i)).toBeDefined();
    expect(screen.getByText(/Question 1 of 65/i)).toBeDefined();

    // Switch to Core Section (Section 2) where MSQ and NAT questions reside
    const coreSectionBtn = screen.getByRole('button', { name: /Computer Science & IT/i });
    fireEvent.click(coreSectionBtn);

    // Find an MSQ question in the paper (e.g. Q13, Q14, etc.)
    const msqIndex = gatePaper!.questions.findIndex((q) => q.questionType === 'MSQ');
    expect(msqIndex).toBeGreaterThan(-1);

    // Jump to the MSQ question via question palette button
    const msqBtn = screen.getByRole('button', { name: String(msqIndex + 1) });
    fireEvent.click(msqBtn);

    expect(screen.getByText(/Multiple Select/i)).toBeDefined();
    expect(screen.getByText(/Select one or more correct options/i)).toBeDefined();

    // Toggle options A and C for this MSQ
    const optLetters = screen.getAllByText('A');
    fireEvent.click(optLetters[0]);

    // Find a NAT question in the paper
    const natIndex = gatePaper!.questions.findIndex((q) => q.questionType === 'NAT');
    expect(natIndex).toBeGreaterThan(-1);

    const natBtn = screen.getByRole('button', { name: String(natIndex + 1) });
    fireEvent.click(natBtn);

    expect(screen.getAllByText(/Numerical Answer/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Enter Numerical Answer/i)).toBeDefined();
    expect(screen.getByText(/Virtual Keypad/i)).toBeDefined();

    // Use keypad to type "42.5"
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '.' }));
    fireEvent.click(screen.getByRole('button', { name: '5' }));

    const natInput = screen.getByPlaceholderText(/Type value/i) as HTMLInputElement;
    expect(natInput.value).toBe('42.5');
  });

  it('10. GATE Scoring Engine accurately calculates MCQ (-1/3), MSQ (0 deduction), NAT range, and MTA', () => {
    const gatePaper = ExamService.getPaperById('gate-2025-cs-1')!;
    expect(gatePaper).toBeDefined();

    const session = ExamService.createExamSession(gatePaper);

    // 1. MCQ test: Answer Q1 correctly
    const q1 = gatePaper.questions[0];
    session.userAnswers[0] = q1.correctAnswerIndex;

    // 2. MSQ test: find first MSQ question
    const msqIndex = gatePaper.questions.findIndex((q) => q.questionType === 'MSQ');
    const msqQ = gatePaper.questions[msqIndex];
    // Correct selection:
    session.userMsqAnswers = session.userMsqAnswers || {};
    session.userMsqAnswers[msqIndex] = msqQ.correctAnswerIndices || [0, 2];

    // 3. NAT test: find first NAT question
    const natIndex = gatePaper.questions.findIndex((q) => q.questionType === 'NAT');
    const natQ = gatePaper.questions[natIndex];
    session.userNatAnswers = session.userNatAnswers || {};
    if (natQ.answerRange) {
      session.userNatAnswers[natIndex] = String((natQ.answerRange.min + natQ.answerRange.max) / 2);
    }

    // Submit session and verify calculations
    const result = ExamService.calculateExamResult(session, gatePaper);
    expect(result.totalQuestions).toBe(65);
    expect(result.correctCount).toBeGreaterThanOrEqual(3);
    expect(result.wrongCount).toBe(0);
    expect(result.totalScore).toBeGreaterThan(0);

    // Now test wrong MSQ and wrong NAT: should have 0 negative marks!
    session.userMsqAnswers[msqIndex] = [3]; // wrong option
    session.userNatAnswers[natIndex] = '999999.9'; // outside range
    const resultWrong = ExamService.calculateExamResult(session, gatePaper);
    expect(resultWrong.wrongCount).toBe(2);
    // Score should only be Q1's marks, with NO deduction from MSQ or NAT
    expect(resultWrong.totalScore).toBe(q1.marks);
  });

  it('11. Semantic Visual Regression Test: Text-only questions render without images and genuine visual questions retain assets', () => {
    const aePaper = ExamService.getPaperById('gate-2025-ae');
    expect(aePaper).toBeDefined();

    // 1. Text-Only Question Audit: Courage : Bravery :: Yearning : ________
    const q1 = aePaper!.questions[0];
    expect(q1.questionText).toContain('Courage : Bravery :: Yearning');
    expect(q1.options).toEqual(['Longing', 'Yelling', 'Yawning', 'Glaring']);
    expect(q1.optionImages).toBeNull();
    expect(q1.diagramUrl).toBeNull();
    expect(q1.richOptions?.every((opt) => opt.imageUrl === null)).toBe(true);

    // 2. Genuine Visual Option Question Audit: Q19 (Airfoils)
    const q19 = aePaper!.questions[18];
    expect(q19.questionText).toContain('cambered airfoil');
    expect(q19.optionImages).toHaveLength(4);
    expect(q19.optionImages?.[0]).toContain('q19_opt_a.png');
    expect(q19.richOptions?.[0].imageUrl).toContain('q19_opt_a.png');

    // 3. Render Player Screen for Q1 and verify NO option images are rendered
    const handleExit = vi.fn();
    const handleSubmit = vi.fn();

    render(
      <CompetitiveExamPlayerScreen
        paper={aePaper!}
        onExit={handleExit}
        onSubmit={handleSubmit}
      />
    );

    // Question 1 prompt and options are rendered as text
    expect(screen.getByText(/Courage : Bravery :: Yearning/i)).toBeDefined();
    expect(screen.getByText('Longing')).toBeDefined();
    expect(screen.getByText('Yelling')).toBeDefined();
    expect(screen.getByText('Yawning')).toBeDefined();
    expect(screen.getByText('Glaring')).toBeDefined();

    // Assert that NO option image exists for Q1
    expect(screen.queryByAltText('Option A figure')).toBeNull();
    expect(screen.queryByAltText('Option B figure')).toBeNull();
    expect(screen.queryByAltText('Option C figure')).toBeNull();
    expect(screen.queryByAltText('Option D figure')).toBeNull();

    // 4. Switch to Core Section and jump to Q19 (Airfoil visual options)
    cleanup();
    const session = ExamService.createExamSession(aePaper!);
    session.currentQuestionIndex = 18; // jump to Q19
    ExamService.saveActiveSession(session);

    render(
      <CompetitiveExamPlayerScreen
        paper={aePaper!}
        onExit={handleExit}
        onSubmit={handleSubmit}
      />
    );

    // Q19 prompt should be visible
    expect(screen.getByText(/cambered airfoil/i)).toBeDefined();

    // Q19 MUST render option figures
    const optA = screen.getByAltText('Option A figure') as HTMLImageElement;
    const optB = screen.getByAltText('Option B figure') as HTMLImageElement;
    expect(optA).toBeDefined();
    expect(optA.src).toContain('/exam-assets/gate/2025/ae/q19_opt_a.png');
    expect(optB.src).toContain('/exam-assets/gate/2025/ae/q19_opt_b.png');
  });

  it('12. GATE 2024 Multi-Layout & Watermark Neutralization Test: Verifies dual layouts, text purity and genuine diagrams', () => {
    const allGatePapers = ExamService.getPapersForExam('gate');
    expect(allGatePapers.length).toBeGreaterThanOrEqual(76);

    const gate2024Papers = allGatePapers.filter((p) => p.editionYear === 2024);
    expect(gate2024Papers.length).toBe(38);

    // 1. Verify text-flow layout paper (CE-1)
    const ce1Paper = ExamService.getPaperById('gate-2024-ce-1');
    expect(ce1Paper).toBeDefined();
    expect(ce1Paper!.questions).toHaveLength(65);
    const ce1Q1 = ce1Paper!.questions[0];
    expect(ce1Q1.questionText).toContain('simmer → seethe → smolder');
    expect(ce1Q1.options).toEqual(['obfuscate', 'obliterate', 'fracture', 'fissure']);
    expect(ce1Q1.diagramUrl).toBeNull();
    expect(ce1Q1.optionImages).toBeNull();

    // 2. Verify text-flow layout paper (CS-1)
    const cs1Paper = ExamService.getPaperById('gate-2024-cs-1');
    expect(cs1Paper).toBeDefined();
    expect(cs1Paper!.questions).toHaveLength(65);
    const cs1Q1 = cs1Paper!.questions[0];
    expect(cs1Q1.options).toEqual(['starve', 'reject', 'feast', 'deny']);
    expect(cs1Q1.diagramUrl).toBeNull();
    expect(cs1Q1.optionImages).toBeNull();

    // 3. Verify DA (introduced in GATE 2024)
    const daPaper = ExamService.getPaperById('gate-2024-da');
    expect(daPaper).toBeDefined();
    expect(daPaper!.questions).toHaveLength(65);
    const daQ1 = daPaper!.questions[0];
    expect(daQ1.options).toEqual(['frown', 'fawn', 'vein', 'vain']);
    expect(daQ1.diagramUrl).toBeNull();
    const daQ55 = daPaper!.questions[54];
    expect(daQ55.options[0]).toContain('B+ tree on all the attributes');

    // 4. Verify table-grid paper (AE): Q1 text-only vs Q28 V-n diagram
    const aePaper = ExamService.getPaperById('gate-2024-ae');
    expect(aePaper).toBeDefined();
    const aeQ1 = aePaper!.questions[0];
    expect(aeQ1.diagramUrl).toBeNull();
    expect(aeQ1.optionImages).toBeNull();

    const aeQ28 = aePaper!.questions[27];
    expect(aeQ28.questionText).toContain('V-n diagram');
    expect(aeQ28.diagramUrl).toBe('/exam-assets/gate/2024/ae/q28_diag.png');

    // 5. Render Player Screen for AE Q1: verify no diagram and no option images
    cleanup();
    const handleExit = vi.fn();
    const handleSubmit = vi.fn();

    render(
      <CompetitiveExamPlayerScreen
        paper={aePaper!}
        onExit={handleExit}
        onSubmit={handleSubmit}
      />
    );

    expect(screen.getByText(/dry → arid → parched/i)).toBeDefined();
    expect(screen.getByText('starve')).toBeDefined();
    expect(screen.queryByAltText(/Figure 1 for question 1/i)).toBeNull();
    expect(screen.queryByAltText('Option A figure')).toBeNull();

    // 6. Jump to Q28 and verify the genuine V-n diagram is rendered
    cleanup();
    const session = ExamService.createExamSession(aePaper!);
    session.currentQuestionIndex = 27; // Q28
    ExamService.saveActiveSession(session);

    render(
      <CompetitiveExamPlayerScreen
        paper={aePaper!}
        onExit={handleExit}
        onSubmit={handleSubmit}
      />
    );

    expect(screen.getByText(/V-n diagram/i)).toBeDefined();
    const diagImg = screen.getByAltText(/Figure 1 for question 28/i) as HTMLImageElement;
    expect(diagImg).toBeDefined();
    expect(diagImg.src).toContain('/exam-assets/gate/2024/ae/q28_diag.png');
  });
});

