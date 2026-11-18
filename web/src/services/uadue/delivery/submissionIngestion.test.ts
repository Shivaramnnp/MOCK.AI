/**
 * UADUE Phase 3.3 — Submission & Event Ingestion Gateway Integration & Invariant Suite
 * Specification: UADUE-P3-HARD-R3-001 (R3 Final Hardened Contract)
 * Pipeline Contract: UADUE-P3-SUB-007
 *
 * Verifies against REAL PostgreSQL database (mockai_uadue_test):
 * 1. Happy path submission ingestion with monotonic server sequence allocation
 * 2. Cryptographic HMAC-SHA256 dual receipt generation & signature verification
 * 3. Primary event idempotency on (exam_session_id, client_event_id) (R3-04)
 * 4. Tampered duplicate replay rejection (409 Conflict / E_PAYLOAD_TAMPERED)
 * 5. Package & seal mismatch rejection
 * 6. Single-active-device lease verification
 * 7. PostgreSQL deadline authority with 15.000s receipt grace cutoff (R2-01 / R3-05)
 * 8. Terminal and inactive state rejection
 * 9. Transactional batch ingestion & atomic rollback on failure (offline journal flushing)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { createHmac } from 'crypto';
import { DeliveryPostgresAdapter } from './deliveryPostgresAdapter';
import { SessionOrchestrator } from './sessionOrchestrator';
import {
  SubmissionIngestionGateway,
  SubmissionConflictError,
  SubmissionPackageMismatchError,
  SubmissionLeaseMismatchError,
  SubmissionDeadlineExceededError,
  SubmissionSessionTerminatedError,
  SubmissionSessionNotActiveError,
} from './submissionIngestionGateway';
import { ExamSessionRecord, SubmissionEventEnvelope } from './deliveryTypes';

describe('UADUE Phase 3.3 — Submission Ingestion Invariant Suite', () => {
  let pool: Pool;
  let adapter: DeliveryPostgresAdapter;
  let orchestrator: SessionOrchestrator;
  let gateway: SubmissionIngestionGateway;

  const TEST_PACKAGE_ID = 'pkg_uadue_phase3_test_001';
  const TEST_SEAL = 'seal_uadue_phase3_sha256_mock_valid_seal';
  const TENANT_ID = 'tenant_ingest_test';
  const SIGNING_SECRET = 'test_secret_key_submission_signature_33';

  beforeAll(async () => {
    pool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'mockai_uadue_test',
      user: process.env.USER || 'postgres',
      max: 10,
    });
    adapter = new DeliveryPostgresAdapter({
      host: 'localhost',
      port: 5432,
      database: 'mockai_uadue_test',
      user: process.env.USER || 'postgres',
    });
    orchestrator = new SessionOrchestrator(adapter);
    gateway = new SubmissionIngestionGateway(adapter, orchestrator, {
      signingSecret: SIGNING_SECRET,
      transportGraceSeconds: 15.0,
    });

    // Ensure seed canonical package exists in Phase 2
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.is_service_role', 'true', true)");
      await client.query(
        `INSERT INTO public.canonical_assessment_packages (
          package_id, source_snapshot_id, source_document_id, package_integrity_seal,
          schema_version, pipeline_algorithm_id, pipeline_algorithm_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (package_id) DO NOTHING`,
        [
          TEST_PACKAGE_ID,
          'snap_p3_001',
          'doc_p3_001',
          TEST_SEAL,
          '1.0.0',
          'UADUE_CANONICAL_V4',
          '4.0.0',
        ]
      );
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await adapter.close();
    await pool.end();
  });

  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.is_service_role', 'true', true)");
      await client.query('TRUNCATE TABLE public.exam_sessions, public.audit_events CASCADE');
    } finally {
      client.release();
    }
  });

  const setupActiveSession = async (
    sessionId: string,
    overrides: Partial<ExamSessionRecord> = {}
  ): Promise<ExamSessionRecord> => {
    const nowIso = new Date().toISOString();
    const session: ExamSessionRecord = {
      examSessionId: sessionId,
      tenantId: TENANT_ID,
      candidateId: 'cand_ingest_001',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      sessionConfiguration: {},
      sessionState: 'ACTIVE',
      stateVersion: 2,
      currentLeaseId: 'lease_active_101',
      leaseHeartbeatAt: nowIso,
      scheduledStartAt: nowIso,
      actualStartedAt: nowIso,
      durationSeconds: 3600,
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
      submittedAt: null,
      expiredAt: null,
      terminatedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      ...overrides,
    };
    await adapter.createExamSession(session);
    return session;
  };

  // ==========================================================================
  // Invariant 1: Happy Path Ingestion & Cryptographic Dual Receipt
  // ==========================================================================
  it('ING-1: Ingests valid interaction event and returns verifiable cryptographic receipt', async () => {
    const sessionId = 'sess_ingest_happy';
    await setupActiveSession(sessionId);

    const envelope: SubmissionEventEnvelope = {
      clientEventId: 'client_evt_happy_001',
      examSessionId: sessionId,
      tenantId: TENANT_ID,
      sessionLeaseId: 'lease_active_101',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      canonicalQuestionId: 'q_001',
      representationId: 'rep_001',
      clientSequenceNumber: 1,
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_A' },
      clientTimestamp: new Date().toISOString(),
    };

    const receipt = await gateway.ingestSubmission(envelope);

    expect(receipt.validationStatus).toBe('ACCEPTED');
    expect(receipt.idempotentReplay).toBe(false);
    expect(receipt.serverSequenceNumber).toBeGreaterThanOrEqual(1);
    expect(receipt.examSessionId).toBe(sessionId);
    expect(receipt.clientEventId).toBe(envelope.clientEventId);
    expect(receipt.canonicalQuestionId).toBe('q_001');

    // Verify cryptographic HMAC signature
    const expectedSig = createHmac('sha256', SIGNING_SECRET)
      .update(
        `${receipt.receiptId}:${receipt.examSessionId}:${receipt.clientEventId}:${receipt.serverSequenceNumber}:${receipt.responseFingerprint}`
      )
      .digest('hex');
    expect(receipt.serverSignature).toBe(expectedSig);

    // Verify row persisted in PostgreSQL
    const client = await pool.connect();
    try {
      const dbRow = await client.query(
        'SELECT * FROM public.candidate_submission_events WHERE client_event_id = $1',
        [envelope.clientEventId]
      );
      expect(dbRow.rows.length).toBe(1);
      expect(dbRow.rows[0].response_fingerprint).toBe(receipt.responseFingerprint);
    } finally {
      client.release();
    }
  });

  // ==========================================================================
  // Invariant 2: Idempotent Replay on Identical Duplicate (R3-04)
  // ==========================================================================
  it('ING-2: R3-04: Identical duplicate replay returns existing receipt with zero duplicate rows', async () => {
    const sessionId = 'sess_ingest_idemp';
    await setupActiveSession(sessionId);

    const envelope: SubmissionEventEnvelope = {
      clientEventId: 'client_evt_idemp_101',
      examSessionId: sessionId,
      tenantId: TENANT_ID,
      sessionLeaseId: 'lease_active_101',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      canonicalQuestionId: 'q_002',
      representationId: 'rep_002',
      clientSequenceNumber: 2,
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_B' },
      clientTimestamp: new Date().toISOString(),
    };

    // First ingestion
    const receipt1 = await gateway.ingestSubmission(envelope);
    expect(receipt1.idempotentReplay).toBe(false);

    // Identical duplicate replay (e.g. network retry)
    const receipt2 = await gateway.ingestSubmission(envelope);
    expect(receipt2.idempotentReplay).toBe(true);
    expect(receipt2.receiptId).toBe(receipt1.receiptId);
    expect(receipt2.serverSequenceNumber).toBe(receipt1.serverSequenceNumber);
    expect(receipt2.serverSignature).toBe(receipt1.serverSignature);

    // Confirm EXACTLY 1 row exists in PostgreSQL
    const client = await pool.connect();
    try {
      const countRes = await client.query(
        'SELECT COUNT(*) FROM public.candidate_submission_events WHERE exam_session_id = $1 AND client_event_id = $2',
        [sessionId, envelope.clientEventId]
      );
      expect(Number(countRes.rows[0].count)).toBe(1);
    } finally {
      client.release();
    }
  });

  // ==========================================================================
  // Invariant 3: Tampered Replay Rejection (409 Conflict / E_PAYLOAD_TAMPERED)
  // ==========================================================================
  it('ING-3: Conflicting payload on existing client_event_id is rejected with SubmissionConflictError', async () => {
    const sessionId = 'sess_ingest_tamper';
    await setupActiveSession(sessionId);

    const originalEnvelope: SubmissionEventEnvelope = {
      clientEventId: 'client_evt_tamper_001',
      examSessionId: sessionId,
      tenantId: TENANT_ID,
      sessionLeaseId: 'lease_active_101',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      canonicalQuestionId: 'q_003',
      representationId: 'rep_003',
      clientSequenceNumber: 3,
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_A' },
      clientTimestamp: new Date().toISOString(),
    };
    await gateway.ingestSubmission(originalEnvelope);

    // Replay with identical clientEventId but CONFLICTING payload
    const tamperedEnvelope: SubmissionEventEnvelope = {
      ...originalEnvelope,
      payload: { selectedOptionId: 'opt_CONFLICTING_C' },
    };

    await expect(gateway.ingestSubmission(tamperedEnvelope)).rejects.toThrow(
      SubmissionConflictError
    );

    // Confirm database still contains original response opt_A
    const client = await pool.connect();
    try {
      const res = await client.query(
        'SELECT candidate_response FROM public.candidate_submission_events WHERE client_event_id = $1',
        [originalEnvelope.clientEventId]
      );
      expect(res.rows[0].candidate_response).toEqual({ selectedOptionId: 'opt_A' });
    } finally {
      client.release();
    }
  });

  // ==========================================================================
  // Invariant 4: Package & Seal Mismatch Rejection
  // ==========================================================================
  it('ING-4: Package ID or seal mismatch is rejected immediately', async () => {
    const sessionId = 'sess_ingest_seal';
    await setupActiveSession(sessionId);

    const badSealEnvelope: SubmissionEventEnvelope = {
      clientEventId: 'client_evt_bad_seal',
      examSessionId: sessionId,
      tenantId: TENANT_ID,
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: 'seal_FORGED_DIFFERENT_SEAL_12345678901234567890123456789012',
      canonicalQuestionId: 'q_004',
      representationId: 'rep_004',
      clientSequenceNumber: 4,
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_A' },
      clientTimestamp: new Date().toISOString(),
    };

    await expect(gateway.ingestSubmission(badSealEnvelope)).rejects.toThrow(
      SubmissionPackageMismatchError
    );
  });

  // ==========================================================================
  // Invariant 5: Single-Active-Device Lease Verification
  // ==========================================================================
  it('ING-5: Stale device lease token is rejected with SubmissionLeaseMismatchError', async () => {
    const sessionId = 'sess_ingest_lease';
    await setupActiveSession(sessionId, { currentLeaseId: 'lease_active_device_PRIMARY' });

    const staleLeaseEnvelope: SubmissionEventEnvelope = {
      clientEventId: 'client_evt_stale_lease',
      examSessionId: sessionId,
      tenantId: TENANT_ID,
      sessionLeaseId: 'lease_OLD_REVOKED_DEVICE',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      canonicalQuestionId: 'q_005',
      representationId: 'rep_005',
      clientSequenceNumber: 5,
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_A' },
      clientTimestamp: new Date().toISOString(),
    };

    await expect(gateway.ingestSubmission(staleLeaseEnvelope)).rejects.toThrow(
      SubmissionLeaseMismatchError
    );
  });

  // ==========================================================================
  // Invariant 6: PostgreSQL Deadline Authority & 15.000s Receipt Grace (R2-01 / R3-05)
  // ==========================================================================
  it('ING-6: R2-01 / R3-05: Receipt timestamp <= deadline + 15s grace accepted; > cutoff rejected', async () => {
    // 1. Session where deadline passed 8 seconds ago (WITHIN 15.000s receipt grace cutoff)
    const sessionWithinGrace = 'sess_within_grace';
    const started68sAgo = new Date(Date.now() - 68 * 1000).toISOString();
    await setupActiveSession(sessionWithinGrace, {
      candidateId: 'cand_ingest_within',
      actualStartedAt: started68sAgo,
      durationSeconds: 60, // Deadline was at -8s
    });

    const envelopeWithinGrace: SubmissionEventEnvelope = {
      clientEventId: 'client_evt_grace_accepted',
      examSessionId: sessionWithinGrace,
      tenantId: TENANT_ID,
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      canonicalQuestionId: 'q_006',
      representationId: 'rep_006',
      clientSequenceNumber: 6,
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_A' },
      clientTimestamp: new Date().toISOString(),
    };

    const receiptWithin = await gateway.ingestSubmission(envelopeWithinGrace);
    expect(receiptWithin.validationStatus).toBe('ACCEPTED');

    // 2. Session where deadline passed 25 seconds ago (EXCEEDED 15.000s grace cutoff)
    const sessionPastGrace = 'sess_past_grace';
    const started85sAgo = new Date(Date.now() - 85 * 1000).toISOString();
    await setupActiveSession(sessionPastGrace, {
      candidateId: 'cand_ingest_past',
      actualStartedAt: started85sAgo,
      durationSeconds: 60, // Deadline was at -25s; cutoff was at -10s
    });

    const envelopePastGrace: SubmissionEventEnvelope = {
      ...envelopeWithinGrace,
      clientEventId: 'client_evt_grace_rejected',
      examSessionId: sessionPastGrace,
    };

    await expect(gateway.ingestSubmission(envelopePastGrace)).rejects.toThrow(
      SubmissionDeadlineExceededError
    );
  });

  // ==========================================================================
  // Invariant 7: Terminal & Inactive State Rejection
  // ==========================================================================
  it('ING-7: Inactive or TERMINATED sessions reject incoming submissions', async () => {
    // A. Session in INITIALIZED state (not started)
    const initSession = 'sess_init_state';
    const sessionRecord: ExamSessionRecord = {
      examSessionId: initSession,
      tenantId: TENANT_ID,
      candidateId: 'cand_ingest_init',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      sessionConfiguration: {},
      sessionState: 'INITIALIZED',
      stateVersion: 1,
      currentLeaseId: 'lease_init',
      leaseHeartbeatAt: new Date().toISOString(),
      scheduledStartAt: new Date().toISOString(),
      actualStartedAt: null,
      durationSeconds: 3600,
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
      submittedAt: null,
      expiredAt: null,
      terminatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await adapter.createExamSession(sessionRecord);

    const envelopeInit: SubmissionEventEnvelope = {
      clientEventId: 'client_evt_init',
      examSessionId: initSession,
      tenantId: TENANT_ID,
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      canonicalQuestionId: 'q_007',
      representationId: 'rep_007',
      clientSequenceNumber: 7,
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_A' },
      clientTimestamp: new Date().toISOString(),
    };
    await expect(gateway.ingestSubmission(envelopeInit)).rejects.toThrow(
      SubmissionSessionNotActiveError
    );

    // B. Session in TERMINATED state
    const termSession = 'sess_term_state';
    await setupActiveSession(termSession, {
      candidateId: 'cand_ingest_term',
      sessionState: 'TERMINATED',
      terminatedAt: new Date().toISOString(),
    });

    const envelopeTerm: SubmissionEventEnvelope = {
      ...envelopeInit,
      clientEventId: 'client_evt_term',
      examSessionId: termSession,
    };
    await expect(gateway.ingestSubmission(envelopeTerm)).rejects.toThrow(
      SubmissionSessionTerminatedError
    );
  });

  // ==========================================================================
  // Invariant 8: Transactional Batch Ingestion (Offline Journal Flushing)
  // ==========================================================================
  it('ING-8: Atomic batch ingestion persists contiguous event batch in a single transaction', async () => {
    const sessionId = 'sess_batch_flushing';
    await setupActiveSession(sessionId);

    const batch: SubmissionEventEnvelope[] = [
      {
        clientEventId: 'batch_evt_01',
        examSessionId: sessionId,
        tenantId: TENANT_ID,
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: TEST_SEAL,
        canonicalQuestionId: 'q_101',
        representationId: 'rep_101',
        clientSequenceNumber: 1,
        eventType: 'SINGLE_CHOICE_SELECT',
        payload: { selectedOptionId: 'opt_A' },
        clientTimestamp: new Date().toISOString(),
      },
      {
        clientEventId: 'batch_evt_02',
        examSessionId: sessionId,
        tenantId: TENANT_ID,
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: TEST_SEAL,
        canonicalQuestionId: 'q_102',
        representationId: 'rep_102',
        clientSequenceNumber: 2,
        eventType: 'NUMERICAL_VALUE_ENTRY',
        payload: { enteredValue: '42.0' },
        clientTimestamp: new Date().toISOString(),
      },
      {
        clientEventId: 'batch_evt_03',
        examSessionId: sessionId,
        tenantId: TENANT_ID,
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: TEST_SEAL,
        canonicalQuestionId: 'q_103',
        representationId: 'rep_103',
        clientSequenceNumber: 3,
        eventType: 'CLEAR_RESPONSE',
        payload: { cleared: true },
        clientTimestamp: new Date().toISOString(),
      },
    ];

    const receipts = await gateway.ingestBatch(TENANT_ID, batch);
    expect(receipts.length).toBe(3);
    expect(receipts[0].serverSequenceNumber).toBeLessThan(receipts[1].serverSequenceNumber);
    expect(receipts[1].serverSequenceNumber).toBeLessThan(receipts[2].serverSequenceNumber);

    // Verify 3 rows exist in DB
    const client = await pool.connect();
    try {
      const res = await client.query(
        'SELECT COUNT(*) FROM public.candidate_submission_events WHERE exam_session_id = $1',
        [sessionId]
      );
      expect(Number(res.rows[0].count)).toBe(3);
    } finally {
      client.release();
    }
  });

  // ==========================================================================
  // Invariant 9: Batch Atomic Rollback on Failure
  // ==========================================================================
  it('ING-9: Invalid event within batch causes complete atomic rollback leaving zero partial rows', async () => {
    const sessionId = 'sess_batch_rollback';
    await setupActiveSession(sessionId);

    const corruptedBatch: SubmissionEventEnvelope[] = [
      {
        clientEventId: 'roll_evt_01',
        examSessionId: sessionId,
        tenantId: TENANT_ID,
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: TEST_SEAL,
        canonicalQuestionId: 'q_201',
        representationId: 'rep_201',
        clientSequenceNumber: 1,
        eventType: 'SINGLE_CHOICE_SELECT',
        payload: { selectedOptionId: 'opt_A' },
        clientTimestamp: new Date().toISOString(),
      },
      {
        clientEventId: 'roll_evt_02',
        examSessionId: sessionId,
        tenantId: TENANT_ID,
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: 'seal_FORGED_CORRUPTED_IN_MIDDLE', // Poisoned event!
        canonicalQuestionId: 'q_202',
        representationId: 'rep_202',
        clientSequenceNumber: 2,
        eventType: 'SINGLE_CHOICE_SELECT',
        payload: { selectedOptionId: 'opt_B' },
        clientTimestamp: new Date().toISOString(),
      },
    ];

    await expect(gateway.ingestBatch(TENANT_ID, corruptedBatch)).rejects.toThrow(
      SubmissionPackageMismatchError
    );

    // Confirm that Event 1 was NOT persisted due to atomic transaction rollback
    const client = await pool.connect();
    try {
      const res = await client.query(
        'SELECT COUNT(*) FROM public.candidate_submission_events WHERE exam_session_id = $1',
        [sessionId]
      );
      expect(Number(res.rows[0].count)).toBe(0);
    } finally {
      client.release();
    }
  });
});
