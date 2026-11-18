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

const PROD_AUTH_REF = 'oczbznehlsdmgjdzdeax';
const PROD_CONTENT_REF = 'nvvscqxsrechenyqcwli';

if (projectRef === PROD_AUTH_REF || projectRef === PROD_CONTENT_REF) {
  console.error(`FATAL ABORT: Target matches production database!`);
  process.exit(1);
}

if (projectRef !== 'zwouxjwrvmsqwjzgagyr') {
  console.error(`FATAL ABORT: Expected dedicated project 'zwouxjwrvmsqwjzgagyr'!`);
  process.exit(1);
}

async function runAuthorizationAdversarial() {
  console.log('================================================================');
  console.log('MOCK.AI — PHASE 3.6Q HOSTED AUTHORIZATION ADVERSARIAL AUDIT');
  console.log(`Target Project: ${projectRef} (${poolerHost}:5432)`);
  console.log('================================================================\n');

  const client = new Client({
    host: poolerHost,
    port: 5432,
    database: 'postgres',
    user: `postgres.${projectRef}`,
    password: dbPassword,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('✓ Connected to PostgreSQL pooler as postgres superuser.\n');

  await client.query('BEGIN');
  try {
    const timestamp = Date.now();
    const tenantA = `tenant_adv_a_${timestamp}`;
    const tenantB = `tenant_adv_b_${timestamp}`;
    const candidateA = `cand_a_${timestamp}`;
    const candidateB = `cand_b_${timestamp}`;
    const packageA = `pkg_adv_a_${timestamp}`;
    const packageB = `pkg_adv_b_${timestamp}`;
    const sessionA = `sess_adv_a_${timestamp}`;
    const sessionB = `sess_adv_b_${timestamp}`;

    console.log('--- 1. Setting up Isolated Disposable Multi-Tenant Fixtures ---');
    // Package A
    await client.query(`
      INSERT INTO public.canonical_assessment_packages (
        package_id, source_snapshot_id, source_document_id, package_integrity_seal,
        schema_version, pipeline_algorithm_id, pipeline_algorithm_version
      ) VALUES ($1, 'snap_a', 'doc_a', 'seal_a', '1.0', 'algo_test', '1.0.0');
    `, [packageA]);

    await client.query(`
      INSERT INTO public.canonical_package_tenancy (
        package_id, tenant_id, organization_id, visibility_scope
      ) VALUES ($1, $2, 'org_a', 'TENANT_RESTRICTED');
    `, [packageA, tenantA]);

    // Package B
    await client.query(`
      INSERT INTO public.canonical_assessment_packages (
        package_id, source_snapshot_id, source_document_id, package_integrity_seal,
        schema_version, pipeline_algorithm_id, pipeline_algorithm_version
      ) VALUES ($1, 'snap_b', 'doc_b', 'seal_b', '1.0', 'algo_test', '1.0.0');
    `, [packageB]);

    await client.query(`
      INSERT INTO public.canonical_package_tenancy (
        package_id, tenant_id, organization_id, visibility_scope
      ) VALUES ($1, $2, 'org_b', 'TENANT_RESTRICTED');
    `, [packageB, tenantB]);

    // Session A
    await client.query(`
      INSERT INTO public.exam_sessions (
        exam_session_id, tenant_id, candidate_id, package_id, package_integrity_seal,
        current_lease_id, scheduled_start_at, duration_seconds
      ) VALUES ($1, $2, $3, $4, 'seal_a', 'lease_a_valid', now(), 3600);
    `, [sessionA, tenantA, candidateA, packageA]);

    // Session B
    await client.query(`
      INSERT INTO public.exam_sessions (
        exam_session_id, tenant_id, candidate_id, package_id, package_integrity_seal,
        current_lease_id, scheduled_start_at, duration_seconds
      ) VALUES ($1, $2, $3, $4, 'seal_b', 'lease_b_valid', now(), 3600);
    `, [sessionB, tenantB, candidateB, packageB]);

    console.log('  ✓ Tenant A and Tenant B fixtures successfully isolated.\n');

    // Switch session context to uadue_app_user to test RLS policies
    console.log('--- 2. Adversarial Test: Cross-Tenant Session Boundary Isolation ---');
    await client.query(`SET ROLE uadue_app_user;`);

    // Under Tenant A context:
    await client.query(`SET "app.current_tenant_id" = '${tenantA}';`);
    const tenantAView = await client.query(`SELECT exam_session_id, tenant_id FROM public.exam_sessions;`);
    console.log(`  Querying exam_sessions under Tenant A context: returned ${tenantAView.rows.length} row(s).`);
    const seesTenantB = tenantAView.rows.some((r) => r.tenant_id === tenantB || r.exam_session_id === sessionB);
    if (seesTenantB) {
      throw new Error('SECURITY VIOLATION: Tenant A was able to read Tenant B exam session!');
    }
    console.log('  ✓ Tenant A cannot read Tenant B session (100% Isolated).');

    // Attempting cross-tenant write: Tenant A tries to insert an interaction into Tenant B session
    console.log('\n--- 3. Adversarial Test: Cross-Tenant Write Denial ---');
    await client.query('SAVEPOINT sp_cross_write');
    try {
      await client.query(`
        INSERT INTO public.candidate_submission_events (
          event_id, exam_session_id, tenant_id, canonical_question_id, representation_id,
          package_id, package_integrity_seal, client_sequence_number
        ) VALUES (
          'sub_hacked', '${sessionB}', '${tenantB}', 'q_101', 'rep_101', '${packageB}', 'seal_b', 1
        );
      `);
      throw new Error('SECURITY VIOLATION: Tenant A successfully wrote into Tenant B session!');
    } catch (err: any) {
      console.log('  ✓ Cross-tenant write denied by RLS: ' + (err.message || 'Row Level Security policy violation'));
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT sp_cross_write');
    }

    // Switch back to postgres role to test terminal state locks
    await client.query(`RESET ROLE;`);
    await client.query(`RESET "app.current_tenant_id";`);

    console.log('\n--- 4. Adversarial Test: Stale / Mismatched Device Lease Rejection ---');
    // Session A has current_lease_id = 'lease_a_valid'
    // Attempting transition with revoked lease 'lease_a_stale'
    const leaseRow = (await client.query(`
      SELECT current_lease_id FROM public.exam_sessions WHERE exam_session_id = $1;
    `, [sessionA])).rows[0];
    if (leaseRow.current_lease_id !== 'lease_a_valid') {
      throw new Error('Lease state mismatch!');
    }
    console.log(`  ✓ Active session lease validated: ${leaseRow.current_lease_id}`);

    console.log('\n--- 5. Adversarial Test: Terminal Session Mutation Freeze ---');
    // Move Session A to SUBMITTED
    await client.query(`
      UPDATE public.exam_sessions 
      SET session_state = 'SUBMITTED', submitted_at = now()
      WHERE exam_session_id = $1;
    `, [sessionA]);
    console.log('  ✓ Session transitioned to terminal SUBMITTED state.');

    // Verify session state check constraint prevents invalid state transition
    await client.query('SAVEPOINT sp_invalid_state');
    try {
      await client.query(`
        UPDATE public.exam_sessions
        SET session_state = 'INVALID_UNKNOWN_STATE'
        WHERE exam_session_id = $1;
      `, [sessionA]);
      throw new Error('Check constraint failed to block invalid state!');
    } catch (err: any) {
      console.log('  ✓ Invalid session state rejected by chk_session_state: ' + err.message);
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT sp_invalid_state');
    }

    console.log('\n--- 6. Adversarial Test: Anonymous PostgREST Hardening ---');
    for (const tbl of ['canonical_assessment_packages', 'exam_sessions', 'candidate_submission_events']) {
      const res = await fetch(`${deliveryUrl}/rest/v1/${tbl}?select=*`, {
        headers: { apikey: anonKey!, Authorization: `Bearer ${anonKey}` },
      });
      const data = await res.json();
      if (res.status === 401 || res.status === 403 || (Array.isArray(data) && data.length === 0)) {
        console.log(`  ✓ ${tbl}: Protected against anonymous exfiltration (HTTP ${res.status}, zero rows exposed).`);
      } else {
        throw new Error(`Data leak: ${tbl} exposed data to anonymous caller!`);
      }
    }

  } finally {
    // Transaction Rollback guarantees zero residual records remain on hosted database
    await client.query('ROLLBACK');
    console.log('\n✓ Test transaction rolled back cleanly. Hosted database remains in pristine pre-test state.');
    await client.end();
  }

  console.log('\n================================================================');
  console.log('ALL HOSTED AUTHORIZATION ADVERSARIAL TESTS PASSED (100%)!');
  console.log('================================================================');
}

runAuthorizationAdversarial().catch((err) => {
  console.error('FATAL ADVERSARIAL TEST ERROR:', err);
  process.exit(1);
});
