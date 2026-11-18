/**
 * UADUE Phase 2D-8 — Gate G19 30 Adversarial Scenarios Against Real PostgreSQL
 * Document Version: 8.0.0-POSTGRES-ADVERSARIAL
 *
 * Exercises all 30 adversarial scenarios (SCEN-2D8-01 through SCEN-2D8-30)
 * against the real PostgreSQL 18.3 database (mockai_uadue_test).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { CanonicalPipelineOrchestrator } from './canonicalPipelineOrchestrator';
import {
  CanonicalPostgresPersistenceAdapter,
  ImmutabilityViolationError,
  PersistenceIntegrityError,
  TableConstraintError,
  TenancyAccessError,
} from './canonicalPostgresPersistenceAdapter';
import {
  CanonicalPublicationGateway,
  PublicationConflictError,
} from './canonicalPublicationGateway';
import { CanonicalProjectionGateway } from './canonicalProjectionGateway';
import { CanonicalAssetRegistry, AssetIntegrityError } from './canonicalAssetRegistry';
import {
  reducePackageLifecycle,
  CorruptedEventStreamError,
  InvalidLifecycleTransitionError,
} from './canonicalLifecycleEngine';
import { derivePackageId, computePackageIntegritySeal, rfc8785Canonicalize } from './canonicalHashing';
import { QuestionCandidate, QuestionGraph } from '../contracts/questionGraph';

describe('UADUE Phase 2D-8 — Gate G19 30 Adversarial Scenarios on Real PostgreSQL', () => {
  let pool: Pool;
  let orchestrator: CanonicalPipelineOrchestrator;
  let adapter: CanonicalPostgresPersistenceAdapter;
  let gateway: CanonicalPublicationGateway;
  let projectionGateway: CanonicalProjectionGateway;
  let assetRegistry: CanonicalAssetRegistry;

  beforeAll(async () => {
    pool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'mockai_uadue_test',
      user: process.env.USER || 'postgres',
      max: 15,
    });
    adapter = new CanonicalPostgresPersistenceAdapter(pool);
    orchestrator = new CanonicalPipelineOrchestrator();
    gateway = new CanonicalPublicationGateway(adapter as any);
    projectionGateway = new CanonicalProjectionGateway(adapter as any);
    assetRegistry = new CanonicalAssetRegistry();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    const client = await pool.connect();
    try {
      try {
        await client.query('RESET ROLE');
      } catch {
        // ignore
      }
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

  const createCandidate = (overrides: Partial<QuestionCandidate>): QuestionCandidate => ({
    candidateId: 'cand_1',
    physicalInstanceId: 'inst_1',
    candidateDisplayOrder: 1,
    sourceOrder: 1,
    startPageNumber: 1,
    endPageNumber: 1,
    isMultiPage: false,
    identityCandidate: {
      physicalInstanceId: overrides.physicalInstanceId || 'inst_1',
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
        languageScript: 'LATIN',
        pageNumber: 1,
        stemNodeIds: ['node_stem_1'],
        bodyNodeIds: [],
        optionCandidateIds: ['opt_1', 'opt_2'],
      },
    ],
    ...overrides,
  });

  const createQuestionGraph = (questions: QuestionCandidate[]): QuestionGraph => ({
    graphId: `qgraph_adv_pg_${Date.now()}`,
    sourceDocumentId: 'doc_sample_1',
    sourceSnapshotId: 'snap_sample_1',
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

  // SCEN-2D8-01: In-place UPDATE on package row
  it('SCEN-2D8-01: Rejects in-place UPDATE on canonical_assessment_packages via SQL trigger', async () => {
    const q = createCandidate({ candidateId: 'c1', physicalInstanceId: 'inst1' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);
    await expect(adapter.attemptUpdatePackageHeader(pkg.packageId)).rejects.toThrow(ImmutabilityViolationError);
  });

  // SCEN-2D8-02: DELETE on package row
  it('SCEN-2D8-02: Rejects DELETE on canonical_assessment_packages via SQL trigger', async () => {
    const q = createCandidate({ candidateId: 'c2', physicalInstanceId: 'inst2' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);
    await expect(adapter.attemptDeletePackageHeader(pkg.packageId)).rejects.toThrow(ImmutabilityViolationError);
  });

  // SCEN-2D8-03: Single-character mutation of stem_ast in persistent store
  it('SCEN-2D8-03: Single-character mutation of stem_ast in DB triggers seal mismatch failure on reconstruction', async () => {
    const q = createCandidate({ candidateId: 'c3', physicalInstanceId: 'inst3' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    const repId = pkg.canonicalQuestions[0].representations[0].representationId;
    await adapter.tamperWithRepresentationASTInDb(repId, 'MUTATED_TEXT');

    const reconstructed = await adapter.reconstructPackage(pkg.packageId);
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
    expect(recomputedSeal).not.toBe(pkg.packageIntegritySeal);
  });

  // SCEN-2D8-04: Option array reordering
  it('SCEN-2D8-04: Permuting options within a representation causes content seal failure', async () => {
    const q = createCandidate({ candidateId: 'c4', physicalInstanceId: 'inst4' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    const permutedPkg = JSON.parse(JSON.stringify(pkg));
    permutedPkg.canonicalQuestions[0].representations[0].options.reverse();

    const permutedSeal = computePackageIntegritySeal({
      packageId: permutedPkg.packageId,
      sourceSnapshotId: permutedPkg.sourceSnapshotId,
      sourceDocumentId: permutedPkg.sourceDocumentId,
      canonicalQuestions: permutedPkg.canonicalQuestions,
      logicalFamilies: permutedPkg.logicalFamilies,
      relationshipEvaluations: permutedPkg.relationshipEvaluations,
      memberships: permutedPkg.memberships,
      quarantinedRelationships: permutedPkg.quarantinedRelationships,
      authoritativeAnswers: permutedPkg.authoritativeAnswers,
      schemaVersion: permutedPkg.schemaVersion,
      pipelineAlgorithmId: permutedPkg.pipelineAlgorithmId,
      pipelineAlgorithmVersion: permutedPkg.pipelineAlgorithmVersion,
    });
    expect(permutedSeal).not.toBe(pkg.packageIntegritySeal);
  });

  // SCEN-2D8-05: Floating-point injection into scoring
  it('SCEN-2D8-05: Floating point injection into scoring policies throws validation error', () => {
    const nonFiniteNumber = Infinity;
    expect(() => rfc8785Canonicalize({ marks: nonFiniteNumber })).toThrow(/RFC 8785 forbids non-finite numbers/);
  });

  // SCEN-2D8-06: Out-of-order lifecycle event
  it('SCEN-2D8-06: Out-of-order lifecycle transition (DRAFT directly to PUBLISHED) fails closed', () => {
    const fakeEvents = [
      {
        eventId: 'evt_1',
        packageId: 'pkg_ooo',
        eventType: 'PUBLICATION_ISSUED' as const,
        sequenceNumber: 1,
        eventPayload: {},
        createdAt: Date.now(),
      },
    ];
    expect(() => reducePackageLifecycle(fakeEvents, 'pkg_ooo')).toThrow(CorruptedEventStreamError);
  });

  // SCEN-2D8-07: Concurrent identical publication race in PostgreSQL
  it('SCEN-2D8-07: Concurrent identical publication requests are serialized; second is idempotent', async () => {
    const q = createCandidate({ candidateId: 'c7', physicalInstanceId: 'inst7' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    const payload = {
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'AUTH_1',
      targetScope: 'SCOPE_1',
    };

    const [r1, r2] = await Promise.all([adapter.publishPackage(payload), adapter.publishPackage(payload)]);
    expect(r1.receiptId).toBe(r2.receiptId);
    expect(r1.publicationSequenceNumber).toBe(1);
    expect(r2.publicationSequenceNumber).toBe(1);
  });

  // SCEN-2D8-08: Concurrent conflicting publication requests in PostgreSQL
  it('SCEN-2D8-08: Concurrent conflicting publication requests reject second caller with 409', async () => {
    const q = createCandidate({ candidateId: 'c8', physicalInstanceId: 'inst8' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    const p1 = adapter.publishPackage({
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'AUTH_1',
      targetScope: 'SCOPE_A',
    });
    const p2 = adapter.publishPackage({
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'AUTH_2',
      targetScope: 'SCOPE_B',
    });

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(PublicationConflictError);
  });

  // SCEN-2D8-09: Publication attempt on package with failed invariants
  it('SCEN-2D8-09: Publication attempt on package with failed invariants is rejected', async () => {
    const q = createCandidate({ candidateId: 'c9', physicalInstanceId: 'inst9' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    pkg.validationReport.validationStatus = 'PACKAGE_FAILED';
    pkg.validationReport.failedInvariantCount = 2;
    await adapter.persistPackage(pkg);

    await expect(
      adapter.publishPackage({
        packageId: pkg.packageId,
        packageIntegritySeal: pkg.packageIntegritySeal,
        publicationAuthorityId: 'AUTH_1',
        targetScope: 'PUBLIC',
      })
    ).rejects.toThrow(InvalidLifecycleTransitionError);
  });

  // SCEN-2D8-10: Student Live Test projection answer leakage attempt
  it('SCEN-2D8-10: Student Live Test projection physically omits authoritative answer keys', async () => {
    const q = createCandidate({ candidateId: 'c10', physicalInstanceId: 'inst10' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    // Verify that missing security context fails closed
    await expect(
      (projectionGateway as any).getTier3StudentLiveProjection(pkg.packageId)
    ).rejects.toThrow('AUTH_CONTEXT_REQUIRED');

    const live = await projectionGateway.getTier3StudentLiveProjection(pkg.packageId, {
      tenantId: 'tenant_test',
      examSessionId: 'sess_live_10',
      candidateId: 'cand_10',
    });
    expect((live.questions[0] as any).authoritativeAnswer).toBeUndefined();
    expect((live.questions[0] as any).scoringPolicy).toBeUndefined();
  });

  // SCEN-2D8-11: Attempted transition out of SUPERSEDED terminal state
  it('SCEN-2D8-11: Transition out of SUPERSEDED terminal state fails closed', async () => {
    const q1 = createCandidate({ candidateId: 'c11_1', physicalInstanceId: 'inst11_1' });
    const q2 = createCandidate({ candidateId: 'c11_2', physicalInstanceId: 'inst11_2' });
    const pkg1 = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1]), strictValidation: true }).package!;
    const pkg2 = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q2]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg1);
    await adapter.persistPackage(pkg2);

    await adapter.registerSupersession(pkg1.packageId, pkg2.packageId, 'Replacement');
    expect(await adapter.getPackageLifecycleState(pkg1.packageId)).toBe('SUPERSEDED');

    await expect(
      adapter.appendLifecycleEvent(pkg1.packageId, 'PUBLICATION_ISSUED', {}, 'fp_sup')
    ).rejects.toThrow(InvalidLifecycleTransitionError);
  });

  // SCEN-2D8-12: Corrupted event stream with sequence gap
  it('SCEN-2D8-12: Corrupted event stream with sequence gap throws CorruptedEventStreamError', () => {
    const events = [
      {
        eventId: 'e1',
        packageId: 'p_gap',
        eventType: 'PERSISTENCE_COMMITTED' as const,
        sequenceNumber: 1,
        eventPayload: {},
        createdAt: 100,
      },
      {
        eventId: 'e3',
        packageId: 'p_gap',
        eventType: 'VALIDATION_RECORDED' as const,
        sequenceNumber: 3,
        eventPayload: { validationStatus: 'PACKAGE_VALIDATED' },
        createdAt: 200,
      },
    ];
    expect(() => reducePackageLifecycle(events, 'p_gap')).toThrow(CorruptedEventStreamError);
  });

  // SCEN-2D8-13: Duplicate publication request with identical payload
  it('SCEN-2D8-13: Duplicate publication request with identical payload returns existing receipt idempotently', async () => {
    const q = createCandidate({ candidateId: 'c13', physicalInstanceId: 'inst13' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    const payload = {
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'AUTH_CBSE',
      targetScope: 'NATIONAL',
    };

    const first = await adapter.publishPackage(payload);
    const second = await adapter.publishPackage(payload);
    expect(first.receiptId).toBe(second.receiptId);
    expect(first.publicationRequestFingerprint).toBe(second.publicationRequestFingerprint);
  });

  // SCEN-2D8-14: Same authority submitting conflicting payload on published package
  it('SCEN-2D8-14: Same authority submitting conflicting payload fails closed with 409 conflict', async () => {
    const q = createCandidate({ candidateId: 'c14', physicalInstanceId: 'inst14' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    await adapter.publishPackage({
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'AUTH_SSC',
      targetScope: 'TIER_1',
      publicationPolicyConfig: { shuffle: false },
    });

    await expect(
      adapter.publishPackage({
        packageId: pkg.packageId,
        packageIntegritySeal: pkg.packageIntegritySeal,
        publicationAuthorityId: 'AUTH_SSC',
        targetScope: 'TIER_2_ALTERED',
        publicationPolicyConfig: { shuffle: true },
      })
    ).rejects.toThrow(PublicationConflictError);
  });

  // SCEN-2D8-15: Unauthorized tenant querying restricted package in PostgreSQL
  it('SCEN-2D8-15: Unauthorized tenant querying restricted package throws TenancyAccessError via PostgreSQL RLS', async () => {
    const q = createCandidate({ candidateId: 'c15', physicalInstanceId: 'inst15' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg, {
      tenantId: 'tenant_secure',
      organizationId: 'org_secure',
      visibilityScope: 'TENANT_RESTRICTED',
    });

    await expect(adapter.getPackageWithTenancyCheck(pkg.packageId, 'tenant_intruder')).rejects.toThrow(
      TenancyAccessError
    );
  });

  // SCEN-2D8-16: Public package access without tenant context
  it('SCEN-2D8-16: Public package access allows queries from any tenant context in PostgreSQL', async () => {
    const q = createCandidate({ candidateId: 'c16', physicalInstanceId: 'inst16' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg, {
      tenantId: 'tenant_open',
      organizationId: 'org_open',
      visibilityScope: 'PUBLIC',
    });

    const accessed = await adapter.getPackageWithTenancyCheck(pkg.packageId, 'any_random_tenant');
    expect(accessed.package_id).toBe(pkg.packageId);
  });

  // SCEN-2D8-17: Asset content hash mismatch upon ingestion
  it('SCEN-2D8-17: Asset content hash mismatch throws AssetIntegrityError', () => {
    const bytes = Buffer.from('diagram-bytes-17');
    expect(() =>
      assetRegistry.registerAsset(bytes, 'image/png', {}, 'fabricated_hash_00000000')
    ).toThrow(AssetIntegrityError);
  });

  // SCEN-2D8-18: Asset collision across different exams deduplicates safely
  it('SCEN-2D8-18: Asset with identical bytes across different exams shares single storage URI', () => {
    const bytes = Buffer.from('shared-watermark-icon');
    const a1 = assetRegistry.registerAsset(bytes, 'image/png', { exam: 'UPSC' });
    const a2 = assetRegistry.registerAsset(bytes, 'image/png', { exam: 'SSC' });
    expect(a1.contentHash).toBe(a2.contentHash);
    expect(a1.storageUri).toBe(a2.storageUri);
    expect(assetRegistry.getTotalAssetCount()).toBe(1);
  });

  // SCEN-2D8-19: Cyclic package supersession attempt
  it('SCEN-2D8-19: Cyclic package supersession (P1 -> P2 -> P1) throws TableConstraintError', async () => {
    const q1 = createCandidate({ candidateId: 'c19_1', physicalInstanceId: 'inst19_1' });
    const q2 = createCandidate({ candidateId: 'c19_2', physicalInstanceId: 'inst19_2' });
    const pkg1 = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1]), strictValidation: true }).package!;
    const pkg2 = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q2]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg1);
    await adapter.persistPackage(pkg2);

    await adapter.registerSupersession(pkg1.packageId, pkg2.packageId, 'Update');
    await expect(
      adapter.registerSupersession(pkg2.packageId, pkg1.packageId, 'Illegal cycle')
    ).rejects.toThrow(/Cyclic package supersession/);
  });

  // SCEN-2D8-20: Self-supersession attempt
  it('SCEN-2D8-20: Self-supersession (P1 -> P1) throws TableConstraintError', async () => {
    const q = createCandidate({ candidateId: 'c20', physicalInstanceId: 'inst20' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    await expect(
      adapter.registerSupersession(pkg.packageId, pkg.packageId, 'Self loop')
    ).rejects.toThrow(/cannot supersede itself/);
  });

  // SCEN-2D8-21: Non-existent package reference in supersession
  it('SCEN-2D8-21: Supersession referencing non-existent package throws PersistenceIntegrityError', async () => {
    const q = createCandidate({ candidateId: 'c21', physicalInstanceId: 'inst21' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    await expect(
      adapter.registerSupersession(pkg.packageId, 'non_existent_pkg', 'Dangling')
    ).rejects.toThrow(PersistenceIntegrityError);
  });

  // SCEN-2D8-22: Re-persisting an already persisted package
  it('SCEN-2D8-22: Re-persisting an already persisted package throws TableConstraintError', async () => {
    const q = createCandidate({ candidateId: 'c22', physicalInstanceId: 'inst22' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    await expect(adapter.persistPackage(pkg)).rejects.toThrow(TableConstraintError);
  });

  // SCEN-2D8-23: Attempted publication without mandatory publication_request_fingerprint
  it('SCEN-2D8-23: Appending PUBLICATION_ISSUED without publication_request_fingerprint violates chk_pub_fingerprint', async () => {
    const q = createCandidate({ candidateId: 'c23', physicalInstanceId: 'inst23' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    await expect(
      adapter.appendLifecycleEvent(pkg.packageId, 'PUBLICATION_ISSUED', {}, null)
    ).rejects.toThrow(/chk_pub_fingerprint/);
  });

  // SCEN-2D8-24: Release of validation-failure quarantine (origin=PERSISTED) fails closed
  it('SCEN-2D8-24: Option A: QUARANTINE_RELEASED on validation-failure quarantine throws InvalidLifecycleTransitionError', async () => {
    const q = createCandidate({ candidateId: 'c24', physicalInstanceId: 'inst24' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    pkg.validationReport.validationStatus = 'PACKAGE_FAILED';
    await adapter.persistPackage(pkg);

    await expect(
      adapter.appendLifecycleEvent(pkg.packageId, 'QUARANTINE_RELEASED', {})
    ).rejects.toThrow(/Option A Violation/);
  });

  // SCEN-2D8-25: Quarantine release on un-quarantined package fails closed
  it('SCEN-2D8-25: Quarantine release on VALIDATED package fails closed', async () => {
    const q = createCandidate({ candidateId: 'c25', physicalInstanceId: 'inst25' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    expect(await adapter.getPackageLifecycleState(pkg.packageId)).toBe('VALIDATED');
    await expect(
      adapter.appendLifecycleEvent(pkg.packageId, 'QUARANTINE_RELEASED', {})
    ).rejects.toThrow(InvalidLifecycleTransitionError);
  });

  // SCEN-2D8-26: Post-publication emergency quarantine release restores PUBLISHED state
  it('SCEN-2D8-26: Post-publication emergency quarantine release restores PUBLISHED state cleanly', async () => {
    const q = createCandidate({ candidateId: 'c26', physicalInstanceId: 'inst26' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    await adapter.publishPackage({
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'AUTH_26',
      targetScope: 'GLOBAL',
    });
    expect(await adapter.getPackageLifecycleState(pkg.packageId)).toBe('PUBLISHED');

    await adapter.appendLifecycleEvent(pkg.packageId, 'QUARANTINE_APPLIED', {
      originState: 'PUBLISHED',
      reason: 'Audit investigation',
    });
    expect(await adapter.getPackageLifecycleState(pkg.packageId)).toBe('QUARANTINED');

    await adapter.appendLifecycleEvent(pkg.packageId, 'QUARANTINE_RELEASED', {
      investigationResult: 'CLEARED_FALSE_ALARM',
    });
    expect(await adapter.getPackageLifecycleState(pkg.packageId)).toBe('PUBLISHED');
  });

  // SCEN-2D8-27: Pre-publication administrative quarantine release allows publication
  it('SCEN-2D8-27: Pre-publication administrative quarantine release allows publication with sequence 1', async () => {
    const q = createCandidate({ candidateId: 'c27', physicalInstanceId: 'inst27' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    await adapter.appendLifecycleEvent(pkg.packageId, 'QUARANTINE_APPLIED', {
      originState: 'VALIDATED',
    });
    expect(await adapter.getPackageLifecycleState(pkg.packageId)).toBe('QUARANTINED');

    await adapter.appendLifecycleEvent(pkg.packageId, 'QUARANTINE_RELEASED', {});
    expect(await adapter.getPackageLifecycleState(pkg.packageId)).toBe('VALIDATED');

    const receipt = await adapter.publishPackage({
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'AUTH_27',
      targetScope: 'GLOBAL',
    });
    expect(receipt.publicationSequenceNumber).toBe(1);
    expect(await adapter.getPackageLifecycleState(pkg.packageId)).toBe('PUBLISHED');
  });

  // SCEN-2D8-28: Attempting to mutate event row throws ImmutabilityViolationError
  it('SCEN-2D8-28: Attempting to mutate or delete event rows throws ImmutabilityViolationError', async () => {
    const q = createCandidate({ candidateId: 'c28', physicalInstanceId: 'inst28' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    const { persistenceEvent } = await adapter.persistPackage(pkg);

    await expect(adapter.attemptMutateEventRow(persistenceEvent.eventId)).rejects.toThrow(
      ImmutabilityViolationError
    );
  });

  // SCEN-2D8-29: Tampered HMAC signature verification fails
  it('SCEN-2D8-29: Tampered HMAC signature fails cryptographic verification', async () => {
    const q = createCandidate({ candidateId: 'c29', physicalInstanceId: 'inst29' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    const receipt = await adapter.publishPackage({
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'AUTH_29',
      targetScope: 'GLOBAL',
    });
    expect(adapter.verifyReceiptSignature(receipt)).toBe(true);

    const tamperedReceipt = { ...receipt, hmacSignature: 'tampered_signature_hex_0000000000000000' };
    expect(adapter.verifyReceiptSignature(tamperedReceipt)).toBe(false);
  });

  // SCEN-2D8-30: Full roundtrip reconstruction dual-seal parity under permuted rows
  it('SCEN-2D8-30: Full roundtrip reconstruction proves bit-for-bit identity and seal parity under permuted rows in DB', async () => {
    const q1 = createCandidate({ candidateId: 'c30_1', physicalInstanceId: 'inst30_1', sourceQuestionNumber: '1' });
    const q2 = createCandidate({ candidateId: 'c30_2', physicalInstanceId: 'inst30_2', sourceQuestionNumber: '2' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1, q2]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    // Reconstruct and verify dual seals
    await adapter.tamperShuffleChildRows(pkg.packageId);
    const reconstructed = await adapter.reconstructPackage(pkg.packageId);
    const derivedId = derivePackageId({
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
    const derivedSeal = computePackageIntegritySeal({
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

    expect(derivedId).toBe(pkg.packageId);
    expect(derivedSeal).toBe(pkg.packageIntegritySeal);
  });
});
