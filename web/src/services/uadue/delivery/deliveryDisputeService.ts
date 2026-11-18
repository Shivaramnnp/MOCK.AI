/**
 * UADUE Phase 3.5 — Candidate Dispute & Appeal Service
 * Specification: UADUE-P3-SCORE-008
 * Architecture Reference: docs/phase3/PHASE_3_SCORING_BOUNDARY.md
 *
 * Implements:
 * 1. Isolated dispute lifecycle (PENDING -> UNDER_REVIEW -> ACCEPTED / REJECTED)
 * 2. Independent audit event trail (SCORING_DISPUTE_FILED, SCORING_DISPUTE_RESOLVED)
 * 3. STRICT IMMUTABILITY: Disputes NEVER mutate candidate_evaluation_runs or candidate_question_scores
 */

import { DeliveryPostgresAdapter } from './deliveryPostgresAdapter';
import { CandidateScoringDisputeRecord } from './deliveryTypes';
import { computeCanonicalSha256 } from '../canonical/canonicalHashing';

export class DisputeServiceError extends Error {
  constructor(message: string) {
    super(`Dispute Service Error: ${message}`);
    this.name = 'DisputeServiceError';
  }
}

export interface FileDisputeParams {
  disputeId?: string;
  examSessionId: string;
  tenantId: string;
  candidateId: string;
  canonicalQuestionId: string;
  evaluationRunId: string;
  disputeReason: string;
  createdAt?: string;
}

export interface ResolveDisputeParams {
  disputeId: string;
  tenantId: string;
  disputeStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'UNDER_REVIEW';
  resolutionNotes: string;
  resolvedBy: string;
  resolvedAt?: string;
}

export class DeliveryDisputeService {
  constructor(private readonly adapter: DeliveryPostgresAdapter) {}

  /**
   * Files a candidate appeal against an item score in an evaluation run.
   */
  public async fileScoringDispute(
    params: FileDisputeParams
  ): Promise<CandidateScoringDisputeRecord> {
    const run = await this.adapter.getEvaluationRun(params.evaluationRunId, params.tenantId);
    if (!run) {
      throw new DisputeServiceError(
        `Referenced evaluation run not found: ${params.evaluationRunId}; fails closed`
      );
    }

    if (run.examSessionId !== params.examSessionId) {
      throw new DisputeServiceError(
        `Evaluation run ${params.evaluationRunId} does not belong to session ${params.examSessionId}; fails closed`
      );
    }

    const disputeId =
      params.disputeId ||
      computeCanonicalSha256('disp', {
        candidateId: params.candidateId,
        canonicalQuestionId: params.canonicalQuestionId,
        evaluationRunId: params.evaluationRunId,
        examSessionId: params.examSessionId,
      });

    const nowIso = params.createdAt || new Date().toISOString();

    const dispute: CandidateScoringDisputeRecord = {
      disputeId,
      examSessionId: params.examSessionId,
      tenantId: params.tenantId,
      candidateId: params.candidateId,
      canonicalQuestionId: params.canonicalQuestionId,
      evaluationRunId: params.evaluationRunId,
      disputeReason: params.disputeReason,
      disputeStatus: 'PENDING',
      resolutionNotes: null,
      resolvedBy: null,
      createdAt: nowIso,
      resolvedAt: null,
    };

    await this.adapter.recordScoringDispute(dispute);

    await this.adapter.recordAuditEvent({
      auditEventId: computeCanonicalSha256('aud_disp', {
        disputeId,
        createdAt: nowIso,
      }),
      tenantId: params.tenantId,
      eventType: 'SCORING_DISPUTE_FILED',
      severity: 'WARN',
      actorType: 'CANDIDATE',
      actorId: params.candidateId,
      resourceType: 'candidate_scoring_disputes',
      resourceId: disputeId,
      eventPayload: {
        examSessionId: params.examSessionId,
        canonicalQuestionId: params.canonicalQuestionId,
        evaluationRunId: params.evaluationRunId,
        disputeReason: params.disputeReason,
      },
      recordedAt: nowIso,
    });

    return dispute;
  }

  /**
   * Retrieves a single dispute record.
   */
  public async getDispute(
    disputeId: string,
    tenantId: string
  ): Promise<CandidateScoringDisputeRecord | null> {
    return this.adapter.getScoringDispute(disputeId, tenantId);
  }

  /**
   * Retrieves all dispute records for a session.
   */
  public async getDisputesForSession(
    sessionId: string,
    tenantId: string
  ): Promise<CandidateScoringDisputeRecord[]> {
    return this.adapter.getScoringDisputesForSession(sessionId, tenantId);
  }

  /**
   * Resolves a candidate dispute (ACCEPTED, REJECTED, UNDER_REVIEW).
   * Does NOT mutate evaluation runs or question scores.
   */
  public async resolveScoringDispute(
    params: ResolveDisputeParams
  ): Promise<CandidateScoringDisputeRecord> {
    const existing = await this.adapter.getScoringDispute(params.disputeId, params.tenantId);
    if (!existing) {
      throw new DisputeServiceError(`Dispute not found: ${params.disputeId}`);
    }

    const nowIso = params.resolvedAt || new Date().toISOString();

    await this.adapter.updateScoringDispute(params.disputeId, params.tenantId, {
      disputeStatus: params.disputeStatus,
      resolutionNotes: params.resolutionNotes,
      resolvedBy: params.resolvedBy,
      resolvedAt: nowIso,
    });

    const updated = await this.adapter.getScoringDispute(params.disputeId, params.tenantId);
    if (!updated) {
      throw new DisputeServiceError(`Failed to fetch updated dispute: ${params.disputeId}`);
    }

    await this.adapter.recordAuditEvent({
      auditEventId: computeCanonicalSha256('aud_disp_res', {
        disputeId: params.disputeId,
        resolvedAt: nowIso,
      }),
      tenantId: params.tenantId,
      eventType: 'SCORING_DISPUTE_RESOLVED',
      severity: 'INFO',
      actorType: 'STAFF',
      actorId: params.resolvedBy,
      resourceType: 'candidate_scoring_disputes',
      resourceId: params.disputeId,
      eventPayload: {
        disputeStatus: params.disputeStatus,
        resolutionNotes: params.resolutionNotes,
        resolvedBy: params.resolvedBy,
      },
      recordedAt: nowIso,
    });

    return updated;
  }
}
