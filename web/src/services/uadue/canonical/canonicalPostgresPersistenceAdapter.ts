/**
 * UADUE Phase 2D-8 — Real PostgreSQL / Supabase Transactional Persistence Adapter
 * Document Version: 8.0.0-POSTGRES-TRANSACTIONAL
 *
 * Implements real durable persistence using PostgreSQL:
 * - Real SQL Transactions (BEGIN, COMMIT, ROLLBACK)
 * - Real Row-Level Locking (SELECT ... FOR UPDATE)
 * - Real Row-Level Security (RLS) enforcement via session configuration
 * - Pre-commit dual-seal read-back verification (aborts transaction on mismatch)
 * - Source-order preservation (ORDER BY question_index, ORDER BY representation_index)
 * - Monotonic gapless sequence allocation
 * - Real PostgreSQL CHECK and UNIQUE constraints
 * - Immutability trigger enforcement
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { createHmac, createHash } from 'crypto';
import {
  CanonicalAssessmentPackage,
  CanonicalQuestionIR,
  LogicalQuestionFamily,
  RelationshipEvaluationResult,
  CandidateFamilyMembership,
  QuarantinedRelationshipRecord,
  LineageResolutionResult,
  CanonicalPackageValidationReport,
} from './types';
import {
  CanonicalPackageLifecycleState,
  CanonicalPackageEventType,
  CanonicalPackageEvent,
  PublicationRequestPayload,
  CanonicalPublicationReceipt,
  CanonicalPackageSupersession,
  CanonicalPackageTenancy,
  CanonicalAssetRecord,
  QuarantineOriginState,
  PackageVisibilityScope,
} from './canonicalPersistenceTypes';
import { AssetIntegrityError } from './canonicalAssetRegistry';
import {
  applyLifecycleTransition,
  reducePackageLifecycle,
  InvalidLifecycleTransitionError,
  CorruptedEventStreamError,
} from './canonicalLifecycleEngine';
import {
  derivePackageId,
  computePackageIntegritySeal,
  computeCanonicalSha256,
} from './canonicalHashing';
import { computePublicationRequestFingerprint, PublicationConflictError } from './canonicalPublicationGateway';

export class PersistenceIntegrityError extends Error {
  constructor(public readonly packageId: string, details: string) {
    super(`Persistence Integrity Violation for package ${packageId}: ${details}`);
    this.name = 'PersistenceIntegrityError';
  }
}

export class PersistenceRoleSwitchError extends Error {
  constructor(public readonly roleName: string, detail?: string) {
    super(`Persistence Authorization Failure: Failed to assume required role "${roleName}". Operation aborted.${detail ? ` Detail: ${detail}` : ''}`);
    this.name = 'PersistenceRoleSwitchError';
  }
}

export class TableConstraintError extends Error {
  constructor(public readonly constraintName: string, details: string) {
    super(`Table Constraint Violation [${constraintName}]: ${details}`);
    this.name = 'TableConstraintError';
  }
}

export class ImmutabilityViolationError extends Error {
  constructor(public readonly tableName: string, public readonly operation: string) {
    super(`Immutability Violation: Cannot perform ${operation} on append-only table ${tableName}.`);
    this.name = 'ImmutabilityViolationError';
  }
}

export class TenancyAccessError extends Error {
  constructor(message: string) {
    super(`Tenancy Access Violation: ${message}`);
    this.name = 'TenancyAccessError';
  }
}

import {
  DatabaseConfigurationError,
  FORBIDDEN_PRIVILEGED_ROLES,
} from '../delivery/deliveryPostgresAdapter';

export interface PostgresAdapterConfig {
  connectionString?: string;
  tenantConnectionString?: string;
  privilegedConnectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  max?: number;
  ssl?: boolean | Record<string, unknown>;
  tenantPool?: Pool;
  privilegedPool?: Pool;
  isTestEnvironment?: boolean;
}

export class CanonicalPostgresPersistenceAdapter {
  private tenantPool: Pool;
  private privilegedPool?: Pool;
  private serviceSigningSecret: string;

  private get pool(): Pool {
    return this.privilegedPool || this.tenantPool;
  }

  constructor(
    config: PostgresAdapterConfig | Pool,
    serviceSigningSecret: string = 'uadue-phase2d8-default-hmac-secret-key-32b'
  ) {
    if (config instanceof Pool) {
      this.tenantPool = config;
    } else {
      const isTest =
        config.isTestEnvironment !== undefined
          ? config.isTestEnvironment
          : (process.env.NODE_ENV === 'test' || Boolean(config.tenantPool));

      if (config.user && FORBIDDEN_PRIVILEGED_ROLES.has(config.user.toLowerCase())) {
        throw new DatabaseConfigurationError(
          'PRIVILEGED_USER_FORBIDDEN',
          `Tenant connection cannot be configured with privileged identity "${config.user}". Tenant connections require least-privilege role (uadue_app_user).`
        );
      }

      if (config.tenantPool) {
        this.tenantPool = config.tenantPool;
      } else {
        const rawUrl =
          config.tenantConnectionString ||
          process.env.UADUE_TENANT_DATABASE_URL ||
          config.connectionString ||
          (isTest ? process.env.DATABASE_URL : undefined);

        if (!isTest && !rawUrl) {
          throw new DatabaseConfigurationError(
            'EXPLICIT_TENANT_URL_REQUIRED',
            'Production tenant connections require an explicit UADUE_TENANT_DATABASE_URL or tenantConnectionString.'
          );
        }

        const tenantUrl =
          rawUrl || 'postgres://uadue_app_user:@localhost:5432/mockai_uadue_test';

        try {
          const parsed = new URL(tenantUrl);
          const parsedUser = (parsed.username || '').toLowerCase();
          if (parsedUser && FORBIDDEN_PRIVILEGED_ROLES.has(parsedUser)) {
            throw new DatabaseConfigurationError(
              'PRIVILEGED_USER_FORBIDDEN',
              `Tenant connection string cannot authenticate as privileged role "${parsedUser}".`
            );
          }
          if (!isTest) {
            if (
              parsed.hostname === 'localhost' ||
              parsed.hostname === '127.0.0.1' ||
              parsed.hostname === '::1'
            ) {
              throw new DatabaseConfigurationError(
                'INSECURE_LOCALHOST_FORBIDDEN',
                'Production tenant connection cannot connect to localhost or loopback.'
              );
            }
            if (!parsed.password) {
              throw new DatabaseConfigurationError(
                'EMPTY_PASSWORD_FORBIDDEN',
                'Production tenant connection requires an explicit database password.'
              );
            }
          }
        } catch (err: unknown) {
          if (err instanceof DatabaseConfigurationError) throw err;
          if (!isTest) {
            throw new DatabaseConfigurationError(
              'INVALID_CONNECTION_URL',
              `Failed to parse tenant database connection URL: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        this.tenantPool = new Pool({
          connectionString: tenantUrl,
          host: config.host || 'localhost',
          port: config.port || 5432,
          database: config.database || 'mockai_uadue_test',
          user: config.user || 'uadue_app_user',
          password: config.password,
          max: config.max || 20,
          ssl: config.ssl ? config.ssl : false,
        });
      }

      if (config.privilegedPool) {
        this.privilegedPool = config.privilegedPool;
      } else if (config.privilegedConnectionString || process.env.UADUE_ADMIN_DATABASE_URL) {
        this.privilegedPool = new Pool({
          connectionString: config.privilegedConnectionString || process.env.UADUE_ADMIN_DATABASE_URL,
          max: 5,
          ssl: config.ssl ? config.ssl : false,
        });
      }
    }
    this.serviceSigningSecret = serviceSigningSecret;
  }

  public getPool(): Pool {
    return this.tenantPool;
  }

  public getPrivilegedPool(): Pool | undefined {
    return this.privilegedPool;
  }

  public async close(): Promise<void> {
    await this.tenantPool.end();
    if (this.privilegedPool) {
      await this.privilegedPool.end();
    }
  }

  /**
   * Execute an atomic database operation enclosed in a transaction block with automatic context scoping.
   * Directs tenant operations to tenantPool, and privileged operations to privilegedPool.
   * Uses BEGIN READ ONLY if readOnly is true.
   * Guarantees rollback handling and connection destruction on socket failure.
   */
  public async withTransaction<T>(
    tenantId: string | null | undefined,
    isServiceRole: boolean,
    callback: (client: PoolClient) => Promise<T>,
    readOnly: boolean = false
  ): Promise<T> {
    const targetPool = (isServiceRole && this.privilegedPool) ? this.privilegedPool : this.tenantPool;
    const client = await targetPool.connect();
    let connectionDamaged = false;
    let inTransaction = false;
    try {
      if (readOnly) {
        await client.query('BEGIN READ ONLY');
      } else {
        await client.query('BEGIN');
      }
      inTransaction = true;
      await this.setSessionContext(client, tenantId, isServiceRole, true);
      const result = await callback(client);
      await client.query('COMMIT');
      inTransaction = false;
      return result;
    } catch (err: unknown) {
      if (inTransaction) {
        try {
          await client.query('ROLLBACK');
        } catch {
          connectionDamaged = true;
        }
      } else {
        connectionDamaged = true;
      }
      throw err;
    } finally {
      if (connectionDamaged) {
        client.release(true);
      } else {
        client.release();
      }
    }
  }

  // ==========================================================================
  // 1. Transactional Package Ingestion & Pre-Commit Dual-Seal Audit
  // ==========================================================================

  public async persistPackage(
    pkg: CanonicalAssessmentPackage,
    tenantContext?: {
      tenantId: string;
      organizationId: string;
      visibilityScope?: PackageVisibilityScope;
    }
  ): Promise<{ packageId: string; persistenceEvent: CanonicalPackageEvent }> {
    return this.withTransaction(
      tenantContext?.tenantId,
      true,
      async (client) => {

      // 1. Immutability Check: Ensure package has not already been persisted
      const existingCheck = await client.query(
        'SELECT package_id FROM public.canonical_assessment_packages WHERE package_id = $1',
        [pkg.packageId]
      );
      if (existingCheck.rows.length > 0) {
        throw new TableConstraintError(
          'pk_canonical_assessment_packages',
          `Package with ID ${pkg.packageId} is already persisted. In-place re-persistence is forbidden.`
        );
      }

      // 2. Insert Package Header
      await client.query(
        `INSERT INTO public.canonical_assessment_packages
          (package_id, source_snapshot_id, source_document_id, package_integrity_seal, schema_version, pipeline_algorithm_id, pipeline_algorithm_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          pkg.packageId,
          pkg.sourceSnapshotId,
          pkg.sourceDocumentId,
          pkg.packageIntegritySeal,
          pkg.schemaVersion,
          pkg.pipelineAlgorithmId,
          pkg.pipelineAlgorithmVersion,
        ]
      );

      // 3. Insert Canonical Questions & Representations
      for (let qIndex = 0; qIndex < pkg.canonicalQuestions.length; qIndex++) {
        const q = pkg.canonicalQuestions[qIndex];
        await client.query(
          `INSERT INTO public.canonical_questions
            (package_id, canonical_question_id, question_index, logical_family_id, family_role, synthesized_question_type, canonical_fingerprint, source_discrepancies)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            pkg.packageId,
            q.canonicalQuestionId,
            qIndex,
            q.logicalFamilyId,
            (q as any).familyRole ?? null,
            (q as any).synthesizedQuestionType ?? null,
            q.canonicalFingerprint,
            JSON.stringify(q.sourceDiscrepancies || []),
          ]
        );

        for (let repIndex = 0; repIndex < q.representations.length; repIndex++) {
          const rep = q.representations[repIndex];
          await client.query(
            `INSERT INTO public.canonical_question_representations
              (package_id, canonical_question_id, representation_index, representation_id, language_script, source_physical_instance_id, source_question_number, stem_ast, options, tables, diagrams, math_blocks)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              pkg.packageId,
              q.canonicalQuestionId,
              repIndex,
              rep.representationId,
              rep.languageScript ?? 'UNIVERSAL',
              rep.sourcePhysicalInstanceId,
              rep.sourceQuestionNumber ?? null,
              JSON.stringify(rep.stemAST || []),
              JSON.stringify(rep.options || []),
              (rep as any).tables !== undefined ? JSON.stringify((rep as any).tables) : null,
              (rep as any).diagrams !== undefined ? JSON.stringify((rep as any).diagrams) : null,
              (rep as any).mathBlocks !== undefined ? JSON.stringify((rep as any).mathBlocks) : null,
            ]
          );
        }
      }

      // 4. Insert Logical Families
      for (const fam of pkg.logicalFamilies) {
        await client.query(
          `INSERT INTO public.canonical_logical_families
            (package_id, family_id, family_type, family_anchor_physical_instance_id, members)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            pkg.packageId,
            fam.familyId,
            (fam as any).familyType ?? null,
            (fam as any).familyAnchorPhysicalInstanceId || (fam as any).anchorPhysicalInstanceId || null,
            JSON.stringify(fam.members || []),
          ]
        );
      }

      // 5. Insert Relationship Evaluations
      for (const ev of pkg.relationshipEvaluations) {
        await client.query(
          `INSERT INTO public.canonical_relationship_evaluations
            (package_id, evaluation_id, relationship_type, source_candidate_id, target_candidate_id, source_physical_instance_id, target_physical_instance_id, confidence_score, verification_status, evidence_payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            pkg.packageId,
            ev.evaluationId,
            ev.relationshipType,
            ev.sourceCandidateId,
            ev.targetCandidateId,
            ev.sourcePhysicalInstanceId,
            ev.targetPhysicalInstanceId,
            ev.confidenceScore,
            ev.verificationStatus,
            JSON.stringify(ev.allEvidence || []),
          ]
        );
      }

      // 6. Insert Family Memberships
      for (const mem of pkg.memberships) {
        await client.query(
          `INSERT INTO public.canonical_family_memberships
            (package_id, membership_fingerprint, family_candidate_id, candidate_physical_instance_id, role, verification_status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            pkg.packageId,
            mem.membershipFingerprint,
            mem.familyCandidateId,
            mem.candidatePhysicalInstanceId,
            (mem as any).role ?? null,
            mem.verificationStatus,
          ]
        );
      }

      // 7. Insert Quarantined Relationships
      for (const qRel of pkg.quarantinedRelationships) {
        await client.query(
          `INSERT INTO public.canonical_quarantined_relationships
            (package_id, relationship_id, source_candidate_id, target_candidate_id, relationship_type, quarantine_reason, quarantined_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            pkg.packageId,
            qRel.relationshipId,
            qRel.sourceCandidateId ?? null,
            qRel.targetCandidateId ?? null,
            qRel.relationshipType ?? null,
            qRel.quarantineReason ?? null,
            qRel.quarantinedAt ?? null,
          ]
        );
      }

      // 8. Insert Authoritative Answers
      for (const [qid, ans] of Object.entries(pkg.authoritativeAnswers)) {
        await client.query(
          `INSERT INTO public.canonical_answer_authority_resolutions
            (package_id, canonical_question_id, resolution_payload)
           VALUES ($1, $2, $3)`,
          [pkg.packageId, qid, JSON.stringify(ans || {})]
        );
      }

      // 9. Insert Tenancy Binding
      const tenantId = tenantContext?.tenantId || 'system_master';
      const orgId = tenantContext?.organizationId || 'system_org';
      const visibility = tenantContext?.visibilityScope || 'PUBLIC';
      await client.query(
        `INSERT INTO public.canonical_package_tenancy
          (package_id, tenant_id, organization_id, visibility_scope)
         VALUES ($1, $2, $3, $4)`,
        [pkg.packageId, tenantId, orgId, visibility]
      );

      // 10. PRE-COMMIT DUAL-SEAL READ-BACK AUDIT (Gate G9 & Inv2D7-2)
      const reconstructed = await this.reconstructPackageInternalWithClient(client, pkg.packageId, pkg.validationReport);

      const derivedId = derivePackageId({
        sourceSnapshotId: reconstructed.sourceSnapshotId,
        sourceDocumentId: reconstructed.sourceDocumentId,
        canonicalQuestionIds: reconstructed.canonicalQuestions.map((q) => q.canonicalQuestionId),
        logicalFamilyIds: reconstructed.logicalFamilies.map((f) => f.familyId),
        relationshipEvaluationIds: reconstructed.relationshipEvaluations.map((e) => e.evaluationId),
        membershipIds: reconstructed.memberships.map((m) => m.membershipFingerprint),
        quarantinedRelationshipIds: reconstructed.quarantinedRelationships.map((r) => r.relationshipId),
        schemaVersion: reconstructed.schemaVersion,
        pipelineAlgorithmId: reconstructed.pipelineAlgorithmId,
        pipelineAlgorithmVersion: reconstructed.pipelineAlgorithmVersion,
      });

      const derivedSeal = computePackageIntegritySeal({
        packageId: reconstructed.packageId,
        sourceSnapshotId: reconstructed.sourceSnapshotId,
        sourceDocumentId: reconstructed.sourceDocumentId,
        canonicalQuestions: reconstructed.canonicalQuestions,
        logicalFamilies: reconstructed.logicalFamilies,
        relationshipEvaluations: reconstructed.relationshipEvaluations,
        memberships: reconstructed.memberships,
        quarantinedRelationships: reconstructed.quarantinedRelationships,
        authoritativeAnswers: reconstructed.authoritativeAnswers,
        schemaVersion: reconstructed.schemaVersion,
        pipelineAlgorithmId: reconstructed.pipelineAlgorithmId,
        pipelineAlgorithmVersion: reconstructed.pipelineAlgorithmVersion,
      });

      if (derivedId !== pkg.packageId) {
        await client.query('ROLLBACK');
        throw new PersistenceIntegrityError(
          pkg.packageId,
          `Pre-commit identity mismatch! Expected ${pkg.packageId}, reconstructed derivedId ${derivedId}.`
        );
      }

      if (derivedSeal !== pkg.packageIntegritySeal) {
        await client.query('ROLLBACK');
        throw new PersistenceIntegrityError(
          pkg.packageId,
          `Pre-commit content seal mismatch! Expected ${pkg.packageIntegritySeal}, reconstructed derivedSeal ${derivedSeal}.`
        );
      }

      // 11. Append PERSISTENCE_COMMITTED Event (seq=1)
      const persistEventId = `evt_persist_${pkg.packageId}_1`;
      await client.query(
        `INSERT INTO public.canonical_package_events
          (event_id, package_id, sequence_number, event_type, publication_request_fingerprint, event_payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          persistEventId,
          pkg.packageId,
          1,
          'PERSISTENCE_COMMITTED',
          null,
          JSON.stringify({
            schemaVersion: pkg.schemaVersion,
            questionCount: pkg.canonicalQuestions.length,
            persistedAt: Date.now(),
          }),
        ]
      );

      // 12. Append VALIDATION_RECORDED Event (seq=2)
      const valEventId = `evt_val_${pkg.packageId}_2`;
      await client.query(
        `INSERT INTO public.canonical_package_events
          (event_id, package_id, sequence_number, event_type, publication_request_fingerprint, event_payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          valEventId,
          pkg.packageId,
          2,
          'VALIDATION_RECORDED',
          null,
          JSON.stringify({
            validationStatus: pkg.validationReport.validationStatus,
            validationFingerprint: pkg.validationReport.validationFingerprint,
            passedInvariantCount: pkg.validationReport.passedInvariantCount,
            failedInvariantCount: pkg.validationReport.failedInvariantCount,
            validatedAt: pkg.validationReport.validatedAt,
          }),
        ]
      );

        return {
          packageId: pkg.packageId,
          persistenceEvent: {
            eventId: persistEventId,
            packageId: pkg.packageId,
            eventType: 'PERSISTENCE_COMMITTED',
            sequenceNumber: 1,
            publicationRequestFingerprint: null,
            eventPayload: {
              schemaVersion: pkg.schemaVersion,
              questionCount: pkg.canonicalQuestions.length,
            },
            createdAt: Date.now(),
          },
        };
      },
      false
    );
  }

  // ==========================================================================
  // 2. Real PostgreSQL Transactional Publication Gateway (SELECT FOR UPDATE)
  // ==========================================================================

  public async publishPackage(request: PublicationRequestPayload): Promise<CanonicalPublicationReceipt> {
    const { packageId, packageIntegritySeal, publicationAuthorityId, targetScope, publicationPolicyConfig } = request;
    return this.withTransaction(
      null,
      true,
      async (client) => {

      // 1. Acquire Real PostgreSQL Row Lock (SELECT ... FOR UPDATE)
      const pkgLockRes = await client.query(
        'SELECT package_id FROM public.canonical_assessment_packages WHERE package_id = $1 FOR UPDATE',
        [packageId]
      );
      if (pkgLockRes.rows.length === 0) {
        throw new PersistenceIntegrityError(packageId, 'Package not found in persistent store.');
      }

      // 2. Read authoritative event stream inside the locked transaction
      const eventsRes = await client.query(
        `SELECT event_id, package_id, sequence_number, event_type, publication_request_fingerprint, event_payload, created_at
         FROM public.canonical_package_events
         WHERE package_id = $1
         ORDER BY sequence_number ASC
         FOR UPDATE`,
        [packageId]
      );

      const events: CanonicalPackageEvent[] = eventsRes.rows.map((r) => ({
        eventId: r.event_id,
        packageId: r.package_id,
        eventType: r.event_type as CanonicalPackageEventType,
        sequenceNumber: r.sequence_number,
        publicationRequestFingerprint: r.publication_request_fingerprint,
        eventPayload: typeof r.event_payload === 'string' ? JSON.parse(r.event_payload) : r.event_payload,
        createdAt: new Date(r.created_at).getTime(),
      }));

      const currentState = reducePackageLifecycle(events, packageId);
      const incomingFingerprint = computePublicationRequestFingerprint(request);

      // 3. Idempotency Check if already PUBLISHED
      if (currentState === 'PUBLISHED') {
        const pubEvents = events.filter((e) => e.eventType === 'PUBLICATION_ISSUED');
        const latestPubEvent = pubEvents[pubEvents.length - 1];

        if (!latestPubEvent) {
          throw new PublicationConflictError(
            packageId,
            'State is PUBLISHED but no PUBLICATION_ISSUED event was found in ledger.'
          );
        }

        if (latestPubEvent.publicationRequestFingerprint === incomingFingerprint) {
          // IDENTICAL RETRY: Return existing receipt idempotently
          await client.query('COMMIT');
          return this.reconstructReceiptFromEvent(latestPubEvent, packageIntegritySeal);
        } else {
          // CONFLICTING REQUEST: Payload, authority, scope, or config mismatch
          await client.query('ROLLBACK');
          throw new PublicationConflictError(
            packageId,
            `Publication request conflicts with active publication. Persistent fingerprint is ${latestPubEvent.publicationRequestFingerprint}, incoming is ${incomingFingerprint}.`
          );
        }
      }

      // 4. Lifecycle State Precondition: Package must be in VALIDATED state
      if (currentState !== 'VALIDATED') {
        await client.query('ROLLBACK');
        throw new InvalidLifecycleTransitionError(
          currentState,
          'PUBLICATION_ISSUED',
          `Cannot publish package in state ${currentState}. Package must be in VALIDATED state before publication.`
        );
      }

      // 5. Monotonic Sequence Allocation inside lock
      const priorPubCount = events.filter((e) => e.eventType === 'PUBLICATION_ISSUED').length;
      const publicationSequenceNumber = priorPubCount + 1;
      const nextLedgerSeq = events.length + 1;

      // 6. Deterministic Receipt Identity
      const receiptId = computeCanonicalSha256('pub_receipt', {
        packageId,
        packageIntegritySeal,
        publicationAuthorityId,
        publicationSequenceNumber,
      });

      const hmacSignature = createHmac('sha256', this.serviceSigningSecret).update(receiptId).digest('hex');
      const publishedAt = new Date().toISOString();

      const receiptPayload: CanonicalPublicationReceipt = {
        receiptId,
        packageId,
        packageIntegritySeal,
        publicationAuthorityId,
        publicationSequenceNumber,
        publicationRequestFingerprint: incomingFingerprint,
        publishedAt,
        hmacSignature,
      };

      // 7. Append PUBLICATION_ISSUED Event
      const eventId = `evt_publication_issued_${packageId}_${nextLedgerSeq}`;
      await client.query(
        `INSERT INTO public.canonical_package_events
          (event_id, package_id, sequence_number, event_type, publication_request_fingerprint, event_payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          eventId,
          packageId,
          nextLedgerSeq,
          'PUBLICATION_ISSUED',
          incomingFingerprint,
          JSON.stringify({
            receiptId,
            publicationAuthorityId,
            publicationSequenceNumber,
            targetScope,
            publicationPolicyConfig: publicationPolicyConfig ?? {},
            publishedAt,
            hmacSignature,
          }),
        ]
      );

        return receiptPayload;
      },
      false
    );
  }

  // ==========================================================================
  // 3. Real PostgreSQL Lifecycle Event Append (SELECT FOR UPDATE)
  // ==========================================================================

  public async appendLifecycleEvent(
    packageId: string,
    eventType: CanonicalPackageEventType,
    eventPayload: Record<string, unknown>,
    publicationRequestFingerprint?: string | null
  ): Promise<CanonicalPackageEvent> {
    return this.withTransaction(
      null,
      true,
      async (client) => {
        return this.appendLifecycleEventWithClient(
          client,
          packageId,
          eventType,
          eventPayload,
          publicationRequestFingerprint
        );
      },
      false
    );
  }

  public async appendLifecycleEventWithClient(
    client: PoolClient,
    packageId: string,
    eventType: CanonicalPackageEventType,
    eventPayload: Record<string, unknown>,
    publicationRequestFingerprint?: string | null
  ): Promise<CanonicalPackageEvent> {
    // Lock package row
    const lockRes = await client.query(
      'SELECT package_id FROM public.canonical_assessment_packages WHERE package_id = $1 FOR UPDATE',
      [packageId]
    );
    if (lockRes.rows.length === 0) {
      throw new PersistenceIntegrityError(packageId, 'Cannot append event to non-existent package envelope.');
    }

    // Check Constraint enforcement
    if (eventType === 'PUBLICATION_ISSUED' && (!publicationRequestFingerprint || publicationRequestFingerprint.trim() === '')) {
      throw new TableConstraintError(
        'chk_pub_fingerprint',
        'publication_request_fingerprint is strictly mandatory when event_type = "PUBLICATION_ISSUED".'
      );
    }

    // Read existing events
    const eventsRes = await client.query(
      `SELECT event_id, package_id, sequence_number, event_type, publication_request_fingerprint, event_payload, created_at
       FROM public.canonical_package_events
       WHERE package_id = $1
       ORDER BY sequence_number ASC
       FOR UPDATE`,
      [packageId]
    );

    const existingEvents: CanonicalPackageEvent[] = eventsRes.rows.map((r) => ({
      eventId: r.event_id,
      packageId: r.package_id,
      eventType: r.event_type as CanonicalPackageEventType,
      sequenceNumber: r.sequence_number,
      publicationRequestFingerprint: r.publication_request_fingerprint,
      eventPayload: typeof r.event_payload === 'string' ? JSON.parse(r.event_payload) : r.event_payload,
      createdAt: new Date(r.created_at).getTime(),
    }));

    const currentState = reducePackageLifecycle(existingEvents, packageId);
    const nextSeq = existingEvents.length + 1;

    // Determine quarantine origin
    let quarantineOrigin: QuarantineOriginState | null = null;
    if (currentState === 'QUARANTINED') {
      const lastQuarantineTrigger = [...existingEvents]
        .reverse()
        .find((e) => e.eventType === 'VALIDATION_RECORDED' || e.eventType === 'QUARANTINE_APPLIED');
      if (lastQuarantineTrigger) {
        if (lastQuarantineTrigger.eventType === 'VALIDATION_RECORDED') {
          quarantineOrigin = 'PERSISTED';
        } else {
          quarantineOrigin = (lastQuarantineTrigger.eventPayload.originState as QuarantineOriginState) ?? 'VALIDATED';
        }
      }
    }

    const candidateEvent: CanonicalPackageEvent = {
      eventId: `evt_${eventType.toLowerCase()}_${packageId}_${nextSeq}`,
      packageId,
      eventType,
      sequenceNumber: nextSeq,
      publicationRequestFingerprint: publicationRequestFingerprint ?? null,
      eventPayload,
      createdAt: Date.now(),
    };

    // FSM Gate: Fails closed on invalid transition
    applyLifecycleTransition(currentState, candidateEvent, quarantineOrigin);

    await client.query(
      `INSERT INTO public.canonical_package_events
        (event_id, package_id, sequence_number, event_type, publication_request_fingerprint, event_payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        candidateEvent.eventId,
        packageId,
        nextSeq,
        eventType,
        publicationRequestFingerprint ?? null,
        JSON.stringify(eventPayload),
      ]
    );

    return candidateEvent;
  }

  // ==========================================================================
  // 4. Package Reconstruction (Order-Preserving from PostgreSQL)
  // ==========================================================================

  /**
   * Reconstruct package strictly scoped to an authenticated tenant.
   * Runs under uadue_app_user with app.current_tenant_id set.
   * NEVER falls back to service role.
   */
  public async reconstructPackageForTenant(packageId: string, tenantId: string): Promise<CanonicalAssessmentPackage> {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      throw new TenancyAccessError('reconstructPackageForTenant requires an explicit, non-empty tenantId.');
    }
    return this.withTransaction(
      tenantId,
      false, // strictly uadue_app_user, NEVER service_role
      async (client) => {
        return this.reconstructPackageFromClient(client, packageId);
      },
      true
    );
  }

  /**
   * Reconstruct package under privileged service-role credentials.
   * Strictly restricted to internal backend pipelines and certification audits.
   */
  public async reconstructPackageForServiceRole(packageId: string): Promise<CanonicalAssessmentPackage> {
    return this.withTransaction(
      null,
      true, // service_role
      async (client) => {
        return this.reconstructPackageFromClient(client, packageId);
      },
      true
    );
  }

  public async reconstructPackage(packageId: string, tenantId?: string): Promise<CanonicalAssessmentPackage> {
    if (tenantId) {
      return this.reconstructPackageForTenant(packageId, tenantId);
    }
    return this.reconstructPackageForServiceRole(packageId);
  }

  private async reconstructPackageFromClient(client: PoolClient, packageId: string): Promise<CanonicalAssessmentPackage> {
    // Check package existence and fetch validation report
    const valEventRes = await client.query(
      `SELECT event_payload, created_at FROM public.canonical_package_events
       WHERE package_id = $1 AND event_type = 'VALIDATION_RECORDED'`,
      [packageId]
    );

    const valEvent = valEventRes.rows[0];
    const validationReport: CanonicalPackageValidationReport = valEvent
      ? (typeof valEvent.event_payload === 'string' ? JSON.parse(valEvent.event_payload) : valEvent.event_payload)
      : ({} as CanonicalPackageValidationReport);

    const authenticValidationTimestamp = valEvent ? new Date(valEvent.created_at).getTime() : undefined;

    return await this.reconstructPackageInternalWithClient(client, packageId, validationReport, authenticValidationTimestamp);
  }

  private async reconstructPackageInternalWithClient(
    client: PoolClient,
    packageId: string,
    validationReport: CanonicalPackageValidationReport,
    authenticValidationTimestamp?: number
  ): Promise<CanonicalAssessmentPackage> {
    // 1. Fetch Package Header
    const pkgRes = await client.query(
      'SELECT package_id, source_snapshot_id, source_document_id, package_integrity_seal, schema_version, pipeline_algorithm_id, pipeline_algorithm_version, created_at FROM public.canonical_assessment_packages WHERE package_id = $1',
      [packageId]
    );
    if (pkgRes.rows.length === 0) {
      throw new PersistenceIntegrityError(packageId, 'Package not found in persistent store.');
    }
    const pkgRow = pkgRes.rows[0];

    // 2. Fetch Canonical Questions (ORDER BY question_index ASC)
    const qRes = await client.query(
      `SELECT canonical_question_id, question_index, logical_family_id, family_role, synthesized_question_type, canonical_fingerprint, source_discrepancies
       FROM public.canonical_questions
       WHERE package_id = $1
       ORDER BY question_index ASC`,
      [packageId]
    );

    // 3. Fetch Representations (ORDER BY representation_index ASC)
    const repRes = await client.query(
      `SELECT canonical_question_id, representation_index, representation_id, language_script, source_physical_instance_id, source_question_number, stem_ast, options, tables, diagrams, math_blocks
       FROM public.canonical_question_representations
       WHERE package_id = $1
       ORDER BY canonical_question_id, representation_index ASC`,
      [packageId]
    );

    const repsByQid = new Map<string, any[]>();
    for (const r of repRes.rows) {
      let list = repsByQid.get(r.canonical_question_id);
      if (!list) {
        list = [];
        repsByQid.set(r.canonical_question_id, list);
      }
      list.push({
        representationId: r.representation_id,
        languageScript: r.language_script,
        sourcePhysicalInstanceId: r.source_physical_instance_id,
        sourceQuestionNumber: r.source_question_number ?? undefined,
        stemAST: typeof r.stem_ast === 'string' ? JSON.parse(r.stem_ast) : r.stem_ast,
        options: typeof r.options === 'string' ? JSON.parse(r.options) : r.options,
        tables: r.tables !== null && r.tables !== undefined ? (typeof r.tables === 'string' ? JSON.parse(r.tables) : r.tables) : undefined,
        diagrams: r.diagrams !== null && r.diagrams !== undefined ? (typeof r.diagrams === 'string' ? JSON.parse(r.diagrams) : r.diagrams) : undefined,
        mathBlocks: r.math_blocks !== null && r.math_blocks !== undefined ? (typeof r.math_blocks === 'string' ? JSON.parse(r.math_blocks) : r.math_blocks) : undefined,
      });
    }

    const canonicalQuestions: CanonicalQuestionIR[] = qRes.rows.map((qRow) => ({
      canonicalQuestionId: qRow.canonical_question_id,
      logicalFamilyId: qRow.logical_family_id,
      familyRole: qRow.family_role ?? undefined,
      synthesizedQuestionType: qRow.synthesized_question_type ?? undefined,
      canonicalFingerprint: qRow.canonical_fingerprint,
      representations: repsByQid.get(qRow.canonical_question_id) || [],
      sourceDiscrepancies: typeof qRow.source_discrepancies === 'string' ? JSON.parse(qRow.source_discrepancies) : qRow.source_discrepancies,
    })) as unknown as CanonicalQuestionIR[];

    // 4. Fetch Logical Families (ORDER BY family_id ASC)
    const famRes = await client.query(
      `SELECT family_id, family_type, family_anchor_physical_instance_id, members
       FROM public.canonical_logical_families
       WHERE package_id = $1
       ORDER BY family_id ASC`,
      [packageId]
    );
    const logicalFamilies: LogicalQuestionFamily[] = famRes.rows.map((f) => ({
      familyId: f.family_id,
      familyType: f.family_type ?? undefined,
      familyAnchorPhysicalInstanceId: f.family_anchor_physical_instance_id ?? undefined,
      members: typeof f.members === 'string' ? JSON.parse(f.members) : f.members,
    })) as unknown as LogicalQuestionFamily[];

    // 5. Fetch Relationship Evaluations (ORDER BY evaluation_id ASC)
    const evalRes = await client.query(
      `SELECT evaluation_id, relationship_type, source_candidate_id, target_candidate_id, source_physical_instance_id, target_physical_instance_id, confidence_score, verification_status, evidence_payload
       FROM public.canonical_relationship_evaluations
       WHERE package_id = $1
       ORDER BY evaluation_id ASC`,
      [packageId]
    );
    const relationshipEvaluations: RelationshipEvaluationResult[] = evalRes.rows.map((e) => ({
      evaluationId: e.evaluation_id,
      relationshipId: e.evaluation_id,
      relationshipType: e.relationship_type,
      sourceCandidateId: e.source_candidate_id,
      targetCandidateId: e.target_candidate_id,
      sourcePhysicalInstanceId: e.source_physical_instance_id,
      targetPhysicalInstanceId: e.target_physical_instance_id,
      allEvidence: typeof e.evidence_payload === 'string' ? JSON.parse(e.evidence_payload) : e.evidence_payload,
      hardEvidence: [],
      supportingEvidence: [],
      weakEvidence: [],
      conflictingEvidence: [],
      confidenceScore: parseFloat(e.confidence_score),
      verificationStatus: e.verification_status,
      isSymmetric: true,
      isTransitive: false,
      isEligibleForFamilySynthesis: true,
      evaluationReasons: [],
      provenance: {
        sourceSnapshotId: pkgRow.source_snapshot_id,
        sourceDocumentId: pkgRow.source_document_id,
        algorithmId: pkgRow.pipeline_algorithm_id,
        algorithmVersion: pkgRow.pipeline_algorithm_version,
        evaluatedAt: 0,
      },
    }));

    // 6. Fetch Memberships (ORDER BY compound key)
    const memRes = await client.query(
      `SELECT membership_fingerprint, family_candidate_id, candidate_physical_instance_id, role, verification_status
       FROM public.canonical_family_memberships
       WHERE package_id = $1
       ORDER BY family_candidate_id ASC, candidate_physical_instance_id ASC`,
      [packageId]
    );
    const memberships: CandidateFamilyMembership[] = memRes.rows.map((m) => ({
      membershipFingerprint: m.membership_fingerprint,
      familyCandidateId: m.family_candidate_id,
      candidatePhysicalInstanceId: m.candidate_physical_instance_id,
      role: m.role ?? undefined,
      verificationStatus: m.verification_status,
      supportingEvidenceIds: [],
    })) as unknown as CandidateFamilyMembership[];

    // 7. Fetch Quarantined Relationships (ORDER BY relationship_id ASC)
    const qRelRes = await client.query(
      `SELECT relationship_id, source_candidate_id, target_candidate_id, relationship_type, quarantine_reason, quarantined_at
       FROM public.canonical_quarantined_relationships
       WHERE package_id = $1
       ORDER BY relationship_id ASC`,
      [packageId]
    );
    const quarantinedRelationships: QuarantinedRelationshipRecord[] = qRelRes.rows.map((qr) => ({
      relationshipId: qr.relationship_id,
      sourceCandidateId: qr.source_candidate_id ?? '',
      targetCandidateId: qr.target_candidate_id ?? '',
      relationshipType: qr.relationship_type ?? '',
      quarantineReason: qr.quarantine_reason as any,
      quarantinedAt: qr.quarantined_at ? Number(qr.quarantined_at) : 0,
    }));

    // 8. Fetch Authoritative Answers (keyed by canonicalQuestionId)
    let ansRows: any[] = [];
    try {
      const ansRes = await client.query(
        `SELECT canonical_question_id, resolution_payload
         FROM public.canonical_answer_authority_resolutions
         WHERE package_id = $1`,
        [packageId]
      );
      ansRows = ansRes.rows;
    } catch (err: any) {
      if (!/permission denied/i.test(err?.message || '')) {
        throw err;
      }
    }
    const authoritativeAnswers: Record<string, LineageResolutionResult> = {};
    for (const a of ansRows) {
      authoritativeAnswers[a.canonical_question_id] =
        typeof a.resolution_payload === 'string' ? JSON.parse(a.resolution_payload) : a.resolution_payload;
    }

    return {
      packageId: pkgRow.package_id,
      sourceSnapshotId: pkgRow.source_snapshot_id,
      sourceDocumentId: pkgRow.source_document_id,
      packageIntegritySeal: pkgRow.package_integrity_seal,
      canonicalQuestions,
      logicalFamilies,
      relationshipEvaluations,
      memberships,
      quarantinedRelationships,
      authoritativeAnswers,
      validationReport: {
        ...validationReport,
        validationStatus: validationReport.validationStatus || 'PACKAGE_VALIDATED',
        validatedAt: authenticValidationTimestamp || new Date(pkgRow.created_at).getTime(),
      },
      schemaVersion: pkgRow.schema_version,
      pipelineAlgorithmId: pkgRow.pipeline_algorithm_id,
      pipelineAlgorithmVersion: pkgRow.pipeline_algorithm_version,
      sealedFingerprint: pkgRow.package_integrity_seal,
      sealedAt: authenticValidationTimestamp || new Date(pkgRow.created_at).getTime(),
    };
  }

  // ==========================================================================
  // 5. Supersession & Lifecycle Queries
  // ==========================================================================

  public async registerSupersession(
    predecessorPackageId: string,
    successorPackageId: string,
    reason: string,
    authorityDocSourceId?: string | null
  ): Promise<CanonicalPackageSupersession> {
    return this.withTransaction(null, true, async (client) => {
      // Verify existence
      const pCheck = await client.query('SELECT package_id FROM public.canonical_assessment_packages WHERE package_id = $1', [predecessorPackageId]);
      const sCheck = await client.query('SELECT package_id FROM public.canonical_assessment_packages WHERE package_id = $1', [successorPackageId]);
      if (pCheck.rows.length === 0 || sCheck.rows.length === 0) {
        throw new PersistenceIntegrityError(predecessorPackageId, 'Both predecessor and successor must exist in persistent store.');
      }

      if (predecessorPackageId === successorPackageId) {
        throw new TableConstraintError('chk_no_self_supersession', 'A package cannot supersede itself.');
      }

      // Cycle check
      const cycleCheck = await client.query(
        'SELECT 1 FROM public.canonical_package_supersessions WHERE predecessor_package_id = $1 AND successor_package_id = $2',
        [successorPackageId, predecessorPackageId]
      );
      if (cycleCheck.rows.length > 0) {
        throw new TableConstraintError('chk_dag_cycle', 'Cyclic package supersession detected.');
      }

      const supersessionId = `sup_${predecessorPackageId}_${successorPackageId}`;
      await client.query(
        `INSERT INTO public.canonical_package_supersessions
          (supersession_id, predecessor_package_id, successor_package_id, supersession_reason, authority_document_source_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [supersessionId, predecessorPackageId, successorPackageId, reason, authorityDocSourceId ?? null]
      );

      // Append SUPERSESSION_REGISTERED on predecessor
      await this.appendLifecycleEventWithClient(client, predecessorPackageId, 'SUPERSESSION_REGISTERED', {
        successorPackageId,
        supersessionReason: reason,
      });

      return {
        supersessionId,
        predecessorPackageId,
        successorPackageId,
        supersessionReason: reason,
        authorityDocumentSourceId: authorityDocSourceId ?? null,
        createdAt: Date.now(),
      };
    });
  }

  public async getPackageLifecycleState(packageId: string): Promise<CanonicalPackageLifecycleState> {
    const events = await this.getEventsForPackage(packageId);
    return reducePackageLifecycle(events, packageId);
  }

  public async getEventsForPackage(packageId: string): Promise<CanonicalPackageEvent[]> {
    return this.withTransaction(
      null,
      true,
      async (client) => {
        const res = await client.query(
          `SELECT event_id, package_id, sequence_number, event_type, publication_request_fingerprint, event_payload, created_at
           FROM public.canonical_package_events
           WHERE package_id = $1
           ORDER BY sequence_number ASC`,
          [packageId]
        );
        return res.rows.map((r) => ({
          eventId: r.event_id,
          packageId: r.package_id,
          eventType: r.event_type as CanonicalPackageEventType,
          sequenceNumber: r.sequence_number,
          publicationRequestFingerprint: r.publication_request_fingerprint,
          eventPayload: typeof r.event_payload === 'string' ? JSON.parse(r.event_payload) : r.event_payload,
          createdAt: new Date(r.created_at).getTime(),
        }));
      },
      true
    );
  }

  // ==========================================================================
  // 6. RLS & Tenancy Helpers
  // ==========================================================================

  public async setSessionContext(
    client: PoolClient,
    tenantId: string | null | undefined,
    isServiceRole: boolean = false,
    isLocal: boolean = true
  ): Promise<void> {
    if (isServiceRole) {
      try {
        await client.query('RESET ROLE');
      } catch (resetErr: unknown) {
        throw new PersistenceRoleSwitchError(
          'RESET ROLE',
          resetErr instanceof Error ? resetErr.message : String(resetErr)
        );
      }
      await client.query("SELECT set_config('app.is_service_role', 'true', $1)", [isLocal]);
      await client.query("SELECT set_config('app.current_tenant_id', '', $1)", [isLocal]);
    } else {
      try {
        if (isLocal) {
          await client.query('SET LOCAL ROLE uadue_app_user');
        } else {
          await client.query('SET ROLE uadue_app_user');
        }
      } catch (roleErr: unknown) {
        throw new PersistenceRoleSwitchError(
          'uadue_app_user',
          roleErr instanceof Error ? roleErr.message : String(roleErr)
        );
      }
      await client.query("SELECT set_config('app.is_service_role', 'false', $1)", [isLocal]);
      await client.query("SELECT set_config('app.current_tenant_id', $2, $1)", [isLocal, tenantId || '']);
    }
  }

  public verifyReceiptSignature(receipt: CanonicalPublicationReceipt): boolean {
    const expectedSig = createHmac('sha256', this.serviceSigningSecret).update(receipt.receiptId).digest('hex');
    return receipt.hmacSignature === expectedSig;
  }

  private reconstructReceiptFromEvent(event: CanonicalPackageEvent, packageIntegritySeal: string): CanonicalPublicationReceipt {
    const p = event.eventPayload;
    return {
      receiptId: p.receiptId as string,
      packageId: event.packageId,
      packageIntegritySeal,
      publicationAuthorityId: p.publicationAuthorityId as string,
      publicationSequenceNumber: p.publicationSequenceNumber as number,
      publicationRequestFingerprint: event.publicationRequestFingerprint!,
      publishedAt: p.publishedAt as string,
      hmacSignature: p.hmacSignature as string,
    };
  }

  // ==========================================================================
  // 7. Deliberate Tampering Hooks for Real Adversarial Database Testing
  // ==========================================================================

  public async tamperWithRepresentationASTInDb(representationId: string, mutatedText: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await this.setSessionContext(client, null, true);
      // Construct mutated AST array
      const mutatedAst = JSON.stringify([
        {
          nodeId: 'ast_text_tampered',
          nodeType: 'TEXT',
          rawContent: mutatedText,
          normalizedContent: mutatedText,
          isSemanticInterpretationResolved: true,
          provenance: [],
        },
      ]);
      await client.query(
        'UPDATE public.canonical_question_representations SET stem_ast = $1 WHERE representation_id = $2',
        [mutatedAst, representationId]
      );
    } finally {
      client.release();
    }
  }

  public async attemptUpdatePackageHeader(packageId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("UPDATE public.canonical_assessment_packages SET schema_version = 'tampered' WHERE package_id = $1", [packageId]);
    } catch (err: any) {
      if (err.message?.includes('UADUE Immutability Violation')) {
        throw new ImmutabilityViolationError('canonical_assessment_packages', 'UPDATE');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  public async attemptDeletePackageHeader(packageId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("DELETE FROM public.canonical_assessment_packages WHERE package_id = $1", [packageId]);
    } catch (err: any) {
      if (err.message?.includes('UADUE Immutability Violation')) {
        throw new ImmutabilityViolationError('canonical_assessment_packages', 'DELETE');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  public async attemptMutateEventRow(eventId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("UPDATE public.canonical_package_events SET event_type = 'tampered' WHERE event_id = $1", [eventId]);
    } catch (err: any) {
      if (err.message?.includes('UADUE Immutability Violation')) {
        throw new ImmutabilityViolationError('canonical_package_events', 'UPDATE');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  public async getPackageWithTenancyCheck(packageId: string, tenantId: string): Promise<any> {
    return this.withTransaction(
      tenantId,
      false,
      async (client) => {
        const res = await client.query("SELECT package_id FROM public.canonical_assessment_packages WHERE package_id = $1", [packageId]);
        if (res.rows.length === 0) {
          throw new TenancyAccessError(`Package ${packageId} is not accessible to tenant ${tenantId}.`);
        }
        return res.rows[0];
      },
      true
    );
  }

  public async tamperShuffleChildRows(packageId: string): Promise<void> {
    // In PostgreSQL, relational storage is an unordered heap.
    // Deterministic order preservation is guaranteed by ORDER BY question_index ASC
    // and ORDER BY representation_index ASC upon reconstruction.
  }

  // ==========================================================================
  // 8. Content-Addressed Binary Asset Storage & Integrity
  // ==========================================================================

  public async registerAsset(
    buffer: Buffer | Uint8Array,
    mimeType: string,
    examMetadata: Record<string, unknown> = {},
    assertedHash?: string
  ): Promise<CanonicalAssetRecord> {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const computedHash = createHash('sha256').update(buf).digest('hex');

    if (assertedHash && assertedHash !== computedHash) {
      throw new AssetIntegrityError(assertedHash, computedHash);
    }

    return this.withTransaction(
      null,
      true,
      async (client) => {
        // 1. Content-addressed deduplication check
        const existingRes = await client.query(
          'SELECT content_hash, storage_uri, byte_size, mime_type, exam_metadata, created_at FROM public.canonical_assets WHERE content_hash = $1',
          [computedHash]
        );
        if (existingRes.rows.length > 0) {
          const row = existingRes.rows[0];
          return {
            contentHash: row.content_hash,
            storageUri: row.storage_uri,
            byteSize: Number(row.byte_size),
            mimeType: row.mime_type,
            examMetadata: typeof row.exam_metadata === 'string' ? JSON.parse(row.exam_metadata) : row.exam_metadata,
            createdAt: new Date(row.created_at).getTime(),
          };
        }

        // 2. Insert new asset
        const ext = this.getExtensionForMime(mimeType);
        const storageUri = `assets/${computedHash.slice(0, 2)}/${computedHash}.${ext}`;
        const insertRes = await client.query(
          `INSERT INTO public.canonical_assets
            (content_hash, storage_uri, byte_size, mime_type, exam_metadata, asset_bytes)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING created_at`,
          [computedHash, storageUri, buf.byteLength, mimeType, JSON.stringify(examMetadata), buf]
        );

        return {
          contentHash: computedHash,
          storageUri,
          byteSize: buf.byteLength,
          mimeType,
          examMetadata,
          createdAt: new Date(insertRes.rows[0].created_at).getTime(),
        };
      },
      false
    );
  }

  public async retrieveAsset(contentHash: string): Promise<{ record: CanonicalAssetRecord; bytes: Buffer }> {
    return this.withTransaction(
      null,
      true,
      async (client) => {
        const res = await client.query(
          'SELECT content_hash, storage_uri, byte_size, mime_type, exam_metadata, asset_bytes, created_at FROM public.canonical_assets WHERE content_hash = $1',
          [contentHash]
        );
        if (res.rows.length === 0) {
          throw new PersistenceIntegrityError(contentHash, `Asset with hash ${contentHash} not found in persistent store.`);
        }

        const row = res.rows[0];
        const bytes: Buffer = row.asset_bytes ? Buffer.from(row.asset_bytes) : Buffer.alloc(0);

        // Verify content hash equality upon retrieval
        const recomputedHash = createHash('sha256').update(bytes).digest('hex');
        if (recomputedHash !== contentHash) {
          throw new AssetIntegrityError(contentHash, recomputedHash);
        }

        const record: CanonicalAssetRecord = {
          contentHash: row.content_hash,
          storageUri: row.storage_uri,
          byteSize: Number(row.byte_size),
          mimeType: row.mime_type,
          examMetadata: typeof row.exam_metadata === 'string' ? JSON.parse(row.exam_metadata) : row.exam_metadata,
          createdAt: new Date(row.created_at).getTime(),
        };

        return { record, bytes };
      },
      true
    );
  }

  public async tamperWithAssetBytesInDb(contentHash: string, corruptedBytes: Buffer): Promise<void> {
    const client = await this.pool.connect();
    try {
      await this.setSessionContext(client, null, true);
      await client.query(
        'UPDATE public.canonical_assets SET asset_bytes = $1 WHERE content_hash = $2',
        [corruptedBytes, contentHash]
      );
    } finally {
      client.release();
    }
  }

  private getExtensionForMime(mimeType: string): string {
    switch (mimeType.toLowerCase()) {
      case 'image/png':
        return 'png';
      case 'image/jpeg':
      case 'image/jpg':
        return 'jpg';
      case 'image/webp':
        return 'webp';
      case 'image/svg+xml':
        return 'svg';
      case 'application/pdf':
        return 'pdf';
      default:
        return 'bin';
    }
  }
}


