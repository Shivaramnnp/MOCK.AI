/**
 * UADUE Phase 3.6C — Candidate Delivery API Client (Fail-Closed & Safe Sync)
 * Specification: UADUE-P3.6-CLIENT-002 (Fail-Closed Delivery Gateway)
 *
 * Provides the clean, strongly typed client interface used by CompetitiveExamPlayerScreen
 * to interact with the server-authoritative candidate API boundary:
 * 1. Device lease management: persists a stable client lease identifier in memory/storage
 * 2. Monotonic client event sequence tracking: ensures ordered submission envelopes
 * 3. State reconciliation on page refresh / reconnect
 * 4. Air-gapped question presentation loading
 * 5. Safe client-side queuing & idempotent answer selection dispatch
 * 6. Fail-closed terminal error locking (lease mismatch, expired session, deadline exceeded)
 * 7. Server-authoritative submission with zero unconfirmed answer loss or client scoring bypass
 */

import type {
  ICandidateDeliveryGateway,
  AuthenticatedPrincipal,
  InitializeSessionResponse,
  LiveExamProjectionResponse,
  RecordAnswerResponse,
  SubmitAttemptResponse,
} from './candidateDeliveryApi';
import {
  ExamResultSummary,
} from '../../../types';

export interface PendingAnswerRecord {
  canonicalQuestionId: string;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  enteredValue?: string;
  clientEventId: string;
  clientSequenceNumber: number;
  status: 'PENDING' | 'SYNCED' | 'FAILED_TRANSIENT';
  lastAttemptAt?: number;
  lastError?: string;
}

export interface CandidateClientConfig {
  api: ICandidateDeliveryGateway;
  tenantId: string;
  candidateId: string;
  sessionToken?: string;
  deviceLeaseId?: string;
}

export class CandidateApiClient {
  private api: ICandidateDeliveryGateway;
  private tenantId: string;
  private candidateId: string;
  private sessionToken: string | null = null;
  private deviceLeaseId: string;
  private activeSessionId: string | null = null;
  private packageId: string | null = null;
  private clientSequenceNumber: number = 0;
  private pendingAnswers: Map<string, PendingAnswerRecord> = new Map();
  private terminalError: Error | null = null;

  constructor(config: CandidateClientConfig) {
    this.api = config.api;
    this.tenantId = config.tenantId;
    this.candidateId = config.candidateId;
    this.sessionToken = config.sessionToken || null;
    this.deviceLeaseId =
      config.deviceLeaseId ||
      `lease_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Safe SessionStorage helper: recovers active session credentials from browser memory.
   * Browser storage is treated strictly as a resumption hint, never an authorization source.
   */
  public static getStorageKey(packageId: string, candidateId: string): string {
    return `mockai_auth_session_${packageId}_${candidateId}`;
  }

  public static getStoredSession(
    packageId: string,
    candidateId: string
  ): { examSessionId: string; deviceLeaseId: string } | null {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    try {
      const raw = window.sessionStorage.getItem(CandidateApiClient.getStorageKey(packageId, candidateId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.examSessionId === 'string' && typeof parsed.deviceLeaseId === 'string') {
        return {
          examSessionId: parsed.examSessionId,
          deviceLeaseId: parsed.deviceLeaseId,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  public static storeSession(
    packageId: string,
    candidateId: string,
    examSessionId: string,
    deviceLeaseId: string
  ): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      window.sessionStorage.setItem(
        CandidateApiClient.getStorageKey(packageId, candidateId),
        JSON.stringify({ examSessionId, deviceLeaseId, timestamp: Date.now() })
      );
    } catch {
      // Ignore quota exceptions in private browsing
    }
  }

  public static clearStoredSession(packageId: string, candidateId: string): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      window.sessionStorage.removeItem(CandidateApiClient.getStorageKey(packageId, candidateId));
    } catch {
      // Ignore exceptions
    }
  }

  private getAuthPrincipal(): AuthenticatedPrincipal {
    return {
      candidateId: this.candidateId,
      tenantId: this.tenantId,
      sessionToken: this.sessionToken || undefined,
    };
  }

  /**
   * Distinguishes terminal protocol/authorization failures from transient network faults.
   */
  public static isTerminalError(err: unknown): boolean {
    if (!err) return false;
    const error = err as any;
    const code = String(error.code || '');
    const name = String(error.name || '');
    const message = String(error.message || '');

    const terminalCodes = [
      'LEASE_MISMATCH',
      'DEADLINE_EXCEEDED',
      'SESSION_TERMINAL',
      'SESSION_NOT_ACTIVE',
      'CANDIDATE_SESSION_MISMATCH',
      'TENANT_SESSION_MISMATCH',
      'PACKAGE_QUARANTINED',
      'PACKAGE_SEAL_MISMATCH',
      'PAUSE_LIMIT_EXCEEDED',
      'ILLEGAL_STATE_TRANSITION',
      'SESSION_NOT_FOUND',
      'SESSION_NOT_PAUSED',
      'AUTHORITATIVE_EXAM_PROTECTION',
    ];

    if (terminalCodes.includes(code)) return true;

    const terminalErrorNames = [
      'CandidateAuthorizationError',
      'CandidateAuthenticationError',
      'CandidateSessionMismatchError',
      'TenantSessionMismatchError',
      'SessionNotActiveError',
      'PackageQuarantinedError',
      'PackageSealMismatchError',
    ];

    if (terminalErrorNames.includes(name)) return true;

    for (const termCode of terminalCodes) {
      if (message.includes(termCode)) return true;
    }

    return false;
  }

  /**
   * Initializes or resumes an active exam session for the published package.
   * Leverages sessionStorage hint for recovery across page refreshes.
   */
  public async initializeSession(packageId: string, requestedSessionId?: string): Promise<InitializeSessionResponse> {
    this.packageId = packageId;
    let targetSessionId = requestedSessionId;

    // Session Recovery: check stored session hint if not explicitly provided
    if (!targetSessionId) {
      const stored = CandidateApiClient.getStoredSession(packageId, this.candidateId);
      if (stored) {
        targetSessionId = stored.examSessionId;
        this.deviceLeaseId = stored.deviceLeaseId;
      }
    }

    const auth = this.getAuthPrincipal();
    try {
      const res = await this.api.initializeOrResumeSession(
        {
          packageId,
          deviceLeaseId: this.deviceLeaseId,
          requestedSessionId: targetSessionId,
        },
        auth
      );

      this.activeSessionId = res.examSessionId;
      this.sessionToken = res.sessionToken;
      this.terminalError = null;

      // Safe update to sessionStorage on verified server response
      CandidateApiClient.storeSession(packageId, this.candidateId, res.examSessionId, this.deviceLeaseId);

      return res;
    } catch (err: any) {
      if (CandidateApiClient.isTerminalError(err)) {
        this.terminalError = err instanceof Error ? err : new Error(String(err));
        // Clear stored session upon terminal failure to prevent retry loops on dead session
        CandidateApiClient.clearStoredSession(packageId, this.candidateId);
      }
      throw err;
    }
  }

  /**
   * Loads the air-gapped live presentation paper for the candidate.
   * Guarantees zero answer keys or internal canonical identifiers.
   */
  public async loadLiveExam(sessionId?: string): Promise<LiveExamProjectionResponse> {
    if (this.terminalError) {
      throw this.terminalError;
    }

    const targetSessionId = sessionId || this.activeSessionId;
    if (!targetSessionId) {
      throw new Error('No active exam session initialized.');
    }

    const auth = this.getAuthPrincipal();
    try {
      const res = await this.api.getLiveExamProjection(
        { examSessionId: targetSessionId },
        auth
      );

      this.activeSessionId = targetSessionId;
      return res;
    } catch (err: any) {
      if (CandidateApiClient.isTerminalError(err)) {
        this.terminalError = err instanceof Error ? err : new Error(String(err));
      }
      throw err;
    }
  }

  /**
   * Dispatches an answer selection event to the server-authoritative submission gateway.
   * Safe queueing with stable clientEventId across transient failures.
   */
  public async selectOption(
    canonicalQuestionId: string,
    selectedOptionId: string
  ): Promise<RecordAnswerResponse> {
    if (this.terminalError) {
      throw this.terminalError;
    }
    if (!this.activeSessionId) {
      throw new Error('Cannot record answer: No active exam session.');
    }

    let record = this.pendingAnswers.get(canonicalQuestionId);
    if (
      !record ||
      record.selectedOptionId !== selectedOptionId ||
      record.selectedOptionIds !== undefined ||
      record.enteredValue !== undefined
    ) {
      this.clientSequenceNumber += 1;
      const clientEventId = `evt_${this.candidateId}_${this.clientSequenceNumber}_${Date.now()}`;
      record = {
        canonicalQuestionId,
        selectedOptionId,
        selectedOptionIds: undefined,
        enteredValue: undefined,
        clientEventId,
        clientSequenceNumber: this.clientSequenceNumber,
        status: 'PENDING',
      };
      this.pendingAnswers.set(canonicalQuestionId, record);
    }

    const auth = this.getAuthPrincipal();
    try {
      const res = await this.api.recordAnswerSelection(
        {
          examSessionId: this.activeSessionId,
          canonicalQuestionId: record.canonicalQuestionId,
          selectedOptionId: record.selectedOptionId,
          clientEventId: record.clientEventId,
          clientSequenceNumber: record.clientSequenceNumber,
          deviceLeaseId: this.deviceLeaseId,
        },
        auth
      );
      record.status = 'SYNCED';
      record.lastAttemptAt = Date.now();
      delete record.lastError;
      return res;
    } catch (err: any) {
      record.lastAttemptAt = Date.now();
      record.lastError = err?.message || String(err);
      if (CandidateApiClient.isTerminalError(err)) {
        this.terminalError = err instanceof Error ? err : new Error(String(err));
        throw err;
      }
      record.status = 'FAILED_TRANSIENT';
      throw err;
    }
  }

  /**
   * Dispatches a multiple-selection (MSQ) answer event to the server-authoritative submission gateway.
   * Safe queueing with stable clientEventId across transient failures.
   */
  public async selectMsqOptions(
    canonicalQuestionId: string,
    selectedOptionIds: string[]
  ): Promise<RecordAnswerResponse> {
    if (this.terminalError) {
      throw this.terminalError;
    }
    if (!this.activeSessionId) {
      throw new Error('Cannot record answer: No active exam session.');
    }

    const sortedOptionIds = [...selectedOptionIds].sort();
    if (sortedOptionIds.length === 0) {
      return this.clearOption(canonicalQuestionId);
    }

    let record = this.pendingAnswers.get(canonicalQuestionId);
    const isSame =
      Boolean(record) &&
      Array.isArray(record?.selectedOptionIds) &&
      record!.selectedOptionIds!.length === sortedOptionIds.length &&
      record!.selectedOptionIds!.every((id, i) => id === sortedOptionIds[i]) &&
      record?.selectedOptionId === undefined &&
      record?.enteredValue === undefined;

    if (!record || !isSame) {
      this.clientSequenceNumber += 1;
      const clientEventId = `evt_${this.candidateId}_${this.clientSequenceNumber}_${Date.now()}`;
      record = {
        canonicalQuestionId,
        selectedOptionId: undefined,
        selectedOptionIds: sortedOptionIds,
        enteredValue: undefined,
        clientEventId,
        clientSequenceNumber: this.clientSequenceNumber,
        status: 'PENDING',
      };
      this.pendingAnswers.set(canonicalQuestionId, record);
    }

    const auth = this.getAuthPrincipal();
    try {
      const res = await this.api.recordAnswerSelection(
        {
          examSessionId: this.activeSessionId,
          canonicalQuestionId: record.canonicalQuestionId,
          selectedOptionIds: record.selectedOptionIds,
          clientEventId: record.clientEventId,
          clientSequenceNumber: record.clientSequenceNumber,
          deviceLeaseId: this.deviceLeaseId,
        },
        auth
      );
      record.status = 'SYNCED';
      record.lastAttemptAt = Date.now();
      delete record.lastError;
      return res;
    } catch (err: any) {
      record.lastAttemptAt = Date.now();
      record.lastError = err?.message || String(err);
      if (CandidateApiClient.isTerminalError(err)) {
        this.terminalError = err instanceof Error ? err : new Error(String(err));
        throw err;
      }
      record.status = 'FAILED_TRANSIENT';
      throw err;
    }
  }

  /**
   * Dispatches a numerical value entry (NAT) answer event to the server-authoritative submission gateway.
   * Safe queueing with stable clientEventId across transient failures.
   */
  public async recordNatAnswer(
    canonicalQuestionId: string,
    enteredValue: string
  ): Promise<RecordAnswerResponse> {
    if (this.terminalError) {
      throw this.terminalError;
    }
    if (!this.activeSessionId) {
      throw new Error('Cannot record answer: No active exam session.');
    }

    const trimmed = enteredValue.trim();
    if (trimmed === '') {
      return this.clearOption(canonicalQuestionId);
    }

    let record = this.pendingAnswers.get(canonicalQuestionId);
    const isSame =
      Boolean(record) &&
      record?.enteredValue === trimmed &&
      record?.selectedOptionId === undefined &&
      record?.selectedOptionIds === undefined;

    if (!record || !isSame) {
      this.clientSequenceNumber += 1;
      const clientEventId = `evt_${this.candidateId}_${this.clientSequenceNumber}_${Date.now()}`;
      record = {
        canonicalQuestionId,
        selectedOptionId: undefined,
        selectedOptionIds: undefined,
        enteredValue: trimmed,
        clientEventId,
        clientSequenceNumber: this.clientSequenceNumber,
        status: 'PENDING',
      };
      this.pendingAnswers.set(canonicalQuestionId, record);
    }

    const auth = this.getAuthPrincipal();
    try {
      const res = await this.api.recordAnswerSelection(
        {
          examSessionId: this.activeSessionId,
          canonicalQuestionId: record.canonicalQuestionId,
          enteredValue: record.enteredValue,
          clientEventId: record.clientEventId,
          clientSequenceNumber: record.clientSequenceNumber,
          deviceLeaseId: this.deviceLeaseId,
        },
        auth
      );
      record.status = 'SYNCED';
      record.lastAttemptAt = Date.now();
      delete record.lastError;
      return res;
    } catch (err: any) {
      record.lastAttemptAt = Date.now();
      record.lastError = err?.message || String(err);
      if (CandidateApiClient.isTerminalError(err)) {
        this.terminalError = err instanceof Error ? err : new Error(String(err));
        throw err;
      }
      record.status = 'FAILED_TRANSIENT';
      throw err;
    }
  }

  /**
   * Clears an answer selection event in the server-authoritative submission gateway.
   * Safe queueing with stable clientEventId across transient failures.
   */
  public async clearOption(
    canonicalQuestionId: string
  ): Promise<RecordAnswerResponse> {
    if (this.terminalError) {
      throw this.terminalError;
    }
    if (!this.activeSessionId) {
      throw new Error('Cannot record answer: No active exam session.');
    }

    let record = this.pendingAnswers.get(canonicalQuestionId);
    const isAlreadyCleared =
      Boolean(record) &&
      record?.selectedOptionId === undefined &&
      record?.selectedOptionIds === undefined &&
      record?.enteredValue === undefined;

    if (!record || !isAlreadyCleared) {
      this.clientSequenceNumber += 1;
      const clientEventId = `evt_${this.candidateId}_${this.clientSequenceNumber}_${Date.now()}`;
      record = {
        canonicalQuestionId,
        selectedOptionId: undefined,
        selectedOptionIds: undefined,
        enteredValue: undefined,
        clientEventId,
        clientSequenceNumber: this.clientSequenceNumber,
        status: 'PENDING',
      };
      this.pendingAnswers.set(canonicalQuestionId, record);
    }

    const auth = this.getAuthPrincipal();
    try {
      const res = await this.api.recordAnswerSelection(
        {
          examSessionId: this.activeSessionId,
          canonicalQuestionId: record.canonicalQuestionId,
          selectedOptionId: undefined,
          selectedOptionIds: undefined,
          enteredValue: undefined,
          clientEventId: record.clientEventId,
          clientSequenceNumber: record.clientSequenceNumber,
          deviceLeaseId: this.deviceLeaseId,
        },
        auth
      );
      record.status = 'SYNCED';
      record.lastAttemptAt = Date.now();
      delete record.lastError;
      return res;
    } catch (err: any) {
      record.lastAttemptAt = Date.now();
      record.lastError = err?.message || String(err);
      if (CandidateApiClient.isTerminalError(err)) {
        this.terminalError = err instanceof Error ? err : new Error(String(err));
        throw err;
      }
      record.status = 'FAILED_TRANSIENT';
      throw err;
    }
  }

  /**
   * Flushes all unconfirmed pending answers using their stable event IDs and sequence numbers.
   */
  public async flushPendingAnswers(): Promise<{ synced: number; failed: number }> {
    if (this.terminalError) {
      throw this.terminalError;
    }
    if (!this.activeSessionId) {
      throw new Error('Cannot flush answers: No active exam session.');
    }

    let synced = 0;
    let failed = 0;
    const auth = this.getAuthPrincipal();

    for (const record of this.pendingAnswers.values()) {
      if (record.status !== 'SYNCED') {
        try {
          await this.api.recordAnswerSelection(
            {
              examSessionId: this.activeSessionId,
              canonicalQuestionId: record.canonicalQuestionId,
              selectedOptionId: record.selectedOptionId,
              selectedOptionIds: record.selectedOptionIds,
              enteredValue: record.enteredValue,
              clientEventId: record.clientEventId,
              clientSequenceNumber: record.clientSequenceNumber,
              deviceLeaseId: this.deviceLeaseId,
            },
            auth
          );
          record.status = 'SYNCED';
          record.lastAttemptAt = Date.now();
          delete record.lastError;
          synced += 1;
        } catch (err: any) {
          failed += 1;
          record.lastAttemptAt = Date.now();
          record.lastError = err?.message || String(err);
          if (CandidateApiClient.isTerminalError(err)) {
            this.terminalError = err instanceof Error ? err : new Error(String(err));
            throw err;
          }
        }
      }
    }

    return { synced, failed };
  }

  /**
   * Pauses the active examination session where permitted.
   */
  public async pauseSession(): Promise<{ sessionState: 'PAUSED'; remainingSeconds: number }> {
    if (this.terminalError) {
      throw this.terminalError;
    }
    if (!this.activeSessionId) {
      throw new Error('Cannot pause: No active exam session.');
    }
    const auth = this.getAuthPrincipal();
    try {
      return await this.api.pauseSession({ examSessionId: this.activeSessionId }, auth);
    } catch (err: any) {
      if (CandidateApiClient.isTerminalError(err)) {
        this.terminalError = err instanceof Error ? err : new Error(String(err));
      }
      throw err;
    }
  }

  /**
   * Resumes a paused examination session.
   */
  public async resumeSession(): Promise<{ sessionState: 'ACTIVE'; remainingSeconds: number }> {
    if (this.terminalError) {
      throw this.terminalError;
    }
    if (!this.activeSessionId) {
      throw new Error('Cannot resume: No active exam session.');
    }
    const auth = this.getAuthPrincipal();
    try {
      return await this.api.resumeSession(
        {
          examSessionId: this.activeSessionId,
          deviceLeaseId: this.deviceLeaseId,
        },
        auth
      );
    } catch (err: any) {
      if (CandidateApiClient.isTerminalError(err)) {
        this.terminalError = err instanceof Error ? err : new Error(String(err));
      }
      throw err;
    }
  }

  /**
   * Submits the examination attempt to the server with fail-closed confirmation guarantees.
   * Unsynced pending answers are flushed first; if network connectivity prevents sync,
   * submission fails closed to avoid silent candidate answer loss.
   */
  public async submitExam(): Promise<SubmitAttemptResponse> {
    if (this.terminalError) {
      throw this.terminalError;
    }
    if (!this.activeSessionId) {
      throw new Error('Cannot submit: No active exam session.');
    }

    // Attempt flush if any pending answers remain
    if (this.getPendingAnswersCount() > 0) {
      try {
        await this.flushPendingAnswers();
      } catch (err: any) {
        if (CandidateApiClient.isTerminalError(err)) {
          throw err;
        }
      }
      const remaining = this.getPendingAnswersCount();
      if (remaining > 0) {
        throw new Error(
          `CANNOT_SUBMIT_UNSYNCED_ANSWERS: ${remaining} answer selection(s) are awaiting server confirmation. Check network connection and retry.`
        );
      }
    }

    const auth = this.getAuthPrincipal();
    try {
      const res = await this.api.submitAttempt({ examSessionId: this.activeSessionId }, auth);
      // Clean up sessionStorage upon terminal completion
      if (this.packageId) {
        CandidateApiClient.clearStoredSession(this.packageId, this.candidateId);
      }
      return res;
    } catch (err: any) {
      if (CandidateApiClient.isTerminalError(err)) {
        this.terminalError = err instanceof Error ? err : new Error(String(err));
        if (this.packageId) {
          CandidateApiClient.clearStoredSession(this.packageId, this.candidateId);
        }
      }
      throw err;
    }
  }

  /**
   * Retrieves the authorized raw-score result summary after submission.
   */
  public async getResult(): Promise<ExamResultSummary> {
    if (this.terminalError) {
      throw this.terminalError;
    }
    if (!this.activeSessionId) {
      throw new Error('Cannot retrieve result: No active exam session.');
    }
    const auth = this.getAuthPrincipal();
    try {
      const res = await this.api.getCandidateResult({ examSessionId: this.activeSessionId }, auth);
      return res.result;
    } catch (err: any) {
      if (CandidateApiClient.isTerminalError(err)) {
        this.terminalError = err instanceof Error ? err : new Error(String(err));
      }
      throw err;
    }
  }

  public getPendingAnswersCount(): number {
    let count = 0;
    for (const record of this.pendingAnswers.values()) {
      if (record.status !== 'SYNCED') count++;
    }
    return count;
  }

  public getPendingAnswers(): PendingAnswerRecord[] {
    return Array.from(this.pendingAnswers.values()).filter((r) => r.status !== 'SYNCED');
  }

  public getTerminalError(): Error | null {
    return this.terminalError;
  }

  public hasTerminalError(): boolean {
    return this.terminalError !== null;
  }

  public getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  public getDeviceLeaseId(): string {
    return this.deviceLeaseId;
  }
}
