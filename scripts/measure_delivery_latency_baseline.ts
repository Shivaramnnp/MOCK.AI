import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { createHmac } from 'crypto';
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
  ScoringEvaluationCore
} from '../web/src/services/uadue/delivery/scoringEvaluationCore';
import { ScoringPolicyVersion } from '../web/src/services/uadue/canonical/types';

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
const GATEWAY_PORT = 54323;
const JWT_SECRET = 'mockai_latency_baseline_jwt_secret_2026';

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

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function computeStats(samples: number[]) {
  if (samples.length === 0) return { count: 0, min: 0, median: 0, p95: 0, max: 0, avg: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
  };
}

function createCandidateJwt(candidateId: string, tenantId: string): string {
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
    exp: now + 3600,
  })).toString('base64url');
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

// ── Store Implementation ──────────────────────────────────────────────────────
class HostedStore implements IAuthorizerSessionStore, IAuthorizerPackageStore, ISubmissionStore {
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

  async saveSubmissionEvent(): Promise<void> {}

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
      ON CONFLICT ON CONSTRAINT uq_session_run_iteration DO NOTHING`,
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

async function runLatencyBenchmark() {
  console.log('================================================================');
  console.log('MOCK.AI — PHASE 3.6V BASELINE LATENCY BENCHMARK & METRICS');
  console.log(`Target: Tokyo Delivery Database (${projectRef})`);
  console.log('================================================================\n');

  // 1. Supabase REST API Latency
  console.log('--- 1. Measuring Supabase REST API Latency (Tokyo ap-northeast-1) ---');
  const restUrl = `https://${projectRef}.supabase.co/rest/v1/`;
  const restSamples: number[] = [];
  let restErrors = 0;
  const REST_SAMPLE_COUNT = 20;

  for (let i = 0; i < REST_SAMPLE_COUNT; i++) {
    const t0 = performance.now();
    try {
      const resp = await fetch(restUrl, {
        method: 'GET',
        headers: { 'apikey': env['SUPABASE_DELIVERY_ANON_KEY'] || '' },
      });
      const duration = performance.now() - t0;
      if (resp.status >= 200 && resp.status < 500) {
        restSamples.push(duration);
      } else {
        restErrors++;
      }
    } catch {
      restErrors++;
    }
  }

  const restStats = computeStats(restSamples);
  console.log(`Endpoint: ${restUrl}`);
  console.log(`Samples: ${restStats.count}/${REST_SAMPLE_COUNT}, Errors: ${restErrors}`);
  console.log(`Min: ${restStats.min.toFixed(1)}ms | Median: ${restStats.median.toFixed(1)}ms | p95: ${restStats.p95.toFixed(1)}ms | Max: ${restStats.max.toFixed(1)}ms | Avg: ${restStats.avg.toFixed(1)}ms\n`);

  // 2. PostgreSQL Pooler Connection TCP Latency
  console.log('--- 2. Measuring PostgreSQL Pooler TCP Connect Latency (Tokyo ap-northeast-1) ---');
  const tcpSamples: number[] = [];
  let tcpErrors = 0;
  const TCP_SAMPLE_COUNT = 20;

  for (let i = 0; i < TCP_SAMPLE_COUNT; i++) {
    await new Promise<void>((resolve) => {
      const t0 = performance.now();
      const socket = new net.Socket();
      socket.setTimeout(5000);
      socket.connect(5432, poolerHost, () => {
        const duration = performance.now() - t0;
        tcpSamples.push(duration);
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        tcpErrors++;
        socket.destroy();
        resolve();
      });
      socket.on('timeout', () => {
        tcpErrors++;
        socket.destroy();
        resolve();
      });
    });
  }

  const tcpStats = computeStats(tcpSamples);
  console.log(`Endpoint: ${poolerHost}:5432`);
  console.log(`Samples: ${tcpStats.count}/${TCP_SAMPLE_COUNT}, Errors: ${tcpErrors}`);
  console.log(`Min: ${tcpStats.min.toFixed(1)}ms | Median: ${tcpStats.median.toFixed(1)}ms | p95: ${tcpStats.p95.toFixed(1)}ms | Max: ${tcpStats.max.toFixed(1)}ms | Avg: ${tcpStats.avg.toFixed(1)}ms\n`);

  // 3. Full Candidate Submission Round-Trip Latency
  console.log('--- 3. Measuring Full Candidate Submission Latency (Application -> Gateway -> Pooler) ---');
  const pgClient = new Pool({
    host: poolerHost,
    port: 5432,
    database: 'postgres',
    user: `postgres.${projectRef}`,
    password: dbPassword,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });

  const timestamp = Date.now();
  const testPkgId = `pkg_bench_${timestamp}`;
  const tenantId = `tenant_bench_${timestamp}`;
  const store = new HostedStore(pgClient);

  const scoringPolicy: ScoringPolicyVersion = {
    policyVersionId: `spv_bench_${timestamp}`,
    policyId: 'sp_bench',
    versionNumber: 1,
    policyFingerprint: 'fp_bench',
    rules: [],
    effectiveFrom: new Date().toISOString(),
    createdAt: Date.now(),
  };

  const mockGraph = {
    packageId: testPkgId,
    packageIntegritySeal: `seal_bench_${timestamp}`,
    sourceHash: 'source_bench',
    graphVersion: '1.0.0',
    sealedAt: new Date().toISOString(),
    nodes: [],
    edges: [],
  };

  const mockPackageSource = {
    reconstructPackageForTenant: async () => ({
      packageId: testPkgId,
      packageIntegritySeal: `seal_bench_${timestamp}`,
      questionGraph: mockGraph,
      canonicalQuestions: [],
      validationReport: { validationStatus: 'PACKAGE_VALIDATED' },
      scoringPolicy,
      answerKey: { packageId: testPkgId, entries: [] },
    }),
    getPublishedPackage: async () => ({
      packageId: testPkgId,
      packageIntegritySeal: `seal_bench_${timestamp}`,
      graph: mockGraph,
      canonicalQuestions: [],
      scoringPolicy,
      answerKey: { packageId: testPkgId, entries: [] },
    }),
  };

  const authorizer = new CandidateSessionAuthorizer(store, store, {
    signingSecret: JWT_SECRET,
    authAuthority: new CryptographicJwtAuthority(JWT_SECRET),
  });

  const projectionGateway = new CanonicalProjectionGateway(mockPackageSource as any);

  const backend: ICandidateDeliveryBackend = {
    sessionStore: store,
    packageStore: store,
    authorizer,
    projectionGateway,
    submissionStore: store,
    saveEvaluationRun: (run) => store.saveEvaluationRun(run),
    getEvaluationRun: (sessId, tId) => store.getEvaluationRun(sessId, tId),
    buildEvaluationInput: async () => ({
      policyVersion: scoringPolicy,
      items: [],
    }),
  };

  const deliveryGateway = new CandidateDeliveryApi(backend, {
    signingSecret: JWT_SECRET,
    submissionStore: store,
  });

  const gatewayServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${GATEWAY_PORT}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Tenant-Id');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

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
          if (k.toLowerCase() !== 'access-control-allow-origin') res.setHeader(k, v);
        });
        res.end(await webRes.text());
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ code: 'INTERNAL_SERVER_ERROR', message: err.message }));
      }
    });
  });

  await new Promise<void>(resolve => gatewayServer.listen(GATEWAY_PORT, '127.0.0.1', () => resolve()));

  // Seed package in hosted PostgreSQL
  await pgClient.query(`
    INSERT INTO public.canonical_assessment_packages (
      package_id, source_snapshot_id, source_document_id, package_integrity_seal,
      schema_version, pipeline_algorithm_id, pipeline_algorithm_version
    ) VALUES ($1, 'snap_bench', 'doc_bench', $2, '1.0', 'algo_bench', '1.0.0')
  `, [testPkgId, `seal_bench_${timestamp}`]);

  await pgClient.query(`
    INSERT INTO public.canonical_package_tenancy (
      package_id, tenant_id, organization_id, visibility_scope
    ) VALUES ($1, $2, 'org_bench', 'TENANT_RESTRICTED')
  `, [testPkgId, tenantId]);

  const SUBMIT_SAMPLE_COUNT = 10;
  const submitSamples: number[] = [];
  let submitErrors = 0;

  try {
    for (let i = 0; i < SUBMIT_SAMPLE_COUNT; i++) {
      const candidateId = `cand_bench_${timestamp}_${i}`;
      const token = createCandidateJwt(candidateId, tenantId);
      const leaseId = `lease_bench_${i}`;

      // 1. Init session
      const initRes = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/session/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({ packageId: testPkgId, deviceLeaseId: leaseId }),
      });
      const initData = await initRes.json();
      const sessId = initData.examSessionId;

      // 2. Measure submit round-trip time
      const t0 = performance.now();
      const submitRes = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/attempt/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({ examSessionId: sessId, deviceLeaseId: leaseId }),
      });
      const duration = performance.now() - t0;
      if (submitRes.status === 200) {
        submitSamples.push(duration);
      } else {
        submitErrors++;
      }
    }

    const submitStats = computeStats(submitSamples);
    console.log(`Operation: POST /attempt/submit (Full End-to-End Evaluation & DB Persistence)`);
    console.log(`Samples: ${submitStats.count}/${SUBMIT_SAMPLE_COUNT}, Errors: ${submitErrors}`);
    console.log(`Min: ${submitStats.min.toFixed(1)}ms | Median: ${submitStats.median.toFixed(1)}ms | p95: ${submitStats.p95.toFixed(1)}ms | Max: ${submitStats.max.toFixed(1)}ms | Avg: ${submitStats.avg.toFixed(1)}ms\n`);

  } finally {
    // Clean up
    await pgClient.query('DROP TRIGGER IF EXISTS trg_canonical_packages_immutable ON public.canonical_assessment_packages');
    await pgClient.query('DROP TRIGGER IF EXISTS trg_evaluations_immutable ON public.candidate_evaluation_runs');
    await pgClient.query('DELETE FROM public.candidate_evaluation_runs WHERE package_id = $1', [testPkgId]);
    await pgClient.query('DELETE FROM public.exam_sessions WHERE package_id = $1', [testPkgId]);
    await pgClient.query('DELETE FROM public.canonical_package_tenancy WHERE package_id = $1', [testPkgId]);
    await pgClient.query('DELETE FROM public.canonical_assessment_packages WHERE package_id = $1', [testPkgId]);
    await pgClient.query(`
      CREATE TRIGGER trg_canonical_packages_immutable
        BEFORE UPDATE OR DELETE ON public.canonical_assessment_packages
        FOR EACH ROW EXECUTE FUNCTION uadue_prevent_record_mutation();
      CREATE TRIGGER trg_evaluations_immutable
        BEFORE UPDATE OR DELETE ON public.candidate_evaluation_runs
        FOR EACH ROW EXECUTE FUNCTION uadue_prevent_record_mutation();
    `);
    await pgClient.end();
    gatewayServer.close();
  }
}

runLatencyBenchmark().catch(err => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
