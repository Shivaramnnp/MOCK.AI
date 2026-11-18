/**
 * UADUE Phase 2D-8 — Real PostgreSQL Concurrency & Multi-Process Stress Suite
 * Document Version: 8.0.0-POSTGRES-CONCURRENCY
 *
 * Verifies against REAL PostgreSQL 18.3 database (mockai_uadue_test):
 * - G3 / G4: 100 concurrent identical publication requests yield 1 commit + 99 idempotent receipts
 * - G5: 100 concurrent conflicting publication requests yield 1 commit + 99 conflict rejections (409)
 * - G6: Multi-process concurrency race (separate Node processes with zero shared heap)
 * - G7: Request fingerprint durability across process / pool teardown
 * - G8: Zero sequence numbers burned on rollback
 * - G15: Connection pool starvation & recovery
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { spawn } from 'child_process';
import path from 'path';
import {
  CanonicalPostgresPersistenceAdapter,
} from './canonicalPostgresPersistenceAdapter';
import { CanonicalPipelineOrchestrator } from './canonicalPipelineOrchestrator';
import { PublicationConflictError } from './canonicalPublicationGateway';
import { QuestionCandidate, QuestionGraph } from '../contracts/questionGraph';

describe('UADUE Phase 2D-8 — Real PostgreSQL Concurrency & Multi-Process Stress Suite', () => {
  let pool: Pool;
  let adapter: CanonicalPostgresPersistenceAdapter;
  let orchestrator: CanonicalPipelineOrchestrator;
  const workerScriptPath = path.resolve(__dirname, 'canonicalPostgresConcurrencyWorker.mjs');

  beforeAll(async () => {
    pool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'mockai_uadue_test',
      user: process.env.USER || 'postgres',
      max: 25,
    });
    adapter = new CanonicalPostgresPersistenceAdapter(pool);
    orchestrator = new CanonicalPipelineOrchestrator();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.is_service_role', 'true', false)");
      await client.query('ALTER TABLE public.canonical_package_events DISABLE TRIGGER trg_canonical_events_immutable');
      await client.query('ALTER TABLE public.canonical_assessment_packages DISABLE TRIGGER trg_canonical_packages_immutable');
      await client.query('TRUNCATE TABLE public.canonical_package_supersessions CASCADE');
      await client.query('TRUNCATE TABLE public.canonical_package_events CASCADE');
      await client.query('TRUNCATE TABLE public.canonical_package_tenancy CASCADE');
      await client.query('TRUNCATE TABLE public.canonical_answer_authority_resolutions CASCADE');
      await client.query('TRUNCATE TABLE public.canonical_question_representations CASCADE');
      await client.query('TRUNCATE TABLE public.canonical_questions CASCADE');
      await client.query('TRUNCATE TABLE public.canonical_logical_families CASCADE');
      await client.query('TRUNCATE TABLE public.canonical_relationship_evaluations CASCADE');
      await client.query('TRUNCATE TABLE public.canonical_family_memberships CASCADE');
      await client.query('TRUNCATE TABLE public.canonical_quarantined_relationships CASCADE');
      await client.query('TRUNCATE TABLE public.canonical_assessment_packages CASCADE');
      await client.query('ALTER TABLE public.canonical_package_events ENABLE TRIGGER trg_canonical_events_immutable');
      await client.query('ALTER TABLE public.canonical_assessment_packages ENABLE TRIGGER trg_canonical_packages_immutable');
    } finally {
      client.release();
    }
  });

  const createCandidate = (candidateId: string, physicalInstanceId: string): QuestionCandidate => ({
    candidateId,
    physicalInstanceId,
    candidateDisplayOrder: 1,
    sourceOrder: 1,
    startPageNumber: 1,
    endPageNumber: 1,
    isMultiPage: false,
    identityCandidate: {
      physicalInstanceId,
      numberType: 'QUESTION_NUMBER',
      confidence: 1.0,
      supportingEvidenceIds: [],
    },
    includedPhysicalNodeIds: [`node_stem_${candidateId}`],
    stemNodeIds: [`node_stem_${candidateId}`],
    bodyNodeIds: [],
    optionCandidateIds: [`opt_${candidateId}_1`, `opt_${candidateId}_2`],
    stimulusRefIds: [],
    tableCandidateIds: [],
    diagramCandidateIds: [],
    mathCandidateIds: [],
    codeCandidateIds: [],
    observationState: 'OBSERVED',
    verificationStatus: 'SUPPORTED',
    confidenceScore: 0.95,
    evidenceList: [],
    unresolvedAmbiguityIds: [],
    languageRepresentations: [
      {
        languageScript: 'LATIN',
        pageNumber: 1,
        stemNodeIds: [`node_stem_${candidateId}`],
        bodyNodeIds: [],
        optionCandidateIds: [`opt_${candidateId}_1`, `opt_${candidateId}_2`],
      },
    ],
  });

  const createQuestionGraph = (questions: QuestionCandidate[]): QuestionGraph => ({
    graphId: `qgraph_conc_${Date.now()}`,
    sourceDocumentId: 'doc_conc_1',
    sourceSnapshotId: 'snap_conc_1',
    sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    sourceDocumentGraphId: 'docgraph_conc_1',
    sourceDocumentGraphSha256: 'f3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    schemaVersion: 'uadue-qg-v3',
    algorithmVersion: '3.0.0',
    configurationVersion: '1.0.0',
    questions,
    stimuli: [],
    options: [
      {
        optionCandidateId: `opt_${questions[0]?.candidateId || '1'}_1`,
        contentNodeIds: ['node_opt_1'],
        candidateOwners: [],
        isMultiColumnOption: false,
        hasVisualAsset: false,
        hasMathematics: false,
        observationState: 'OBSERVED',
        verificationStatus: 'SUPPORTED',
        confidenceScore: 1.0,
        supportingEvidenceIds: [],
      },
    ],
    tables: [],
    diagrams: [],
    mathBlocks: [],
    hypotheses: [],
    activeHypothesisId: 'hyp_1',
    ambiguities: [],
    relationships: [],
    verificationState: {
      overallStatus: 'VERIFIED',
      unverifiedCount: 0,
      supportedCount: 0,
      conflictedCount: 0,
      ambiguousCount: 0,
      verifiedCount: questions.length,
      rejectedCount: 0,
      findings: [],
    },
    provenance: {
      algorithmId: 'test_pipeline',
      algorithmVersion: '1.0.0',
      configurationVersion: 'test_config',
      sourceDocumentGraphId: 'docgraph_1',
      sourceSnapshotId: 'snap_sample_1',
      sourceDocumentId: 'doc_sample_1',
      sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      sourceDocumentGraphSha256: 'f3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      createdAt: 0,
      determinismScope: {
        identicalDocumentGraph: true,
        identicalAlgorithm: true,
        identicalConfig: true,
        runtime: 'node',
        floatPrecision: 'IEEE_754_64BIT',
      },
    },
    isSealed: true,
    sealedHash: 'sealed_graph',
    sealedAt: 0,
  });

  // ==========================================================================
  // Gate G4: 100 Concurrent Identical Publication Requests
  // ==========================================================================
  it('G4: 100 concurrent identical publication requests yield 1 committed event and 99 idempotent receipts', async () => {
    const q1 = createCandidate('c_g4', 'inst_g4');
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    const identicalPayload = {
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'OFFICIAL_EXAM_AGENCY',
      targetScope: 'STUDENT_ALL_INDIA',
      publicationPolicyConfig: { allowLateSubmission: false, maxAttempts: 1 },
    };

    // Fire 100 concurrent publication attempts using real PostgreSQL connection pool
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        adapter.publishPackage(identicalPayload).then((receipt) => ({ workerIndex: i, receipt }))
      )
    );

    // All 100 workers receive valid matching receipts
    const firstReceipt = results[0].receipt;
    expect(firstReceipt.packageId).toBe(pkg.packageId);
    expect(firstReceipt.publicationSequenceNumber).toBe(1);
    expect(adapter.verifyReceiptSignature(firstReceipt)).toBe(true);

    for (let i = 1; i < 100; i++) {
      const r = results[i].receipt;
      expect(r.receiptId).toBe(firstReceipt.receiptId);
      expect(r.publicationSequenceNumber).toBe(1);
      expect(r.publicationRequestFingerprint).toBe(firstReceipt.publicationRequestFingerprint);
      expect(r.hmacSignature).toBe(firstReceipt.hmacSignature);
    }

    // Direct SQL check: exactly 1 PUBLICATION_ISSUED event in database ledger
    const client = await pool.connect();
    try {
      const evtsRes = await client.query(
        'SELECT event_type, sequence_number, publication_request_fingerprint FROM public.canonical_package_events WHERE package_id = $1 ORDER BY sequence_number ASC',
        [pkg.packageId]
      );
      const pubEvents = evtsRes.rows.filter((r) => r.event_type === 'PUBLICATION_ISSUED');
      expect(pubEvents.length).toBe(1);
      expect(pubEvents[0].sequence_number).toBe(3); // Sequence 1 = PERSISTENCE_COMMITTED, 2 = VALIDATION_RECORDED, 3 = PUBLICATION_ISSUED
      expect(pubEvents[0].publication_request_fingerprint).toBe(firstReceipt.publicationRequestFingerprint);
    } finally {
      client.release();
    }
  }, 30000);

  // ==========================================================================
  // Gate G5 & G8: 100 Concurrent Conflicting Publication Requests & Zero Sequence Gaps
  // ==========================================================================
  it('G5 & G8: 100 concurrent conflicting requests yield 1 winner, 99 rejections (409), and 0 sequence gaps', async () => {
    const q1 = createCandidate('c_g5', 'inst_g5');
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    // Fire 100 concurrent conflicting requests with distinct authorities and scopes
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) => {
        const conflictingPayload = {
          packageId: pkg.packageId,
          packageIntegritySeal: pkg.packageIntegritySeal,
          publicationAuthorityId: `CONFLICT_AUTHORITY_${i}`,
          targetScope: `SCOPE_${i}`,
          publicationPolicyConfig: { workerId: i },
        };
        return adapter
          .publishPackage(conflictingPayload)
          .then((receipt) => ({ success: true, receipt }))
          .catch((err) => ({ success: false, error: err }));
      })
    );

    const winners = results.filter((r) => r.success);
    const losers = results.filter((r): r is { success: false; error: any } => !r.success);

    // Exactly 1 winner, 99 409 rejections
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(99);

    for (const loser of losers) {
      expect(loser.error).toBeInstanceOf(PublicationConflictError);
      expect((loser.error as PublicationConflictError).status).toBe(409);
    }

    // Direct SQL check: ledger has exactly 3 events (1 persist, 1 validation, 1 publication)
    const client = await pool.connect();
    try {
      const evtsRes = await client.query(
        'SELECT sequence_number, event_type FROM public.canonical_package_events WHERE package_id = $1 ORDER BY sequence_number ASC',
        [pkg.packageId]
      );
      expect(evtsRes.rows.length).toBe(3);
      expect(evtsRes.rows[0].sequence_number).toBe(1);
      expect(evtsRes.rows[1].sequence_number).toBe(2);
      expect(evtsRes.rows[2].sequence_number).toBe(3);
      // Zero sequence numbers burned by rolled-back transactions
    } finally {
      client.release();
    }
  }, 30000);

  // ==========================================================================
  // Gate G6: Multi-Process Concurrency Race (Separate Node Heaps)
  // ==========================================================================
  it('G6: Multi-process concurrency race across isolated Node child processes', async () => {
    const q1 = createCandidate('c_g6', 'inst_g6');
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    // Helper to spawn worker process
    const runChildWorker = (workerId: number, isConflicting: boolean): Promise<any> => {
      return new Promise((resolve, reject) => {
        const child = spawn(
          'node',
          [
            workerScriptPath,
            '--packageId',
            pkg.packageId,
            '--packageIntegritySeal',
            pkg.packageIntegritySeal,
            '--workerId',
            String(workerId),
            '--isConflicting',
            String(isConflicting),
          ],
          { cwd: path.resolve(__dirname, '../../../../') }
        );

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.stderr.on('data', (d) => (stderr += d.toString()));

        child.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Worker exited with code ${code}: ${stderr}`));
          } else {
            try {
              resolve(JSON.parse(stdout.trim()));
            } catch (e) {
              reject(new Error(`Worker output parse failed: ${stdout}`));
            }
          }
        });
      });
    };

    // Phase 1: 8 concurrent processes racing with CONFLICTING payloads
    const conflictProcesses = await Promise.all(
      Array.from({ length: 8 }, (_, i) => runChildWorker(i, true))
    );

    const conflictSuccesses = conflictProcesses.filter((p) => p.success);
    const conflictFailures = conflictProcesses.filter((p) => !p.success);

    // Exactly 1 winner among separate OS processes; 7 rejected with 409 conflict
    expect(conflictSuccesses.length).toBe(1);
    expect(conflictFailures.length).toBe(7);
    for (const f of conflictFailures) {
      expect(f.isConflict).toBe(true);
    }

    // Phase 2: 8 concurrent processes racing with IDENTICAL payload
    // Re-initialize a second package to test identical multi-process idempotency
    const q2 = createCandidate('c_g6_2', 'inst_g6_2');
    const pkg2 = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q2]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg2);

    const identicalProcesses = await Promise.all(
      Array.from({ length: 8 }, (_, i) => {
        return new Promise<any>((resolve, reject) => {
          const child = spawn(
            'node',
            [
              workerScriptPath,
              '--packageId',
              pkg2.packageId,
              '--packageIntegritySeal',
              pkg2.packageIntegritySeal,
              '--workerId',
              String(i),
              '--isConflicting',
              'false',
            ],
            { cwd: path.resolve(__dirname, '../../../../') }
          );

          let stdout = '';
          let stderr = '';
          child.stdout.on('data', (d) => (stdout += d.toString()));
          child.stderr.on('data', (d) => (stderr += d.toString()));
          child.on('close', (code) => {
            if (code !== 0) reject(new Error(`Worker failed: ${stderr}`));
            else resolve(JSON.parse(stdout.trim()));
          });
        });
      })
    );

    // All 8 separate child processes succeed with identical receipt
    expect(identicalProcesses.every((p) => p.success)).toBe(true);
    const firstReceiptId = identicalProcesses[0].receiptId;
    expect(identicalProcesses.every((p) => p.receiptId === firstReceiptId)).toBe(true);
  }, 45000);

  // ==========================================================================
  // Gate G7: Persistent Fingerprint Survives Connection Pool Teardown
  // ==========================================================================
  it('G7: Persistent publication fingerprint survives connection pool teardown and restart', async () => {
    const q1 = createCandidate('c_g7', 'inst_g7');
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    const requestPayload = {
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'REGIONAL_DIRECTORATE',
      targetScope: 'DISTRICT_42',
      publicationPolicyConfig: { sessionMax: 120 },
    };

    const initialReceipt = await adapter.publishPackage(requestPayload);
    expect(initialReceipt.publicationRequestFingerprint).toBeTruthy();

    // Completely destroy current connection pool
    await adapter.close();

    // Reopen fresh connection pool to simulate complete cold service restart
    const freshPool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'mockai_uadue_test',
      user: process.env.USER || 'postgres',
      max: 5,
    });
    const freshAdapter = new CanonicalPostgresPersistenceAdapter(freshPool);

    try {
      // 1. Identical retry on fresh adapter -> Idempotent receipt matching initial
      const retryReceipt = await freshAdapter.publishPackage(requestPayload);
      expect(retryReceipt.receiptId).toBe(initialReceipt.receiptId);
      expect(retryReceipt.publicationRequestFingerprint).toBe(initialReceipt.publicationRequestFingerprint);

      // 2. Conflicting retry on fresh adapter -> Rejection reading persisted fingerprint
      const conflictingPayload = {
        ...requestPayload,
        publicationAuthorityId: 'TAMPERED_AUTHORITY',
      };
      await expect(freshAdapter.publishPackage(conflictingPayload)).rejects.toThrow(PublicationConflictError);
    } finally {
      await freshAdapter.close();
      // Restore pool for subsequent tests
      pool = new Pool({
        host: 'localhost',
        port: 5432,
        database: 'mockai_uadue_test',
        user: process.env.USER || 'postgres',
        max: 25,
      });
      adapter = new CanonicalPostgresPersistenceAdapter(pool);
    }
  });

  // ==========================================================================
  // Additional Concurrency Stress: Connection Pool Starvation & Recovery
  // ==========================================================================
  it('Additional Stress: Constrained connection pool (max: 2) handles 20 serialized transactions without leakage', async () => {
    const constrainedPool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'mockai_uadue_test',
      user: process.env.USER || 'postgres',
      max: 2, // Only 2 connections available
    });
    const constrainedAdapter = new CanonicalPostgresPersistenceAdapter(constrainedPool);

    try {
      const q1 = createCandidate('c_g15', 'inst_g15');
      const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1]), strictValidation: true }).package!;
      await constrainedAdapter.persistPackage(pkg);

      const requestPayload = {
        packageId: pkg.packageId,
        packageIntegritySeal: pkg.packageIntegritySeal,
        publicationAuthorityId: 'CONSTRAINED_AUTHORITY',
        targetScope: 'GLOBAL',
        publicationPolicyConfig: {},
      };

      // Fire 20 transactions against a 2-connection pool
      const tasks = Array.from({ length: 20 }, () => constrainedAdapter.publishPackage(requestPayload));
      const receipts = await Promise.all(tasks);

      expect(receipts.length).toBe(20);
      expect(receipts.every((r) => r.receiptId === receipts[0].receiptId)).toBe(true);
    } finally {
      await constrainedAdapter.close();
    }
  });

  // ==========================================================================
  // Session Lock Concurrency: Competing FOR SHARE Read vs FOR UPDATE Transition
  // ==========================================================================
  it('G9: Competing FOR SHARE projection read and FOR UPDATE session state transition serialize correctly on real PostgreSQL', async () => {
    // 1. Setup a test session row
    const client = await pool.connect();
    const sessionId = 'sess_concurrency_race_001';
    const tenantId = 'tenant_concurrency';
    try {
      await client.query(`
        INSERT INTO public.canonical_assessment_packages (
          package_id, source_snapshot_id, source_document_id, package_integrity_seal,
          schema_version, pipeline_algorithm_id, pipeline_algorithm_version, created_at
        ) VALUES (
          'pkg_1', 'snap_1', 'doc_1', 'seal_1', '1.0.0', 'algo_1', '1.0.0', NOW()
        ) ON CONFLICT (package_id) DO NOTHING
      `);
      await client.query(`
        INSERT INTO public.exam_sessions (
          exam_session_id, tenant_id, candidate_id, package_id, package_integrity_seal,
          session_configuration, session_state, state_version, current_lease_id,
          lease_heartbeat_at, scheduled_start_at, actual_started_at, duration_seconds,
          accumulated_pause_seconds, pause_count, submitted_at, expired_at, terminated_at,
          created_at, updated_at
        ) VALUES (
          $1, $2, 'cand_1', 'pkg_1', 'seal_1', '{}'::jsonb, 'ACTIVE', 1, 'lease_1',
          NOW(), NOW(), NOW(), 3600, 0, 0, NULL, NULL, NULL, NOW(), NOW()
        ) ON CONFLICT (exam_session_id) DO UPDATE SET session_state = 'ACTIVE'
      `, [sessionId, tenantId]);
    } finally {
      client.release();
    }

    // 2. Client 1 acquires FOR SHARE lock and holds it while reading
    let client1LockAcquired = false;
    let client1ReadFinished = false;
    let client2TransitionFinished = false;

    const task1 = (async () => {
      const c1 = await pool.connect();
      try {
        await c1.query('BEGIN');
        await c1.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
        const res = await c1.query(
          `SELECT * FROM public.exam_sessions WHERE exam_session_id = $1 AND tenant_id = $2 FOR SHARE`,
          [sessionId, tenantId]
        );
        client1LockAcquired = true;
        // Hold lock while reading/constructing package
        await new Promise((r) => setTimeout(r, 200));
        client1ReadFinished = true;
        await c1.query('COMMIT');
        return res.rows[0].session_state;
      } finally {
        c1.release();
      }
    })();

    // 3. Client 2 attempts to transition session to TERMINATED with FOR UPDATE
    const task2 = (async () => {
      // Wait until Client 1 acquires the FOR SHARE lock
      while (!client1LockAcquired) {
        await new Promise((r) => setTimeout(r, 10));
      }
      const c2 = await pool.connect();
      try {
        await c2.query('BEGIN');
        await c2.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
        // This query must BLOCK in PostgreSQL until Client 1 commits!
        const res = await c2.query(
          `SELECT * FROM public.exam_sessions WHERE exam_session_id = $1 AND tenant_id = $2 FOR UPDATE`,
          [sessionId, tenantId]
        );
        // If PostgreSQL locks correctly, client1ReadFinished MUST BE TRUE at this moment!
        expect(client1ReadFinished).toBe(true);
        await c2.query(
          `UPDATE public.exam_sessions SET session_state = 'TERMINATED', state_version = state_version + 1 WHERE exam_session_id = $1`,
          [sessionId]
        );
        await c2.query('COMMIT');
        client2TransitionFinished = true;
        return res.rows[0].session_state;
      } finally {
        c2.release();
      }
    })();

    const [state1] = await Promise.all([task1, task2]);
    expect(state1).toBe('ACTIVE');
    expect(client2TransitionFinished).toBe(true);
  });
});
