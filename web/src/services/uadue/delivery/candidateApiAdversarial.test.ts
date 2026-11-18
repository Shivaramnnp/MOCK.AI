/**
 * UADUE Phase 3.6 — Candidate Delivery API Adversarial & Security Test Battery
 * Specification: UADUE-P3.6-API-001 (Server-Authoritative Boundary & Adversarial Rejection)
 *
 * Verifies that CandidateDeliveryApi and CandidateApiClient strictly enforce:
 * 1. Authentication & Tenant/Candidate Isolation across all 6 endpoints.
 * 2. Defense against IDOR and Cross-Tenant Session Hijacking.
 * 3. Package Integrity, Quarantine Enforcement, and Seal Matching.
 * 4. Device Lease Verification and Monotonic Client Event Tracking.
 * 5. Lifecycle Transition Enforcement (ACTIVE -> PAUSED -> ACTIVE -> SUBMITTED).
 * 6. Idempotency on Answer Recording and Terminal Attempt Submission.
 * 7. Air-gapped Candidate Presentation (Zero Answer Keys, Zero Explanations).
 * 8. Authoritative Raw-Score-Only Projection (totalNormalizedScore = null).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CandidateDeliveryApi,
  CandidateApiError,
  AuthenticatedPrincipal,
  ICandidateDeliveryBackend,
} from './candidateDeliveryApi';
import { CandidateApiClient } from './candidateApiClient';
import {
  CandidateSessionAuthorizer,
  CandidateSessionMismatchError,
  SessionNotActiveError,
  PackageQuarantinedError,
  PackageSealMismatchError,
  IAuthorizerSessionStore,
  IAuthorizerPackageStore,
  PackageStatusRecord,
} from './candidateSessionAuthorizer';
import { CanonicalProjectionGateway } from '../canonical/canonicalProjectionGateway';
import { CanonicalPipelineOrchestrator } from '../canonical/canonicalPipelineOrchestrator';
import { ExamSessionRecord } from './deliveryTypes';
import { QuestionCandidate } from '../contracts/questionGraph';
import {
  CanonicalAssessmentPackage,
  ScoringPolicyRule,
  ScoringPolicyVersion,
  AnswerAuthorityResolutionVersion,
  AnswerCandidate,
  UserAttemptResponse,
} from '../canonical/types';
import { QuestionScoringTraits } from '../canonical/scoringEvaluator';
import { CoreEvaluationInput } from './scoringEvaluationCore';

// In-Memory Test Session Store
class MockSessionStore implements IAuthorizerSessionStore {
  public sessions = new Map<string, ExamSessionRecord>();

  public setSession(session: ExamSessionRecord): void {
    this.sessions.set(`${session.tenantId}:${session.examSessionId}`, { ...session });
  }

  public async saveExamSession(session: ExamSessionRecord): Promise<void> {
    this.setSession(session);
  }

  public async getExamSession(sessionId: string, tenantId: string): Promise<ExamSessionRecord | null> {
    const session = this.sessions.get(`${tenantId}:${sessionId}`);
    return session ? { ...session } : null;
  }
}

// In-Memory Test Package Store
class MockPackageStore implements IAuthorizerPackageStore {
  public packages = new Map<string, PackageStatusRecord>();

  public setPackageStatus(status: PackageStatusRecord): void {
    this.packages.set(status.packageId, { ...status });
  }

  public async getPackageStatus(packageId: string): Promise<PackageStatusRecord | null> {
    const pkg = this.packages.get(packageId);
    return pkg ? { ...pkg } : null;
  }
}

describe('UADUE Phase 3.6 — Candidate Delivery API Adversarial & Security Battery', () => {
  const SIGNING_SECRET = 'uat_test_api_signing_secret_32_bytes_strict_key!';
  const TENANT_A = 'tenant_mockai_prod';
  const TENANT_B = 'tenant_rogue_adversary';
  const CANDIDATE_A = 'cand_student_alice';
  const CANDIDATE_B = 'cand_attacker_bob';
  const SESSION_ID = 'sess_live_secure_001';
  const DEVICE_LEASE_A = 'lease_trusted_mac_001';
  const DEVICE_LEASE_B = 'lease_imposter_mac_999';

  let sessionStore: MockSessionStore;
  let packageStore: MockPackageStore;
  let authorizer: CandidateSessionAuthorizer;
  let projectionGateway: CanonicalProjectionGateway;
  let backend: ICandidateDeliveryBackend;
  let deliveryApi: CandidateDeliveryApi;
  let pipelinePackage: CanonicalAssessmentPackage;
  let PACKAGE_ID: string;
  let PACKAGE_SEAL: string;
  let CANONICAL_QUESTION_ID: string;

  function createPipelinePackage(): CanonicalAssessmentPackage {
    const orchestrator = new CanonicalPipelineOrchestrator();
    const q: QuestionCandidate = {
      candidateId: 'cand_adversarial_q1',
      physicalInstanceId: 'inst_q1',
      candidateDisplayOrder: 1,
      sourceOrder: 1,
      startPageNumber: 1,
      endPageNumber: 1,
      isMultiPage: false,
      identityCandidate: {
        physicalInstanceId: 'inst_q1',
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
      graphId: 'qgraph_api_adversarial_test',
      sourceDocumentId: 'doc_math_01',
      sourceSnapshotId: 'snap_math_01',
      sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      sourceDocumentGraphId: 'docgraph_01',
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
        sourceSnapshotId: 'snap_math_01',
        sourceDocumentId: 'doc_math_01',
        sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        sourceDocumentGraphSha256: 'f3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        createdAt: 0,
      },
    };

    return orchestrator.executePipeline({ questionGraph: qgraph, strictValidation: true }).package!;
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
    CANONICAL_QUESTION_ID = pipelinePackage.canonicalQuestions[0].canonicalQuestionId;

    packageStore.setPackageStatus({
      packageId: PACKAGE_ID,
      packageIntegritySeal: PACKAGE_SEAL,
      validationStatus: 'VALIDATED',
      isQuarantined: false,
    });

    const activeSession: ExamSessionRecord = {
      examSessionId: SESSION_ID,
      tenantId: TENANT_A,
      candidateId: CANDIDATE_A,
      packageId: PACKAGE_ID,
      packageIntegritySeal: PACKAGE_SEAL,
      sessionConfiguration: {},
      sessionState: 'ACTIVE',
      stateVersion: 1,
      currentLeaseId: DEVICE_LEASE_A,
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

    const mockReconstructor = {
      reconstructPackageForTenant: async (pkgId: string, tenantId: string) => {
        if (tenantId !== TENANT_A) {
          throw new Error('Tenant mismatch in package reconstruction');
        }
        return pipelinePackage;
      },
      reconstructPackageForServiceRole: async () => pipelinePackage,
    };

    projectionGateway = new CanonicalProjectionGateway(mockReconstructor, authorizer);

    backend = {
      sessionStore,
      packageStore,
      authorizer,
      projectionGateway,
    };

    deliveryApi = new CandidateDeliveryApi(backend, { signingSecret: SIGNING_SECRET });
  });

  // ── Endpoint 1: Initialize / Resume Session ──────────────────────────────

  it('API-AUTH-01: Rejects unauthenticated request on session initialization', async () => {
    const unauth: AuthenticatedPrincipal = { candidateId: '', tenantId: '' };
    await expect(
      deliveryApi.initializeOrResumeSession(
        { packageId: PACKAGE_ID, deviceLeaseId: DEVICE_LEASE_A },
        unauth
      )
    ).rejects.toThrow(CandidateApiError);
  });

  it('API-INIT-02: Rejects initialization when assessment package is QUARANTINED', async () => {
    packageStore.setPackageStatus({
      packageId: 'pkg_quarantined_01',
      packageIntegritySeal: 'seal_quarantined',
      validationStatus: 'QUARANTINED',
      isQuarantined: true,
    });

    await expect(
      deliveryApi.initializeOrResumeSession(
        { packageId: 'pkg_quarantined_01', deviceLeaseId: DEVICE_LEASE_A },
        { candidateId: CANDIDATE_A, tenantId: TENANT_A }
      )
    ).rejects.toThrow(PackageQuarantinedError);
  });

  it('API-INIT-03: Rejects resume when existing session is in terminal state SUBMITTED', async () => {
    const submittedSession: ExamSessionRecord = {
      examSessionId: 'sess_already_submitted',
      tenantId: TENANT_A,
      candidateId: CANDIDATE_A,
      packageId: PACKAGE_ID,
      packageIntegritySeal: PACKAGE_SEAL,
      sessionConfiguration: {},
      sessionState: 'SUBMITTED',
      stateVersion: 2,
      currentLeaseId: DEVICE_LEASE_A,
      leaseHeartbeatAt: new Date().toISOString(),
      scheduledStartAt: new Date().toISOString(),
      actualStartedAt: new Date().toISOString(),
      durationSeconds: 10800,
      accumulatedPauseSeconds: 0,
      submittedAt: new Date().toISOString(),
      expiredAt: null,
      terminatedAt: null,
      pauseCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    sessionStore.setSession(submittedSession);

    await expect(
      deliveryApi.initializeOrResumeSession(
        {
          packageId: PACKAGE_ID,
          examSessionId: 'sess_already_submitted',
          deviceLeaseId: DEVICE_LEASE_A,
        },
        { candidateId: CANDIDATE_A, tenantId: TENANT_A }
      )
    ).rejects.toThrow(/SESSION_TERMINAL/);
  });

  it('API-INIT-04: Successfully initializes new session and binds device lease with signed token', async () => {
    const res = await deliveryApi.initializeOrResumeSession(
      { packageId: PACKAGE_ID, deviceLeaseId: 'lease_new_tablet_42' },
      { candidateId: 'cand_new_student', tenantId: TENANT_A }
    );

    expect(res.examSessionId).toBeDefined();
    expect(res.sessionState).toBe('ACTIVE');
    expect(res.currentLeaseId).toBe('lease_new_tablet_42');
    expect(res.sessionToken).toBeDefined();

    // Verify token can authenticate
    const verified = await authorizer.verifyCandidateToken(res.sessionToken);
    expect(verified.candidateId).toBe('cand_new_student');
    expect(verified.tenantId).toBe(TENANT_A);
  });

  // ── Endpoint 2: Get Air-Gapped Live Exam Projection ───────────────────────

  it('API-PROJ-01: Rejects projection retrieval when requested by mismatched candidate (Anti-IDOR)', async () => {
    await expect(
      deliveryApi.getLiveExamProjection(
        { examSessionId: SESSION_ID },
        { candidateId: CANDIDATE_B, tenantId: TENANT_A }
      )
    ).rejects.toThrow(CandidateSessionMismatchError);
  });

  it('API-PROJ-02: Rejects projection retrieval across tenant boundaries', async () => {
    await expect(
      deliveryApi.getLiveExamProjection(
        { examSessionId: SESSION_ID },
        { candidateId: CANDIDATE_A, tenantId: TENANT_B }
      )
    ).rejects.toThrow(/SESSION_NOT_FOUND/);
  });

  it('API-PROJ-03: Rejects projection retrieval when package seal is tampered with', async () => {
    packageStore.setPackageStatus({
      packageId: PACKAGE_ID,
      packageIntegritySeal: 'tampered_rogue_seal_hash',
      validationStatus: 'VALIDATED',
      isQuarantined: false,
    });

    await expect(
      deliveryApi.getLiveExamProjection(
        { examSessionId: SESSION_ID },
        { candidateId: CANDIDATE_A, tenantId: TENANT_A }
      )
    ).rejects.toThrow(PackageSealMismatchError);
  });

  it('API-PROJ-04: Delivers clean air-gapped presentation with zero answers or logicalFamilyId', async () => {
    const res = await deliveryApi.getLiveExamProjection(
      { examSessionId: SESSION_ID },
      { candidateId: CANDIDATE_A, tenantId: TENANT_A }
    );

    expect(res.paper).toBeDefined();
    expect(res.paper.questions.length).toBeGreaterThan(0);
    const q = res.paper.questions[0];

    // Verify air-gap
    expect((q as any).correctAnswer).toBeUndefined();
    expect((q as any).correctOptionCandidateId).toBeUndefined();
    expect((q as any).explanation).toBeUndefined();
    expect((q as any).logicalFamilyId).toBeUndefined();
    expect((q as any).answerKey).toBeUndefined();

    for (const opt of q.options) {
      expect((opt as any).isCorrect).toBeUndefined();
      expect((opt as any).weight).toBeUndefined();
    }
  });

  // ── Endpoint 3: Record Candidate Answer Selection ─────────────────────────

  it('API-ANS-01: Rejects answer selection from mismatched device lease', async () => {
    await expect(
      deliveryApi.recordAnswerSelection(
        {
          examSessionId: SESSION_ID,
          canonicalQuestionId: 'cand_adversarial_q1',
          selectedOptionId: 'opt_1',
          deviceLeaseId: DEVICE_LEASE_B, // Mismatched device lease
          clientSequenceNumber: 1,
          clientEventId: 'evt_ans_001',
          clientTimestampIso: new Date().toISOString(),
        },
        { candidateId: CANDIDATE_A, tenantId: TENANT_A }
      )
    ).rejects.toThrow(/LEASE_MISMATCH/);
  });

  it('API-ANS-02: Rejects answer selection with invalid canonicalQuestionId', async () => {
    await expect(
      deliveryApi.recordAnswerSelection(
        {
          examSessionId: SESSION_ID,
          canonicalQuestionId: 'non_existent_question_999',
          selectedOptionId: 'opt_1',
          deviceLeaseId: DEVICE_LEASE_A,
          clientSequenceNumber: 1,
          clientEventId: 'evt_ans_002',
          clientTimestampIso: new Date().toISOString(),
        },
        { candidateId: CANDIDATE_A, tenantId: TENANT_A }
      )
    ).rejects.toThrow(/INVALID_QUESTION/);
  });

  it('API-ANS-03: Successfully records selection and enforces idempotency on duplicate event', async () => {
    const res1 = await deliveryApi.recordAnswerSelection(
      {
        examSessionId: SESSION_ID,
        canonicalQuestionId: CANONICAL_QUESTION_ID,
        selectedOptionId: 'opt_2',
        deviceLeaseId: DEVICE_LEASE_A,
        clientSequenceNumber: 1,
        clientEventId: 'evt_idempotent_01',
        clientTimestampIso: new Date().toISOString(),
      },
      { candidateId: CANDIDATE_A, tenantId: TENANT_A }
    );

    expect(res1.status).toBe('ACCEPTED');
    expect(res1.receipt.validationStatus).toBe('ACCEPTED');
    expect(res1.receipt.canonicalQuestionId).toBe(CANONICAL_QUESTION_ID);
    expect(res1.receipt.serverTimestamp).toBeDefined();

    // Replay identical event
    const res2 = await deliveryApi.recordAnswerSelection(
      {
        examSessionId: SESSION_ID,
        canonicalQuestionId: CANONICAL_QUESTION_ID,
        selectedOptionId: 'opt_2',
        deviceLeaseId: DEVICE_LEASE_A,
        clientSequenceNumber: 1,
        clientEventId: 'evt_idempotent_01',
        clientTimestampIso: new Date().toISOString(),
      },
      { candidateId: CANDIDATE_A, tenantId: TENANT_A }
    );

    expect(res2.status).toBe('ACCEPTED');
    expect(res2.receipt.receiptId).toBe(res1.receipt.receiptId);
  });

  // ── Endpoint 4: Pause & Resume Session ───────────────────────────────────

  it('API-LIFECYCLE-01: Successfully pauses and resumes session', async () => {
    const pauseRes = await deliveryApi.pauseSession(
      { examSessionId: SESSION_ID },
      { candidateId: CANDIDATE_A, tenantId: TENANT_A }
    );
    expect(pauseRes.sessionState).toBe('PAUSED');

    // Attempting to record answers while paused must fail
    await expect(
      deliveryApi.recordAnswerSelection(
        {
          examSessionId: SESSION_ID,
          canonicalQuestionId: CANONICAL_QUESTION_ID,
          selectedOptionId: 'opt_1',
          deviceLeaseId: DEVICE_LEASE_A,
          clientSequenceNumber: 2,
          clientEventId: 'evt_ans_paused',
          clientTimestampIso: new Date().toISOString(),
        },
        { candidateId: CANDIDATE_A, tenantId: TENANT_A }
      )
    ).rejects.toThrow(SessionNotActiveError);

    // Resume session
    const resumeRes = await deliveryApi.resumeSession(
      { examSessionId: SESSION_ID, deviceLeaseId: DEVICE_LEASE_A },
      { candidateId: CANDIDATE_A, tenantId: TENANT_A }
    );
    expect(resumeRes.sessionState).toBe('ACTIVE');
  });

  it('API-LIFECYCLE-02: Enforces maximum pause limit (3)', async () => {
    for (let i = 0; i < 3; i++) {
      await deliveryApi.pauseSession(
        { examSessionId: SESSION_ID },
        { candidateId: CANDIDATE_A, tenantId: TENANT_A }
      );
      await deliveryApi.resumeSession(
        { examSessionId: SESSION_ID, deviceLeaseId: DEVICE_LEASE_A },
        { candidateId: CANDIDATE_A, tenantId: TENANT_A }
      );
    }

    // 4th pause must fail
    await expect(
      deliveryApi.pauseSession(
        { examSessionId: SESSION_ID },
        { candidateId: CANDIDATE_A, tenantId: TENANT_A }
      )
    ).rejects.toThrow(/PAUSE_LIMIT_EXCEEDED/);
  });

  // ── Endpoint 5: Final Submission & Authoritative Scoring ─────────────────

  it('API-SUBMIT-01: Submits attempt, transitions to SUBMITTED, and generates authoritative raw score', async () => {
    // Record selection first
    await deliveryApi.recordAnswerSelection(
      {
        examSessionId: SESSION_ID,
        canonicalQuestionId: CANONICAL_QUESTION_ID,
        selectedOptionId: 'opt_1',
        deviceLeaseId: DEVICE_LEASE_A,
        clientSequenceNumber: 1,
        clientEventId: 'evt_final_ans_1',
        clientTimestampIso: new Date().toISOString(),
      },
      { candidateId: CANDIDATE_A, tenantId: TENANT_A }
    );

    const mockPolicyRule: ScoringPolicyRule = {
      ruleId: 'rule_mcq_1m',
      policyType: 'MCQ_FIXED_PENALTY',
      canonicalQuestionType: 'SINGLE_CHOICE',
      positiveMarks: 1.0,
      negativeMarks: 0.33,
      unansweredMarks: 0,
    };

    const scoringPolicy: ScoringPolicyVersion = {
      policyVersionId: 'spv_api_test_v1',
      policyId: 'sp_gate_2025',
      versionNumber: 1,
      policyFingerprint: 'fp_spv_1',
      rules: [mockPolicyRule],
      effectiveFrom: '2025-01-01T00:00:00Z',
      createdAt: Date.now(),
    };

    const mockAttempt: UserAttemptResponse = {
      attemptId: 'att_001',
      canonicalQuestionId: CANONICAL_QUESTION_ID,
      userSelectedOptionIds: ['opt_1'],
      isSkipped: false,
      responseFingerprint: 'fp_att_001',
      submittedAt: Date.now(),
    };

    const mockResolution: AnswerAuthorityResolutionVersion = {
      resolutionVersionId: 'res_v1',
      resolutionFamilyId: 'rf_001',
      versionNumber: 1,
      canonicalQuestionId: CANONICAL_QUESTION_ID,
      candidateAnswerId: 'ans_correct_opt_1',
      verificationStatus: 'SUPPORTED',
      questionDisposition: 'ACTIVE',
      scoringDisposition: 'STANDARD_EVALUATION',
      authorityDocumentSourceId: 'src_doc_ak_1',
      supersedesVersionId: null,
      effectiveFrom: '2025-01-01T00:00:00Z',
      createdAt: Date.now(),
    };

    const mockAnswerCandidate: AnswerCandidate = {
      candidateAnswerId: 'ans_correct_opt_1',
      canonicalQuestionId: CANONICAL_QUESTION_ID,
      sourceEntryId: 'entry_001',
      parsedPayload: {
        type: 'SINGLE_CHOICE_MCQ',
        correctOptionLabel: '(A)',
        correctOptionId: 'opt_1',
      },
      evidence: [],
      verificationStatus: 'SUPPORTED',
      confidenceScore: 1.0,
      provenance: {
        sourceDocumentId: 'doc_1',
        sourceSnapshotId: 'snap_1',
        adapterVersion: '1.0.0',
      },
    };

    const mockTraits: QuestionScoringTraits = {
      canonicalQuestionType: 'SINGLE_CHOICE',
    };

    const evalInput: CoreEvaluationInput = {
      policyVersion: scoringPolicy,
      items: [
        {
          canonicalQuestionId: CANONICAL_QUESTION_ID,
          attempt: mockAttempt,
          resolution: mockResolution,
          candidate: mockAnswerCandidate,
          questionTraits: mockTraits,
        },
      ],
    };

    const subRes = await deliveryApi.submitAttempt(
      {
        examSessionId: SESSION_ID,
        deviceLeaseId: DEVICE_LEASE_A,
        submissionDigest: 'digest_sha256_mock_abc',
        clientSubmittedAtIso: new Date().toISOString(),
      },
      { candidateId: CANDIDATE_A, tenantId: TENANT_A },
      { evalInput }
    );

    expect(subRes.sessionState).toBe('SUBMITTED');
    expect(subRes.submittedAt).toBeDefined();
    expect(subRes.evaluationRunId).toBeDefined();

    // Verify session store updated to SUBMITTED
    const session = await sessionStore.getExamSession(SESSION_ID, TENANT_A);
    expect(session?.sessionState).toBe('SUBMITTED');

    // Duplicate submission replay returns idempotent receipt
    const replayRes = await deliveryApi.submitAttempt(
      {
        examSessionId: SESSION_ID,
      },
      { candidateId: CANDIDATE_A, tenantId: TENANT_A }
    );
    expect(replayRes.sessionState).toBe('SUBMITTED');
    expect(replayRes.evaluationRunId).toBe(subRes.evaluationRunId);
  });

  // ── Endpoint 6: Retrieve Authorized Raw-Score Result ─────────────────────

  it('API-RESULT-01: Rejects result retrieval when session is still ACTIVE', async () => {
    await expect(
      deliveryApi.getCandidateResult(
        { examSessionId: SESSION_ID },
        { candidateId: CANDIDATE_A, tenantId: TENANT_A }
      )
    ).rejects.toThrow(/SESSION_NOT_TERMINAL/);
  });

  it('API-RESULT-02: Returns strictly raw-score result with null normalized scores', async () => {
    // Submit session first to transition to SUBMITTED
    await deliveryApi.submitAttempt(
      {
        examSessionId: SESSION_ID,
        deviceLeaseId: DEVICE_LEASE_A,
        submissionDigest: 'digest_sha256_mock_xyz',
        clientSubmittedAtIso: new Date().toISOString(),
      },
      { candidateId: CANDIDATE_A, tenantId: TENANT_A }
    );

    const res = await deliveryApi.getCandidateResult(
      { examSessionId: SESSION_ID },
      { candidateId: CANDIDATE_A, tenantId: TENANT_A }
    );

    expect(res.result).toBeDefined();
    expect(res.result.totalScore).toBe(0);
    // Explicitly assert that normalization and percentile are not exposed on raw result summary
    expect((res.result as any).totalNormalizedScore).toBeUndefined();
    expect((res.result as any).percentile).toBeUndefined();
    expect((res.result as any).rank).toBeUndefined();
  });

  // ── CandidateApiClient Wrapper Integration ───────────────────────────────

  it('CLIENT-01: CandidateApiClient end-to-end integration works seamlessly with CandidateDeliveryApi', async () => {
    const client = new CandidateApiClient({
      api: deliveryApi,
      candidateId: CANDIDATE_A,
      tenantId: TENANT_A,
      deviceLeaseId: DEVICE_LEASE_A,
    });

    // 1. Initialize session
    const initRes = await client.initializeSession(PACKAGE_ID, SESSION_ID);
    expect(initRes.sessionState).toBe('ACTIVE');

    // 2. Load live exam projection
    const examProjection = await client.loadLiveExam();
    expect(examProjection.paper.questions.length).toBeGreaterThan(0);
    expect(examProjection.paper.title).toBeDefined();

    // 3. Select option
    const answerRes = await client.selectOption(CANONICAL_QUESTION_ID, 'opt_3');
    expect(answerRes.status).toBe('ACCEPTED');
    expect(answerRes.receipt.validationStatus).toBe('ACCEPTED');
    expect(answerRes.receipt.canonicalQuestionId).toBe(CANONICAL_QUESTION_ID);

    // 4. Pause and resume via client
    const pauseRes = await client.pauseSession();
    expect(pauseRes.sessionState).toBe('PAUSED');
    const resumeRes = await client.resumeSession();
    expect(resumeRes.sessionState).toBe('ACTIVE');

    // 5. Submit exam
    const submitRes = await client.submitExam();
    expect(submitRes.sessionState).toBe('SUBMITTED');

    // 6. Get result
    const resultRes = await client.getResult();
    expect(resultRes.totalScore).toBeDefined();
    expect((resultRes as any).totalNormalizedScore).toBeUndefined();
  });

  it('CLIENT-02: CandidateApiClient.clearOption correctly dispatches clear response and preserves idempotency', async () => {
    const client = new CandidateApiClient({
      api: deliveryApi,
      candidateId: CANDIDATE_A,
      tenantId: TENANT_A,
      deviceLeaseId: DEVICE_LEASE_A,
    });

    const session2 = 'sess_test_clear_option_002';
    sessionStore.setSession({
      examSessionId: session2,
      tenantId: TENANT_A,
      candidateId: CANDIDATE_A,
      packageId: PACKAGE_ID,
      packageIntegritySeal: PACKAGE_SEAL,
      sessionConfiguration: {},
      sessionState: 'ACTIVE',
      stateVersion: 1,
      currentLeaseId: DEVICE_LEASE_A,
      leaseHeartbeatAt: new Date().toISOString(),
      scheduledStartAt: new Date().toISOString(),
      actualStartedAt: new Date().toISOString(),
      durationSeconds: 3600,
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
      submittedAt: null,
      expiredAt: null,
      terminatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await client.initializeSession(PACKAGE_ID, session2);

    // 1. Select an option first
    const selRes = await client.selectOption(CANONICAL_QUESTION_ID, 'opt_3');
    expect(selRes.status).toBe('ACCEPTED');

    // 2. Clear the option
    const clearRes = await client.clearOption(CANONICAL_QUESTION_ID);
    expect(clearRes.status).toBe('ACCEPTED');
    expect(clearRes.receipt.validationStatus).toBe('ACCEPTED');
    expect(clearRes.receipt.canonicalQuestionId).toBe(CANONICAL_QUESTION_ID);

    // 3. Clear again - should be idempotent / accept
    const clearAgain = await client.clearOption(CANONICAL_QUESTION_ID);
    expect(clearAgain.status).toBe('ACCEPTED');
  });

  it('CLIENT-03: CandidateApiClient.selectMsqOptions dispatches sorted multi-select answers, deduplicates identical sets, rejects invalid option IDs, and clears appropriately', async () => {
    const client = new CandidateApiClient({
      api: deliveryApi,
      candidateId: CANDIDATE_A,
      tenantId: TENANT_A,
      deviceLeaseId: DEVICE_LEASE_A,
    });

    const session3 = 'sess_test_msq_dispatch_003';
    sessionStore.setSession({
      examSessionId: session3,
      tenantId: TENANT_A,
      candidateId: CANDIDATE_A,
      packageId: PACKAGE_ID,
      packageIntegritySeal: PACKAGE_SEAL,
      sessionConfiguration: {},
      sessionState: 'ACTIVE',
      stateVersion: 1,
      currentLeaseId: DEVICE_LEASE_A,
      leaseHeartbeatAt: new Date().toISOString(),
      scheduledStartAt: new Date().toISOString(),
      actualStartedAt: new Date().toISOString(),
      durationSeconds: 3600,
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
      submittedAt: null,
      expiredAt: null,
      terminatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await client.initializeSession(PACKAGE_ID, session3);

    // 1. Dispatch multi-select with unsorted options
    const res1 = await client.selectMsqOptions(CANONICAL_QUESTION_ID, ['opt_3', 'opt_1']);
    expect(res1.status).toBe('ACCEPTED');
    expect(res1.receipt.validationStatus).toBe('ACCEPTED');
    expect(res1.receipt.canonicalQuestionId).toBe(CANONICAL_QUESTION_ID);

    // 2. Dispatch same options in different order (idempotent deduplication)
    const seqBefore = (client as any).clientSequenceNumber;
    const res2 = await client.selectMsqOptions(CANONICAL_QUESTION_ID, ['opt_1', 'opt_3']);
    expect(res2.status).toBe('ACCEPTED');
    expect((client as any).clientSequenceNumber).toBe(seqBefore);

    // 3. Reject invalid option ID
    await expect(
      client.selectMsqOptions(CANONICAL_QUESTION_ID, ['opt_1', 'opt_rogue_999'])
    ).rejects.toThrow(/Option 'opt_rogue_999' does not belong to question/);

    // 4. Empty array dispatches clear response
    const clearRes = await client.selectMsqOptions(CANONICAL_QUESTION_ID, []);
    expect(clearRes.status).toBe('ACCEPTED');
    expect(clearRes.receipt.validationStatus).toBe('ACCEPTED');
    expect(client.getPendingAnswersCount()).toBe(0);
  });

  it('CLIENT-04: CandidateApiClient.recordNatAnswer dispatches validated numerical answers, rejects malformed syntax, and handles empty inputs via clearOption', async () => {
    const client = new CandidateApiClient({
      api: deliveryApi,
      candidateId: CANDIDATE_A,
      tenantId: TENANT_A,
      deviceLeaseId: DEVICE_LEASE_A,
    });

    const session4 = 'sess_test_nat_dispatch_004';
    sessionStore.setSession({
      examSessionId: session4,
      tenantId: TENANT_A,
      candidateId: CANDIDATE_A,
      packageId: PACKAGE_ID,
      packageIntegritySeal: PACKAGE_SEAL,
      sessionConfiguration: {},
      sessionState: 'ACTIVE',
      stateVersion: 1,
      currentLeaseId: DEVICE_LEASE_A,
      leaseHeartbeatAt: new Date().toISOString(),
      scheduledStartAt: new Date().toISOString(),
      actualStartedAt: new Date().toISOString(),
      durationSeconds: 3600,
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
      submittedAt: null,
      expiredAt: null,
      terminatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await client.initializeSession(PACKAGE_ID, session4);

    // 1. Dispatch decimal NAT answer
    const res1 = await client.recordNatAnswer(CANONICAL_QUESTION_ID, '14.5');
    expect(res1.status).toBe('ACCEPTED');
    expect(res1.receipt.validationStatus).toBe('ACCEPTED');

    // 2. Dispatch negative rational NAT answer
    const res2 = await client.recordNatAnswer(CANONICAL_QUESTION_ID, '-0.25');
    expect(res2.status).toBe('ACCEPTED');

    // 3. Dispatch fraction NAT answer
    const res3 = await client.recordNatAnswer(CANONICAL_QUESTION_ID, '3/4');
    expect(res3.status).toBe('ACCEPTED');

    // 4. Reject malformed numeric syntax (ambiguous comma, non-numeric letters)
    await expect(
      client.recordNatAnswer(CANONICAL_QUESTION_ID, '1,234.5')
    ).rejects.toThrow(/INVALID_NUMERIC_INPUT/);

    await expect(
      client.recordNatAnswer(CANONICAL_QUESTION_ID, 'abc')
    ).rejects.toThrow(/INVALID_NUMERIC_INPUT/);

    // 5. Empty or whitespace string clears response
    const clearRes = await client.recordNatAnswer(CANONICAL_QUESTION_ID, '   ');
    expect(clearRes.status).toBe('ACCEPTED');
    expect(clearRes.receipt.validationStatus).toBe('ACCEPTED');
    expect(client.getPendingAnswersCount()).toBe(0);
  });
});
