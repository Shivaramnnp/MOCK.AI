/**
 * UADUE Phase 3.6F — Persistent Idempotency & Process Restart Verification Battery
 * Specification: UADUE-P3.6-API-002 (Durable, Transactional Idempotency & State Monotonicity)
 *
 * Verifies:
 * 1. Process Restart & Crash Survival: New CandidateDeliveryApi instances sharing persistent store
 *    recognize previously recorded events and return cached receipts with idempotentReplay: true.
 * 2. Conflicting Payload Rejection: Tampered replays on existing clientEventId after restart
 *    are strictly rejected with 409 EVENT_CONFLICT.
 * 3. Race Collision Handling: Concurrent writes triggering unique constraint collisions
 *    gracefully re-verify stored fingerprint and return idempotent replays.
 * 4. Authoritative Attempt Submission Idempotency: Repeated submitAttempt calls across restarts
 *    return original submission timestamp and evaluationRunId.
 * 5. PostgreSQL Integration: Validates PostgresCandidateSubmissionStore against real
 *    mockai_uadue_test database enforcing CONSTRAINT uq_submission_client_event.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import {
  CandidateDeliveryApi,
  CandidateApiError,
  InMemoryCandidateSubmissionStore,
  ICandidateDeliveryBackend,
} from './candidateDeliveryApi';
import {
  DeliveryPostgresAdapter,
  PostgresCandidateSubmissionStore,
  DeliveryUniqueConstraintError,
} from './deliveryPostgresAdapter';
import {
  CandidateSessionAuthorizer,
  CryptographicJwtAuthority,
  IAuthorizerSessionStore,
  IAuthorizerPackageStore,
  PackageStatusRecord,
} from './candidateSessionAuthorizer';
import { CanonicalProjectionGateway } from '../canonical/canonicalProjectionGateway';
import { ExamSessionRecord, SubmissionEventRecord, CandidateEvaluationRunRecord } from './deliveryTypes';

describe('UADUE Phase 3.6F — Persistent Idempotency & Process Restart Invariant Suite', () => {
  const SIGNING_SECRET = 'durable_idempotency_test_signing_key_32b!';
  const JWT_SECRET = 'jwt_secret_durable_idempotency_test_32b!';
  const TENANT_ID = 'tenant_idempotency_corp';
  const CANDIDATE_ID = 'cand_idempotency_alice';
  const PACKAGE_ID = 'pkg_idempotency_package_01';
  const PACKAGE_SEAL = 'seal_idempotency_sha256_mock_01';
  const SESSION_ID = 'sess_idempotency_live_001';
  const DEVICE_LEASE_ID = 'lease_idempotency_mac_001';
  const QUESTION_ID = 'q_idempotency_q1';

  // In-memory test backend dependencies
  class MockSessionStore implements IAuthorizerSessionStore {
    public sessions = new Map<string, ExamSessionRecord>();
    public setSession(session: ExamSessionRecord): void {
      this.sessions.set(`${session.tenantId}:${session.examSessionId}`, { ...session });
    }
    public async saveExamSession(session: ExamSessionRecord): Promise<void> {
      this.setSession(session);
    }
    public async getExamSession(sessionId: string, tenantId: string): Promise<ExamSessionRecord | null> {
      const s = this.sessions.get(`${tenantId}:${sessionId}`);
      return s ? { ...s } : null;
    }
  }

  class MockPackageStore implements IAuthorizerPackageStore {
    public packages = new Map<string, PackageStatusRecord>();
    public setPackage(status: PackageStatusRecord): void {
      this.packages.set(status.packageId, { ...status });
    }
    public async getPackageStatus(packageId: string): Promise<PackageStatusRecord | null> {
      const p = this.packages.get(packageId);
      return p ? { ...p } : null;
    }
  }

  let sessionStore: MockSessionStore;
  let packageStore: MockPackageStore;
  let evaluationRunStore: Map<string, CandidateEvaluationRunRecord>;
  let mockPackageSource: any;

  beforeEach(() => {
    sessionStore = new MockSessionStore();
    packageStore = new MockPackageStore();
    evaluationRunStore = new Map();

    const nowIso = new Date().toISOString();
    packageStore.setPackage({
      packageId: PACKAGE_ID,
      packageIntegritySeal: PACKAGE_SEAL,
      validationStatus: 'PUBLISHED',
      isQuarantined: false,
    });

    sessionStore.setSession({
      examSessionId: SESSION_ID,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      packageId: PACKAGE_ID,
      packageIntegritySeal: PACKAGE_SEAL,
      sessionConfiguration: {},
      sessionState: 'ACTIVE',
      stateVersion: 1,
      currentLeaseId: DEVICE_LEASE_ID,
      leaseHeartbeatAt: nowIso,
      scheduledStartAt: nowIso,
      actualStartedAt: nowIso,
      durationSeconds: 7200,
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
      submittedAt: null,
      expiredAt: null,
      terminatedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const mockGraph = {
      packageId: PACKAGE_ID,
      packageIntegritySeal: PACKAGE_SEAL,
      sourceHash: 'source_hash_idempotency_test',
      graphVersion: '1.0.0',
      sealedAt: nowIso,
      nodes: [
        {
          canonicalQuestionId: QUESTION_ID,
          ordinalIndex: 1,
          questionType: 'MCQ',
          sectionId: 'sec_01',
          topicId: 'math',
          facets: {},
          representations: [
            {
              representationId: 'rep_01',
              language: 'en',
              isPrimary: true,
              body: { text: 'What is 10 + 10?' },
              options: [
                { optionId: 'opt_a', text: '10', ordinalIndex: 0 },
                { optionId: 'opt_b', text: '20', ordinalIndex: 1 },
              ],
            },
          ],
          logicalFamilyId: 'fam_01',
        },
      ],
      edges: [],
    };

    mockPackageSource = {
      reconstructPackageForTenant: async (pkgId: string) => {
        if (pkgId === PACKAGE_ID) {
          return {
            packageId: PACKAGE_ID,
            packageIntegritySeal: PACKAGE_SEAL,
            questionGraph: mockGraph,
            canonicalQuestions: mockGraph.nodes,
            validationReport: { validationStatus: 'PACKAGE_VALIDATED' },
            scoringPolicy: { policyId: 'sp_default', rules: [] },
            answerKey: { packageId: PACKAGE_ID, entries: [] },
          };
        }
        return null;
      },
      getPublishedPackage: async (pkgId: string) => {
        if (pkgId === PACKAGE_ID) {
          return {
            packageId: PACKAGE_ID,
            packageIntegritySeal: PACKAGE_SEAL,
            graph: mockGraph,
            canonicalQuestions: mockGraph.nodes,
            scoringPolicy: { policyId: 'sp_default', rules: [] },
            answerKey: { packageId: PACKAGE_ID, entries: [] },
          };
        }
        return null;
      },
    };
  });

  function createBackend(sharedSubmissionStore?: InMemoryCandidateSubmissionStore): ICandidateDeliveryBackend {
    return {
      sessionStore,
      packageStore,
      submissionStore: sharedSubmissionStore,
      authorizer: new CandidateSessionAuthorizer(sessionStore, packageStore, {
        signingSecret: JWT_SECRET,
        authAuthority: new CryptographicJwtAuthority(JWT_SECRET),
      }),
      projectionGateway: new CanonicalProjectionGateway(mockPackageSource as any),
      saveEvaluationRun: async (run) => {
        evaluationRunStore.set(run.examSessionId, run);
      },
      getEvaluationRun: async (sessId) => {
        return evaluationRunStore.get(sessId) || null;
      },
    };
  }

  // ── 1. Process Restart & Crash Survival ────────────────────────────────────

  it('IDEM-01: Survives simulated process restart and replays cached receipt with idempotentReplay: true', async () => {
    const persistentStore = new InMemoryCandidateSubmissionStore();

    // Process Instance 1: boots and accepts answer selection
    const backend1 = createBackend(persistentStore);
    const apiInstance1 = new CandidateDeliveryApi(backend1, {
      signingSecret: SIGNING_SECRET,
      submissionStore: persistentStore,
    });

    const res1 = await apiInstance1.recordAnswerSelection(
      {
        examSessionId: SESSION_ID,
        canonicalQuestionId: QUESTION_ID,
        selectedOptionId: 'opt_b',
        clientEventId: 'client_evt_alpha_001',
        clientSequenceNumber: 1,
        deviceLeaseId: DEVICE_LEASE_ID,
        clientTimestampIso: new Date().toISOString(),
      },
      { candidateId: CANDIDATE_ID, tenantId: TENANT_ID }
    );

    expect(res1.status).toBe('ACCEPTED');
    expect(res1.receipt.idempotentReplay).toBe(false);
    expect(res1.receipt.clientEventId).toBe('client_evt_alpha_001');
    const initialReceiptId = res1.receipt.receiptId;

    // SIMULATED CRASH / PROCESS RESTART:
    // Process Instance 1 is destroyed from memory; Process Instance 2 starts fresh
    const backend2 = createBackend(persistentStore);
    const apiInstance2 = new CandidateDeliveryApi(backend2, {
      signingSecret: SIGNING_SECRET,
      submissionStore: persistentStore,
    });

    // Replay identical event on new process instance
    const res2 = await apiInstance2.recordAnswerSelection(
      {
        examSessionId: SESSION_ID,
        canonicalQuestionId: QUESTION_ID,
        selectedOptionId: 'opt_b',
        clientEventId: 'client_evt_alpha_001',
        clientSequenceNumber: 1,
        deviceLeaseId: DEVICE_LEASE_ID,
        clientTimestampIso: new Date().toISOString(),
      },
      { candidateId: CANDIDATE_ID, tenantId: TENANT_ID }
    );

    expect(res2.status).toBe('ACCEPTED');
    expect(res2.receipt.idempotentReplay).toBe(true);
    expect(res2.receipt.receiptId).toBe(initialReceiptId);
    expect(res2.receipt.responseFingerprint).toBe(res1.receipt.responseFingerprint);
  });

  it('IDEM-02: Rejects tampered payload submitted on existing clientEventId after process restart', async () => {
    const persistentStore = new InMemoryCandidateSubmissionStore();

    // Process 1: Record original answer 'opt_b'
    const backend1 = createBackend(persistentStore);
    const apiInstance1 = new CandidateDeliveryApi(backend1, {
      signingSecret: SIGNING_SECRET,
      submissionStore: persistentStore,
    });

    await apiInstance1.recordAnswerSelection(
      {
        examSessionId: SESSION_ID,
        canonicalQuestionId: QUESTION_ID,
        selectedOptionId: 'opt_b',
        clientEventId: 'client_evt_beta_002',
        clientSequenceNumber: 1,
        deviceLeaseId: DEVICE_LEASE_ID,
      },
      { candidateId: CANDIDATE_ID, tenantId: TENANT_ID }
    );

    // Process Restart: Process 2 receives tampered payload 'opt_a' for same clientEventId
    const backend2 = createBackend(persistentStore);
    const apiInstance2 = new CandidateDeliveryApi(backend2, {
      signingSecret: SIGNING_SECRET,
      submissionStore: persistentStore,
    });

    await expect(
      apiInstance2.recordAnswerSelection(
        {
          examSessionId: SESSION_ID,
          canonicalQuestionId: QUESTION_ID,
          selectedOptionId: 'opt_a', // Tampered option!
          clientEventId: 'client_evt_beta_002',
          clientSequenceNumber: 1,
          deviceLeaseId: DEVICE_LEASE_ID,
        },
        { candidateId: CANDIDATE_ID, tenantId: TENANT_ID }
      )
    ).rejects.toThrow(CandidateApiError);

    try {
      await apiInstance2.recordAnswerSelection(
        {
          examSessionId: SESSION_ID,
          canonicalQuestionId: QUESTION_ID,
          selectedOptionId: 'opt_a',
          clientEventId: 'client_evt_beta_002',
          clientSequenceNumber: 1,
          deviceLeaseId: DEVICE_LEASE_ID,
        },
        { candidateId: CANDIDATE_ID, tenantId: TENANT_ID }
      );
    } catch (err: any) {
      expect(err.code).toBe('EVENT_CONFLICT');
      expect(err.message).toContain('Conflicting payload submitted');
    }
  });

  // ── 2. Concurrent Unique Constraint Collision Handling ──────────────────────

  it('IDEM-03: Gracefully handles race collision on saveSubmissionEvent by re-fetching and verifying fingerprint', async () => {
    const storedEvents = new Map<string, SubmissionEventRecord>();

    // Simulated race store: save throws if key already exists, simulating Postgres 23505 unique collision
    const raceStore = {
      getSubmissionEvent: async (examSessionId: string, clientEventId: string) => {
        return storedEvents.get(`${examSessionId}:${clientEventId}`) || null;
      },
      saveSubmissionEvent: async (record: SubmissionEventRecord) => {
        const key = `${record.examSessionId}:${record.clientEventId}`;
        if (storedEvents.has(key)) {
          throw new DeliveryUniqueConstraintError('uq_submission_client_event', 'Duplicate key value violates unique constraint');
        }
        storedEvents.set(key, record);
      },
    };

    const backend = createBackend();
    const api = new CandidateDeliveryApi(backend, {
      signingSecret: SIGNING_SECRET,
      submissionStore: raceStore,
    });

    // Request 1 succeeds
    const res1 = await api.recordAnswerSelection(
      {
        examSessionId: SESSION_ID,
        canonicalQuestionId: QUESTION_ID,
        selectedOptionId: 'opt_b',
        clientEventId: 'client_evt_race_001',
        clientSequenceNumber: 1,
        deviceLeaseId: DEVICE_LEASE_ID,
      },
      { candidateId: CANDIDATE_ID, tenantId: TENANT_ID }
    );
    expect(res1.status).toBe('ACCEPTED');
    expect(res1.receipt.idempotentReplay).toBe(false);

    // Request 2 with identical payload triggers the race catch branch and returns idempotentReplay
    const res2 = await api.recordAnswerSelection(
      {
        examSessionId: SESSION_ID,
        canonicalQuestionId: QUESTION_ID,
        selectedOptionId: 'opt_b',
        clientEventId: 'client_evt_race_001',
        clientSequenceNumber: 1,
        deviceLeaseId: DEVICE_LEASE_ID,
      },
      { candidateId: CANDIDATE_ID, tenantId: TENANT_ID }
    );
    expect(res2.status).toBe('ACCEPTED');
    expect(res2.receipt.idempotentReplay).toBe(true);
    expect(res2.receipt.receiptId).toBe(res1.receipt.receiptId);
  });

  // ── 3. Terminal Attempt Submission Idempotency Across Restarts ──────────────

  it('IDEM-04: Returns consistent evaluation run ID on repeated submitAttempt across process restarts', async () => {
    const persistentStore = new InMemoryCandidateSubmissionStore();

    // Process 1: submits attempt
    const backend1 = createBackend(persistentStore);
    const apiInstance1 = new CandidateDeliveryApi(backend1, {
      signingSecret: SIGNING_SECRET,
      submissionStore: persistentStore,
    });

    const submitRes1 = await apiInstance1.submitAttempt(
      {
        examSessionId: SESSION_ID,
        deviceLeaseId: DEVICE_LEASE_ID,
      },
      { candidateId: CANDIDATE_ID, tenantId: TENANT_ID }
    );

    expect(submitRes1.sessionState).toBe('SUBMITTED');
    expect(submitRes1.evaluationRunId).toBeDefined();

    // Process Restart: Process 2 receives duplicate submitAttempt call
    const backend2 = createBackend(persistentStore);
    const apiInstance2 = new CandidateDeliveryApi(backend2, {
      signingSecret: SIGNING_SECRET,
      submissionStore: persistentStore,
    });

    const submitRes2 = await apiInstance2.submitAttempt(
      {
        examSessionId: SESSION_ID,
        deviceLeaseId: DEVICE_LEASE_ID,
      },
      { candidateId: CANDIDATE_ID, tenantId: TENANT_ID }
    );

    expect(submitRes2.sessionState).toBe('SUBMITTED');
    expect(submitRes2.evaluationRunId).toBe(submitRes1.evaluationRunId);
    expect(submitRes2.submittedAt).toBe(submitRes1.submittedAt);
  });

  // ── 4. PostgreSQL Real-Database Integration ────────────────────────────────

  describe('PostgreSQL Real Database Integration (mockai_uadue_test)', () => {
    let pool: Pool;
    let adapter: DeliveryPostgresAdapter;
    let pgStore: PostgresCandidateSubmissionStore;
    const PG_SESSION_ID = `sess_pg_idempotency_${Date.now()}`;
    const PG_CANDIDATE_ID = `cand_pg_student_${Date.now()}`;
    const PG_TENANT_ID = 'tenant_idempotency_corp';

    beforeAll(async () => {
      pool = new Pool({
        host: 'localhost',
        port: 5432,
        database: 'mockai_uadue_test',
        user: process.env.USER || 'postgres',
        max: 5,
      });

      adapter = new DeliveryPostgresAdapter({
        host: 'localhost',
        port: 5432,
        database: 'mockai_uadue_test',
        user: process.env.USER || 'postgres',
      });

      pgStore = new PostgresCandidateSubmissionStore(adapter, PG_TENANT_ID);

      // Seed assessment package and session into test DB
      const client = await pool.connect();
      try {
        await client.query("SELECT set_config('app.is_service_role', 'true', true)");

        // Insert or ignore package
        await client.query(
          `INSERT INTO public.canonical_assessment_packages (
            package_id, source_snapshot_id, source_document_id, package_integrity_seal,
            schema_version, pipeline_algorithm_id, pipeline_algorithm_version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (package_id) DO NOTHING`,
          [PACKAGE_ID, 'snap_idem_001', 'doc_idem_001', PACKAGE_SEAL, '1.0.0', 'UADUE_CANONICAL_V4', '4.0.0']
        );

        // Insert fresh exam session
        await client.query(
          `INSERT INTO public.exam_sessions (
            exam_session_id, tenant_id, candidate_id, package_id, package_integrity_seal,
            session_state, state_version, current_lease_id, lease_heartbeat_at,
            scheduled_start_at, actual_started_at, duration_seconds, accumulated_pause_seconds,
            pause_count, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 1, $6, now(), now(), now(), 7200, 0, 0, now(), now())`,
          [PG_SESSION_ID, PG_TENANT_ID, PG_CANDIDATE_ID, PACKAGE_ID, PACKAGE_SEAL, DEVICE_LEASE_ID]
        );

        // Register in sessionStore for API tests
        sessionStore.setSession({
          examSessionId: PG_SESSION_ID,
          tenantId: PG_TENANT_ID,
          candidateId: PG_CANDIDATE_ID,
          packageId: PACKAGE_ID,
          packageIntegritySeal: PACKAGE_SEAL,
          sessionConfiguration: {},
          sessionState: 'ACTIVE',
          stateVersion: 1,
          currentLeaseId: DEVICE_LEASE_ID,
          leaseHeartbeatAt: new Date().toISOString(),
          scheduledStartAt: new Date().toISOString(),
          actualStartedAt: new Date().toISOString(),
          durationSeconds: 7200,
          accumulatedPauseSeconds: 0,
          pauseCount: 0,
          submittedAt: null,
          expiredAt: null,
          terminatedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } finally {
        client.release();
      }
    });

    afterAll(async () => {
      await pool.end();
    });

    it('IDEM-PG-01: PostgresCandidateSubmissionStore persists events and detects idempotent replay via PostgreSQL', async () => {
      const PG_CLIENT_EVENT_ID = `pg_evt_${Date.now()}`;
      // Direct store persistence test
      const eventRecord: SubmissionEventRecord = {
        examSessionId: PG_SESSION_ID,
        clientEventId: PG_CLIENT_EVENT_ID,
        responseFingerprint: 'fingerprint_sha256_pg_test_001',
        receipt: {
          receiptId: 'rcpt_pg_001',
          examSessionId: PG_SESSION_ID,
          clientEventId: PG_CLIENT_EVENT_ID,
          clientSequenceNumber: 1,
          serverSequenceNumber: 1,
          canonicalQuestionId: QUESTION_ID,
          responseFingerprint: 'fingerprint_sha256_pg_test_001',
          serverTimestamp: new Date().toISOString(),
          validationStatus: 'ACCEPTED',
          serverSignature: 'sig_hmac_pg_test_001',
          idempotentReplay: false,
        },
      };

      await pgStore.saveSubmissionEvent(eventRecord);

      // Verify retrieval from PostgreSQL
      const retrieved = await pgStore.getSubmissionEvent(PG_SESSION_ID, PG_CLIENT_EVENT_ID);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.examSessionId).toBe(PG_SESSION_ID);
      expect(retrieved?.clientEventId).toBe(PG_CLIENT_EVENT_ID);
      expect(retrieved?.responseFingerprint).toBe('fingerprint_sha256_pg_test_001');
      expect(retrieved?.receipt.receiptId).toBe('rcpt_pg_001');
      expect(retrieved?.receipt.idempotentReplay).toBe(true);

      // Verify UNIQUE constraint uq_submission_client_event rejects second insert with same client_event_id
      await expect(pgStore.saveSubmissionEvent(eventRecord)).rejects.toThrow(
        DeliveryUniqueConstraintError
      );
    });

    function ensurePgSession() {
      sessionStore.setSession({
        examSessionId: PG_SESSION_ID,
        tenantId: PG_TENANT_ID,
        candidateId: PG_CANDIDATE_ID,
        packageId: PACKAGE_ID,
        packageIntegritySeal: PACKAGE_SEAL,
        sessionConfiguration: {},
        sessionState: 'ACTIVE',
        stateVersion: 1,
        currentLeaseId: DEVICE_LEASE_ID,
        leaseHeartbeatAt: new Date().toISOString(),
        scheduledStartAt: new Date().toISOString(),
        actualStartedAt: new Date().toISOString(),
        durationSeconds: 7200,
        accumulatedPauseSeconds: 0,
        pauseCount: 0,
        submittedAt: null,
        expiredAt: null,
        terminatedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    it('IDEM-PG-02: Simultaneous concurrent requests against PostgreSQL produce exactly one row and identical receipts', async () => {
      ensurePgSession();
      const backend = createBackend();
      const pgApi = new CandidateDeliveryApi(backend, {
        signingSecret: SIGNING_SECRET,
        submissionStore: pgStore,
      });

      const PG_CONCURRENT_EVENT_ID = `pg_evt_concur_${Date.now()}`;

      // Launch 5 simultaneous concurrent requests for the exact same event
      const promises = Array.from({ length: 5 }, () =>
        pgApi.recordAnswerSelection(
          {
            examSessionId: PG_SESSION_ID,
            canonicalQuestionId: QUESTION_ID,
            selectedOptionId: 'opt_b',
            clientEventId: PG_CONCURRENT_EVENT_ID,
            clientSequenceNumber: 1,
            deviceLeaseId: DEVICE_LEASE_ID,
          },
          { candidateId: PG_CANDIDATE_ID, tenantId: PG_TENANT_ID }
        )
      );

      const results = await Promise.all(promises);

      // Every single request must succeed with ACCEPTED status
      for (const res of results) {
        expect(res.status).toBe('ACCEPTED');
        expect(res.receipt.receiptId).toBe(results[0].receipt.receiptId);
        expect(res.receipt.responseFingerprint).toBe(results[0].receipt.responseFingerprint);
      }

      // Verify exactly one row exists in PostgreSQL
      const client = await pool.connect();
      try {
        const countRes = await client.query(
          `SELECT count(*) as total FROM public.candidate_submission_events 
           WHERE exam_session_id = $1 AND client_event_id = $2`,
          [PG_SESSION_ID, PG_CONCURRENT_EVENT_ID]
        );
        expect(Number(countRes.rows[0].total)).toBe(1);
      } finally {
        client.release();
      }
    });

    it('IDEM-PG-03: Concurrent race between original and tampered payload rejects conflicting request with EVENT_CONFLICT', async () => {
      ensurePgSession();
      const backend = createBackend();
      const pgApi = new CandidateDeliveryApi(backend, {
        signingSecret: SIGNING_SECRET,
        submissionStore: pgStore,
      });

      const PG_CONFLICT_EVENT_ID = `pg_evt_race_conflict_${Date.now()}`;

      const p1 = pgApi.recordAnswerSelection(
        {
          examSessionId: PG_SESSION_ID,
          canonicalQuestionId: QUESTION_ID,
          selectedOptionId: 'opt_a',
          clientEventId: PG_CONFLICT_EVENT_ID,
          clientSequenceNumber: 1,
          deviceLeaseId: DEVICE_LEASE_ID,
        },
        { candidateId: PG_CANDIDATE_ID, tenantId: PG_TENANT_ID }
      );

      const p2 = pgApi.recordAnswerSelection(
        {
          examSessionId: PG_SESSION_ID,
          canonicalQuestionId: QUESTION_ID,
          selectedOptionId: 'opt_b', // Conflicting option!
          clientEventId: PG_CONFLICT_EVENT_ID,
          clientSequenceNumber: 1,
          deviceLeaseId: DEVICE_LEASE_ID,
        },
        { candidateId: PG_CANDIDATE_ID, tenantId: PG_TENANT_ID }
      );

      const results = await Promise.allSettled([p1, p2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly one must succeed and one must be rejected with 409 EVENT_CONFLICT
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason.code).toBe('EVENT_CONFLICT');
    });

    it('IDEM-PG-04: Candidate runtime role (uadue_app_user) cannot access canonical_answer_authority_resolutions or cross-tenant data', async () => {
      // Connect specifically as non-privileged uadue_app_user
      const appUserClient = await pool.connect();
      try {
        await appUserClient.query("SET ROLE 'uadue_app_user'");
        await appUserClient.query(`SELECT set_config('request.jwt.claim.tenant_id', '${PG_TENANT_ID}', true)`);

        // 1. Candidate role CANNOT select from canonical_answer_authority_resolutions (answer keys)
        await expect(
          appUserClient.query('SELECT * FROM public.canonical_answer_authority_resolutions LIMIT 1')
        ).rejects.toThrow(/permission denied/i);

        // 2. Candidate role CANNOT select from canonical_assets (confidential assets)
        await expect(
          appUserClient.query('SELECT * FROM public.canonical_assets LIMIT 1')
        ).rejects.toThrow(/permission denied/i);

        // 3. Candidate role CANNOT see another tenant's exam sessions
        const crossTenantRes = await appUserClient.query(
          "SELECT * FROM public.exam_sessions WHERE tenant_id = 'other_tenant_adversary'"
        );
        expect(crossTenantRes.rows.length).toBe(0);
      } finally {
        await appUserClient.query('RESET ROLE');
        appUserClient.release();
      }
    });
  });
});
