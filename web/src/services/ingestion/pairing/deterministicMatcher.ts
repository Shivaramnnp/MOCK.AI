import { CanonicalQuestion, QuestionType, CanonicalAnswer } from '../../../types/canonicalQuestion';
import { RawAnswerEntry, QuestionAnswerMatch, MatchStatus } from './types';

export interface MatchingResult {
  matches: QuestionAnswerMatch[];
  matchedCount: number;
  missingQuestionsCount: number;
  missingKeysCount: number;
  duplicateQuestionsCount: number;
  duplicateKeysCount: number;
  typeConflictsCount: number;
  sourceConflictsCount: number;
  reviewRequiredCount: number;
  sequenceAnomalies: string[];
}

/**
 * Validates sequence monotonicity and detects missing or duplicate question numbers.
 */
export function validateQuestionSequence(numbers: number[]): {
  missingNumbers: number[];
  duplicateNumbers: number[];
  hasAnomaly: boolean;
  anomalyReasons: string[];
} {
  const missingNumbers: number[] = [];
  const duplicateNumbers: number[] = [];
  const anomalyReasons: string[] = [];

  if (numbers.length === 0) {
    return { missingNumbers, duplicateNumbers, hasAnomaly: false, anomalyReasons };
  }

  const seen = new Set<number>();
  for (const num of numbers) {
    if (seen.has(num)) {
      duplicateNumbers.push(num);
      anomalyReasons.push(`DUPLICATE_QUESTION_NUMBER: Question ${num} appears multiple times.`);
    }
    seen.add(num);
  }

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);

  // Check expected 1..N sequence if min starts at 1
  if (min === 1) {
    for (let expected = 1; expected <= max; expected++) {
      if (!seen.has(expected)) {
        missingNumbers.push(expected);
        anomalyReasons.push(`MISSING_QUESTION_NUMBER: Question ${expected} is missing from the sequence.`);
      }
    }
  }

  // Detect sequence jumps (e.g. Q2 to Q7)
  for (let i = 0; i < numbers.length - 1; i++) {
    const current = numbers[i];
    const next = numbers[i + 1];
    if (next - current > 3) {
      anomalyReasons.push(
        `QUESTION_SEQUENCE_ANOMALY: Sudden jump in question numbering from Q${current} to Q${next}.`
      );
    }
  }

  return {
    missingNumbers,
    duplicateNumbers,
    hasAnomaly: missingNumbers.length > 0 || duplicateNumbers.length > 0 || anomalyReasons.length > 0,
    anomalyReasons,
  };
}

/**
 * Deterministically matches Extracted Questions with Answer Key Entries.
 * Reconciles Question Type, Options, Answers, Marks, and Negative Marks.
 * Never silently shifts question numbers.
 * Never modifies question stems, math, options, or visual assets.
 */
export function matchQuestionsWithAnswerKey(
  questions: CanonicalQuestion[],
  answerEntries: RawAnswerEntry[],
  options?: { isStandaloneQp?: boolean }
): MatchingResult {
  const matches: QuestionAnswerMatch[] = [];

  const qNumbers = questions.map((q) => q.questionNumber);
  const akNumbers = answerEntries.map((a) => a.questionNumber);

  // 1. Sequence Validation
  const qSeq = validateQuestionSequence(qNumbers);
  const akSeq = validateQuestionSequence(akNumbers);
  const sequenceAnomalies = [...qSeq.anomalyReasons, ...akSeq.anomalyReasons];

  // Map answer entries by Question Number
  const akMap = new Map<number, RawAnswerEntry[]>();
  for (const entry of answerEntries) {
    const existing = akMap.get(entry.questionNumber) || [];
    existing.push(entry);
    akMap.set(entry.questionNumber, existing);
  }

  let matchedCount = 0;
  let missingQuestionsCount = 0;
  let missingKeysCount = 0;
  let duplicateQuestionsCount = qSeq.duplicateNumbers.length;
  let duplicateKeysCount = akSeq.duplicateNumbers.length;
  let typeConflictsCount = 0;
  let sourceConflictsCount = 0;
  let reviewRequiredCount = 0;

  // Process each extracted Question Paper question
  for (const q of questions) {
    const qNum = q.questionNumber;
    const entries = akMap.get(qNum);
    const issues: string[] = [];

    // Standalone Question Paper mode (Continue without Answer Key)
    if (options?.isStandaloneQp || !answerEntries || answerEntries.length === 0) {
      q.verificationStatus = 'UNVERIFIED';
      q.verificationReasons = ['Ingested without Answer Key. Verification pending official key upload.'];
      matches.push({
        questionNumber: qNum,
        sectionName: q.sectionName,
        matchStatus: 'QUESTION_PAPER_ONLY',
        matchConfidence: 0.5,
        matchReason: 'Question paper ingested without answer key.',
        sourceQuestionId: q.questionId,
        questionStemPreview: q.questionText.slice(0, 100),
        questionType: q.questionType,
        canonicalQuestion: q,
        issues: ['Answer key pending'],
      });
      continue;
    }

    // Missing key in Answer Key
    if (!entries || entries.length === 0) {
      missingKeysCount++;
      issues.push(`MISSING_KEY: Official Answer Key has no entry for Question ${qNum}.`);
      q.verificationStatus = 'REVIEW_REQUIRED';
      q.verificationReasons.push(`Missing answer key entry for Question ${qNum}`);
      matches.push({
        questionNumber: qNum,
        sectionName: q.sectionName,
        matchStatus: 'MISSING_KEY',
        matchConfidence: 0.3,
        matchReason: `Missing answer key for Q${qNum}.`,
        sourceQuestionId: q.questionId,
        questionStemPreview: q.questionText.slice(0, 100),
        questionType: q.questionType,
        canonicalQuestion: q,
        issues,
      });
      reviewRequiredCount++;
      continue;
    }

    // Duplicate entries in Answer Key
    if (entries.length > 1) {
      duplicateKeysCount++;
      issues.push(`DUPLICATE_KEY: Official Answer Key contains ${entries.length} duplicate entries for Q${qNum}.`);
      q.verificationStatus = 'REVIEW_REQUIRED';
      q.verificationReasons.push(`Duplicate answer key entries for Q${qNum}`);
      matches.push({
        questionNumber: qNum,
        sectionName: q.sectionName,
        matchStatus: 'DUPLICATE_KEY',
        matchConfidence: 0.4,
        matchReason: `Ambiguous duplicate answer key entries for Q${qNum}.`,
        sourceQuestionId: q.questionId,
        questionStemPreview: q.questionText.slice(0, 100),
        questionType: q.questionType,
        answerKeyEntry: entries[0],
        canonicalQuestion: q,
        issues,
      });
      reviewRequiredCount++;
      continue;
    }

    const akEntry = entries[0];
    let matchStatus: MatchStatus = 'MATCHED';
    let matchConfidence = 0.5; // Base confidence

    // Reconcile Question Type
    let effectiveType: QuestionType = q.questionType;

    // Check Question Type Conflict:
    if (akEntry.detectedType && q.questionType && akEntry.detectedType !== q.questionType) {
      // If Answer Key explicitly provides question type, Answer Key is official authority on type,
      // UNLESS the physical layout conflicts (e.g. Answer key says NAT, but question has 4 options).
      if (akEntry.detectedType === 'NAT' && q.options.length >= 2) {
        issues.push(
          `QUESTION_TYPE_CONFLICT: Answer key indicates NAT, but question contains ${q.options.length} options.`
        );
        typeConflictsCount++;
        matchStatus = 'REVIEW_REQUIRED';
      } else if ((akEntry.detectedType === 'MCQ' || akEntry.detectedType === 'MSQ') && q.options.length === 0) {
        issues.push(
          `QUESTION_TYPE_CONFLICT: Answer key indicates ${akEntry.detectedType}, but no options were found in Question Paper.`
        );
        typeConflictsCount++;
        matchStatus = 'REVIEW_REQUIRED';
      } else {
        // Safe adoption of official Answer Key classification (e.g. MSQ instead of generic MCQ)
        effectiveType = akEntry.detectedType;
        q.questionType = effectiveType;
      }
    } else if (akEntry.detectedType) {
      effectiveType = akEntry.detectedType;
      q.questionType = effectiveType;
      matchConfidence += 0.2;
    }

    // 2. Synthesize Canonical Answer
    const canonicalAnswer: CanonicalAnswer = {
      questionType: effectiveType,
    };

    if (akEntry.isMta) {
      canonicalAnswer.isMta = true;
      issues.push('NOTICE: Question is officially marked MTA (Marks to All).');
      matchConfidence += 0.25;
    } else if (effectiveType === 'MCQ') {
      const optId = akEntry.mcqOption;
      if (!optId) {
        issues.push('INVALID_KEY: MCQ answer key does not contain a valid single option letter.');
        matchStatus = 'INVALID_KEY';
      } else {
        // Validate option existence in question
        const matchingOptIndex = q.options.findIndex(
          (o) => o.id.toUpperCase() === optId.toUpperCase()
        );

        if (matchingOptIndex === -1 && q.options.length > 0) {
          issues.push(
            `SOURCE_CONFLICT: Answer key specifies Option "${optId}", but Question ${qNum} only has options [${q.options.map((o) => o.id).join(', ')}].`
          );
          sourceConflictsCount++;
          matchStatus = 'REVIEW_REQUIRED';
        } else {
          canonicalAnswer.correctOptionId = optId;
          canonicalAnswer.correctAnswer = optId;
          canonicalAnswer.correctOptionIndex = matchingOptIndex >= 0 ? matchingOptIndex : undefined;
          matchConfidence += 0.3;

          // Mark isCorrect flag on matching option without altering stem/content
          q.options.forEach((opt, idx) => {
            opt.isCorrect = idx === matchingOptIndex || opt.id.toUpperCase() === optId.toUpperCase();
          });
        }
      }
    } else if (effectiveType === 'MSQ') {
      const optIds = akEntry.msqOptions || (akEntry.mcqOption ? [akEntry.mcqOption] : []);
      if (optIds.length === 0) {
        issues.push('INVALID_KEY: MSQ answer key lacks valid option letters.');
        matchStatus = 'INVALID_KEY';
      } else {
        canonicalAnswer.correctOptionIds = optIds;
        canonicalAnswer.correctAnswerSet = optIds;

        const indices = optIds
          .map((id) => q.options.findIndex((o) => o.id.toUpperCase() === id.toUpperCase()))
          .filter((idx) => idx >= 0);

        canonicalAnswer.correctOptionIndices = indices;
        matchConfidence += 0.3;

        // Mark isCorrect on options
        q.options.forEach((opt) => {
          opt.isCorrect = optIds.includes(opt.id.toUpperCase());
        });
      }
    } else if (effectiveType === 'NAT') {
      if (akEntry.natRange) {
        canonicalAnswer.natRange = akEntry.natRange;
        canonicalAnswer.numericRange = akEntry.natRange;
      }
      if (typeof akEntry.natValue === 'number') {
        canonicalAnswer.natValue = akEntry.natValue;
        canonicalAnswer.numericValue = akEntry.natValue;
      }
      if (!akEntry.natRange && typeof akEntry.natValue !== 'number') {
        issues.push('INVALID_KEY: NAT answer key lacks numerical range or value.');
        matchStatus = 'INVALID_KEY';
      } else {
        matchConfidence += 0.3;
      }
    }

    // 3. Scoring Alignment
    if (akEntry.marks && akEntry.marks > 0) {
      q.scoring.marks = akEntry.marks;
      q.scoring.negativeMarks = akEntry.negativeMarks ?? 0;
      q.marks = akEntry.marks;
      q.negativeMarks = akEntry.negativeMarks ?? 0;

      // Update scoring rule name
      if (effectiveType === 'MCQ') {
        q.scoring.scoringRule = akEntry.marks === 2 ? 'GATE_MCQ_2' : 'GATE_MCQ_1';
      } else if (effectiveType === 'MSQ') {
        q.scoring.scoringRule = 'GATE_MSQ';
      } else if (effectiveType === 'NAT') {
        q.scoring.scoringRule = 'GATE_NAT';
      }
    }

    // 4. Update Provenance
    q.answer = canonicalAnswer;
    if (q.provenance) {
      q.provenance.metadata = {
        ...q.provenance.metadata,
        answerKeyRawLine: akEntry.rawLine,
        matchingStatus: matchStatus,
        matchConfidence,
      };
    }

    // Determine Question Verification Status
    if (matchStatus === 'MATCHED') {
      matchedCount++;
      matchConfidence = Math.min(1.0, matchConfidence + 0.2);
      // If quality gate had no fatal issues, can be VERIFIED
      if (q.verificationStatus !== 'FAILED') {
        q.verificationStatus = 'VERIFIED';
        q.verificationReasons = [`Matched deterministically with official Answer Key (Q${qNum}).`];
      }
    } else {
      reviewRequiredCount++;
      q.verificationStatus = 'REVIEW_REQUIRED';
      q.verificationReasons = [...issues];
    }

    matches.push({
      questionNumber: qNum,
      sectionName: q.sectionName,
      matchStatus,
      matchConfidence: Math.round(matchConfidence * 100) / 100,
      matchReason: issues.length > 0 ? issues[0] : `Successfully paired with Answer Key entry for Q${qNum}.`,
      sourceQuestionId: q.questionId,
      questionStemPreview: q.questionText.slice(0, 100),
      questionType: effectiveType,
      answerKeyEntry: akEntry,
      canonicalQuestion: q,
      issues,
    });
  }

  // Detect questions present in Answer Key but absent in Question Paper
  for (const akEntry of answerEntries) {
    if (!qNumbers.includes(akEntry.questionNumber)) {
      missingQuestionsCount++;
      matches.push({
        questionNumber: akEntry.questionNumber,
        sectionName: akEntry.sectionName,
        matchStatus: 'MISSING_KEY', // Missing in question paper
        matchConfidence: 0.0,
        matchReason: `Question ${akEntry.questionNumber} appears in Answer Key but was not extracted from Question Paper.`,
        questionType: akEntry.detectedType || 'MCQ',
        answerKeyEntry: akEntry,
        issues: [`MISSING_QUESTION_NUMBER: Q${akEntry.questionNumber} missing in Question Paper.`],
      });
      reviewRequiredCount++;
    }
  }

  // Sort matches by questionNumber
  matches.sort((a, b) => a.questionNumber - b.questionNumber);

  return {
    matches,
    matchedCount,
    missingQuestionsCount,
    missingKeysCount,
    duplicateQuestionsCount,
    duplicateKeysCount,
    typeConflictsCount,
    sourceConflictsCount,
    reviewRequiredCount,
    sequenceAnomalies,
  };
}
