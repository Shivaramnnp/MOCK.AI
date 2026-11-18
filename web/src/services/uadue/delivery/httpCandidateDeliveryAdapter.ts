/**
 * UADUE Phase 3.6D — HTTP Candidate Delivery API Adapter
 * Specification: UADUE-P3.6-HTTP-001 (Remote Gateway Transport)
 *
 * Implements ICandidateDeliveryGateway for deployed staging / real browser environments.
 * Dispatches candidate interactions over HTTPS to the server-side API or Supabase Edge Function:
 * 1. Strict bearer token authentication derived from client auth session (never service_role).
 * 2. Proper JSON payload serialization.
 * 3. Transparent CandidateApiError translation matching server error codes.
 * 4. Network failure propagation for safe client-side queueing.
 */

import type {
  ICandidateDeliveryGateway,
  InitializeSessionRequest,
  InitializeSessionResponse,
  LiveExamProjectionRequest,
  LiveExamProjectionResponse,
  RecordAnswerRequest,
  RecordAnswerResponse,
  SubmitAttemptRequest,
  SubmitAttemptResponse,
  CandidateResultResponse,
  AuthenticatedPrincipal,
} from './candidateDeliveryApi';
import { CandidateApiError } from './deliveryTypes';

export interface HttpDeliveryAdapterConfig {
  baseUrl: string;
  fetchFn?: typeof fetch;
  getAuthToken?: () => string | Promise<string | null> | null;
}

export class HttpCandidateDeliveryAdapter implements ICandidateDeliveryGateway {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly getAuthToken?: () => string | Promise<string | null> | null;

  constructor(config: HttpDeliveryAdapterConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.fetchFn = config.fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (undefined as any));
    this.getAuthToken = config.getAuthToken;

    if (!this.fetchFn) {
      throw new Error('HttpCandidateDeliveryAdapter requires a fetch implementation in the current environment.');
    }
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST',
    body?: unknown,
    auth?: AuthenticatedPrincipal
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Propagate candidate authentication token
    let token = auth?.sessionToken;
    if (!token && this.getAuthToken) {
      const resolved = await this.getAuthToken();
      if (resolved) token = resolved;
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (auth?.authHeader) {
      headers['Authorization'] = auth.authHeader;
    }

    if (auth?.tenantId) {
      headers['X-Tenant-Id'] = auth.tenantId;
    }

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method,
        headers,
        body: method === 'POST' && body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (fetchErr: any) {
      if (fetchErr instanceof CandidateApiError) {
        throw fetchErr;
      }
      const isTimeout =
        fetchErr?.name === 'AbortError' ||
        String(fetchErr?.message || '').toLowerCase().includes('timeout') ||
        fetchErr?.code === 'ETIMEDOUT';
      throw new CandidateApiError(
        isTimeout ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR',
        `Network communication failure: ${fetchErr?.message || String(fetchErr)}`
      );
    }

    if (!res.ok) {
      let errBody: any = null;
      try {
        errBody = await res.json();
      } catch {
        // Non-JSON error response
        throw new CandidateApiError(
          `HTTP_${res.status}`,
          `HTTP request failed with status ${res.status}: ${res.statusText}`
        );
      }

      const code = errBody?.code || `HTTP_${res.status}`;
      const msg = errBody?.message || errBody?.error || res.statusText;
      throw new CandidateApiError(code, msg);
    }

    return (await res.json()) as T;
  }

  public async initializeOrResumeSession(
    req: InitializeSessionRequest,
    auth: AuthenticatedPrincipal
  ): Promise<InitializeSessionResponse> {
    return this.request<InitializeSessionResponse>('/session/init', 'POST', req, auth);
  }

  public async getLiveExamProjection(
    req: LiveExamProjectionRequest,
    auth: AuthenticatedPrincipal
  ): Promise<LiveExamProjectionResponse> {
    return this.request<LiveExamProjectionResponse>(
      `/exam/projection?examSessionId=${encodeURIComponent(req.examSessionId)}`,
      'GET',
      undefined,
      auth
    );
  }

  public async recordAnswerSelection(
    req: RecordAnswerRequest,
    auth: AuthenticatedPrincipal
  ): Promise<RecordAnswerResponse> {
    return this.request<RecordAnswerResponse>('/answer/record', 'POST', req, auth);
  }

  public async pauseSession(
    req: { examSessionId: string },
    auth: AuthenticatedPrincipal
  ): Promise<{ sessionState: 'PAUSED'; remainingSeconds: number }> {
    return this.request<{ sessionState: 'PAUSED'; remainingSeconds: number }>('/session/pause', 'POST', req, auth);
  }

  public async resumeSession(
    req: { examSessionId: string; deviceLeaseId: string },
    auth: AuthenticatedPrincipal
  ): Promise<{ sessionState: 'ACTIVE'; remainingSeconds: number }> {
    return this.request<{ sessionState: 'ACTIVE'; remainingSeconds: number }>('/session/resume', 'POST', req, auth);
  }

  public async submitAttempt(
    req: SubmitAttemptRequest,
    auth: AuthenticatedPrincipal
  ): Promise<SubmitAttemptResponse> {
    return this.request<SubmitAttemptResponse>('/attempt/submit', 'POST', req, auth);
  }

  public async getCandidateResult(
    req: { examSessionId: string },
    auth: AuthenticatedPrincipal
  ): Promise<CandidateResultResponse> {
    return this.request<CandidateResultResponse>(
      `/result?examSessionId=${encodeURIComponent(req.examSessionId)}`,
      'GET',
      undefined,
      auth
    );
  }
}
