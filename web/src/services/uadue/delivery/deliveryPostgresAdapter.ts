/**
 * UADUE Phase 3.1 — Delivery Foundation PostgreSQL Adapter
 * Specification: UADUE-P3-HARD-R3-001 (R3 Final Hardened Contract)
 */

import { Pool, PoolClient } from 'pg';
import {
  ExamSessionRecord,
  ExamSessionTransitionRecord,
  ExamSessionProjectionRecord,
  CandidateSubmissionEventRecord,
  CandidateQuestionStateRecord,
  CandidateEvaluationRunRecord,
  CandidateQuestionScoreRecord,
  CandidateScoringDisputeRecord,
  AuditEventRecord,
  SubmissionEventRecord,
  ISubmissionStore,
} from './deliveryTypes';

export class DeliveryImmutabilityViolationError extends Error {
  constructor(public readonly tableName: string, public readonly operation: string) {
    super(`Delivery Immutability Violation: Cannot perform ${operation} on append-only table ${tableName}.`);
    this.name = 'DeliveryImmutabilityViolationError';
  }
}

export class DeliveryUniqueConstraintError extends Error {
  constructor(public readonly constraintName: string, message: string) {
    super(`Delivery Unique Constraint Violation [${constraintName}]: ${message}`);
    this.name = 'DeliveryUniqueConstraintError';
  }
}

export class DeliveryForeignKeyViolationError extends Error {
  constructor(public readonly detail: string) {
    super(`Delivery Foreign Key Violation: ${detail}`);
    this.name = 'DeliveryForeignKeyViolationError';
  }
}

export class DeliveryCheckConstraintError extends Error {
  constructor(public readonly constraintName: string) {
    super(`Delivery Check Constraint Violation: [${constraintName}]`);
    this.name = 'DeliveryCheckConstraintError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Exam session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

export class DeliveryRoleSwitchError extends Error {
  constructor(public readonly roleName: string, detail?: string) {
    super(`Delivery Authorization Failure: Failed to assume required role "${roleName}". Transaction aborted.${detail ? ` Detail: ${detail}` : ''}`);
    this.name = 'DeliveryRoleSwitchError';
  }
}

export class DatabaseConfigurationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`Database Configuration Failure [${code}]: ${message}`);
    this.name = 'DatabaseConfigurationError';
  }
}

export const FORBIDDEN_PRIVILEGED_ROLES = new Set([
  'postgres',
  'service_role',
  'supabase_admin',
  'root',
  'admin',
  'superuser',
]);

export interface DeliveryPostgresConfig {
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

export class DeliveryPostgresAdapter {
  private readonly tenantPool: Pool;
  private readonly privilegedPool?: Pool;

  constructor(configOrPool: DeliveryPostgresConfig | Pool = {}) {
    const config: DeliveryPostgresConfig =
      configOrPool && 'query' in configOrPool && typeof (configOrPool as Pool).query === 'function'
        ? { tenantPool: configOrPool as Pool, isTestEnvironment: true }
        : (configOrPool as DeliveryPostgresConfig);

    const isTest =
      config.isTestEnvironment !== undefined
        ? config.isTestEnvironment
        : (process.env.NODE_ENV === 'test' || Boolean(config.tenantPool));

    // 1. Explicitly check user parameter against privileged role blacklist
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
        (isTest ? process.env.MOCKAI_POSTGRES_URL || process.env.DATABASE_URL : undefined);

      if (!isTest && !rawUrl) {
        throw new DatabaseConfigurationError(
          'EXPLICIT_TENANT_URL_REQUIRED',
          'Production tenant connections require an explicit UADUE_TENANT_DATABASE_URL or tenantConnectionString.'
        );
      }

      const tenantConnectionString =
        rawUrl || 'postgres://uadue_app_user:@localhost:5432/mockai_uadue_test';

      // Parse and validate connection string
      try {
        const parsed = new URL(tenantConnectionString);
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
        connectionString: tenantConnectionString,
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user || 'uadue_app_user',
        password: config.password,
        max: config.max ?? 20,
        ssl: config.ssl,
      });
    }

    if (config.privilegedPool) {
      this.privilegedPool = config.privilegedPool;
    } else if (config.privilegedConnectionString || process.env.UADUE_ADMIN_DATABASE_URL) {
      this.privilegedPool = new Pool({
        connectionString: config.privilegedConnectionString || process.env.UADUE_ADMIN_DATABASE_URL,
        max: 5,
        ssl: config.ssl,
      });
    }
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
   * Execute an atomic transaction bound to a specific tenant context on the tenant pool.
   * Service-role elevation is forbidden unless an explicit privileged pool is configured.
   */
  public async withTransaction<T>(
    tenantId: string,
    callback: (client: PoolClient) => Promise<T>,
    isServiceRole: boolean = false
  ): Promise<T> {
    if (isServiceRole && !this.privilegedPool) {
      throw new DeliveryRoleSwitchError(
        'SERVICE_ROLE_FORBIDDEN',
        'DeliveryPostgresAdapter strictly executes tenant operations on an unprivileged tenant connection. Service-role elevation is forbidden without an explicitly configured privileged pool.'
      );
    }
    const poolToUse = isServiceRole ? this.privilegedPool! : this.tenantPool;
    const client = await poolToUse.connect();
    let connectionDamaged = false;
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;
      if (isServiceRole) {
        try {
          await client.query('RESET ROLE');
        } catch (resetErr: unknown) {
          throw new DeliveryRoleSwitchError(
            'RESET ROLE',
            resetErr instanceof Error ? resetErr.message : String(resetErr)
          );
        }
        await client.query("SELECT set_config('app.is_service_role', 'true', true)");
        await client.query("SELECT set_config('app.current_tenant_id', '', true)");
      } else {
        try {
          await client.query('SET LOCAL ROLE uadue_app_user');
        } catch (roleErr: unknown) {
          throw new DeliveryRoleSwitchError(
            'uadue_app_user',
            roleErr instanceof Error ? roleErr.message : String(roleErr)
          );
        }
        await client.query("SELECT set_config('app.is_service_role', 'false', true)");
        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      }
      const result = await callback(client);
      await client.query('COMMIT');
      inTransaction = false;
      return result;
    } catch (err: unknown) {
      if (inTransaction) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr: unknown) {
          connectionDamaged = true;
        }
      } else {
        connectionDamaged = true;
      }
      this.handlePostgresError(err);
      throw err;
    } finally {
      if (connectionDamaged) {
        client.release(true);
      } else {
        client.release();
      }
    }
  }

  /**
   * Executes an action holding a FOR SHARE lock on the exam session.
   * Eliminates the session/projection race by serializing against concurrent FOR UPDATE state transitions.
   */
  public async executeWithSessionLock<T>(
    sessionId: string,
    tenantId: string,
    action: (session: ExamSessionRecord) => Promise<T>
  ): Promise<T> {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      throw new DeliveryCheckConstraintError('TENANT_ID_REQUIRED');
    }
    return this.withTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM public.exam_sessions WHERE exam_session_id = $1 AND tenant_id = $2 FOR SHARE`,
        [sessionId, tenantId]
      );
      if (res.rows.length === 0) {
        throw new SessionNotFoundError(sessionId);
      }
      const r = res.rows[0];
      const sessionRecord: ExamSessionRecord = {
        examSessionId: r.exam_session_id,
        tenantId: r.tenant_id,
        candidateId: r.candidate_id,
        packageId: r.package_id,
        packageIntegritySeal: r.package_integrity_seal,
        sessionConfiguration: r.session_configuration,
        sessionState: r.session_state,
        stateVersion: r.state_version,
        currentLeaseId: r.current_lease_id,
        leaseHeartbeatAt: r.lease_heartbeat_at.toISOString(),
        scheduledStartAt: r.scheduled_start_at.toISOString(),
        actualStartedAt: r.actual_started_at ? r.actual_started_at.toISOString() : null,
        durationSeconds: r.duration_seconds,
        accumulatedPauseSeconds: r.accumulated_pause_seconds,
        pauseCount: r.pause_count,
        submittedAt: r.submitted_at ? r.submitted_at.toISOString() : null,
        expiredAt: r.expired_at ? r.expired_at.toISOString() : null,
        terminatedAt: r.terminated_at ? r.terminated_at.toISOString() : null,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
      };
      return action(sessionRecord);
    });
  }

  /**
   * Session Management
   */
  public async createExamSession(session: ExamSessionRecord): Promise<void> {
    await this.withTransaction(session.tenantId, async (client) => {
      await client.query(
        `INSERT INTO public.exam_sessions (
          exam_session_id, tenant_id, candidate_id, package_id, package_integrity_seal,
          session_configuration, session_state, state_version, current_lease_id,
          lease_heartbeat_at, scheduled_start_at, actual_started_at, duration_seconds,
          accumulated_pause_seconds, pause_count, submitted_at, expired_at, terminated_at,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        )`,
        [
          session.examSessionId,
          session.tenantId,
          session.candidateId,
          session.packageId,
          session.packageIntegritySeal,
          JSON.stringify(session.sessionConfiguration),
          session.sessionState,
          session.stateVersion,
          session.currentLeaseId,
          session.leaseHeartbeatAt,
          session.scheduledStartAt,
          session.actualStartedAt,
          session.durationSeconds,
          session.accumulatedPauseSeconds,
          session.pauseCount,
          session.submittedAt,
          session.expiredAt,
          session.terminatedAt,
          session.createdAt,
          session.updatedAt,
        ]
      );
    });
  }

  public async getExamSession(sessionId: string, tenantId: string): Promise<ExamSessionRecord | null> {
    return this.withTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM public.exam_sessions WHERE exam_session_id = $1`,
        [sessionId]
      );
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        examSessionId: r.exam_session_id,
        tenantId: r.tenant_id,
        candidateId: r.candidate_id,
        packageId: r.package_id,
        packageIntegritySeal: r.package_integrity_seal,
        sessionConfiguration: r.session_configuration,
        sessionState: r.session_state,
        stateVersion: r.state_version,
        currentLeaseId: r.current_lease_id,
        leaseHeartbeatAt: r.lease_heartbeat_at.toISOString(),
        scheduledStartAt: r.scheduled_start_at.toISOString(),
        actualStartedAt: r.actual_started_at ? r.actual_started_at.toISOString() : null,
        durationSeconds: r.duration_seconds,
        accumulatedPauseSeconds: r.accumulated_pause_seconds,
        pauseCount: r.pause_count,
        submittedAt: r.submitted_at ? r.submitted_at.toISOString() : null,
        expiredAt: r.expired_at ? r.expired_at.toISOString() : null,
        terminatedAt: r.terminated_at ? r.terminated_at.toISOString() : null,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
      };
    });
  }

  /**
   * Transition Ledger
   */
  public async recordSessionTransition(transition: ExamSessionTransitionRecord): Promise<void> {
    await this.withTransaction(transition.tenantId, async (client) => {
      await client.query(
        `INSERT INTO public.exam_session_transitions (
          transition_id, exam_session_id, tenant_id, transition_request_id,
          from_state, to_state, from_version, to_version,
          idempotency_hash, transition_receipt, recorded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          transition.transitionId,
          transition.examSessionId,
          transition.tenantId,
          transition.transitionRequestId,
          transition.fromState,
          transition.toState,
          transition.fromVersion,
          transition.toVersion,
          transition.idempotencyHash,
          JSON.stringify(transition.transitionReceipt),
          transition.recordedAt,
        ]
      );
    });
  }

  /**
   * Session Projections
   */
  public async saveSessionProjection(projection: ExamSessionProjectionRecord): Promise<void> {
    await this.withTransaction(projection.tenantId, async (client) => {
      await client.query(
        `INSERT INTO public.exam_session_projections (
          projection_id, exam_session_id, tenant_id, package_id, shuffling_seed,
          presentation_manifest_integrity, question_display_order, option_display_order,
          default_language, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          projection.projectionId,
          projection.examSessionId,
          projection.tenantId,
          projection.packageId,
          projection.shufflingSeed,
          projection.presentationManifestIntegrity,
          JSON.stringify(projection.questionDisplayOrder),
          JSON.stringify(projection.optionDisplayOrder),
          projection.defaultLanguage,
          projection.createdAt,
        ]
      );
    });
  }

  /**
   * Submission Events
   */
  public async appendSubmissionEvent(
    event: CandidateSubmissionEventRecord
  ): Promise<{ serverSequenceNumber: number }> {
    return this.withTransaction(event.tenantId, async (client) => {
      const res = await client.query(
        `INSERT INTO public.candidate_submission_events (
          event_id, exam_session_id, tenant_id, canonical_question_id, representation_id,
          package_id, package_integrity_seal, client_sequence_number, client_event_id,
          event_type, candidate_response, response_fingerprint, receipt_id,
          server_signature, client_timestamp, server_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
        RETURNING server_sequence_number`,
        [
          event.eventId,
          event.examSessionId,
          event.tenantId,
          event.canonicalQuestionId,
          event.representationId,
          event.packageId,
          event.packageIntegritySeal,
          event.clientSequenceNumber,
          event.clientEventId,
          event.eventType,
          JSON.stringify(event.candidateResponse),
          event.responseFingerprint,
          event.receiptId,
          event.serverSignature,
          event.clientTimestamp,
        ]
      );
      return { serverSequenceNumber: Number(res.rows[0].server_sequence_number) };
    });
  }

  /**
   * Server-Authoritative Question States
   */
  public async upsertQuestionState(state: CandidateQuestionStateRecord): Promise<void> {
    await this.withTransaction(state.tenantId, async (client) => {
      await client.query(
        `INSERT INTO public.candidate_question_states (
          state_id, exam_session_id, tenant_id, canonical_question_id,
          current_state_version, selected_option_id, response_payload, payload_fingerprint,
          last_server_sequence, last_client_event_id, is_answered, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (exam_session_id, canonical_question_id) DO UPDATE SET
          current_state_version = EXCLUDED.current_state_version,
          selected_option_id = EXCLUDED.selected_option_id,
          response_payload = EXCLUDED.response_payload,
          payload_fingerprint = EXCLUDED.payload_fingerprint,
          last_server_sequence = EXCLUDED.last_server_sequence,
          last_client_event_id = EXCLUDED.last_client_event_id,
          is_answered = EXCLUDED.is_answered,
          updated_at = EXCLUDED.updated_at`,
        [
          state.stateId,
          state.examSessionId,
          state.tenantId,
          state.canonicalQuestionId,
          state.currentStateVersion,
          state.selectedOptionId,
          state.responsePayload ? JSON.stringify(state.responsePayload) : null,
          state.payloadFingerprint,
          state.lastServerSequence,
          state.lastClientEventId,
          state.isAnswered,
          state.updatedAt,
        ]
      );
    });
  }

  public async getQuestionState(
    sessionId: string,
    questionId: string,
    tenantId: string
  ): Promise<CandidateQuestionStateRecord | null> {
    return this.withTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM public.candidate_question_states 
         WHERE exam_session_id = $1 AND canonical_question_id = $2`,
        [sessionId, questionId]
      );
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        stateId: r.state_id,
        examSessionId: r.exam_session_id,
        tenantId: r.tenant_id,
        canonicalQuestionId: r.canonical_question_id,
        currentStateVersion: r.current_state_version,
        selectedOptionId: r.selected_option_id,
        responsePayload: r.response_payload,
        payloadFingerprint: r.payload_fingerprint,
        lastServerSequence: Number(r.last_server_sequence),
        lastClientEventId: r.last_client_event_id,
        isAnswered: r.is_answered,
        updatedAt: r.updated_at.toISOString(),
      };
    });
  }

  public async getAllQuestionStates(
    sessionId: string,
    tenantId: string
  ): Promise<CandidateQuestionStateRecord[]> {
    return this.withTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM public.candidate_question_states 
         WHERE exam_session_id = $1 ORDER BY canonical_question_id ASC`,
        [sessionId]
      );
      return res.rows.map((r: any) => ({
        stateId: r.state_id,
        examSessionId: r.exam_session_id,
        tenantId: r.tenant_id,
        canonicalQuestionId: r.canonical_question_id,
        currentStateVersion: r.current_state_version,
        selectedOptionId: r.selected_option_id,
        responsePayload: r.response_payload,
        payloadFingerprint: r.payload_fingerprint,
        lastServerSequence: Number(r.last_server_sequence),
        lastClientEventId: r.last_client_event_id,
        isAnswered: r.is_answered,
        updatedAt: r.updated_at.toISOString(),
      }));
    });
  }

  /**
   * Evaluation Runs & Question Scores
   */
  public async createEvaluationRun(run: CandidateEvaluationRunRecord): Promise<void> {
    await this.withTransaction(run.tenantId, async (client) => {
      await client.query(
        `INSERT INTO public.candidate_evaluation_runs (
          evaluation_run_id, exam_session_id, tenant_id, package_id, package_integrity_seal,
          scoring_policy_version, answer_key_version, evaluation_contract_tuple, run_iteration,
          supersedes_run_id, total_raw_score, total_normalized_score, questions_attempted,
          questions_correct, questions_incorrect, questions_unanswered, evaluation_signature,
          evaluated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          run.evaluationRunId,
          run.examSessionId,
          run.tenantId,
          run.packageId,
          run.packageIntegritySeal,
          run.scoringPolicyVersion,
          run.answerKeyVersion,
          JSON.stringify(run.evaluationContractTuple),
          run.runIteration,
          run.supersedesRunId,
          run.totalRawScore,
          run.totalNormalizedScore,
          run.questionsAttempted,
          run.questionsCorrect,
          run.questionsIncorrect,
          run.questionsUnanswered,
          run.evaluationSignature,
          run.evaluatedAt,
        ]
      );
    });
  }

  public async recordQuestionScores(
    scores: CandidateQuestionScoreRecord[]
  ): Promise<void> {
    if (scores.length === 0) return;
    const tenantId = scores[0].tenantId;
    await this.withTransaction(tenantId, async (client) => {
      for (const s of scores) {
        await client.query(
          `INSERT INTO public.candidate_question_scores (
            question_score_id, evaluation_run_id, tenant_id, canonical_question_id,
            candidate_response_raw, resolved_correct_key, is_correct, is_partially_correct,
            marks_awarded, penalty_deducted, net_score, disposition, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            s.questionScoreId,
            s.evaluationRunId,
            s.tenantId,
            s.canonicalQuestionId,
            JSON.stringify(s.candidateResponseRaw),
            JSON.stringify(s.resolvedCorrectKey),
            s.isCorrect,
            s.isPartiallyCorrect,
            s.marksAwarded,
            s.penaltyDeducted,
            s.netScore,
            s.disposition,
            s.createdAt,
          ]
        );
      }
    });
  }

  /**
   * Audit Events
   */
  public async recordAuditEvent(event: AuditEventRecord): Promise<void> {
    await this.withTransaction(event.tenantId, async (client) => {
      await client.query(
        `INSERT INTO public.audit_events (
          audit_event_id, tenant_id, event_type, severity, actor_type, actor_id,
          resource_type, resource_id, event_payload, recorded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          event.auditEventId,
          event.tenantId,
          event.eventType,
          event.severity,
          event.actorType,
          event.actorId,
          event.resourceType,
          event.resourceId,
          JSON.stringify(event.eventPayload),
          event.recordedAt,
        ]
      );
    });
  }

  public async getEvaluationRun(
    evaluationRunId: string,
    tenantId: string
  ): Promise<CandidateEvaluationRunRecord | null> {
    return this.withTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM public.candidate_evaluation_runs WHERE evaluation_run_id = $1`,
        [evaluationRunId]
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
        evaluatedAt: r.evaluated_at.toISOString(),
      };
    });
  }

  public async getQuestionScores(
    evaluationRunId: string,
    tenantId: string
  ): Promise<CandidateQuestionScoreRecord[]> {
    return this.withTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM public.candidate_question_scores WHERE evaluation_run_id = $1 ORDER BY canonical_question_id`,
        [evaluationRunId]
      );
      return res.rows.map((r: any) => ({
        questionScoreId: r.question_score_id,
        evaluationRunId: r.evaluation_run_id,
        tenantId: r.tenant_id,
        canonicalQuestionId: r.canonical_question_id,
        candidateResponseRaw: r.candidate_response_raw,
        resolvedCorrectKey: r.resolved_correct_key,
        isCorrect: r.is_correct,
        isPartiallyCorrect: r.is_partially_correct,
        marksAwarded: Number(r.marks_awarded),
        penaltyDeducted: Number(r.penalty_deducted),
        netScore: Number(r.net_score),
        disposition: r.disposition,
        createdAt: r.created_at.toISOString(),
      }));
    });
  }

  public async getEvaluationRunsForSession(
    sessionId: string,
    tenantId: string
  ): Promise<CandidateEvaluationRunRecord[]> {
    return this.withTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM public.candidate_evaluation_runs 
         WHERE exam_session_id = $1 
         ORDER BY run_iteration DESC`,
        [sessionId]
      );
      return res.rows.map((r: any) => ({
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
        evaluatedAt: r.evaluated_at.toISOString(),
      }));
    });
  }

  public async recordScoringDispute(dispute: CandidateScoringDisputeRecord): Promise<void> {
    await this.withTransaction(dispute.tenantId, async (client) => {
      await client.query(
        `INSERT INTO public.candidate_scoring_disputes (
          dispute_id, exam_session_id, tenant_id, candidate_id, canonical_question_id,
          evaluation_run_id, dispute_reason, dispute_status, resolution_notes, resolved_by,
          created_at, resolved_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          dispute.disputeId,
          dispute.examSessionId,
          dispute.tenantId,
          dispute.candidateId,
          dispute.canonicalQuestionId,
          dispute.evaluationRunId,
          dispute.disputeReason,
          dispute.disputeStatus,
          dispute.resolutionNotes || null,
          dispute.resolvedBy || null,
          dispute.createdAt,
          dispute.resolvedAt || null,
        ]
      );
    });
  }

  public async getScoringDispute(
    disputeId: string,
    tenantId: string
  ): Promise<CandidateScoringDisputeRecord | null> {
    return this.withTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM public.candidate_scoring_disputes WHERE dispute_id = $1`,
        [disputeId]
      );
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        disputeId: r.dispute_id,
        examSessionId: r.exam_session_id,
        tenantId: r.tenant_id,
        candidateId: r.candidate_id,
        canonicalQuestionId: r.canonical_question_id,
        evaluationRunId: r.evaluation_run_id,
        disputeReason: r.dispute_reason,
        disputeStatus: r.dispute_status,
        resolutionNotes: r.resolution_notes,
        resolvedBy: r.resolved_by,
        createdAt: r.created_at.toISOString(),
        resolvedAt: r.resolved_at ? r.resolved_at.toISOString() : null,
      };
    });
  }

  public async getScoringDisputesForSession(
    sessionId: string,
    tenantId: string
  ): Promise<CandidateScoringDisputeRecord[]> {
    return this.withTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM public.candidate_scoring_disputes WHERE exam_session_id = $1 ORDER BY created_at ASC`,
        [sessionId]
      );
      return res.rows.map((r: any) => ({
        disputeId: r.dispute_id,
        examSessionId: r.exam_session_id,
        tenantId: r.tenant_id,
        candidateId: r.candidate_id,
        canonicalQuestionId: r.canonical_question_id,
        evaluationRunId: r.evaluation_run_id,
        disputeReason: r.dispute_reason,
        disputeStatus: r.dispute_status,
        resolutionNotes: r.resolution_notes,
        resolvedBy: r.resolved_by,
        createdAt: r.created_at.toISOString(),
        resolvedAt: r.resolved_at ? r.resolved_at.toISOString() : null,
      }));
    });
  }

  public async updateScoringDispute(
    disputeId: string,
    tenantId: string,
    updates: Partial<CandidateScoringDisputeRecord>
  ): Promise<void> {
    await this.withTransaction(tenantId, async (client) => {
      await client.query(
        `UPDATE public.candidate_scoring_disputes
         SET dispute_status = COALESCE($1, dispute_status),
             resolution_notes = COALESCE($2, resolution_notes),
             resolved_by = COALESCE($3, resolved_by),
             resolved_at = COALESCE($4, resolved_at)
         WHERE dispute_id = $5`,
        [
          updates.disputeStatus || null,
          updates.resolutionNotes || null,
          updates.resolvedBy || null,
          updates.resolvedAt || null,
          disputeId,
        ]
      );
    });
  }

  public async getSubmissionEvents(
    sessionId: string,
    tenantId: string
  ): Promise<CandidateSubmissionEventRecord[]> {
    return this.withTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM public.candidate_submission_events 
         WHERE exam_session_id = $1 ORDER BY server_sequence_number ASC`,
        [sessionId]
      );
      return res.rows.map((r: any) => ({
        eventId: r.event_id,
        examSessionId: r.exam_session_id,
        tenantId: r.tenant_id,
        canonicalQuestionId: r.canonical_question_id,
        representationId: r.representation_id,
        packageId: r.package_id,
        packageIntegritySeal: r.package_integrity_seal,
        clientSequenceNumber: r.client_sequence_number,
        serverSequenceNumber: Number(r.server_sequence_number),
        clientEventId: r.client_event_id,
        eventType: r.event_type,
        candidateResponse: r.candidate_response,
        responseFingerprint: r.response_fingerprint,
        receiptId: r.receipt_id,
        serverSignature: r.server_signature,
        clientTimestamp: r.client_timestamp.toISOString(),
        serverTimestamp: r.server_timestamp ? r.server_timestamp.toISOString() : undefined,
      }));
    });
  }

  public async getSubmissionEventByClientEventId(
    sessionId: string,
    clientEventId: string,
    tenantId: string
  ): Promise<CandidateSubmissionEventRecord | null> {
    return this.withTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM public.candidate_submission_events 
         WHERE exam_session_id = $1 AND client_event_id = $2 LIMIT 1`,
        [sessionId, clientEventId]
      );
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        eventId: r.event_id,
        examSessionId: r.exam_session_id,
        tenantId: r.tenant_id,
        canonicalQuestionId: r.canonical_question_id,
        representationId: r.representation_id,
        packageId: r.package_id,
        packageIntegritySeal: r.package_integrity_seal,
        clientSequenceNumber: Number(r.client_sequence_number),
        serverSequenceNumber: Number(r.server_sequence_number),
        clientEventId: r.client_event_id,
        eventType: r.event_type,
        candidateResponse: r.candidate_response,
        responseFingerprint: r.response_fingerprint,
        receiptId: r.receipt_id,
        serverSignature: r.server_signature,
        clientTimestamp: r.client_timestamp ? r.client_timestamp.toISOString() : new Date().toISOString(),
        serverTimestamp: r.server_timestamp ? r.server_timestamp.toISOString() : new Date().toISOString(),
      };
    });
  }

  public async getAuditEvents(
    tenantId: string,
    limit: number = 50
  ): Promise<AuditEventRecord[]> {
    return this.withTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM public.audit_events WHERE tenant_id = $1 ORDER BY recorded_at DESC LIMIT $2`,
        [tenantId, limit]
      );
      return res.rows.map((r: any) => ({
        auditEventId: r.audit_event_id,
        tenantId: r.tenant_id,
        eventType: r.event_type,
        severity: r.severity,
        actorType: r.actor_type,
        actorId: r.actor_id,
        resourceType: r.resource_type,
        resourceId: r.resource_id,
        eventPayload: r.event_payload,
        recordedAt: r.recorded_at.toISOString(),
      }));
    });
  }

  /**
   * Centralized Postgres Error Classifier
   */
  private handlePostgresError(err: unknown): void {
    if (typeof err === 'object' && err !== null) {
      const pgErr = err as { code?: string; message?: string; constraint?: string; table?: string };
      if (pgErr.code === 'P0001' && pgErr.message?.includes('Immutability Violation')) {
        throw new DeliveryImmutabilityViolationError(pgErr.table || 'unknown', 'mutation');
      }
      if (pgErr.code === '23505') {
        throw new DeliveryUniqueConstraintError(pgErr.constraint || 'unknown', pgErr.message || '');
      }
      if (pgErr.code === '23503') {
        throw new DeliveryForeignKeyViolationError(pgErr.message || '');
      }
      if (pgErr.code === '23514') {
        throw new DeliveryCheckConstraintError(pgErr.constraint || 'unknown');
      }
    }
  }
}

export class PostgresCandidateSubmissionStore implements ISubmissionStore {
  constructor(
    private readonly adapter: DeliveryPostgresAdapter,
    private readonly tenantId: string
  ) {}

  public async getSubmissionEvent(
    examSessionId: string,
    clientEventId: string
  ): Promise<SubmissionEventRecord | null> {
    const row = await this.adapter.getSubmissionEventByClientEventId(
      examSessionId,
      clientEventId,
      this.tenantId
    );
    if (!row) return null;
    return {
      examSessionId: row.examSessionId,
      clientEventId: row.clientEventId,
      responseFingerprint: row.responseFingerprint,
      receipt: {
        receiptId: row.receiptId,
        examSessionId: row.examSessionId,
        clientEventId: row.clientEventId,
        clientSequenceNumber: row.clientSequenceNumber,
        serverSequenceNumber: row.serverSequenceNumber || 1,
        canonicalQuestionId: row.canonicalQuestionId,
        responseFingerprint: row.responseFingerprint,
        serverTimestamp: row.serverTimestamp || new Date().toISOString(),
        validationStatus: 'ACCEPTED',
        serverSignature: row.serverSignature,
        idempotentReplay: true,
      },
    };
  }

  public async saveSubmissionEvent(record: SubmissionEventRecord): Promise<void> {
    await this.adapter.appendSubmissionEvent({
      eventId: `sub_evt_${record.examSessionId}_${record.clientEventId}`,
      examSessionId: record.examSessionId,
      tenantId: this.tenantId,
      canonicalQuestionId: record.receipt.canonicalQuestionId,
      representationId: 'rep_default',
      packageId: 'pkg_active',
      packageIntegritySeal: 'seal_active',
      clientSequenceNumber: record.receipt.clientSequenceNumber,
      serverSequenceNumber: record.receipt.serverSequenceNumber,
      clientEventId: record.clientEventId,
      eventType: 'ANSWER_SELECTED',
      candidateResponse: {
        receiptId: record.receipt.receiptId,
      },
      responseFingerprint: record.responseFingerprint,
      receiptId: record.receipt.receiptId,
      serverSignature: record.receipt.serverSignature,
      clientTimestamp: record.receipt.serverTimestamp,
    });
  }
}
