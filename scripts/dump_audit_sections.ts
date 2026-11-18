import { Client } from '../web/node_modules/pg';
import * as fs from 'fs';
import * as path from 'path';

const secretsPath = path.resolve(__dirname, '../.env.delivery.secrets');
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

const section = process.argv[2] || 'policies';

async function dump() {
  const client = new Client({
    host: poolerHost,
    port: 5432,
    database: 'postgres',
    user: `postgres.${projectRef}`,
    password: dbPassword,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  if (section === 'policies') {
    const res = await client.query(`
      SELECT tablename, policyname, roles::text[], cmd, qual, with_check 
      FROM pg_policies 
      WHERE schemaname = 'public' 
      ORDER BY tablename, policyname;
    `);
    console.log(`Total policies found: ${res.rows.length}`);
    for (const r of res.rows) {
      console.log(`Table: ${r.tablename} | Policy: ${r.policyname} | Roles: ${r.roles} | Cmd: ${r.cmd}`);
      console.log(`  USING: ${r.qual}`);
      console.log(`  WITH CHECK: ${r.with_check}`);
    }
  } else if (section === 'roles_privs') {
    const rolesRes = await client.query(`
      SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls 
      FROM pg_roles 
      WHERE rolname IN ('anon', 'authenticated', 'service_role', 'uadue_app_user', 'postgres', 'supabase_admin')
      ORDER BY rolname;
    `);
    console.log('ROLES:');
    console.table(rolesRes.rows);

    const privsRes = await client.query(`
      SELECT grantee, table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) as privileges
      FROM information_schema.table_privileges 
      WHERE table_schema = 'public' 
        AND grantee IN ('anon', 'authenticated', 'service_role', 'uadue_app_user', 'PUBLIC')
      GROUP BY grantee, table_name
      ORDER BY table_name, grantee;
    `);
    console.log('\nPRIVILEGES ON 21 TABLES:');
    for (const r of privsRes.rows) {
      console.log(`${r.table_name.padEnd(42)} | ${r.grantee.padEnd(16)} | ${r.privileges}`);
    }
  } else if (section === 'triggers') {
    const res = await client.query(`
      SELECT event_object_table, trigger_name, event_manipulation, action_timing, action_statement 
      FROM information_schema.triggers 
      WHERE trigger_schema = 'public'
      ORDER BY event_object_table, trigger_name;
    `);
    console.log(`Total triggers found: ${res.rows.length}`);
    for (const r of res.rows) {
      console.log(`${r.event_object_table.padEnd(42)} | ${r.trigger_name.padEnd(35)} | ${r.action_timing} ${r.event_manipulation}`);
    }
  } else if (section === 'funcs') {
    const res = await client.query(`
      SELECT p.proname, r.rolname as owner, p.prosecdef as is_sec_definer, p.prosrc, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_roles r ON r.oid = p.proowner
      WHERE n.nspname = 'public' AND p.proname LIKE 'uadue%'
      ORDER BY p.proname;
    `);
    console.log('FUNCTIONS:');
    for (const r of res.rows) {
      console.log(`Function: ${r.proname} | Owner: ${r.owner} | SecDefiner: ${r.is_sec_definer} | Config: ${r.proconfig}`);
      console.log(`Body:\n${r.prosrc}\n---`);
    }
  }

  await client.end();
}

dump().catch(e => { console.error(e.message); process.exit(1); });
