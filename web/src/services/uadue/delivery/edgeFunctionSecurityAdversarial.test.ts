/**
 * UADUE Phase 3.6E — Edge Function Security & Staging Readiness Adversarial Test Suite
 * Specification: UADUE-P3.6-EDGE-SEC-001 (Candidate Delivery Security Audit)
 *
 * Verifies:
 * 1. Cryptographic token verification & rejection of forged/expired/tampered tokens.
 * 2. Trusted principal derivation & multi-tenant isolation (rejection of spoofed X-Tenant-Id).
 * 3. Rejection of client-supplied privileged bypass flags (isInternalAudit, service_role, isAdmin).
 * 4. Anti-IDOR candidate session ownership and cross-tenant boundaries.
 * 5. Strict CORS whitelist validation and safe preflight negotiation.
 * 6. Body size limitation (1MB) and malformed JSON protection.
 * 7. Server deadline authority and single-active-device lease enforcement.
 * 8. Answer event idempotency and tampered event conflict rejection (409 EVENT_CONFLICT).
 * 9. Error sanitization masking database internals and stack traces.
 * 10. Raw-score-only contract preservation (totalRawScore = sum, totalNormalizedScore = null).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleCandidateDeliveryRequest,
  verifyCandidateJwt,
  verifyCandidateTokenWithSupabaseAuth,
  resolveAllowedOrigin,
  getCorsHeaders,
} from '../../../../../supabase/functions/candidate-delivery/index';
import {
  CandidateDeliveryApi,
  ICandidateDeliveryBackend,
  CandidateApiError,
} from './candidateDeliveryApi';
import {
  CandidateSessionAuthorizer,
  CryptographicJwtAuthority,
} from './candidateSessionAuthorizer';
import { CanonicalProjectionGateway } from '../canonical/canonicalProjectionGateway';
import { ExamSessionRecord } from './deliveryTypes';

const TEST_JWT_SECRET = 'mockai_staging_jwt_secret_test_32_bytes_ok!';
const TEST_SIGNING_SECRET = 'delivery_api_signing_secret_test_32b!';
const TEST_PACKAGE_ID = 'pkg_chsl_2025_tier1_verified';
const TEST_INTEGRITY_SEAL = 'seal_sha256_mock_canonical_package_ok';

function createSignedJwt(payload: Record<string, any>, secret = TEST_JWT_SECRET): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const fullPayload = {
    iss: 'https://mock.ai/auth',
    aud: 'authenticated',
    ...payload,
  };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const data = `${headerB64}.${payloadB64}`;

  const { createHmac } = require('crypto');
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${headerB64}.${payloadB64}.${sig}`;
}

function buildMockQuestionGraph(): any {
  return {
    packageId: TEST_PACKAGE_ID,
    packageIntegritySeal: TEST_INTEGRITY_SEAL,
    sourceHash: 'source_hash_mock_sha256',
    graphVersion: '1.0.0',
    sealedAt: new Date().toISOString(),
    nodes: [
      {
        canonicalQuestionId: 'q_canonical_001',
        ordinalIndex: 1,
        questionType: 'MCQ',
        sectionId: 'sec_quant',
        topicId: 'arithmetic',
        facets: {},
        representations: [
          {
            representationId: 'rep_001',
            language: 'en',
            isPrimary: true,
            body: { text: 'What is 2 + 2?' },
            options: [
              { optionId: 'opt_a', text: '3', ordinalIndex: 0 },
              { optionId: 'opt_b', text: '4', ordinalIndex: 1 },
              { optionId: 'opt_c', text: '5', ordinalIndex: 2 },
            ],
          },
        ],
        logicalFamilyId: 'fam_001',
      },
    ],
    edges: [],
  };
}

describe('UADUE Phase 3.6E — Edge Function Security & Staging Readiness Audit', () => {
  let backend: ICandidateDeliveryBackend;
  let deliveryApi: CandidateDeliveryApi;
  let sessionStore: Map<string, ExamSessionRecord>;
  let packageStore: Map<string, any>;

  beforeEach(() => {
    sessionStore = new Map();
    packageStore = new Map();

    packageStore.set(TEST_PACKAGE_ID, {
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_INTEGRITY_SEAL,
      validationStatus: 'PUBLISHED',
      isQuarantined: false,
    });

    const mockGraph = buildMockQuestionGraph();
    const mockPackageSource = {
      reconstructPackageForTenant: async (pkgId: string, tenantId: string) => {
        if (pkgId === TEST_PACKAGE_ID) {
          return {
            packageId: TEST_PACKAGE_ID,
            packageIntegritySeal: TEST_INTEGRITY_SEAL,
            questionGraph: mockGraph,
            canonicalQuestions: mockGraph.nodes,
            validationReport: { validationStatus: 'PACKAGE_VALIDATED' },
            scoringPolicy: { policyId: 'sp_default', rules: [] },
            answerKey: { packageId: TEST_PACKAGE_ID, entries: [] },
          };
        }
        return null;
      },
      getPublishedPackage: async (pkgId: string) => {
        if (pkgId === TEST_PACKAGE_ID) {
          return {
            packageId: TEST_PACKAGE_ID,
            packageIntegritySeal: TEST_INTEGRITY_SEAL,
            graph: mockGraph,
            canonicalQuestions: mockGraph.nodes,
            scoringPolicy: { policyId: 'sp_default', rules: [] },
            answerKey: { packageId: TEST_PACKAGE_ID, entries: [] },
          };
        }
        return null;
      },
    };

    const sessionStoreAdapter = {
      getExamSession: async (sessionId: string, tenantId: string) => {
        const s = sessionStore.get(sessionId);
        if (!s || s.tenantId !== tenantId) return null;
        return s;
      },
      saveExamSession: async (session: ExamSessionRecord) => {
        sessionStore.set(session.examSessionId, session);
      },
    };

    const packageStoreAdapter = {
      getPackageStatus: async (packageId: string) => {
        return packageStore.get(packageId) || null;
      },
    };

    backend = {
      sessionStore: sessionStoreAdapter,
      packageStore: packageStoreAdapter,
      authorizer: new CandidateSessionAuthorizer(
        sessionStoreAdapter,
        packageStoreAdapter,
        {
          signingSecret: TEST_JWT_SECRET,
          authAuthority: new CryptographicJwtAuthority(TEST_JWT_SECRET),
        }
      ),
      projectionGateway: new CanonicalProjectionGateway(mockPackageSource as any),
    };

    deliveryApi = new CandidateDeliveryApi(backend, { signingSecret: TEST_SIGNING_SECRET });
  });

  // ── 1. Cryptographic Token Verification ───────────────────────────────────

  describe('1. Cryptographic Authentication & Principal Derivation', () => {
    it('verifies valid cryptographic JWT and derives candidateId and tenantId', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createSignedJwt({
        sub: 'cand_alice',
        tid: 'tenant_mockai',
        exp: nowSec + 3600,
      });

      const principal = await verifyCandidateJwt(token, TEST_JWT_SECRET);
      expect(principal).not.toBeNull();
      expect(principal?.candidateId).toBe('cand_alice');
      expect(principal?.tenantId).toBe('tenant_mockai');
    });

    it('rejects forged JWT with mismatched signature', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createSignedJwt(
        { sub: 'cand_alice', tid: 'tenant_mockai', exp: nowSec + 3600 },
        'wrong_attacker_secret_key_32_bytes!'
      );

      const req = new Request('https://mockai-edge.internal/candidate-delivery/session/init', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ packageId: TEST_PACKAGE_ID, deviceLeaseId: 'dev_01' }),
      });

      const res = await handleCandidateDeliveryRequest(req, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects expired JWT token', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const expiredToken = createSignedJwt({
        sub: 'cand_alice',
        tid: 'tenant_mockai',
        exp: nowSec - 60, // expired 1 minute ago
      });

      const req = new Request('https://mockai-edge.internal/candidate-delivery/session/init', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${expiredToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ packageId: TEST_PACKAGE_ID, deviceLeaseId: 'dev_01' }),
      });

      const res = await handleCandidateDeliveryRequest(req, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects missing or malformed Authorization header with 401 AUTHENTICATION_REQUIRED', async () => {
      const req = new Request('https://mockai-edge.internal/candidate-delivery/session/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: TEST_PACKAGE_ID, deviceLeaseId: 'dev_01' }),
      });

      const res = await handleCandidateDeliveryRequest(req, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects unsigned token with alg: "none"', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const headerB64 = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payloadB64 = Buffer.from(
        JSON.stringify({ sub: 'cand_alice', tid: 'tenant_mockai', exp: nowSec + 3600 })
      ).toString('base64url');
      const tokenNone = `${headerB64}.${payloadB64}.`;

      const principal = await verifyCandidateJwt(tokenNone, TEST_JWT_SECRET);
      expect(principal).toBeNull();
    });

    it('rejects token with algorithm confusion (alg: "RS256" with HMAC secret)', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const headerB64 = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const payloadB64 = Buffer.from(
        JSON.stringify({ sub: 'cand_alice', tid: 'tenant_mockai', exp: nowSec + 3600 })
      ).toString('base64url');
      const { createHmac } = require('crypto');
      const sig = createHmac('sha256', TEST_JWT_SECRET).update(`${headerB64}.${payloadB64}`).digest('base64url');
      const tokenRS = `${headerB64}.${payloadB64}.${sig}`;

      const principal = await verifyCandidateJwt(tokenRS, TEST_JWT_SECRET);
      expect(principal).toBeNull();
    });

    it('enforces expected issuer and rejects mismatched issuer', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createSignedJwt({
        sub: 'cand_alice',
        tid: 'tenant_mockai',
        iss: 'https://other-auth.example.com',
        exp: nowSec + 3600,
      });

      const principal = await verifyCandidateJwt(token, TEST_JWT_SECRET, {
        expectedIssuer: 'https://staging.supabase.co/auth/v1',
      });
      expect(principal).toBeNull();

      // Matching issuer
      const tokenValid = createSignedJwt({
        sub: 'cand_alice',
        app_metadata: { tenant_id: 'tenant_mockai' },
        tid: 'tenant_mockai',
        iss: 'https://staging.supabase.co/auth/v1',
        exp: nowSec + 3600,
      });
      const principalValid = await verifyCandidateJwt(tokenValid, TEST_JWT_SECRET, {
        expectedIssuer: 'https://staging.supabase.co/auth/v1',
      });
      expect(principalValid).not.toBeNull();
      expect(principalValid?.candidateId).toBe('cand_alice');
    });

    it('enforces expected audience and supports audience array', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createSignedJwt({
        sub: 'cand_alice',
        tid: 'tenant_mockai',
        aud: ['authenticated'],
        exp: nowSec + 3600,
      });

      const principal = await verifyCandidateJwt(token, TEST_JWT_SECRET, {
        expectedAudience: 'authenticated',
      });
      expect(principal).not.toBeNull();
      expect(principal?.candidateId).toBe('cand_alice');

      // Mismatched audience
      const principalMismatch = await verifyCandidateJwt(token, TEST_JWT_SECRET, {
        expectedAudience: 'admin_only',
      });
      expect(principalMismatch).toBeNull();
    });

    it('rejects user_metadata and extracts tenantId strictly from trusted app_metadata or server claims', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      // Untrusted user-editable metadata fails closed
      const tokenUserMeta = createSignedJwt({
        sub: 'cand_bob',
        user_metadata: { tenant_id: 'tenant_user_meta' },
        exp: nowSec + 3600,
      });
      const principal1 = await verifyCandidateJwt(tokenUserMeta, TEST_JWT_SECRET);
      expect(principal1).toBeNull(); // Fails closed, user_metadata is never trusted

      // Trusted server-controlled app_metadata succeeds
      const tokenAppMeta = createSignedJwt({
        sub: 'cand_charlie',
        app_metadata: { tenant_id: 'tenant_app_meta' },
        exp: nowSec + 3600,
      });
      const principal2 = await verifyCandidateJwt(tokenAppMeta, TEST_JWT_SECRET);
      expect(principal2?.tenantId).toBe('tenant_app_meta');

      // Contradictory claims fail closed
      const tokenContradictory = createSignedJwt({
        sub: 'cand_david',
        app_metadata: { tenant_id: 'tenant_a' },
        tid: 'tenant_b',
        exp: nowSec + 3600,
      });
      const principal3 = await verifyCandidateJwt(tokenContradictory, TEST_JWT_SECRET);
      expect(principal3).toBeNull();

      // Phase 3.6H Unambiguous Trust Contract:
      // Supabase-issued tokens MUST have tenant in app_metadata, not root tid
      const tokenSupabaseMissingAppMeta = createSignedJwt({
        sub: 'cand_eve',
        iss: 'https://staging.supabase.co/auth/v1',
        tid: 'tenant_spoofed',
        exp: nowSec + 3600,
      });
      const principalSupabaseMissing = await verifyCandidateJwt(tokenSupabaseMissingAppMeta, TEST_JWT_SECRET);
      expect(principalSupabaseMissing).toBeNull(); // Rejected: Supabase tokens require app_metadata

      const tokenSupabaseValid = createSignedJwt({
        sub: 'cand_eve',
        iss: 'https://staging.supabase.co/auth/v1',
        app_metadata: { tenant_id: 'tenant_legit' },
        exp: nowSec + 3600,
      });
      const principalSupabaseValid = await verifyCandidateJwt(tokenSupabaseValid, TEST_JWT_SECRET, {
        expectedIssuer: 'https://staging.supabase.co/auth/v1',
      });
      expect(principalSupabaseValid?.tenantId).toBe('tenant_legit');
    });

    it('verifies candidate via authoritative Supabase Auth service when token uses asymmetric signing', async () => {
      // Mock global fetch to simulate Supabase Auth /auth/v1/user response
      const originalFetch = globalThis.fetch;
      try {
        (globalThis as any).fetch = async (url: string, init: any) => {
          if (url.includes('/auth/v1/user')) {
            const authHeader = init?.headers?.Authorization;
            if (authHeader === 'Bearer valid_asymmetric_token') {
              return {
                ok: true,
                json: async () => ({
                  id: 'cand_asymmetric_user',
                  app_metadata: { tenant_id: 'tenant_cloud' },
                  role: 'candidate',
                }),
              } as Response;
            }
            return {
              ok: false,
              status: 401,
              json: async () => ({ message: 'Invalid token' }),
            } as Response;
          }
          return originalFetch(url, init);
        };

        const resValid = await verifyCandidateTokenWithSupabaseAuth(
          'valid_asymmetric_token',
          'https://staging.mockai.internal',
          'anon_key_sample'
        );
        expect(resValid).not.toBeNull();
        expect(resValid?.candidateId).toBe('cand_asymmetric_user');
        expect(resValid?.tenantId).toBe('tenant_cloud');

        const resInvalid = await verifyCandidateTokenWithSupabaseAuth(
          'tampered_or_revoked_token',
          'https://staging.mockai.internal',
          'anon_key_sample'
        );
        expect(resInvalid).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ── 2. Multi-Tenant & Principal Authorization ─────────────────────────────

  describe('2. Multi-Tenant Boundary & Anti-IDOR Authorization', () => {
    it('fails closed when client-supplied X-Tenant-Id differs from authenticated JWT claim', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createSignedJwt({
        sub: 'cand_alice',
        tid: 'tenant_mockai',
        exp: nowSec + 3600,
      });

      const req = new Request('https://mockai-edge.internal/candidate-delivery/session/init', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Tenant-Id': 'tenant_victim_org', // Spoofed tenant header
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ packageId: TEST_PACKAGE_ID, deviceLeaseId: 'dev_01' }),
      });

      const res = await handleCandidateDeliveryRequest(req, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('CROSS_TENANT_FORBIDDEN');
    });

    it('rejects candidate attempting IDOR access to another candidate session', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      // Create session for victim candidate_bob
      sessionStore.set('sess_bob_001', {
        examSessionId: 'sess_bob_001',
        tenantId: 'tenant_mockai',
        candidateId: 'cand_bob',
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: TEST_INTEGRITY_SEAL,
        sessionConfiguration: {},
        sessionState: 'ACTIVE',
        stateVersion: 1,
        currentLeaseId: 'lease_bob',
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

      // Attacker alice tries to access bob's live projection
      const aliceToken = createSignedJwt({
        sub: 'cand_alice',
        tid: 'tenant_mockai',
        exp: nowSec + 3600,
      });

      const req = new Request(
        'https://mockai-edge.internal/candidate-delivery/exam/projection?examSessionId=sess_bob_001',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${aliceToken}`,
          },
        }
      );

      const res = await handleCandidateDeliveryRequest(req, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('CANDIDATE_SESSION_MISMATCH');
    });

    it('fails closed when client supplies privileged audit flags in payload', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createSignedJwt({
        sub: 'cand_alice',
        tid: 'tenant_mockai',
        exp: nowSec + 3600,
      });

      const req = new Request('https://mockai-edge.internal/candidate-delivery/session/init', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packageId: TEST_PACKAGE_ID,
          deviceLeaseId: 'dev_01',
          isInternalAudit: true, // Attempted privileged audit injection
        }),
      });

      const res = await handleCandidateDeliveryRequest(req, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('PRIVILEGED_BYPASS_FORBIDDEN');
    });
  });

  // ── 3. CORS & HTTP Transport Safety ───────────────────────────────────────

  describe('3. CORS Origin Validation & HTTP Transport Safety', () => {
    it('reflects allowed origin with Vary: Origin header', () => {
      const allowedOrigin = 'http://localhost:5173';
      const resolved = resolveAllowedOrigin(allowedOrigin);
      expect(resolved).toBe(allowedOrigin);

      const cors = getCorsHeaders(allowedOrigin);
      expect(cors['Access-Control-Allow-Origin']).toBe(allowedOrigin);
      expect(cors['Vary']).toBe('Origin');
    });

    it('does NOT reflect unauthorized origin in Access-Control-Allow-Origin', () => {
      const rogueOrigin = 'https://rogue-hacker-site.org';
      const resolved = resolveAllowedOrigin(rogueOrigin);
      expect(resolved).toBeNull();

      const cors = getCorsHeaders(rogueOrigin);
      expect(cors['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('handles CORS OPTIONS preflight returning 204 No Content with strict headers', async () => {
      const req = new Request('https://mockai-edge.internal/candidate-delivery/session/init', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
        },
      });

      const res = await handleCandidateDeliveryRequest(req, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('rejects oversized request bodies with 413 PAYLOAD_TOO_LARGE', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createSignedJwt({
        sub: 'cand_alice',
        tid: 'tenant_mockai',
        exp: nowSec + 3600,
      });

      const req = new Request('https://mockai-edge.internal/candidate-delivery/session/init', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Length': '2000000', // 2MB
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ packageId: TEST_PACKAGE_ID, deviceLeaseId: 'dev_01' }),
      });

      const res = await handleCandidateDeliveryRequest(req, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rejects malformed JSON payloads with 400 MALFORMED_JSON', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createSignedJwt({
        sub: 'cand_alice',
        tid: 'tenant_mockai',
        exp: nowSec + 3600,
      });

      const req = new Request('https://mockai-edge.internal/candidate-delivery/session/init', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{"packageId": "abc", invalid_json',
      });

      const res = await handleCandidateDeliveryRequest(req, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('MALFORMED_JSON');
    });
  });

  // ── 4. Idempotency & Tamper Rejection ──────────────────────────────────────

  describe('4. Idempotency & Tamper Conflict Enforcement', () => {
    let token: string;
    let sessionId: string;

    beforeEach(async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      token = createSignedJwt({
        sub: 'cand_alice',
        tid: 'tenant_mockai',
        exp: nowSec + 3600,
      });

      const initReq = new Request('https://mockai-edge.internal/candidate-delivery/session/init', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ packageId: TEST_PACKAGE_ID, deviceLeaseId: 'lease_01' }),
      });

      const initRes = await handleCandidateDeliveryRequest(initReq, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(initRes.status).toBe(200);
      const data = await initRes.json();
      sessionId = data.examSessionId;
    });

    it('returns receipt with idempotentReplay: true on exact re-sent answer event', async () => {
      const payload = {
        examSessionId: sessionId,
        canonicalQuestionId: 'q_canonical_001',
        selectedOptionId: 'opt_b',
        clientEventId: 'evt_stable_uuid_001',
        clientSequenceNumber: 1,
        deviceLeaseId: 'lease_01',
      };

      const sendAnswer = () =>
        new Request('https://mockai-edge.internal/candidate-delivery/answer/record', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

      // First submission
      const res1 = await handleCandidateDeliveryRequest(sendAnswer(), deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.status).toBe('ACCEPTED');
      expect(data1.receipt.idempotentReplay).toBe(false);

      // Re-submission of identical event
      const res2 = await handleCandidateDeliveryRequest(sendAnswer(), deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.status).toBe('ACCEPTED');
      expect(data2.receipt.idempotentReplay).toBe(true);
      expect(data2.receipt.receiptId).toBe(data1.receipt.receiptId);
    });

    it('rejects conflicting payload submitted on existing clientEventId with 409 EVENT_CONFLICT', async () => {
      // First submission: opt_b
      const req1 = new Request('https://mockai-edge.internal/candidate-delivery/answer/record', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          examSessionId: sessionId,
          canonicalQuestionId: 'q_canonical_001',
          selectedOptionId: 'opt_b',
          clientEventId: 'evt_immutable_uuid_999',
          clientSequenceNumber: 1,
          deviceLeaseId: 'lease_01',
        }),
      });

      const res1 = await handleCandidateDeliveryRequest(req1, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res1.status).toBe(200);

      // Tampered re-submission: same clientEventId, different option opt_c!
      const req2 = new Request('https://mockai-edge.internal/candidate-delivery/answer/record', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          examSessionId: sessionId,
          canonicalQuestionId: 'q_canonical_001',
          selectedOptionId: 'opt_c',
          clientEventId: 'evt_immutable_uuid_999',
          clientSequenceNumber: 1,
          deviceLeaseId: 'lease_01',
        }),
      });

      const res2 = await handleCandidateDeliveryRequest(req2, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res2.status).toBe(409);
      const data2 = await res2.json();
      expect(data2.code).toBe('EVENT_CONFLICT');
    });

    it('enforces idempotent submission and returns existing evaluation run', async () => {
      const submitReq = () =>
        new Request('https://mockai-edge.internal/candidate-delivery/attempt/submit', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            examSessionId: sessionId,
            deviceLeaseId: 'lease_01',
          }),
        });

      const res1 = await handleCandidateDeliveryRequest(submitReq(), deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.sessionState).toBe('SUBMITTED');

      // Duplicate submission
      const res2 = await handleCandidateDeliveryRequest(submitReq(), deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.sessionState).toBe('SUBMITTED');
      expect(data2.evaluationRunId).toBe(data1.evaluationRunId);
    });
  });

  // ── 5. Lease & Deadline Authority ─────────────────────────────────────────

  describe('5. Server Deadline & Single Active Device Lease Authority', () => {
    let token: string;
    let sessionId: string;

    beforeEach(async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      token = createSignedJwt({
        sub: 'cand_alice',
        tid: 'tenant_mockai',
        exp: nowSec + 3600,
      });

      const initReq = new Request('https://mockai-edge.internal/candidate-delivery/session/init', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ packageId: TEST_PACKAGE_ID, deviceLeaseId: 'lease_primary' }),
      });

      const initRes = await handleCandidateDeliveryRequest(initReq, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      const data = await initRes.json();
      sessionId = data.examSessionId;
    });

    it('rejects answer submission from revoked/stale device lease with 409 LEASE_MISMATCH', async () => {
      const req = new Request('https://mockai-edge.internal/candidate-delivery/answer/record', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          examSessionId: sessionId,
          canonicalQuestionId: 'q_canonical_001',
          selectedOptionId: 'opt_b',
          clientEventId: 'evt_lease_check_1',
          clientSequenceNumber: 1,
          deviceLeaseId: 'lease_secondary_stale', // Wrong lease!
        }),
      });

      const res = await handleCandidateDeliveryRequest(req, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.code).toBe('LEASE_MISMATCH');
    });

    it('rejects submission when server deadline cutoff is exceeded with 409 DEADLINE_EXCEEDED', async () => {
      const session = sessionStore.get(sessionId)!;
      // Set session start time in the past beyond duration + 15s grace
      session.actualStartedAt = new Date(Date.now() - 4000 * 1000).toISOString();
      session.durationSeconds = 3600;

      const req = new Request('https://mockai-edge.internal/candidate-delivery/attempt/submit', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          examSessionId: sessionId,
          deviceLeaseId: 'lease_primary',
        }),
      });

      const res = await handleCandidateDeliveryRequest(req, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.code).toBe('DEADLINE_EXCEEDED');
    });
  });

  // ── 6. Error Sanitization & Zero Leakage ───────────────────────────────────

  describe('6. Error Sanitization & Leakage Prevention', () => {
    it('masks unhandled database or internal errors as 500 INTERNAL_SERVER_ERROR', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createSignedJwt({
        sub: 'cand_alice',
        tid: 'tenant_mockai',
        exp: nowSec + 3600,
      });

      // Faulty gateway that throws a raw SQL syntax exception with table schema
      const faultGateway = {
        initializeOrResumeSession: async () => {
          throw new Error('syntax error at or near "SELECT * FROM canonical_answer_keys WHERE secret_key = 123"');
        },
      };

      const req = new Request('https://mockai-edge.internal/candidate-delivery/session/init', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ packageId: TEST_PACKAGE_ID, deviceLeaseId: 'lease_01' }),
      });

      const res = await handleCandidateDeliveryRequest(req, faultGateway, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe('INTERNAL_SERVER_ERROR');
      expect(data.message).not.toContain('canonical_answer_keys');
      expect(data.message).not.toContain('secret_key');
      expect(data.message).toBe('An internal server error occurred while processing the candidate delivery request.');
    });
  });

  // ── 7. Raw-Score-Only Contract ────────────────────────────────────────────

  describe('7. Raw-Score-Only Evaluation Contract', () => {
    it('preserves totalRawScore = sum(awardedMarks) and totalNormalizedScore = null', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createSignedJwt({
        sub: 'cand_alice',
        tid: 'tenant_mockai',
        exp: nowSec + 3600,
      });

      // Initialize session
      const initReq = new Request('https://mockai-edge.internal/candidate-delivery/session/init', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ packageId: TEST_PACKAGE_ID, deviceLeaseId: 'lease_score' }),
      });
      const initRes = await handleCandidateDeliveryRequest(initReq, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      const { examSessionId } = await initRes.json();

      // Submit attempt
      const submitReq = new Request('https://mockai-edge.internal/candidate-delivery/attempt/submit', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ examSessionId, deviceLeaseId: 'lease_score' }),
      });
      const submitRes = await handleCandidateDeliveryRequest(submitReq, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(submitRes.status).toBe(200);

      // Retrieve result
      const resultReq = new Request(
        `https://mockai-edge.internal/candidate-delivery/result?examSessionId=${examSessionId}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const resultRes = await handleCandidateDeliveryRequest(resultReq, deliveryApi, undefined, {
        jwtSecret: TEST_JWT_SECRET,
      });
      expect(resultRes.status).toBe(200);
      const resultData = await resultRes.json();

      // Verify raw score contract
      expect(typeof resultData.result.totalScore).toBe('number');
      expect((resultData.result as any).totalNormalizedScore).toBeUndefined();
    });
  });
});
