/**
 * UADUE Phase 3.5 — Scoring Evaluation Core (Pure Engine)
 * Specification: UADUE-P3-SCORE-008 (Hardened Raw-Score Fallback)
 * Architecture Reference: docs/phase3/PHASE_3_SCORING_BOUNDARY.md
 *
 * Implements:
 * 1. 100% pure deterministic scoring evaluation function F_eval(A, P, Pi, K) (Contract P3-I07 & P3-I10)
 * 2. ZERO independent scoring logic:
 *    - Delegates MCQ, MSQ, NAT, Matrix Match directly to Phase 2D-5 evaluateUserAttempt()
 *    - Consumes authoritative AnswerAuthorityResolutionVersion and ScoringPolicyVersion
 *    - Preserves statutory dispositions AWARD_FULL_MARKS and EXCLUDE_AND_RESCALE as opaque Phase 2D-5 outcomes
 * 3. Exact rational NAT evaluation (ZERO Number() / parseFloat() approximations)
 * 4. PURE boundary:
 *    - Zero pg / database dependencies
 *    - Zero SQL queries
 *    - Zero side effects
 *    - Zero Date.now() / Math.random() calls
 * 5. RAW SCORE ONLY (No unauthorized aggregate normalization):
 *    - totalRawScore = exact sum of authoritative Phase 2D-5 awardedMarks
 *    - totalNormalizedScore = null (pending future Canonical Assessment-Policy Layer)
 *    - ZERO aggregate pro-rata formulas or denominator redistribution
 */

import {
  evaluateUserAttempt,
  QuestionScoringTraits,
} from '../canonical/scoringEvaluator';
import {
  AnswerAuthorityResolutionVersion,
  AnswerCandidate,
  ScoreEvaluationRecord,
  ScoringPolicyVersion,
  UserAttemptResponse,
} from '../canonical/types';

export class EvaluationCoreError extends Error {
  constructor(message: string) {
    super(`Evaluation Core Error: ${message}`);
    this.name = 'EvaluationCoreError';
  }
}

export interface CoreEvaluationItemInput {
  canonicalQuestionId: string;
  attempt: UserAttemptResponse;
  resolution: AnswerAuthorityResolutionVersion;
  candidate: AnswerCandidate;
  questionTraits: QuestionScoringTraits;
}

export interface CoreEvaluationInput {
  policyVersion: ScoringPolicyVersion;
  items: CoreEvaluationItemInput[];
}

export interface CoreItemScore {
  canonicalQuestionId: string;
  evaluationId: string;
  isCorrect: boolean;
  isPartiallyCorrect: boolean;
  isWrong: boolean;
  isSkipped: boolean;
  marksAwarded: number;
  penaltyDeducted: number;
  netScore: number;
  scoringDisposition: string;
  questionDisposition: string;
  selectedRuleId: string;
  evaluationLog: string[];
  candidateResponseRaw: Record<string, unknown>;
  resolvedCorrectKey: Record<string, unknown>;
}

export interface CoreEvaluationOutput {
  totalRawScore: number;
  totalNormalizedScore: null;
  questionsAttempted: number;
  questionsCorrect: number;
  questionsIncorrect: number;
  questionsUnanswered: number;
  itemScores: CoreItemScore[];
}

export class ScoringEvaluationCore {
  /**
   * Pure evaluation function: F_eval(A, P, Pi, K)
   * Strictly delegates every question item to Phase 2D-5 evaluateUserAttempt().
   * Computes aggregate totalRawScore strictly as the deterministic sum of awardedMarks.
   * Leaves totalNormalizedScore as null pending canonical assessment policy.
   * Pure, deterministic, side-effect free.
   */
  public static evaluateAttempt(input: CoreEvaluationInput): CoreEvaluationOutput {
    let totalRawScore = 0;
    let questionsAttempted = 0;
    let questionsCorrect = 0;
    let questionsIncorrect = 0;
    let questionsUnanswered = 0;
    const itemScores: CoreItemScore[] = [];

    for (const item of input.items) {
      // 1. Delegate directly to Phase 2D-5 evaluateUserAttempt()
      const outcome = evaluateUserAttempt({
        attempt: item.attempt,
        resolution: item.resolution,
        candidate: item.candidate,
        policyVersion: input.policyVersion,
        questionTraits: item.questionTraits,
        evaluatedAt: 0, // Deterministic timestamp placeholder
      });

      if (!outcome.isEvaluated || !outcome.record) {
        throw new EvaluationCoreError(
          `Phase 2D-5 evaluation failed for question '${item.canonicalQuestionId}': ${outcome.failureReason || 'Unknown evaluator error'}`
        );
      }

      const rec: ScoreEvaluationRecord = outcome.record;

      // 2. Derive marks breakdown strictly from Phase 2D-5 awardedMarks
      const netScore = rec.awardedMarks;
      let marksAwarded = 0;
      let penaltyDeducted = 0;

      if (netScore > 0) {
        marksAwarded = netScore;
        penaltyDeducted = 0;
      } else if (netScore < 0) {
        marksAwarded = 0;
        penaltyDeducted = Math.abs(netScore);
      } else {
        marksAwarded = 0;
        penaltyDeducted = 0;
      }

      // Aggregate total raw score strictly from Phase 2D-5 awardedMarks
      totalRawScore += netScore;

      // 3. Track attempt counters
      if (!item.attempt.isSkipped) {
        questionsAttempted++;
      } else {
        questionsUnanswered++;
      }

      if (rec.isCorrect) {
        questionsCorrect++;
      } else if (rec.isWrong && !item.attempt.isSkipped) {
        questionsIncorrect++;
      }

      itemScores.push({
        canonicalQuestionId: item.canonicalQuestionId,
        evaluationId: rec.evaluationId,
        isCorrect: rec.isCorrect,
        isPartiallyCorrect: rec.isPartial,
        isWrong: rec.isWrong,
        isSkipped: rec.isSkipped,
        marksAwarded: Number(marksAwarded.toFixed(4)),
        penaltyDeducted: Number(penaltyDeducted.toFixed(4)),
        netScore: Number(netScore.toFixed(4)),
        scoringDisposition: rec.scoringDisposition,
        questionDisposition: rec.questionDisposition,
        selectedRuleId: rec.selectedRuleId,
        evaluationLog: rec.evaluationLog,
        candidateResponseRaw: {
          userSelectedOptionIds: item.attempt.userSelectedOptionIds,
          userNumericalInput: item.attempt.userNumericalInput,
          userMatrixPairs: item.attempt.userMatrixPairs,
          isSkipped: item.attempt.isSkipped,
        },
        resolvedCorrectKey: {
          parsedPayload: item.candidate.parsedPayload,
          resolutionVersionId: item.resolution.resolutionVersionId,
          scoringDisposition: item.resolution.scoringDisposition,
          questionDisposition: item.resolution.questionDisposition,
        },
      });
    }

    return {
      totalRawScore: Number(totalRawScore.toFixed(4)),
      totalNormalizedScore: null,
      questionsAttempted,
      questionsCorrect,
      questionsIncorrect,
      questionsUnanswered,
      itemScores,
    };
  }
}
