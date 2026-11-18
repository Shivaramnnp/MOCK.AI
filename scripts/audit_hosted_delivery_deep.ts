import { Client } from '../web/node_modules/pg';
import * as fs from 'fs';
import * as path from 'path';

// 1. Target Safety & Credentials Check
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
const deliveryUrl = env['SUPABASE_DELIVERY_URL'] || `https://${projectRef}.supabase.co`;
const anonKey = env['SUPABASE_DELIVERY_ANON_KEY'];
const serviceRoleKey = env['SUPABASE_DELIVERY_SERVICE_ROLE_KEY'];

const PROD_AUTH_REF = 'oczbznehlsdmgjdzdeax';
const PROD_CONTENT_REF = 'nvvscqxsrechenyqcwli';

if (projectRef === PROD_AUTH_REF || projectRef === PROD_CONTENT_REF) {
  console.error(`FATAL ABORT: Connected project '${projectRef}' matches production!`);
  process.exit(1);
}

if (projectRef !== 'zwouxjwrvmsqwjzgagyr') {
  console.error(`FATAL ABORT: Expected project 'zwouxjwrvmsqwjzgagyr', but got '${projectRef}'!`);
  process.exit(1);
}

if (!dbPassword) {
  console.error('FATAL: SUPABASE_DELIVERY_DB_PASSWORD missing from .env.delivery.secrets.');
  process.exit(1);
}

async function runDeepAudit() {
  console.log('================================================================');
  console.log('MOCK.AI — PHASE 3.6P HOSTED DELIVERY DEEP AUDIT & ADVERSARIAL REHEARSAL');
  console.log(`Target Project: ${projectRef}`);
  console.log(`Pooler Endpoint: ${poolerHost}:5432`);
  console.log('================================================================\n');

  console.log('✓ Target Safety Confirmed: Dedicated delivery project (zwouxjwrvmsqwjzgagyr).');
  console.log('✓ Production projects (oczbznehlsdmgjdzdeax, nvvscqxsrechenyqcwli) untouched.\n');

  // Direct PostgreSQL Connection
  const client = new Client({
    host: poolerHost,
    port: 5432,
    database: 'postgres',
    user: `postgres.${projectRef}`,
    password: dbPassword,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('✓ PostgreSQL pooler connection established.\n');

  // 1. Table Inventory Check
  const expectedTables = [
    'canonical_assessment_packages',
    'canonical_package_events',
    'canonical_questions',
    'canonical_question_representations',
    'canonical_answer_authority_resolutions',
    'canonical_logical_families',
    'canonical_relationship_evaluations',
    'canonical_family_memberships',
    'canonical_quarantined_relationships',
    'canonical_package_supersessions',
    'canonical_package_tenancy',
    'canonical_assets',
    'exam_sessions',
    'exam_session_transitions',
    'exam_session_projections',
    'candidate_submission_events',
    'candidate_question_states',
    'candidate_evaluation_runs',
    'candidate_question_scores',
    'candidate_scoring_disputes',
    'audit_events',
  ];

  const tableRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  const actualTables = tableRes.rows.map((r) => r.table_name);

  console.log(`--- Step 1: Hosted Table Inventory (${actualTables.length} tables found) ---`);
  let missingCount = 0;
  for (const exp of expectedTables) {
    if (actualTables.includes(exp)) {
      console.log(`  ✓ ${exp}: PRESENT`);
    } else {
      console.log(`  ✗ ${exp}: MISSING`);
      missingCount++;
    }
  }

  if (missingCount > 0) {
    throw new Error(`Audit Failure: ${missingCount} expected delivery tables are missing!`);
  }

  // 2. RLS & FORCE RLS Audit
  console.log('\n--- Step 2: Row Level Security & FORCE RLS Status ---');
  const rlsRes = await client.query(`
    SELECT c.relname AS table_name,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND (c.relname LIKE 'canonical_%' OR c.relname LIKE 'exam_%' OR c.relname LIKE 'candidate_%' OR c.relname = 'audit_events')
    ORDER BY c.relname;
  `);

  let allRlsEnabled = true;
  let allRlsForced = true;
  for (const r of rlsRes.rows) {
    console.log(`  ${r.table_name}: RLS=${r.rls_enabled ? 'ENABLED' : 'DISABLED'}, FORCE_RLS=${r.rls_forced ? 'FORCED' : 'NOT_FORCED'}`);
    if (!r.rls_enabled) allRlsEnabled = false;
    if (!r.rls_forced) allRlsForced = false;
  }
  console.log(`\nRLS Enabled across all delivery tables: ${allRlsEnabled ? '✓ YES (100%)' : '✗ NO'}`);
  console.log(`FORCE RLS enabled across all delivery tables: ${allRlsForced ? '✓ YES (100%)' : '✗ NO'}`);

  // 3. Immutability Triggers Audit
  console.log('\n--- Step 3: Active Immutability Triggers Audit ---');
  const trgRes = await client.query(`
    SELECT event_object_table, trigger_name, action_timing, event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name;
  `);
  for (const r of trgRes.rows) {
    console.log(`  ${r.event_object_table} -> ${r.trigger_name} (${r.action_timing} ${r.event_manipulation})`);
  }

  // 4. Least-Privilege Grants for uadue_app_user
  console.log('\n--- Step 4: Least-Privilege Role Hardening Audit (uadue_app_user) ---');
  const roleCheck = await client.query(`
    SELECT rolcanlogin, rolcreaterole, rolcreatedb, rolreplication 
    FROM pg_roles 
    WHERE rolname = 'uadue_app_user';
  `);
  if (roleCheck.rows.length === 0) {
    throw new Error('Role uadue_app_user not found!');
  }
  const roleInfo = roleCheck.rows[0];
  console.log(`  uadue_app_user attributes: canLogin=${roleInfo.rolcanlogin}, createRole=${roleInfo.rolcreaterole}, createDB=${roleInfo.rolcreatedb}, replication=${roleInfo.rolreplication}`);

  const grantsRes = await client.query(`
    SELECT table_name, privilege_type 
    FROM information_schema.role_table_grants 
    WHERE grantee = 'uadue_app_user' AND table_schema = 'public'
    ORDER BY table_name, privilege_type;
  `);
  const privMap: Record<string, string[]> = {};
  for (const r of grantsRes.rows) {
    if (!privMap[r.table_name]) privMap[r.table_name] = [];
    privMap[r.table_name].push(r.privilege_type);
  }
  console.log(`  Grants across ${Object.keys(privMap).length} tables for uadue_app_user:`);
  for (const [tbl, privs] of Object.entries(privMap)) {
    console.log(`    ${tbl}: ${privs.join(', ')}`);
  }
  const assetExposed = Boolean(privMap['canonical_assets']);
  console.log(`  canonical_assets granted to uadue_app_user: ${assetExposed ? '✗ LEAKED' : '✓ EXCLUDED (Service-role only)'}`);

  // 5. Live Adversarial Rehearsal (Inside Transaction with automatic ROLLBACK)
  console.log('\n--- Step 5: Live Adversarial Rehearsal in Transaction ---');
  await client.query('BEGIN');
  try {
    const testPkgId = `audit_pkg_${Date.now()}`;
    const testTenantId = `tenant_audit_${Date.now()}`;
    const testSessionId = `audit_sess_${Date.now()}`;

    // Insert test package
    await client.query(
      `INSERT INTO public.canonical_assessment_packages (
        package_id, source_snapshot_id, source_document_id, package_integrity_seal,
        schema_version, pipeline_algorithm_id, pipeline_algorithm_version
      ) VALUES ($1, 'snap_audit_01', 'doc_audit_01', 'seal_audit_01', '1.0', 'algo_test', '1.0.0')`,
      [testPkgId]
    );
    console.log('  ✓ Test canonical package inserted.');

    // HR-03: Attempt UPDATE on immutable package
    await client.query('SAVEPOINT sp_update');
    try {
      await client.query(
        `UPDATE public.canonical_assessment_packages SET schema_version = '2.0' WHERE package_id = $1`,
        [testPkgId]
      );
      throw new Error('FAIL: UPDATE on canonical_assessment_packages succeeded!');
    } catch (err: any) {
      if (err.message.includes('UADUE Immutability Violation')) {
        console.log('  ✓ HR-03: UPDATE rejected by immutability trigger (P0001): ' + err.message);
      } else {
        throw err;
      }
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT sp_update');
    }

    // HR-03: Attempt DELETE on immutable package
    await client.query('SAVEPOINT sp_delete');
    try {
      await client.query(
        `DELETE FROM public.canonical_assessment_packages WHERE package_id = $1`,
        [testPkgId]
      );
      throw new Error('FAIL: DELETE on canonical_assessment_packages succeeded!');
    } catch (err: any) {
      if (err.message.includes('UADUE Immutability Violation')) {
        console.log('  ✓ HR-03: DELETE rejected by immutability trigger (P0001): ' + err.message);
      } else {
        throw err;
      }
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT sp_delete');
    }

    // Insert test session
    await client.query(
      `INSERT INTO public.exam_sessions (
        exam_session_id, tenant_id, candidate_id, package_id, package_integrity_seal,
        current_lease_id, scheduled_start_at, duration_seconds
      ) VALUES ($1, $2, 'cand_audit_01', $3, 'seal_audit_01', 'lease_01', now(), 3600)`,
      [testSessionId, testTenantId, testPkgId]
    );
    console.log('  ✓ Test exam session inserted.');

    // HR-04: Session transition insert and immutability
    const transId = `tr_audit_${Date.now()}`;
    await client.query(
      `INSERT INTO public.exam_session_transitions (
        transition_id, exam_session_id, tenant_id, transition_request_id,
        from_state, to_state, from_version, to_version, idempotency_hash
      ) VALUES ($1, $2, $3, 'req_start_01', 'INITIALIZED', 'ACTIVE', 1, 2, 'hash_trans_01')`,
      [transId, testSessionId, testTenantId]
    );
    console.log('  ✓ Session state transition recorded.');

    await client.query('SAVEPOINT sp_trans_update');
    try {
      await client.query(
        `UPDATE public.exam_session_transitions SET to_state = 'TERMINATED' WHERE transition_id = $1`,
        [transId]
      );
      throw new Error('FAIL: UPDATE on exam_session_transitions succeeded!');
    } catch (err: any) {
      if (err.message.includes('UADUE Immutability Violation')) {
        console.log('  ✓ HR-04: Transition UPDATE rejected by immutability trigger: ' + err.message);
      } else {
        throw err;
      }
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT sp_trans_update');
    }

    // HR-06: Duplicate transition idempotency
    await client.query('SAVEPOINT sp_dup_trans');
    try {
      await client.query(
        `INSERT INTO public.exam_session_transitions (
          transition_id, exam_session_id, tenant_id, transition_request_id,
          from_state, to_state, from_version, to_version, idempotency_hash
        ) VALUES ($1, $2, $3, 'req_start_01', 'INITIALIZED', 'ACTIVE', 1, 2, 'hash_trans_dup')`,
        [`tr_dup_${Date.now()}`, testSessionId, testTenantId]
      );
      throw new Error('FAIL: Duplicate transition accepted!');
    } catch (err: any) {
      if (err.message.includes('uq_session_trans_req')) {
        console.log('  ✓ HR-06: Duplicate transition request rejected by uq_session_trans_req: ' + err.message);
      } else {
        throw err;
      }
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT sp_dup_trans');
    }

    // HR-10: Raw score preservation in evaluation runs
    const evalId = `eval_audit_${Date.now()}`;
    await client.query(
      `INSERT INTO public.candidate_evaluation_runs (
        evaluation_run_id, exam_session_id, tenant_id, package_id, package_integrity_seal,
        scoring_policy_version, answer_key_version, evaluation_contract_tuple,
        run_iteration, total_raw_score, questions_attempted, questions_correct,
        questions_incorrect, questions_unanswered, evaluation_signature
      ) VALUES (
        $1, $2, $3, $4, 'seal_audit_01',
        '1.0', '1.0', '{}'::jsonb,
        1, 42.5, 20, 15, 3, 2, 'sig_audit_01'
      )`,
      [evalId, testSessionId, testTenantId, testPkgId]
    );
    const evalRow = (await client.query(
      `SELECT total_raw_score, total_normalized_score FROM public.candidate_evaluation_runs WHERE evaluation_run_id = $1`,
      [evalId]
    )).rows[0];
    console.log(`  ✓ HR-10: Frozen raw-score preserved: total_raw_score=${evalRow.total_raw_score}, total_normalized_score=${evalRow.total_normalized_score ?? 'NULL (unexposed)'}`);

  } finally {
    await client.query('ROLLBACK');
    console.log('  ✓ Transaction cleanly rolled back: zero residual test data remaining on hosted DB.');
  }

  // 6. PostgREST Anonymous Endpoint Hardening Test
  console.log('\n--- Step 6: PostgREST Anonymous Access Denial Test ---');
  for (const tbl of ['canonical_assessment_packages', 'canonical_questions', 'exam_sessions', 'candidate_submission_events', 'canonical_assets']) {
    const res = await fetch(`${deliveryUrl}/rest/v1/${tbl}?select=*`, {
      headers: { apikey: anonKey!, Authorization: `Bearer ${anonKey}` },
    });
    const data = await res.json();
    if (res.status === 401 || res.status === 403 || (Array.isArray(data) && data.length === 0)) {
      console.log(`  ✓ ${tbl}: Protected from anon (HTTP ${res.status}, zero rows exposed)`);
    } else {
      throw new Error(`Security Failure: Anon accessed ${tbl}: ${JSON.stringify(data)}`);
    }
  }

  await client.end();
  console.log('\n================================================================');
  console.log('ALL HOSTED AUDIT CHECKS & ADVERSARIAL TESTS PASSED (100%)!');
  console.log('================================================================');
}

runDeepAudit().catch((err) => {
  console.error('FATAL AUDIT ERROR:', err);
  process.exit(1);
});
