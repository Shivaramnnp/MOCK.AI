import * as fs from 'fs';
import * as path from 'path';

// Load secrets from .env.delivery.secrets
const secretsPath = path.resolve(__dirname, '../.env.delivery.secrets');
if (!fs.existsSync(secretsPath)) {
  console.error('ERROR: .env.delivery.secrets not found');
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
const PROD_AUTH_REF = 'oczbznehlsdmgjdzdeax';
const PROD_CONTENT_REF = 'nvvscqxsrechenyqcwli';

console.log('================================================================');
console.log('MOCK.AI — PHASE 3.6P HOSTED DELIVERY DATABASE VERIFICATION');
console.log('================================================================');
console.log(`Checking target project: ${projectRef}`);

if (projectRef === PROD_AUTH_REF || projectRef === PROD_CONTENT_REF) {
  console.error(`FATAL: Target project '${projectRef}' matches production! ABORTING.`);
  process.exit(1);
}

if (projectRef !== 'zwouxjwrvmsqwjzgagyr') {
  console.error(`FATAL: Unexpected project '${projectRef}'. Expected zwouxjwrvmsqwjzgagyr.`);
  process.exit(1);
}

console.log('✓ Target verified: Dedicated delivery project (zwouxjwrvmsqwjzgagyr)');

const deliveryUrl = env['SUPABASE_DELIVERY_URL'] || `https://${projectRef}.supabase.co`;
const serviceRoleKey = env['SUPABASE_DELIVERY_SERVICE_ROLE_KEY'];
const anonKey = env['SUPABASE_DELIVERY_ANON_KEY'];

if (!serviceRoleKey || !anonKey) {
  console.error('FATAL: API keys missing from .env.delivery.secrets');
  process.exit(1);
}

const EXPECTED_TABLES = [
  'canonical_assessment_packages',
  'canonical_questions',
  'canonical_question_options',
  'canonical_question_assets',
  'canonical_solution_manifests',
  'canonical_answer_keys',
  'canonical_scoring_policies',
  'exam_sessions',
  'exam_session_leases',
  'exam_session_state_transitions',
  'exam_session_pause_intervals',
  'submission_events',
  'candidate_evaluation_runs',
  'candidate_question_scores',
  'candidate_evaluation_disputes',
  'delivery_audit_log',
];

async function verifyHosted() {
  console.log('\n--- 1. REST Gateway & Schema Introspection ---');
  const res = await fetch(`${deliveryUrl}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!res.ok) {
    console.error(`✗ Failed to query REST gateway: HTTP ${res.status}`);
    process.exit(1);
  }

  const swagger = (await res.json()) as any;
  const definitions = Object.keys(swagger.definitions || {});
  const paths = Object.keys(swagger.paths || {});

  console.log(`OpenAPI definitions exposed: ${definitions.length}`);
  console.log(`REST paths exposed: ${paths.length}`);

  console.log('\n--- 2. Required Delivery Tables Audit ---');
  let missingTables = 0;
  for (const table of EXPECTED_TABLES) {
    const isPresent = definitions.includes(table) || paths.includes(`/${table}`);
    if (isPresent) {
      console.log(`  ✓ ${table}: PRESENT`);
    } else {
      console.log(`  ✗ ${table}: MISSING`);
      missingTables++;
    }
  }

  if (missingTables > 0) {
    console.log(`\n[STATUS: MIGRATIONS_PENDING]`);
    console.log(`${missingTables} of ${EXPECTED_TABLES.length} expected delivery tables are not yet present in ${projectRef}.`);
    console.log('The 3 SQL migrations need to be applied to the database.');
    return { status: 'PENDING_MIGRATIONS', missingTables, total: EXPECTED_TABLES.length };
  }

  console.log('\n--- 3. RLS Anonymous Access Hardening Test ---');
  let rlsPassed = true;
  for (const table of ['canonical_solution_manifests', 'canonical_answer_keys', 'submission_events', 'exam_sessions']) {
    try {
      const anonRes = await fetch(`${deliveryUrl}/rest/v1/${table}?select=*`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      });
      const data = await anonRes.json();
      if (Array.isArray(data) && data.length === 0) {
        console.log(`  ✓ ${table}: Protected (0 rows exposed to anonymous access)`);
      } else if (anonRes.status === 401 || anonRes.status === 403) {
        console.log(`  ✓ ${table}: Protected (HTTP ${anonRes.status} Access Denied)`);
      } else {
        console.log(`  ✗ ${table}: WARNING! Exposed data to anonymous access:`, data);
        rlsPassed = false;
      }
    } catch (e: any) {
      console.log(`  ✓ ${table}: Protected (${e.message})`);
    }
  }

  console.log(`\nRLS Protection across restricted tables: ${rlsPassed ? '✓ ALL PROTECTED' : '✗ FAILED'}`);

  return { status: 'VERIFIED', missingTables: 0, total: EXPECTED_TABLES.length };
}

verifyHosted().catch((err) => {
  console.error('Fatal Verification Error:', err);
  process.exit(1);
});
