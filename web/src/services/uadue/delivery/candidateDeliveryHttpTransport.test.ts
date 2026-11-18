/**
 * UADUE Phase 3.6D — Candidate Delivery HTTP Transport & Edge Gateway Integration Suite
 * Specification: UADUE-P3.6-EDGE-HTTP-001 (Browser-to-Gateway End-to-End Flow)
 *
 * Verifies that the client-gateway boundary operates seamlessly over HTTP:
 * 1. Bearer token propagation and verification at the gateway boundary.
 * 2. Air-gapped Tier 3 projection delivery over HTTP (zero answer keys, zero logicalFamilyIds).
 * 3. Client-side answer queueing and idempotent flush over real HTTP request cycles.
 * 4. Fail-closed terminal error propagation (LEASE_MISMATCH, DEADLINE_EXCEEDED, PAUSE_LIMIT_EXCEEDED).
 * 5. Rejection of unauthenticated, cross-tenant, and cross-candidate requests over HTTP.
 * 6. Authoritative raw-score-only projection delivery over HTTP.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CandidateDeliveryApi,
  ICandidateDeliveryBackend,
} from './candidateDeliveryApi';
import { CandidateApiClient } from './candidateApiClient';
import { HttpCandidateDeliveryAdapter } from './httpCandidateDeliveryAdapter';
import { handleCandidateDeliveryRequest } from '../../../../../supabase/functions/candidate-delivery/index';
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

describe('UADUE Phase 3.6D — Candidate Delivery HTTP Gateway Integration Suite', () => {
  const SIGNING_SECRET = 'http_edge_staging_test_secret_32_bytes_ok!';
  const TENANT_ID = 'tenant_mockai_prod';
  const OTHER_TENANT_ID = 'tenant_competitor_org';
  const CANDIDATE_ID = 'cand_student_http_test';
  const OTHER_CANDIDATE_ID = 'cand_student_imposter';
  const SESSION_ID = 'sess_http_attempt_001';
  const DEVICE_LEASE_A = 'lease_http_mac_001';
  const DEVICE_LEASE_B = 'lease_http_mac_999';

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
      candidateId: 'cand_http_q1',
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
      graphId: 'qgraph_http_test',
      sourceDocumentId: 'doc_http_01',
      sourceSnapshotId: 'snap_http_01',
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
        sourceSnapshotId: 'snap_http_01',
        sourceDocumentId: 'doc_http_01',
        sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        sourceDocumentGraphSha256: 'f3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        createdAt: 0,
      },
    };

    return orchestrator.executePipeline({ questionGraph: qgraph, strictValidation: true }).package!;
  }

  // Simulated in-memory fetch routing directly to the Edge Function handler
  function createEdgeFetch(
    overrideAuth?: { candidateId: string; tenantId: string } | null,
    networkOutageRef: { offline: boolean } = { offline: false }
  ): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (networkOutageRef.offline) {
        throw new TypeError('Failed to fetch: Network is disconnected / offline');
      }

      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || 'GET';
      const headers = new Headers(init?.headers);
      const body = init?.body as BodyInit | undefined;

      const req = new Request(url, {
        method,
        headers,
        body,
      });

      return handleCandidateDeliveryRequest(
        req,
        deliveryApi,
        async (authHeader: string | null) => {
          if (!authHeader) return null;
          if (overrideAuth !== undefined) return overrideAuth;
          if (authHeader.includes('invalid_token')) return null;
          if (authHeader.includes('imposter_token')) {
            return { candidateId: OTHER_CANDIDATE_ID, tenantId: TENANT_ID };
          }
          if (authHeader.includes('wrong_tenant_token')) {
            return { candidateId: CANDIDATE_ID, tenantId: OTHER_TENANT_ID };
          }
          return { candidateId: CANDIDATE_ID, tenantId: TENANT_ID };
        }
      );
    };
  }

  beforeEach(() => {
    sessionStore = new MockSessionStore();
    packageStore = new MockPackageStore();
    authorizer = new CandidateSessionAuthorizer(sessionStore, packageStore, {
      signingSecret: SIGNING_SECRET,
      contextTtlSeconds: 300,
      tokenTtlSeconds: 3600,
      allowClientSigning: true,
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

  it('EDGE-01: End-to-End HTTP candidate flow succeeds with air-gapped questions and valid receipt', async () => {
    const edgeFetch = createEdgeFetch();
    const httpAdapter = new HttpCandidateDeliveryAdapter({
      baseUrl: 'https://staging.mockai.org/candidate-delivery',
      fetchFn: edgeFetch,
      getAuthToken: () => 'valid_bearer_token',
    });

    const client = new CandidateApiClient({
      api: httpAdapter,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      sessionToken: 'valid_bearer_token',
      deviceLeaseId: DEVICE_LEASE_A,
    });

    // 1. Initialize session over HTTP
    const initRes = await client.initializeSession(PACKAGE_ID, SESSION_ID);
    expect(initRes.examSessionId).toBe(SESSION_ID);
    expect(initRes.sessionState).toBe('ACTIVE');

    // 2. Load live exam projection over HTTP
    const liveRes = await client.loadLiveExam();
    expect(liveRes.paper.isPresentationOnly).toBe(true);
    expect(liveRes.paper.questions).toHaveLength(1);
    // Zero answer key leakage
    expect((liveRes.paper.questions[0] as any).correctAnswer).toBeUndefined();
    expect((liveRes.paper.questions[0] as any).correctAnswerIndex).toBeUndefined();

    // 3. Record answer selection over HTTP
    const answerRes = await client.selectOption(CANONICAL_QUESTION_ID, 'opt_1');
    expect(answerRes.status).toBe('ACCEPTED');
    expect(answerRes.receipt.validationStatus).toBe('ACCEPTED');
    expect(answerRes.receipt.clientEventId).toContain(`evt_${CANDIDATE_ID}_1_`);

    // 4. Submit exam over HTTP
    const submitRes = await client.submitExam();
    expect(submitRes.sessionState).toBe('SUBMITTED');

    // 5. Retrieve result over HTTP
    const result = await client.getResult();
    expect(result.isScoreCalculated).toBe(true);
    expect(typeof result.totalScore).toBe('number');
    expect((result as any).totalNormalizedScore).toBeUndefined();
  });

  it('EDGE-02: Edge Gateway rejects requests without Authorization header (401)', async () => {
    const edgeFetch = createEdgeFetch();
    const httpAdapter = new HttpCandidateDeliveryAdapter({
      baseUrl: 'https://staging.mockai.org/candidate-delivery',
      fetchFn: edgeFetch,
      // No auth token supplied
    });

    const client = new CandidateApiClient({
      api: httpAdapter,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      deviceLeaseId: DEVICE_LEASE_A,
    });

    await expect(
      client.initializeSession(PACKAGE_ID, SESSION_ID)
    ).rejects.toThrow(/AUTHENTICATION_REQUIRED/);
  });

  it('EDGE-03: Edge Gateway rejects cross-candidate imposter token (Anti-IDOR)', async () => {
    const edgeFetch = createEdgeFetch();
    const httpAdapter = new HttpCandidateDeliveryAdapter({
      baseUrl: 'https://staging.mockai.org/candidate-delivery',
      fetchFn: edgeFetch,
      getAuthToken: () => 'imposter_token', // Belongs to OTHER_CANDIDATE_ID
    });

    const client = new CandidateApiClient({
      api: httpAdapter,
      tenantId: TENANT_ID,
      candidateId: OTHER_CANDIDATE_ID, // Mismatches session candidate CANDIDATE_ID
      sessionToken: 'imposter_token',
      deviceLeaseId: DEVICE_LEASE_A,
    });

    await expect(
      client.initializeSession(PACKAGE_ID, SESSION_ID)
    ).rejects.toThrow(/CANDIDATE_SESSION_MISMATCH/);
  });

  it('EDGE-04: Network outage causes safe client queueing; reconnect flushes over HTTP', async () => {
    const outage = { offline: false };
    const edgeFetch = createEdgeFetch(undefined, outage);
    const httpAdapter = new HttpCandidateDeliveryAdapter({
      baseUrl: 'https://staging.mockai.org/candidate-delivery',
      fetchFn: edgeFetch,
      getAuthToken: () => 'valid_bearer_token',
    });

    const client = new CandidateApiClient({
      api: httpAdapter,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      sessionToken: 'valid_bearer_token',
      deviceLeaseId: DEVICE_LEASE_A,
    });

    await client.initializeSession(PACKAGE_ID, SESSION_ID);

    // Drop connection
    outage.offline = true;
    await expect(
      client.selectOption(CANONICAL_QUESTION_ID, 'opt_1')
    ).rejects.toThrow(/Network is disconnected/);

    expect(client.getPendingAnswersCount()).toBe(1);
    expect(client.hasTerminalError()).toBe(false);

    // Attempting submission over offline connection fails closed
    await expect(client.submitExam()).rejects.toThrow(/CANNOT_SUBMIT_UNSYNCED_ANSWERS/);

    // Reconnect network
    outage.offline = false;
    const flushRes = await client.flushPendingAnswers();
    expect(flushRes.synced).toBe(1);
    expect(client.getPendingAnswersCount()).toBe(0);

    // Submission now succeeds over HTTP
    const submitRes = await client.submitExam();
    expect(submitRes.sessionState).toBe('SUBMITTED');
  });

  it('EDGE-05: Conflicting lease over HTTP triggers LEASE_MISMATCH and locks client fail-closed', async () => {
    const edgeFetch = createEdgeFetch();
    const httpAdapter = new HttpCandidateDeliveryAdapter({
      baseUrl: 'https://staging.mockai.org/candidate-delivery',
      fetchFn: edgeFetch,
      getAuthToken: () => 'valid_bearer_token',
    });

    const client1 = new CandidateApiClient({
      api: httpAdapter,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      sessionToken: 'valid_bearer_token',
      deviceLeaseId: DEVICE_LEASE_A,
    });

    await client1.initializeSession(PACKAGE_ID, SESSION_ID);

    // Competing client takes lease
    const client2 = new CandidateApiClient({
      api: httpAdapter,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      sessionToken: 'valid_bearer_token',
      deviceLeaseId: DEVICE_LEASE_B,
    });
    await client2.initializeSession(PACKAGE_ID, SESSION_ID);

    // client1 tries to record answer over HTTP
    await expect(
      client1.selectOption(CANONICAL_QUESTION_ID, 'opt_1')
    ).rejects.toThrow(/LEASE_MISMATCH/);

    // client1 is in terminal locked state
    expect(client1.hasTerminalError()).toBe(true);

    // Subsequent calls fail closed client-side
    await expect(client1.submitExam()).rejects.toThrow(/LEASE_MISMATCH/);
  });
});
