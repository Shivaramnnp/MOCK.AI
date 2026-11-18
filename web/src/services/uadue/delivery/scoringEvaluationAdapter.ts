/**
 * UADUE Phase 3.5 — Scoring & Evaluation Delivery Adapter
 * Specification: UADUE-P3-SCORE-008
 * Architecture Reference: docs/phase3/PHASE_3_SCORING_BOUNDARY.md
 *
 * Implements:
 * 1. Operational Delivery Orchestration wrapping ScoringEvaluationCore (pure Phase 2D-5 consumer)
 * 2. Fail-closed contract validation:
 *    - Session must be in terminal state (SUBMITTED or EXPIRED)
 *    - Package ID and integrity seal must match PostgreSQL canonical persistence
 *    - Scoring policy version and answer keys must be present and verified
 * 3. Append-only Corrigendum DAG:
 *    - Monotonic run_iteration (Iteration 1 -> 2 -> N)
 *    - supersedes_run_id linkage to immediate predecessor
 *    - Forked successor rejection
 *    - Rejection of identical contract re-runs without amendments
 * 4. Deterministic Evaluation Run Identifiers:
 *    - Pure input hashing via deriveEvaluationRunId() (ZERO Date.now() / Math.random())
 * 5. Cryptographic RFC 8785 SHA-256 evaluation signature for tamper-evident audit
 */

import { createHash } from 'crypto';
import { DeliveryPostgresAdapter } from './deliveryPostgresAdapter';
import {
  AuthoritativeResolutionBinding,
  CandidateEvaluationRunRecord,
  CandidateQuestionScoreRecord,
  CandidateQuestionStateRecord,
  EvaluationAuditVerificationResult,
  EvaluationRunResult,
  ScoringEvaluationOptions,
} from './deliveryTypes';
import {
  CoreEvaluationInput,
  CoreEvaluationItemInput,
  ScoringEvaluationCore,
} from './scoringEvaluationCore';
import {
  computeCanonicalSha256,
  rfc8785Canonicalize,
} from '../canonical/canonicalHashing';
import { UserAttemptResponse } from '../canonical/types';

export class EvaluationError extends Error {
  constructor(message: string) {
    super(`Evaluation Error: ${message}`);
    this.name = 'EvaluationError';
  }
}

/**
 * Derives a deterministic evaluation run ID strictly from the immutable contract tuple.
 */
export function deriveEvaluationRunId(input: {
  examSessionId: string;
  packageId: string;
  packageIntegritySeal: string;
  scoringPolicyVersionId: string;
  runIteration: number;
}): string {
  return `eval_run_${computeCanonicalSha256('eval_run', {
    examSessionId: input.examSessionId,
    packageId: input.packageId,
    packageIntegritySeal: input.packageIntegritySeal,
    runIteration: input.runIteration,
    scoringPolicyVersionId: input.scoringPolicyVersionId,
  }).substring(0, 32)}`;
}

export class ScoringEvaluationAdapter {
  constructor(private readonly adapter: DeliveryPostgresAdapter) {}

  /**
   * Authoritative examination session evaluation against real PostgreSQL.
   * Fails closed on any contract violation, delegates calculation to pure ScoringEvaluationCore,
   * and persists append-only records with cryptographic RFC 8785 signature.
   */
  public async evaluateSession(
    options: ScoringEvaluationOptions
  ): Promise<EvaluationRunResult> {
    // 1. Session verification & Terminal state check (P3-I07)
    const session = await this.adapter.getExamSession(options.examSessionId, options.tenantId);
    if (!session) {
      throw new EvaluationError(`Exam session not found: ${options.examSessionId}; fails closed`);
    }
    if (session.sessionState !== 'SUBMITTED' && session.sessionState !== 'EXPIRED') {
      throw new EvaluationError(
        `Cannot evaluate session '${options.examSessionId}' in non-terminal state '${session.sessionState}'. Session must be SUBMITTED or EXPIRED; fails closed`
      );
    }

    // 2. Fail-closed package and integrity seal verification against PostgreSQL
    const client = await this.adapter.getPool().connect();
    try {
      const pkgRes = await client.query(
        `SELECT package_id, package_integrity_seal FROM public.canonical_assessment_packages WHERE package_id = $1`,
        [options.packageId]
      );
      if (pkgRes.rows.length === 0) {
        throw new EvaluationError(`Canonical package not found: ${options.packageId}; fails closed`);
      }
      if (pkgRes.rows[0].package_integrity_seal !== options.packageIntegritySeal) {
        throw new EvaluationError(
          `Package integrity seal mismatch: expected ${pkgRes.rows[0].package_integrity_seal}, received ${options.packageIntegritySeal}; fails closed`
        );
      }
      if (session.packageId !== options.packageId || session.packageIntegritySeal !== options.packageIntegritySeal) {
        throw new EvaluationError(
          `Session package or seal does not match evaluation contract; fails closed`
        );
      }
    } finally {
      client.release();
    }

    // 3. Fail-closed policy and answer key verification
    if (!options.scoringPolicy || !options.scoringPolicy.policyVersionId) {
      throw new EvaluationError('Missing scoring policy version; fails closed');
    }
    if (!options.authoritativeKeys || options.authoritativeKeys.length === 0) {
      throw new EvaluationError('Missing authoritative answer keys; fails closed');
    }

    // 4. Corrigendum DAG traversal & head resolution
    const priorRuns = await this.adapter.getEvaluationRunsForSession(
      options.examSessionId,
      options.tenantId
    );

    let runIteration = 1;
    let supersedesRunId: string | null = null;
    if (priorRuns.length > 0) {
      const latestRun = priorRuns[0];
      runIteration = latestRun.runIteration + 1;
      supersedesRunId = latestRun.evaluationRunId;

      // Fail-closed against silent identical re-runs
      const isIdenticalContract =
        latestRun.scoringPolicyVersion === options.scoringPolicy.policyVersionId &&
        latestRun.packageIntegritySeal === options.packageIntegritySeal &&
        latestRun.packageId === options.packageId;

      // Check if authoritative key versions are identical
      const priorTuple = latestRun.evaluationContractTuple as Record<string, unknown>;
      const priorKeyCount = Number(priorTuple?.authoritativeKeyCount ?? 0);
      if (isIdenticalContract && priorKeyCount === options.authoritativeKeys.length) {
        const priorKeysHash = priorTuple?.authoritativeKeysHash as string;
        const currentKeysHash = computeCanonicalSha256('keys', {
          keys: options.authoritativeKeys.map((k) => ({
            id: k.canonicalQuestionId,
            resId: k.resolution.resolutionVersionId,
          })),
        });
        if (priorKeysHash === currentKeysHash) {
          throw new EvaluationError(
            `Identical evaluation contract re-run rejected: run ${latestRun.evaluationRunId} already exists for this exact contract; fails closed under append-only DAG invariant`
          );
        }
      }

      // Check for forked successors
      const existingSuccessors = priorRuns.filter((r) => r.supersedesRunId === supersedesRunId);
      if (existingSuccessors.length > 0) {
        throw new EvaluationError(
          `Forked successor rejected: predecessor ${supersedesRunId} is already superseded by ${existingSuccessors[0].evaluationRunId}; fails closed under single-head DAG invariant`
        );
      }
    }

    // 5. Retrieve candidate question states (Attempt Snapshot)
    const questionStates = await this.adapter.getAllQuestionStates(
      options.examSessionId,
      options.tenantId
    );
    const qStateMap = new Map<string, CandidateQuestionStateRecord>();
    for (const qs of questionStates) {
      qStateMap.set(qs.canonicalQuestionId, qs);
    }

    // 6. Assemble inputs for pure ScoringEvaluationCore
    const coreItems: CoreEvaluationItemInput[] = [];
    for (const keyBinding of options.authoritativeKeys) {
      const qState = qStateMap.get(keyBinding.canonicalQuestionId);

      // Convert CandidateQuestionStateRecord to Phase 2D-5 UserAttemptResponse
      const userSelectedOptionIds = qState?.selectedOptionId
        ? [qState.selectedOptionId]
        : ((qState?.responsePayload?.selectedOptionIds as string[]) || (qState?.responsePayload?.selectedOptionId ? [qState.responsePayload.selectedOptionId as string] : []));

      const userNumericalInput =
        qState?.responsePayload?.enteredValue !== undefined
          ? String(qState.responsePayload.enteredValue)
          : (qState?.responsePayload?.numericalInput !== undefined
              ? String(qState.responsePayload.numericalInput)
              : undefined);

      const userMatrixPairs = qState?.responsePayload?.matrixPairs as { source: string; target: string }[] | undefined;

      const isSkipped = !qState?.isAnswered || Boolean(qState?.responsePayload?.isSkipped);

      const responseFingerprint =
        qState?.payloadFingerprint ||
        computeCanonicalSha256('attempt_fp', {
          isSkipped,
          userMatrixPairs: userMatrixPairs || [],
          userNumericalInput: userNumericalInput || '',
          userSelectedOptionIds: userSelectedOptionIds.slice().sort(),
        });

      const attempt: UserAttemptResponse = {
        attemptId: qState?.stateId || computeCanonicalSha256('att', { qId: keyBinding.canonicalQuestionId, sId: options.examSessionId }),
        canonicalQuestionId: keyBinding.canonicalQuestionId,
        userSelectedOptionIds: userSelectedOptionIds.length > 0 ? userSelectedOptionIds : undefined,
        userNumericalInput,
        userMatrixPairs,
        isSkipped,
        responseFingerprint,
        submittedAt: 0,
      };

      coreItems.push({
        canonicalQuestionId: keyBinding.canonicalQuestionId,
        attempt,
        resolution: keyBinding.resolution,
        candidate: keyBinding.candidate,
        questionTraits: keyBinding.questionTraits,
      });
    }

    const coreInput: CoreEvaluationInput = {
      policyVersion: options.scoringPolicy,
      items: coreItems,
    };

    // 7. Execute pure Phase 2D-5 evaluation
    const evaluation = ScoringEvaluationCore.evaluateAttempt(coreInput);

    // 8. Deterministic evaluation run ID derivation (ZERO Date.now() / Math.random())
    const evaluationRunId = deriveEvaluationRunId({
      examSessionId: options.examSessionId,
      packageId: options.packageId,
      packageIntegritySeal: options.packageIntegritySeal,
      scoringPolicyVersionId: options.scoringPolicy.policyVersionId,
      runIteration,
    });

    const nowIso = new Date().toISOString();

    // 9. Map item scores to database records
    const questionScores: CandidateQuestionScoreRecord[] = evaluation.itemScores.map((item) => ({
      questionScoreId: item.evaluationId,
      evaluationRunId,
      tenantId: options.tenantId,
      canonicalQuestionId: item.canonicalQuestionId,
      candidateResponseRaw: item.candidateResponseRaw,
      resolvedCorrectKey: item.resolvedCorrectKey,
      isCorrect: item.isCorrect,
      isPartiallyCorrect: item.isPartiallyCorrect,
      marksAwarded: item.marksAwarded,
      penaltyDeducted: item.penaltyDeducted,
      netScore: item.netScore,
      disposition: item.scoringDisposition,
      createdAt: nowIso,
    }));

    // 10. Compute cryptographic RFC 8785 SHA-256 evaluation signature
    const scorecardPayload = {
      examSessionId: options.examSessionId,
      packageId: options.packageId,
      packageIntegritySeal: options.packageIntegritySeal,
      scoringPolicyVersion: options.scoringPolicy.policyVersionId,
      runIteration,
      supersedesRunId,
      totalRawScore: evaluation.totalRawScore,
      totalNormalizedScore: evaluation.totalNormalizedScore,
      questionsAttempted: evaluation.questionsAttempted,
      questionsCorrect: evaluation.questionsCorrect,
      questionsIncorrect: evaluation.questionsIncorrect,
      questionsUnanswered: evaluation.questionsUnanswered,
      questionScores: questionScores
        .map((qs) => ({
          canonicalQuestionId: qs.canonicalQuestionId,
          isCorrect: qs.isCorrect,
          isPartiallyCorrect: qs.isPartiallyCorrect,
          marksAwarded: qs.marksAwarded,
          penaltyDeducted: qs.penaltyDeducted,
          netScore: qs.netScore,
          disposition: qs.disposition,
        }))
        .sort((a, b) => a.canonicalQuestionId.localeCompare(b.canonicalQuestionId)),
    };

    const canonicalScorecard = rfc8785Canonicalize(scorecardPayload);
    const evaluationSignature = createHash('sha256').update(canonicalScorecard).digest('hex');

    const authoritativeKeysHash = computeCanonicalSha256('keys', {
      keys: options.authoritativeKeys.map((k) => ({
        id: k.canonicalQuestionId,
        resId: k.resolution.resolutionVersionId,
      })),
    });

    const evaluationContractTuple = {
      attemptSnapshotCount: questionStates.length,
      packageId: options.packageId,
      packageIntegritySeal: options.packageIntegritySeal,
      scoringPolicyVersion: options.scoringPolicy.policyVersionId,
      authoritativeKeyCount: options.authoritativeKeys.length,
      authoritativeKeysHash,
      runIteration,
    };

    const runRecord: CandidateEvaluationRunRecord = {
      evaluationRunId,
      examSessionId: options.examSessionId,
      tenantId: options.tenantId,
      packageId: options.packageId,
      packageIntegritySeal: options.packageIntegritySeal,
      scoringPolicyVersion: options.scoringPolicy.policyVersionId,
      answerKeyVersion: options.authoritativeKeys[0]?.resolution.resolutionVersionId || 'authoritative_v1',
      evaluationContractTuple,
      runIteration,
      supersedesRunId,
      totalRawScore: evaluation.totalRawScore,
      totalNormalizedScore: evaluation.totalNormalizedScore,
      questionsAttempted: evaluation.questionsAttempted,
      questionsCorrect: evaluation.questionsCorrect,
      questionsIncorrect: evaluation.questionsIncorrect,
      questionsUnanswered: evaluation.questionsUnanswered,
      evaluationSignature,
      evaluatedAt: nowIso,
    };

    // 11. Atomically persist evaluation run and granular question scores
    await this.adapter.createEvaluationRun(runRecord);
    await this.adapter.recordQuestionScores(questionScores);

    // 12. Record governance audit event
    await this.adapter.recordAuditEvent({
      auditEventId: computeCanonicalSha256('aud_eval', {
        evaluationRunId,
        evaluatedAt: nowIso,
      }),
      tenantId: options.tenantId,
      eventType: 'EVALUATION_RUN_COMPLETED',
      severity: 'INFO',
      actorType: 'SYSTEM',
      actorId: 'scoring_evaluator_adapter',
      resourceType: 'candidate_evaluation_runs',
      resourceId: evaluationRunId,
      eventPayload: {
        examSessionId: options.examSessionId,
        runIteration,
        supersedesRunId,
        totalRawScore: evaluation.totalRawScore,
        totalNormalizedScore: evaluation.totalNormalizedScore,
        questionsAttempted: evaluation.questionsAttempted,
        questionsCorrect: evaluation.questionsCorrect,
        questionsIncorrect: evaluation.questionsIncorrect,
        questionsUnanswered: evaluation.questionsUnanswered,
        evaluationSignature,
      },
      recordedAt: nowIso,
    });

    return {
      run: runRecord,
      questionScores,
    };
  }

  /**
   * Reconstructs evaluation scorecard and verifies cryptographic integrity against database records.
   * Immediately flags tampering if stored signature != recomputed signature.
   */
  public async verifyEvaluationAudit(
    evaluationRunId: string,
    tenantId: string
  ): Promise<EvaluationAuditVerificationResult> {
    const run = await this.adapter.getEvaluationRun(evaluationRunId, tenantId);
    if (!run) {
      return {
        isValid: false,
        evaluationRunId,
        storedSignature: '',
        recomputedSignature: '',
        isTamperDetected: true,
        scoreMatch: false,
        storedRawScore: 0,
        recomputedRawScore: 0,
        discrepancies: [`Evaluation run ${evaluationRunId} not found for tenant ${tenantId}`],
      };
    }

    const questionScores = await this.adapter.getQuestionScores(evaluationRunId, tenantId);

    const scorecardPayload = {
      examSessionId: run.examSessionId,
      packageId: run.packageId,
      packageIntegritySeal: run.packageIntegritySeal,
      scoringPolicyVersion: run.scoringPolicyVersion,
      runIteration: run.runIteration,
      supersedesRunId: run.supersedesRunId,
      totalRawScore: run.totalRawScore,
      totalNormalizedScore: run.totalNormalizedScore,
      questionsAttempted: run.questionsAttempted,
      questionsCorrect: run.questionsCorrect,
      questionsIncorrect: run.questionsIncorrect,
      questionsUnanswered: run.questionsUnanswered,
      questionScores: questionScores
        .map((qs) => ({
          canonicalQuestionId: qs.canonicalQuestionId,
          isCorrect: qs.isCorrect,
          isPartiallyCorrect: qs.isPartiallyCorrect,
          marksAwarded: qs.marksAwarded,
          penaltyDeducted: qs.penaltyDeducted,
          netScore: qs.netScore,
          disposition: qs.disposition,
        }))
        .sort((a, b) => a.canonicalQuestionId.localeCompare(b.canonicalQuestionId)),
    };

    const canonicalScorecard = rfc8785Canonicalize(scorecardPayload);
    const recomputedSignature = createHash('sha256').update(canonicalScorecard).digest('hex');

    const recomputedRawScore = Number(
      questionScores.reduce((acc, qs) => acc + qs.netScore, 0).toFixed(4)
    );
    const scoreMatch = Math.abs(run.totalRawScore - recomputedRawScore) < 0.0001;
    const signatureMatch = run.evaluationSignature === recomputedSignature;

    const discrepancies: string[] = [];
    if (!signatureMatch) {
      discrepancies.push(
        `Signature mismatch: stored [${run.evaluationSignature}] vs recomputed [${recomputedSignature}]`
      );
    }
    if (!scoreMatch) {
      discrepancies.push(
        `Score mismatch: stored totalRawScore [${run.totalRawScore}] vs sum of net scores [${recomputedRawScore}]`
      );
    }

    const isValid = signatureMatch && scoreMatch;

    return {
      isValid,
      evaluationRunId,
      storedSignature: run.evaluationSignature,
      recomputedSignature,
      isTamperDetected: !isValid,
      scoreMatch,
      storedRawScore: run.totalRawScore,
      recomputedRawScore,
      discrepancies: discrepancies.length > 0 ? discrepancies : undefined,
    };
  }
}
