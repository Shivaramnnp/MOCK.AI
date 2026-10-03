/**
 * Topic Question Validator
 * Performs multi-layer psychometric, schema, mathematical, and duplicate validation.
 * If answer cannot be verified with certainty: marks as REVIEW_REQUIRED.
 */

import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { QuestionSpec, TopicValidationResult } from './types';
import { checkQuestionDuplicate } from './topicDeduplicator';

/**
 * Validates KaTeX / LaTeX mathematical syntax.
 */
export function validateMathSyntax(text: string): { valid: boolean; error?: string } {
  if (!text) return { valid: true };

  // 1. Check balanced single dollars $...$
  // Count unescaped dollars
  let dollarCount = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$' && (i === 0 || text[i - 1] !== '\\')) {
      dollarCount++;
    }
  }
  if (dollarCount % 2 !== 0) {
    return { valid: false, error: 'Unbalanced LaTeX math delimiter ($)' };
  }

  // 2. Check balanced double dollars $$...$$
  const doubleDollarMatches = text.match(/\$\$/g);
  if (doubleDollarMatches && doubleDollarMatches.length % 2 !== 0) {
    return { valid: false, error: 'Unbalanced display math delimiter ($$)' };
  }

  // 3. Check balanced curly braces inside math blocks
  const mathBlockRegex = /\$(?:[^$]|\\\$)+\$/g;
  let mathMatch;
  while ((mathMatch = mathBlockRegex.exec(text)) !== null) {
    const mathContent = mathMatch[0];
    let openBraces = 0;
    for (let j = 0; j < mathContent.length; j++) {
      if (mathContent[j] === '{' && (j === 0 || mathContent[j - 1] !== '\\')) openBraces++;
      if (mathContent[j] === '}' && (j === 0 || mathContent[j - 1] !== '\\')) openBraces--;
    }
    if (openBraces !== 0) {
      return { valid: false, error: 'Unbalanced curly braces in LaTeX formula' };
    }

    // 4. Check balanced \left and \right
    const leftMatches = mathContent.match(/\\left\b/g);
    const rightMatches = mathContent.match(/\\right\b/g);
    const leftCount = leftMatches ? leftMatches.length : 0;
    const rightCount = rightMatches ? rightMatches.length : 0;
    if (leftCount !== rightCount) {
      return { valid: false, error: 'Unbalanced \\left and \\right in LaTeX formula' };
    }
  }

  return { valid: true };
}

/**
 * Validates a generated question against its QuestionSpec and existing batch questions.
 */
export function validateTopicQuestion(
  question: CanonicalQuestion,
  spec: QuestionSpec,
  existingQuestions: CanonicalQuestion[] = []
): TopicValidationResult {
  const reasons: string[] = [];
  let schemaValid = true;
  let optionsValid = true;
  let answerValid = true;
  let mathValid = true;
  let difficultyValid = true;
  let topicValid = true;
  let duplicateFree = true;
  let confidence = 1.0;

  // 1. Schema Validation
  const stem = (question?.questionText || '').trim();
  if (!stem || stem.length < 15) {
    schemaValid = false;
    reasons.push('Question stem is too short or empty (minimum 15 characters required).');
  }

  // 2. Option Validation
  if (spec.questionType === 'MCQ' || spec.questionType === 'MSQ') {
    if (!Array.isArray(question.options) || question.options.length < 2) {
      optionsValid = false;
      reasons.push(`${spec.questionType} must have at least 2 distinct options.`);
    } else {
      const optionTexts = question.options.map((o) => (o.text || '').trim());
      const hasEmpty = optionTexts.some((t) => !t);
      if (hasEmpty) {
        optionsValid = false;
        reasons.push('Question contains empty or blank options.');
      }

      // Check distinct option texts
      const uniqueOptions = new Set(optionTexts.map((t) => t.toLowerCase()));
      if (uniqueOptions.size < optionTexts.length) {
        optionsValid = false;
        reasons.push('Question contains duplicate option choices.');
      }
    }
  }

  // 3. Answer Validation
  const ans = question.answer;
  if (!ans) {
    answerValid = false;
    reasons.push('Question answer specification is missing.');
  } else if (spec.questionType === 'MCQ') {
    const hasValidKey =
      ans.correctAnswer &&
      question.options.some(
        (o) => o.id === ans.correctAnswer || o.text.trim() === ans.correctAnswer?.trim()
      );
    const hasValidIndex =
      ans.correctOptionIndex !== undefined &&
      ans.correctOptionIndex >= 0 &&
      ans.correctOptionIndex < question.options.length;

    if (!hasValidKey && !hasValidIndex) {
      answerValid = false;
      reasons.push('MCQ answer does not match any available option choice.');
    }
  } else if (spec.questionType === 'MSQ') {
    const hasValidKeys =
      Array.isArray(ans.correctAnswerSet) && ans.correctAnswerSet.length > 0;
    const hasValidIndices =
      Array.isArray(ans.correctOptionIndices) && ans.correctOptionIndices.length > 0;

    if (!hasValidKeys && !hasValidIndices) {
      answerValid = false;
      reasons.push('MSQ question must specify at least one correct option.');
    }
  } else if (spec.questionType === 'NAT') {
    const hasNumericVal = ans.numericValue !== undefined && !isNaN(ans.numericValue);
    const hasRange =
      ans.numericRange &&
      !isNaN(ans.numericRange.min) &&
      !isNaN(ans.numericRange.max) &&
      ans.numericRange.min <= ans.numericRange.max;

    if (!hasNumericVal && !hasRange) {
      answerValid = false;
      reasons.push('NAT question must specify a valid numerical value or range.');
    }
  }

  // 4. Math Validation
  const stemMath = validateMathSyntax(stem);
  if (!stemMath.valid) {
    mathValid = false;
    reasons.push(`Math validation failed in question stem: ${stemMath.error}`);
  }
  if (Array.isArray(question.options)) {
    for (let i = 0; i < question.options.length; i++) {
      const optMath = validateMathSyntax(question.options[i].text);
      if (!optMath.valid) {
        mathValid = false;
        reasons.push(`Math validation failed in Option ${question.options[i].id || i + 1}: ${optMath.error}`);
      }
    }
  }

  // 5. Difficulty Validation
  if (spec.difficulty === 'HARD') {
    if (stem.length < 30 && (!question.options || question.options.length === 0)) {
      difficultyValid = false;
      confidence -= 0.2;
      reasons.push('Question is too simple for the requested HARD cognitive specification.');
    }
  }

  // 6. Topic & Subtopic Alignment Validation
  const combinedText = (
    stem +
    ' ' +
    (question.options?.map((o) => o.text).join(' ') || '') +
    ' ' +
    (question.explanation || '')
  ).toLowerCase();

  const subtopicWords = spec.subtopic
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(' ')
    .filter((w) => w.length > 3 && !['with', 'from', 'that', 'this', 'core', 'standard'].includes(w));

  const topicWords = spec.topic
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(' ')
    .filter((w) => w.length > 3);

  const matchedSubtopicWords = subtopicWords.filter((w) => combinedText.includes(w));
  const matchedTopicWords = topicWords.filter((w) => combinedText.includes(w));

  if (matchedSubtopicWords.length === 0 && matchedTopicWords.length === 0) {
    // Zero keyword overlap indicates potential model hallucination / topic drift
    confidence -= 0.3;
    reasons.push(`Question shows weak alignment with targeted subtopic "${spec.subtopic}".`);
  }

  // 7. Duplicate Check
  const dupCheck = checkQuestionDuplicate(question, existingQuestions);
  if (dupCheck.isDuplicate) {
    duplicateFree = false;
    reasons.push(`Deduplication failure: ${dupCheck.reason}`);
  }

  // Explanation Quality Check
  const explanation = (question.explanation || '').trim();
  const hasSubstantialExplanation = explanation.length >= 20;
  if (!hasSubstantialExplanation) {
    confidence -= 0.25;
    reasons.push('Missing or unsubstantiated explanatory derivation.');
  }

  // Determine overall status
  let status: TopicValidationResult['status'] = 'VERIFIED';
  let failureCategory: TopicValidationResult['failureCategory'];

  if (!duplicateFree) {
    status = 'REJECTED';
    failureCategory = 'DUPLICATE';
  } else if (!schemaValid) {
    status = 'REJECTED';
    failureCategory = 'SCHEMA';
  } else if (!optionsValid) {
    status = 'REJECTED';
    failureCategory = 'OPTIONS';
  } else if (!mathValid) {
    status = 'REJECTED';
    failureCategory = 'MATH';
  } else if (!answerValid) {
    // If the answer is completely malformed or missing, reject for slot regeneration
    status = 'REJECTED';
    failureCategory = 'ANSWER';
  } else if (!hasSubstantialExplanation || confidence < 0.75) {
    // If answer is present but explanation or alignment is uncertain: REVIEW_REQUIRED
    status = 'REVIEW_REQUIRED';
    failureCategory = 'ANSWER';
  }

  const valid = status === 'VERIFIED' || status === 'REVIEW_REQUIRED';

  return {
    valid,
    status,
    reasons,
    failureCategory,
    confidence: Math.max(0.1, Math.min(1.0, confidence)),
    details: {
      schemaValid,
      optionsValid,
      answerValid,
      mathValid,
      difficultyValid,
      topicValid,
      duplicateFree,
    },
  };
}
