/**
 * UADUE Phase 3.3 — Submission & Event Ingestion Gateway
 * Specification: UADUE-P3-HARD-R3-001 (R3 Final Hardened Contract)
 * Pipeline Contract: UADUE-P3-SUB-007
 *
 * Implements high-throughput, fault-tolerant candidate submission ingestion:
 * 1. Strict envelope schema & package seal validation
 * 2. Device lease verification (single-active-device policy)
 * 3. PostgreSQL deadline authority with 15.000s receipt grace period (R2-01 / R3-05)
 * 4. Primary event idempotency on (exam_session_id, client_event_id) (R3-04)
 * 5. Tampered replay rejection (conflicting payload on existing client_event_id -> 409 Conflict)
 * 6. Cryptographic dual receipts (HMAC-SHA256 server signature)
 * 7. Transactional batch ingestion for offline journal flushing
 */

import { PoolClient } from 'pg';
import { createHash, createHmac } from 'crypto';
import {
  DeliveryPostgresAdapter,
  DeliveryUniqueConstraintError,
} from './deliveryPostgresAdapter';
import { SessionOrchestrator } from './sessionOrchestrator';
import {
  ExamSessionRecord,
  SubmissionEventEnvelope,
  SubmissionReceipt,
} from './deliveryTypes';

export class SubmissionSessionNotFoundError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Submission rejected: Exam session ${sessionId} not found`);
    this.name = 'SubmissionSessionNotFoundError';
  }
}

export class SubmissionSessionNotActiveError extends Error {
  constructor(public readonly sessionId: string, public readonly currentState: string) {
    super(`Submission rejected: Session ${sessionId} is in state ${currentState}, not ACTIVE`);
    this.name = 'SubmissionSessionNotActiveError';
  }
}

export class SubmissionSessionTerminatedError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Submission rejected: Session ${sessionId} is TERMINATED`);
    this.name = 'SubmissionSessionTerminatedError';
  }
}

export class SubmissionCandidateMismatchError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly expectedCandidateId: string,
    public readonly providedCandidateId: string
  ) {
    super(
      `Submission rejected: Candidate identity mismatch on session ${sessionId}. Expected ${expectedCandidateId}, got ${providedCandidateId}`
    );
    this.name = 'SubmissionCandidateMismatchError';
  }
}

export class SubmissionPackageMismatchError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly expectedPackageId: string,
    public readonly actualPackageId: string,
    public readonly expectedSeal: string,
    public readonly actualSeal: string
  ) {
    super(
      `Submission rejected: Package or seal mismatch on session ${sessionId}. Expected [${expectedPackageId} / ${expectedSeal}], got [${actualPackageId} / ${actualSeal}]`
    );
    this.name = 'SubmissionPackageMismatchError';
  }
}

export class SubmissionLeaseMismatchError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly expectedLease: string,
    public readonly providedLease: string
  ) {
    super(
      `Submission rejected: Device lease revoked or mismatched on session ${sessionId}. Active lease is ${expectedLease}, but request provided ${providedLease}`
    );
    this.name = 'SubmissionLeaseMismatchError';
  }
}

export class SubmissionDeadlineExceededError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly receiptTimestamp: string,
    public readonly deadlineAt: string,
    public readonly cutoffAt: string
  ) {
    super(
      `Submission rejected: Receipt deadline exceeded on session ${sessionId}. Receipt time ${receiptTimestamp} > cutoff ${cutoffAt} (deadline: ${deadlineAt} + 15s grace)`
    );
    this.name = 'SubmissionDeadlineExceededError';
  }
}

export class SubmissionConflictError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly clientEventId: string,
    public readonly existingFingerprint: string,
    public readonly incomingFingerprint: string
  ) {
    super(
      `Submission conflict [E_PAYLOAD_TAMPERED]: clientEventId ${clientEventId} already recorded with fingerprint ${existingFingerprint}, conflicting payload has ${incomingFingerprint}`
    );
    this.name = 'SubmissionConflictError';
  }
}

export interface SubmissionIngestionConfig {
  signingSecret?: string;
  transportGraceSeconds?: number;
}

export class SubmissionIngestionGateway {
  private readonly signingSecret: string;
  private readonly transportGraceSeconds: number;

  constructor(
    private readonly adapter: DeliveryPostgresAdapter,
    private readonly orchestrator: SessionOrchestrator,
    config: SubmissionIngestionConfig = {}
  ) {
    this.signingSecret =
      config.signingSecret ||
      process.env.UADUE_SUBMISSION_SECRET ||
      'uadue_production_submission_hmac_signing_key_v1';
    this.transportGraceSeconds = config.transportGraceSeconds ?? 15.0; // Hardened 15-second receipt grace
  }

  /**
   * Deterministically compute response fingerprint over payload (canonical JSON SHA-256)
   */
  public computeResponseFingerprint(payload: Record<string, unknown>): string {
    const canonicalString = JSON.stringify(payload, Object.keys(payload).sort());
    return createHash('sha256').update(canonicalString).digest('hex');
  }

  /**
   * Sign submission receipt with server private HMAC key
   */
  public generateReceiptSignature(fields: {
    receiptId: string;
    examSessionId: string;
    clientEventId: string;
    serverSequenceNumber: number;
    responseFingerprint: string;
  }): string {
    const raw = `${fields.receiptId}:${fields.examSessionId}:${fields.clientEventId}:${fields.serverSequenceNumber}:${fields.responseFingerprint}`;
    return createHmac('sha256', this.signingSecret).update(raw).digest('hex');
  }

  /**
   * Ingest a single candidate interaction event
   */
  public async ingestSubmission(
    envelope: SubmissionEventEnvelope
  ): Promise<SubmissionReceipt> {
    return this.adapter.withTransaction(envelope.tenantId, async (client) => {
      return this.ingestSubmissionWithClient(client, envelope);
    });
  }

  /**
   * Ingest a contiguous batch of candidate interaction events (offline journal flushing)
   */
  public async ingestBatch(
    tenantId: string,
    envelopes: SubmissionEventEnvelope[]
  ): Promise<SubmissionReceipt[]> {
    if (envelopes.length === 0) return [];

    return this.adapter.withTransaction(tenantId, async (client) => {
      const receipts: SubmissionReceipt[] = [];
      for (const envelope of envelopes) {
        const receipt = await this.ingestSubmissionWithClient(client, envelope);
        receipts.push(receipt);
      }
      return receipts;
    });
  }

  /**
   * Internal ingestion worker operating inside an established transaction client
   */
  private async ingestSubmissionWithClient(
    client: PoolClient,
    envelope: SubmissionEventEnvelope
  ): Promise<SubmissionReceipt> {
    const responseFingerprint = this.computeResponseFingerprint(envelope.payload);

    // 1. Idempotency Check: (exam_session_id, client_event_id)
    const existing = await client.query(
      `SELECT * FROM public.candidate_submission_events 
       WHERE exam_session_id = $1 AND client_event_id = $2`,
      [envelope.examSessionId, envelope.clientEventId]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      // Compare fingerprints
      if (row.response_fingerprint !== responseFingerprint) {
        throw new SubmissionConflictError(
          envelope.examSessionId,
          envelope.clientEventId,
          row.response_fingerprint,
          responseFingerprint
        );
      }

      // Exact match -> Idempotent replay
      return {
        receiptId: row.receipt_id,
        examSessionId: row.exam_session_id,
        clientEventId: row.client_event_id,
        clientSequenceNumber: row.client_sequence_number,
        serverSequenceNumber: Number(row.server_sequence_number),
        canonicalQuestionId: row.canonical_question_id,
        responseFingerprint: row.response_fingerprint,
        serverTimestamp: row.server_timestamp.toISOString(),
        validationStatus: 'ACCEPTED',
        serverSignature: row.server_signature,
        idempotentReplay: true,
      };
    }

    // 2. Fetch session and perform pre-flight validations
    const sessionRes = await client.query(
      `SELECT * FROM public.exam_sessions WHERE exam_session_id = $1 FOR SHARE`,
      [envelope.examSessionId]
    );

    if (sessionRes.rows.length === 0) {
      throw new SubmissionSessionNotFoundError(envelope.examSessionId);
    }

    const session: ExamSessionRecord = {
      examSessionId: sessionRes.rows[0].exam_session_id,
      tenantId: sessionRes.rows[0].tenant_id,
      candidateId: sessionRes.rows[0].candidate_id,
      packageId: sessionRes.rows[0].package_id,
      packageIntegritySeal: sessionRes.rows[0].package_integrity_seal,
      sessionConfiguration: sessionRes.rows[0].session_configuration,
      sessionState: sessionRes.rows[0].session_state,
      stateVersion: sessionRes.rows[0].state_version,
      currentLeaseId: sessionRes.rows[0].current_lease_id,
      leaseHeartbeatAt: sessionRes.rows[0].lease_heartbeat_at.toISOString(),
      scheduledStartAt: sessionRes.rows[0].scheduled_start_at.toISOString(),
      actualStartedAt: sessionRes.rows[0].actual_started_at
        ? sessionRes.rows[0].actual_started_at.toISOString()
        : null,
      durationSeconds: sessionRes.rows[0].duration_seconds,
      accumulatedPauseSeconds: sessionRes.rows[0].accumulated_pause_seconds,
      pauseCount: sessionRes.rows[0].pause_count,
      submittedAt: sessionRes.rows[0].submitted_at
        ? sessionRes.rows[0].submitted_at.toISOString()
        : null,
      expiredAt: sessionRes.rows[0].expired_at
        ? sessionRes.rows[0].expired_at.toISOString()
        : null,
      terminatedAt: sessionRes.rows[0].terminated_at
        ? sessionRes.rows[0].terminated_at.toISOString()
        : null,
      createdAt: sessionRes.rows[0].created_at.toISOString(),
      updatedAt: sessionRes.rows[0].updated_at.toISOString(),
    };

    // A. Terminal state: TERMINATED rejects everything
    if (session.sessionState === 'TERMINATED') {
      throw new SubmissionSessionTerminatedError(envelope.examSessionId);
    }

    // A.2 Candidate identity verification (reject IDOR attempts)
    if (envelope.candidateId && envelope.candidateId !== session.candidateId) {
      throw new SubmissionCandidateMismatchError(
        envelope.examSessionId,
        session.candidateId,
        envelope.candidateId
      );
    }

    // B. Package & Seal integrity check
    if (
      envelope.packageId !== session.packageId ||
      envelope.packageIntegritySeal !== session.packageIntegritySeal
    ) {
      throw new SubmissionPackageMismatchError(
        envelope.examSessionId,
        session.packageId,
        envelope.packageId,
        session.packageIntegritySeal,
        envelope.packageIntegritySeal
      );
    }

    // C. Lease check (if lease provided)
    if (envelope.sessionLeaseId && envelope.sessionLeaseId !== session.currentLeaseId) {
      throw new SubmissionLeaseMismatchError(
        envelope.examSessionId,
        session.currentLeaseId,
        envelope.sessionLeaseId
      );
    }

    // D. Session must be initialized and started
    if (session.sessionState === 'INITIALIZED' || !session.actualStartedAt) {
      throw new SubmissionSessionNotActiveError(envelope.examSessionId, session.sessionState);
    }

    // E. Receipt-based deadline grace check (Contract R2-01 / R3-05)
    // Server receipt timestamp from Postgres clock_timestamp() is authoritative
    const serverTimeRes = await client.query('SELECT clock_timestamp() as server_now');
    const serverReceiptTime = new Date(serverTimeRes.rows[0].server_now);

    const startMs = new Date(session.actualStartedAt).getTime();
    const totalAllowedMs = (session.durationSeconds + session.accumulatedPauseSeconds) * 1000;
    const deadlineMs = startMs + totalAllowedMs;
    const cutoffMs = deadlineMs + this.transportGraceSeconds * 1000;

    if (serverReceiptTime.getTime() > cutoffMs) {
      throw new SubmissionDeadlineExceededError(
        envelope.examSessionId,
        serverReceiptTime.toISOString(),
        new Date(deadlineMs).toISOString(),
        new Date(cutoffMs).toISOString()
      );
    }

    // 3. Allocate sequence number, generate receipt ID, and compute HMAC signature
    const seqRes = await client.query(
      "SELECT nextval('public.candidate_submission_events_server_sequence_number_seq') AS next_seq"
    );
    const serverSequenceNumber = Number(seqRes.rows[0].next_seq);

    const receiptId = `rcpt_${envelope.examSessionId}_${envelope.clientSequenceNumber}_${Date.now()}`;
    const eventId = `sub_evt_${envelope.clientEventId}`;

    const serverSignature = this.generateReceiptSignature({
      receiptId,
      examSessionId: envelope.examSessionId,
      clientEventId: envelope.clientEventId,
      serverSequenceNumber,
      responseFingerprint,
    });

    // 4. Insert into candidate_submission_events with real signature (with race protection)
    const insertRes = await client.query(
      `INSERT INTO public.candidate_submission_events (
        event_id, exam_session_id, tenant_id, canonical_question_id, representation_id,
        package_id, package_integrity_seal, client_sequence_number, client_event_id,
        event_type, candidate_response, response_fingerprint, receipt_id,
        server_signature, client_timestamp, server_timestamp, server_sequence_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (exam_session_id, client_event_id) DO NOTHING
      RETURNING server_timestamp`,
      [
        eventId,
        envelope.examSessionId,
        envelope.tenantId,
        envelope.canonicalQuestionId,
        envelope.representationId,
        envelope.packageId,
        envelope.packageIntegritySeal,
        envelope.clientSequenceNumber,
        envelope.clientEventId,
        envelope.eventType,
        JSON.stringify(envelope.payload),
        responseFingerprint,
        receiptId,
        serverSignature,
        envelope.clientTimestamp,
        serverReceiptTime.toISOString(),
        serverSequenceNumber,
      ]
    );

    if (insertRes.rows.length === 0) {
      // Concurrent race condition: another transaction committed between step 1 and step 4
      const raceRecheck = await client.query(
        `SELECT * FROM public.candidate_submission_events 
         WHERE exam_session_id = $1 AND client_event_id = $2`,
        [envelope.examSessionId, envelope.clientEventId]
      );
      if (raceRecheck.rows.length > 0) {
        const row = raceRecheck.rows[0];
        if (row.response_fingerprint !== responseFingerprint) {
          throw new SubmissionConflictError(
            envelope.examSessionId,
            envelope.clientEventId,
            row.response_fingerprint,
            responseFingerprint
          );
        }
        return {
          receiptId: row.receipt_id,
          examSessionId: row.exam_session_id,
          clientEventId: row.client_event_id,
          clientSequenceNumber: row.client_sequence_number,
          serverSequenceNumber: Number(row.server_sequence_number),
          canonicalQuestionId: row.canonical_question_id,
          responseFingerprint: row.response_fingerprint,
          serverTimestamp: row.server_timestamp.toISOString(),
          validationStatus: 'ACCEPTED',
          serverSignature: row.server_signature,
          idempotentReplay: true,
        };
      }
    }

    const recordedServerTimestamp = insertRes.rows[0].server_timestamp.toISOString();

    return {
      receiptId,
      examSessionId: envelope.examSessionId,
      clientEventId: envelope.clientEventId,
      clientSequenceNumber: envelope.clientSequenceNumber,
      serverSequenceNumber,
      canonicalQuestionId: envelope.canonicalQuestionId,
      responseFingerprint,
      serverTimestamp: recordedServerTimestamp,
      validationStatus: 'ACCEPTED',
      serverSignature,
      idempotentReplay: false,
    };
  }
}
