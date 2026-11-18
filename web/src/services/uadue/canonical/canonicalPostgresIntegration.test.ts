/**
 * UADUE Phase 2D-8 — Real PostgreSQL Integration & Durable Verification Suite
 * Document Version: 8.0.0-POSTGRES-INTEGRATION
 *
 * Verifies against REAL PostgreSQL 18.3 database (mockai_uadue_test):
 * - G2: Real PostgreSQL persistence & transaction commit
 * - G9: Real PostgreSQL Row-Level Security (RLS) enforcement
 * - G10: Cross-tenant isolation (Tenant B cannot read Tenant A records)
 * - G11: Database-level append-only triggers block UPDATE and DELETE
 * - G12: Durable recovery across pool teardown & connection restart
 * - G13: Dual-seal recomputation over SQL reconstructed package
 * - G14: Source-order preservation from SQL rows
 * - G16: Transaction rollback on failure leaves zero partial rows
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { createHash } from 'crypto';
import {
  CanonicalPostgresPersistenceAdapter,
  TableConstraintError,
  PersistenceIntegrityError,
  ImmutabilityViolationError,
} from './canonicalPostgresPersistenceAdapter';
import { AssetIntegrityError } from './canonicalAssetRegistry';
import { CanonicalPipelineOrchestrator } from './canonicalPipelineOrchestrator';
import { QuestionCandidate, QuestionGraph } from '../contracts/questionGraph';
import { derivePackageId, computePackageIntegritySeal } from './canonicalHashing';

describe('UADUE Phase 2D-8 — Real PostgreSQL Integration & Invariants Suite', () => {
  let pool: Pool;
  let adapter: CanonicalPostgresPersistenceAdapter;
  let orchestrator: CanonicalPipelineOrchestrator;

  beforeAll(async () => {
    pool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'mockai_uadue_test',
      user: process.env.USER || 'postgres',
      max: 10,
    });
    adapter = new CanonicalPostgresPersistenceAdapter(pool);
    orchestrator = new CanonicalPipelineOrchestrator();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean tables before each test
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.is_service_role', 'true', true)");
      // Disable triggers temporarily for clean truncations
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

  const createCandidate = (overrides: Partial<QuestionCandidate>): QuestionCandidate => ({
    candidateId: 'cand_1',
    physicalInstanceId: 'inst_1',
    candidateDisplayOrder: 1,
    sourceOrder: 1,
    startPageNumber: 1,
    endPageNumber: 1,
    isMultiPage: false,
    identityCandidate: {
      physicalInstanceId: 'inst_1',
      numberType: 'QUESTION_NUMBER',
      confidence: 1.0,
      supportingEvidenceIds: [],
    },
    includedPhysicalNodeIds: ['node_stem_1'],
    stemNodeIds: ['node_stem_1'],
    bodyNodeIds: [],
    optionCandidateIds: ['opt_1', 'opt_2'],
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
        languageScript: 'DEVANAGARI',
        pageNumber: 1,
        stemNodeIds: ['node_stem_1'],
        bodyNodeIds: [],
        optionCandidateIds: ['opt_1', 'opt_2'],
      },
      {
        languageScript: 'LATIN',
        pageNumber: 2,
        stemNodeIds: ['node_stem_2'],
        bodyNodeIds: [],
        optionCandidateIds: ['opt_1', 'opt_2'],
      },
    ],
    ...overrides,
  });

  const createQuestionGraph = (questions: QuestionCandidate[]): QuestionGraph => ({
    graphId: 'qgraph_pg_test',
    sourceDocumentId: 'doc_pg_1',
    sourceSnapshotId: 'snap_pg_1',
    sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    sourceDocumentGraphId: 'docgraph_1',
    sourceDocumentGraphSha256: 'f3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    schemaVersion: 'uadue-qg-v3',
    algorithmVersion: '3.0.0',
    configurationVersion: '1.0.0',
    questions,
    stimuli: [],
    options: [
      {
        optionCandidateId: 'opt_1',
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
      {
        optionCandidateId: 'opt_2',
        contentNodeIds: ['node_opt_2'],
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
      sourceSnapshotId: 'snap_pg_1',
      sourceDocumentId: 'doc_pg_1',
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
  // Gate G2 & G13: Real PostgreSQL Persistence & Dual-Seal Reconstruction
  // ==========================================================================
  it('G2 & G13: Persists to real PostgreSQL and reconstructs with independent dual-seal verification', async () => {
    const q1 = createCandidate({ candidateId: 'c1', physicalInstanceId: 'inst1', sourceQuestionNumber: '1' });
    const qgraph = createQuestionGraph([q1]);
    const pkg = orchestrator.executePipeline({ questionGraph: qgraph, strictValidation: true }).package!;

    // Persist into real PostgreSQL
    const { packageId, persistenceEvent } = await adapter.persistPackage(pkg);
    expect(packageId).toBe(pkg.packageId);
    expect(persistenceEvent.sequenceNumber).toBe(1);

    // Reconstruct directly from PostgreSQL
    const reconstructed = await adapter.reconstructPackage(pkg.packageId);

    // Independently verify dual seals
    const recomputedId = derivePackageId({
      sourceSnapshotId: reconstructed.sourceSnapshotId,
      sourceDocumentId: reconstructed.sourceDocumentId,
      canonicalQuestionIds: reconstructed.canonicalQuestions.map((q) => q.canonicalQuestionId),
      logicalFamilyIds: reconstructed.logicalFamilies.map((f) => f.familyId),
      relationshipEvaluationIds: reconstructed.relationshipEvaluations.map((e) => e.evaluationId),
      membershipIds: reconstructed.memberships.map((m) => m.membershipFingerprint),
      quarantinedRelationshipIds: reconstructed.quarantinedRelationships.map((r) => r.relationshipId),
      schemaVersion: reconstructed.schemaVersion,
      pipelineAlgorithmId: reconstructed.pipelineAlgorithmId,
      pipelineAlgorithmVersion: reconstructed.pipelineAlgorithmVersion,
    });

    const recomputedSeal = computePackageIntegritySeal({
      packageId: reconstructed.packageId,
      sourceSnapshotId: reconstructed.sourceSnapshotId,
      sourceDocumentId: reconstructed.sourceDocumentId,
      canonicalQuestions: reconstructed.canonicalQuestions,
      logicalFamilies: reconstructed.logicalFamilies,
      relationshipEvaluations: reconstructed.relationshipEvaluations,
      memberships: reconstructed.memberships,
      quarantinedRelationships: reconstructed.quarantinedRelationships,
      authoritativeAnswers: reconstructed.authoritativeAnswers,
      schemaVersion: reconstructed.schemaVersion,
      pipelineAlgorithmId: reconstructed.pipelineAlgorithmId,
      pipelineAlgorithmVersion: reconstructed.pipelineAlgorithmVersion,
    });

    expect(recomputedId).toBe(pkg.packageId);
    expect(recomputedSeal).toBe(pkg.packageIntegritySeal);
    expect(reconstructed.canonicalQuestions.length).toBe(1);
    expect(reconstructed.canonicalQuestions[0].representations.length).toBe(pkg.canonicalQuestions[0].representations.length);
  });

  // ==========================================================================
  // Gate G11: Database-Level Immutability Triggers (UPDATE & DELETE)
  // ==========================================================================
  it('G11: Database-level SQL triggers block UPDATE and DELETE on packages and events', async () => {
    const q1 = createCandidate({ candidateId: 'c11', physicalInstanceId: 'inst11' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    const client = await pool.connect();
    try {
      // 1. Attempt UPDATE on canonical_assessment_packages
      await expect(
        client.query('UPDATE public.canonical_assessment_packages SET schema_version = $1 WHERE package_id = $2', [
          'tampered_version',
          pkg.packageId,
        ])
      ).rejects.toThrow(/UADUE Immutability Violation: In-place UPDATE operation is forbidden/);

      // 2. Attempt DELETE on canonical_assessment_packages
      await expect(
        client.query('DELETE FROM public.canonical_assessment_packages WHERE package_id = $1', [pkg.packageId])
      ).rejects.toThrow(/UADUE Immutability Violation: In-place DELETE operation is forbidden/);

      // 3. Attempt UPDATE on canonical_package_events
      await expect(
        client.query('UPDATE public.canonical_package_events SET event_type = $1 WHERE package_id = $2', [
          'TAMPERED_EVENT',
          pkg.packageId,
        ])
      ).rejects.toThrow(/UADUE Immutability Violation: In-place UPDATE operation is forbidden/);

      // 4. Attempt DELETE on canonical_package_events
      await expect(
        client.query('DELETE FROM public.canonical_package_events WHERE package_id = $1', [pkg.packageId])
      ).rejects.toThrow(/UADUE Immutability Violation: In-place DELETE operation is forbidden/);
    } finally {
      client.release();
    }
  });

  // ==========================================================================
  // Gate G12: Durable Recovery Across Connection Teardown
  // ==========================================================================
  it('G12: Package and seals survive connection teardown and fresh client reconnect', async () => {
    const q1 = createCandidate({ candidateId: 'c12', physicalInstanceId: 'inst12' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    // Completely destroy current adapter and connection pool
    await adapter.close();

    // Create a brand new independent pool connecting afresh
    const freshPool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'mockai_uadue_test',
      user: process.env.USER || 'postgres',
      max: 5,
    });
    const freshAdapter = new CanonicalPostgresPersistenceAdapter(freshPool);

    try {
      const recovered = await freshAdapter.reconstructPackage(pkg.packageId);
      expect(recovered.packageId).toBe(pkg.packageId);
      expect(recovered.packageIntegritySeal).toBe(pkg.packageIntegritySeal);

      const recomputedSeal = computePackageIntegritySeal({
        packageId: recovered.packageId,
        sourceSnapshotId: recovered.sourceSnapshotId,
        sourceDocumentId: recovered.sourceDocumentId,
        canonicalQuestions: recovered.canonicalQuestions,
        logicalFamilies: recovered.logicalFamilies,
        relationshipEvaluations: recovered.relationshipEvaluations,
        memberships: recovered.memberships,
        quarantinedRelationships: recovered.quarantinedRelationships,
        authoritativeAnswers: recovered.authoritativeAnswers,
        schemaVersion: recovered.schemaVersion,
        pipelineAlgorithmId: recovered.pipelineAlgorithmId,
        pipelineAlgorithmVersion: recovered.pipelineAlgorithmVersion,
      });
      expect(recomputedSeal).toBe(pkg.packageIntegritySeal);
    } finally {
      await freshAdapter.close();
      // Re-initialize original pool for subsequent tests
      pool = new Pool({
        host: 'localhost',
        port: 5432,
        database: 'mockai_uadue_test',
        user: process.env.USER || 'postgres',
        max: 10,
      });
      adapter = new CanonicalPostgresPersistenceAdapter(pool);
    }
  });

  // ==========================================================================
  // Gate G9 & G10: Real PostgreSQL Row Level Security (RLS) & Tenant Isolation
  // ==========================================================================
  it('G9 & G10: PostgreSQL RLS enforces tenant isolation; Tenant B cannot read Tenant A records', async () => {
    const q1 = createCandidate({ candidateId: 'c_tenant', physicalInstanceId: 'inst_tenant' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1]), strictValidation: true }).package!;

    // Persist as TENANT_RESTRICTED owned by tenant_alpha
    await adapter.persistPackage(pkg, {
      tenantId: 'tenant_alpha',
      organizationId: 'org_alpha',
      visibilityScope: 'TENANT_RESTRICTED',
    });

    const client = await pool.connect();
    try {
      // 1. Query as tenant_alpha -> Must find package
      await adapter.setSessionContext(client, 'tenant_alpha', false, false);
      const alphaRes = await client.query('SELECT package_id FROM public.canonical_assessment_packages WHERE package_id = $1', [
        pkg.packageId,
      ]);
      expect(alphaRes.rows.length).toBe(1);

      // 2. Query as tenant_beta -> RLS policy MUST return 0 rows!
      await adapter.setSessionContext(client, 'tenant_beta', false, false);
      const betaRes = await client.query('SELECT package_id FROM public.canonical_assessment_packages WHERE package_id = $1', [
        pkg.packageId,
      ]);
      expect(betaRes.rows.length).toBe(0);

      // 3. Query questions as tenant_beta -> RLS policy MUST return 0 rows!
      const betaQRes = await client.query('SELECT canonical_question_id FROM public.canonical_questions WHERE package_id = $1', [
        pkg.packageId,
      ]);
      expect(betaQRes.rows.length).toBe(0);

      // 4. Query answers as tenant_beta -> RLS policy returns 0 rows or permission denied (least-privilege)
      try {
        const betaAnsRes = await client.query('SELECT canonical_question_id FROM public.canonical_answer_authority_resolutions WHERE package_id = $1', [
          pkg.packageId,
        ]);
        expect(betaAnsRes.rows.length).toBe(0);
      } catch (permErr: any) {
        expect(permErr.message).toMatch(/permission denied/i);
      }

      // 5. Query as Service Role -> Full access restored
      await adapter.setSessionContext(client, null, true, false);
      const serviceRes = await client.query('SELECT package_id FROM public.canonical_assessment_packages WHERE package_id = $1', [
        pkg.packageId,
      ]);
      expect(serviceRes.rows.length).toBe(1);
    } finally {
      try {
        await client.query('RESET ROLE');
      } catch {}
      client.release();
    }
  });

  // ==========================================================================
  // Gate G14: Source-Order Preservation Under Shuffled Database Inserts
  // ==========================================================================
  it('G14: Source-order preservation restored via ORDER BY question_index and representation_index', async () => {
    const q1 = createCandidate({ candidateId: 'c14_1', physicalInstanceId: 'inst14_1', sourceQuestionNumber: '1' });
    const q2 = createCandidate({ candidateId: 'c14_2', physicalInstanceId: 'inst14_2', sourceQuestionNumber: '2' });
    const q3 = createCandidate({ candidateId: 'c14_3', physicalInstanceId: 'inst14_3', sourceQuestionNumber: '3' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1, q2, q3]), strictValidation: true }).package!;

    await adapter.persistPackage(pkg);

    // Reconstruct and verify exact question order 0, 1, 2
    const reconstructed = await adapter.reconstructPackage(pkg.packageId);
    expect(reconstructed.canonicalQuestions.length).toBe(3);
    for (let i = 0; i < pkg.canonicalQuestions.length; i++) {
      expect(reconstructed.canonicalQuestions[i].canonicalQuestionId).toBe(pkg.canonicalQuestions[i].canonicalQuestionId);
      expect(reconstructed.canonicalQuestions[i].representations[0].sourcePhysicalInstanceId).toBe(
        pkg.canonicalQuestions[i].representations[0].sourcePhysicalInstanceId
      );
    }

    // Dual seals match bit-for-bit
    expect(reconstructed.packageId).toBe(pkg.packageId);
    expect(reconstructed.packageIntegritySeal).toBe(pkg.packageIntegritySeal);
  });

  // ==========================================================================
  // Gate G16: Failure Injection & Transaction Rollback Atomicity
  // ==========================================================================
  it('G16: Transaction abort on pre-commit seal mismatch leaves zero partial rows in PostgreSQL', async () => {
    const q1 = createCandidate({ candidateId: 'c16', physicalInstanceId: 'inst16' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1]), strictValidation: true }).package!;

    // Deliberately tamper with packageIntegritySeal before persistence to trigger pre-commit abort
    const tamperedPkg = { ...pkg, packageIntegritySeal: 'tampered_bad_seal_00000000000000000000000000000000' };

    await expect(adapter.persistPackage(tamperedPkg)).rejects.toThrow(PersistenceIntegrityError);

    // Assert that the transaction was rolled back and NO rows were committed
    const client = await pool.connect();
    try {
      await adapter.setSessionContext(client, null, true);
      const pkgCheck = await client.query('SELECT 1 FROM public.canonical_assessment_packages WHERE package_id = $1', [pkg.packageId]);
      const qCheck = await client.query('SELECT 1 FROM public.canonical_questions WHERE package_id = $1', [pkg.packageId]);
      const evtCheck = await client.query('SELECT 1 FROM public.canonical_package_events WHERE package_id = $1', [pkg.packageId]);

      expect(pkgCheck.rows.length).toBe(0);
      expect(qCheck.rows.length).toBe(0);
      expect(evtCheck.rows.length).toBe(0);
    } finally {
      client.release();
    }
  });

  // ==========================================================================
  // Gate G15: Real PostgreSQL Asset Durability & Cryptographic Integrity
  // ==========================================================================
  it('G15: Asset durability, independent SHA-256 parity, deduplication, cold restart, and tamper rejection', async () => {
    // 1. Prepare known binary asset
    const authenticBytes = Buffer.from('UADUE_AUTH_ASSET_RAW_IMAGE_DATA_XYZ_1234567890_PNG_HEADER');

    // 2. Independently compute SHA-256
    const independentExpectedHash = createHash('sha256').update(authenticBytes).digest('hex');

    // 3 & 4. Persist asset metadata and bytes to real PostgreSQL
    const registeredRecord = await adapter.registerAsset(
      authenticBytes,
      'image/png',
      { examSeries: 'SSC_2023_TIER1', paperIndex: 2 },
      independentExpectedHash
    );

    expect(registeredRecord.contentHash).toBe(independentExpectedHash);
    expect(registeredRecord.byteSize).toBe(authenticBytes.byteLength);
    expect(registeredRecord.storageUri).toBe(`assets/${independentExpectedHash.slice(0, 2)}/${independentExpectedHash}.png`);

    // 5. Close database connection pool to simulate cold process restart
    await adapter.close();

    // 6. Reconnect from a fresh independent connection pool
    const freshPool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'mockai_uadue_test',
      user: process.env.USER || 'postgres',
      max: 5,
    });
    const freshAdapter = new CanonicalPostgresPersistenceAdapter(freshPool);

    try {
      // 7. Retrieve asset from fresh connection
      const { record: retrievedRecord, bytes: retrievedBytes } = await freshAdapter.retrieveAsset(independentExpectedHash);

      // 8. Recompute SHA-256 independently
      const recomputedHash = createHash('sha256').update(retrievedBytes).digest('hex');

      // 9. Verify hash equality & byte bit-for-bit parity
      expect(recomputedHash).toBe(independentExpectedHash);
      expect(retrievedBytes.equals(authenticBytes)).toBe(true);
      expect(retrievedRecord.contentHash).toBe(independentExpectedHash);
      expect(retrievedRecord.storageUri).toBe(registeredRecord.storageUri);
      expect(retrievedRecord.byteSize).toBe(authenticBytes.byteLength);

      // 10 & 11. Attempt incorrect asserted hash -> Mismatch fails closed
      const wrongAssertedHash = '0000000000000000000000000000000000000000000000000000000000000000';
      await expect(
        freshAdapter.registerAsset(authenticBytes, 'image/png', {}, wrongAssertedHash)
      ).rejects.toThrow(AssetIntegrityError);

      // 12 & 13. Attempt tampered/corrupted bytes in database -> Retrieval integrity check fails closed
      const corruptedBytes = Buffer.from('CORRUPTED_BYTES_MALICIOUS_TAMPER');
      await freshAdapter.tamperWithAssetBytesInDb(independentExpectedHash, corruptedBytes);
      await expect(freshAdapter.retrieveAsset(independentExpectedHash)).rejects.toThrow(AssetIntegrityError);

      // Restore authentic bytes
      await freshAdapter.tamperWithAssetBytesInDb(independentExpectedHash, authenticBytes);

      // 14 & 15. Register identical bytes twice -> Verify content-addressed identity & deduplication semantics
      const duplicateRecord = await freshAdapter.registerAsset(
        authenticBytes,
        'image/png',
        { alternateExamContext: 'GATE_2024' }
      );
      expect(duplicateRecord.contentHash).toBe(independentExpectedHash);
      expect(duplicateRecord.storageUri).toBe(registeredRecord.storageUri);

      // Query database table directly to prove only 1 physical row exists for this hash
      const client = await freshPool.connect();
      try {
        await freshAdapter.setSessionContext(client, null, true);
        const countRes = await client.query('SELECT count(*) FROM public.canonical_assets WHERE content_hash = $1', [
          independentExpectedHash,
        ]);
        expect(parseInt(countRes.rows[0].count, 10)).toBe(1);
      } finally {
        client.release();
      }
    } finally {
      await freshAdapter.close();
      // Restore original pool for test teardown
      pool = new Pool({
        host: 'localhost',
        port: 5432,
        database: 'mockai_uadue_test',
        user: process.env.USER || 'postgres',
        max: 10,
      });
      adapter = new CanonicalPostgresPersistenceAdapter(pool);
    }
  });
});
