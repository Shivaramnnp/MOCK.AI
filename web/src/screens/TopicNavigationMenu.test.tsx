// @vitest-environment jsdom
/**
 * Topic Navigation Menu & Taxonomy Architecture Test Suite
 *
 * Verifies:
 * 1. Hierarchical and configurable taxonomy registry (SSC CHSL, GATE, custom).
 * 2. Deterministic rule-based topic classification with unclassified fallbacks.
 * 3. Primary & secondary topic resolution.
 * 4. Active Exam Answer-Key Isolation (attempt counts only, no correctness leaks).
 * 5. Topic Navigation Menu rendering, selection, filtering, and jump actions.
 * 6. Question Palette integration (dimming unrelated questions, highlighting matches, preserving all 100 questions).
 * 7. Mobile drawer topic filter integration.
 * 8. Zero side effects on exam engine, timer, answers, or submission.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {
  getExamTaxonomy,
  findSubjectTaxonomy,
  registerExamTaxonomy,
  ExamTaxonomy,
} from '../services/taxonomy/topicTaxonomy';
import {
  getQuestionTopicMetadata,
  calculateTopicProgress,
  UNCATEGORIZED_TOPIC_ID,
  UNCATEGORIZED_TOPIC_NAME,
} from '../services/taxonomy/topicClassifier';
import { TopicNavigationMenu } from '../components/exam/TopicNavigationMenu';
import { CompetitiveExamPlayerScreen } from './CompetitiveExamPlayerScreen';
import { ExamPaper, ExamTestSession, CompetitiveQuestion } from '../types';

describe('Topic Taxonomy & Registry', () => {
  it('retrieves built-in SSC CHSL taxonomy with all four subjects and computer', () => {
    const sscTaxonomy = getExamTaxonomy('ssc-chsl');
    expect(sscTaxonomy).not.toBeNull();
    expect(sscTaxonomy?.examId).toBe('ssc-chsl');

    const subjectIds = sscTaxonomy?.subjects.map((s) => s.id);
    expect(subjectIds).toContain('english_language');
    expect(subjectIds).toContain('general_intelligence_reasoning');
    expect(subjectIds).toContain('quantitative_aptitude');
    expect(subjectIds).toContain('general_awareness');
    expect(subjectIds).toContain('computer_knowledge');
  });

  it('retrieves built-in GATE taxonomy', () => {
    const gateTaxonomy = getExamTaxonomy('gate');
    expect(gateTaxonomy).not.toBeNull();
    expect(gateTaxonomy?.subjects.some((s) => s.id === 'general_aptitude')).toBe(true);
  });

  it('resolves subjects via section aliases', () => {
    const ssc = getExamTaxonomy('ssc-chsl')!;
    const engByAlias = findSubjectTaxonomy(ssc, 'English Language');
    expect(engByAlias?.id).toBe('english_language');

    const quantByAlias = findSubjectTaxonomy(ssc, 'Part-C');
    expect(quantByAlias?.id).toBe('quantitative_aptitude');

    const reasoningByAlias = findSubjectTaxonomy(ssc, 'General Intelligence & Reasoning');
    expect(reasoningByAlias?.id).toBe('general_intelligence_reasoning');
  });

  it('allows registering and querying custom exam taxonomies', () => {
    const customTax: ExamTaxonomy = {
      examId: 'custom-bank-po',
      examName: 'Bank Probationary Officer',
      subjects: [
        {
          id: 'banking_awareness',
          name: 'Banking Awareness',
          topics: [
            {
              id: 'monetary_policy',
              name: 'Monetary Policy',
              keywords: ['repo rate', 'crr', 'slr', 'rbi'],
            },
          ],
        },
      ],
    };

    registerExamTaxonomy(customTax);
    const retrieved = getExamTaxonomy('custom-bank-po');
    expect(retrieved?.examName).toBe('Bank Probationary Officer');
  });
});

describe('Deterministic Topic Classification', () => {
  it('classifies vocabulary questions in English Language', () => {
    const qSynonym: Partial<CompetitiveQuestion> = {
      questionText: 'Select the most appropriate synonym of the given word: BENEVOLENT',
      sectionName: 'English Language',
      examId: 'ssc-chsl',
    };
    const meta = getQuestionTopicMetadata(qSynonym as any);
    expect(meta.primaryTopicId).toBe('vocabulary');
    expect(meta.primaryTopicName).toBe('Vocabulary');
    expect(meta.classificationStatus).toBe('VERIFIED');
    expect(meta.classificationSource).toBe('RULE_BASED');
  });

  it('classifies grammar error detection questions in English Language', () => {
    const qError: Partial<CompetitiveQuestion> = {
      questionText: 'The following sentence contains a grammatical error. Identify the segment.',
      sectionName: 'English Language',
      examId: 'ssc-chsl',
    };
    const meta = getQuestionTopicMetadata(qError as any);
    expect(meta.primaryTopicId).toBe('grammar');
    expect(meta.classificationStatus).toBe('VERIFIED');
  });

  it('classifies series questions in Reasoning', () => {
    const qSeries: Partial<CompetitiveQuestion> = {
      questionText: 'What should come in place of the question mark (?) in the given series? 40 ? 18 10 4 0',
      sectionName: 'General Intelligence & Reasoning',
      examId: 'ssc-chsl',
    };
    const meta = getQuestionTopicMetadata(qSeries as any);
    expect(meta.primaryTopicId).toBe('series');
    expect(meta.classificationStatus).toBe('VERIFIED');
  });

  it('classifies trigonometry and geometry questions in Quantitative Aptitude', () => {
    const qTrig: Partial<CompetitiveQuestion> = {
      questionText: 'If \\sin \\theta + \\cos \\theta = \\sqrt{2}, find the value of \\tan \\theta.',
      sectionName: 'Quantitative Aptitude',
      examId: 'ssc-chsl',
    };
    const meta = getQuestionTopicMetadata(qTrig as any);
    expect(meta.primaryTopicId).toBe('trigonometry');
    expect(meta.classificationStatus).toBe('VERIFIED');
  });

  it('handles unclassified questions under Uncategorized without inventing false taxonomy', () => {
    const qUnclassified: Partial<CompetitiveQuestion> = {
      questionText: 'XYZ 123 arbitrary non-matching text',
      sectionName: 'General Awareness',
      examId: 'ssc-chsl',
    };
    const meta = getQuestionTopicMetadata(qUnclassified as any);
    expect(meta.primaryTopicId).toBe(UNCATEGORIZED_TOPIC_ID);
    expect(meta.primaryTopicName).toBe(UNCATEGORIZED_TOPIC_NAME);
    expect(meta.classificationStatus).toBe('UNCLASSIFIED');
  });

  it('respects pre-existing topicMetadata on questions', () => {
    const qWithMeta: Partial<CompetitiveQuestion> = {
      questionText: 'Some question text',
      sectionName: 'English Language',
      topicMetadata: {
        primaryTopicId: 'cloze_test',
        primaryTopicName: 'Cloze Test',
        secondaryTopicIds: ['comprehension'],
        secondaryTopicNames: ['Comprehension'],
        classificationStatus: 'VERIFIED',
        classificationSource: 'OFFICIAL',
        confidence: 1.0,
      },
    };
    const meta = getQuestionTopicMetadata(qWithMeta as any);
    expect(meta.primaryTopicId).toBe('cloze_test');
    expect(meta.classificationSource).toBe('OFFICIAL');
  });
});

describe('Topic Progress Calculation & Active Exam Isolation', () => {
  const sampleQuestions: Partial<CompetitiveQuestion>[] = [
    {
      id: 'q1',
      questionNumber: 1,
      sectionId: 'sec-eng',
      sectionName: 'English Language',
      questionText: 'Select the most appropriate synonym of ABUNDANT',
      // Explicitly including dummy answer keys to prove isolation
      correctAnswer: 'A',
      correctAnswerIndex: 0,
    },
    {
      id: 'q2',
      questionNumber: 2,
      sectionId: 'sec-eng',
      sectionName: 'English Language',
      questionText: 'Select the most appropriate antonym of HOSTILE',
      correctAnswer: 'B',
      correctAnswerIndex: 1,
    },
    {
      id: 'q3',
      questionNumber: 3,
      sectionId: 'sec-eng',
      sectionName: 'English Language',
      questionText: 'The following sentence contains a grammatical error: She do not know.',
      correctAnswer: 'C',
      correctAnswerIndex: 2,
    },
    {
      id: 'q4',
      questionNumber: 4,
      sectionId: 'sec-eng',
      sectionName: 'English Language',
      questionText: 'Unclassified random query 9999',
      correctAnswer: 'D',
      correctAnswerIndex: 3,
    },
  ];

  it('calculates attempt and review counts without evaluating correctness', () => {
    // Candidate answered q1 (wrong choice 'B' vs key 'A'), left q2 blank, answered q3, bookmarked q1 & q2
    const userAnswers: Record<number, any> = { 0: 1, 2: 2 }; // q1 answered (idx 0), q3 answered (idx 2)
    const bookmarks: Record<number, boolean> = { 0: true, 1: true };

    const result = calculateTopicProgress(
      sampleQuestions as any,
      userAnswers,
      bookmarks,
      'ssc-chsl',
      'sec-eng'
    );

    expect(result.allTotal).toBe(4);
    expect(result.allAttempted).toBe(2);
    expect(result.allUnattempted).toBe(2);
    expect(result.allReview).toBe(2);

    // Verify Vocabulary topic
    const vocab = result.topics.find((t) => t.topicId === 'vocabulary');
    expect(vocab).toBeDefined();
    expect(vocab?.totalQuestions).toBe(2); // q1 and q2
    expect(vocab?.attemptedQuestions).toBe(1); // q1 answered
    expect(vocab?.unattemptedQuestions).toBe(1); // q2 unattempted
    expect(vocab?.reviewQuestions).toBe(2); // both bookmarked

    // Verify Uncategorized topic is present and placed last
    const uncat = result.topics.find((t) => t.topicId === UNCATEGORIZED_TOPIC_ID);
    expect(uncat).toBeDefined();
    expect(uncat?.totalQuestions).toBe(1);
    expect(result.topics[result.topics.length - 1].topicId).toBe(UNCATEGORIZED_TOPIC_ID);

    // CRITICAL: Ensure NO correctness evaluation occurred
    expect((vocab as any).correctQuestions).toBeUndefined();
    expect((result as any).score).toBeUndefined();
  });
});

describe('TopicNavigationMenu Component', () => {
  const mockSummaries = [
    {
      topicId: 'vocabulary',
      topicName: 'Vocabulary',
      totalQuestions: 5,
      attemptedQuestions: 3,
      unattemptedQuestions: 2,
      reviewQuestions: 1,
      questionIndices: [0, 1, 6, 12, 18],
      questionNumbers: [1, 2, 7, 13, 19],
      classificationStatus: 'VERIFIED' as const,
    },
    {
      topicId: 'grammar',
      topicName: 'Grammar',
      totalQuestions: 8,
      attemptedQuestions: 5,
      unattemptedQuestions: 3,
      reviewQuestions: 2,
      questionIndices: [2, 3, 4, 7, 8, 9, 10, 11],
      questionNumbers: [3, 4, 5, 8, 9, 10, 11, 12],
      classificationStatus: 'VERIFIED' as const,
    },
    {
      topicId: UNCATEGORIZED_TOPIC_ID,
      topicName: UNCATEGORIZED_TOPIC_NAME,
      totalQuestions: 2,
      attemptedQuestions: 0,
      unattemptedQuestions: 2,
      reviewQuestions: 0,
      questionIndices: [5, 13],
      questionNumbers: [6, 14],
      classificationStatus: 'UNCLASSIFIED' as const,
    },
  ];

  afterEach(() => {
    cleanup();
  });

  it('renders Topic Menu header and [ All Topics ] master button', () => {
    const handleSelect = vi.fn();
    render(
      <TopicNavigationMenu
        selectedTopicId={null}
        onSelectTopic={handleSelect}
        topicSummaries={mockSummaries}
        allTotal={15}
        allAttempted={8}
        allReview={3}
      />
    );

    expect(screen.getByText('Topic Menu')).toBeInTheDocument();
    expect(screen.getByText('3 Topics Available')).toBeInTheDocument();
    expect(screen.getByTestId('all-topics-btn')).toBeInTheDocument();
    expect(screen.getByText('15 Qs')).toBeInTheDocument();
    expect(screen.getByText('8 Done')).toBeInTheDocument();
    expect(screen.getByText('3 Rev')).toBeInTheDocument();
  });

  it('renders all topics with attempt stats and selection action', () => {
    const handleSelect = vi.fn();
    render(
      <TopicNavigationMenu
        selectedTopicId={null}
        onSelectTopic={handleSelect}
        topicSummaries={mockSummaries}
        allTotal={15}
        allAttempted={8}
        allReview={3}
      />
    );

    expect(screen.getByText('Vocabulary')).toBeInTheDocument();
    expect(screen.getByText('Grammar')).toBeInTheDocument();
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();

    const vocabItem = screen.getByTestId('topic-item-vocabulary');
    fireEvent.click(vocabItem);
    expect(handleSelect).toHaveBeenCalledWith('vocabulary');
  });

  it('renders active filter banner and jump to first question when a topic is selected', () => {
    const handleSelect = vi.fn();
    const handleJump = vi.fn();

    render(
      <TopicNavigationMenu
        selectedTopicId="vocabulary"
        onSelectTopic={handleSelect}
        topicSummaries={mockSummaries}
        allTotal={15}
        allAttempted={8}
        allReview={3}
        onJumpToFirstInTopic={handleJump}
      />
    );

    expect(screen.getByText('Filtered')).toBeInTheDocument();
    expect(screen.getByText('Emphasizing:')).toBeInTheDocument();
    expect(screen.getByText('Q#1 is first in topic')).toBeInTheDocument();

    const jumpBtn = screen.getByText('Jump to Q1');
    fireEvent.click(jumpBtn);
    expect(handleJump).toHaveBeenCalledWith('vocabulary');

    // Clicking All Topics or Clear clears filter
    const allTopicsBtn = screen.getByTestId('all-topics-btn');
    fireEvent.click(allTopicsBtn);
    expect(handleSelect).toHaveBeenCalledWith(null);
  });
});

describe('CompetitiveExamPlayerScreen Question Palette Integration', () => {
  const dummyPaper: ExamPaper = {
    id: 'test-paper-chsl-2024',
    examId: 'ssc-chsl',
    examName: 'SSC CHSL',
    title: 'SSC CHSL 2024 Mock Test',
    subTitle: 'Tier 1 Shift 1',
    date: '2024-07-01',
    shift: 'Shift 1',
    editionYear: 2024,
    tier: 'Tier 1',
    language: 'English',
    paperType: 'CBE_OBJECTIVE',
    durationMinutes: 60,
    totalMarks: 200,
    totalQuestions: 4,
    markingScheme: {
      marksPerCorrect: 2.0,
      negativeMarks: 0.5,
      unansweredMarks: 0.0,
    },
    sections: [
      {
        id: 'sec-1',
        name: 'English Language',
        questionCount: 4,
        maxMarks: 8,
        startIndex: 0,
        endIndex: 3,
      },
    ],
    questions: [
      {
        id: 'q-1',
        questionNumber: 1,
        sectionId: 'sec-1',
        sectionName: 'English Language',
        questionText: 'Select the most appropriate synonym of BENIGN',
        options: ['Gentle', 'Harsh', 'Cruel', 'Bitter'],
        correctAnswer: 'A',
        correctAnswerIndex: 0,
        explanation: 'Benign means gentle.',
        marks: 2,
        negativeMarks: 0.5,
        examId: 'ssc-chsl',
        year: 2024,
        date: '2024-07-01',
        shift: 'Shift 1',
        tier: 'Tier 1',
        language: 'English',
      },
      {
        id: 'q-2',
        questionNumber: 2,
        sectionId: 'sec-1',
        sectionName: 'English Language',
        questionText: 'Select the most appropriate antonym of OBSCURE',
        options: ['Clear', 'Dark', 'Dim', 'Vague'],
        correctAnswer: 'A',
        correctAnswerIndex: 0,
        explanation: 'Clear is opposite of obscure.',
        marks: 2,
        negativeMarks: 0.5,
        examId: 'ssc-chsl',
        year: 2024,
        date: '2024-07-01',
        shift: 'Shift 1',
        tier: 'Tier 1',
        language: 'English',
      },
      {
        id: 'q-3',
        questionNumber: 3,
        sectionId: 'sec-1',
        sectionName: 'English Language',
        questionText: 'The segment contains a grammatical error: They was going.',
        options: ['They was', 'going', 'to the', 'market'],
        correctAnswer: 'A',
        correctAnswerIndex: 0,
        explanation: 'They were going is correct.',
        marks: 2,
        negativeMarks: 0.5,
        examId: 'ssc-chsl',
        year: 2024,
        date: '2024-07-01',
        shift: 'Shift 1',
        tier: 'Tier 1',
        language: 'English',
      },
      {
        id: 'q-4',
        questionNumber: 4,
        sectionId: 'sec-1',
        sectionName: 'English Language',
        questionText: 'Completely unclassified query xyz 9988',
        options: ['One', 'Two', 'Three', 'Four'],
        correctAnswer: 'A',
        correctAnswerIndex: 0,
        explanation: 'N/A',
        marks: 2,
        negativeMarks: 0.5,
        examId: 'ssc-chsl',
        year: 2024,
        date: '2024-07-01',
        shift: 'Shift 1',
        tier: 'Tier 1',
        language: 'English',
      },
    ],
  };

  const dummySession: ExamTestSession = {
    sessionId: 'test-session-1',
    paperId: 'test-paper-chsl-2024',
    examId: 'ssc-chsl',
    paperTitle: 'SSC CHSL 2024 Mock Test',
    userId: 'user-1',
    status: 'IN_PROGRESS',
    startedAt: Date.now(),
    lastSavedAt: Date.now(),
    expiresAt: Date.now() + 3600 * 1000,
    completedAt: null,
    durationSeconds: 3600,
    timeRemainingSeconds: 3600,
    elapsedSeconds: 0,
    currentQuestionIndex: 0,
    currentSectionId: 'sec-1',
    userAnswers: {},
    questionStatuses: {},
    version: 1,
  };

  afterEach(() => {
    cleanup();
  });

  it('renders Topic Menu in sidebar above Question Palette', () => {
    render(
      <CompetitiveExamPlayerScreen
        paper={dummyPaper}
        initialSession={dummySession}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const topicMenus = screen.getAllByTestId('topic-navigation-menu');
    expect(topicMenus.length).toBeGreaterThan(0);
    expect(screen.getByText('Question Palette (English Language)')).toBeInTheDocument();

    // All questions 1, 2, 3, 4 are present in the palette
    expect(screen.getAllByRole('button', { name: '1' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '2' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '3' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '4' })[0]).toBeInTheDocument();
  });

  it('dims unrelated questions and highlights matching questions when topic is selected', () => {
    render(
      <CompetitiveExamPlayerScreen
        paper={dummyPaper}
        initialSession={dummySession}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    // Click on Vocabulary topic (covers Q1 and Q2)
    const vocabBtn = screen.getAllByTestId('topic-item-vocabulary')[0];
    fireEvent.click(vocabBtn);

    // Q1 & Q2 must have highlighted classes (ring-indigo-500)
    const btn1 = screen.getAllByRole('button', { name: '1' })[0];
    const btn2 = screen.getAllByRole('button', { name: '2' })[0];
    const btn3 = screen.getAllByRole('button', { name: '3' })[0];
    const btn4 = screen.getAllByRole('button', { name: '4' })[0];

    expect(btn1.className).toContain('ring-indigo-500');
    expect(btn2.className).toContain('ring-indigo-500');

    // Q3 & Q4 must be dimmed with opacity-25
    expect(btn3.className).toContain('opacity-25');
    expect(btn4.className).toContain('opacity-25');

    // All 4 buttons STILL EXIST and remain clickable!
    fireEvent.click(btn3);
    expect(screen.getByText('Question 3 of 4')).toBeInTheDocument();
  });

  it('restores full palette visibility when All Topics is clicked', () => {
    render(
      <CompetitiveExamPlayerScreen
        paper={dummyPaper}
        initialSession={dummySession}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    // Select Vocabulary
    const vocabBtn = screen.getAllByTestId('topic-item-vocabulary')[0];
    fireEvent.click(vocabBtn);

    // Click All Topics to reset
    const allTopicsBtn = screen.getAllByTestId('all-topics-btn')[0];
    fireEvent.click(allTopicsBtn);

    const btn3 = screen.getAllByRole('button', { name: '3' })[0];
    expect(btn3.className).not.toContain('opacity-25');
  });
});

describe('Topic Menu Layout Stability, Bounded Scrolling & State Preservation', () => {
  const dummyPaper: ExamPaper = {
    id: 'test-paper-layout-stability',
    examId: 'ssc-chsl',
    examName: 'SSC CHSL',
    title: 'SSC CHSL 2024 Layout Stability Exam',
    subTitle: 'Tier 1 Shift 1',
    date: '2024-07-01',
    shift: 'Shift 1',
    editionYear: 2024,
    tier: 'Tier 1',
    language: 'English',
    paperType: 'CBE_OBJECTIVE',
    durationMinutes: 60,
    totalMarks: 200,
    totalQuestions: 4,
    markingScheme: {
      marksPerCorrect: 2.0,
      negativeMarks: 0.5,
      unansweredMarks: 0.0,
    },
    sections: [
      {
        id: 'sec-1',
        name: 'English Language',
        questionCount: 4,
        maxMarks: 8,
        startIndex: 0,
        endIndex: 3,
      },
    ],
    questions: [
      {
        id: 'q-1',
        questionNumber: 1,
        sectionId: 'sec-1',
        sectionName: 'English Language',
        questionText: 'Select the most appropriate synonym of BENIGN',
        options: ['Gentle', 'Harsh', 'Cruel', 'Bitter'],
        correctAnswer: 'A',
        correctAnswerIndex: 0,
        explanation: 'Benign means gentle.',
        marks: 2,
        negativeMarks: 0.5,
        examId: 'ssc-chsl',
        year: 2024,
        date: '2024-07-01',
        shift: 'Shift 1',
        tier: 'Tier 1',
        language: 'English',
      },
      {
        id: 'q-2',
        questionNumber: 2,
        sectionId: 'sec-1',
        sectionName: 'English Language',
        questionText: 'Select the most appropriate antonym of OBSCURE',
        options: ['Clear', 'Dark', 'Dim', 'Vague'],
        correctAnswer: 'A',
        correctAnswerIndex: 0,
        explanation: 'Clear is opposite of obscure.',
        marks: 2,
        negativeMarks: 0.5,
        examId: 'ssc-chsl',
        year: 2024,
        date: '2024-07-01',
        shift: 'Shift 1',
        tier: 'Tier 1',
        language: 'English',
      },
      {
        id: 'q-3',
        questionNumber: 3,
        sectionId: 'sec-1',
        sectionName: 'English Language',
        questionText: 'The segment contains a grammatical error: They was going.',
        options: ['They was', 'going', 'to the', 'market'],
        correctAnswer: 'A',
        correctAnswerIndex: 0,
        explanation: 'They were going is correct.',
        marks: 2,
        negativeMarks: 0.5,
        examId: 'ssc-chsl',
        year: 2024,
        date: '2024-07-01',
        shift: 'Shift 1',
        tier: 'Tier 1',
        language: 'English',
      },
      {
        id: 'q-4',
        questionNumber: 4,
        sectionId: 'sec-1',
        sectionName: 'English Language',
        questionText: 'Completely unclassified query xyz 9988',
        options: ['One', 'Two', 'Three', 'Four'],
        correctAnswer: 'A',
        correctAnswerIndex: 0,
        explanation: 'N/A',
        marks: 2,
        negativeMarks: 0.5,
        examId: 'ssc-chsl',
        year: 2024,
        date: '2024-07-01',
        shift: 'Shift 1',
        tier: 'Tier 1',
        language: 'English',
      },
    ],
  };

  const dummySession: ExamTestSession = {
    sessionId: 'test-session-layout-1',
    paperId: 'test-paper-layout-stability',
    examId: 'ssc-chsl',
    paperTitle: 'SSC CHSL 2024 Layout Stability Exam',
    userId: 'user-1',
    status: 'IN_PROGRESS',
    startedAt: Date.now(),
    lastSavedAt: Date.now(),
    expiresAt: Date.now() + 3600 * 1000,
    completedAt: null,
    durationSeconds: 3600,
    timeRemainingSeconds: 3600,
    elapsedSeconds: 0,
    currentQuestionIndex: 0,
    currentSectionId: 'sec-1',
    userAnswers: {},
    questionStatuses: {},
    version: 1,
  };

  afterEach(() => {
    cleanup();
  });

  it('toggles Topic Menu expansion without unmounting the question panel or resetting the question', () => {
    render(
      <CompetitiveExamPlayerScreen
        paper={dummyPaper}
        initialSession={dummySession}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    // Initial state: question 1 is active
    expect(screen.getByText('Question 1 of 4')).toBeInTheDocument();
    expect(screen.getByText('Select the most appropriate synonym of BENIGN')).toBeInTheDocument();

    // The topic menu content is expanded by default on desktop
    const toggleButtons = screen.getAllByTestId('topic-menu-toggle-btn');
    const desktopToggle = toggleButtons[0];
    expect(desktopToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByTestId('topic-menu-content')[0]).toBeInTheDocument();

    // Click collapse
    fireEvent.click(desktopToggle);
    expect(desktopToggle).toHaveAttribute('aria-expanded', 'false');

    // Question content and controls must remain completely intact
    expect(screen.getByText('Question 1 of 4')).toBeInTheDocument();
    expect(screen.getByText('Select the most appropriate synonym of BENIGN')).toBeInTheDocument();
    expect(screen.getByText('Save & Next')).toBeInTheDocument();
    expect(screen.getByText('Mark for Review & Next')).toBeInTheDocument();

    // Click expand again
    fireEvent.click(desktopToggle);
    expect(desktopToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByTestId('topic-menu-content')[0]).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 4')).toBeInTheDocument();
  });

  it('bounds topic list height and applies independent overscroll-contain scrolling', () => {
    const longTopicList = Array.from({ length: 25 }, (_, idx) => ({
      topicId: `topic-${idx}`,
      topicName: `Topic Dimension Sub-Module ${idx + 1} with Extended Syllabus Taxonomy Specification`,
      totalQuestions: 5,
      attemptedQuestions: 2,
      unattemptedQuestions: 3,
      reviewQuestions: 1,
      questionIndices: [idx],
      questionNumbers: [idx + 1],
      classificationStatus: 'VERIFIED' as const,
    }));

    render(
      <TopicNavigationMenu
        selectedTopicId={null}
        onSelectTopic={vi.fn()}
        topicSummaries={longTopicList}
        allTotal={125}
        allAttempted={50}
        allReview={25}
      />
    );

    const container = screen.getByTestId('topic-list-container');
    // Must contain overflow-y-auto and overscroll-contain to isolate scroll behavior
    expect(container.className).toContain('overflow-y-auto');
    expect(container.className).toContain('overscroll-contain');
    expect(container.className).toContain('max-h-40');

    // All 25 topics must be rendered inside the scrollable container with titles
    expect(screen.getAllByTestId(/^topic-item-topic-/).length).toBe(25);
    const firstItem = screen.getByTestId('topic-item-topic-0');
    expect(firstItem).toHaveAttribute('title', longTopicList[0].topicName);
  });

  it('supports compact mode with tighter bounding for overlay drawers', () => {
    const mockTopics = [
      {
        topicId: 'topic-1',
        topicName: 'Vocabulary',
        totalQuestions: 5,
        attemptedQuestions: 2,
        unattemptedQuestions: 3,
        reviewQuestions: 0,
        questionIndices: [0],
        questionNumbers: [1],
        classificationStatus: 'VERIFIED' as const,
      },
    ];

    render(
      <TopicNavigationMenu
        selectedTopicId={null}
        onSelectTopic={vi.fn()}
        topicSummaries={mockTopics}
        allTotal={5}
        allAttempted={2}
        allReview={0}
        isCompact={true}
        defaultExpanded={false}
      />
    );

    // Initial state is collapsed when defaultExpanded=false
    const toggleBtn = screen.getByTestId('topic-menu-toggle-btn');
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('topic-menu-content')).not.toBeInTheDocument();

    // Expand menu
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    const container = screen.getByTestId('topic-list-container');
    expect(container.className).toContain('max-h-36');
    expect(container.className).toContain('overscroll-contain');
  });

  it('preserves answer selections, question statuses, and timer when expanding/collapsing and switching topics', () => {
    render(
      <CompetitiveExamPlayerScreen
        paper={dummyPaper}
        initialSession={dummySession}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    // 1. Select answer on Question 1 (Option A: "Gentle")
    const optionGentle = screen.getByText('Gentle');
    fireEvent.click(optionGentle);

    // Click "Save & Next" -> saves Q1 as ANSWERED and moves to Question 2
    const saveAndNextBtn = screen.getByText('Save & Next');
    fireEvent.click(saveAndNextBtn);

    expect(screen.getByText('Question 2 of 4')).toBeInTheDocument();

    // Verify palette shows Question 1 as answered (emerald)
    const q1PaletteBtn = screen.getAllByRole('button', { name: '1' })[0];
    expect(q1PaletteBtn.className).toContain('bg-emerald-500');

    // 2. Collapse and re-expand Topic Menu
    const toggleBtn = screen.getAllByTestId('topic-menu-toggle-btn')[0];
    fireEvent.click(toggleBtn); // Collapse
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggleBtn); // Expand
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');

    // Jump back to Question 1
    fireEvent.click(q1PaletteBtn);
    expect(screen.getByText('Question 1 of 4')).toBeInTheDocument();

    // The selected answer "Gentle" is PRESERVED!
    const gentleOption = screen.getByText('Gentle').closest('div[class*="cursor-pointer"]')!;
    expect(gentleOption.className).toContain('border-brand-primary');

    // 3. Filter by Vocabulary topic
    const vocabBtn = screen.getAllByTestId('topic-item-vocabulary')[0];
    fireEvent.click(vocabBtn);

    // Q1 answer is STILL preserved while filtered!
    expect(gentleOption.className).toContain('border-brand-primary');
    expect(q1PaletteBtn.className).toContain('bg-emerald-500');

    // Clear topic filter via Clear button
    const clearBtn = screen.getByTestId('clear-active-topic-btn');
    fireEvent.click(clearBtn);

    // Q1 answer remains preserved
    expect(gentleOption.className).toContain('border-brand-primary');
  });

  it('keeps question action controls completely usable across question navigation while Topic Menu is expanded', () => {
    render(
      <CompetitiveExamPlayerScreen
        paper={dummyPaper}
        initialSession={dummySession}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    // On Question 1, "Previous" is disabled
    const prevBtn = screen.getByText('Previous').closest('button')!;
    expect(prevBtn).toBeDisabled();

    // Mark for Review & Next moves to Q2
    const markReviewBtn = screen.getByText('Mark for Review & Next');
    fireEvent.click(markReviewBtn);

    expect(screen.getByText('Question 2 of 4')).toBeInTheDocument();
    expect(prevBtn).not.toBeDisabled();

    // Click Previous returns to Q1
    fireEvent.click(prevBtn);
    expect(screen.getByText('Question 1 of 4')).toBeInTheDocument();

    // Status on Q1 palette is marked for review (purple)
    const q1Btn = screen.getAllByRole('button', { name: '1' })[0];
    expect(q1Btn.className).toContain('bg-purple-500');
  });
});

describe('Topic Classification Coverage vs Verified Accuracy & Count Invariants', () => {
  it('strictly preserves exact count invariants: sum(topics) == allTotal, All Topics == questions.length', () => {
    const mockQuestions = [
      { id: '1', questionText: 'Select the most appropriate synonym of BENIGN', sectionName: 'English Language', examId: 'ssc-chsl' },
      { id: '2', questionText: 'If \\sin \\theta + \\cos \\theta = \\sqrt{2}, find the value of \\tan \\theta.', sectionName: 'Quantitative Aptitude', examId: 'ssc-chsl' },
      { id: '3', questionText: 'In ANSI-C program #include <stdio.h> int main() { return 0; }', sectionName: 'Computer Science & Information Technology', examId: 'gate' },
      { id: '4', questionText: 'Random unstructured question with no match xyz123', sectionName: 'Computer Science & Information Technology', examId: 'gate' },
      { id: '5', questionText: 'Another unclassified query abc987', sectionName: 'Computer Science & Information Technology', examId: 'gate' },
    ];

    const currentAnswers = { 0: 'A', 2: 'B' }; // 2 answered
    const bookmarks = { 1: true, 2: true }; // 2 bookmarked

    const result = calculateTopicProgress(mockQuestions, currentAnswers, bookmarks);

    // Invariant 1: allTotal strictly matches questions array length
    expect(result.allTotal).toBe(5);
    expect(result.allAttempted).toBe(2);
    expect(result.allReview).toBe(2);

    // Invariant 2: sum of individual topic totals strictly matches allTotal without double-counting
    const sumTotalQuestions = result.topics.reduce((acc, t) => acc + t.totalQuestions, 0);
    expect(sumTotalQuestions).toBe(result.allTotal);

    // Invariant 3: sum of topic attempts and reviews matches overall
    const sumAttempted = result.topics.reduce((acc, t) => acc + t.attemptedQuestions, 0);
    expect(sumAttempted).toBe(result.allAttempted);

    const sumReview = result.topics.reduce((acc, t) => acc + t.reviewQuestions, 0);
    expect(sumReview).toBe(result.allReview);

    // Invariant 4: Uncategorized is counted and positioned last
    const uncat = result.topics.find((t) => t.topicId === UNCATEGORIZED_TOPIC_ID);
    expect(uncat).toBeDefined();
    expect(uncat?.totalQuestions).toBe(2);
    expect(result.topics[result.topics.length - 1].topicId).toBe(UNCATEGORIZED_TOPIC_ID);
  });

  it('measures 100% verified classification accuracy with zero false classifications on authoritative reference set', () => {
    interface ReferenceSample {
      question: { questionText: string; sectionName: string; examId: string };
      expectedTopicId: string;
      expectedTopicName: string;
    }

    const referenceSet: ReferenceSample[] = [
      // GATE CS Core
      {
        question: { questionText: 'In ANSI-C program #include<stdio.h> int funcp(){ static int x = 1; }', sectionName: 'Computer Science & Information Technology', examId: 'gate' },
        expectedTopicId: 'programming_data_structures',
        expectedTopicName: 'Programming & Data Structures',
      },
      {
        question: { questionText: '57-bit virtual addressing multi-level page tables with inverted page table', sectionName: 'Computer Science & Information Technology', examId: 'gate' },
        expectedTopicId: 'operating_systems',
        expectedTopicName: 'Operating Systems',
      },
      {
        question: { questionText: 'Consider IEEE-754 single precision floating point numbers and operands', sectionName: 'Computer Science & Information Technology', examId: 'gate' },
        expectedTopicId: 'computer_organization',
        expectedTopicName: 'Computer Organization & Architecture',
      },
      {
        question: { questionText: 'Consider sequential digital circuit with T flip-flops and D flip-flops CLKIN', sectionName: 'Computer Science & Information Technology', examId: 'gate' },
        expectedTopicId: 'digital_logic',
        expectedTopicName: 'Digital Logic',
      },
      {
        question: { questionText: 'Which regular languages are accepted by deterministic finite automaton (DFA)?', sectionName: 'Computer Science & Information Technology', examId: 'gate' },
        expectedTopicId: 'theory_of_computation',
        expectedTopicName: 'Theory of Computation',
      },
      {
        question: { questionText: 'Bottom-up parser with LR(1) grammar and syntax-directed translation SDT', sectionName: 'Computer Science & Information Technology', examId: 'gate' },
        expectedTopicId: 'compiler_design',
        expectedTopicName: 'Compiler Design',
      },
      {
        question: { questionText: 'Functional dependency and BCNF normal form lossless decomposition in SQL relational database', sectionName: 'Computer Science & Information Technology', examId: 'gate' },
        expectedTopicId: 'databases',
        expectedTopicName: 'Databases',
      },
      {
        question: { questionText: 'Sliding window protocol with Go-Back-N ARQ and TCP congestion window', sectionName: 'Computer Science & Information Technology', examId: 'gate' },
        expectedTopicId: 'computer_networks',
        expectedTopicName: 'Computer Networks',
      },
      {
        question: { questionText: 'Dijkstra shortest path algorithm worst-case time complexity', sectionName: 'Computer Science & Information Technology', examId: 'gate' },
        expectedTopicId: 'algorithms',
        expectedTopicName: 'Algorithms',
      },
      // GATE Aerospace Engineering Core
      {
        question: { questionText: 'Longitudinally statically stable aircraft pitching moment vs angle of attack', sectionName: 'Aerospace Engineering', examId: 'gate' },
        expectedTopicId: 'flight_mechanics',
        expectedTopicName: 'Flight Mechanics & Aircraft Performance',
      },
      {
        question: { questionText: 'Normal shock wave at Mach number 2.0 in supersonic flow over an airfoil', sectionName: 'Aerospace Engineering', examId: 'gate' },
        expectedTopicId: 'aerodynamics',
        expectedTopicName: 'Aerodynamics & Compressible Flow',
      },
      {
        question: { questionText: 'Cantilever beam moment reaction and shear flow in thin-walled beam', sectionName: 'Aerospace Engineering', examId: 'gate' },
        expectedTopicId: 'aircraft_structures',
        expectedTopicName: 'Aircraft Structures & Vibrations',
      },
      {
        question: { questionText: 'Specific impulse of rocket propulsion with convergent-divergent nozzle', sectionName: 'Aerospace Engineering', examId: 'gate' },
        expectedTopicId: 'propulsion',
        expectedTopicName: 'Propulsion & Gas Turbines',
      },
      {
        question: { questionText: 'Kepler orbital period and Hohmann transfer orbit around earth', sectionName: 'Aerospace Engineering', examId: 'gate' },
        expectedTopicId: 'space_dynamics',
        expectedTopicName: 'Space Dynamics & Orbital Mechanics',
      },
      // Engineering Mathematics
      {
        question: { questionText: 'Determinant of 4x4 matrix det(A) with eigenvalues and rank of the matrix', sectionName: 'Computer Science & Information Technology', examId: 'gate' },
        expectedTopicId: 'linear_algebra',
        expectedTopicName: 'Linear Algebra',
      },
      {
        question: { questionText: 'First order differential equation \\frac{dy}{dx} + ay = sin(omega x)', sectionName: 'Aerospace Engineering', examId: 'gate' },
        expectedTopicId: 'differential_equations',
        expectedTopicName: 'Differential Equations',
      },
    ];

    let classifiedCount = 0;
    let verifiedAccurateCount = 0;
    let falseClassificationCount = 0;

    for (const sample of referenceSet) {
      const meta = getQuestionTopicMetadata(sample.question, sample.question.examId, sample.question.sectionName);
      if (meta.primaryTopicId !== UNCATEGORIZED_TOPIC_ID) {
        classifiedCount++;
        if (meta.primaryTopicId === sample.expectedTopicId) {
          verifiedAccurateCount++;
        } else {
          falseClassificationCount++;
        }
      }
    }

    const coverageRate = (classifiedCount / referenceSet.length) * 100;
    const accuracyRate = (verifiedAccurateCount / referenceSet.length) * 100;

    expect(coverageRate).toBe(100);
    expect(accuracyRate).toBe(100);
    expect(falseClassificationCount).toBe(0);
    expect(classifiedCount).toBe(referenceSet.length);
  });

  it('accurately identifies uncategorized questions without hallucinating topics', () => {
    const unclassifiableQuestion = {
      questionText: 'This is a completely random sentence with no technical terms or syllabus concepts.',
      sectionName: 'Computer Science & Information Technology',
      examId: 'gate',
    };

    const meta = getQuestionTopicMetadata(unclassifiableQuestion, 'gate', 'Computer Science & Information Technology');
    expect(meta.primaryTopicId).toBe(UNCATEGORIZED_TOPIC_ID);
    expect(meta.primaryTopicName).toBe(UNCATEGORIZED_TOPIC_NAME);
    expect(meta.classificationStatus).toBe('UNCLASSIFIED');
    expect(meta.confidence).toBe(0);
  });
});

