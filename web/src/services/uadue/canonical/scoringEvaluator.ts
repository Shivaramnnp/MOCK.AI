/**
 * UADUE Phase 2D-5 — Deterministic Scoring Engine & Rule Matcher
 * Document Version: 5.3.0-DETERMINISTIC-SCORING
 *
 * Implements:
 * 1. Strict Cardinality Rule Selection:
 *    - 0 matches  => UNRESOLVED_SCORING_POLICY (fail-closed)
 *    - 1 match    => evaluate with immutable rule
 *    - >1 matches => AMBIGUOUS_SCORING_POLICY (fail-closed)
 * 2. Immutable Version Pinning (pins exact resolvedAnswerVersionId and scoringPolicyVersionId).
 * 3. Exact evaluation ID derivation from inputs ONLY (awardedMarks is strictly an output).
 * 4. Generic policy execution for MCQ, MSQ, NAT, Matrix, and Withdrawn questions.
 */

import {
  AnswerAuthorityResolutionVersion,
  AnswerCandidate,
  ScoreEvaluationRecord,
  ScoringPolicyRule,
  ScoringPolicyVersion,
  UserAttemptResponse,
} from './types';
import { deriveEvaluationId } from './canonicalHashing';
import {
  evaluateExactNumericMatch,
  parseExactNumericInput,
} from './exactNumericEvaluator';

export interface QuestionScoringTraits {
  canonicalQuestionType: string;
  targetSubtype?: string;
  sectionId?: string;
  traits?: string[];
}

export interface RuleSelectionResult {
  isSuccess: boolean;
  selectedRule?: ScoringPolicyRule;
  matchingRuleCount: number;
  errorCode?: 'UNRESOLVED_SCORING_POLICY' | 'AMBIGUOUS_SCORING_POLICY';
  errorMessage?: string;
}

/**
 * Deterministically selects the exact matching ScoringPolicyRule for a given question.
 * FAILS CLOSED if matches !== 1.
 */
export function selectScoringPolicyRule(
  traits: QuestionScoringTraits,
  policyVersion: ScoringPolicyVersion
): RuleSelectionResult {
  const matchingRules = policyVersion.rules.filter((rule) => {
    // 1. Mandatory match on canonicalQuestionType
    if (rule.canonicalQuestionType !== traits.canonicalQuestionType) {
      return false;
    }

    // 2. Exact match on targetSubtype if specified in rule
    if (rule.targetSubtype !== undefined && rule.targetSubtype !== traits.targetSubtype) {
      return false;
    }

    // 3. Exact match on sectionId if specified in rule
    if (rule.sectionId !== undefined && rule.sectionId !== traits.sectionId) {
      return false;
    }

    // 4. Required traits match: rule's requiredTraits must be a subset of question traits
    if (rule.requiredTraits && rule.requiredTraits.length > 0) {
      const questionTraitsSet = new Set(traits.traits || []);
      const allTraitsPresent = rule.requiredTraits.every((t) => questionTraitsSet.has(t));
      if (!allTraitsPresent) {
        return false;
      }
    }

    return true;
  });

  if (matchingRules.length === 0) {
    return {
      isSuccess: false,
      matchingRuleCount: 0,
      errorCode: 'UNRESOLVED_SCORING_POLICY',
      errorMessage: `No matching scoring rule found for question type '${traits.canonicalQuestionType}' in policy version '${policyVersion.policyVersionId}'`,
    };
  }

  if (matchingRules.length > 1) {
    return {
      isSuccess: false,
      matchingRuleCount: matchingRules.length,
      errorCode: 'AMBIGUOUS_SCORING_POLICY',
      errorMessage: `Ambiguous scoring policy: ${matchingRules.length} matching rules found for question type '${traits.canonicalQuestionType}'; fail-closed under strict cardinality contract`,
    };
  }

  return {
    isSuccess: true,
    selectedRule: matchingRules[0],
    matchingRuleCount: 1,
  };
}

export interface EvaluateAttemptInput {
  attempt: UserAttemptResponse;
  resolution: AnswerAuthorityResolutionVersion;
  candidate: AnswerCandidate;
  policyVersion: ScoringPolicyVersion;
  questionTraits: QuestionScoringTraits;
  evaluatedAt?: number;
}

export interface AttemptEvaluationOutcome {
  isEvaluated: boolean;
  record?: ScoreEvaluationRecord;
  failureReason?: string;
}

/**
 * Evaluates a user attempt against pinned immutable answer and policy versions.
 */
export function evaluateUserAttempt(
  input: EvaluateAttemptInput
): AttemptEvaluationOutcome {
  const {
    attempt,
    resolution,
    candidate,
    policyVersion,
    questionTraits,
    evaluatedAt = Date.now(),
  } = input;

  const evaluationLog: string[] = [];

  // 1. Deterministic Rule Selection
  const ruleSelection = selectScoringPolicyRule(questionTraits, policyVersion);
  if (!ruleSelection.isSuccess || !ruleSelection.selectedRule) {
    return {
      isEvaluated: false,
      failureReason: ruleSelection.errorMessage || 'Failed to select unique scoring rule',
    };
  }

  const rule = ruleSelection.selectedRule;
  evaluationLog.push(`Selected rule '${rule.ruleId}' (${rule.policyType})`);

  let isCorrect = false;
  let isPartial = false;
  let isWrong = false;
  let isSkipped = attempt.isSkipped;
  let awardedMarks = 0;

  // 2. Validate Question and Scoring Dispositions First
  if (resolution.questionDisposition === 'UNRESOLVED') {
    return {
      isEvaluated: false,
      failureReason: 'Cannot evaluate question with questionDisposition UNRESOLVED; fails closed',
    };
  }

  // Explicit contract check: Inactive question dispositions cannot use STANDARD_EVALUATION
  if (
    resolution.questionDisposition !== 'ACTIVE' &&
    resolution.scoringDisposition === 'STANDARD_EVALUATION'
  ) {
    return {
      isEvaluated: false,
      failureReason: `Inactive question disposition '${resolution.questionDisposition}' cannot have scoring disposition 'STANDARD_EVALUATION'; fails closed under explicit disposition contract`,
    };
  }

  if (resolution.scoringDisposition === 'AWARD_FULL_MARKS') {
    isCorrect = true;
    isWrong = false;
    isPartial = false;
    isSkipped = false;
    awardedMarks = rule.positiveMarks;
    evaluationLog.push(
      `Explicit scoring disposition AWARD_FULL_MARKS for disposition '${resolution.questionDisposition}'; awarded full marks ${awardedMarks}`
    );
  } else if (resolution.scoringDisposition === 'EXCLUDE_AND_RESCALE') {
    isCorrect = false;
    isWrong = false;
    isPartial = false;
    isSkipped = true;
    awardedMarks = 0;
    evaluationLog.push(
      `Explicit scoring disposition EXCLUDE_AND_RESCALE for disposition '${resolution.questionDisposition}'; excluded from scoring denominator`
    );
  } else if (resolution.scoringDisposition === 'ZERO_MARKS') {
    isCorrect = false;
    isWrong = false;
    isPartial = false;
    isSkipped = false;
    awardedMarks = 0;
    evaluationLog.push(
      `Explicit scoring disposition ZERO_MARKS for disposition '${resolution.questionDisposition}'; awarded 0 marks`
    );
  } else if (resolution.scoringDisposition === 'STANDARD_EVALUATION') {
    if (isSkipped) {
      awardedMarks = rule.unansweredMarks;
      evaluationLog.push(`Attempt marked as skipped; awarded unanswered marks ${awardedMarks}`);
    } else {
      // 3. Substantive Answer Evaluation by Payload Type
      const payload = candidate.parsedPayload;

      if (payload.type === 'SINGLE_CHOICE_MCQ') {
        const selected = attempt.userSelectedOptionIds?.[0];
        const targetLabel = payload.correctOptionLabel;
        const targetId = payload.correctOptionId;

        const matches = selected === targetLabel || (targetId && selected === targetId);
        if (matches) {
          isCorrect = true;
          awardedMarks = rule.positiveMarks;
          evaluationLog.push(`MCQ exact match; awarded positive marks +${awardedMarks}`);
        } else {
          isWrong = true;
          awardedMarks = -rule.negativeMarks;
          evaluationLog.push(`MCQ wrong selection '${selected}'; deducted negative marks -${rule.negativeMarks}`);
        }
      } else if (payload.type === 'MULTIPLE_CHOICE_MSQ') {
        const targetLabels = new Set(payload.correctOptionLabels);
        const userSelected = new Set(attempt.userSelectedOptionIds || []);

        const hasWrongOption = [...userSelected].some((opt) => !targetLabels.has(opt));
        const isExactMatch =
          userSelected.size === targetLabels.size &&
          [...userSelected].every((opt) => targetLabels.has(opt));

        if (isExactMatch) {
          isCorrect = true;
          awardedMarks = rule.positiveMarks;
          evaluationLog.push(`MSQ exact match; awarded full marks +${awardedMarks}`);
        } else if (hasWrongOption) {
          isWrong = true;
          if (rule.policyType === 'MSQ_ALL_OR_NOTHING') {
            awardedMarks = -rule.negativeMarks;
          } else if (rule.policyType === 'MSQ_PARTIAL_CREDIT') {
            if (
              rule.partialCreditConfig === undefined ||
              rule.partialCreditConfig.wrongOptionPenalty === undefined
            ) {
              return {
                isEvaluated: false,
                failureReason: `Scoring rule '${rule.ruleId}' requires partialCreditConfig.wrongOptionPenalty for MSQ_PARTIAL_CREDIT; fails closed under no-hidden-defaults contract`,
              };
            }
            const penalty = rule.partialCreditConfig.wrongOptionPenalty;
            awardedMarks = -penalty;
          } else {
            return {
              isEvaluated: false,
              failureReason: `Unsupported MSQ policy type: '${rule.policyType}'`,
            };
          }
          evaluationLog.push(`MSQ incorrect option selected; assessed penalty ${awardedMarks}`);
        } else if (userSelected.size > 0 && userSelected.size < targetLabels.size) {
          // Proper subset with no incorrect options
          if (rule.policyType === 'MSQ_PARTIAL_CREDIT') {
            if (
              rule.partialCreditConfig === undefined ||
              rule.partialCreditConfig.singleOptionMatchWeight === undefined
            ) {
              return {
                isEvaluated: false,
                failureReason: `Scoring rule '${rule.ruleId}' requires partialCreditConfig.singleOptionMatchWeight for MSQ_PARTIAL_CREDIT; fails closed under no-hidden-defaults contract`,
              };
            }
            isPartial = true;
            const weight = rule.partialCreditConfig.singleOptionMatchWeight;
            awardedMarks = userSelected.size * weight;
            evaluationLog.push(`MSQ partial credit awarded for ${userSelected.size} correct options: +${awardedMarks}`);
          } else {
            isWrong = true;
            awardedMarks = 0;
            evaluationLog.push('MSQ all-or-nothing policy; partial subset awarded 0 marks');
          }
        } else {
          isSkipped = true;
          awardedMarks = rule.unansweredMarks;
          evaluationLog.push('MSQ empty selection; treated as unanswered');
        }
      } else if (payload.type === 'NUMERICAL_RANGE_NAT') {
        const rawUserStr = attempt.userNumericalInput || '';
        const userParse = parseExactNumericInput(rawUserStr, {
          allowFractions: rule.numericalToleranceConfig?.allowFractionSyntax,
        });

        if (!userParse.isSuccess || !userParse.parsedRepresentation) {
          return {
            isEvaluated: false,
            failureReason: `User NAT input '${rawUserStr}' could not be parsed: ${userParse.errorMessage || 'Ambiguous syntax'}`,
          };
        }

        // Parse target representation
        let targetRep = payload.exactValue
          ? parseExactNumericInput(payload.exactValue, { allowFractions: true }).parsedRepresentation
          : undefined;

        if (!targetRep && payload.rangeLow && payload.rangeHigh) {
          if (!rule.numericalToleranceConfig?.boundsInclusivity) {
            return {
              isEvaluated: false,
              failureReason: `Scoring rule '${rule.ruleId}' requires numericalToleranceConfig.boundsInclusivity ('INCLUSIVE' or 'EXCLUSIVE') for interval evaluation; fails closed under no-hidden-defaults contract`,
            };
          }

          const low = parseExactNumericInput(payload.rangeLow).parsedRepresentation;
          const high = parseExactNumericInput(payload.rangeHigh).parsedRepresentation;
          if (low && high) {
            targetRep = {
              format: 'NUMERIC_INTERVAL',
              lowEndpoint: low,
              highEndpoint: high,
              isLowInclusive: rule.numericalToleranceConfig.boundsInclusivity === 'INCLUSIVE',
              isHighInclusive: rule.numericalToleranceConfig.boundsInclusivity === 'INCLUSIVE',
              rawSourceString: `[${payload.rangeLow}, ${payload.rangeHigh}]`,
            };
          }
        }

        if (!targetRep) {
          return {
            isEvaluated: false,
            failureReason: 'Target NAT answer representation is incomplete or invalid',
          };
        }

        if (
          (rule.numericalToleranceConfig?.absoluteTolerance ||
            rule.numericalToleranceConfig?.relativeTolerancePercent) &&
          !rule.numericalToleranceConfig?.boundsInclusivity
        ) {
          return {
            isEvaluated: false,
            failureReason: `Scoring rule '${rule.ruleId}' requires numericalToleranceConfig.boundsInclusivity ('INCLUSIVE' or 'EXCLUSIVE') when numerical tolerance is configured; fails closed under no-hidden-defaults contract`,
          };
        }

        const matchResult = evaluateExactNumericMatch(
          userParse.parsedRepresentation,
          targetRep,
          rule.numericalToleranceConfig
        );

        if (matchResult.isMatch) {
          isCorrect = true;
          awardedMarks = rule.positiveMarks;
          evaluationLog.push(`NAT match verified: ${matchResult.details}; awarded +${awardedMarks}`);
        } else {
          isWrong = true;
          awardedMarks = -rule.negativeMarks;
          evaluationLog.push(`NAT match failed: ${matchResult.details}; deducted -${rule.negativeMarks}`);
        }
      } else if (payload.type === 'MATRIX_MATCH') {
        // Evaluate matrix match
        const targetPairs = payload.pairs;
        const userPairs = attempt.userMatrixPairs || [];

        // Check if all user pairs match target pairs
        let matchedCount = 0;
        for (const uPair of userPairs) {
          const found = targetPairs.some(
            (tp) => tp.sourceLabel === uPair.source && tp.targetLabels.includes(uPair.target)
          );
          if (found) matchedCount++;
        }

        const isExact = matchedCount === targetPairs.length && userPairs.length === targetPairs.length;
        if (isExact) {
          isCorrect = true;
          awardedMarks = rule.positiveMarks;
          evaluationLog.push(`Matrix match 100% exact; awarded +${awardedMarks}`);
        } else if (rule.policyType === 'MATRIX_PARTIAL_CREDIT' && matchedCount > 0) {
          if (
            rule.matrixMatchConfig === undefined ||
            rule.matrixMatchConfig.marksPerRow === undefined
          ) {
            return {
              isEvaluated: false,
              failureReason: `Scoring rule '${rule.ruleId}' requires matrixMatchConfig.marksPerRow for MATRIX_PARTIAL_CREDIT; fails closed under no-hidden-defaults contract`,
            };
          }
          isPartial = true;
          const marksPerRow = rule.matrixMatchConfig.marksPerRow;
          awardedMarks = matchedCount * marksPerRow;
          evaluationLog.push(`Matrix match partial credit: ${matchedCount} rows matched; awarded +${awardedMarks}`);
        } else {
          isWrong = true;
          awardedMarks = -rule.negativeMarks;
          evaluationLog.push(`Matrix match failed; deducted -${rule.negativeMarks}`);
        }
      } else {
        return {
          isEvaluated: false,
          failureReason: `Unsupported answer payload type for scoring: ${payload.type}`,
        };
      }
    }
  } else {
    return {
      isEvaluated: false,
      failureReason: `Unsupported scoring disposition: '${resolution.scoringDisposition}'`,
    };
  }

  // 4. Derive Deterministic Evaluation ID strictly from Inputs
  const evaluationId = deriveEvaluationId({
    attemptId: attempt.attemptId,
    canonicalQuestionId: attempt.canonicalQuestionId,
    responseFingerprint: attempt.responseFingerprint,
    resolvedAnswerVersionId: resolution.resolutionVersionId,
    scoringPolicyVersionId: policyVersion.policyVersionId,
  });

  const record: ScoreEvaluationRecord = {
    evaluationId,
    attemptId: attempt.attemptId,
    canonicalQuestionId: attempt.canonicalQuestionId,
    responseFingerprint: attempt.responseFingerprint,
    resolvedAnswerVersionId: resolution.resolutionVersionId,
    scoringPolicyVersionId: policyVersion.policyVersionId,
    selectedRuleId: rule.ruleId,
    isCorrect,
    isPartial,
    isWrong,
    isSkipped,
    questionDisposition: resolution.questionDisposition,
    scoringDisposition: resolution.scoringDisposition,
    awardedMarks,
    evaluationLog,
    evaluatedAt,
  };

  return {
    isEvaluated: true,
    record,
  };
}
