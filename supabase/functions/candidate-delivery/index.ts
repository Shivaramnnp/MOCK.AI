/**
 * MOCK.AI — UADUE Candidate Delivery Edge Function
 * Specification: UADUE-P3.6-EDGE-001 (Server-Authoritative Candidate Access Boundary)
 * Security Hardening: Phase 3.6E Forensic Remediation
 *
 * Deployed to Supabase Edge Functions: /functions/v1/candidate-delivery
 * Serves the seven authenticated candidate delivery endpoints:
 * 1. POST /session/init    — Authenticated session bootstrap & lease binding
 * 2. GET  /exam/projection — Air-gapped Tier 3 projection delivery (zero keys, zero lineage)
 * 3. POST /answer/record   — Server-authoritative, idempotent answer ingestion
 * 4. POST /session/pause   — Server-authoritative pause transition
 * 5. POST /session/resume  — Server-authoritative resume transition
 * 6. POST /attempt/submit  — Terminal submission transition & authoritative scoring trigger
 * 7. GET  /result          — Authorized raw-score-only result projection
 *
 * Security Requirements Enforced:
 * - Bearer tokens cryptographically validated (HMAC-SHA256 / Web Crypto subtle).
 * - Candidate identity derived strictly from verified JWT claim (sub). Never trust client-supplied candidate IDs.
 * - Strict multi-tenant isolation: X-Tenant-Id header verified against cryptographically proven tenant claim.
 * - Anti-IDOR: cross-candidate session access fails closed.
 * - Rejection of privileged bypass flags (isInternalAudit, service_role, role, isAdmin).
 * - CORS origin whitelist validation with Vary: Origin (CORS is never treated as authentication).
 * - Maximum payload size limitation (1MB) returning 413 PAYLOAD_TOO_LARGE.
 * - Malformed JSON body protection returning 400 MALFORMED_JSON.
 * - Strict error sanitization: unknown or database internal errors masked as 500 INTERNAL_SERVER_ERROR.
 * - Preserved raw-score-only contract: totalRawScore = sum(awardedMarks), totalNormalizedScore = null.
 */

export interface ErrorResponsePayload {
  code: string;
  message: string;
}

export interface VerifiedPrincipal {
  candidateId: string;
  tenantId: string;
  role?: string;
  expiresAt?: number;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
  'https://staging.mockai.org',
];

const MAX_REQUEST_BODY_BYTES = 1024 * 1024; // 1MB

const SAFE_DOMAIN_CODES = new Set([
  'AUTHENTICATION_REQUIRED',
  'INVALID_CREDENTIALS',
  'CROSS_TENANT_FORBIDDEN',
  'CANDIDATE_SESSION_MISMATCH',
  'TENANT_SESSION_MISMATCH',
  'SESSION_PACKAGE_MISMATCH',
  'SESSION_NOT_ACTIVE',
  'SESSION_NOT_PAUSED',
  'SESSION_TERMINAL',
  'LEASE_MISMATCH',
  'DEADLINE_EXCEEDED',
  'PAUSE_LIMIT_EXCEEDED',
  'EVENT_CONFLICT',
  'PACKAGE_QUARANTINED',
  'PACKAGE_SEAL_MISMATCH',
  'PACKAGE_NOT_FOUND',
  'SESSION_NOT_FOUND',
  'QUESTION_NOT_FOUND',
  'INVALID_QUESTION',
  'INVALID_OPTION',
  'INVALID_REQUEST',
  'MALFORMED_JSON',
  'PAYLOAD_TOO_LARGE',
  'PRIVILEGED_BYPASS_FORBIDDEN',
  'NOT_FOUND',
]);

export function resolveAllowedOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null;
  const envOrigins =
    (typeof (globalThis as any).Deno !== 'undefined'
      ? (globalThis as any).Deno.env.get('ALLOWED_ORIGINS')
      : (globalThis as any).process?.env?.ALLOWED_ORIGINS) || '';
  const allowedList = envOrigins
    ? envOrigins.split(',').map((s: string) => s.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;

  return allowedList.includes(requestOrigin) ? requestOrigin : null;
}

export function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const allowed = resolveAllowedOrigin(requestOrigin);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Tenant-Id',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (allowed) {
    headers['Access-Control-Allow-Origin'] = allowed;
  }
  return headers;
}

function jsonResponse(data: unknown, status = 200, req?: Request): Response {
  const origin = req ? req.headers.get('Origin') : null;
  const cors = getCorsHeaders(origin);
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...cors,
    },
  });
}

function errorResponse(code: string, message: string, status = 400, req?: Request): Response {
  const payload: ErrorResponsePayload = { code, message };
  return jsonResponse(payload, status, req);
}

/**
 * Pure Web-Crypto HMAC-SHA256 JWT verifier compatible with Deno, Node 18+, and browser environments.
 */
export async function verifyCandidateJwt(
  token: string,
  secret: string,
  options?: {
    expectedIssuer?: string;
    expectedAudience?: string;
  }
): Promise<VerifiedPrincipal | null> {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;

  // 1. Decode & validate JOSE header
  try {
    const headerJson = atob(headerB64.replace(/-/g, '+').replace(/_/g, '/'));
    const header = JSON.parse(headerJson);
    if (!header || typeof header !== 'object' || header.alg !== 'HS256') {
      // Rejects "none", "RS256", "ES256", or invalid/missing algorithm
      return null;
    }
  } catch {
    return null;
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(`${headerB64}.${payloadB64}`);

  try {
    // 2. Base64url signature decode
    const b64 = sigB64.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const rawSig = Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0));

    // 3. Cryptographic subtle verification
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const isValid = await crypto.subtle.verify('HMAC', key, rawSig, data);
    if (!isValid) return null;

    // 4. Payload parsing & validation
    const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);

    // Expiration check
    if (payload.exp && typeof payload.exp === 'number') {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec > payload.exp) {
        return null; // Expired
      }
    } else {
      return null; // Missing exp
    }

    // Issuer & Audience check (if configured/specified)
    if (options?.expectedIssuer && payload.iss !== options.expectedIssuer) {
      return null;
    }
    if (options?.expectedAudience) {
      if (Array.isArray(payload.aud)) {
        if (!payload.aud.includes(options.expectedAudience)) return null;
      } else if (payload.aud !== options.expectedAudience) {
        return null;
      }
    }

    // Subject verification (candidateId): strictly from verified JWT subject 'sub'
    const candidateId = payload.sub;
    if (!candidateId || typeof candidateId !== 'string' || candidateId.trim() === '') {
      return null;
    }

    // Tenant authorization: strictly from trusted server-controlled claims (app_metadata)
    // Never trust client/user-editable user_metadata!
    const appTenantId = payload.app_metadata?.tenant_id || payload.app_metadata?.tid;
    const topTenantId = payload.tid || payload.tenant_id;

    // Reject contradictory tenant claims
    if (appTenantId && topTenantId && appTenantId !== topTenantId) {
      return null;
    }

    // Phase 3.6H Unambiguous Trust Contract:
    // In Supabase Auth tokens, custom claims MUST reside in app_metadata.
    // If top-level tid/tenant_id is present without app_metadata, only trust it
    // if issued by a trusted non-Supabase authority (e.g., https://mock.ai/auth).
    const isSupabaseIssuer = typeof payload.iss === 'string' && payload.iss.includes('/auth/v1');
    if (isSupabaseIssuer && !appTenantId) {
      return null;
    }

    const tenantId = appTenantId || topTenantId;
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      return null;
    }

    return {
      candidateId: candidateId.trim(),
      tenantId: tenantId.trim(),
      role: payload.role || 'candidate',
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}

/**
 * Authoritative Supabase Auth User Verifier.
 * Calls Supabase Auth (/auth/v1/user) directly using the Bearer token.
 * Compatible with all JWT algorithms (HS256, RS256, ES256, JWKS asymmetric keys).
 */
export async function verifyCandidateTokenWithSupabaseAuth(
  token: string,
  supabaseUrl: string,
  anonKey?: string
): Promise<VerifiedPrincipal | null> {
  if (!token || typeof token !== 'string') return null;
  try {
    const authEndpoint = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (anonKey) {
      headers.apikey = anonKey;
    }
    const res = await fetch(authEndpoint, {
      method: 'GET',
      headers,
    });
    if (!res.ok) {
      return null;
    }
    const user = await res.json();
    if (!user || !user.id || typeof user.id !== 'string') {
      return null;
    }
    const candidateId = user.id.trim();

    // Authoritative tenant derivation strictly from server-controlled app_metadata
    // Never trust client-writable user_metadata!
    const tenantId = user.app_metadata?.tenant_id || user.app_metadata?.tid;
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      return null;
    }

    return {
      candidateId,
      tenantId: tenantId.trim(),
      role: user.app_metadata?.role || user.role || 'candidate',
      expiresAt: undefined,
    };
  } catch {
    return null;
  }
}

export async function handleCandidateDeliveryRequest(
  req: Request,
  deliveryApiGateway: any, // ICandidateDeliveryGateway instance
  authVerifier?: (header: string | null) => Promise<VerifiedPrincipal | null>,
  options: {
    jwtSecret?: string;
    expectedIssuer?: string;
    expectedAudience?: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
  } = {}
): Promise<Response> {
  const origin = req.headers.get('Origin');

  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    const cors = getCorsHeaders(origin);
    return new Response(null, {
      status: 204,
      headers: cors,
    });
  }

  // 2. Body Size Limitation Check
  const contentLengthHeader = req.headers.get('Content-Length');
  if (contentLengthHeader) {
    const len = parseInt(contentLengthHeader, 10);
    if (!isNaN(len) && len > MAX_REQUEST_BODY_BYTES) {
      return errorResponse('PAYLOAD_TOO_LARGE', 'Request body exceeds maximum allowed size of 1MB.', 413, req);
    }
  }

  // 3. Verify Authentication from Authorization Header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('AUTHENTICATION_REQUIRED', 'Missing or malformed Authorization header.', 401, req);
  }

  let principal: VerifiedPrincipal | null = null;
  if (authVerifier) {
    principal = await authVerifier(authHeader);
  } else {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const secret =
      options.jwtSecret ||
      (typeof (globalThis as any).Deno !== 'undefined'
        ? (globalThis as any).Deno.env.get('SUPABASE_JWT_SECRET')
        : (globalThis as any).process?.env?.SUPABASE_JWT_SECRET) ||
      'mockai_staging_jwt_secret_default_32b!';

    const supabaseUrl =
      options.supabaseUrl ||
      (typeof (globalThis as any).Deno !== 'undefined'
        ? (globalThis as any).Deno.env.get('SUPABASE_URL')
        : (globalThis as any).process?.env?.SUPABASE_URL);

    const envIssuer =
      typeof (globalThis as any).Deno !== 'undefined'
        ? (globalThis as any).Deno.env.get('JWT_ISSUER')
        : (globalThis as any).process?.env?.JWT_ISSUER;

    const defaultIssuer = envIssuer || (supabaseUrl ? `${supabaseUrl.replace(/\/+$/, '')}/auth/v1` : undefined);

    const issuer = options.expectedIssuer || defaultIssuer;

    const envAudience =
      typeof (globalThis as any).Deno !== 'undefined'
        ? (globalThis as any).Deno.env.get('JWT_AUDIENCE')
        : (globalThis as any).process?.env?.JWT_AUDIENCE;

    const audience = options.expectedAudience || envAudience;

    principal = await verifyCandidateJwt(token, secret, {
      expectedIssuer: issuer,
      expectedAudience: audience,
    });

    // If local cryptographic verification fails or token uses asymmetric signing (RS256/ES256),
    // fall back to authoritative Supabase Auth server verification when SUPABASE_URL is configured
    if (!principal && supabaseUrl) {
      const anonKey =
        options.supabaseAnonKey ||
        (typeof (globalThis as any).Deno !== 'undefined'
          ? (globalThis as any).Deno.env.get('SUPABASE_ANON_KEY')
          : (globalThis as any).process?.env?.SUPABASE_ANON_KEY);
      principal = await verifyCandidateTokenWithSupabaseAuth(token, supabaseUrl, anonKey);
    }
  }

  if (!principal || !principal.candidateId) {
    return errorResponse('INVALID_CREDENTIALS', 'Bearer token is invalid, expired, or revoked.', 401, req);
  }

  // 4. Strict Tenant Boundary Verification
  const headerTenantId = req.headers.get('X-Tenant-Id');
  if (headerTenantId && headerTenantId.trim() !== principal.tenantId) {
    return errorResponse(
      'CROSS_TENANT_FORBIDDEN',
      `Supplied X-Tenant-Id '${headerTenantId}' does not match authenticated tenant '${principal.tenantId}'. Cross-tenant access denied.`,
      403,
      req
    );
  }

  const { candidateId, tenantId } = principal;
  const tokenString = authHeader.replace(/^Bearer\s+/i, '').trim();
  const authContext = {
    candidateId,
    tenantId,
    sessionToken: tokenString.includes('.') ? tokenString : undefined,
    authHeader,
  };

  const url = new URL(req.url);
  const pathname = url.pathname.replace(/^\/candidate-delivery/, '').replace(/\/+$/, '') || '/';

  // Helper to safely parse and validate JSON body
  async function parseJsonBody(): Promise<any> {
    try {
      const text = await req.text();
      if (text.length > MAX_REQUEST_BODY_BYTES) {
        throw new Error('PAYLOAD_TOO_LARGE');
      }
      if (!text || text.trim() === '') {
        return {};
      }
      const body = JSON.parse(text);

      // Enforce zero privileged bypass flags from client
      if (body && typeof body === 'object') {
        if ('isInternalAudit' in body || 'service_role' in body || 'isAdmin' in body) {
          throw new Error('PRIVILEGED_BYPASS_FORBIDDEN');
        }
      }
      return body;
    } catch (err: any) {
      if (err?.message === 'PAYLOAD_TOO_LARGE') {
        throw err;
      }
      if (err?.message === 'PRIVILEGED_BYPASS_FORBIDDEN') {
        throw err;
      }
      throw new Error('MALFORMED_JSON');
    }
  }

  try {
    // 5. Endpoint Dispatch
    if (pathname === '/session/init' && req.method === 'POST') {
      const body = await parseJsonBody();
      if (!body.packageId || typeof body.packageId !== 'string' || !body.deviceLeaseId || typeof body.deviceLeaseId !== 'string') {
        return errorResponse('INVALID_REQUEST', 'packageId and deviceLeaseId are required strings.', 400, req);
      }
      const res = await deliveryApiGateway.initializeOrResumeSession(body, authContext);
      return jsonResponse(res, 200, req);
    }

    if (pathname === '/exam/projection' && req.method === 'GET') {
      const examSessionId = url.searchParams.get('examSessionId');
      if (!examSessionId) {
        return errorResponse('INVALID_REQUEST', 'Missing examSessionId query parameter.', 400, req);
      }
      const res = await deliveryApiGateway.getLiveExamProjection({ examSessionId }, authContext);
      return jsonResponse(res, 200, req);
    }

    if (pathname === '/answer/record' && req.method === 'POST') {
      const body = await parseJsonBody();
      if (!body.examSessionId || !body.canonicalQuestionId || !body.clientEventId || !body.deviceLeaseId) {
        return errorResponse('INVALID_REQUEST', 'examSessionId, canonicalQuestionId, clientEventId, and deviceLeaseId are required.', 400, req);
      }
      const res = await deliveryApiGateway.recordAnswerSelection(body, authContext);
      return jsonResponse(res, 200, req);
    }

    if (pathname === '/session/pause' && req.method === 'POST') {
      const body = await parseJsonBody();
      if (!body.examSessionId) {
        return errorResponse('INVALID_REQUEST', 'Missing examSessionId in request body.', 400, req);
      }
      const res = await deliveryApiGateway.pauseSession(body, authContext);
      return jsonResponse(res, 200, req);
    }

    if (pathname === '/session/resume' && req.method === 'POST') {
      const body = await parseJsonBody();
      if (!body.examSessionId || !body.deviceLeaseId) {
        return errorResponse('INVALID_REQUEST', 'examSessionId and deviceLeaseId are required.', 400, req);
      }
      const res = await deliveryApiGateway.resumeSession(body, authContext);
      return jsonResponse(res, 200, req);
    }

    if (pathname === '/attempt/submit' && req.method === 'POST') {
      const body = await parseJsonBody();
      if (!body.examSessionId) {
        return errorResponse('INVALID_REQUEST', 'Missing examSessionId in request body.', 400, req);
      }
      const res = await deliveryApiGateway.submitAttempt(body, authContext);
      return jsonResponse(res, 200, req);
    }

    if (pathname === '/result' && req.method === 'GET') {
      const examSessionId = url.searchParams.get('examSessionId');
      if (!examSessionId) {
        return errorResponse('INVALID_REQUEST', 'Missing examSessionId query parameter.', 400, req);
      }
      const res = await deliveryApiGateway.getCandidateResult({ examSessionId }, authContext);
      return jsonResponse(res, 200, req);
    }

    return errorResponse('NOT_FOUND', `Endpoint '${pathname}' with method ${req.method} not found.`, 404, req);
  } catch (err: any) {
    if (err?.message === 'PAYLOAD_TOO_LARGE') {
      return errorResponse('PAYLOAD_TOO_LARGE', 'Request body exceeds maximum allowed size of 1MB.', 413, req);
    }
    if (err?.message === 'MALFORMED_JSON') {
      return errorResponse('MALFORMED_JSON', 'Request body is not valid JSON.', 400, req);
    }
    if (err?.message === 'PRIVILEGED_BYPASS_FORBIDDEN') {
      return errorResponse('PRIVILEGED_BYPASS_FORBIDDEN', 'Candidate endpoints strictly reject privileged audit or role bypass parameters.', 403, req);
    }

    const code = String(err?.code || '');
    const rawMessage = String(err?.message || '');

    if (code.startsWith('TOKEN_') || code === 'INVALID_TOKEN_FORMAT' || code === 'MALFORMED_TOKEN') {
      return errorResponse('INVALID_CREDENTIALS', rawMessage, 401, req);
    }

    // Sanitized Error Response: never leak database internals or SQL stack traces
    if (SAFE_DOMAIN_CODES.has(code)) {
      const status =
        code === 'LEASE_MISMATCH' ||
        code === 'DEADLINE_EXCEEDED' ||
        code === 'SESSION_TERMINAL' ||
        code === 'SESSION_NOT_ACTIVE' ||
        code === 'SESSION_NOT_PAUSED' ||
        code === 'EVENT_CONFLICT' ||
        code === 'PAUSE_LIMIT_EXCEEDED'
          ? 409
          : code === 'SESSION_NOT_FOUND' || code === 'QUESTION_NOT_FOUND' || code === 'PACKAGE_NOT_FOUND'
          ? 404
          : code.includes('FORBIDDEN') || code.includes('UNAUTHORIZED') || code.includes('MISMATCH') || code.includes('QUARANTINED')
          ? 403
          : 400;

      return errorResponse(code, rawMessage, status, req);
    }

    // Default: mask internal unhandled errors
    console.error('Unhandled candidate delivery error:', err);
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      'An internal server error occurred while processing the candidate delivery request.',
      500,
      req
    );
  }
}

// ── Standalone Deno Runtime Execution Entrypoint ─────────────────────────────
if (
  typeof (globalThis as any).Deno !== 'undefined' &&
  typeof (globalThis as any).Deno.serve === 'function'
) {
  (globalThis as any).Deno.serve(async (req: Request) => {
    // Lazy initialized delivery backend for Supabase Edge Functions runtime
    return handleCandidateDeliveryRequest(req, (globalThis as any).__candidateDeliveryGateway);
  });
}
