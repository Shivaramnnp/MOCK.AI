/**
 * UADUE Phase 2D-8 — Real PostgreSQL Multi-Process Concurrency Worker
 * Document Version: 8.0.0-POSTGRES-CONCURRENCY
 *
 * Runs in an isolated Node child process with its own heap and connection pool.
 * Competes against PostgreSQL row-level locks (SELECT FOR UPDATE) to verify
 * process-independent transactional serialization.
 */

import { Pool } from 'pg';
import { CanonicalPostgresPersistenceAdapter } from './canonicalPostgresPersistenceAdapter';
import { PublicationConflictError } from './canonicalPublicationGateway';

async function runWorker() {
  const args = process.argv.slice(2);
  const getArg = (flag: string): string => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : '';
  };

  const packageId = getArg('--packageId');
  const packageIntegritySeal = getArg('--packageIntegritySeal');
  const workerId = getArg('--workerId') || '0';
  const isConflicting = getArg('--isConflicting') === 'true';

  if (!packageId || !packageIntegritySeal) {
    process.stderr.write('Missing required args --packageId or --packageIntegritySeal\n');
    process.exit(1);
  }

  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'mockai_uadue_test',
    user: process.env.USER || 'postgres',
    max: 2,
  });

  const adapter = new CanonicalPostgresPersistenceAdapter(pool);

  try {
    const payload = isConflicting
      ? {
          packageId,
          packageIntegritySeal,
          publicationAuthorityId: `MULTI_PROC_AUTHORITY_${workerId}`,
          targetScope: `SCOPE_${workerId}`,
          publicationPolicyConfig: { processId: process.pid, workerId },
        }
      : {
          packageId,
          packageIntegritySeal,
          publicationAuthorityId: 'MULTI_PROC_OFFICIAL_BOARD',
          targetScope: 'STUDENT_ALL_INDIA',
          publicationPolicyConfig: { allowLateSubmission: false, maxAttempts: 1 },
        };

    const receipt = await adapter.publishPackage(payload);
    process.stdout.write(
      JSON.stringify({
        workerId,
        pid: process.pid,
        success: true,
        receiptId: receipt.receiptId,
        publicationRequestFingerprint: receipt.publicationRequestFingerprint,
        publicationSequenceNumber: receipt.publicationSequenceNumber,
      }) + '\n'
    );
  } catch (err: any) {
    const isConflict = err instanceof PublicationConflictError || err.name === 'PublicationConflictError';
    process.stdout.write(
      JSON.stringify({
        workerId,
        pid: process.pid,
        success: false,
        isConflict,
        errorName: err.name || 'Error',
        errorMessage: err.message || String(err),
      }) + '\n'
    );
  } finally {
    await pool.end();
  }
}

runWorker().catch((e) => {
  process.stderr.write(`Worker fatal: ${e.message}\n`);
  process.exit(1);
});
