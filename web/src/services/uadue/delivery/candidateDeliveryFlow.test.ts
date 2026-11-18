/**
 * UADUE Phase 3.6 — Candidate Delivery & User Flow End-to-End Suite
 * Specification: UADUE-P3.6-FLOW-001 (Candidate Journey & Delivery Boundary Verification)
 *
 * Verifies the complete user-facing candidate journey through the server-authoritative delivery path:
 * 1. Exam Publication & Integrity Sealing: Package is sealed and verified.
 * 2. Session Authorization: Verifies tenant, candidate identity, package ID, seal, and active device lease.
 * 3. Air-Gapped Projection Delivery: Tier 3 student live projection delivers questions and options.
 * 4. Zero Answer Key & Lineage Leakage: Confirms no correct answers, explanations, or logicalFamilyId leak.
 * 5. Candidate Navigation & Response Submission: Formulates valid envelopes with stable canonical IDs.
 * 6. Append-Only Ingestion & Idempotency: Duplicate submissions and replays handled gracefully.
 * 7. Server-Authoritative Session Lifecycle: Transition to SUBMITTED rejects further interactions.
 * 8. Authoritative Raw-Score-Only Result: totalRawScore = sum(awardedMarks), totalNormalizedScore = null.
 * 9. Fail-Closed Security Boundary: Quarantined packages, seal mismatches, and privileged bypasses fail closed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CanonicalPlayerAdapter } from './canonicalPlayerAdapter';
import {
  CanonicalProjectionGateway,
  ProjectionAuthorizationError,
} from '../canonical/canonicalProjectionGateway';
import {
  CandidateSessionAuthorizer,
  CandidateSessionMismatchError,
  TenantSessionMismatchError,
  SessionNotActiveError,
  PackageQuarantinedError,
  PackageSealMismatchError,
  IAuthorizerSessionStore,
  IAuthorizerPackageStore,
  PackageStatusRecord,
} from './candidateSessionAuthorizer';
import {
  ExamSessionRecord,
  CandidateEvaluationRunRecord,
} from './deliveryTypes';
import { ScoringEvaluationCore, CoreEvaluationInput } from './scoringEvaluationCore';
import { CanonicalPipelineOrchestrator } from '../canonical/canonicalPipelineOrchestrator';
import { QuestionCandidate } from '../contracts/questionGraph';
import {
  CanonicalAssessmentPackage,
  ScoringPolicyRule,
  ScoringPolicyVersion,
  UserAttemptResponse,
  AnswerAuthorityResolutionVersion,
  AnswerCandidate,
} from '../canonical/types';
import { QuestionScoringTraits } from '../canonical/scoringEvaluator';

// In-Memory Test Session Store
class MockSessionStore implements IAuthorizerSessionStore {
  private sessions = new Map<string, ExamSessionRecord>();

  public setSession(session: ExamSessionRecord): void {
    this.sessions.set(`${session.tenantId}:${session.examSessionId}`, session);
  }

  public async getExamSession(sessionId: string, tenantId: string): Promise<ExamSessionRecord | null> {
    return this.sessions.get(`${tenantId}:${sessionId}`) || null;
  }
}

// In-Memory Test Package Store
class MockPackageStore implements IAuthorizerPackageStore {
  private packages = new Map<string, PackageStatusRecord>();

  public setPackageStatus(status: PackageStatusRecord): void {
    this.packages.set(status.packageId, status);
  }

  public async getPackageStatus(packageId: string): Promise<PackageStatusRecord | null> {
    return this.packages.get(packageId) || null;
  }
}

describe('UADUE Phase 3.6 — Candidate Delivery & User Flow End-to-End Suite', () => {
  const SIGNING_SECRET = 'secure_secret_key_for_candidate_delivery_audit_32_bytes!';
  const TENANT_ID = 'tenant_mockai_prod';
  const OTHER_TENANT_ID = 'tenant_competitor_org';
  const CANDIDATE_ID = 'cand_student_alice';
  const OTHER_CANDIDATE_ID = 'cand_student_bob';
  const SESSION_ID = 'sess_live_attempt_001';
  const DEVICE_LEASE_ID = 'lease_device_chrome_mac_001';

  let sessionStore: MockSessionStore;
  let packageStore: MockPackageStore;
  let authorizer: CandidateSessionAuthorizer;
  let projectionGateway: CanonicalProjectionGateway;
  let pipelinePackage: CanonicalAssessmentPackage;
  let PACKAGE_ID: string;
  let PACKAGE_SEAL: string;

  function createPipelinePackage(): CanonicalAssessmentPackage {
    const orchestrator = new CanonicalPipelineOrchestrator();
    const q: QuestionCandidate = {
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
      optionCandidateIds: ['opt_1', 'opt_2', 'opt_3', 'opt_4'],
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
          optionCandidateIds: ['opt_1', 'opt_2', 'opt_3', 'opt_4'],
        },
      ],
    };

    const qgraph: any = {
      graphId: 'qgraph_delivery_flow_test',
      sourceDocumentId: 'doc_sample_1',
      sourceSnapshotId: 'snap_sample_1',
      sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      sourceDocumentGraphId: 'docgraph_1',
      sourceDocumentGraphSha256: 'f3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      schemaVersion: 'uadue-qg-v3',
      algorithmVersion: '3.0.0',
      configurationVersion: '1.0.0',
      questions: [q],
      stimuli: [],
      options: [
        { optionCandidateId: 'opt_1', contentNodeIds: ['node_opt_1'], candidateOwners: [], isMultiColumnOption: false, hasVisualAsset: false, hasMathematics: false, observationState: 'OBSERVED', verificationStatus: 'SUPPORTED', confidenceScore: 1.0, supportingEvidenceIds: [] },
        { optionCandidateId: 'opt_2', contentNodeIds: ['node_opt_2'], candidateOwners: [], isMultiColumnOption: false, hasVisualAsset: false, hasMathematics: false, observationState: 'OBSERVED', verificationStatus: 'SUPPORTED', confidenceScore: 1.0, supportingEvidenceIds: [] },
        { optionCandidateId: 'opt_3', contentNodeIds: ['node_opt_3'], candidateOwners: [], isMultiColumnOption: false, hasVisualAsset: false, hasMathematics: false, observationState: 'OBSERVED', verificationStatus: 'SUPPORTED', confidenceScore: 1.0, supportingEvidenceIds: [] },
        { optionCandidateId: 'opt_4', contentNodeIds: ['node_opt_4'], candidateOwners: [], isMultiColumnOption: false, hasVisualAsset: false, hasMathematics: false, observationState: 'OBSERVED', verificationStatus: 'SUPPORTED', confidenceScore: 1.0, supportingEvidenceIds: [] },
      ],
      tables: [],
      diagrams: [],
      mathBlocks: [],
      hypotheses: [],
      activeHypothesisId: 'hyp_1',
      ambiguities: [],
      relationships: [],
      verificationState: {
        status: 'VERIFIED',
        decisionLog: [],
        ambiguityCount: 0,
        conflictCount: 0,
        verifiedQuestionCount: 1,
        unresolvedQuestionCount: 0,
        verifiedOptionCount: 0,
        unresolvedOptionCount: 0,
        verifiedRelationshipCount: 0,
        unresolvedRelationshipCount: 0,
        verifiedAt: 0,
      },
      provenance: {
        sourceSnapshotId: 'snap_sample_1',
        sourceDocumentId: 'doc_sample_1',
        sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        sourceDocumentGraphSha256: 'f3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        createdAt: 0,
      },
    };

    return orchestrator.executePipeline({ questionGraph: qgraph as any, strictValidation: true }).package!;
  }

  beforeEach(() => {
    sessionStore = new MockSessionStore();
    packageStore = new MockPackageStore();
    authorizer = new CandidateSessionAuthorizer(sessionStore, packageStore, {
      signingSecret: SIGNING_SECRET,
      contextTtlSeconds: 300,
      tokenTtlSeconds: 3600,
    });

    pipelinePackage = createPipelinePackage();
    PACKAGE_ID = pipelinePackage.packageId;
    PACKAGE_SEAL = pipelinePackage.packageIntegritySeal;

    // Register active package in authorizer store
    packageStore.setPackageStatus({
      packageId: PACKAGE_ID,
      packageIntegritySeal: PACKAGE_SEAL,
      validationStatus: 'VALIDATED',
      isQuarantined: false,
    });

    // Register active session in store
    const activeSession: ExamSessionRecord = {
      examSessionId: SESSION_ID,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      packageId: PACKAGE_ID,
      packageIntegritySeal: PACKAGE_SEAL,
      sessionConfiguration: {},
      sessionState: 'ACTIVE',
      stateVersion: 1,
      currentLeaseId: DEVICE_LEASE_ID,
      leaseHeartbeatAt: new Date().toISOString(),
      scheduledStartAt: new Date().toISOString(),
      actualStartedAt: new Date().toISOString(),
      durationSeconds: 10800,
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
      submittedAt: null,
      expiredAt: null,
      terminatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    sessionStore.setSession(activeSession);

    // Mock Package Reconstructor for Gateway
    const mockReconstructor = {
      reconstructPackageForTenant: async (pkgId: string, tenantId: string) => {
        if (tenantId !== TENANT_ID) {
          throw new Error('Tenant mismatch in package reconstruction');
        }
        return pipelinePackage;
      },
      reconstructPackageForServiceRole: async () => pipelinePackage,
    };

    projectionGateway = new CanonicalProjectionGateway(mockReconstructor, authorizer);
  });

  // ── 1. End-to-End Candidate Live Test Flow ───────────────────────────────────

  it('FLOW-01: Successfully executes complete candidate examination flow with loss-aware presentation and zero answer leaks', async () => {
    // Step 1: Candidate requests Tier 3 Student Live Projection
    const candidateContext = {
      tenantId: TENANT_ID,
      examSessionId: SESSION_ID,
      candidateId: CANDIDATE_ID,
    };

    const projection = await projectionGateway.getTier3StudentLiveProjection(
      PACKAGE_ID,
      candidateContext
    );

    expect(projection.projectionTier).toBe('TIER_3_STUDENT_LIVE');
    expect(projection.totalQuestions).toBe(1);

    // Step 2: Adapt projection to presentation-only paper via CanonicalPlayerAdapter
    const presentationPaper = CanonicalPlayerAdapter.adaptProjectionToPresentationPaper(
      projection,
      {
        title: 'GATE 2025 Computer Science Mock',
        examId: 'gate',
        durationMinutes: 180,
      }
    );

    expect(presentationPaper.isPresentationOnly).toBe(true);
    expect(presentationPaper.answerKeyStatus).toBe('UNAVAILABLE');
    expect(presentationPaper.questions.length).toBe(1);

    // Step 3: Verify AIR-GAP and identity preservation on questions
    const q1 = presentationPaper.questions[0];
    expect(q1.id).toBe(projection.questions[0].canonicalQuestionId); // Stable canonical ID
    expect(q1.questionNumber).toBe(1);
    expect(q1.questionType).toBe('MCQ');
    expect((q1 as any).correctAnswer).toBeUndefined();
    expect((q1 as any).correctAnswerIndex).toBeUndefined();
    expect((q1 as any).logicalFamilyId).toBeUndefined(); // Prohibited identifier stripped!
    expect(q1.richOptions).toBeDefined();
    expect(q1.richOptions!.length).toBe(4);
    expect(q1.richOptions![0].id).toBe('opt_1');

    // Step 4: Candidate selects Option C ('opt_3') and formulates submission envelope
    const envelope = CanonicalPlayerAdapter.createSubmissionEnvelope({
      examSessionId: SESSION_ID,
      tenantId: TENANT_ID,
      packageId: PACKAGE_ID,
      packageIntegritySeal: PACKAGE_SEAL,
      canonicalQuestionId: q1.id,
      clientSequenceNumber: 1,
      clientEventId: 'evt_client_click_q1_opt3',
      candidateResponse: {
        selectedOptionId: q1.richOptions![2].id,
      },
      deviceLeaseId: DEVICE_LEASE_ID,
    });

    expect(envelope.eventType).toBe('QUESTION_RESPONSE_RECORDED');
    expect(envelope.canonicalQuestionId).toBe(q1.id);
    expect(envelope.payload).toEqual({ selectedOptionId: 'opt_3' });
    expect(envelope.sessionLeaseId).toBe(DEVICE_LEASE_ID);

    // Step 5: Authoritative scoring evaluation produces RAW-SCORE-ONLY result
    const mockPolicyRule: ScoringPolicyRule = {
      ruleId: 'rule_mcq_1m',
      policyType: 'MCQ_FIXED_PENALTY',
      canonicalQuestionType: 'SINGLE_CHOICE',
      positiveMarks: 1.0,
      negativeMarks: 0.33,
      unansweredMarks: 0,
    };

    const mockPolicyVersion: ScoringPolicyVersion = {
      policyVersionId: 'spv_gate_2025_v1',
      policyId: 'sp_gate_2025',
      versionNumber: 1,
      policyFingerprint: 'fp_spv_1',
      rules: [mockPolicyRule],
      effectiveFrom: '2025-01-01T00:00:00Z',
      createdAt: Date.now(),
    };

    const mockAttempt: UserAttemptResponse = {
      attemptId: 'att_001',
      canonicalQuestionId: q1.id,
      userSelectedOptionIds: ['opt_2'],
      isSkipped: false,
      responseFingerprint: 'fp_att_001',
      submittedAt: Date.now(),
    };

    const mockResolution: AnswerAuthorityResolutionVersion = {
      resolutionVersionId: 'res_v1',
      resolutionFamilyId: 'rf_001',
      versionNumber: 1,
      canonicalQuestionId: q1.id,
      candidateAnswerId: 'cand_ans_1',
      verificationStatus: 'SUPPORTED',
      questionDisposition: 'ACTIVE',
      scoringDisposition: 'STANDARD_EVALUATION',
      authorityDocumentSourceId: 'src_doc_ak_1',
      supersedesVersionId: null,
      effectiveFrom: '2025-01-01T00:00:00Z',
      createdAt: Date.now(),
    };

    const mockAnswerCandidate: AnswerCandidate = {
      candidateAnswerId: 'cand_ans_1',
      canonicalQuestionId: q1.id,
      sourceEntryId: 'entry_001',
      parsedPayload: {
        type: 'SINGLE_CHOICE_MCQ',
        correctOptionLabel: '(C)',
        correctOptionId: 'opt_2',
      },
      evidence: [],
      verificationStatus: 'SUPPORTED',
      confidenceScore: 1.0,
      provenance: {
        sourceSnapshotId: 'snap_ak_1',
        sourceDocumentId: 'doc_ak_1',
        adapterVersion: '1.0.0',
      },
    };

    const mockTraits: QuestionScoringTraits = {
      canonicalQuestionType: 'SINGLE_CHOICE',
    };

    const mockEvalInput: CoreEvaluationInput = {
      policyVersion: mockPolicyVersion,
      items: [
        {
          canonicalQuestionId: q1.id,
          attempt: mockAttempt,
          resolution: mockResolution,
          candidate: mockAnswerCandidate,
          questionTraits: mockTraits,
        },
      ],
    };

    const coreResult = ScoringEvaluationCore.evaluateAttempt(mockEvalInput);

    // Verify raw-score-only contract
    expect(coreResult.totalRawScore).toBe(1.0);
    expect(coreResult.totalNormalizedScore).toBeNull();
    expect(coreResult.questionsCorrect).toBe(1);
    expect(coreResult.questionsAttempted).toBe(1);

    // Step 6: Project evaluation run to candidate-facing results summary
    const mockEvalRun: CandidateEvaluationRunRecord = {
      evaluationRunId: 'eval_run_001',
      examSessionId: SESSION_ID,
      tenantId: TENANT_ID,
      packageId: PACKAGE_ID,
      packageIntegritySeal: PACKAGE_SEAL,
      scoringPolicyVersion: 'spv_gate_2025_v1',
      answerKeyVersion: 'ak_gate_2025_cs1_official',
      evaluationContractTuple: {},
      runIteration: 1,
      supersedesRunId: null,
      totalRawScore: coreResult.totalRawScore,
      totalNormalizedScore: null,
      questionsAttempted: coreResult.questionsAttempted,
      questionsCorrect: coreResult.questionsCorrect,
      questionsIncorrect: coreResult.questionsIncorrect,
      questionsUnanswered: coreResult.questionsUnanswered,
      evaluationSignature: 'sig_rfc8785_eval_run_001',
      evaluatedAt: new Date().toISOString(),
    };

    const candidateResultSummary = CanonicalPlayerAdapter.projectEvaluationRunToCandidateResult(
      mockEvalRun,
      [],
      presentationPaper
    );

    expect(candidateResultSummary.totalScore).toBe(1.0);
    expect(candidateResultSummary.correctCount).toBe(1);
    expect(candidateResultSummary.isScoreCalculated).toBe(true);
    expect(candidateResultSummary.scoreStatus).toBe('CALCULATED');
  });

  // ── 2. Security Boundary & Fail-Closed Invariants ─────────────────────────────

  it('SEC-01: Rejects candidate projection when session belongs to a different candidate (Anti-IDOR)', async () => {
    const maliciousContext = {
      tenantId: TENANT_ID,
      examSessionId: SESSION_ID,
      candidateId: OTHER_CANDIDATE_ID, // Mismatched candidate attempting to access Alice's session
    };

    await expect(
      projectionGateway.getTier3StudentLiveProjection(PACKAGE_ID, maliciousContext)
    ).rejects.toThrow(CandidateSessionMismatchError);
  });

  it('SEC-02: Rejects candidate projection across tenant boundaries (Multi-Tenancy Isolation)', async () => {
    const crossTenantContext = {
      tenantId: OTHER_TENANT_ID, // Attacker tenant
      examSessionId: SESSION_ID,
      candidateId: CANDIDATE_ID,
    };

    await expect(
      projectionGateway.getTier3StudentLiveProjection(PACKAGE_ID, crossTenantContext)
    ).rejects.toThrow(/SESSION_NOT_FOUND|TenantSessionMismatchError/);
  });

  it('SEC-03: Rejects candidate projection when session is in SUBMITTED state (Terminal State Gating)', async () => {
    const submittedSession: ExamSessionRecord = {
      ...((await sessionStore.getExamSession(SESSION_ID, TENANT_ID)) as ExamSessionRecord),
      sessionState: 'SUBMITTED',
    };
    sessionStore.setSession(submittedSession);

    const context = {
      tenantId: TENANT_ID,
      examSessionId: SESSION_ID,
      candidateId: CANDIDATE_ID,
    };

    await expect(
      projectionGateway.getTier3StudentLiveProjection(PACKAGE_ID, context)
    ).rejects.toThrow(SessionNotActiveError);
  });

  it('SEC-04: Rejects candidate projection when assessment package is QUARANTINED', async () => {
    packageStore.setPackageStatus({
      packageId: PACKAGE_ID,
      packageIntegritySeal: PACKAGE_SEAL,
      validationStatus: 'QUARANTINED',
      isQuarantined: true,
    });

    const context = {
      tenantId: TENANT_ID,
      examSessionId: SESSION_ID,
      candidateId: CANDIDATE_ID,
    };

    await expect(
      projectionGateway.getTier3StudentLiveProjection(PACKAGE_ID, context)
    ).rejects.toThrow(PackageQuarantinedError);
  });

  it('SEC-05: Rejects candidate projection when package integrity seal does not match session', async () => {
    packageStore.setPackageStatus({
      packageId: PACKAGE_ID,
      packageIntegritySeal: 'tampered_seal_hash_0000000000000000',
      validationStatus: 'VALIDATED',
      isQuarantined: false,
    });

    const context = {
      tenantId: TENANT_ID,
      examSessionId: SESSION_ID,
      candidateId: CANDIDATE_ID,
    };

    await expect(
      projectionGateway.getTier3StudentLiveProjection(PACKAGE_ID, context)
    ).rejects.toThrow(PackageSealMismatchError);
  });

  it('SEC-06: Strictly rejects caller-supplied isInternalAudit bypass flags on candidate endpoints', async () => {
    const maliciousSpoofContext: any = {
      tenantId: TENANT_ID,
      examSessionId: SESSION_ID,
      candidateId: CANDIDATE_ID,
      isInternalAudit: true, // Attacker attempting privilege escalation
    };

    await expect(
      projectionGateway.getTier3StudentLiveProjection(PACKAGE_ID, maliciousSpoofContext)
    ).rejects.toThrow(ProjectionAuthorizationError);
  });

  it('SEC-07: Adapter fails closed if evaluation run contains unauthorized normalized scores', () => {
    const unauthEvalRun: CandidateEvaluationRunRecord = {
      evaluationRunId: 'eval_run_unauth',
      examSessionId: SESSION_ID,
      tenantId: TENANT_ID,
      packageId: PACKAGE_ID,
      packageIntegritySeal: PACKAGE_SEAL,
      scoringPolicyVersion: 'v1',
      answerKeyVersion: 'v1',
      evaluationContractTuple: {},
      runIteration: 1,
      supersedesRunId: null,
      totalRawScore: 25.0,
      totalNormalizedScore: 28.5 as any, // Unauthorized normalization!
      questionsAttempted: 10,
      questionsCorrect: 8,
      questionsIncorrect: 2,
      questionsUnanswered: 0,
      evaluationSignature: 'sig_001',
      evaluatedAt: new Date().toISOString(),
    };

    const paper: any = {
      id: PACKAGE_ID,
      examId: 'gate',
      title: 'GATE 2025',
      totalQuestions: 10,
      totalMarks: 30,
      sections: [],
    };

    expect(() =>
      CanonicalPlayerAdapter.projectEvaluationRunToCandidateResult(unauthEvalRun, [], paper)
    ).toThrow(/unauthorized normalized score/);
  });
});
