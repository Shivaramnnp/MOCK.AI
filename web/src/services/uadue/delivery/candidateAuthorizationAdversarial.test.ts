/**
 * UADUE Phase 3.6 — Candidate Authorization & Authoritative Security Binding Adversarial Suite
 * Specification: UADUE-P3.6-AUTH-001
 *
 * Verifies strict server-authoritative candidate security invariants:
 * 1. Cryptographic Authentication: Forged, tampered, and expired tokens fail closed.
 * 2. Self-Assertion Rejection: Caller-supplied unauthenticated identities fail closed.
 * 3. Cross-Candidate IDOR Prevention: Cannot access another candidate's session.
 * 4. Cross-Tenant Isolation: Cannot access sessions across tenant boundaries.
 * 5. Package Binding Invariant: Session package mismatch fails closed.
 * 6. Lifecycle State Gating: Projections strictly forbidden unless session state is ACTIVE.
 * 7. Package Quarantine Enforcement: Quarantined or invalid packages fail closed.
 * 8. Package Seal Verification: Tampered package seals fail closed.
 * 9. Privileged Bypass Isolation: isInternalAudit bypass flags strictly rejected on candidate endpoints.
 * 10. Cryptographic Context Sealing: Context verification rejects tampered or expired sealed contexts.
 * 11. Submission Ingestion Identity Check: Ingestion gateway rejects candidate mismatch.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import {
  CandidateSessionAuthorizer,
  CandidateAuthenticationError,
  CandidateSessionMismatchError,
  TenantSessionMismatchError,
  SessionPackageMismatchError,
  SessionNotActiveError,
  PackageQuarantinedError,
  PackageSealMismatchError,
  PrivilegedBypassAttemptError,
  IAuthorizerSessionStore,
  IAuthorizerPackageStore,
  IStaffRoleProvider,
  SupabaseAuthAuthority,
  PackageStatusRecord,
  VerifiedCandidateSessionContext,
} from './candidateSessionAuthorizer';
import {
  CanonicalProjectionGateway,
  ProjectionAuthorizationError,
} from '../canonical/canonicalProjectionGateway';
import { CanonicalPersistenceAdapter } from '../canonical/canonicalPersistenceAdapter';
import { CanonicalAssessmentPackage } from '../canonical/types';
import { ExamSessionRecord } from './deliveryTypes';
import {
  SubmissionIngestionGateway,
  SubmissionCandidateMismatchError,
} from './submissionIngestionGateway';

import { CanonicalPipelineOrchestrator } from '../canonical/canonicalPipelineOrchestrator';
import { QuestionCandidate, QuestionGraph } from '../contracts/questionGraph';

// In-Memory Test Double for Authorizer Session Store
class InMemorySessionStore implements IAuthorizerSessionStore {
  private sessions = new Map<string, ExamSessionRecord>();

  public setSession(session: ExamSessionRecord): void {
    this.sessions.set(`${session.tenantId}:${session.examSessionId}`, session);
  }

  public async getExamSession(sessionId: string, tenantId: string): Promise<ExamSessionRecord | null> {
    const key = `${tenantId}:${sessionId}`;
    return this.sessions.get(key) || null;
  }
}

// In-Memory Test Double for Authorizer Package Store
class InMemoryPackageStore implements IAuthorizerPackageStore {
  private packages = new Map<string, PackageStatusRecord>();

  public setPackageStatus(status: PackageStatusRecord): void {
    this.packages.set(status.packageId, status);
  }

  public async getPackageStatus(packageId: string): Promise<PackageStatusRecord | null> {
    return this.packages.get(packageId) || null;
  }
}

describe('UADUE Phase 3.6 — Candidate Authorization & Authoritative Security Binding Adversarial Suite', () => {
  const SIGNING_SECRET = 'test_secret_key_for_uadue_phase_3_6_authorizer_32_bytes!';
  const TENANT_ID = 'tenant_mockai_prod';
  const OTHER_TENANT_ID = 'tenant_other_corp';
  const CANDIDATE_A = 'cand_user_alpha';
  const CANDIDATE_B = 'cand_user_beta_victim';
  const SESSION_A = 'sess_active_alpha_001';

  let VALID_PACKAGE_ID: string;
  let VALID_SEAL: string;

  let sessionStore: InMemorySessionStore;
  let packageStore: InMemoryPackageStore;
  let authorizer: CandidateSessionAuthorizer;
  let persistenceAdapter: CanonicalPersistenceAdapter;
  let projectionGateway: CanonicalProjectionGateway;
  let pipelinePackage: CanonicalAssessmentPackage;

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
    };
    const qgraph: any = {
      graphId: 'qgraph_adv_test',
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

  function createActiveSession(overrides: Partial<ExamSessionRecord> = {}): ExamSessionRecord {
    return {
      examSessionId: SESSION_A,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_A,
      packageId: VALID_PACKAGE_ID,
      packageIntegritySeal: VALID_SEAL,
      sessionConfiguration: {},
      sessionState: 'ACTIVE',
      stateVersion: 1,
      currentLeaseId: 'lease_alpha_001',
      leaseHeartbeatAt: new Date().toISOString(),
      scheduledStartAt: new Date(Date.now() - 600000).toISOString(),
      actualStartedAt: new Date(Date.now() - 600000).toISOString(),
      durationSeconds: 3600,
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
      submittedAt: null,
      expiredAt: null,
      terminatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    pipelinePackage = createPipelinePackage();
    VALID_PACKAGE_ID = pipelinePackage.packageId;
    VALID_SEAL = pipelinePackage.packageIntegritySeal;

    sessionStore = new InMemorySessionStore();
    packageStore = new InMemoryPackageStore();
    authorizer = new CandidateSessionAuthorizer(sessionStore, packageStore, {
      signingSecret: SIGNING_SECRET,
      contextTtlSeconds: 300,
      tokenTtlSeconds: 3600,
    });

    sessionStore.setSession(createActiveSession());
    packageStore.setPackageStatus({
      packageId: VALID_PACKAGE_ID,
      packageIntegritySeal: VALID_SEAL,
      validationStatus: 'VALIDATED',
      isQuarantined: false,
    });

    persistenceAdapter = new CanonicalPersistenceAdapter();
    await persistenceAdapter.persistPackage(pipelinePackage);
    projectionGateway = new CanonicalProjectionGateway(persistenceAdapter, authorizer);
  });

  // ==========================================================================
  // 1. Cryptographic Authentication & Token Invariants
  // ==========================================================================

  it('SCEN-AUTH-01: Token with forged HMAC signature fails closed', async () => {
    const validToken = authorizer.issueCandidateToken({
      candidateId: CANDIDATE_A,
      tenantId: TENANT_ID,
    });

    const [payload, _sig] = validToken.split('.');
    const forgedToken = `${payload}.forged_tampered_signature_hex_or_base64url`;

    await expect(
      authorizer.authorizeCandidateSession({
        credentials: { token: forgedToken },
        examSessionId: SESSION_A,
        requestedPackageId: VALID_PACKAGE_ID,
        tenantId: TENANT_ID,
      })
    ).rejects.toThrow(CandidateAuthenticationError);
  });

  it('SCEN-AUTH-02: Modified token payload without matching signature fails closed', async () => {
    // Attacker crafts payload claiming to be victim CANDIDATE_B
    const attackerPayload = Buffer.from(
      JSON.stringify({
        sub: CANDIDATE_B,
        tid: TENANT_ID,
        roles: ['candidate'],
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString('base64url');

    // Uses legitimate token signature from Candidate A
    const legitimateToken = authorizer.issueCandidateToken({
      candidateId: CANDIDATE_A,
      tenantId: TENANT_ID,
    });
    const [, legitimateSig] = legitimateToken.split('.');
    const spoofedToken = `${attackerPayload}.${legitimateSig}`;

    await expect(
      authorizer.authorizeCandidateSession({
        credentials: { token: spoofedToken },
        examSessionId: SESSION_A,
        requestedPackageId: VALID_PACKAGE_ID,
        tenantId: TENANT_ID,
      })
    ).rejects.toThrow(CandidateAuthenticationError);
  });

  it('SCEN-AUTH-03: Expired candidate token fails closed', async () => {
    const expiredToken = authorizer.issueCandidateToken({
      candidateId: CANDIDATE_A,
      tenantId: TENANT_ID,
      expiresAt: Math.floor(Date.now() / 1000) - 100, // Expired 100s ago
    });

    await expect(
      authorizer.authorizeCandidateSession({
        credentials: { token: expiredToken },
        examSessionId: SESSION_A,
        requestedPackageId: VALID_PACKAGE_ID,
        tenantId: TENANT_ID,
      })
    ).rejects.toThrow('TOKEN_EXPIRED');
  });

  it('SCEN-AUTH-04: Missing credentials or malformed token string fails closed', async () => {
    await expect(
      authorizer.authorizeCandidateSession({
        credentials: { token: '' },
        examSessionId: SESSION_A,
        requestedPackageId: VALID_PACKAGE_ID,
        tenantId: TENANT_ID,
      })
    ).rejects.toThrow(CandidateAuthenticationError);

    await expect(
      authorizer.authorizeCandidateSession({
        credentials: { token: 'invalid_single_string_without_dot' },
        examSessionId: SESSION_A,
        requestedPackageId: VALID_PACKAGE_ID,
        tenantId: TENANT_ID,
      })
    ).rejects.toThrow('MALFORMED_TOKEN');
  });

  // ==========================================================================
  // 2. Cross-Candidate IDOR Prevention & Tenant Isolation
  // ==========================================================================

  it('SCEN-AUTH-05: Authenticated candidate A cannot access candidate B session (IDOR prevented)', async () => {
    const candidateAToken = authorizer.issueCandidateToken({
      candidateId: CANDIDATE_A,
      tenantId: TENANT_ID,
    });

    // Session registered to candidate B
    const sessionB = createActiveSession({
      examSessionId: 'sess_victim_b',
      candidateId: CANDIDATE_B,
    });
    sessionStore.setSession(sessionB);

    await expect(
      authorizer.authorizeCandidateSession({
        credentials: { token: candidateAToken },
        examSessionId: 'sess_victim_b',
        requestedPackageId: VALID_PACKAGE_ID,
        tenantId: TENANT_ID,
      })
    ).rejects.toThrow(CandidateSessionMismatchError);
  });

  it('SCEN-AUTH-06: Candidate from tenant_alpha cannot access session in tenant_beta', async () => {
    const foreignTenantToken = authorizer.issueCandidateToken({
      candidateId: CANDIDATE_A,
      tenantId: OTHER_TENANT_ID, // Foreign tenant
    });

    // Attempting to access SESSION_A in TENANT_ID
    await expect(
      authorizer.authorizeCandidateSession({
        credentials: { token: foreignTenantToken },
        examSessionId: SESSION_A,
        requestedPackageId: VALID_PACKAGE_ID,
        tenantId: TENANT_ID,
      })
    ).rejects.toThrow(TenantSessionMismatchError);
  });

  // ==========================================================================
  // 3. Package Binding & Quarantine Enforcements
  // ==========================================================================

  it('SCEN-AUTH-07: Package mismatch between session and requested package fails closed', async () => {
    const validToken = authorizer.issueCandidateToken({
      candidateId: CANDIDATE_A,
      tenantId: TENANT_ID,
    });

    await expect(
      authorizer.authorizeCandidateSession({
        credentials: { token: validToken },
        examSessionId: SESSION_A,
        requestedPackageId: 'pkg_wrong_package_id_attempt',
        tenantId: TENANT_ID,
      })
    ).rejects.toThrow(SessionPackageMismatchError);
  });

  it('SCEN-AUTH-08: Quarantined package fails closed and denies candidate access', async () => {
    const validToken = authorizer.issueCandidateToken({
      candidateId: CANDIDATE_A,
      tenantId: TENANT_ID,
    });

    packageStore.setPackageStatus({
      packageId: VALID_PACKAGE_ID,
      packageIntegritySeal: VALID_SEAL,
      validationStatus: 'QUARANTINED',
      isQuarantined: true,
    });

    await expect(
      authorizer.authorizeCandidateSession({
        credentials: { token: validToken },
        examSessionId: SESSION_A,
        requestedPackageId: VALID_PACKAGE_ID,
        tenantId: TENANT_ID,
      })
    ).rejects.toThrow(PackageQuarantinedError);
  });

  it('SCEN-AUTH-09: Package integrity seal mismatch fails closed', async () => {
    const validToken = authorizer.issueCandidateToken({
      candidateId: CANDIDATE_A,
      tenantId: TENANT_ID,
    });

    packageStore.setPackageStatus({
      packageId: VALID_PACKAGE_ID,
      packageIntegritySeal: 'seal_mismatched_canonical_seal',
      validationStatus: 'VALIDATED',
    });

    await expect(
      authorizer.authorizeCandidateSession({
        credentials: { token: validToken },
        examSessionId: SESSION_A,
        requestedPackageId: VALID_PACKAGE_ID,
        tenantId: TENANT_ID,
      })
    ).rejects.toThrow(PackageSealMismatchError);
  });

  // ==========================================================================
  // 4. Session State Gating (Must be 'ACTIVE')
  // ==========================================================================

  it('SCEN-AUTH-10: Inactive session states strictly reject candidate access', async () => {
    const token = authorizer.issueCandidateToken({
      candidateId: CANDIDATE_A,
      tenantId: TENANT_ID,
    });

    const nonActiveStates: ExamSessionRecord['sessionState'][] = [
      'INITIALIZED',
      'PAUSED',
      'RECOVERY_PENDING',
      'SUBMITTED',
      'EXPIRED',
      'TERMINATED',
    ];

    for (const state of nonActiveStates) {
      sessionStore.setSession(
        createActiveSession({
          examSessionId: `sess_${state.toLowerCase()}`,
          sessionState: state,
        })
      );

      await expect(
        authorizer.authorizeCandidateSession({
          credentials: { token },
          examSessionId: `sess_${state.toLowerCase()}`,
          requestedPackageId: VALID_PACKAGE_ID,
          tenantId: TENANT_ID,
        })
      ).rejects.toThrow(SessionNotActiveError);
    }
  });

  // ==========================================================================
  // 5. Privileged Bypass Isolation ({ isInternalAudit: true } Rejection)
  // ==========================================================================

  it('SCEN-AUTH-11: Candidate authorizer strictly rejects caller-controlled isInternalAudit bypass', async () => {
    const token = authorizer.issueCandidateToken({
      candidateId: CANDIDATE_A,
      tenantId: TENANT_ID,
    });

    await expect(
      authorizer.authorizeCandidateSession({
        credentials: { token },
        examSessionId: SESSION_A,
        requestedPackageId: VALID_PACKAGE_ID,
        tenantId: TENANT_ID,
        isInternalAudit: true, // Caller attempted to inject privileged flag
      } as any)
    ).rejects.toThrow(PrivilegedBypassAttemptError);
  });

  it('SCEN-AUTH-12: Candidate projection gateway rejects isInternalAudit bypass on getTier3StudentLiveProjection', async () => {
    await expect(
      (projectionGateway as any).getTier3StudentLiveProjection(VALID_PACKAGE_ID, {
        isInternalAudit: true,
        tenantId: TENANT_ID,
        examSessionId: SESSION_A,
        candidateId: CANDIDATE_A,
      })
    ).rejects.toThrow('PRIVILEGED_BYPASS_FORBIDDEN');
  });

  // ==========================================================================
  // 6. Cryptographic Context Sealing & End-to-End Live Projection
  // ==========================================================================

  it('SCEN-AUTH-13: Legitimate candidate receives signed context and live projection strips all answer keys', async () => {
    const token = authorizer.issueCandidateToken({
      candidateId: CANDIDATE_A,
      tenantId: TENANT_ID,
    });

    const verifiedContext = await authorizer.authorizeCandidateSession({
      credentials: { token },
      examSessionId: SESSION_A,
      requestedPackageId: VALID_PACKAGE_ID,
      tenantId: TENANT_ID,
    });

    expect(verifiedContext.isVerifiedCandidateContext).toBe(true);
    expect(verifiedContext.candidateId).toBe(CANDIDATE_A);
    expect(verifiedContext.tenantId).toBe(TENANT_ID);
    expect(verifiedContext.contextSignature).toBeDefined();

    // Context signature is cryptographically valid
    expect(authorizer.verifyContext(verifiedContext)).toBe(true);

    // Consume through CanonicalProjectionGateway
    const liveProjection = await projectionGateway.getTier3StudentLiveProjection(
      VALID_PACKAGE_ID,
      verifiedContext
    );

    expect(liveProjection.projectionTier).toBe('TIER_3_STUDENT_LIVE');
    expect(liveProjection.questions.length).toBe(1);

    // Air-gap check: zero answer keys, zero scoring policies, zero discrepancies
    const question = liveProjection.questions[0];
    expect((question as any).authoritativeAnswer).toBeUndefined();
    expect((question as any).scoringRules).toBeUndefined();
    expect((question as any).sourceDiscrepancies).toBeUndefined();
  });

  it('SCEN-AUTH-14: Tampered VerifiedCandidateSessionContext is rejected by projection gateway', async () => {
    const token = authorizer.issueCandidateToken({
      candidateId: CANDIDATE_A,
      tenantId: TENANT_ID,
    });

    const verifiedContext = await authorizer.authorizeCandidateSession({
      credentials: { token },
      examSessionId: SESSION_A,
      requestedPackageId: VALID_PACKAGE_ID,
      tenantId: TENANT_ID,
    });

    // Attacker tampers with tenantId in verified context
    const tamperedContext: VerifiedCandidateSessionContext = {
      ...verifiedContext,
      tenantId: 'tenant_spoofed_victim',
    };

    await expect(
      projectionGateway.getTier3StudentLiveProjection(VALID_PACKAGE_ID, tamperedContext)
    ).rejects.toThrow('INVALID_VERIFIED_CONTEXT');
  });

  // ==========================================================================
  // 7. Submission Ingestion Gateway Candidate Identity Verification
  // ==========================================================================

  it('SCEN-AUTH-15: Submission ingestion gateway rejects candidate mismatch on session', async () => {
    // In-memory mock adapter for submission ingestion testing
    const mockPostgresAdapter: any = {
      withTransaction: async (tenantId: string, cb: any) => {
        const mockClient: any = {
          query: async (sql: string, params: any[]) => {
            if (sql.includes('candidate_submission_events WHERE')) {
              return { rows: [] }; // No existing submission
            }
            if (sql.includes('SELECT * FROM public.exam_sessions')) {
              return {
                rows: [
                  {
                    exam_session_id: SESSION_A,
                    tenant_id: TENANT_ID,
                    candidate_id: CANDIDATE_A, // Belongs to Candidate A
                    package_id: VALID_PACKAGE_ID,
                    package_integrity_seal: VALID_SEAL,
                    session_configuration: {},
                    session_state: 'ACTIVE',
                    state_version: 1,
                    current_lease_id: 'lease_001',
                    lease_heartbeat_at: new Date(),
                    scheduled_start_at: new Date(Date.now() - 600000),
                    actual_started_at: new Date(Date.now() - 600000),
                    duration_seconds: 3600,
                    accumulated_pause_seconds: 0,
                    pause_count: 0,
                    submitted_at: null,
                    expired_at: null,
                    terminated_at: null,
                    created_at: new Date(),
                    updated_at: new Date(),
                  },
                ],
              };
            }
            if (sql.includes('clock_timestamp')) {
              return { rows: [{ server_now: new Date() }] };
            }
            if (sql.includes('nextval')) {
              return { rows: [{ next_seq: '1' }] };
            }
            return { rows: [] };
          },
        };
        return cb(mockClient);
      },
    };

    const ingestionGateway = new SubmissionIngestionGateway(
      mockPostgresAdapter as any,
      {} as any,
      { signingSecret: SIGNING_SECRET }
    );

    // Attacker sends submission claiming candidateId: CANDIDATE_B on Candidate A's session
    const maliciousEnvelope = {
      clientEventId: 'evt_malicious_001',
      examSessionId: SESSION_A,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_B, // Mismatch!
      packageId: VALID_PACKAGE_ID,
      packageIntegritySeal: VALID_SEAL,
      canonicalQuestionId: 'cq_001',
      representationId: 'rep_001',
      clientSequenceNumber: 1,
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_1' },
      clientTimestamp: new Date().toISOString(),
    };

    await expect(ingestionGateway.ingestSubmission(maliciousEnvelope)).rejects.toThrow(
      SubmissionCandidateMismatchError
    );
  });

  // ==========================================================================
  // 8. Untrusted Issuer & Wrong Audience Invariants
  // ==========================================================================

  it('SCEN-AUTH-16: Token with valid cryptographic signature but UNTRUSTED ISSUER fails closed', async () => {
    const untrustedIssuerToken = authorizer.issueCandidateToken(
      { candidateId: CANDIDATE_A, tenantId: TENANT_ID },
      'https://malicious-issuer.com/auth' // Wrong issuer
    );

    await expect(
      authorizer.authorizeCandidateSession({
        credentials: { token: untrustedIssuerToken },
        examSessionId: SESSION_A,
        requestedPackageId: VALID_PACKAGE_ID,
        tenantId: TENANT_ID,
      })
    ).rejects.toThrow('TOKEN_ISSUER_UNTRUSTED');
  });

  it('SCEN-AUTH-17: Token with valid cryptographic signature but WRONG AUDIENCE fails closed', async () => {
    const wrongAudienceToken = authorizer.issueCandidateToken(
      { candidateId: CANDIDATE_A, tenantId: TENANT_ID },
      'https://mock.ai/auth',
      'anon' // Wrong audience (e.g. anon instead of authenticated)
    );

    await expect(
      authorizer.authorizeCandidateSession({
        credentials: { token: wrongAudienceToken },
        examSessionId: SESSION_A,
        requestedPackageId: VALID_PACKAGE_ID,
        tenantId: TENANT_ID,
      })
    ).rejects.toThrow('TOKEN_AUDIENCE_MISMATCH');
  });

  // ==========================================================================
  // 9. Enforced Privileged Internal Audit Boundary
  // ==========================================================================

  it('SCEN-AUTH-18: Candidate attempt to call getTier3LiveProjectionForInternalAudit with unverified object fails closed', async () => {
    await expect(
      (projectionGateway as any).getTier3LiveProjectionForInternalAudit(VALID_PACKAGE_ID, {
        isInternalAudit: true,
        auditReason: 'candidate attempting privilege escalation',
      })
    ).rejects.toThrow('FORBIDDEN_AUDIT_AUTHORIZATION');
  });

  it('SCEN-AUTH-19: Candidate attempt to call getTier2StaffReviewProjectionForInternalAudit with unverified object fails closed', async () => {
    await expect(
      (projectionGateway as any).getTier2StaffReviewProjectionForInternalAudit(VALID_PACKAGE_ID, {
        isInternalAudit: true,
        auditReason: 'candidate attempting privilege escalation',
      })
    ).rejects.toThrow('FORBIDDEN_AUDIT_AUTHORIZATION');
  });

  it('SCEN-AUTH-20: Candidate attempt to call getTier4PostExamProjectionForInternalAudit with unverified object fails closed', async () => {
    await expect(
      (projectionGateway as any).getTier4PostExamProjectionForInternalAudit(VALID_PACKAGE_ID, {
        isInternalAudit: true,
        auditReason: 'candidate attempting privilege escalation',
      })
    ).rejects.toThrow('FORBIDDEN_AUDIT_AUTHORIZATION');
  });

  it('SCEN-AUTH-21: Legitimate staff audit token with SYSTEM_CERTIFICATION succeeds on internal audit method', async () => {
    const staffToken = authorizer.issueStaffAuditToken({
      staffUserId: 'staff_system_auditor_007',
      role: 'system_auditor',
      purpose: 'SYSTEM_CERTIFICATION',
    });

    const verifiedAuditContext = await authorizer.authorizeStaffAudit(staffToken);
    expect(verifiedAuditContext.isVerifiedPrivilegedAudit).toBe(true);
    expect(verifiedAuditContext.role).toBe('system_auditor');
    expect(authorizer.verifyPrivilegedAuditContext(verifiedAuditContext)).toBe(true);

    const auditLive = await projectionGateway.getTier3LiveProjectionForInternalAudit(
      VALID_PACKAGE_ID,
      verifiedAuditContext
    );
    expect(auditLive.projectionTier).toBe('TIER_3_STUDENT_LIVE');
    expect(auditLive.questions.length).toBe(1);
  });

  it('SCEN-AUTH-22: Frozen staff review masking contract: Tier 2 review questions omit answer keys by default', async () => {
    const staffToken = authorizer.issueStaffAuditToken({
      staffUserId: 'staff_reviewer_001',
      role: 'staff',
      purpose: 'STAFF_REVIEW',
    });

    const verifiedAuditContext = await authorizer.authorizeStaffAudit(staffToken);
    const staffProjection = await projectionGateway.getTier2StaffReviewProjectionForInternalAudit(
      VALID_PACKAGE_ID,
      verifiedAuditContext
    );

    expect(staffProjection.projectionTier).toBe('TIER_2_STAFF_REVIEW');
    const question = staffProjection.questions[0];
    // Under frozen masking contract, Tier 2 review questions have zero answer key leakage
    expect((question as any).authoritativeAnswer).toBeUndefined();
    expect((question as any).scoringRules).toBeUndefined();
  });

  // ==========================================================================
  // 10. Anti-TOCTOU Re-verification Invariant
  // ==========================================================================

  it('SCEN-AUTH-23: TOCTOU race: Session transitions from ACTIVE to TERMINATED after authorizer issue -> Projection Gateway revokes access', async () => {
    const token = authorizer.issueCandidateToken({
      candidateId: CANDIDATE_A,
      tenantId: TENANT_ID,
    });

    // 1. Candidate authorizes session when ACTIVE
    const verifiedContext = await authorizer.authorizeCandidateSession({
      credentials: { token },
      examSessionId: SESSION_A,
      requestedPackageId: VALID_PACKAGE_ID,
      tenantId: TENANT_ID,
    });
    expect(verifiedContext.isVerifiedCandidateContext).toBe(true);

    // 2. Proctor terminates session concurrently in database before projection is fetched
    sessionStore.setSession(
      createActiveSession({
        examSessionId: SESSION_A,
        sessionState: 'TERMINATED',
        terminatedAt: new Date().toISOString(),
      })
    );

    // 3. Projection Gateway re-verifies active status and fails closed
    await expect(
      projectionGateway.getTier3StudentLiveProjection(VALID_PACKAGE_ID, verifiedContext)
    ).rejects.toThrow('SESSION_STATE_STALE');
  });

  // ==========================================================================
  // 11. Staff Authorization & Supabase Auth Provider Invariants
  // ==========================================================================

  it('SCEN-AUTH-24: Forged staff token with untrusted issuer fails closed', async () => {
    // Attacker crafts staff token signed with valid secret but forged issuer
    const untrustedStaffToken = authorizer.issueStaffAuditToken({
      staffUserId: 'attacker_staff',
      role: 'staff',
      purpose: 'STAFF_REVIEW',
    });
    // Mutate issuer to untrusted domain
    const [h, p] = untrustedStaffToken.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    payload.iss = 'https://untrusted-attacker.com/auth';
    const forgedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const forgedSig = createHmac('sha256', (authorizer as any).signingSecret)
      .update(`${h}.${forgedPayloadB64}`)
      .digest('base64url');
    const forgedToken = `${h}.${forgedPayloadB64}.${forgedSig}`;

    await expect(
      authorizer.authorizeStaffAudit(forgedToken)
    ).rejects.toThrow('Untrusted staff token issuer.');
  });

  it('SCEN-AUTH-25: Candidate token attempting to authenticate as staff in authorizeStaffAudit fails closed', async () => {
    // Candidate attempts to pass candidate JWT into privileged authorizeStaffAudit endpoint
    const candidateToken = authorizer.issueCandidateToken({
      candidateId: CANDIDATE_A,
      tenantId: TENANT_ID,
    });

    await expect(
      authorizer.authorizeStaffAudit(candidateToken)
    ).rejects.toThrow('INSUFFICIENT_STAFF_ROLE');
  });

  it('SCEN-AUTH-26: Staff token with unauthorized purpose fails closed', async () => {
    // Attacker mints staff token with unauthorized purpose
    const payload = {
      iss: 'https://mock.ai/auth',
      aud: 'authenticated',
      sub: 'staff_rogue',
      tid: 'system',
      role: 'staff',
      purpose: 'UNAUTHORIZED_EXFILTRATION',
      exp: Math.floor(Date.now() / 1000) + 1800,
      iat: Math.floor(Date.now() / 1000),
    };
    const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', (authorizer as any).signingSecret)
      .update(`${h}.${p}`)
      .digest('base64url');
    const rogueToken = `${h}.${p}.${sig}`;

    await expect(
      authorizer.authorizeStaffAudit(rogueToken)
    ).rejects.toThrow('Audit purpose \'UNAUTHORIZED_EXFILTRATION\' is not recognized.');
  });

  it('SCEN-AUTH-27: Authoritative staff role provider revocation rejects staff audit request', async () => {
    // Authoritative staff role provider checks database/RPC
    const mockStaffProvider: IStaffRoleProvider = {
      getStaffAuthStatus: async (userId: string) => {
        if (userId === 'revoked_staff_member') {
          return { isStaff: false, role: null };
        }
        return { isStaff: true, role: 'staff' };
      },
    };

    const authorizerWithStaffProvider = new CandidateSessionAuthorizer(
      sessionStore,
      packageStore,
      {
        signingSecret: 'test_signing_secret_32_bytes_super_secure!',
        staffRoleProvider: mockStaffProvider,
      }
    );

    const revokedStaffToken = authorizerWithStaffProvider.issueStaffAuditToken({
      staffUserId: 'revoked_staff_member',
      role: 'staff',
      purpose: 'STAFF_REVIEW',
    });

    await expect(
      authorizerWithStaffProvider.authorizeStaffAudit(revokedStaffToken)
    ).rejects.toThrow('STAFF_AUTHORIZATION_REVOKED');
  });

  it('SCEN-AUTH-28: SupabaseAuthAuthority rejects unauthenticated candidate token', async () => {
    const mockSupabaseClient = {
      auth: {
        getUser: async (jwt: string) => {
          if (jwt === 'valid_supabase_token') {
            return {
              data: {
                user: {
                  id: 'supabase_candidate_123',
                  app_metadata: { tenant_id: TENANT_ID, roles: ['candidate'] },
                  user_metadata: {},
                },
              },
              error: null,
            };
          }
          return {
            data: { user: null },
            error: { message: 'Invalid token signature or expired session' },
          };
        },
      },
    };

    const supabaseAuthority = new SupabaseAuthAuthority(
      'https://mockai-test.supabase.co',
      undefined,
      mockSupabaseClient
    );

    // 1. Invalid token fails
    await expect(
      supabaseAuthority.verifyCandidateToken('forged_fake_token')
    ).rejects.toThrow('Invalid token signature or expired session');

    // 2. Valid token succeeds and resolves authoritative principal
    const principal = await supabaseAuthority.verifyCandidateToken('valid_supabase_token');
    expect(principal.candidateId).toBe('supabase_candidate_123');
    expect(principal.tenantId).toBe(TENANT_ID);
    expect(principal.issuer).toBe('https://mockai-test.supabase.co/auth/v1');
  });

  it('SCEN-AUTH-29: Production environment without explicit UADUE_AUTH_SIGNING_SECRET fails closed', () => {
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.UADUE_AUTH_SIGNING_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.UADUE_AUTH_SIGNING_SECRET;

      expect(() => {
        new CandidateSessionAuthorizer(sessionStore, packageStore, {
          // No explicit signing secret
        });
      }).toThrow('MISSING_AUTH_SECRET');
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origSecret) process.env.UADUE_AUTH_SIGNING_SECRET = origSecret;
    }
  });

  it('SCEN-AUTH-30: Client-side browser context without allowClientSigning strictly blocks token issuance', () => {
    const authorizerDisallowingClient = new CandidateSessionAuthorizer(
      sessionStore,
      packageStore,
      {
        signingSecret: 'test_signing_secret_32_bytes_super_secure!',
        allowClientSigning: false,
      }
    );

    // Mock browser window object
    (globalThis as any).window = {};

    try {
      expect(() => {
        authorizerDisallowingClient.issueCandidateToken({
          candidateId: CANDIDATE_A,
          tenantId: TENANT_ID,
        });
      }).toThrow('CLIENT_SIGNING_FORBIDDEN');

      expect(() => {
        authorizerDisallowingClient.issueStaffAuditToken({
          staffUserId: 'staff_1',
          role: 'staff',
          purpose: 'STAFF_REVIEW',
        });
      }).toThrow('CLIENT_SIGNING_FORBIDDEN');
    } finally {
      delete (globalThis as any).window;
    }
  });

  it('SCEN-AUTH-31: Concurrent state transition (ACTIVE -> TERMINATED/PAUSED) during retrieval fails closed with SESSION_STATE_STALE', async () => {
    // Setup an active session
    const activeSession = createActiveSession({ examSessionId: 'sess_race_1' });
    sessionStore.setSession(activeSession);

    // Issue valid candidate context
    const verifiedContext = await authorizer.authorizeCandidateSession({
      examSessionId: activeSession.examSessionId,
      requestedPackageId: pipelinePackage.packageId,
      tenantId: TENANT_ID,
      credentials: {
        principal: {
          candidateId: CANDIDATE_A,
          tenantId: TENANT_ID,
        },
      },
    });

    // Simulate concurrent transition: another process terminates session before post-check
    const originalGetExamSession = sessionStore.getExamSession.bind(sessionStore);
    let callCount = 0;
    sessionStore.getExamSession = async (sId, tId) => {
      callCount++;
      const s = await originalGetExamSession(sId, tId);
      if (callCount >= 2 && s) {
        // Transition to TERMINATED mid-flight
        return { ...s, sessionState: 'TERMINATED' };
      }
      return s;
    };

    // Candidate projection MUST fail closed and revoke projection
    await expect(
      projectionGateway.getTier3StudentLiveProjection(pipelinePackage.packageId, verifiedContext)
    ).rejects.toThrow('SESSION_STATE_STALE');

    sessionStore.getExamSession = originalGetExamSession;
  });

  it('SCEN-AUTH-32: Cross-tenant session ID substitution fails closed with SESSION_NOT_FOUND', async () => {
    // Session belongs to OTHER_TENANT_ID
    const otherTenantSession = createActiveSession({
      examSessionId: 'sess_other_tenant',
      tenantId: OTHER_TENANT_ID,
    });
    sessionStore.setSession(otherTenantSession);

    // Attacker sends request with tenantId: TENANT_ID but examSessionId: 'sess_other_tenant'
    await expect(
      authorizer.authorizeCandidateSession({
        examSessionId: 'sess_other_tenant',
        requestedPackageId: pipelinePackage.packageId,
        tenantId: TENANT_ID,
        credentials: {
          principal: {
            candidateId: CANDIDATE_A,
            tenantId: TENANT_ID,
          },
        },
      })
    ).rejects.toThrow('SESSION_NOT_FOUND');
  });

  it('SCEN-AUTH-33: Candidate Live projection strictly scrubs logicalFamilyId from all questions', async () => {
    const verifiedContext = await authorizer.authorizeCandidateSession({
      examSessionId: SESSION_A,
      requestedPackageId: pipelinePackage.packageId,
      tenantId: TENANT_ID,
      credentials: {
        principal: {
          candidateId: CANDIDATE_A,
          tenantId: TENANT_ID,
        },
      },
    });

    const projection = await projectionGateway.getTier3StudentLiveProjection(pipelinePackage.packageId, verifiedContext);
    expect(projection.questions.length).toBeGreaterThan(0);
    for (const q of projection.questions) {
      expect(q.logicalFamilyId).toBeUndefined();
      expect((q as any).logicalFamilyId).toBeUndefined();
    }
  });
});
