import { describe, it, expect } from 'vitest';
import { CanonicalQuestion, CanonicalOption, CanonicalContentBlock } from '../../../types/canonicalQuestion';
import { ExamPaper, ExamTestSession } from '../../../types';
import { UniversalMockService } from './universalMockService';
import { generateMockPaperFromQuestions } from './universalMockGenerator';
import { detectEmbeddedAnswers } from './embeddedAnswerDetector';
import { extractPaperInstructions } from './universalExamConfig';
import { ExamService } from '../../examService';

describe('Universal Paper -> Mock Engine End-to-End Suite (Section 37)', () => {
  // Helper to create a canonical question
  const createMockQuestion = (
    qNum: number,
    type: 'MCQ' | 'MSQ' | 'NAT',
    overrides?: Partial<CanonicalQuestion>
  ): CanonicalQuestion => {
    let options: CanonicalOption[] | undefined;
    if (type === 'MCQ') {
      options = [
        { id: 'A', text: 'Option Alpha', contentBlocks: [{ type: 'text', content: 'Option Alpha' }] },
        { id: 'B', text: 'Option Beta', contentBlocks: [{ type: 'text', content: 'Option Beta' }] },
        { id: 'C', text: 'Option Gamma', contentBlocks: [{ type: 'text', content: 'Option Gamma' }] },
        { id: 'D', text: 'Option Delta', contentBlocks: [{ type: 'text', content: 'Option Delta' }] },
      ];
    } else if (type === 'MSQ') {
      options = [
        { id: 'A', text: 'Statement 1 is true', contentBlocks: [{ type: 'text', content: 'Statement 1 is true' }] },
        { id: 'B', text: 'Statement 2 is true', contentBlocks: [{ type: 'text', content: 'Statement 2 is true' }] },
        { id: 'C', text: 'Statement 3 is true', contentBlocks: [{ type: 'text', content: 'Statement 3 is true' }] },
        { id: 'D', text: 'Statement 4 is true', contentBlocks: [{ type: 'text', content: 'Statement 4 is true' }] },
      ];
    }

    return {
      questionId: `canonical_q_${qNum}`,
      sourceId: 'mock_source',
      sourceType: 'PDF',
      questionNumber: qNum,
      questionText: `Question stem for problem ${qNum}`,
      contentBlocks: [{ type: 'text', content: `Question stem for problem ${qNum}` }],
      questionType: type,
      sectionName: 'General',
      options: options || [],
      answer: {
        questionType: type,
        answerStatus: 'RESOLVED',
      },
      scoring: {
        marks: 2,
        negativeMarks: type === 'MCQ' ? 0.67 : 0,
      },
      provenance: {
        sourceType: 'PDF',
      },
      assets: [],
      explanation: '',
      marks: 2,
      negativeMarks: type === 'MCQ' ? 0.67 : 0,
      verificationStatus: 'VERIFIED',
      verificationReasons: [],
      confidence: {
        extraction: 1.0,
        structure: 1.0,
        answer: 1.0,
        asset: 1.0,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    };
  };

  // Helper to simulate taking an exam session
  const createTestSession = (paper: ExamPaper): ExamTestSession => {
    return {
      sessionId: `session_${Date.now()}`,
      paperId: paper.id,
      examId: paper.examId,
      paperTitle: paper.title,
      userId: 'test_user_1',
      status: 'IN_PROGRESS',
      startedAt: Date.now(),
      lastSavedAt: Date.now(),
      expiresAt: Date.now() + 10800000,
      completedAt: null,
      durationSeconds: 10800,
      timeRemainingSeconds: 9000,
      elapsedSeconds: 1800,
      currentQuestionIndex: 0,
      currentSectionId: paper.sections[0]?.id || 'sec_default',
      version: 1,
      questionStatuses: {},
      userAnswers: {},
      userMsqAnswers: {},
      userNatAnswers: {},
      userDescriptiveAnswers: {},
    };
  };

  // =========================================================================
  // Scenario 1: Paper with Answer Key -> Ingest -> Mock -> Session -> Submit -> Scored Result
  // =========================================================================
  it('Scenario 1: Converts paper with answer key into playable mock and calculates accurate score', () => {
    const q1 = createMockQuestion(1, 'MCQ', {
      answer: { questionType: 'MCQ', correctAnswer: 'B', correctOptionId: 'B', answerStatus: 'RESOLVED' },
    });
    const q2 = createMockQuestion(2, 'MSQ', {
      answer: { questionType: 'MSQ', correctOptionIds: ['A', 'C'], correctAnswerSet: ['A', 'C'], answerStatus: 'RESOLVED' },
    });
    const q3 = createMockQuestion(3, 'NAT', {
      answer: { questionType: 'NAT', natRange: { min: 14.5, max: 15.5 }, answerStatus: 'RESOLVED' },
    });

    const paper = generateMockPaperFromQuestions([q1, q2, q3], {
      exam: 'GATE',
      year: 2025,
      paperCode: 'CS',
      confidence: 1.0,
    });

    expect(paper.answerKeyStatus).toBe('AVAILABLE');
    expect(paper.isScored).toBe(true);
    expect(paper.questions.length).toBe(3);

    // Simulate candidate taking test: Answers Q1 correctly (B = index 1), Q2 correctly (A, C = indices 0, 2), Q3 wrong (10.0)
    const session = createTestSession(paper);
    session.userAnswers[0] = 1; // Q1: B (Correct)
    session.userMsqAnswers![1] = [0, 2]; // Q2: A, C (Correct)
    session.userNatAnswers![2] = '10.0'; // Q3: 10.0 (Wrong, accepted 14.5 to 15.5)

    const result = ExamService.calculateExamResult(session, paper);
    expect(result.isScoreCalculated).toBe(true);
    expect(result.answerKeyStatus).toBe('AVAILABLE');
    expect(result.correctCount).toBe(2);
    expect(result.wrongCount).toBe(1);
    expect(result.totalScore).toBe(4); // 2 + 2 = 4 (NAT has 0 negative marks)
    expect(result.unansweredCount).toBe(0);
  });

  // =========================================================================
  // Scenario 2: Paper without Answer Key -> Ingest -> Mock -> Session -> Submit -> Safe Unscored Result
  // =========================================================================
  it('Scenario 2: Converts paper without answer key into practice mock with safe unscored result and zero fake deductions', () => {
    const q1 = createMockQuestion(1, 'MCQ', {
      answer: { questionType: 'MCQ', answerStatus: 'UNRESOLVED' },
    });
    const q2 = createMockQuestion(2, 'MCQ', {
      answer: { questionType: 'MCQ', answerStatus: 'UNRESOLVED' },
    });

    const paper = generateMockPaperFromQuestions([q1, q2], {
      exam: 'Custom',
      confidence: 0.8,
    });

    expect(paper.answerKeyStatus).toBe('UNAVAILABLE');
    expect(paper.isScored).toBe(false);

    // Candidate attempts Q1 with option B, leaves Q2 unattempted
    const session = createTestSession(paper);
    session.userAnswers[0] = 1; // Attempted Q1

    const result = ExamService.calculateExamResult(session, paper);
    expect(result.isScoreCalculated).toBe(false);
    expect(result.scoreStatus).toBe('PENDING_ANSWER_KEY');
    expect(result.answerKeyStatus).toBe('UNAVAILABLE');
    expect(result.totalScore).toBeNull(); // Null score: NOT zero points
    expect(result.correctCount).toBeNull();
    expect(result.wrongCount).toBeNull(); // NOT marked wrong
    expect(result.attemptedCount).toBe(1);
    const secId = paper.sections[0].id;
    expect(result.sectionResults[secId].attempted).toBe(1);
    expect(result.sectionResults[secId].skipped).toBe(1);
  });

  // =========================================================================
  // Scenario 3: Separate Answer Key Ingestion & Deterministic Reconciliation
  // =========================================================================
  it('Scenario 3: Pairs separate Question Paper and Answer Key correctly', async () => {
    const qpLines = [
      'Mock Engineering Entrance Test',
      'Q1. What is the value of gravitational acceleration near Earth surface?',
      '(A) 5.8 m/s^2',
      '(B) 9.8 m/s^2',
      '(C) 12.4 m/s^2',
      '(D) 15.2 m/s^2',
    ];
    const akLines = [
      'Official Answer Key',
      'Q1: B (Marks: 2, Negative: 0.67)',
    ];

    const { paper, report } = await UniversalMockService.convertPaperToMock({
      questionPaper: {
        textData: qpLines.join('\n'),
        fileName: 'engineering_qp.txt',
      },
      answerKey: {
        textData: akLines.join('\n'),
        fileName: 'engineering_ak.txt',
      },
    });

    expect(paper.questions.length).toBeGreaterThan(0);
    expect(paper.questions[0].correctAnswer).toBe('B');
    expect(paper.questions[0].correctAnswerIndex).toBe(1);
    expect(paper.answerKeyStatus).toBe('AVAILABLE');
  });

  // =========================================================================
  // Scenario 4: Embedded Answer Detection (End-of-Doc Table & Inline Tokens)
  // =========================================================================
  it('Scenario 4: Auto-detects embedded answer sections at the end of document and inline tokens', () => {
    // 4A: End-of-document answer table
    const documentWithEndTable = [
      'University Semester Examination',
      'Question 1. Explain Ohm law.',
      'Question 2. Define magnetic flux.',
      'ANSWERS / KEY',
      '1 A',
      '2 C',
      '3 25.5 to 26.5',
    ];
    const detected1 = detectEmbeddedAnswers(documentWithEndTable);
    expect(detected1.hasEmbeddedAnswers).toBe(true);
    expect(detected1.entries.length).toBe(3);
    expect(detected1.entries[0].questionNumber).toBe(1);
    expect(detected1.entries[0].rawAnswerText).toBe('A');
    expect(detected1.entries[2].questionNumber).toBe(3);
    expect(detected1.entries[2].rawAnswerText).toBe('25.5 to 26.5');

    // 4B: Per-question inline answer tokens
    const documentWithInlineKeys = [
      'Question 1. What is 2 + 2?',
      'Option A: 3',
      'Option B: 4',
      'Ans: B',
      'Question 2. Capital of France?',
      'Option A: Berlin',
      'Option B: Paris',
      'Correct Answer: B',
    ];
    const detected2 = detectEmbeddedAnswers(documentWithInlineKeys);
    expect(detected2.hasEmbeddedAnswers).toBe(true);
    expect(detected2.entries.length).toBe(2);
    expect(detected2.entries[0].questionNumber).toBe(1);
    expect(detected2.entries[0].rawAnswerText).toBe('B');
    expect(detected2.entries[1].questionNumber).toBe(2);
    expect(detected2.entries[1].rawAnswerText).toBe('B');
  });

  // =========================================================================
  // Scenario 5: Dynamic Options MCQ (2, 3, 5 Options without fake options)
  // =========================================================================
  it('Scenario 5: Supports MCQs with dynamic option counts (2, 3, 5 options) with authentic labels', () => {
    // 2-option question (True / False)
    const q2Opts = createMockQuestion(1, 'MCQ', {
      options: [
        { id: 'A', text: 'True' },
        { id: 'B', text: 'False' },
      ],
      answer: { questionType: 'MCQ', correctAnswer: 'A', correctOptionId: 'A', answerStatus: 'RESOLVED' },
    });

    // 5-option question (Banking / UPSC style: A, B, C, D, E)
    const q5Opts = createMockQuestion(2, 'MCQ', {
      options: [
        { id: 'A', text: 'Option A' },
        { id: 'B', text: 'Option B' },
        { id: 'C', text: 'Option C' },
        { id: 'D', text: 'Option D' },
        { id: 'E', text: 'None of the above' },
      ],
      answer: { questionType: 'MCQ', correctAnswer: 'E', correctOptionId: 'E', answerStatus: 'RESOLVED' },
    });

    const paper = generateMockPaperFromQuestions([q2Opts, q5Opts], { exam: 'Banking_IBPS', confidence: 1.0 });
    expect(paper.questions[0].options.length).toBe(2);
    expect(paper.questions[0].correctAnswerIndex).toBe(0);

    expect(paper.questions[1].options.length).toBe(5);
    expect(paper.questions[1].correctAnswerIndex).toBe(4); // E is index 4
  });

  // =========================================================================
  // Scenario 6: MSQ Multi-Select Evaluation
  // =========================================================================
  it('Scenario 6: Correctly evaluates MSQ questions with strict multi-select rules', () => {
    const qMsq = createMockQuestion(1, 'MSQ', {
      answer: {
        questionType: 'MSQ',
        correctOptionIds: ['A', 'C', 'D'],
        correctAnswerSet: ['A', 'C', 'D'],
        answerStatus: 'RESOLVED',
      },
    });

    const paper = generateMockPaperFromQuestions([qMsq], { exam: 'GATE', confidence: 1.0 });
    expect(paper.questions[0].correctAnswerSet).toEqual(['A', 'C', 'D']);

    // Attempt 1: Full correct match (A, C, D -> indices 0, 2, 3)
    const session1 = createTestSession(paper);
    session1.userMsqAnswers![0] = [0, 2, 3];
    const result1 = ExamService.calculateExamResult(session1, paper);
    expect(result1.correctCount).toBe(1);
    expect(result1.wrongCount).toBe(0);
    expect(result1.totalScore).toBe(2);

    // Attempt 2: Partial match (A, C only -> candidate missed D)
    const session2 = createTestSession(paper);
    session2.userMsqAnswers![0] = [0, 2];
    const result2 = ExamService.calculateExamResult(session2, paper);
    expect(result2.correctCount).toBe(0);
    expect(result2.wrongCount).toBe(1);
    expect(result2.totalScore).toBe(0); // MSQ has 0 negative marks in GATE
  });

  // =========================================================================
  // Scenario 7: NAT Numerical Range Evaluation & Floating Point Tolerance
  // =========================================================================
  it('Scenario 7: Correctly evaluates NAT numeric inputs against inclusive tolerance boundaries', () => {
    const qNat = createMockQuestion(1, 'NAT', {
      answer: {
        questionType: 'NAT',
        natRange: { min: 3.14, max: 3.16 },
        answerStatus: 'RESOLVED',
      },
    });

    const paper = generateMockPaperFromQuestions([qNat], { exam: 'GATE', confidence: 1.0 });
    expect(paper.questions[0].answerRange).toEqual({ min: 3.14, max: 3.16 });

    // In-range value (3.14159)
    const session1 = createTestSession(paper);
    session1.userNatAnswers![0] = '3.14159';
    const result1 = ExamService.calculateExamResult(session1, paper);
    expect(result1.correctCount).toBe(1);

    // Exact min boundary (3.14)
    const session2 = createTestSession(paper);
    session2.userNatAnswers![0] = '3.14';
    const result2 = ExamService.calculateExamResult(session2, paper);
    expect(result2.correctCount).toBe(1);

    // Out-of-range value (3.17)
    const session3 = createTestSession(paper);
    session3.userNatAnswers![0] = '3.17';
    const result3 = ExamService.calculateExamResult(session3, paper);
    expect(result3.correctCount).toBe(0);
    expect(result3.wrongCount).toBe(1);
  });

  // =========================================================================
  // Scenario 8: Image & Diagram Question Integrity
  // =========================================================================
  it('Scenario 8: Preserves question diagrams and visual assets as structured content blocks', () => {
    const diagramBlock: CanonicalContentBlock = {
      type: 'diagram',
      assetUrl: '/exam-assets/gate-2025/circuit_q12.png',
      caption: 'RLC Circuit Schematic',
    };

    const qWithDiagram = createMockQuestion(12, 'MCQ', {
      contentBlocks: [
        { type: 'text', content: 'In the circuit shown below, determine the resonant frequency.' },
        diagramBlock,
      ],
      diagramUrls: ['/exam-assets/gate-2025/circuit_q12.png'],
    });

    const paper = generateMockPaperFromQuestions([qWithDiagram], { exam: 'GATE', confidence: 1.0 });
    expect(paper.questions[0].diagramUrls).toContain('/exam-assets/gate-2025/circuit_q12.png');
    expect(paper.questions[0].contentBlocks?.some((b) => b.type === 'diagram')).toBe(true);
  });

  // =========================================================================
  // Scenario 9: Table Question Integrity (Column-I / Column-II Matching)
  // =========================================================================
  it('Scenario 9: Preserves matching and comparison tables as structured 2D grids', () => {
    const tableBlock: CanonicalContentBlock = {
      type: 'table',
      headers: ['List I (Algorithm)', 'List II (Time Complexity)'],
      rows: [
        ['P. Merge Sort', '1. O(N log N)'],
        ['Q. Binary Search', '2. O(log N)'],
        ['R. Floyd-Warshall', '3. O(V^3)'],
      ],
    };

    const qTable = createMockQuestion(8, 'MCQ', {
      contentBlocks: [
        { type: 'text', content: 'Match List I with List II:' },
        tableBlock,
      ],
    });

    const paper = generateMockPaperFromQuestions([qTable], { exam: 'GATE', confidence: 1.0 });
    const block = paper.questions[0].contentBlocks?.find((b) => b.type === 'table');
    expect(block).toBeDefined();
    expect(block?.headers).toEqual(['List I (Algorithm)', 'List II (Time Complexity)']);
    expect(block?.rows?.length).toBe(3);
  });

  // =========================================================================
  // Scenario 10: LaTeX Mathematics Fidelity
  // =========================================================================
  it('Scenario 10: Preserves LaTeX mathematical symbols, fractions, superscripts, and matrices', () => {
    const mathBlock: CanonicalContentBlock = {
      type: 'math',
      latex: '\\int_{0}^{\\pi} \\sin^2(x) dx = \\frac{\\pi}{2}',
    };

    const qMath = createMockQuestion(15, 'NAT', {
      questionText: 'Evaluate the definite integral $\\int_{0}^{\\pi} \\sin^2(x) dx$.',
      contentBlocks: [
        { type: 'text', content: 'Evaluate the definite integral:' },
        mathBlock,
      ],
    });

    const paper = generateMockPaperFromQuestions([qMath], { exam: 'GATE', confidence: 1.0 });
    expect(paper.questions[0].questionText).toContain('\\int_{0}^{\\pi}');
    expect(paper.questions[0].contentBlocks?.some((b) => b.latex?.includes('\\frac{\\pi}{2}'))).toBe(true);
  });

  // =========================================================================
  // Scenario 11: Image-Based Options
  // =========================================================================
  it('Scenario 11: Preserves image-based visual options without cross-option contamination', () => {
    const qVisualOpts = createMockQuestion(9, 'MCQ', {
      options: [
        { id: 'A', text: '', imageUrl: '/assets/opts/opt_a.png' },
        { id: 'B', text: '', imageUrl: '/assets/opts/opt_b.png' },
        { id: 'C', text: '', imageUrl: '/assets/opts/opt_c.png' },
        { id: 'D', text: '', imageUrl: '/assets/opts/opt_d.png' },
      ],
    });

    const paper = generateMockPaperFromQuestions([qVisualOpts], { exam: 'GATE', confidence: 1.0 });
    expect(paper.questions[0].optionImages?.[0]).toBe('/assets/opts/opt_a.png');
    expect(paper.questions[0].optionImages?.[3]).toBe('/assets/opts/opt_d.png');
    expect(paper.questions[0].richOptions?.[0].imageUrl).toBe('/assets/opts/opt_a.png');
  });

  // =========================================================================
  // Scenario 12: Late Answer-Key Attachment (Section 32 Verification)
  // =========================================================================
  it('Scenario 12: Candidate takes mock on Day 1 without answer key; attaches official answer key on Day 2; verifies scoring with zero loss of candidate data', async () => {
    // Day 1: Candidate uploads Question Paper without Answer Key
    const q1 = createMockQuestion(1, 'MCQ', { answer: { questionType: 'MCQ', answerStatus: 'UNRESOLVED' } });
    const q2 = createMockQuestion(2, 'MSQ', { answer: { questionType: 'MSQ', answerStatus: 'UNRESOLVED' } });
    const q3 = createMockQuestion(3, 'NAT', { answer: { questionType: 'NAT', answerStatus: 'UNRESOLVED' } });

    const day1Paper = generateMockPaperFromQuestions([q1, q2, q3], {
      exam: 'GATE',
      year: 2025,
      paperCode: 'ME',
      confidence: 1.0,
    });

    expect(day1Paper.answerKeyStatus).toBe('UNAVAILABLE');
    expect(day1Paper.isScored).toBe(false);

    // Day 1: Candidate takes the mock test and submits
    const candidateSession = createTestSession(day1Paper);
    candidateSession.userAnswers[0] = 2; // Option C (index 2)
    candidateSession.userMsqAnswers![1] = [0, 1]; // Option A, B (indices 0, 1)
    candidateSession.userNatAnswers![2] = '42.5'; // 42.5 entered

    const day1Result = ExamService.calculateExamResult(candidateSession, day1Paper);
    expect(day1Result.isScoreCalculated).toBe(false);
    expect(day1Result.scoreStatus).toBe('PENDING_ANSWER_KEY');
    expect(day1Result.answerKeyStatus).toBe('UNAVAILABLE');
    expect(day1Result.totalScore).toBeNull();
    expect(day1Result.attemptedCount).toBe(3);

    // Day 2: Official Answer Key is released and attached
    const officialAnswerKeyText = [
      'Official Final Answer Key',
      'Q1: C (Marks: 2, Negative: 0.67)',
      'Q2: A, B (Marks: 2, Negative: 0)',
      'Q3: 40.0 to 45.0 (Marks: 2, Negative: 0)',
    ].join('\n');

    const { paper: upgradedPaper, updatedCount } = await UniversalMockService.attachLateAnswerKey(
      day1Paper.id,
      { textData: officialAnswerKeyText }
    );

    expect(updatedCount).toBe(3);
    expect(upgradedPaper.answerKeyStatus).toBe('AVAILABLE');
    expect(upgradedPaper.isScored).toBe(true);

    // Verify questions on the paper now have official answers
    expect(upgradedPaper.questions[0].correctAnswer).toBe('C');
    expect(upgradedPaper.questions[0].correctAnswerIndex).toBe(2);
    expect(upgradedPaper.questions[1].correctAnswerSet).toEqual(['A', 'B']);
    expect(upgradedPaper.questions[2].answerRange).toEqual({ min: 40.0, max: 45.0 });

    // Day 2: Candidate attempt is re-scored immediately with zero loss of entered answers
    const day2Result = ExamService.calculateExamResult(candidateSession, upgradedPaper);
    expect(day2Result.isScoreCalculated).toBe(true);
    expect(day2Result.answerKeyStatus).toBe('AVAILABLE');
    expect(day2Result.correctCount).toBe(3);
    expect(day2Result.wrongCount).toBe(0);
    expect(day2Result.totalScore).toBe(6); // 2 + 2 + 2 = 6 marks
    expect(day2Result.accuracy).toBe(100);
  });

  // =========================================================================
  // Instructions Parser Test
  // =========================================================================
  it('Extracts exam duration and negative marking rules from paper instruction header', () => {
    const instructionLines = [
      'Time Allowed: 3 Hours (180 Minutes)',
      'Total Marks: 100',
      'For every wrong answer, 1/3 mark will be deducted.',
    ];
    const rules = extractPaperInstructions(instructionLines);
    expect(rules.durationMinutes).toBe(180);
    expect(rules.totalMarks).toBe(100);
    expect(rules.negativeMarkingFraction).toBeCloseTo(1 / 3, 2);
  });
});
