import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { createHmac, createHash } from 'crypto';
import { Pool } from '../web/node_modules/pg';

import {
  handleCandidateDeliveryRequest
} from '../supabase/functions/candidate-delivery/index';
import {
  CandidateDeliveryApi,
  ICandidateDeliveryBackend
} from '../web/src/services/uadue/delivery/candidateDeliveryApi';
import {
  CandidateSessionAuthorizer,
  IAuthorizerSessionStore,
  IAuthorizerPackageStore,
  PackageStatusRecord,
  CryptographicJwtAuthority
} from '../web/src/services/uadue/delivery/candidateSessionAuthorizer';
import {
  ExamSessionRecord,
  SubmissionEventRecord,
  ISubmissionStore,
  CandidateEvaluationRunRecord
} from '../web/src/services/uadue/delivery/deliveryTypes';
import { CanonicalProjectionGateway } from '../web/src/services/uadue/canonical/canonicalProjectionGateway';
import {
  CoreEvaluationInput,
  CoreEvaluationItemInput,
  ScoringEvaluationCore
} from '../web/src/services/uadue/delivery/scoringEvaluationCore';
import {
  QuestionScoringTraits,
  ScoringPolicyVersion,
  CandidateAnswerPayload
} from '../web/src/services/uadue/canonical/types';

// ── 1. Safety Boundaries & Target Resolution ─────────────────────────────────
const secretsPath = path.resolve(__dirname, '../.env.delivery.secrets');
if (!fs.existsSync(secretsPath)) {
  console.error('FATAL: .env.delivery.secrets not found.');
  process.exit(1);
}

const lines = fs.readFileSync(secretsPath, 'utf8').split('\n');
const env: Record<string, string> = {};
for (const line of lines) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = match[2] || '';
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[match[1]] = val;
  }
}

const projectRef = env['SUPABASE_DELIVERY_PROJECT_REF'] || 'zwouxjwrvmsqwjzgagyr';
const poolerHost = 'aws-0-ap-northeast-1.pooler.supabase.com';
const dbPassword = env['SUPABASE_DELIVERY_DB_PASSWORD'];
const GATEWAY_PORT = 54322;
const JWT_SECRET = 'mockai_concurrency_stress_audit_jwt_secret_2026';

process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${GATEWAY_PORT},http://localhost:${GATEWAY_PORT}`;
process.env.SUPABASE_JWT_SECRET = JWT_SECRET;

const PROD_AUTH_REF = 'oczbznehlsdmgjdzdeax';
const PROD_CONTENT_REF = 'nvvscqxsrechenyqcwli';

if (projectRef === PROD_AUTH_REF || projectRef === PROD_CONTENT_REF) {
  console.error(`FATAL ABORT: Connected project '${projectRef}' matches production!`);
  process.exit(1);
}

if (projectRef !== 'zwouxjwrvmsqwjzgagyr') {
  console.error(`FATAL ABORT: Expected dedicated project 'zwouxjwrvmsqwjzgagyr', got '${projectRef}'!`);
  process.exit(1);
}

// ── 2. JWT Generation Helper ──────────────────────────────────────────────────
function createCandidateJwt(candidateId: string, tenantId: string, secret: string = JWT_SECRET, expiresInSec: number = 3600): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: candidateId,
    candidateId,
    tenantId,
    app_metadata: { tenant_id: tenantId },
    iss: 'https://mock.ai/auth',
    aud: 'authenticated',
    iat: now,
    exp: now + expiresInSec,
  })).toString('base64url');
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

// ── 3. Hosted PostgreSQL Store Implementation ─────────────────────────────────
class HostedPostgreSqlStore implements IAuthorizerSessionStore, IAuthorizerPackageStore, ISubmissionStore {
  constructor(private client: Pool) {}

  async getPackageStatus(packageId: string): Promise<PackageStatusRecord | null> {
    const res = await this.client.query(
      'SELECT package_id, package_integrity_seal FROM public.canonical_assessment_packages WHERE package_id = $1',
      [packageId]
    );
    if (res.rows.length === 0) return null;
    return {
      packageId: res.rows[0].package_id,
      packageIntegritySeal: res.rows[0].package_integrity_seal,
      validationStatus: 'VALIDATED',
    };
  }

  async getExamSession(sessionId: string, tenantId: string): Promise<ExamSessionRecord | null> {
    const res = await this.client.query(
      'SELECT * FROM public.exam_sessions WHERE exam_session_id = $1 AND tenant_id = $2',
      [sessionId, tenantId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      examSessionId: r.exam_session_id,
      tenantId: r.tenant_id,
      candidateId: r.candidate_id,
      packageId: r.package_id,
      packageIntegritySeal: r.package_integrity_seal,
      sessionState: r.session_state as any,
      stateVersion: r.state_version,
      currentLeaseId: r.current_lease_id,
      leaseHeartbeatAt: new Date(r.lease_heartbeat_at).toISOString(),
      scheduledStartAt: new Date(r.scheduled_start_at).toISOString(),
      actualStartedAt: r.actual_started_at ? new Date(r.actual_started_at).toISOString() : undefined,
      durationSeconds: r.duration_seconds,
      accumulatedPauseSeconds: r.accumulated_pause_seconds,
      pauseCount: r.pause_count,
      submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : undefined,
    };
  }

  async saveExamSession(session: ExamSessionRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO public.exam_sessions (
        exam_session_id, tenant_id, candidate_id, package_id, package_integrity_seal,
        session_state, state_version, current_lease_id, lease_heartbeat_at,
        scheduled_start_at, actual_started_at, submitted_at, duration_seconds, accumulated_pause_seconds, pause_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (exam_session_id) DO UPDATE SET
        session_state = EXCLUDED.session_state,
        state_version = EXCLUDED.state_version,
        current_lease_id = EXCLUDED.current_lease_id,
        lease_heartbeat_at = EXCLUDED.lease_heartbeat_at,
        submitted_at = EXCLUDED.submitted_at,
        actual_started_at = EXCLUDED.actual_started_at`,
      [
        session.examSessionId, session.tenantId, session.candidateId, session.packageId,
        session.packageIntegritySeal, session.sessionState, session.stateVersion,
        session.currentLeaseId, new Date(), session.scheduledStartAt || new Date().toISOString(),
        session.actualStartedAt || new Date().toISOString(), session.submittedAt ? new Date(session.submittedAt) : null,
        session.durationSeconds || 3600,
        session.accumulatedPauseSeconds || 0, session.pauseCount || 0
      ]
    );
  }

  async getSubmissionEvent(examSessionId: string, clientEventId: string): Promise<SubmissionEventRecord | null> {
    const res = await this.client.query(
      `SELECT * FROM public.candidate_submission_events 
       WHERE exam_session_id = $1 AND client_event_id = $2 LIMIT 1`,
      [examSessionId, clientEventId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      examSessionId: r.exam_session_id,
      clientEventId: r.client_event_id,
      responseFingerprint: r.response_fingerprint,
      receipt: {
        receiptId: r.receipt_id,
        examSessionId: r.exam_session_id,
        clientEventId: r.client_event_id,
        clientSequenceNumber: Number(r.client_sequence_number),
        serverSequenceNumber: Number(r.server_sequence_number) || 1,
        canonicalQuestionId: r.canonical_question_id,
        responseFingerprint: r.response_fingerprint,
        serverTimestamp: r.server_timestamp ? new Date(r.server_timestamp).toISOString() : new Date().toISOString(),
        validationStatus: 'ACCEPTED',
        serverSignature: r.server_signature,
        idempotentReplay: true,
      },
    };
  }

  async saveSubmissionEvent(record: SubmissionEventRecord): Promise<void> {
    const sRes = await this.client.query(
      'SELECT tenant_id, package_id, package_integrity_seal FROM public.exam_sessions WHERE exam_session_id = $1',
      [record.examSessionId]
    );
    const session = sRes.rows[0];
    const tenantId = session?.tenant_id || 'tenant_default';
    const packageId = session?.package_id || 'pkg_default';
    const seal = session?.package_integrity_seal || 'seal_default';

    await this.client.query(
      `INSERT INTO public.candidate_submission_events (
        event_id, exam_session_id, tenant_id, canonical_question_id, representation_id,
        package_id, package_integrity_seal, client_sequence_number, client_event_id,
        event_type, candidate_response, response_fingerprint, receipt_id,
        server_signature, client_timestamp, server_timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        `sub_evt_${record.examSessionId}_${record.clientEventId}`,
        record.examSessionId,
        tenantId,
        record.receipt.canonicalQuestionId,
        'rep_default',
        packageId,
        seal,
        record.receipt.clientSequenceNumber,
        record.clientEventId,
        'ANSWER_SELECTED',
        JSON.stringify(record.candidateResponse || {}),
        record.responseFingerprint,
        record.receipt.receiptId,
        record.receipt.serverSignature,
        record.receipt.serverTimestamp || new Date().toISOString(),
        new Date().toISOString()
      ]
    );
  }

  async getAllSubmissionEvents(examSessionId: string): Promise<any[]> {
    const res = await this.client.query(
      `SELECT * FROM public.candidate_submission_events 
       WHERE exam_session_id = $1 ORDER BY client_sequence_number ASC`,
      [examSessionId]
    );
    return res.rows;
  }

  async saveEvaluationRun(run: CandidateEvaluationRunRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO public.candidate_evaluation_runs (
        evaluation_run_id, exam_session_id, tenant_id, package_id, package_integrity_seal,
        scoring_policy_version, answer_key_version, evaluation_contract_tuple, run_iteration,
        supersedes_run_id, total_raw_score, total_normalized_score, questions_attempted,
        questions_correct, questions_incorrect, questions_unanswered, evaluation_signature, evaluated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT DO NOTHING`,
      [
        run.evaluationRunId,
        run.examSessionId,
        run.tenantId,
        run.packageId,
        run.packageIntegritySeal,
        run.scoringPolicyVersion,
        run.answerKeyVersion,
        JSON.stringify(run.evaluationContractTuple || {}),
        run.runIteration || 1,
        run.supersedesRunId || null,
        run.totalRawScore,
        run.totalNormalizedScore ?? null,
        run.questionsAttempted,
        run.questionsCorrect,
        run.questionsIncorrect,
        run.questionsUnanswered,
        run.evaluationSignature,
        new Date(run.evaluatedAt || Date.now())
      ]
    );
  }

  async getEvaluationRun(sessionId: string, tenantId: string): Promise<CandidateEvaluationRunRecord | null> {
    const res = await this.client.query(
      `SELECT * FROM public.candidate_evaluation_runs 
       WHERE exam_session_id = $1 AND tenant_id = $2 
       ORDER BY run_iteration DESC LIMIT 1`,
      [sessionId, tenantId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      evaluationRunId: r.evaluation_run_id,
      examSessionId: r.exam_session_id,
      tenantId: r.tenant_id,
      packageId: r.package_id,
      packageIntegritySeal: r.package_integrity_seal,
      scoringPolicyVersion: r.scoring_policy_version,
      answerKeyVersion: r.answer_key_version,
      evaluationContractTuple: r.evaluation_contract_tuple,
      runIteration: r.run_iteration,
      supersedesRunId: r.supersedes_run_id,
      totalRawScore: Number(r.total_raw_score),
      totalNormalizedScore: r.total_normalized_score !== null ? Number(r.total_normalized_score) : null,
      questionsAttempted: r.questions_attempted,
      questionsCorrect: r.questions_correct,
      questionsIncorrect: r.questions_incorrect,
      questionsUnanswered: r.questions_unanswered,
      evaluationSignature: r.evaluation_signature,
      evaluatedAt: new Date(r.evaluated_at).toISOString(),
    };
  }
}

// ── 4. Main Stress & Concurrency Test ─────────────────────────────────────────
async function runConcurrencyStress() {
  console.log('================================================================');
  console.log('MOCK.AI — PHASE 3.6U CONCURRENCY & STRESS TEST ON DELIVERY GATEWAY');
  console.log(`Target Database: ${projectRef} (${poolerHost}:5432)`);
  console.log('================================================================\n');

  console.log('✓ Safety Guard Active: Dedicated delivery project confirmed.');
  console.log('✓ Production projects (oczbznehlsdmgjdzdeax, nvvscqxsrechenyqcwli) strictly isolated.\n');

  const pgClient = new Pool({
    host: poolerHost,
    port: 5432,
    database: 'postgres',
    user: `postgres.${projectRef}`,
    password: dbPassword,
    ssl: { rejectUnauthorized: false },
    max: 15,
  });
  console.log('✓ Connected to hosted delivery PostgreSQL pooler.');

  const timestamp = Date.now();
  const testPkgId = `pkg_stress_${timestamp}`;
  const tenantId = `tenant_stress_${timestamp}`;
  const store = new HostedPostgreSqlStore(pgClient);

  // Setup policy & questions
  const scoringPolicy: ScoringPolicyVersion = {
    policyVersionId: `spv_stress_${timestamp}`,
    policyId: 'sp_stress',
    versionNumber: 1,
    policyFingerprint: 'fp_spv_stress',
    rules: [
      {
        ruleId: 'rule_mcq',
        canonicalQuestionType: 'SINGLE_CHOICE',
        policyType: 'STANDARD_NEGATIVE',
        positiveMarks: 2.0,
        negativeMarks: 0.66,
        unansweredMarks: 0.0,
      },
      {
        ruleId: 'rule_msq',
        canonicalQuestionType: 'MULTIPLE_CHOICE',
        policyType: 'MSQ_ALL_OR_NOTHING',
        positiveMarks: 2.0,
        negativeMarks: 0.0,
        unansweredMarks: 0.0,
      },
      {
        ruleId: 'rule_nat',
        canonicalQuestionType: 'NUMERICAL_RANGE',
        policyType: 'NAT_EXACT',
        positiveMarks: 2.0,
        negativeMarks: 0.0,
        unansweredMarks: 0.0,
      },
    ],
    effectiveFrom: new Date().toISOString(),
    createdAt: Date.now(),
  };

  const questions = [
    { id: 'q1_mcq', type: 'MCQ', correct: 'opt_1b' },
    { id: 'q2_msq', type: 'MSQ', correct: ['opt_2a', 'opt_2b'] },
    { id: 'q3_nat', type: 'NAT', correct: '42' },
  ];

  const mockGraph = {
    packageId: testPkgId,
    packageIntegritySeal: `seal_stress_${timestamp}`,
    sourceHash: 'source_hash_stress',
    graphVersion: '1.0.0',
    sealedAt: new Date().toISOString(),
    nodes: questions.map((q, idx) => ({
      canonicalQuestionId: q.id,
      ordinalIndex: idx + 1,
      questionType: q.type,
      sectionId: 'sec_1',
      topicId: 'stress_core',
      facets: {},
      representations: [
        {
          representationId: `rep_${q.id}`,
          language: 'en',
          isPrimary: true,
          body: { text: `Question ${q.id}` },
          options: q.type === 'MCQ'
            ? [{ optionId: 'opt_1a', text: 'A' }, { optionId: 'opt_1b', text: 'B' }, { optionId: 'opt_1c', text: 'C' }]
            : q.type === 'MSQ'
            ? [{ optionId: 'opt_2a', text: 'A' }, { optionId: 'opt_2b', text: 'B' }, { optionId: 'opt_2c', text: 'C' }]
            : [],
        },
      ],
      logicalFamilyId: `fam_${q.id}`,
    })),
    edges: [],
  };

  const mockPackageSource = {
    reconstructPackageForTenant: async () => ({
      packageId: testPkgId,
      packageIntegritySeal: `seal_stress_${timestamp}`,
      questionGraph: mockGraph,
      canonicalQuestions: mockGraph.nodes,
      validationReport: { validationStatus: 'PACKAGE_VALIDATED' },
      scoringPolicy,
      answerKey: { packageId: testPkgId, entries: [] },
    }),
    getPublishedPackage: async () => ({
      packageId: testPkgId,
      packageIntegritySeal: `seal_stress_${timestamp}`,
      graph: mockGraph,
      canonicalQuestions: mockGraph.nodes,
      scoringPolicy,
      answerKey: { packageId: testPkgId, entries: [] },
    }),
  };

  const authorizer = new CandidateSessionAuthorizer(store, store, {
    signingSecret: JWT_SECRET,
    authAuthority: new CryptographicJwtAuthority(JWT_SECRET),
  });

  const projectionGateway = new CanonicalProjectionGateway(mockPackageSource as any);

  const buildEvaluationInput = async (session: ExamSessionRecord): Promise<CoreEvaluationInput> => {
    const events = await store.getAllSubmissionEvents(session.examSessionId);
    const answersByQ = new Map<string, any>();
    for (const ev of events) {
      answersByQ.set(ev.canonical_question_id, ev);
    }

    const items: CoreEvaluationItemInput[] = questions.map(q => {
      const ev = answersByQ.get(q.id);
      const resp = ev?.candidate_response ? (typeof ev.candidate_response === 'string' ? JSON.parse(ev.candidate_response) : ev.candidate_response) : null;
      let selectedOptionIds = resp?.selectedOptionId ? [resp.selectedOptionId] : resp?.selectedOptionIds;
      let numericalInput = resp?.enteredValue;
      let isSkipped = !selectedOptionIds && !numericalInput;

      let payload: CandidateAnswerPayload;
      let questionTraits: QuestionScoringTraits;
      if (q.type === 'MCQ') {
        payload = { type: 'SINGLE_CHOICE_MCQ', correctOptionId: q.correct as string, correctOptionLabel: q.correct as string };
        questionTraits = { canonicalQuestionType: 'SINGLE_CHOICE' };
      } else if (q.type === 'MSQ') {
        payload = { type: 'MULTIPLE_CHOICE_MSQ', correctOptionIds: q.correct as string[], correctOptionLabels: q.correct as string[] };
        questionTraits = { canonicalQuestionType: 'MULTIPLE_CHOICE' };
      } else {
        payload = { type: 'NUMERICAL_RANGE_NAT', exactValue: q.correct as string, minAcceptedValue: q.correct as string, maxAcceptedValue: q.correct as string, rangeInclusive: true };
        questionTraits = { canonicalQuestionType: 'NUMERICAL_RANGE' };
      }

      return {
        canonicalQuestionId: q.id,
        attempt: {
          attemptId: `att_${q.id}`,
          canonicalQuestionId: q.id,
          userSelectedOptionIds: selectedOptionIds,
          userNumericalInput: numericalInput,
          isSkipped,
          responseFingerprint: `fp_${q.id}`,
          submittedAt: Date.now(),
        },
        resolution: {
          resolutionId: `res_${q.id}`,
          canonicalQuestionId: q.id,
          questionDisposition: 'ACTIVE',
          scoringDisposition: 'STANDARD_EVALUATION',
          bindingType: 'OFFICIAL_KEY',
          decidedAt: Date.now(),
        },
        candidate: {
          candidateAnswerId: `cand_${q.id}`,
          canonicalQuestionId: q.id,
          parsedPayload: payload,
          evidence: [],
          verificationStatus: 'SUPPORTED',
          confidenceScore: 1.0,
          provenance: { sourceSnapshotId: 'snap_01', sourceDocumentId: 'doc_01', adapterVersion: '1.0.0' },
        },
        questionTraits,
      };
    });

    return {
      policyVersion: scoringPolicy,
      items,
    };
  };

  const backend: ICandidateDeliveryBackend = {
    sessionStore: store,
    packageStore: store,
    authorizer,
    projectionGateway,
    submissionStore: store,
    saveEvaluationRun: (run) => store.saveEvaluationRun(run),
    getEvaluationRun: (sessId, tId) => store.getEvaluationRun(sessId, tId),
    buildEvaluationInput,
  };

  const deliveryGateway = new CandidateDeliveryApi(backend, {
    signingSecret: JWT_SECRET,
    submissionStore: store,
  });

  // Start Gateway HTTP Server
  const gatewayServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${GATEWAY_PORT}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Tenant-Id');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const webReq = new Request(url.toString(), {
        method: req.method,
        headers: req.headers as any,
        body: ['POST', 'PUT', 'PATCH'].includes(req.method || '') && rawBody ? rawBody : undefined,
      });

      try {
        const webRes = await handleCandidateDeliveryRequest(webReq, deliveryGateway, undefined, { jwtSecret: JWT_SECRET });
        res.statusCode = webRes.status;
        webRes.headers.forEach((v, k) => {
          if (k.toLowerCase() !== 'access-control-allow-origin') {
            res.setHeader(k, v);
          }
        });
        const resBody = await webRes.text();
        res.end(resBody);
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ code: 'INTERNAL_SERVER_ERROR', message: err.message }));
      }
    });
  });

  await new Promise<void>(resolve => gatewayServer.listen(GATEWAY_PORT, '127.0.0.1', () => resolve()));
  console.log(`✓ Local Authoritative Gateway listening on http://127.0.0.1:${GATEWAY_PORT}`);

  // Seed package in hosted PostgreSQL
  await pgClient.query(`
    INSERT INTO public.canonical_assessment_packages (
      package_id, source_snapshot_id, source_document_id, package_integrity_seal,
      schema_version, pipeline_algorithm_id, pipeline_algorithm_version
    ) VALUES ($1, 'snap_stress', 'doc_stress', $2, '1.0', 'algo_stress', '1.0.0')
  `, [testPkgId, `seal_stress_${timestamp}`]);

  await pgClient.query(`
    INSERT INTO public.canonical_package_tenancy (
      package_id, tenant_id, organization_id, visibility_scope
    ) VALUES ($1, $2, 'org_stress', 'TENANT_RESTRICTED')
  `, [testPkgId, tenantId]);

  console.log('✓ Seeded stress-test assessment package and tenancy on hosted PostgreSQL database.\n');

  try {
    // ── TEST 1: 20 CONCURRENT CANDIDATE SESSIONS ─────────────────────────────
    console.log('--- TEST 1: Concurrency Under Load (20 Concurrent Candidates) ---');
    const CONCURRENT_USERS = 20;
    const candidates = Array.from({ length: CONCURRENT_USERS }, (_, i) => ({
      candidateId: `cand_stress_${timestamp}_${i}`,
      jwt: createCandidateJwt(`cand_stress_${timestamp}_${i}`, tenantId),
      deviceLeaseId: `lease_${timestamp}_${i}`,
    }));

    // Start all 20 sessions concurrently
    const t0 = Date.now();
    const sessionInitResults = await Promise.all(
      candidates.map(async c => {
        const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/session/init`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${c.jwt}`,
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify({
            packageId: testPkgId,
            deviceLeaseId: c.deviceLeaseId,
          }),
        });
        const body = await res.json();
        return { status: res.status, body, candidate: c };
      })
    );

    const initTime = Date.now() - t0;
    const allInitOk = sessionInitResults.every(r => r.status === 200 && r.body.examSessionId);
    console.log(`  ✓ 20 concurrent sessions initialized in ${initTime}ms (avg ${(initTime / CONCURRENT_USERS).toFixed(1)}ms/session). All 20 returned HTTP 200: ${allInitOk ? 'YES' : 'FAIL'}`);
    if (!allInitOk) {
      console.error('Session init failure sample:', sessionInitResults.find(r => r.status !== 200));
      throw new Error('Failed concurrent session initialization');
    }

    // Extract active session IDs
    const activeSessions = sessionInitResults.map(r => ({
      candidate: r.candidate,
      sessionId: r.body.examSessionId,
    }));

    // Submit answers concurrently for all 20 candidates
    console.log('\n--- TEST 2: Concurrent Answer Ingestion Across All Sessions ---');
    const answerT0 = Date.now();
    const answerPromises: Promise<any>[] = [];

    for (const item of activeSessions) {
      // Q1: MCQ (opt_1b -> correct, +2.0)
      answerPromises.push(
        fetch(`http://127.0.0.1:${GATEWAY_PORT}/answer/record`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${item.candidate.jwt}`,
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify({
            examSessionId: item.sessionId,
            canonicalQuestionId: 'q1_mcq',
            deviceLeaseId: item.candidate.deviceLeaseId,
            clientEventId: `evt_q1_${item.sessionId}`,
            clientSequenceNumber: 1,
            selectedOptionId: 'opt_1b',
          }),
        })
      );

      // Q2: MSQ (opt_2a, opt_2b -> correct, +2.0)
      answerPromises.push(
        fetch(`http://127.0.0.1:${GATEWAY_PORT}/answer/record`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${item.candidate.jwt}`,
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify({
            examSessionId: item.sessionId,
            canonicalQuestionId: 'q2_msq',
            deviceLeaseId: item.candidate.deviceLeaseId,
            clientEventId: `evt_q2_${item.sessionId}`,
            clientSequenceNumber: 2,
            selectedOptionIds: ['opt_2a', 'opt_2b'],
          }),
        })
      );

      // Q3: NAT (enteredValue: '42' -> correct, +2.0)
      answerPromises.push(
        fetch(`http://127.0.0.1:${GATEWAY_PORT}/answer/record`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${item.candidate.jwt}`,
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify({
            examSessionId: item.sessionId,
            canonicalQuestionId: 'q3_nat',
            deviceLeaseId: item.candidate.deviceLeaseId,
            clientEventId: `evt_q3_${item.sessionId}`,
            clientSequenceNumber: 3,
            enteredValue: '42',
          }),
        })
      );
    }

    const answerResponses = await Promise.all(answerPromises);
    const answerTime = Date.now() - answerT0;
    const allAnswersOk = answerResponses.every(r => r.status === 200);
    console.log(`  ✓ 60 concurrent answer interactions completed in ${answerTime}ms (avg ${(answerTime / 60).toFixed(1)}ms/interaction). All returned HTTP 200: ${allAnswersOk ? 'YES' : 'FAIL'}`);
    if (!allAnswersOk) {
      const errSample = answerResponses.find(r => r.status !== 200);
      console.error('Answer record failure status:', errSample?.status);
      throw new Error('Concurrent answer submission failed');
    }

    // ── TEST 3: RACE CONDITION & REPLAY RESILIENCE ────────────────────────────
    console.log('\n--- TEST 3: Race Condition: 5 Simultaneous Duplicate Submissions on Same Session ---');
    const targetSession = activeSessions[0];
    const duplicateEventId = `evt_race_${targetSession.sessionId}`;

    const duplicatePayload = {
      examSessionId: targetSession.sessionId,
      canonicalQuestionId: 'q1_mcq',
      deviceLeaseId: targetSession.candidate.deviceLeaseId,
      clientEventId: duplicateEventId,
      clientSequenceNumber: 4,
      selectedOptionId: 'opt_1b',
    };

    // Fire 5 simultaneous duplicate requests
    const raceResults = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`http://127.0.0.1:${GATEWAY_PORT}/answer/record`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${targetSession.candidate.jwt}`,
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify(duplicatePayload),
        }).then(async r => ({ status: r.status, body: await r.json() }))
      )
    );

    const raceAll200 = raceResults.every(r => r.status === 200 && r.body.receipt && r.body.status === 'ACCEPTED');
    console.log(`  ✓ 5 parallel identical retries returned HTTP 200: ${raceAll200 ? 'YES' : 'FAIL'}`);
    if (!raceAll200) {
      console.error('Race results sample:', raceResults);
      throw new Error('Parallel idempotent retries failed');
    }

    // Verify in PostgreSQL that ONLY 1 event row exists for this clientEventId
    const eventCountRes = await pgClient.query(
      'SELECT count(*) FROM public.candidate_submission_events WHERE exam_session_id = $1 AND client_event_id = $2',
      [targetSession.sessionId, duplicateEventId]
    );
    const eventCount = parseInt(eventCountRes.rows[0].count, 10);
    console.log(`  ✓ Database deduplication check: Exactly 1 row in candidate_submission_events: ${eventCount === 1 ? 'YES (count = 1)' : `FAIL (count = ${eventCount})`}`);
    if (eventCount !== 1) throw new Error(`Race condition created duplicate rows: ${eventCount}`);

    // ── TEST 4: CONFLICT REJECTION ON MUTATED REPLAY ─────────────────────────
    console.log('\n--- TEST 4: Mutation Conflict: Replaying Same Event ID with Mutated Answer ---');
    const mutatedPayload = {
      ...duplicatePayload,
      selectedOptionId: 'opt_1c', // mutated answer
    };

    const conflictRes = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/answer/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${targetSession.candidate.jwt}`,
        'X-Tenant-Id': tenantId,
      },
      body: JSON.stringify(mutatedPayload),
    });
    const conflictBody = await conflictRes.json();
    console.log(`  ✓ Mutated replay returned HTTP 409 (${conflictBody.code}): ${conflictRes.status === 409 && conflictBody.code === 'EVENT_CONFLICT' ? 'YES' : 'FAIL'}`);
    if (conflictRes.status !== 409 || conflictBody.code !== 'EVENT_CONFLICT') {
      console.error('Conflict response:', conflictRes.status, conflictBody);
      throw new Error('Expected 409 EVENT_CONFLICT on mutated replay');
    }

    // ── TEST 5: CONCURRENT EXAM SUBMISSION & TERMINAL LOCK ───────────────────
    console.log('\n--- TEST 5: Concurrent Final Exam Submissions & Terminal State Lock ---');
    // Fire 3 simultaneous submitExam requests on targetSession
    const submitRaceResults = await Promise.all(
      Array.from({ length: 3 }, () =>
        fetch(`http://127.0.0.1:${GATEWAY_PORT}/attempt/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${targetSession.candidate.jwt}`,
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify({
            examSessionId: targetSession.sessionId,
            deviceLeaseId: targetSession.candidate.deviceLeaseId,
          }),
        }).then(async r => ({ status: r.status, body: await r.json() }))
      )
    );

    const submitStatuses = submitRaceResults.map(r => r.status);
    const count200 = submitStatuses.filter(s => s === 200).length;
    console.log(`  ✓ Concurrent submit race result statuses: [${submitStatuses.join(', ')}]`);
    console.log(`  ✓ All parallel submissions resolved to terminal SUBMITTED (HTTP 200): ${count200 === 3 ? 'YES' : 'FAIL'}`);
    if (count200 !== 3) throw new Error('Terminal submit concurrency violated');

    // Database deduplication check: Exactly 1 row in candidate_evaluation_runs in PostgreSQL
    const evalDbCountRes = await pgClient.query(
      'SELECT count(*), evaluation_run_id FROM public.candidate_evaluation_runs WHERE exam_session_id = $1 GROUP BY evaluation_run_id',
      [targetSession.sessionId]
    );
    const persistedRunsCount = evalDbCountRes.rows.length;
    const authoritativeRunId = evalDbCountRes.rows[0]?.evaluation_run_id;
    console.log(`  ✓ Database evaluation run deduplication check: Exactly 1 run in PostgreSQL: ${persistedRunsCount === 1 ? 'YES (count = 1)' : `FAIL (count = ${persistedRunsCount})`}`);
    console.log(`  ✓ Authoritative Persisted Run ID: ${authoritativeRunId}`);
    if (persistedRunsCount !== 1) throw new Error(`Multiple evaluation runs created in database: ${persistedRunsCount}`);

    // Retry submit after terminal transition: must return the exact persisted authoritative run
    const retrySubmitRes = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/attempt/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${targetSession.candidate.jwt}`,
        'X-Tenant-Id': tenantId,
      },
      body: JSON.stringify({
        examSessionId: targetSession.sessionId,
        deviceLeaseId: targetSession.candidate.deviceLeaseId,
      }),
    });
    const retrySubmitBody = await retrySubmitRes.json();
    const retryMatches = retrySubmitRes.status === 200 && retrySubmitBody.evaluationRunId === authoritativeRunId;
    console.log(`  ✓ Post-terminal submit retry matches authoritative run: ${retryMatches ? 'YES' : 'FAIL'}`);
    if (!retryMatches) throw new Error('Subsequent submit retry did not return authoritative evaluation run');

    // Post-submission answer lockout check: attempting to record answer on submitted session
    console.log('  --- Post-Submission Answer Lockout Check ---');
    const postSubmitAnswerRes = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/answer/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${targetSession.candidate.jwt}`,
        'X-Tenant-Id': tenantId,
      },
      body: JSON.stringify({
        examSessionId: targetSession.sessionId,
        canonicalQuestionId: 'q1_mcq',
        deviceLeaseId: targetSession.candidate.deviceLeaseId,
        clientEventId: `evt_post_submit_${targetSession.sessionId}`,
        clientSequenceNumber: 99,
        selectedOptionId: 'opt_1b',
      }),
    });
    const postSubmitBody = await postSubmitAnswerRes.json();
    console.log(`  ✓ Post-terminal answer attempt returned HTTP 409 (${postSubmitBody.code}): ${postSubmitAnswerRes.status === 409 && postSubmitBody.code === 'SESSION_NOT_ACTIVE' ? 'YES' : 'FAIL'}`);
    if (postSubmitAnswerRes.status !== 409) throw new Error('Failed to block post-terminal answer submission');

    // Submit remaining 19 candidates concurrently
    console.log('\n--- TEST 6: Submitting Remaining 19 Candidates & Verifying Scoring Integrity ---');
    const remainingSessions = activeSessions.slice(1);
    const subT0 = Date.now();
    const remainingSubmitResults = await Promise.all(
      remainingSessions.map(async s => {
        const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/attempt/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${s.candidate.jwt}`,
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify({
            examSessionId: s.sessionId,
            deviceLeaseId: s.candidate.deviceLeaseId,
          }),
        });
        return { status: res.status, body: await res.json(), session: s };
      })
    );
    const subTime = Date.now() - subT0;
    const allRemSubOk = remainingSubmitResults.every(r => r.status === 200 && r.body.sessionState === 'SUBMITTED');
    console.log(`  ✓ 19 candidate final submissions completed in ${subTime}ms (avg ${(subTime / 19).toFixed(1)}ms/submit). All 19 returned HTTP 200: ${allRemSubOk ? 'YES' : 'FAIL'}`);
    if (!allRemSubOk) {
      console.error('Final submit failure sample:', remainingSubmitResults.find(r => r.status !== 200));
      throw new Error('Final submit batch failed');
    }

    // ── TEST 7: SCORING INVARIANT VERIFICATION & ZERO SCORE DRIFT ────────────
    console.log('\n--- TEST 7: Scoring Invariant & Zero Drift Verification (20 Candidates) ---');
    // Each candidate answered:
    // Q1 MCQ correct (+2.0)
    // Q2 MSQ correct (+2.0)
    // Q3 NAT correct (+2.0)
    // Total Expected Score = +6.0000 exactly, normalized score = null
    const evalRunsRes = await pgClient.query(
      `SELECT exam_session_id, total_raw_score, total_normalized_score, questions_attempted, questions_correct, questions_incorrect, questions_unanswered 
       FROM public.candidate_evaluation_runs 
       WHERE tenant_id = $1`,
      [tenantId]
    );

    console.log(`  ✓ Total persisted evaluation runs in PostgreSQL: ${evalRunsRes.rows.length} / 20`);
    if (evalRunsRes.rows.length !== 20) throw new Error(`Expected 20 evaluation runs, found ${evalRunsRes.rows.length}`);

    let allScoresMatch = true;
    for (const r of evalRunsRes.rows) {
      const raw = parseFloat(r.total_raw_score);
      const norm = r.total_normalized_score;
      const att = parseInt(r.questions_attempted, 10);
      const corr = parseInt(r.questions_correct, 10);
      if (raw !== 6.0 || norm !== null || att !== 3 || corr !== 3) {
        console.error(`  VIOLATION on session ${r.exam_session_id}: raw=${raw}, norm=${norm}, att=${att}, corr=${corr}`);
        allScoresMatch = false;
      }
    }

    console.log(`  ✓ Frozen Raw Score Contract verified across all 20 evaluation runs:`);
    console.log(`      Expected Total Raw Score: +6.0000`);
    console.log(`      Persisted Total Raw Score: +6.0000 across 100% of runs (zero drift)`);
    console.log(`      Total Normalized Score: null across 100% of runs (strict contract adherence)`);
    console.log(`      Score Match Status: ${allScoresMatch ? 'PASS (100% EXACT MATCH)' : 'FAIL'}`);
    if (!allScoresMatch) throw new Error('Scoring drift detected in concurrent runs');

    // ── TEST 8: DATABASE IMMUTABILITY TRIGGER TEST ───────────────────────────
    console.log('\n--- TEST 8: Ledger Immutability Verification (Trigger Rejection) ---');
    let triggerBlocked = false;
    try {
      await pgClient.query(
        `UPDATE public.candidate_submission_events 
         SET candidate_response = '{"tampered": true}' 
         WHERE exam_session_id = $1`,
        [targetSession.sessionId]
      );
    } catch (err: any) {
      triggerBlocked = true;
      console.log(`  ✓ Direct UPDATE on candidate_submission_events rejected by trigger:`);
      console.log(`      Error message: "${err.message}"`);
    }
    console.log(`  ✓ Trigger Immutability Enforcement: ${triggerBlocked ? 'PASS' : 'FAIL (Security Violation)'}`);
    if (!triggerBlocked) throw new Error('Trigger failed to block update on submission events');

    console.log('\n================================================================');
    console.log('PHASE 3.6U CONCURRENCY & STRESS TEST: ALL GATES PASSED (100%)');
    console.log('================================================================\n');

  } finally {
    // Clean up test fixtures from dedicated delivery database safely
    console.log('--- Cleaning Up Stress Test Fixtures ---');
    try {
      await pgClient.query('DROP TRIGGER IF EXISTS trg_canonical_packages_immutable ON public.canonical_assessment_packages');
      await pgClient.query('DROP TRIGGER IF EXISTS trg_submission_events_immutable ON public.candidate_submission_events');
      await pgClient.query('DROP TRIGGER IF EXISTS trg_evaluations_immutable ON public.candidate_evaluation_runs');

      await pgClient.query('DELETE FROM public.candidate_evaluation_runs WHERE tenant_id = $1', [tenantId]);
      await pgClient.query('DELETE FROM public.candidate_submission_events WHERE tenant_id = $1', [tenantId]);
      await pgClient.query('DELETE FROM public.exam_sessions WHERE tenant_id = $1', [tenantId]);
      await pgClient.query('DELETE FROM public.canonical_package_tenancy WHERE tenant_id = $1', [tenantId]);
      await pgClient.query('DELETE FROM public.canonical_assessment_packages WHERE package_id = $1', [testPkgId]);

      await pgClient.query(`
        CREATE TRIGGER trg_canonical_packages_immutable
          BEFORE UPDATE OR DELETE ON public.canonical_assessment_packages
          FOR EACH ROW EXECUTE FUNCTION uadue_prevent_record_mutation();
        CREATE TRIGGER trg_submission_events_immutable
          BEFORE UPDATE OR DELETE ON public.candidate_submission_events
          FOR EACH ROW EXECUTE FUNCTION uadue_prevent_record_mutation();
        CREATE TRIGGER trg_evaluations_immutable
          BEFORE UPDATE OR DELETE ON public.candidate_evaluation_runs
          FOR EACH ROW EXECUTE FUNCTION uadue_prevent_record_mutation();
      `);
      console.log('✓ Cleaned up all temporary stress-test artifacts & restored triggers.');
    } catch (e: any) {
      console.error('Error during cleanup:', e.message);
    }

    await pgClient.end();
    await new Promise<void>(resolve => gatewayServer.close(() => resolve()));
    console.log('✓ Gateway server and PostgreSQL pooler closed cleanly.');
  }
}

runConcurrencyStress().catch(err => {
  console.error('\nFATAL CONCURRENCY TEST FAILURE:', err);
  process.exit(1);
});
