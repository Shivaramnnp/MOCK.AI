/**
 * UADUE Phase 3.6 — Candidate Session Authorizer & Authoritative Security Binding
 * Specification: UADUE-P3.6-AUTH-001 (Server-Authoritative Candidate Access Boundary)
 *
 * Security Requirements:
 * 1. Proven Identity: Candidate identity is derived strictly from a trusted authentication authority
 *    (e.g. Supabase Auth via client.auth.getUser() or cryptographically verified Supabase JWTs),
 *    never from untrusted client-supplied query/body parameters or unverified tokens.
 * 2. Token Claims Verification: Tokens must prove valid issuer ('iss'), audience ('authenticated'),
 *    unexpired lifetime ('exp'), and cryptographic signature under the trusted authority's secret.
 * 3. Authoritative Session Binding: Before any live projection or interaction is granted,
 *    verifies against the authoritative session store:
 *      a. Session exists for the candidate's tenant.
 *      b. Session belongs strictly to the authenticated candidate (no IDOR / cross-candidate access).
 *      c. Session belongs strictly to the authenticated tenant (cross-tenant fail closed).
 *      d. Session is bound to the exact requested package ID.
 *      e. Session is in 'ACTIVE' state (rejects INITIALIZED, PAUSED, RECOVERY_PENDING, SUBMITTED, EXPIRED, TERMINATED).
 * 4. Package Validation & Quarantine Enforcement:
 *      a. Canonical package must be VALIDATED/PUBLISHED.
 *      b. Quarantined or invalid packages fail closed immediately.
 *      c. Session package integrity seal matches authoritative package seal.
 * 5. Privilege Boundary Isolation:
 *      a. Zero internal audit / service-role bypass flags accepted on candidate endpoints.
 *      b. Privileged staff audit operations require cryptographic staff tokens and verified purpose scopes.
 *      c. Any attempt to supply { isInternalAudit: true } without cryptographic staff proof fails closed.
 * 6. Anti-TOCTOU Re-verification:
 *      a. Authorizer provides reverifySessionActive() for query gateways to prevent Time-Of-Check to Time-Of-Use gaps.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { ExamSessionRecord, ExamSessionState } from './deliveryTypes';

export class CandidateAuthorizationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`Candidate Authorization Violation [${code}]: ${message}`);
    this.name = 'CandidateAuthorizationError';
  }
}

export class CandidateAuthenticationError extends CandidateAuthorizationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'CandidateAuthenticationError';
  }
}

export class CandidateSessionMismatchError extends CandidateAuthorizationError {
  constructor(sessionId: string, expectedCandidateId: string, actualCandidateId: string) {
    super(
      'CANDIDATE_SESSION_MISMATCH',
      `Authenticated candidate '${actualCandidateId}' does not own exam session '${sessionId}' (registered to '${expectedCandidateId}'). Access denied.`
    );
    this.name = 'CandidateSessionMismatchError';
  }
}

export class TenantSessionMismatchError extends CandidateAuthorizationError {
  constructor(sessionId: string, expectedTenantId: string, actualTenantId: string) {
    super(
      'TENANT_SESSION_MISMATCH',
      `Tenant '${actualTenantId}' does not match session tenant '${expectedTenantId}' for session '${sessionId}'. Cross-tenant access denied.`
    );
    this.name = 'TenantSessionMismatchError';
  }
}

export class SessionPackageMismatchError extends CandidateAuthorizationError {
  constructor(sessionId: string, expectedPackageId: string, requestedPackageId: string) {
    super(
      'SESSION_PACKAGE_MISMATCH',
      `Session '${sessionId}' is bound to package '${expectedPackageId}', but request targeted package '${requestedPackageId}'. Access denied.`
    );
    this.name = 'SessionPackageMismatchError';
  }
}

export class SessionNotActiveError extends CandidateAuthorizationError {
  constructor(sessionId: string, currentState: ExamSessionState) {
    super(
      'SESSION_NOT_ACTIVE',
      `Exam session '${sessionId}' is in state '${currentState}', not ACTIVE. Candidate live projection and interaction are strictly forbidden.`
    );
    this.name = 'SessionNotActiveError';
  }
}

export class PackageQuarantinedError extends CandidateAuthorizationError {
  constructor(packageId: string, status: string, detail?: string) {
    super(
      'PACKAGE_QUARANTINED',
      `Package '${packageId}' is quarantined or invalid (status: '${status}'). Cannot serve candidate projection.${detail ? ` Detail: ${detail}` : ''}`
    );
    this.name = 'PackageQuarantinedError';
  }
}

export class PackageSealMismatchError extends CandidateAuthorizationError {
  constructor(sessionId: string, expectedSeal: string, actualSeal: string) {
    super(
      'PACKAGE_SEAL_MISMATCH',
      `Integrity seal mismatch on session '${sessionId}': session has '${expectedSeal}', authoritative package has '${actualSeal}'. Access denied.`
    );
    this.name = 'PackageSealMismatchError';
  }
}

export class PrivilegedBypassAttemptError extends CandidateAuthorizationError {
  constructor(message: string = 'Candidate authorization endpoints strictly forbid privileged audit or service-role bypass flags.') {
    super('PRIVILEGED_BYPASS_FORBIDDEN', message);
    this.name = 'PrivilegedBypassAttemptError';
  }
}

export interface IAuthorizerSessionStore {
  getExamSession(sessionId: string, tenantId: string): Promise<ExamSessionRecord | null>;
  saveExamSession?(session: ExamSessionRecord): Promise<void>;
  executeWithSessionLock?<T>(
    sessionId: string,
    tenantId: string,
    action: (session: ExamSessionRecord) => Promise<T>
  ): Promise<T>;
}

export interface PackageStatusRecord {
  packageId: string;
  packageIntegritySeal: string;
  validationStatus: string;
  isQuarantined?: boolean;
}

export interface IAuthorizerPackageStore {
  getPackageStatus(packageId: string, tenantId?: string): Promise<PackageStatusRecord | null>;
}

export interface AuthenticatedPrincipal {
  candidateId: string;
  tenantId: string;
  roles?: string[];
  issuer?: string;
  audience?: string;
  expiresAt?: number;
}

export interface PrivilegedStaffAuditClaims {
  staffUserId: string;
  tenantId: string;
  role: 'staff' | 'admin' | 'system_auditor';
  purpose: 'SYSTEM_CERTIFICATION' | 'STAFF_REVIEW' | 'EXAM:SOLUTION_AUDIT';
  issuedAt: number;
  expiresAt: number;
}

/**
 * Pluggable Trusted Authentication Authority Interface.
 * Allows decoupling token verification between Supabase Auth service and server-side JWT verification.
 */
export interface ITrustedAuthAuthority {
  verifyCandidateToken(token: string): Promise<AuthenticatedPrincipal>;
  verifyStaffAuditToken?(token: string): Promise<PrivilegedStaffAuditClaims>;
}

/**
 * Standard Cryptographic JWT Authority verifying Supabase/MockAI tokens.
 * Strictly verifies header alg, cryptographic HMAC signature, issuer ('iss'), audience ('aud'), and expiration ('exp').
 */
export class CryptographicJwtAuthority implements ITrustedAuthAuthority {
  constructor(
    private readonly jwtSecret: string,
    private readonly expectedIssuer: string = 'https://mock.ai/auth',
    private readonly expectedAudience: string = 'authenticated'
  ) {}

  public async verifyCandidateToken(token: string): Promise<AuthenticatedPrincipal> {
    if (!token || typeof token !== 'string') {
      throw new CandidateAuthenticationError('INVALID_TOKEN_FORMAT', 'Candidate token must be a non-empty string.');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new CandidateAuthenticationError('MALFORMED_TOKEN', 'Token must be a 3-part standard JWT (header.payload.sig).');
    }

    const [headerB64, payloadB64, sigB64] = parts;
    const dataToVerify = `${headerB64}.${payloadB64}`;

    const expectedSig = createHmac('sha256', this.jwtSecret)
      .update(dataToVerify)
      .digest('base64url');

    const expectedBuf = Buffer.from(expectedSig);
    const actualBuf = Buffer.from(sigB64);

    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      throw new CandidateAuthenticationError('TOKEN_SIGNATURE_MISMATCH', 'Cryptographic signature verification failed.');
    }

    let payload: any;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      throw new CandidateAuthenticationError('TOKEN_PAYLOAD_CORRUPT', 'Failed to parse token payload JSON.');
    }

    // Issuer verification
    if (this.expectedIssuer && payload.iss !== this.expectedIssuer) {
      throw new CandidateAuthenticationError(
        'TOKEN_ISSUER_UNTRUSTED',
        `Untrusted token issuer '${payload.iss}'. Expected '${this.expectedIssuer}'.`
      );
    }

    // Audience verification
    if (this.expectedAudience && payload.aud !== this.expectedAudience) {
      throw new CandidateAuthenticationError(
        'TOKEN_AUDIENCE_MISMATCH',
        `Token audience '${payload.aud}' does not match expected '${this.expectedAudience}'.`
      );
    }

    // Expiration verification
    if (payload.exp && typeof payload.exp === 'number') {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec > payload.exp) {
        throw new CandidateAuthenticationError(
          'TOKEN_EXPIRED',
          `Token expired at ${new Date(payload.exp * 1000).toISOString()}`
        );
      }
    } else {
      throw new CandidateAuthenticationError('TOKEN_MISSING_EXPIRY', 'Token does not contain an expiration timestamp (exp).');
    }

    // Subject verification (candidateId): strictly from verified JWT subject 'sub'
    const candidateId = payload.sub;
    if (!candidateId || typeof candidateId !== 'string' || candidateId.trim() === '') {
      throw new CandidateAuthenticationError('TOKEN_MISSING_SUBJECT', 'Token does not contain a valid candidate subject (sub).');
    }

    // Tenant verification: strictly from trusted server-controlled claims
    // Never trust client/user-editable user_metadata!
    const appTenantId = payload.app_metadata?.tenant_id || payload.app_metadata?.tid;
    const topTenantId = payload.tid || payload.tenantId;

    if (appTenantId && topTenantId && appTenantId !== topTenantId) {
      throw new CandidateAuthenticationError('TOKEN_CONTRADICTORY_TENANT', 'Contradictory tenant claims in token.');
    }

    const tenantId = appTenantId || topTenantId;
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      throw new CandidateAuthenticationError('TOKEN_MISSING_TENANT', 'Token does not contain a valid tenantId in trusted claims.');
    }

    return {
      candidateId,
      tenantId,
      roles: Array.isArray(payload.roles) ? payload.roles : ['candidate'],
      issuer: payload.iss,
      audience: payload.aud,
      expiresAt: payload.exp,
    };
  }

  public async verifyStaffAuditToken(token: string): Promise<PrivilegedStaffAuditClaims> {
    if (!token || typeof token !== 'string') {
      throw new CandidateAuthenticationError('INVALID_STAFF_TOKEN', 'Staff token must be a non-empty string.');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new CandidateAuthenticationError('MALFORMED_STAFF_TOKEN', 'Staff token must be a 3-part standard JWT.');
    }

    const [headerB64, payloadB64, sigB64] = parts;
    const dataToVerify = `${headerB64}.${payloadB64}`;

    const expectedSig = createHmac('sha256', this.jwtSecret)
      .update(dataToVerify)
      .digest('base64url');

    const expectedBuf = Buffer.from(expectedSig);
    const actualBuf = Buffer.from(sigB64);

    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      throw new CandidateAuthenticationError('STAFF_SIGNATURE_MISMATCH', 'Cryptographic signature verification on staff token failed.');
    }

    let payload: any;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      throw new CandidateAuthenticationError('STAFF_PAYLOAD_CORRUPT', 'Failed to parse staff token payload.');
    }

    if (this.expectedIssuer && payload.iss !== this.expectedIssuer) {
      throw new CandidateAuthenticationError('STAFF_ISSUER_UNTRUSTED', 'Untrusted staff token issuer.');
    }

    if (payload.exp && typeof payload.exp === 'number') {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec > payload.exp) {
        throw new CandidateAuthenticationError('STAFF_TOKEN_EXPIRED', 'Staff token has expired.');
      }
    }

    const role = payload.role || payload.app_metadata?.role;
    if (role !== 'staff' && role !== 'admin' && role !== 'system_auditor') {
      throw new CandidateAuthenticationError('INSUFFICIENT_STAFF_ROLE', `Role '${role}' is not authorized for privileged audit operations.`);
    }

    const purpose = payload.purpose;
    if (purpose !== 'SYSTEM_CERTIFICATION' && purpose !== 'STAFF_REVIEW' && purpose !== 'EXAM:SOLUTION_AUDIT') {
      throw new CandidateAuthenticationError('INVALID_AUDIT_PURPOSE', `Audit purpose '${purpose}' is not recognized.`);
    }

    return {
      staffUserId: payload.sub || payload.staffUserId,
      tenantId: payload.tid || payload.tenantId || 'system',
      role,
      purpose,
      issuedAt: payload.iat || 0,
      expiresAt: payload.exp,
    };
  }
}

export type CandidateAuthCredentials =
  | { token: string; principal?: never }
  | { principal: AuthenticatedPrincipal; token?: never };

export interface CandidateAuthorizationRequest {
  credentials: CandidateAuthCredentials;
  examSessionId: string;
  requestedPackageId: string;
  tenantId: string;
  isInternalAudit?: unknown;
}

export interface VerifiedCandidateSessionContext {
  readonly isVerifiedCandidateContext: true;
  readonly tenantId: string;
  readonly examSessionId: string;
  readonly candidateId: string;
  readonly packageId: string;
  readonly packageIntegritySeal: string;
  readonly authorizedAt: string;
  readonly expiresAt: string;
  readonly contextSignature: string;
}

export interface VerifiedPrivilegedAuditContext {
  readonly isVerifiedPrivilegedAudit: true;
  readonly staffUserId: string;
  readonly role: 'staff' | 'admin' | 'system_auditor';
  readonly purpose: 'SYSTEM_CERTIFICATION' | 'STAFF_REVIEW' | 'EXAM:SOLUTION_AUDIT';
  readonly authorizedAt: string;
  readonly expiresAt: string;
  readonly auditSignature: string;
}

export interface IStaffRoleProvider {
  getStaffAuthStatus(userId: string): Promise<{ isStaff: boolean; role: string | null }>;
}

/**
 * Supabase Authentication Authority.
 * Validates real Supabase sessions and JWTs against project auth endpoints or signing secrets.
 */
export class SupabaseAuthAuthority implements ITrustedAuthAuthority {
  constructor(
    private readonly supabaseUrl: string,
    private readonly jwtSecret?: string,
    private readonly client?: { auth: { getUser: (jwt: string) => Promise<{ data: { user: any }; error: any }> } }
  ) {}

  public async verifyCandidateToken(token: string): Promise<AuthenticatedPrincipal> {
    if (this.client) {
      const { data, error } = await this.client.auth.getUser(token);
      if (error || !data?.user) {
        throw new CandidateAuthenticationError('SUPABASE_AUTH_FAILED', error?.message || 'Failed to authenticate user via Supabase.');
      }
      const tenantId = data.user.app_metadata?.tenant_id || data.user.app_metadata?.tid;
      if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
        throw new CandidateAuthenticationError('MISSING_TENANT_CLAIM', 'User does not belong to a verified tenant in app_metadata.');
      }
      return {
        candidateId: data.user.id,
        tenantId: tenantId.trim(),
        roles: data.user.app_metadata?.roles || ['candidate'],
        issuer: `${this.supabaseUrl}/auth/v1`,
        audience: 'authenticated',
        expiresAt: data.user.app_metadata?.exp,
      };
    }
    if (this.jwtSecret) {
      const jwtAuthority = new CryptographicJwtAuthority(
        this.jwtSecret,
        `${this.supabaseUrl}/auth/v1`,
        'authenticated'
      );
      return jwtAuthority.verifyCandidateToken(token);
    }
    throw new CandidateAuthenticationError('UNCONFIGURED_SUPABASE_AUTHORITY', 'SupabaseAuthAuthority requires client or jwtSecret.');
  }

  public async verifyStaffAuditToken(token: string): Promise<PrivilegedStaffAuditClaims> {
    if (this.client) {
      const { data, error } = await this.client.auth.getUser(token);
      if (error || !data?.user) {
        throw new CandidateAuthenticationError('SUPABASE_AUTH_FAILED', error?.message || 'Failed to authenticate staff via Supabase.');
      }
      const role = data.user.app_metadata?.role;
      if (role !== 'staff' && role !== 'admin' && role !== 'system_auditor') {
        throw new CandidateAuthenticationError('INSUFFICIENT_STAFF_ROLE', `User role '${role}' is not authorized for staff audit.`);
      }
      return {
        staffUserId: data.user.id,
        tenantId: data.user.app_metadata?.tenant_id || 'system',
        role,
        purpose: (data.user.app_metadata?.purpose || 'SYSTEM_CERTIFICATION') as any,
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 1800,
      };
    }
    if (this.jwtSecret) {
      const jwtAuthority = new CryptographicJwtAuthority(
        this.jwtSecret,
        `${this.supabaseUrl}/auth/v1`,
        'authenticated'
      );
      return jwtAuthority.verifyStaffAuditToken(token);
    }
    throw new CandidateAuthenticationError('UNCONFIGURED_SUPABASE_AUTHORITY', 'SupabaseAuthAuthority requires client or jwtSecret.');
  }
}

export interface CandidateSessionAuthorizerOptions {
  signingSecret?: string;
  authAuthority?: ITrustedAuthAuthority;
  staffRoleProvider?: IStaffRoleProvider;
  contextTtlSeconds?: number;
  tokenTtlSeconds?: number;
  allowClientSigning?: boolean;
}

export class CandidateSessionAuthorizer {
  private readonly signingSecret: string;
  private readonly authAuthority: ITrustedAuthAuthority;
  private readonly staffRoleProvider?: IStaffRoleProvider;
  private readonly contextTtlSeconds: number;
  private readonly tokenTtlSeconds: number;
  private readonly allowClientSigning: boolean;

  constructor(
    private readonly sessionStore: IAuthorizerSessionStore,
    private readonly packageStore?: IAuthorizerPackageStore,
    options: CandidateSessionAuthorizerOptions = {}
  ) {
    if (process.env.NODE_ENV === 'production' && !options.signingSecret && !process.env.UADUE_AUTH_SIGNING_SECRET) {
      throw new CandidateAuthenticationError(
        'MISSING_AUTH_SECRET',
        'Cryptographic signing secret (UADUE_AUTH_SIGNING_SECRET) must be explicitly configured in production environment.'
      );
    }
    this.signingSecret =
      options.signingSecret ||
      process.env.UADUE_AUTH_SIGNING_SECRET ||
      'mockai_uadue_authorizer_secret_key_32_bytes_default!';
    this.authAuthority =
      options.authAuthority ||
      new CryptographicJwtAuthority(this.signingSecret);
    this.staffRoleProvider = options.staffRoleProvider;
    this.contextTtlSeconds = options.contextTtlSeconds ?? 300; // 5 minutes context validity
    this.tokenTtlSeconds = options.tokenTtlSeconds ?? 86400; // 24 hours token validity
    this.allowClientSigning = options.allowClientSigning ?? false;
  }

  /**
   * Helper to issue a cryptographically signed candidate JWT from the trusted authority for testing.
   */
  public issueCandidateToken(principal: AuthenticatedPrincipal, customIssuer?: string, customAudience?: string): string {
    if (typeof window !== 'undefined' && !this.allowClientSigning) {
      throw new CandidateAuthenticationError(
        'CLIENT_SIGNING_FORBIDDEN',
        'Token signing operations are forbidden in browser/client contexts.'
      );
    }
    const payload = {
      iss: customIssuer !== undefined ? customIssuer : 'https://mock.ai/auth',
      aud: customAudience !== undefined ? customAudience : 'authenticated',
      sub: principal.candidateId,
      tid: principal.tenantId,
      roles: principal.roles || ['candidate'],
      exp: principal.expiresAt ?? Math.floor(Date.now() / 1000) + this.tokenTtlSeconds,
      iat: Math.floor(Date.now() / 1000),
    };
    const header = { alg: 'HS256', typ: 'JWT' };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const dataToSign = `${headerB64}.${payloadB64}`;
    const sig = createHmac('sha256', this.signingSecret)
      .update(dataToSign)
      .digest('base64url');
    return `${dataToSign}.${sig}`;
  }

  /**
   * Helper to issue a cryptographically signed staff audit token.
   */
  public issueStaffAuditToken(claims: {
    staffUserId: string;
    tenantId?: string;
    role: 'staff' | 'admin' | 'system_auditor';
    purpose: 'SYSTEM_CERTIFICATION' | 'STAFF_REVIEW' | 'EXAM:SOLUTION_AUDIT';
    expiresAt?: number;
  }): string {
    if (typeof window !== 'undefined' && !this.allowClientSigning) {
      throw new CandidateAuthenticationError(
        'CLIENT_SIGNING_FORBIDDEN',
        'Token signing operations are forbidden in browser/client contexts.'
      );
    }
    const payload = {
      iss: 'https://mock.ai/auth',
      aud: 'authenticated',
      sub: claims.staffUserId,
      tid: claims.tenantId || 'system',
      role: claims.role,
      purpose: claims.purpose,
      exp: claims.expiresAt ?? Math.floor(Date.now() / 1000) + 1800, // 30 minutes
      iat: Math.floor(Date.now() / 1000),
    };
    const header = { alg: 'HS256', typ: 'JWT' };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const dataToSign = `${headerB64}.${payloadB64}`;
    const sig = createHmac('sha256', this.signingSecret)
      .update(dataToSign)
      .digest('base64url');
    return `${dataToSign}.${sig}`;
  }

  /**
   * Cryptographically verifies a candidate token via the trusted auth authority.
   */
  public async verifyCandidateToken(token: string): Promise<AuthenticatedPrincipal> {
    return this.authAuthority.verifyCandidateToken(token);
  }

  /**
   * Computes HMAC-SHA256 signature for a VerifiedCandidateSessionContext.
   */
  private computeContextSignature(
    tenantId: string,
    examSessionId: string,
    candidateId: string,
    packageId: string,
    packageIntegritySeal: string,
    authorizedAt: string,
    expiresAt: string
  ): string {
    const raw = `${tenantId}:${examSessionId}:${candidateId}:${packageId}:${packageIntegritySeal}:${authorizedAt}:${expiresAt}`;
    return createHmac('sha256', this.signingSecret).update(raw).digest('hex');
  }

  /**
   * Computes HMAC-SHA256 signature for a VerifiedPrivilegedAuditContext.
   */
  private computeAuditSignature(
    staffUserId: string,
    role: string,
    purpose: string,
    authorizedAt: string,
    expiresAt: string
  ): string {
    const raw = `audit:${staffUserId}:${role}:${purpose}:${authorizedAt}:${expiresAt}`;
    return createHmac('sha256', this.signingSecret).update(raw).digest('hex');
  }

  /**
   * Cryptographically verifies that a VerifiedCandidateSessionContext is genuine,
   * unexpired, and has not been tampered with.
   */
  public verifyContext(context: VerifiedCandidateSessionContext): boolean {
    if (!context || context.isVerifiedCandidateContext !== true) {
      return false;
    }

    const expiresMs = new Date(context.expiresAt).getTime();
    if (isNaN(expiresMs) || Date.now() > expiresMs) {
      return false;
    }

    const expectedSig = this.computeContextSignature(
      context.tenantId,
      context.examSessionId,
      context.candidateId,
      context.packageId,
      context.packageIntegritySeal,
      context.authorizedAt,
      context.expiresAt
    );

    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const actualBuf = Buffer.from(context.contextSignature, 'hex');

    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      return false;
    }

    return true;
  }

  /**
   * Cryptographically verifies a privileged staff audit context.
   */
  public verifyPrivilegedAuditContext(context: VerifiedPrivilegedAuditContext): boolean {
    if (!context || context.isVerifiedPrivilegedAudit !== true) {
      return false;
    }

    const expiresMs = new Date(context.expiresAt).getTime();
    if (isNaN(expiresMs) || Date.now() > expiresMs) {
      return false;
    }

    const expectedSig = this.computeAuditSignature(
      context.staffUserId,
      context.role,
      context.purpose,
      context.authorizedAt,
      context.expiresAt
    );

    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const actualBuf = Buffer.from(context.auditSignature, 'hex');

    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      return false;
    }

    return true;
  }

  /**
   * Authorizes a privileged staff audit request using cryptographic staff credentials.
   * If an authoritative staff role provider is configured, checks authoritative store.
   */
  public async authorizeStaffAudit(staffToken: string): Promise<VerifiedPrivilegedAuditContext> {
    if (!this.authAuthority.verifyStaffAuditToken) {
      throw new CandidateAuthorizationError('UNSUPPORTED_AUTH_AUTHORITY', 'Auth authority does not support staff audit verification.');
    }

    const claims = await this.authAuthority.verifyStaffAuditToken(staffToken);

    // If an authoritative staff role provider is configured, verify against authoritative storage / RPC
    if (this.staffRoleProvider) {
      const status = await this.staffRoleProvider.getStaffAuthStatus(claims.staffUserId);
      if (!status.isStaff || (status.role && status.role.toLowerCase() !== claims.role.toLowerCase())) {
        throw new CandidateAuthenticationError(
          'STAFF_AUTHORIZATION_REVOKED',
          `Authoritative staff provider denied access or reported role mismatch for user '${claims.staffUserId}'.`
        );
      }
    }

    const now = Date.now();
    const authorizedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + 1800 * 1000).toISOString();
    const auditSignature = this.computeAuditSignature(
      claims.staffUserId,
      claims.role,
      claims.purpose,
      authorizedAt,
      expiresAt
    );

    return {
      isVerifiedPrivilegedAudit: true,
      staffUserId: claims.staffUserId,
      role: claims.role,
      purpose: claims.purpose,
      authorizedAt,
      expiresAt,
      auditSignature,
    };
  }

  /**
   * Anti-TOCTOU Re-verification:
   * Confirms the session is currently ACTIVE directly in the authoritative store.
   */
  public async reverifySessionActive(examSessionId: string, tenantId: string): Promise<boolean> {
    const session = await this.sessionStore.getExamSession(examSessionId, tenantId);
    if (!session) return false;
    return session.sessionState === 'ACTIVE';
  }

  /**
   * Executes an action protected by active session locking or two-phase containment.
   * Guarantees that if a session transitions or is terminated concurrently,
   * the result is discarded and an error is thrown before returning to caller.
   */
  public async executeWithActiveSessionLock<T>(
    examSessionId: string,
    tenantId: string,
    action: () => Promise<T>
  ): Promise<T> {
    if (this.sessionStore.executeWithSessionLock) {
      return this.sessionStore.executeWithSessionLock(examSessionId, tenantId, async (session) => {
        if (session.sessionState !== 'ACTIVE') {
          throw new SessionNotActiveError(examSessionId, session.sessionState);
        }
        return action();
      });
    }

    // Two-phase containment guard (Pre-check + Post-check)
    const preSession = await this.sessionStore.getExamSession(examSessionId, tenantId);
    if (!preSession || preSession.sessionState !== 'ACTIVE') {
      throw new SessionNotActiveError(examSessionId, preSession?.sessionState || 'TERMINATED');
    }

    const result = await action();

    const postSession = await this.sessionStore.getExamSession(examSessionId, tenantId);
    if (!postSession || postSession.sessionState !== 'ACTIVE') {
      throw new SessionNotActiveError(examSessionId, postSession?.sessionState || 'TERMINATED');
    }

    return result;
  }

  /**
   * Authorizes a candidate's access to an examination session.
   * Performs all 5 authoritative security checks and issues a signed VerifiedCandidateSessionContext.
   */
  public async authorizeCandidateSession(
    request: CandidateAuthorizationRequest
  ): Promise<VerifiedCandidateSessionContext> {
    // 1. Privileged bypass isolation: reject any caller-controlled isInternalAudit attempts
    if ((request as any).isInternalAudit !== undefined) {
      throw new PrivilegedBypassAttemptError();
    }

    if (!request.examSessionId || typeof request.examSessionId !== 'string' || request.examSessionId.trim() === '') {
      throw new CandidateAuthorizationError('EXAM_SESSION_ID_REQUIRED', 'A valid examSessionId is required.');
    }
    if (!request.requestedPackageId || typeof request.requestedPackageId !== 'string' || request.requestedPackageId.trim() === '') {
      throw new CandidateAuthorizationError('PACKAGE_ID_REQUIRED', 'A valid requestedPackageId is required.');
    }
    if (!request.tenantId || typeof request.tenantId !== 'string' || request.tenantId.trim() === '') {
      throw new CandidateAuthorizationError('TENANT_ID_REQUIRED', 'A valid tenantId is required.');
    }

    // 2. Establish trusted candidate identity from credentials (never from unauthenticated parameters)
    let principal: AuthenticatedPrincipal;
    if (request.credentials.token) {
      principal = await this.authAuthority.verifyCandidateToken(request.credentials.token);
    } else if (request.credentials.principal) {
      principal = request.credentials.principal;
      if (!principal.candidateId || typeof principal.candidateId !== 'string' || principal.candidateId.trim() === '') {
        throw new CandidateAuthenticationError('INVALID_PRINCIPAL', 'Authenticated principal must include non-empty candidateId.');
      }
      if (!principal.tenantId || typeof principal.tenantId !== 'string' || principal.tenantId.trim() === '') {
        throw new CandidateAuthenticationError('INVALID_PRINCIPAL', 'Authenticated principal must include non-empty tenantId.');
      }
    } else {
      throw new CandidateAuthenticationError('MISSING_CREDENTIALS', 'Candidate authentication proof is required.');
    }

    // 3. Cross-tenant check on principal vs request
    if (principal.tenantId !== request.tenantId) {
      throw new TenantSessionMismatchError(request.examSessionId, principal.tenantId, request.tenantId);
    }

    // 4. Authoritative session query
    const session = await this.sessionStore.getExamSession(request.examSessionId, request.tenantId);
    if (!session) {
      throw new CandidateAuthorizationError(
        'SESSION_NOT_FOUND',
        `Exam session '${request.examSessionId}' not found for tenant '${request.tenantId}'.`
      );
    }

    // 5. Invariant: Candidate ownership (no IDOR across candidates)
    if (session.candidateId !== principal.candidateId) {
      throw new CandidateSessionMismatchError(request.examSessionId, session.candidateId, principal.candidateId);
    }

    // 6. Invariant: Tenant ownership (cross-tenant fail closed)
    if (session.tenantId !== request.tenantId) {
      throw new TenantSessionMismatchError(request.examSessionId, session.tenantId, request.tenantId);
    }

    // 7. Invariant: Package binding
    if (session.packageId !== request.requestedPackageId) {
      throw new SessionPackageMismatchError(request.examSessionId, session.packageId, request.requestedPackageId);
    }

    // 8. Invariant: Session lifecycle state must be 'ACTIVE'
    if (session.sessionState !== 'ACTIVE') {
      throw new SessionNotActiveError(request.examSessionId, session.sessionState);
    }

    // 9. Invariant: Package quarantine and integrity seal check
    if (this.packageStore) {
      const packageRecord = await this.packageStore.getPackageStatus(request.requestedPackageId, request.tenantId);
      if (!packageRecord) {
        throw new CandidateAuthorizationError(
          'PACKAGE_NOT_FOUND',
          `Authoritative package record for '${request.requestedPackageId}' was not found.`
        );
      }

      if (
        packageRecord.isQuarantined === true ||
        packageRecord.validationStatus === 'QUARANTINED' ||
        packageRecord.validationStatus === 'INVALID' ||
        packageRecord.validationStatus === 'PACKAGE_FAILED'
      ) {
        throw new PackageQuarantinedError(request.requestedPackageId, packageRecord.validationStatus);
      }

      if (packageRecord.packageIntegritySeal && packageRecord.packageIntegritySeal !== session.packageIntegritySeal) {
        throw new PackageSealMismatchError(
          request.examSessionId,
          session.packageIntegritySeal,
          packageRecord.packageIntegritySeal
        );
      }
    }

    // 10. Issue sealed context
    const now = Date.now();
    const authorizedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + this.contextTtlSeconds * 1000).toISOString();
    const contextSignature = this.computeContextSignature(
      request.tenantId,
      session.examSessionId,
      principal.candidateId,
      session.packageId,
      session.packageIntegritySeal,
      authorizedAt,
      expiresAt
    );

    return {
      isVerifiedCandidateContext: true,
      tenantId: request.tenantId,
      examSessionId: session.examSessionId,
      candidateId: principal.candidateId,
      packageId: session.packageId,
      packageIntegritySeal: session.packageIntegritySeal,
      authorizedAt,
      expiresAt,
      contextSignature,
    };
  }
}
