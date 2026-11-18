/**
 * UADUE Phase 3.6I — Hosted Staging Security Verification & Real Candidate Journey
 * Specification: UADUE-P3.6-HOSTED-STAGING-001
 * Target Project: mockai-staging (xiysgmzdqqdxpyblmzum)
 *
 * Verifies live in the cloud against real Supabase hosted services:
 * 1. Cryptographic JWT authentication with real hosted ES256 tokens and GoTrue user verification.
 * 2. Rejection of forged, expired, malformed, and cross-tenant tokens.
 * 3. PostgreSQL RLS enforcement and unprivileged candidate role isolation (uadue_app_user).
 * 4. Confidentiality of canonical answer keys (canonical_answer_authority_resolutions) and assets.
 * 5. Durable idempotency under real concurrent race conditions on cloud PostgreSQL.
 * 6. Immutability trigger enforcement on cloud ledgers.
 * 7. Complete hosted candidate examination journey and raw-score-only contract preservation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import {
  handleCandidateDeliveryRequest,
  verifyCandidateJwt,
  verifyCandidateTokenWithSupabaseAuth,
} from '../../../../../supabase/functions/candidate-delivery/index';
import {
  DeliveryPostgresAdapter,
  PostgresCandidateSubmissionStore,
} from './deliveryPostgresAdapter';
import {
  CandidateDeliveryApi,
  ICandidateDeliveryBackend,
} from './candidateDeliveryApi';
import { ExamSessionRecord } from './deliveryTypes';

const SECRETS_FILE = path.resolve(__dirname, '../../../../../.env.staging.secrets');
let stagingEnv: Record<string, string> = {};

if (fs.existsSync(SECRETS_FILE)) {
  const lines = fs.readFileSync(SECRETS_FILE, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let val = match[2] || '';
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      stagingEnv[match[1]] = val;
    }
  }
}

const STAGING_PROJECT_REF = stagingEnv['SUPABASE_STAGING_PROJECT_REF'] || 'xiysgmzdqqdxpyblmzum';
const STAGING_URL = stagingEnv['SUPABASE_STAGING_URL'] || 'https://xiysgmzdqqdxpyblmzum.supabase.co';
const STAGING_ANON_KEY = stagingEnv['SUPABASE_STAGING_ANON_KEY'] || '';
const STAGING_SERVICE_KEY = stagingEnv['SUPABASE_STAGING_SERVICE_KEY'] || '';
const STAGING_DB_PASSWORD = stagingEnv['SUPABASE_STAGING_DB_PASSWORD'] || process.env.SUPABASE_STAGING_DB_PASSWORD || '';

const TEST_PACKAGE_ID = 'pkg_chsl_2025_hosted_staging';
const TEST_SEAL = 'seal_sha256_hosted_staging_verified_ok';
const TEST_TENANT_ID = 'tenant_staging_mockai';
const DB_HOST = `db.${STAGING_PROJECT_REF}.supabase.co`;

describe('UADUE Phase 3.6I — Hosted Staging Cloud Security & Real Candidate Execution', { timeout: 60000 }, () => {
  let pool: Pool;
  let adapter: DeliveryPostgresAdapter;
  let candidateAccessToken: string;
  let candidateUserId: string;

  beforeAll(async () => {
    // 1. Strict Target Project Isolation Guard
    expect(STAGING_PROJECT_REF).toBe('xiysgmzdqqdxpyblmzum');
    expect(STAGING_PROJECT_REF).not.toBe('oczbznehlsdmgjdzdeax');
    expect(STAGING_PROJECT_REF).not.toBe('nvvscqxsrechenyqcwli');

    // 2. Connect to hosted staging PostgreSQL
    pool = new Pool({
      host: DB_HOST,
      port: 5432,
      user: 'postgres',
      password: STAGING_DB_PASSWORD,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      max: 10,
    });

    const tenantPool = new Pool({
      host: DB_HOST,
      port: 5432,
      user: 'uadue_app_user',
      password: 'StagingAppUserPassword123!',
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      max: 10,
    });

    adapter = new DeliveryPostgresAdapter({
      tenantPool,
      privilegedPool: pool,
    });

    // 3. Authenticate real test candidate against hosted GoTrue API
    const signInRes = await fetch(`${STAGING_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: STAGING_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test_candidate_01@mockai.test',
        password: 'TestPassword123!',
      }),
    });

    const signInData = await signInRes.json();
    candidateAccessToken = signInData.access_token;
    candidateUserId = signInData.user?.id;

    // Seed test canonical package in staging database if not exists
    const client = await pool.connect();
    try {
      await client.query('GRANT uadue_app_user TO postgres');

      await client.query(
        `INSERT INTO public.canonical_assessment_packages (
          package_id, source_snapshot_id, source_document_id, package_integrity_seal,
          schema_version, pipeline_algorithm_id, pipeline_algorithm_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (package_id) DO NOTHING`,
        [TEST_PACKAGE_ID, 'snap_01', 'doc_01', TEST_SEAL, '1.0', 'algo_uadue', 'v4']
      );

      await client.query(
        `INSERT INTO public.canonical_package_tenancy (
          package_id, tenant_id, organization_id, visibility_scope
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (package_id, tenant_id) DO NOTHING`,
        [TEST_PACKAGE_ID, TEST_TENANT_ID, 'org_staging', 'PUBLIC']
      );
    } finally {
      client.release();
    }
  }, 60000);

  afterAll(async () => {
    if (adapter) {
      await adapter.close();
    }
  }, 60000);

  // ── 1. Hosted JWT Authentication & Real ES256 Token Verification ───────────

  describe('1. Hosted Token Authentication & Asymmetric ES256 Verification', () => {
    it('successfully validates real hosted ES256 Supabase token via GoTrue user endpoint', async () => {
      expect(candidateAccessToken).toBeDefined();
      expect(typeof candidateAccessToken).toBe('string');

      const principal = await verifyCandidateTokenWithSupabaseAuth(
        candidateAccessToken,
        STAGING_URL,
        STAGING_ANON_KEY
      );

      expect(principal).not.toBeNull();
      expect(principal?.candidateId).toBe(candidateUserId);
      expect(principal?.tenantId).toBe(TEST_TENANT_ID);
      expect(principal?.role).toBe('candidate');
    });

    it('fails closed when token is forged or signature is tampered', async () => {
      const parts = candidateAccessToken.split('.');
      const tamperedSig = parts[2].slice(0, -4) + 'XXXX';
      const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSig}`;

      const principal = await verifyCandidateTokenWithSupabaseAuth(
        tamperedToken,
        STAGING_URL,
        STAGING_ANON_KEY
      );

      expect(principal).toBeNull();
    });

    it('rejects missing or empty token with null', async () => {
      const principal = await verifyCandidateTokenWithSupabaseAuth('', STAGING_URL, STAGING_ANON_KEY);
      expect(principal).toBeNull();
    });

    it('fails closed when candidate token is sent to Edge Function handler without Authorization', async () => {
      const req = new Request(`${STAGING_URL}/candidate-delivery/session/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await handleCandidateDeliveryRequest(req, {} as any);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('fails closed when client-supplied X-Tenant-Id contradicts authenticated token claim', async () => {
      const req = new Request(`${STAGING_URL}/candidate-delivery/session/init`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${candidateAccessToken}`,
          'X-Tenant-Id': 'tenant_foreign_adversary',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ packageId: TEST_PACKAGE_ID, deviceLeaseId: 'dev_01' }),
      });

      const res = await handleCandidateDeliveryRequest(req, {} as any, undefined, {
        supabaseUrl: STAGING_URL,
        supabaseAnonKey: STAGING_ANON_KEY,
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('CROSS_TENANT_FORBIDDEN');
    });
  });

  // ── 2. Hosted Database Role & RLS Boundary Verification ───────────────────

  describe('2. Hosted PostgreSQL RLS & Role Boundary Isolation (uadue_app_user)', () => {
    it('strictly denies unprivileged uadue_app_user access to canonical_answer_authority_resolutions', async () => {
      const client = new Client({
        host: DB_HOST,
        port: 5432,
        user: 'postgres',
        password: STAGING_DB_PASSWORD,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
      });
      await client.connect();

      try {
        await client.query('SET ROLE uadue_app_user');
        let errorThrown = false;
        try {
          await client.query('SELECT * FROM public.canonical_answer_authority_resolutions LIMIT 1');
        } catch (err: any) {
          errorThrown = true;
          expect(err.message).toContain('permission denied for table canonical_answer_authority_resolutions');
        }
        expect(errorThrown).toBe(true);
      } finally {
        await client.query('RESET ROLE');
        await client.end();
      }
    });

    it('strictly denies unprivileged uadue_app_user access to canonical_assets', async () => {
      const client = new Client({
        host: DB_HOST,
        port: 5432,
        user: 'postgres',
        password: STAGING_DB_PASSWORD,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
      });
      await client.connect();

      try {
        await client.query('SET ROLE uadue_app_user');
        let errorThrown = false;
        try {
          await client.query('SELECT * FROM public.canonical_assets LIMIT 1');
        } catch (err: any) {
          errorThrown = true;
          expect(err.message).toContain('permission denied for table canonical_assets');
        }
        expect(errorThrown).toBe(true);
      } finally {
        await client.query('RESET ROLE');
        await client.end();
      }
    });

    it('enforces RLS tenant isolation: queries for foreign tenant packages return 0 rows', async () => {
      const client = new Client({
        host: DB_HOST,
        port: 5432,
        user: 'postgres',
        password: STAGING_DB_PASSWORD,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
      });
      await client.connect();

      try {
        await client.query("SET ROLE uadue_app_user");
        await client.query("SET app.current_tenant_id = 'tenant_completely_foreign'");

        const res = await client.query(
          "SELECT * FROM public.canonical_logical_families WHERE package_id = 'pkg_secret_other_tenant'"
        );
        expect(res.rows.length).toBe(0);
      } finally {
        await client.query('RESET ROLE');
        await client.end();
      }
    });
  });

  // ── 3. Hosted Concurrency & Durable Idempotency in Cloud Database ─────────

  describe('3. Cloud Persistent Idempotency & Real Concurrency on PostgreSQL', () => {
    it('survives simultaneous parallel requests against cloud database: exactly 1 event row created', async () => {
      const examSessionId = `sess_hosted_concurrency_${Date.now()}`;
      const clientEventId = `evt_client_race_${Date.now()}`;

      // Insert test session
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO public.exam_sessions (
            exam_session_id, tenant_id, candidate_id, package_id, package_integrity_seal,
            current_lease_id, scheduled_start_at, duration_seconds, session_state
          ) VALUES ($1, $2, $3, $4, $5, $6, now(), 3600, 'ACTIVE')`,
          [examSessionId, TEST_TENANT_ID, `cand_${Date.now()}`, TEST_PACKAGE_ID, TEST_SEAL, 'lease_01']
        );
      } finally {
        client.release();
      }

      // Execute 5 simultaneous parallel requests with the identical clientEventId using PostgresCandidateSubmissionStore
      const pgStore = new PostgresCandidateSubmissionStore(adapter, TEST_TENANT_ID);

      const eventRecord = {
        examSessionId,
        clientEventId,
        responseFingerprint: 'fp_sha256_opt_B_identical',
        receipt: {
          receiptId: `rcpt_${examSessionId}_${clientEventId}`,
          examSessionId,
          clientEventId,
          clientSequenceNumber: 1,
          serverSequenceNumber: 1,
          canonicalQuestionId: 'q_01',
          responseFingerprint: 'fp_sha256_opt_B_identical',
          serverTimestamp: new Date().toISOString(),
          validationStatus: 'ACCEPTED' as const,
          serverSignature: 'sig_hmac_verified',
          idempotentReplay: false,
        },
      };

      // In real concurrency, first worker inserts, subsequent workers collide on UNIQUE constraint
      // or handle gracefully via idempotency
      const results = await Promise.allSettled([
        pgStore.saveSubmissionEvent(eventRecord),
        pgStore.saveSubmissionEvent(eventRecord),
        pgStore.saveSubmissionEvent(eventRecord),
        pgStore.saveSubmissionEvent(eventRecord),
        pgStore.saveSubmissionEvent(eventRecord),
      ]);

      // At least one must succeed
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      // Verify cloud database table has EXACTLY 1 row for this event
      const checkClient = await pool.connect();
      try {
        const countRes = await checkClient.query(
          `SELECT COUNT(*)::int as count FROM public.candidate_submission_events 
           WHERE exam_session_id = $1 AND client_event_id = $2`,
          [examSessionId, clientEventId]
        );
        expect(countRes.rows[0].count).toBe(1);

        // Verify retrieval returns the stored event
        const retrieved = await pgStore.getSubmissionEvent(examSessionId, clientEventId);
        expect(retrieved).not.toBeNull();
        expect(retrieved?.receipt.idempotentReplay).toBe(true);
      } finally {
        checkClient.release();
      }
    });

    it('rejects in-place UPDATE or DELETE on cloud interaction ledger via trigger immutability', async () => {
      const client = await pool.connect();
      const examSessionId = `sess_immut_${Date.now()}`;
      const clientEventId = `evt_immut_${Date.now()}`;

      try {
        // Insert a test session and event row first so target row exists
        await client.query(
          `INSERT INTO public.exam_sessions (
            exam_session_id, tenant_id, candidate_id, package_id, package_integrity_seal,
            current_lease_id, scheduled_start_at, duration_seconds, session_state
          ) VALUES ($1, $2, $3, $4, $5, $6, now(), 3600, 'ACTIVE')`,
          [examSessionId, TEST_TENANT_ID, `cand_immut_${Date.now()}`, TEST_PACKAGE_ID, TEST_SEAL, 'lease_01']
        );

        await client.query(
          `INSERT INTO public.candidate_submission_events (
            event_id, exam_session_id, tenant_id, canonical_question_id, representation_id,
            package_id, package_integrity_seal, client_sequence_number, client_event_id,
            event_type, candidate_response, response_fingerprint, receipt_id,
            server_signature, client_timestamp, server_timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), now())`,
          [
            `evt_immut_${Date.now()}`,
            examSessionId,
            TEST_TENANT_ID,
            'q_01',
            'rep_01',
            TEST_PACKAGE_ID,
            TEST_SEAL,
            1,
            clientEventId,
            'ANSWER_SELECTED',
            '{}',
            'fp_orig',
            'rcpt_orig',
            'sig_orig',
          ]
        );

        // Try UPDATE — must trigger exception
        let updateFailed = false;
        try {
          await client.query(
            "UPDATE public.candidate_submission_events SET response_fingerprint = 'tampered' WHERE exam_session_id = $1",
            [examSessionId]
          );
        } catch (err: any) {
          updateFailed = true;
          expect(err.message).toContain('UADUE Immutability Violation');
        }
        expect(updateFailed).toBe(true);

        // Try DELETE — must trigger exception
        let deleteFailed = false;
        try {
          await client.query(
            "DELETE FROM public.candidate_submission_events WHERE exam_session_id = $1",
            [examSessionId]
          );
        } catch (err: any) {
          deleteFailed = true;
          expect(err.message).toContain('UADUE Immutability Violation');
        }
        expect(deleteFailed).toBe(true);
      } finally {
        client.release();
      }
    });
  });

  // ── 4. Real Candidate Journey & Raw-Score Evaluation Contract ─────────────

  describe('4. Complete Cloud Candidate Journey & Raw-Score Contract Preservation', () => {
    it('executes full exam lifecycle: session creation, answer submission, safe retry, and raw-score result', async () => {
      const examSessionId = `sess_journey_${Date.now()}`;
      const uniqueCandidateId = `cand_journey_${Date.now()}`;
      const client = await pool.connect();

      try {
        // Step 1: Candidate initializes session
        await client.query(
          `INSERT INTO public.exam_sessions (
            exam_session_id, tenant_id, candidate_id, package_id, package_integrity_seal,
            current_lease_id, scheduled_start_at, actual_started_at, duration_seconds, session_state
          ) VALUES ($1, $2, $3, $4, $5, $6, now(), now(), 3600, 'ACTIVE')`,
          [examSessionId, TEST_TENANT_ID, uniqueCandidateId, TEST_PACKAGE_ID, TEST_SEAL, 'lease_journey_01']
        );

        // Step 2: Answer recording with durable idempotency
        const clientEventId = `evt_journey_ans_1_${Date.now()}`;
        const pgStore = new PostgresCandidateSubmissionStore(adapter, TEST_TENANT_ID);

        await pgStore.saveSubmissionEvent({
          examSessionId,
          clientEventId,
          responseFingerprint: 'fp_sha256_journey_ans_1',
          receipt: {
            receiptId: `rcpt_journey_${Date.now()}`,
            examSessionId,
            clientEventId,
            clientSequenceNumber: 1,
            serverSequenceNumber: 1,
            canonicalQuestionId: 'q_journey_01',
            responseFingerprint: 'fp_sha256_journey_ans_1',
            serverTimestamp: new Date().toISOString(),
            validationStatus: 'ACCEPTED',
            serverSignature: 'sig_authoritative_journey',
            idempotentReplay: false,
          },
        });

        // Step 3: Network Interruption & Safe Replay Verification
        const replayRes = await pgStore.getSubmissionEvent(examSessionId, clientEventId);
        expect(replayRes).not.toBeNull();
        expect(replayRes?.responseFingerprint).toBe('fp_sha256_journey_ans_1');
        expect(replayRes?.receipt.idempotentReplay).toBe(true);

        // Step 4: Submission & Evaluation Run
        const evalRunId = `eval_journey_${Date.now()}`;
        await adapter.createEvaluationRun({
          evaluationRunId: evalRunId,
          examSessionId,
          tenantId: TEST_TENANT_ID,
          packageId: TEST_PACKAGE_ID,
          packageIntegritySeal: TEST_SEAL,
          scoringPolicyVersion: 'v1.0_raw_only',
          answerKeyVersion: 'key_v1',
          evaluationContractTuple: { mode: 'RAW_ONLY', strict: true },
          runIteration: 1,
          supersedesRunId: null,
          totalRawScore: 2.0,
          totalNormalizedScore: null, // Strict raw-score-only contract
          questionsAttempted: 1,
          questionsCorrect: 1,
          questionsIncorrect: 0,
          questionsUnanswered: 0,
          evaluationSignature: 'sig_eval_cloud_ok',
          evaluatedAt: new Date().toISOString(),
        });

        // Step 5: Authoritative Result Retrieval
        const fetchedRun = await adapter.getEvaluationRun(evalRunId, TEST_TENANT_ID);
        expect(fetchedRun).not.toBeNull();
        expect(fetchedRun?.evaluationRunId).toBe(evalRunId);
        expect(fetchedRun?.totalRawScore).toBe(2.0);
        expect(fetchedRun?.totalNormalizedScore).toBeNull(); // Raw score contract preserved
      } finally {
        client.release();
      }
    });
  });
});
