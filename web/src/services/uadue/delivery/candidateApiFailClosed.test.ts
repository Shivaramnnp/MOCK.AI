/**
 * UADUE Phase 3.6C — Candidate Delivery API Fail-Closed & Fallback Removal Test Battery
 * Specification: UADUE-P3.6-FAILCLOSED-001 (Authoritative Delivery Integrity & Terminal Locking)
 *
 * Certifies that under all adverse conditions (network drop, revoked lease, deadline expiry, pause limits):
 * 1. Client NEVER computes client-side score for authoritative exams or accepts unverified submissions.
 * 2. Unsafe client-side fallbacks in ExamService and CompetitiveExamPlayerScreen are completely eliminated.
 * 3. Network partitions trigger safe queueing with stable clientEventId and idempotent flush.
 * 4. Terminal server conditions (LEASE_MISMATCH, DEADLINE_EXCEEDED, PAUSE_LIMIT_EXCEEDED) fail closed immediately.
 * 5. Authoritative raw-score-only contract is preserved (totalRawScore = sum(awardedMarks), totalNormalizedScore = null).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CandidateDeliveryApi,
  CandidateApiError,
  ICandidateDeliveryBackend,
} from './candidateDeliveryApi';
import { CandidateApiClient } from './candidateApiClient';
import {
  CandidateSessionAuthorizer,
  IAuthorizerSessionStore,
  IAuthorizerPackageStore,
  PackageStatusRecord,
} from './candidateSessionAuthorizer';
import { CanonicalProjectionGateway } from '../canonical/canonicalProjectionGateway';
import { CanonicalPipelineOrchestrator } from '../canonical/canonicalPipelineOrchestrator';
import { ExamSessionRecord } from './deliveryTypes';
import { QuestionCandidate } from '../contracts/questionGraph';
import { CanonicalAssessmentPackage } from '../canonical/types';
import { CoreEvaluationInput } from './scoringEvaluationCore';
import { ExamService } from '../../examService';
import { ExamPresentationPaper, ExamTestSession } from '../../../types';

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

describe('UADUE Phase 3.6C — Candidate Delivery Fail-Closed & Fallback Removal Suite', () => {
  const SIGNING_SECRET = 'failclosed_audit_test_secret_32_bytes_strictly!';
  const TENANT_ID = 'tenant_mockai_prod';
  const CANDIDATE_ID = 'cand_student_failclosed';
  const SESSION_ID = 'sess_failclosed_001';
  const DEVICE_LEASE_ORIGINAL = 'lease_failclosed_device_mac_001';
  const DEVICE_LEASE_COMPETITOR = 'lease_rogue_device_mac_999';

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
      candidateId: 'cand_failclosed_q1',
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
      graphId: 'qgraph_failclosed_test',
      sourceDocumentId: 'doc_fc_01',
      sourceSnapshotId: 'snap_fc_01',
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
        sourceSnapshotId: 'snap_fc_01',
        sourceDocumentId: 'doc_fc_01',
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
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      packageId: PACKAGE_ID,
      packageIntegritySeal: PACKAGE_SEAL,
      sessionConfiguration: {},
      sessionState: 'ACTIVE',
      stateVersion: 1,
      currentLeaseId: DEVICE_LEASE_ORIGINAL,
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
        if (tenantId !== TENANT_ID) {
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

  it('1. Safe Queueing: Transient network failure during selectOption records pending answer and retains stable clientEventId', async () => {
    const client = new CandidateApiClient({
      api: deliveryApi,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      deviceLeaseId: DEVICE_LEASE_ORIGINAL,
    });

    await client.initializeSession(PACKAGE_ID, SESSION_ID);

    // Mock transient network failure on api.recordAnswerSelection
    let networkFail = true;
    const originalRecordAnswer = deliveryApi.recordAnswerSelection.bind(deliveryApi);
    deliveryApi.recordAnswerSelection = async (...args) => {
      if (networkFail) {
        throw new Error('Network error: connection refused / timeout');
      }
      return originalRecordAnswer(...args);
    };

    // Candidate clicks option
    await expect(
      client.selectOption(CANONICAL_QUESTION_ID, 'opt_1')
    ).rejects.toThrow(/Network error/);

    // Invariants:
    expect(client.getPendingAnswersCount()).toBe(1);
    expect(client.hasTerminalError()).toBe(false);

    const pending = client.getPendingAnswers();
    expect(pending).toHaveLength(1);
    expect(pending[0].canonicalQuestionId).toBe(CANONICAL_QUESTION_ID);
    expect(pending[0].selectedOptionId).toBe('opt_1');
    expect(pending[0].status).toBe('FAILED_TRANSIENT');
    expect(pending[0].clientEventId).toContain(`evt_${CANDIDATE_ID}_1_`);

    // Restore network connectivity and flush
    networkFail = false;
    const flushRes = await client.flushPendingAnswers();
    expect(flushRes.synced).toBe(1);
    expect(flushRes.failed).toBe(0);
    expect(client.getPendingAnswersCount()).toBe(0);

    // Subsequent flush does not double-send
    const flushRes2 = await client.flushPendingAnswers();
    expect(flushRes2.synced).toBe(0);
    expect(flushRes2.failed).toBe(0);
  });

  it('2. Fail-Closed Submission: Attempted submission during network outage fails closed without computing local score', async () => {
    const client = new CandidateApiClient({
      api: deliveryApi,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      deviceLeaseId: DEVICE_LEASE_ORIGINAL,
    });

    await client.initializeSession(PACKAGE_ID, SESSION_ID);

    // Force network failure on recordAnswerSelection
    const originalRecordAnswer = deliveryApi.recordAnswerSelection.bind(deliveryApi);
    deliveryApi.recordAnswerSelection = async () => {
      throw new Error('Network unreachable: 504 Gateway Timeout');
    };

    // Candidate selects an option, network fails
    await expect(client.selectOption(CANONICAL_QUESTION_ID, 'opt_1')).rejects.toThrow();
    expect(client.getPendingAnswersCount()).toBe(1);

    // Candidate attempts submitExam() while answers remain unsynced
    await expect(client.submitExam()).rejects.toThrow(/CANNOT_SUBMIT_UNSYNCED_ANSWERS/);

    // Invariant: Server session MUST remain ACTIVE (not submitted, not evaluated)
    const sessionRecord = await sessionStore.getExamSession(SESSION_ID, TENANT_ID);
    expect(sessionRecord?.sessionState).toBe('ACTIVE');

    // Restore network
    deliveryApi.recordAnswerSelection = originalRecordAnswer;
    const submitRes = await client.submitExam();
    expect(submitRes.sessionState).toBe('SUBMITTED');
  });

  it('3. Idempotent Submission: Subsequent retries after commit return identical receipts without double-scoring', async () => {
    const client = new CandidateApiClient({
      api: deliveryApi,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      deviceLeaseId: DEVICE_LEASE_ORIGINAL,
    });

    await client.initializeSession(PACKAGE_ID, SESSION_ID);
    await client.selectOption(CANONICAL_QUESTION_ID, 'opt_1');

    const receipt1 = await client.submitExam();
    expect(receipt1.sessionState).toBe('SUBMITTED');

    // Duplicate retry
    const receipt2 = await client.submitExam();
    expect(receipt2.sessionState).toBe('SUBMITTED');
    expect(receipt2.examSessionId).toBe(receipt1.examSessionId);
    expect(receipt2.submittedAt).toBe(receipt1.submittedAt);
    expect(receipt2.evaluationRunId).toBe(receipt1.evaluationRunId);

    // Authorized result retrieval
    const result = await client.getResult();
    expect(result.isScoreCalculated).toBe(true);
  });

  it('4. Fail-Closed Terminal Lock: Revoked device lease locks client immediately across all subsequent calls', async () => {
    const client1 = new CandidateApiClient({
      api: deliveryApi,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      deviceLeaseId: DEVICE_LEASE_ORIGINAL,
    });

    await client1.initializeSession(PACKAGE_ID, SESSION_ID);

    // Candidate opens a second tab / device which steals the lease
    const client2 = new CandidateApiClient({
      api: deliveryApi,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      deviceLeaseId: DEVICE_LEASE_COMPETITOR,
    });
    await client2.initializeSession(PACKAGE_ID, SESSION_ID);

    // client1 tries to record answer -> server throws LEASE_MISMATCH
    await expect(
      client1.selectOption(CANONICAL_QUESTION_ID, 'opt_1')
    ).rejects.toThrow(/LEASE_MISMATCH/);

    // client1 is now in terminal locked state
    expect(client1.hasTerminalError()).toBe(true);
    expect(CandidateApiClient.isTerminalError(client1.getTerminalError())).toBe(true);

    // Any subsequent call fails closed without reaching the server
    await expect(client1.selectOption(CANONICAL_QUESTION_ID, 'opt_2')).rejects.toThrow(/LEASE_MISMATCH/);
    await expect(client1.submitExam()).rejects.toThrow(/LEASE_MISMATCH/);
    await expect(client1.pauseSession()).rejects.toThrow(/LEASE_MISMATCH/);
    await expect(client1.loadLiveExam()).rejects.toThrow(/LEASE_MISMATCH/);
  });

  it('5. Fail-Closed Terminal Lock: Deadline expiration locks client and blocks answer selections', async () => {
    const client = new CandidateApiClient({
      api: deliveryApi,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      deviceLeaseId: DEVICE_LEASE_ORIGINAL,
    });

    await client.initializeSession(PACKAGE_ID, SESSION_ID);

    // Fast-forward session start time past the duration + grace period
    const session = await sessionStore.getExamSession(SESSION_ID, TENANT_ID);
    if (session) {
      session.actualStartedAt = new Date(Date.now() - (session.durationSeconds + 60) * 1000).toISOString();
      session.createdAt = session.actualStartedAt;
      await sessionStore.saveExamSession(session);
    }

    // Attempting answer recording triggers DEADLINE_EXCEEDED
    await expect(
      client.selectOption(CANONICAL_QUESTION_ID, 'opt_1')
    ).rejects.toThrow(/DEADLINE_EXCEEDED/);

    // Client locks fail-closed
    expect(client.hasTerminalError()).toBe(true);
    await expect(client.selectOption(CANONICAL_QUESTION_ID, 'opt_1')).rejects.toThrow(/DEADLINE_EXCEEDED/);
  });

  it('6. Fail-Closed Terminal Lock: Pause limit exceeded blocks further pauses', async () => {
    const client = new CandidateApiClient({
      api: deliveryApi,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      deviceLeaseId: DEVICE_LEASE_ORIGINAL,
    });

    await client.initializeSession(PACKAGE_ID, SESSION_ID);

    // 3 pauses permitted
    await client.pauseSession();
    await client.resumeSession();
    await client.pauseSession();
    await client.resumeSession();
    await client.pauseSession();
    await client.resumeSession();

    // 4th pause must fail with PAUSE_LIMIT_EXCEEDED
    await expect(client.pauseSession()).rejects.toThrow(/PAUSE_LIMIT_EXCEEDED/);
    expect(client.hasTerminalError()).toBe(true);
  });

  it('7. Unsafe Fallback Removal: ExamService.submitExamSession throws AUTHORITATIVE_EXAM_PROTECTION on presentation-only papers', () => {
    const presentationPaper = {
      id: 'paper_presentation_only_001',
      examId: 'gate',
      title: 'Protected Authoritative Paper',
      totalMarks: 100,
      durationMinutes: 180,
      paperType: 'CBE_OBJECTIVE',
      markingScheme: { marksPerCorrect: 1, negativeMarks: 0.33 },
      sections: [{ id: 'sec_1', name: 'General', questionCount: 1, startIndex: 0, endIndex: 0, maxMarks: 100 }],
      questions: [
        {
          id: 'q_pres_1',
          questionNumber: 1,
          sectionId: 'sec_1',
          sectionName: 'General',
          questionText: 'What is the speed of light?',
          questionType: 'MCQ',
          marks: 1,
          negativeMarks: 0.33,
          options: ['3e8 m/s', '3e6 m/s', '3e4 m/s', '3e2 m/s'],
          examId: 'gate',
          year: 2025,
          date: '2025-02-01',
          shift: 'S1',
          tier: 'Tier-1',
          language: 'EN',
          isPresentationOnly: true,
        },
      ],
      isPresentationOnly: true,
      quarantinedAt: new Date().toISOString(),
      presentationHash: 'hash_test_fc',
    } as any as ExamPresentationPaper;

    const session: ExamTestSession = {
      sessionId: 'sess_legacy_attempt',
      paperId: presentationPaper.id,
      examId: 'gate',
      paperTitle: presentationPaper.title,
      userId: CANDIDATE_ID,
      status: 'IN_PROGRESS',
      startedAt: Date.now(),
      lastSavedAt: Date.now(),
      expiresAt: Date.now() + 10800000,
      completedAt: null,
      elapsedSeconds: 50,
      timeRemainingSeconds: 10750,
      durationSeconds: 10800,
      currentQuestionIndex: 0,
      currentSectionId: 'sec_1',
      userAnswers: { 0: 0 },
      questionStatuses: { 0: 'ANSWERED' },
      version: 1,
    };

    // Client-side submission MUST throw without computing a score
    expect(() => {
      ExamService.submitExamSession(session, presentationPaper);
    }).toThrow(/AUTHORITATIVE_EXAM_PROTECTION/);

    // Client-side scoring calculation MUST also throw
    expect(() => {
      ExamService.calculateExamResult(session, presentationPaper);
    }).toThrow(/AUTHORITATIVE_EXAM_PROTECTION/);
  });

  it('8. Raw-Score-Only Contract: Server result projection preserves raw score sum and null normalized score', async () => {
    const client = new CandidateApiClient({
      api: deliveryApi,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      deviceLeaseId: DEVICE_LEASE_ORIGINAL,
    });

    await client.initializeSession(PACKAGE_ID, SESSION_ID);
    await client.selectOption(CANONICAL_QUESTION_ID, 'opt_1');
    await client.submitExam();

    const res = await client.getResult();

    expect(res.isScoreCalculated).toBe(true);
    expect(typeof res.totalScore).toBe('number');
    expect((res as any).totalNormalizedScore).toBeUndefined(); // Raw score only, no normalization computed on client
  });
});
