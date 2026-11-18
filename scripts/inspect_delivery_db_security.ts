import { Client } from '../web/node_modules/pg';
import * as fs from 'fs';
import * as path from 'path';

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

if (projectRef !== 'zwouxjwrvmsqwjzgagyr') {
  console.error(`FATAL: Expected zwouxjwrvmsqwjzgagyr, got ${projectRef}`);
  process.exit(1);
}

async function runReadOnlyAudit() {
  const client = new Client({
    host: poolerHost,
    port: 5432,
    database: 'postgres',
    user: `postgres.${projectRef}`,
    password: dbPassword,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  console.log('--- 1. PG_POLICIES FOR ALL PUBLIC TABLES ---');
  const policiesRes = await client.query(`
    SELECT 
      schemaname, 
      tablename, 
      policyname, 
      permissive, 
      roles::text[], 
      cmd, 
      qual, 
      with_check 
    FROM pg_policies 
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `);
  console.log(JSON.stringify(policiesRes.rows, null, 2));

  console.log('\n--- 2. TABLE RLS AND FORCE RLS STATUS ---');
  const rlsRes = await client.query(`
    SELECT 
      relname, 
      relrowsecurity, 
      relforcerowsecurity 
    FROM pg_class 
    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace 
    WHERE pg_namespace.nspname = 'public' 
      AND pg_class.relkind = 'r'
    ORDER BY relname;
  `);
  console.log(JSON.stringify(rlsRes.rows, null, 2));

  console.log('\n--- 3. DATABASE ROLES & ATTRIBUTES ---');
  const rolesRes = await client.query(`
    SELECT 
      rolname, 
      rolsuper, 
      rolinherit, 
      rolcreaterole, 
      rolcreatedb, 
      rolcanlogin, 
      rolreplication, 
      rolbypassrls 
    FROM pg_roles 
    WHERE rolname IN ('anon', 'authenticated', 'service_role', 'uadue_app_user', 'postgres', 'supabase_admin')
    ORDER BY rolname;
  `);
  console.log(JSON.stringify(rolesRes.rows, null, 2));

  console.log('\n--- 4. ROLE PRIVILEGES ON PUBLIC TABLES ---');
  const privsRes = await client.query(`
    SELECT 
      grantee, 
      table_name, 
      string_agg(privilege_type, ', ' ORDER BY privilege_type) as privileges
    FROM information_schema.table_privileges 
    WHERE table_schema = 'public' 
      AND grantee IN ('anon', 'authenticated', 'service_role', 'uadue_app_user', 'PUBLIC')
    GROUP BY grantee, table_name
    ORDER BY table_name, grantee;
  `);
  console.log(JSON.stringify(privsRes.rows, null, 2));

  console.log('\n--- 5. FUNCTIONS, OWNERS, SECURITY DEFINER & SEARCH_PATH ---');
  const funcRes = await client.query(`
    SELECT 
      p.proname, 
      r.rolname as owner, 
      p.prosecdef as is_security_definer, 
      p.proleakproof,
      p.prosrc,
      p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = 'public' 
      AND p.proname LIKE 'uadue%'
    ORDER BY p.proname;
  `);
  console.log(JSON.stringify(funcRes.rows, null, 2));

  console.log('\n--- 6. TRIGGERS ON ALL 21 TABLES ---');
  const trigRes = await client.query(`
    SELECT 
      event_object_table, 
      trigger_name, 
      event_manipulation, 
      action_timing, 
      action_statement 
    FROM information_schema.triggers 
    WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name;
  `);
  console.log(JSON.stringify(trigRes.rows, null, 2));

  console.log('\n--- 7. CONSTRAINTS (UNIQUE, FOREIGN KEY, CHECK) ---');
  const constrRes = await client.query(`
    SELECT 
      conname, 
      conrelid::regclass::text as table_name, 
      contype, 
      pg_get_constraintdef(c.oid) as definition
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public'
    ORDER BY table_name, conname;
  `);
  console.log(JSON.stringify(constrRes.rows, null, 2));

  await client.end();
}

runReadOnlyAudit().catch(err => {
  console.error('Audit query error:', err.message);
  process.exit(1);
});
