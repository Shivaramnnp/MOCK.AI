/**
 * Question Specification Planner
 * Creates a deterministic QuestionSpec[] blueprint before calling the LLM,
 * guaranteeing balanced subtopic coverage, cognitive depth, and exam fidelity.
 */

import { CanonicalTopic, QuestionSpec, TopicDifficulty, TopicQuestionType } from './types';

export interface PlanSpecsOptions {
  canonicalTopic: CanonicalTopic;
  questionCount?: number;
  difficulty?: TopicDifficulty | string;
  questionTypes?: TopicQuestionType[];
  marks?: number;
  negativeMarks?: number;
}

export function planQuestionSpecs(options: PlanSpecsOptions): QuestionSpec[] {
  const { canonicalTopic } = options;
  const count = Math.max(1, Math.min(options.questionCount ?? 8, 100));
  const rawDifficulty = (options.difficulty || 'MEDIUM').toUpperCase();

  const subtopics = canonicalTopic.subtopics.length > 0
    ? canonicalTopic.subtopics
    : [canonicalTopic.canonicalName];

  // 1. Determine Difficulty Distribution
  const difficulties: Array<'EASY' | 'MEDIUM' | 'HARD'> = [];
  if (rawDifficulty === 'EASY') {
    const easyCount = Math.ceil(count * 0.8);
    const medCount = count - easyCount;
    for (let i = 0; i < easyCount; i++) difficulties.push('EASY');
    for (let i = 0; i < medCount; i++) difficulties.push('MEDIUM');
  } else if (rawDifficulty === 'HARD' || rawDifficulty === 'COMPETITIVE') {
    const hardCount = Math.ceil(count * 0.85);
    const medCount = count - hardCount;
    for (let i = 0; i < medCount; i++) difficulties.push('MEDIUM');
    for (let i = 0; i < hardCount; i++) difficulties.push('HARD');
  } else if (rawDifficulty === 'ADAPTIVE') {
    const easyCount = Math.floor(count * 0.3);
    const hardCount = Math.floor(count * 0.3);
    const medCount = count - easyCount - hardCount;
    for (let i = 0; i < easyCount; i++) difficulties.push('EASY');
    for (let i = 0; i < medCount; i++) difficulties.push('MEDIUM');
    for (let i = 0; i < hardCount; i++) difficulties.push('HARD');
  } else {
    // Standard MEDIUM
    const easyCount = Math.floor(count * 0.2);
    const hardCount = Math.floor(count * 0.2);
    const medCount = count - easyCount - hardCount;
    for (let i = 0; i < easyCount; i++) difficulties.push('EASY');
    for (let i = 0; i < medCount; i++) difficulties.push('MEDIUM');
    for (let i = 0; i < hardCount; i++) difficulties.push('HARD');
  }

  // 2. Determine Question Types
  const allowedTypes: TopicQuestionType[] = options.questionTypes && options.questionTypes.length > 0
    ? options.questionTypes
    : canonicalTopic.matchedExamId?.toLowerCase().includes('gate') ||
      canonicalTopic.domain === 'Computer Science' ||
      canonicalTopic.domain === 'Mathematics'
    ? ['MCQ', 'MSQ', 'NAT']
    : ['MCQ'];

  // 3. Build each QuestionSpec
  const specs: QuestionSpec[] = [];

  for (let i = 0; i < count; i++) {
    const slotIndex = i + 1;
    const subtopic = subtopics[i % subtopics.length];
    const diff = difficulties[i % difficulties.length];

    // Assign QuestionType deterministically
    let qType: TopicQuestionType = 'MCQ';
    if (allowedTypes.length === 1) {
      qType = allowedTypes[0];
    } else if (allowedTypes.includes('MSQ') && allowedTypes.includes('NAT')) {
      // 60% MCQ, 20% MSQ, 20% NAT pattern
      const mod = slotIndex % 5;
      if (mod === 0) qType = 'NAT';
      else if (mod === 4) qType = 'MSQ';
      else qType = 'MCQ';
    } else {
      qType = allowedTypes[i % allowedTypes.length];
    }

    // Assign Marks and Negative Marks based on Difficulty & Type
    let marks = options.marks ?? (diff === 'EASY' ? 1 : diff === 'MEDIUM' ? 1.5 : 2);
    if (marks === 1.5) marks = slotIndex % 2 === 0 ? 2 : 1; // Round to whole marks (1 or 2)

    let negMarks = options.negativeMarks ?? 0;
    if (options.negativeMarks === undefined) {
      if (qType === 'MCQ') {
        negMarks = marks === 1 ? 0.33 : 0.66;
      } else {
        // In competitive standards (e.g. GATE), MSQ and NAT have 0 negative marks
        negMarks = 0;
      }
    }

    // Cognitive Level & Learning Objective
    let cognitiveLevel: QuestionSpec['cognitiveLevel'] = 'Applying';
    let learningObjective = '';

    if (diff === 'EASY') {
      cognitiveLevel = i % 2 === 0 ? 'Remembering' : 'Understanding';
      learningObjective = `Verify core conceptual definitions, notation, and fundamental properties of ${subtopic}.`;
    } else if (diff === 'MEDIUM') {
      cognitiveLevel = i % 2 === 0 ? 'Applying' : 'Analyzing';
      learningObjective = `Apply quantitative analysis and standard algorithms to solve structured problems in ${subtopic}.`;
    } else {
      cognitiveLevel = i % 2 === 0 ? 'Evaluating' : 'Analyzing';
      learningObjective = `Evaluate complex multi-step scenarios, theoretical bounds, and edge cases in ${subtopic}.`;
    }

    specs.push({
      slotIndex,
      topic: canonicalTopic.canonicalName,
      subtopic,
      difficulty: diff,
      questionType: qType,
      marks,
      negativeMarks: negMarks,
      learningObjective,
      cognitiveLevel,
    });
  }

  return specs;
}
