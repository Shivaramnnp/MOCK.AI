/**
 * Professional Manual Question Validator
 * Mock.AI Production Ingestion Engine - Prompt 9/10
 *
 * Provides granular, field-level validation for all 5 question types
 * (MCQ, MSQ, NAT, TRUE_FALSE, DESCRIPTIVE), custom marking rules,
 * content block integrity, and Draft vs Publish state enforcement.
 */

import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { ManualFieldErrors, ManualValidationResult } from './types';
import { checkMathSyntax, validateContentBlock } from '../qualityGate';

/**
 * Validates a CanonicalQuestion for the manual authoring editor.
 * Returns field-level errors and validation state.
 */
export function validateManualQuestion(
  question: CanonicalQuestion,
  isDraft = false
): ManualValidationResult {
  const fieldErrors: ManualFieldErrors = {};
  const warnings: string[] = [];

  // 1. Question Text
  const text = (question.questionText || '').trim();
  if (!text) {
    if (!isDraft) {
      fieldErrors.questionText = 'Question text or prompt is required.';
    } else {
      warnings.push('Question text is currently empty in this draft.');
    }
  } else if (text.length < 3 && !isDraft) {
    fieldErrors.questionText = 'Question text must be at least 3 characters long.';
  }

  // Math syntax check in question stem
  if (text) {
    const mathIssues = checkMathSyntax(text);
    if (mathIssues.length > 0) {
      fieldErrors.questionText = mathIssues[0].message;
    }
  }

  // 2. Content Blocks Validation
  if (Array.isArray(question.contentBlocks)) {
    for (let i = 0; i < question.contentBlocks.length; i++) {
      const block = question.contentBlocks[i];
      const typeLower = (block.type || '').toLowerCase();

      // Media blocks require a URL or asset reference
      if (['image', 'diagram', 'graph', 'chart'].includes(typeLower)) {
        if (!block.assetUrl?.trim() && !block.content?.trim() && !block.assetId?.trim()) {
          fieldErrors.contentBlocks = `Content block ${i + 1} (${block.type}): Image or visual block requires an image URL or asset ID.`;
          break;
        }
      }

      // Equation blocks require non-empty LaTeX/content
      if (typeLower === 'equation') {
        const mathContent = (block.latex || block.content || '').trim();
        if (!mathContent) {
          fieldErrors.contentBlocks = `Content block ${i + 1} (${block.type}): Equation block cannot be empty.`;
          break;
        }
      }

      // Check math syntax in content or LaTeX fields
      if (block.content) {
        const mathIssues = checkMathSyntax(block.content);
        if (mathIssues.length > 0) {
          fieldErrors.contentBlocks = `Content block ${i + 1} (${block.type}): ${mathIssues[0].message}`;
          break;
        }
      }
      if (block.latex) {
        const mathIssues = checkMathSyntax(block.latex);
        if (mathIssues.length > 0) {
          fieldErrors.contentBlocks = `Content block ${i + 1} (${block.type}): ${mathIssues[0].message}`;
          break;
        }
      }

      const issues = validateContentBlock(block, i);
      if (issues.length > 0 && (issues[0].severity === 'FATAL' || issues[0].severity === 'REVIEW_REQUIRED')) {
        fieldErrors.contentBlocks = `Content block ${i + 1} (${block.type}): ${issues[0].message}`;
        break;
      }
    }
  }

  // 3. Question Type & Options / Answer Validation
  const qType = question.questionType || 'MCQ';
  const options = question.options || [];
  const answer = question.answer;

  switch (qType) {
    case 'MCQ': {
      if (options.length < 2) {
        fieldErrors.options = `MCQ requires at least 2 options, found ${options.length}.`;
      } else {
        // Check for empty options
        const emptyIdx = options.findIndex(
          (o) => !o.text?.trim() && !o.imageUrl && (!o.contentBlocks || o.contentBlocks.length === 0)
        );
        if (emptyIdx >= 0) {
          fieldErrors.options = `Option ${options[emptyIdx].id || emptyIdx + 1} cannot be blank.`;
        }
      }

      // Must have exactly one correct answer
      const hasCorrectIndex =
        typeof answer?.correctOptionIndex === 'number' &&
        answer.correctOptionIndex >= 0 &&
        answer.correctOptionIndex < options.length;
      const hasCorrectId =
        !!answer?.correctOptionId && options.some((o) => o.id === answer.correctOptionId);

      if (!hasCorrectIndex && !hasCorrectId) {
        fieldErrors.answer = 'Please select exactly one correct answer for this MCQ.';
      }
      break;
    }

    case 'MSQ': {
      if (options.length < 2) {
        fieldErrors.options = `MSQ requires at least 2 options, found ${options.length}.`;
      } else {
        const emptyIdx = options.findIndex(
          (o) => !o.text?.trim() && !o.imageUrl && (!o.contentBlocks || o.contentBlocks.length === 0)
        );
        if (emptyIdx >= 0) {
          fieldErrors.options = `Option ${options[emptyIdx].id || emptyIdx + 1} cannot be blank.`;
        }
      }

      // Must have at least one correct answer
      const indicesCount = answer?.correctOptionIndices?.length || 0;
      const idsCount = answer?.correctOptionIds?.length || 0;
      const booleanFlagsCount = options.filter((o) => o.isCorrect).length;

      if (indicesCount === 0 && idsCount === 0 && booleanFlagsCount === 0) {
        fieldErrors.answer = 'MSQ questions require at least one correct answer to be selected.';
      }
      break;
    }

    case 'NAT': {
      const hasValue = typeof answer?.natValue === 'number' && !isNaN(answer.natValue);
      const hasRange =
        answer?.natRange &&
        typeof answer.natRange.min === 'number' &&
        typeof answer.natRange.max === 'number' &&
        !isNaN(answer.natRange.min) &&
        !isNaN(answer.natRange.max);

      if (!hasValue && !hasRange) {
        fieldErrors.answer = 'NAT questions require a numerical answer or valid numerical range.';
      } else if (hasRange && answer.natRange!.min > answer.natRange!.max) {
        fieldErrors.answer = `NAT minimum range value (${answer.natRange!.min}) cannot exceed maximum (${answer.natRange!.max}).`;
      }
      break;
    }

    case 'TRUE_FALSE': {
      if (options.length !== 2) {
        fieldErrors.options = `True/False question must contain exactly 2 options, found ${options.length}.`;
      }

      const hasCorrect =
        (typeof answer?.correctOptionIndex === 'number' && answer.correctOptionIndex >= 0) ||
        !!answer?.correctOptionId ||
        options.some((o) => o.isCorrect);

      if (!hasCorrect) {
        fieldErrors.answer = 'Please select whether True or False is the correct answer.';
      }
      break;
    }

    case 'DESCRIPTIVE': {
      // Descriptive does not require multiple-choice options
      break;
    }

    default: {
      fieldErrors.questionType = `Unsupported question type: "${qType}".`;
      break;
    }
  }

  // 4. Scoring Configuration Validation
  const scoring = question.scoring;
  if (scoring) {
    if (typeof scoring.marks !== 'number' || scoring.marks <= 0) {
      fieldErrors.scoring = 'Marks for correct answer must be a positive number greater than 0.';
    }
    if (typeof scoring.negativeMarks === 'number' && scoring.negativeMarks < 0) {
      fieldErrors.scoring = 'Negative marks cannot be less than 0.';
    }
  } else {
    fieldErrors.scoring = 'Scoring configuration is missing.';
  }

  const isValid = Object.keys(fieldErrors).length === 0;

  return {
    isValid,
    fieldErrors,
    warnings,
  };
}
