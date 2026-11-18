/**
 * UADUE Phase 2D-7 / Phase 3.6 — 4-Tier Consumer Projection Gateway
 * Document Version: 7.5.0-SECURITY-HARDENED-ENFORCED-AUTHORITY
 *
 * Security & Air-Gap Principles:
 * 1. Tier 3 Student Live Test projections are scrubbed at the query layer.
 * 2. ZERO answer keys, scoring formulas, or lineage DAGs ever leak to the client.
 * 3. Candidate-facing projection endpoints strictly require verified candidate context and CANNOT fall back to service-role.
 * 4. Mandatory Authorizer Binding: Candidate live projections require authoritative session verification.
 * 5. Privileged operations ({ isInternalAudit: true }) are physically separated from candidate endpoints
 *    AND require cryptographic VerifiedPrivilegedAuditContext proofs. Plain caller-supplied objects/booleans are rejected.
 * 6. Quarantined or invalid packages are strictly rejected from student projections.
 * 7. Anti-TOCTOU Re-verification: Authoritative session state is confirmed ACTIVE before projection is served.
 * 8. Tier 2 Staff Review projections preserve the frozen masking contract: answer keys remain [REDACTED] by default.
 */

import { CanonicalAssessmentPackage, CanonicalQuestionIR } from './types';
import {
  StudentLivePackageProjection,
  StudentLiveQuestionProjection,
  StaffReviewPackageProjection,
  StaffReviewQuestionProjection,
  PostExamPackageProjection,
  PostExamQuestionProjection,
} from './canonicalPersistenceTypes';
import {
  CandidateSessionAuthorizer,
  VerifiedCandidateSessionContext,
  VerifiedPrivilegedAuditContext,
} from '../delivery/candidateSessionAuthorizer';

export class ProjectionAuthorizationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`Projection Authorization Violation [${code}]: ${message}`);
    this.name = 'ProjectionAuthorizationError';
  }
}

/**
 * Verified candidate session context required for Tier 3 Live Exam Projections.
 */
export interface CandidateProjectionSecurityContext {
  tenantId: string;
  examSessionId: string;
  candidateId: string;
  sessionToken?: string;
}

/**
 * Verified staff review context for Tier 2 Review Queue Projections.
 */
export interface StaffReviewSecurityContext {
  tenantId: string;
  staffUserId: string;
  organizationId?: string;
}

// Security Boundary: CandidateProjectionContext excludes InternalAuditSecurityContext
export type CandidateProjectionContext = CandidateProjectionSecurityContext | VerifiedCandidateSessionContext;
export type StaffReviewContext = StaffReviewSecurityContext;

export interface ICanonicalPackageReconstructor {
  reconstructPackageForTenant(packageId: string, tenantId: string): Promise<CanonicalAssessmentPackage>;
  reconstructPackageForServiceRole(packageId: string): Promise<CanonicalAssessmentPackage>;
  reconstructPackage?(packageId: string, tenantId?: string): Promise<CanonicalAssessmentPackage>;
}

export class CanonicalProjectionGateway {
  constructor(
    private readonly adapter: ICanonicalPackageReconstructor,
    private readonly authorizer?: CandidateSessionAuthorizer
  ) {}

  /**
   * Tier 3 Projection: Student Live Test Session.
   * AIR-GAPPED: Answers and scoring DAGs are physically omitted from the returned payload.
   *
   * SECURITY ENFORCEMENT:
   * Requires a verified CandidateProjectionSecurityContext or sealed VerifiedCandidateSessionContext.
   * Any attempt to pass isInternalAudit bypass flags is rejected immediately.
   * Candidate access CANNOT omit tenant context and CANNOT fall back to service-role.
   * Anti-TOCTOU re-verifies session is currently ACTIVE.
   */
  public async getTier3StudentLiveProjection(
    packageId: string,
    securityContext: CandidateProjectionContext,
    targetScope: string = 'LIVE_STUDENT_SESSION'
  ): Promise<StudentLivePackageProjection> {
    if (!securityContext) {
      throw new ProjectionAuthorizationError(
        'AUTH_CONTEXT_REQUIRED',
        'Tier 3 Student Live Projection requires a valid security context. Unauthenticated access is forbidden.'
      );
    }

    // 1. Defend against caller-controlled internal audit bypass
    if ((securityContext as any).isInternalAudit) {
      throw new ProjectionAuthorizationError(
        'PRIVILEGED_BYPASS_FORBIDDEN',
        'Privileged isInternalAudit bypass is strictly forbidden on candidate-facing projection gateway.'
      );
    }

    let targetTenantId: string;

    // 2. Sealed VerifiedCandidateSessionContext verification & atomic session lock
    if ((securityContext as any).isVerifiedCandidateContext === true) {
      const verified = securityContext as VerifiedCandidateSessionContext;
      if (this.authorizer) {
        const isValid = this.authorizer.verifyContext(verified);
        if (!isValid) {
          throw new ProjectionAuthorizationError(
            'INVALID_VERIFIED_CONTEXT',
            'Tampered or expired verified session context signature.'
          );
        }
      }
      if (verified.packageId !== packageId) {
        throw new ProjectionAuthorizationError(
          'PACKAGE_MISMATCH',
          `Verified context is bound to package ${verified.packageId}, but request targeted ${packageId}.`
        );
      }
      targetTenantId = verified.tenantId;

      const retrievePackage = async () => {
        // Reconstruct strictly for tenant - zero service-role fallback
        const pkg = await this.adapter.reconstructPackageForTenant(packageId, targetTenantId);

        // Validate package is not quarantined or invalid
        const valStatus = (pkg.validationReport?.validationStatus as string | undefined) ?? '';
        if (
          valStatus === 'PACKAGE_FAILED' ||
          valStatus === 'QUARANTINED' ||
          valStatus === 'INVALID' ||
          valStatus === 'PACKAGE_REVIEW_REQUIRED' ||
          (Array.isArray(pkg.quarantinedRelationships) && pkg.quarantinedRelationships.length > 0 && valStatus !== 'PACKAGE_VALIDATED')
        ) {
          throw new ProjectionAuthorizationError(
            'PACKAGE_QUARANTINED',
            `Assessment package ${packageId} is quarantined or invalid (status: ${valStatus}); candidate live delivery is forbidden.`
          );
        }

        return this.buildStudentLiveProjection(pkg, targetScope);
      };

      if (this.authorizer) {
        try {
          return await this.authorizer.executeWithActiveSessionLock(
            verified.examSessionId,
            verified.tenantId,
            retrievePackage
          );
        } catch (err: unknown) {
          if (err instanceof Error && (err.name === 'SessionNotActiveError' || err.message.includes('not in ACTIVE') || err.message.includes('no longer ACTIVE'))) {
            throw new ProjectionAuthorizationError(
              'SESSION_STATE_STALE',
              `Exam session '${verified.examSessionId}' is no longer ACTIVE. Live projection revoked.`
            );
          }
          if (err instanceof Error && (err.name === 'SessionNotFoundError' || err.message.includes('not found') || err.message.includes('Session not found'))) {
            throw new ProjectionAuthorizationError(
              'SESSION_NOT_FOUND',
              `Exam session '${verified.examSessionId}' not found for tenant '${verified.tenantId}'. Access denied.`
            );
          }
          throw err;
        }
      } else {
        return retrievePackage();
      }
    } else {
      const candidateCtx = securityContext as CandidateProjectionSecurityContext;
      if (!candidateCtx.tenantId || typeof candidateCtx.tenantId !== 'string' || candidateCtx.tenantId.trim() === '') {
        throw new ProjectionAuthorizationError(
          'TENANT_ID_REQUIRED',
          'Candidate projection requires a verified, non-empty tenantId.'
        );
      }
      if (!candidateCtx.examSessionId || typeof candidateCtx.examSessionId !== 'string' || candidateCtx.examSessionId.trim() === '') {
        throw new ProjectionAuthorizationError(
          'EXAM_SESSION_ID_REQUIRED',
          'Candidate projection requires an active, verified examSessionId.'
        );
      }
      if (!candidateCtx.candidateId || typeof candidateCtx.candidateId !== 'string' || candidateCtx.candidateId.trim() === '') {
        throw new ProjectionAuthorizationError(
          'CANDIDATE_ID_REQUIRED',
          'Candidate projection requires a verified candidateId.'
        );
      }

      // If an authorizer is attached, authoritatively bind and verify the session
      if (this.authorizer) {
        await this.authorizer.authorizeCandidateSession({
          credentials: {
            principal: {
              candidateId: candidateCtx.candidateId,
              tenantId: candidateCtx.tenantId,
            },
          },
          examSessionId: candidateCtx.examSessionId,
          requestedPackageId: packageId,
          tenantId: candidateCtx.tenantId,
        });
      }
      targetTenantId = candidateCtx.tenantId;

      const pkg = await this.adapter.reconstructPackageForTenant(packageId, targetTenantId);
      const valStatus = (pkg.validationReport?.validationStatus as string | undefined) ?? '';
      if (
        valStatus === 'PACKAGE_FAILED' ||
        valStatus === 'QUARANTINED' ||
        valStatus === 'INVALID' ||
        valStatus === 'PACKAGE_REVIEW_REQUIRED' ||
        (Array.isArray(pkg.quarantinedRelationships) && pkg.quarantinedRelationships.length > 0 && valStatus !== 'PACKAGE_VALIDATED')
      ) {
        throw new ProjectionAuthorizationError(
          'PACKAGE_QUARANTINED',
          `Assessment package ${packageId} is quarantined or invalid (status: ${valStatus}); candidate live delivery is forbidden.`
        );
      }

      return this.buildStudentLiveProjection(pkg, targetScope);
    }
  }

  /**
   * Internal Audit Tier 3 Live Projection:
   * Dedicated method for system testing and offline certification.
   * Requires cryptographically verified VerifiedPrivilegedAuditContext.
   */
  public async getTier3LiveProjectionForInternalAudit(
    packageId: string,
    auditContext: VerifiedPrivilegedAuditContext,
    targetScope: string = 'INTERNAL_AUDIT'
  ): Promise<StudentLivePackageProjection> {
    if (typeof window !== 'undefined') {
      throw new ProjectionAuthorizationError(
        'SERVER_ONLY_OPERATION',
        'Privileged internal audit projection methods are strictly restricted to trusted server-side environments.'
      );
    }

    if (!auditContext || (auditContext as any).isVerifiedPrivilegedAudit !== true) {
      throw new ProjectionAuthorizationError(
        'FORBIDDEN_AUDIT_AUTHORIZATION',
        'Privileged internal audit projection requires a cryptographically verified VerifiedPrivilegedAuditContext.'
      );
    }

    if (this.authorizer && !this.authorizer.verifyPrivilegedAuditContext(auditContext)) {
      throw new ProjectionAuthorizationError(
        'FORBIDDEN_AUDIT_AUTHORIZATION',
        'Staff audit cryptographic signature or expiration check failed.'
      );
    }

    const pkg = await this.adapter.reconstructPackageForServiceRole(packageId);
    return this.buildStudentLiveProjection(pkg, targetScope);
  }

  private buildStudentLiveProjection(
    pkg: CanonicalAssessmentPackage,
    targetScope: string
  ): StudentLivePackageProjection {
    const questions: StudentLiveQuestionProjection[] = pkg.canonicalQuestions.map((q: any, qIdx: number) => {
      const qProj: StudentLiveQuestionProjection = {
        canonicalQuestionId: q.canonicalQuestionId,
        questionIndex: qIdx,
        familyRole: q.familyRole ?? 'PRIMARY',
        synthesizedQuestionType: q.synthesizedQuestionType ?? 'SINGLE_CHOICE',
        representations: (q.representations || []).map((rep: any, repIdx: number) => ({
          representationIndex: repIdx,
          languageScript: rep.languageScript ?? 'und',
          sourcePhysicalInstanceId: rep.sourcePhysicalInstanceId ?? '',
          sourceQuestionNumber: rep.sourceQuestionNumber ?? null,
          stemAST: rep.stemAST ?? rep.stemAst ?? [],
          options: (rep.options || []).map((opt: any, oIdx: number) => ({
            optionId: opt.optionId ?? `opt_${oIdx}`,
            optionIndex: oIdx,
            contentAST: opt.contentAST ?? opt.text ?? [],
          })),
          tables: rep.tables || [],
          diagrams: rep.diagrams || [],
          mathBlocks: rep.mathBlocks || [],
        })),
      };

      if (targetScope === 'INTERNAL_AUDIT' && q.logicalFamilyId) {
        (qProj as any).logicalFamilyId = q.logicalFamilyId;
      }

      return qProj;
    });

    return {
      packageId: pkg.packageId,
      schemaVersion: pkg.schemaVersion,
      totalQuestions: questions.length,
      questions,
      targetScope,
      projectionTier: 'TIER_3_STUDENT_LIVE',
    };
  }

  /**
   * Tier 2 Projection: Staff Review Queue.
   * Provides discrepancy logs and layout details for human review.
   * Answers remain [REDACTED] by default.
   */
  public async getTier2StaffReviewProjection(
    packageId: string,
    securityContext: StaffReviewContext
  ): Promise<StaffReviewPackageProjection> {
    if (!securityContext) {
      throw new ProjectionAuthorizationError(
        'AUTH_CONTEXT_REQUIRED',
        'Tier 2 Staff Review Projection requires a valid security context. Unauthenticated access is forbidden.'
      );
    }

    if ((securityContext as any).isInternalAudit) {
      throw new ProjectionAuthorizationError(
        'PRIVILEGED_BYPASS_FORBIDDEN',
        'Privileged isInternalAudit bypass is forbidden on staff review projection gateway. Use getTier2StaffReviewProjectionForInternalAudit.'
      );
    }

    const staffCtx = securityContext as StaffReviewSecurityContext;
    if (!staffCtx.tenantId || typeof staffCtx.tenantId !== 'string' || staffCtx.tenantId.trim() === '') {
      throw new ProjectionAuthorizationError(
        'TENANT_ID_REQUIRED',
        'Staff review projection requires a verified, non-empty tenantId.'
      );
    }
    if (!staffCtx.staffUserId || typeof staffCtx.staffUserId !== 'string' || staffCtx.staffUserId.trim() === '') {
      throw new ProjectionAuthorizationError(
        'STAFF_USER_ID_REQUIRED',
        'Staff review projection requires an authorized staffUserId.'
      );
    }

    const pkg = await this.adapter.reconstructPackageForTenant(packageId, staffCtx.tenantId);
    return this.buildStaffReviewProjection(pkg);
  }

  /**
   * Internal Audit Tier 2 Staff Review Projection:
   * Dedicated privileged method for testing and offline certification.
   * Requires cryptographically verified VerifiedPrivilegedAuditContext.
   * Masking preserved: Tier 2 answers remain [REDACTED] unless purpose is EXAM:SOLUTION_AUDIT.
   */
  public async getTier2StaffReviewProjectionForInternalAudit(
    packageId: string,
    auditContext: VerifiedPrivilegedAuditContext
  ): Promise<StaffReviewPackageProjection> {
    if (typeof window !== 'undefined') {
      throw new ProjectionAuthorizationError(
        'SERVER_ONLY_OPERATION',
        'Privileged internal audit projection methods are strictly restricted to trusted server-side environments.'
      );
    }

    if (!auditContext || (auditContext as any).isVerifiedPrivilegedAudit !== true) {
      throw new ProjectionAuthorizationError(
        'FORBIDDEN_AUDIT_AUTHORIZATION',
        'Privileged staff review projection requires a cryptographically verified VerifiedPrivilegedAuditContext.'
      );
    }

    if (this.authorizer && !this.authorizer.verifyPrivilegedAuditContext(auditContext)) {
      throw new ProjectionAuthorizationError(
        'FORBIDDEN_AUDIT_AUTHORIZATION',
        'Staff audit cryptographic signature or expiration check failed.'
      );
    }

    const pkg = await this.adapter.reconstructPackageForServiceRole(packageId);
    return this.buildStaffReviewProjection(pkg);
  }

  private buildStaffReviewProjection(pkg: CanonicalAssessmentPackage): StaffReviewPackageProjection {
    // Frozen staff-review masking contract: answers remain [REDACTED] (omitted) by default
    const questions: StaffReviewQuestionProjection[] = pkg.canonicalQuestions.map((q: any, qIdx: number) => ({
      canonicalQuestionId: q.canonicalQuestionId,
      logicalFamilyId: q.logicalFamilyId,
      questionIndex: qIdx,
      familyRole: q.familyRole ?? 'PRIMARY',
      synthesizedQuestionType: q.synthesizedQuestionType ?? 'SINGLE_CHOICE',
      canonicalFingerprint: q.canonicalFingerprint ?? '',
      sourceDiscrepancies: Array.isArray(q.sourceDiscrepancies) ? q.sourceDiscrepancies : [],
      representations: (q.representations || []).map((rep: any, repIdx: number) => ({
        representationIndex: repIdx,
        languageScript: rep.languageScript ?? 'und',
        sourcePhysicalInstanceId: rep.sourcePhysicalInstanceId ?? '',
        sourceQuestionNumber: rep.sourceQuestionNumber ?? null,
        stemAST: rep.stemAST ?? rep.stemAst ?? [],
        options: (rep.options || []).map((opt: any, oIdx: number) => ({
          optionId: opt.optionId ?? `opt_${oIdx}`,
          optionIndex: oIdx,
          contentAST: opt.contentAST ?? opt.text ?? [],
        })),
        tables: rep.tables || [],
        diagrams: rep.diagrams || [],
        mathBlocks: rep.mathBlocks || [],
      })),
    }));

    return {
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      validationStatus: pkg.validationReport.validationStatus,
      discrepancyCount: pkg.validationReport.discrepancyCount,
      questions,
      quarantinedRelationshipsCount: pkg.quarantinedRelationships.length,
      projectionTier: 'TIER_2_STAFF_REVIEW',
    };
  }

  /**
   * Tier 1 Projection: Unrestricted Server Core Truth.
   * Privileged internal access only.
   */
  public async getTier1ServerCoreProjection(packageId: string): Promise<CanonicalAssessmentPackage> {
    return this.adapter.reconstructPackageForServiceRole(packageId);
  }

  /**
   * Tier 4 Projection: Student Post-Exam Review.
   * Includes official answer key explanations and scored attempt results.
   */
  public async getTier4PostExamProjection(
    packageId: string,
    securityContext: CandidateProjectionContext,
    attemptEvaluations?: Record<string, { awardedMarks: number; isCorrect: boolean; selectedOptions?: string[] }>
  ): Promise<PostExamPackageProjection> {
    if (!securityContext) {
      throw new ProjectionAuthorizationError(
        'AUTH_CONTEXT_REQUIRED',
        'Tier 4 Post-Exam Projection requires a valid security context. Unauthenticated access is forbidden.'
      );
    }

    if ((securityContext as any).isInternalAudit) {
      throw new ProjectionAuthorizationError(
        'PRIVILEGED_BYPASS_FORBIDDEN',
        'Privileged isInternalAudit bypass is forbidden on post-exam projection gateway. Use getTier4PostExamProjectionForInternalAudit.'
      );
    }

    let targetTenantId: string;
    if ((securityContext as any).isVerifiedCandidateContext === true) {
      targetTenantId = (securityContext as VerifiedCandidateSessionContext).tenantId;
    } else {
      const candidateCtx = securityContext as CandidateProjectionSecurityContext;
      if (!candidateCtx.tenantId || typeof candidateCtx.tenantId !== 'string' || candidateCtx.tenantId.trim() === '') {
        throw new ProjectionAuthorizationError(
          'TENANT_ID_REQUIRED',
          'Post-exam projection requires a verified, non-empty tenantId.'
        );
      }
      targetTenantId = candidateCtx.tenantId;
    }

    const pkg = await this.adapter.reconstructPackageForTenant(packageId, targetTenantId);
    return this.buildPostExamProjection(pkg, attemptEvaluations);
  }

  /**
   * Internal Audit Tier 4 Post-Exam Projection:
   * Dedicated privileged method for testing and offline certification.
   * Requires cryptographically verified VerifiedPrivilegedAuditContext.
   */
  public async getTier4PostExamProjectionForInternalAudit(
    packageId: string,
    auditContext: VerifiedPrivilegedAuditContext,
    attemptEvaluations?: Record<string, { awardedMarks: number; isCorrect: boolean; selectedOptions?: string[] }>
  ): Promise<PostExamPackageProjection> {
    if (typeof window !== 'undefined') {
      throw new ProjectionAuthorizationError(
        'SERVER_ONLY_OPERATION',
        'Privileged internal audit projection methods are strictly restricted to trusted server-side environments.'
      );
    }

    if (!auditContext || (auditContext as any).isVerifiedPrivilegedAudit !== true) {
      throw new ProjectionAuthorizationError(
        'FORBIDDEN_AUDIT_AUTHORIZATION',
        'Privileged post-exam projection requires a cryptographically verified VerifiedPrivilegedAuditContext.'
      );
    }

    if (this.authorizer && !this.authorizer.verifyPrivilegedAuditContext(auditContext)) {
      throw new ProjectionAuthorizationError(
        'FORBIDDEN_AUDIT_AUTHORIZATION',
        'Staff audit cryptographic signature or expiration check failed.'
      );
    }

    const pkg = await this.adapter.reconstructPackageForServiceRole(packageId);
    return this.buildPostExamProjection(pkg, attemptEvaluations);
  }

  private buildPostExamProjection(
    pkg: CanonicalAssessmentPackage,
    attemptEvaluations?: Record<string, { awardedMarks: number; isCorrect: boolean; selectedOptions?: string[] }>
  ): PostExamPackageProjection {
    let totalMarksAwarded = 0;
    const questions: PostExamQuestionProjection[] = pkg.canonicalQuestions.map((q: any, qIdx: number) => {
      const answerHead = pkg.authoritativeAnswers?.[q.canonicalQuestionId]?.authoritativeResolution;
      const attempt = attemptEvaluations ? attemptEvaluations[q.canonicalQuestionId] : undefined;

      if (attempt) {
        totalMarksAwarded += attempt.awardedMarks;
      }

      return {
        canonicalQuestionId: q.canonicalQuestionId,
        logicalFamilyId: q.logicalFamilyId,
        questionIndex: qIdx,
        familyRole: q.familyRole ?? 'PRIMARY',
        synthesizedQuestionType: q.synthesizedQuestionType ?? 'SINGLE_CHOICE',
        representations: (q.representations || []).map((rep: any, repIdx: number) => ({
          representationIndex: repIdx,
          languageScript: rep.languageScript ?? 'und',
          sourcePhysicalInstanceId: rep.sourcePhysicalInstanceId ?? '',
          sourceQuestionNumber: rep.sourceQuestionNumber ?? null,
          stemAST: rep.stemAST ?? rep.stemAst ?? [],
          options: (rep.options || []).map((opt: any, oIdx: number) => ({
            optionId: opt.optionId ?? `opt_${oIdx}`,
            optionIndex: oIdx,
            contentAST: opt.contentAST ?? opt.text ?? [],
          })),
          tables: rep.tables || [],
          diagrams: rep.diagrams || [],
          mathBlocks: rep.mathBlocks || [],
        })),
        authoritativeAnswer: answerHead,
        userAttempt: attempt,
        awardedMarks: attempt?.awardedMarks,
        isCorrect: attempt?.isCorrect,
      };
    });

    return {
      packageId: pkg.packageId,
      totalMarksAwarded,
      questions,
      projectionTier: 'TIER_4_POST_EXAM',
    };
  }
}
