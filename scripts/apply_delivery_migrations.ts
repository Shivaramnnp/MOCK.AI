import { Client } from '../web/node_modules/pg';
import * as fs from 'fs';
import * as path from 'path';

// Load secrets from root .env.delivery.secrets (strictly gitignored)
const secretsPath = path.resolve(__dirname, '../.env.delivery.secrets');
if (!fs.existsSync(secretsPath)) {
  console.error('ERROR: .env.delivery.secrets file not found!');
  process.exit(1);
}

const lines = fs.readFileSync(secretsPath, 'utf8').split('\n');
const env: Record<string, string> = {};
for (const line of lines) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
}

const projectRef = env['SUPABASE_DELIVERY_PROJECT_REF'] || 'zwouxjwrvmsqwjzgagyr';
const PROD_AUTH_REF = 'oczbznehlsdmgjdzdeax';
const PROD_CONTENT_REF = 'nvvscqxsrechenyqcwli';

console.log('--- MOCK.AI Phase 3.6P Dedicated Delivery Pre-Migration Verification ---');
console.log(`Checking target project reference: ${projectRef}`);

if (!projectRef || projectRef.trim() === '') {
  console.error('FATAL: SUPABASE_DELIVERY_PROJECT_REF is missing or empty. STOPPING.');
  process.exit(1);
}

if (projectRef === PROD_AUTH_REF || projectRef === PROD_CONTENT_REF) {
  console.error(`FATAL: Target project '${projectRef}' matches production! ABORTING IMMEDIATELY.`);
  process.exit(1);
}

if (projectRef !== 'zwouxjwrvmsqwjzgagyr') {
  console.error(`FATAL: Target project '${projectRef}' does not match mockai-delivery (zwouxjwrvmsqwjzgagyr). STOPPING.`);
  process.exit(1);
}

console.log('✓ Project reference verified as dedicated delivery project (zwouxjwrvmsqwjzgagyr).');

// Pooler host for Tokyo (ap-northeast-1)
const poolerHost = 'aws-0-ap-northeast-1.pooler.supabase.com';
const dbPassword = env['SUPABASE_DELIVERY_DB_PASSWORD'] || process.env.SUPABASE_DELIVERY_DB_PASSWORD;

if (!dbPassword) {
  console.log('\n[NOTICE] SUPABASE_DELIVERY_DB_PASSWORD is not set in .env.delivery.secrets.');
  console.log('To apply migrations automatically via this script:');
  console.log('  1. Add SUPABASE_DELIVERY_DB_PASSWORD=<your_db_password> to .env.delivery.secrets');
  console.log('  2. Re-run: npx tsx scripts/apply_delivery_migrations.ts\n');
  console.log('Alternatively, you can run the SQL files directly in the Supabase Dashboard SQL Editor:');
  console.log('  https://supabase.com/dashboard/project/zwouxjwrvmsqwjzgagyr/sql');
  console.log('  Run the 3 migrations in order:');
  console.log('    1. supabase/migrations/20261007_uadue_phase2d8_canonical.sql');
  console.log('    2. supabase/migrations/20261007_uadue_phase3_database_foundation.sql');
  console.log('    3. supabase/migrations/20261009_uadue_phase3_6_security_remediation.sql\n');
  process.exit(0);
}

const client = new Client({
  host: poolerHost,
  port: 5432,
  database: 'postgres',
  user: `postgres.${projectRef}`,
  password: dbPassword,
  ssl: { rejectUnauthorized: false },
});

async function runMigrations() {
  await client.connect();
  console.log(`✓ Connected to PostgreSQL pooler host: ${poolerHost}`);

  const hostCheck = await client.query('SELECT current_database(), current_user');
  console.log(`✓ Database: ${hostCheck.rows[0].current_database}, User: ${hostCheck.rows[0].current_user}`);

  const migrations = [
    '20261007_uadue_phase2d8_canonical.sql',
    '20261007_uadue_phase3_database_foundation.sql',
    '20261009_uadue_phase3_6_security_remediation.sql',
  ];

  for (const mig of migrations) {
    const migPath = path.resolve(__dirname, '../supabase/migrations', mig);
    console.log(`\nApplying migration: ${mig}...`);
    const sql = fs.readFileSync(migPath, 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log(`✓ Migration ${mig} applied successfully.`);
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error(`✗ Error applying ${mig}:`, err.message);
      throw err;
    }
  }

  // Audit verified tables
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND (table_name LIKE 'canonical_%' OR table_name LIKE 'exam_%' OR table_name LIKE 'candidate_%')
    ORDER BY table_name;
  `);

  console.log('\n--- Applied Schema Verification ---');
  console.log(`Verified ${tablesRes.rows.length} UADUE delivery tables created on mockai-delivery:`);
  for (const row of tablesRes.rows) {
    console.log(`  - ${row.table_name}`);
  }

  // Audit RLS status
  const rlsRes = await client.query(`
    SELECT tablename, rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public' 
      AND (tablename LIKE 'canonical_%' OR tablename LIKE 'exam_%' OR tablename LIKE 'candidate_%')
    ORDER BY tablename;
  `);
  console.log(`\nRLS Status across ${rlsRes.rows.length} tables:`);
  let allRlsEnabled = true;
  for (const row of rlsRes.rows) {
    if (!row.rowsecurity) allRlsEnabled = false;
  }
  console.log(`All tables have Row Level Security enabled: ${allRlsEnabled ? '✓ YES' : '✗ NO'}`);

  await client.end();
  console.log('\n✓ Delivery database migrations completed with zero errors.');
}

runMigrations().catch((err) => {
  console.error('FATAL Migration Error:', err);
  process.exit(1);
});
