import {
  ExamPaper,
  ExamTestSession,
  TopicClassificationSource,
  TopicClassificationStatus,
} from '../../types';
import { supabaseService } from '../supabase';
import { isRemoteUser } from '../examSessionService';
import {
  TopicClassificationStore,
  StoredStaffClassification,
} from '../taxonomy/topicClassificationStore';

const SYNC_QUEUE_PREFIX = 'mockai_topic_practice_sync_queue_v1_';
const DEAD_LETTER_PREFIX = 'mockai_topic_practice_dead_letter_v1_';
const CLOUD_TIMEOUT_MS = 5000;
const HYDRATION_PAGE_SIZE = 1000;
const MAX_HYDRATION_PAGES = 50;
export const MAX_SYNC_RETRIES = 5;

export type SyncState = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export interface CloudSyncStatus {
  state: SyncState;
  pendingCount: number;
  deadLetterCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
}

export interface PendingSyncItem {
  id: string;
  kind: 'PRACTICE_PAPER' | 'PRACTICE_HISTORY' | 'STAFF_CLASSIFICATION';
  userId: string;
  payload: any;
  createdAt: number;
  attempts?: number;
  nextRetryAt?: number;
  lastError?: string | null;
}

export interface DeadLetterSyncItem extends PendingSyncItem {
  failedAt: number;
  reason: string;
}

export interface RemotePracticeHistoryRow {
  user_id: string;
  session_id: string;
  paper_id: string;
  exam_id: string;
  subject_id: string;
  testing_mode?: 'TOPIC_PRACTICE';
  selected_topic_ids: string[];
  question_count: number;
  score: number;
  max_score: number;
  accuracy: number;
  time_spent_seconds: number;
  topic_results: Record<string, any>;
  difficulty_results: Record<string, any>;
  attempted_at: string;
}

export interface StaffClassificationRpcParams {
  questionId: string;
  examId: string;
  paperId: string;
  subjectId: string;
  subjectName: string;
  topicId: string | null;
  topicName: string | null;
  subtopicId?: string | null;
  subtopicName?: string | null;
  status: TopicClassificationStatus;
  reviewNotes?: string | null;
  expectedStaffUserId: string;
  expectedUpdatedAt?: number | null;
  clientRequestId?: string;
}

export interface StaffClassificationRpcResult {
  question_id: string;
  classification_status: TopicClassificationStatus;
  classification_source: TopicClassificationSource;
  reviewed_by: string;
  verified_at: string | null;
  updated_at: string;
  audit_id: string;
  deduplicated: boolean;
}

export interface StaffSyncResponse {
  ok: boolean;
  serverResult?: StaffClassificationRpcResult;
  error?: string;
  errorCode?: string;
  permanentFailure?: boolean;
}

export interface HydrationResult {
  loaded: number;
  applied: number;
  pagesFetched: number;
  error: string | null;
}

type SyncStatusListener = (status: CloudSyncStatus) => void;

function withTimeout<T>(promise: PromiseLike<T>, ms: number = CLOUD_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Supabase sync timeout')), ms)
    ),
  ]);
}

function getQueueKey(userId: string): string {
  return `${SYNC_QUEUE_PREFIX}${userId || 'guest'}`;
}

function getDeadLetterKey(userId: string): string {
  return `${DEAD_LETTER_PREFIX}${userId || 'guest'}`;
}

function isPermanentRejectionError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || err.status || '').toUpperCase();
  const msg = String(err.message || '').toUpperCase();
  if (
    code === '42501' || // insufficient_privilege / RLS / FORBIDDEN
    code === '22023' || // invalid_parameter_value
    code === '23514' || // check_violation
    code === '23505' || // unique_violation
    code === '40001' || // serialization_failure / STALE_WRITE_CONFLICT
    code === '400' ||
    code === '401' ||
    code === '403' ||
    code === '409' ||
    code === '422'
  ) {
    return true;
  }
  return (
    msg.includes('FORBIDDEN') ||
    msg.includes('STALE_WRITE_CONFLICT') ||
    msg.includes('INVALID_PARAMETER') ||
    msg.includes('INVALID_STATUS_TRANSITION') ||
    msg.includes('IMMUTABLE_HISTORY') ||
    msg.includes('ROW-LEVEL SECURITY')
  );
}

/**
 * Runtime structural validator for synthetic Topic-wise Practice papers loaded from cloud storage.
 * Rejects malformed, empty, or mismatched payloads before they reach the exam engine.
 */
export function validateCloudExamPaper(
  payload: unknown,
  expectedPaperId?: string
): ExamPaper | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }
  const p = payload as Record<string, any>;

  if (typeof p.id !== 'string' || !p.id.startsWith('practice_') || p.id.length > 160) {
    return undefined;
  }
  if (expectedPaperId && p.id !== expectedPaperId) {
    return undefined;
  }
  if (typeof p.examId !== 'string' || p.examId.trim().length === 0) {
    return undefined;
  }
  if (typeof p.title !== 'string' || p.title.trim().length === 0) {
    return undefined;
  }
  if (!Array.isArray(p.questions) || p.questions.length < 1 || p.questions.length > 200) {
    return undefined;
  }
  if (!Array.isArray(p.sections)) {
    return undefined;
  }
  if (
    !p.markingScheme ||
    typeof p.markingScheme !== 'object' ||
    typeof p.markingScheme.marksPerCorrect !== 'number' ||
    !Number.isFinite(p.markingScheme.marksPerCorrect) ||
    typeof p.markingScheme.negativeMarks !== 'number' ||
    !Number.isFinite(p.markingScheme.negativeMarks)
  ) {
    return undefined;
  }

  for (const q of p.questions) {
    if (!q || typeof q !== 'object') return undefined;
    if (typeof q.id !== 'string' || q.id.trim().length === 0) return undefined;
    if (typeof q.questionText !== 'string') return undefined;
  }

  const normalized: ExamPaper = {
    ...(p as ExamPaper),
    totalQuestions: p.questions.length,
    isTopicPractice: true,
    testingMode: 'TOPIC_PRACTICE',
  };
  return normalized;
}

export class TopicPracticeCloudSync {
  private static listeners: Set<SyncStatusListener> = new Set();
  private static activeFlushEpoch = 0;
  private static isFlushing = false;
  private static currentStatus: CloudSyncStatus = {
    state: 'idle',
    pendingCount: 0,
    deadLetterCount: 0,
    lastSyncedAt: null,
    lastError: null,
  };

  static subscribeToSyncStatus(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.currentStatus);
    return () => {
      this.listeners.delete(listener);
    };
  }

  static getSyncStatus(): CloudSyncStatus {
    return { ...this.currentStatus };
  }

  private static emitStatus(patch: Partial<CloudSyncStatus>, userId?: string): void {
    const pendingCount = userId ? this.getPendingQueue(userId).length : this.currentStatus.pendingCount;
    const deadLetterCount = userId ? this.getDeadLetterQueue(userId).length : this.currentStatus.deadLetterCount;
    this.currentStatus = {
      ...this.currentStatus,
      ...patch,
      pendingCount,
      deadLetterCount,
    };
    this.listeners.forEach((fn) => fn(this.currentStatus));
  }

  /**
   * Abort any in-flight flush operations immediately on logout or account switch.
   */
  static abortActiveFlushes(): void {
    this.activeFlushEpoch++;
    this.isFlushing = false;
    this.emitStatus({ state: 'idle', pendingCount: 0, deadLetterCount: 0, lastError: null });
  }

  /**
   * Strictly verify that the active Supabase Auth session matches the expected userId.
   * Never executes a write or queue flush if unauthenticated or if another user is signed in.
   */
  static async verifyActiveAuthUser(client: any, expectedUserId: string): Promise<boolean> {
    if (!client || !isRemoteUser(expectedUserId)) return false;
    try {
      if (client.auth && typeof client.auth.getUser === 'function') {
        const res: any = await withTimeout(client.auth.getUser(), 3000);
        const uid = res?.data?.user?.id;
        return Boolean(uid && uid === expectedUserId);
      }
      if (client.auth && typeof client.auth.getSession === 'function') {
        const res: any = await withTimeout(client.auth.getSession(), 3000);
        const uid = res?.data?.session?.user?.id;
        return Boolean(uid && uid === expectedUserId);
      }
      return false;
    } catch {
      return false;
    }
  }

  static getPendingQueue(userId: string): PendingSyncItem[] {
    if (typeof localStorage === 'undefined' || !userId) return [];
    try {
      const raw = localStorage.getItem(getQueueKey(userId));
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      // Strictly filter to items belonging to this userId (defense against cross-user corruption)
      return parsed.filter(
        (item: any) =>
          item &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          item.userId === userId
      );
    } catch {
      return [];
    }
  }

  private static setPendingQueue(userId: string, items: PendingSyncItem[]): void {
    if (typeof localStorage === 'undefined' || !userId) return;
    try {
      const scoped = items.filter((item) => item.userId === userId).slice(-50);
      localStorage.setItem(getQueueKey(userId), JSON.stringify(scoped));
    } catch {
      // Non-fatal storage quota fallback
    }
  }

  static getDeadLetterQueue(userId: string): DeadLetterSyncItem[] {
    if (typeof localStorage === 'undefined' || !userId) return [];
    try {
      const raw = localStorage.getItem(getDeadLetterKey(userId));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private static pushDeadLetter(userId: string, item: PendingSyncItem, reason: string): void {
    if (typeof localStorage === 'undefined' || !userId) return;
    try {
      const existing = this.getDeadLetterQueue(userId).filter((d) => d.id !== item.id);
      const entry: DeadLetterSyncItem = {
        ...item,
        failedAt: Date.now(),
        reason,
      };
      localStorage.setItem(getDeadLetterKey(userId), JSON.stringify([entry, ...existing].slice(0, 50)));
    } catch {
      // Non-fatal storage quota fallback
    }
  }

  static enqueuePending(item: PendingSyncItem): void {
    if (!item.userId) return;
    const queue = this.getPendingQueue(item.userId);
    const normalized: PendingSyncItem = {
      ...item,
      attempts: item.attempts ?? 0,
      nextRetryAt: item.nextRetryAt ?? Date.now(),
      lastError: item.lastError ?? null,
    };
    const deduped = [...queue.filter((q) => q.id !== item.id), normalized];
    this.setPendingQueue(item.userId, deduped);
    this.emitStatus({ state: 'offline', lastError: item.lastError ?? null }, item.userId);
  }

  /**
   * Persist a generated synthetic Topic-wise Practice paper to Supabase `topic_practice_papers`
   * using collision-safe composite key (user_id, paper_id) and ignoreDuplicates to prevent stale overwrites.
   */
  static async savePracticePaperRemote(paper: ExamPaper, userId: string): Promise<boolean> {
    if (!isRemoteUser(userId)) return false;
    const validatedPaper = validateCloudExamPaper(paper, paper.id);
    if (!validatedPaper) return false;

    const client = supabaseService.getClient();
    if (!client) return false;

    const payload = {
      user_id: userId,
      paper_id: validatedPaper.id,
      exam_id: validatedPaper.examId,
      subject_id: validatedPaper.selectedSubject || 'general',
      testing_mode: 'TOPIC_PRACTICE' as const,
      selected_topic_ids: validatedPaper.selectedTopics || [],
      question_count: validatedPaper.questions.length,
      is_untimed: Boolean(validatedPaper.isUntimed),
      duration_minutes: validatedPaper.durationMinutes || 0,
      paper_payload: validatedPaper,
    };

    const isAuthed = await this.verifyActiveAuthUser(client, userId);
    if (!isAuthed) {
      this.enqueuePending({
        id: `paper_${validatedPaper.id}`,
        kind: 'PRACTICE_PAPER',
        userId,
        payload,
        createdAt: Date.now(),
        lastError: 'Active session mismatch or signed out',
      });
      return false;
    }

    try {
      const res: any = await withTimeout(
        client
          .from('topic_practice_papers')
          .upsert(payload, { onConflict: 'user_id,paper_id', ignoreDuplicates: true })
      );
      if (res?.error) {
        const msg = res.error.message || 'Failed to persist practice paper to cloud';
        if (isPermanentRejectionError(res.error)) {
          this.pushDeadLetter(
            userId,
            {
              id: `paper_${validatedPaper.id}`,
              kind: 'PRACTICE_PAPER',
              userId,
              payload,
              createdAt: Date.now(),
            },
            msg
          );
          this.emitStatus({ state: 'error', lastError: msg }, userId);
        } else {
          this.enqueuePending({
            id: `paper_${validatedPaper.id}`,
            kind: 'PRACTICE_PAPER',
            userId,
            payload,
            createdAt: Date.now(),
            lastError: msg,
          });
        }
        return false;
      }
      this.emitStatus({ state: 'synced', lastSyncedAt: Date.now(), lastError: null }, userId);
      return true;
    } catch (err: any) {
      this.enqueuePending({
        id: `paper_${validatedPaper.id}`,
        kind: 'PRACTICE_PAPER',
        userId,
        payload,
        createdAt: Date.now(),
        lastError: err?.message || 'Network failure',
      });
      return false;
    }
  }

  /**
   * Fetch and strictly validate a synthetic Topic-wise Practice paper from Supabase.
   * Requires an authenticated userId matching the active session; rejects malformed payloads.
   */
  static async fetchPracticePaperRemote(
    paperId: string,
    userId?: string
  ): Promise<ExamPaper | undefined> {
    if (!paperId.startsWith('practice_')) return undefined;
    if (!userId || !isRemoteUser(userId)) return undefined;
    const client = supabaseService.getClient();
    if (!client) return undefined;

    const isAuthed = await this.verifyActiveAuthUser(client, userId);
    if (!isAuthed) return undefined;

    try {
      const res: any = await withTimeout(
        client
          .from('topic_practice_papers')
          .select('paper_payload')
          .eq('paper_id', paperId)
          .eq('user_id', userId)
          .maybeSingle()
      );
      if (res?.error || !res?.data?.paper_payload) return undefined;
      return validateCloudExamPaper(res.data.paper_payload, paperId);
    } catch {
      return undefined;
    }
  }

  /**
   * Persist a completed Topic-wise Practice attempt into `student_topic_practice_history`
   * using INSERT ... ON CONFLICT (user_id, session_id) DO NOTHING (tamper-resistant & idempotent).
   */
  static async savePracticeHistoryRemote(
    session: ExamTestSession,
    paper: ExamPaper
  ): Promise<boolean> {
    if (!isRemoteUser(session.userId) || !session.result) return false;
    const client = supabaseService.getClient();
    if (!client) return false;

    const resSummary = session.result;
    const payload: RemotePracticeHistoryRow = {
      user_id: session.userId,
      session_id: session.sessionId,
      paper_id: paper.id,
      exam_id: paper.examId,
      subject_id: paper.selectedSubject || 'general',
      testing_mode: 'TOPIC_PRACTICE',
      selected_topic_ids: paper.selectedTopics || [],
      question_count: paper.totalQuestions,
      score: resSummary.totalScore ?? 0,
      max_score: resSummary.maxMarks ?? paper.totalMarks,
      accuracy: resSummary.accuracy ?? 0,
      time_spent_seconds: resSummary.timeSpentSeconds ?? session.elapsedSeconds ?? 0,
      topic_results: resSummary.topicResults || {},
      difficulty_results: resSummary.difficultyResults || {},
      attempted_at: new Date(session.completedAt || Date.now()).toISOString(),
    };

    const isAuthed = await this.verifyActiveAuthUser(client, session.userId);
    if (!isAuthed) {
      this.enqueuePending({
        id: `history_${session.sessionId}`,
        kind: 'PRACTICE_HISTORY',
        userId: session.userId,
        payload,
        createdAt: Date.now(),
        lastError: 'Active session mismatch or signed out',
      });
      return false;
    }

    try {
      const res: any = await withTimeout(
        client
          .from('student_topic_practice_history')
          .upsert(payload, { onConflict: 'user_id,session_id', ignoreDuplicates: true })
      );
      if (res?.error) {
        const msg = res.error.message || 'Failed to persist practice history';
        if (isPermanentRejectionError(res.error)) {
          this.pushDeadLetter(
            session.userId,
            {
              id: `history_${session.sessionId}`,
              kind: 'PRACTICE_HISTORY',
              userId: session.userId,
              payload,
              createdAt: Date.now(),
            },
            msg
          );
          this.emitStatus({ state: 'error', lastError: msg }, session.userId);
        } else {
          this.enqueuePending({
            id: `history_${session.sessionId}`,
            kind: 'PRACTICE_HISTORY',
            userId: session.userId,
            payload,
            createdAt: Date.now(),
            lastError: msg,
          });
        }
        return false;
      }
      this.emitStatus({ state: 'synced', lastSyncedAt: Date.now(), lastError: null }, session.userId);
      return true;
    } catch (err: any) {
      this.enqueuePending({
        id: `history_${session.sessionId}`,
        kind: 'PRACTICE_HISTORY',
        userId: session.userId,
        payload,
        createdAt: Date.now(),
        lastError: err?.message || 'Network failure',
      });
      return false;
    }
  }

  /**
   * Fetch user-scoped practice history from Supabase `student_topic_practice_history`.
   * Returns `{ rows, synced, error }` so callers know whether cloud history is complete or offline.
   */
  static async fetchPracticeHistoryRemote(
    userId: string,
    examId?: string
  ): Promise<{ rows: RemotePracticeHistoryRow[]; synced: boolean; error: string | null }> {
    if (!isRemoteUser(userId)) {
      return { rows: [], synced: false, error: 'Guest/local mode' };
    }
    const client = supabaseService.getClient();
    if (!client) {
      return { rows: [], synced: false, error: 'Cloud client unavailable' };
    }

    const isAuthed = await this.verifyActiveAuthUser(client, userId);
    if (!isAuthed) {
      return { rows: [], synced: false, error: 'Active session mismatch' };
    }

    try {
      let query = client
        .from('student_topic_practice_history')
        .select('*')
        .eq('user_id', userId)
        .order('attempted_at', { ascending: true });
      if (examId) {
        query = query.eq('exam_id', examId);
      }
      const res: any = await withTimeout(query);
      if (res?.error) {
        return { rows: [], synced: false, error: res.error.message || 'Cloud history fetch failed' };
      }
      const rows = Array.isArray(res?.data) ? (res.data as RemotePracticeHistoryRow[]) : [];
      return { rows, synced: true, error: null };
    } catch (err: any) {
      return {
        rows: [],
        synced: false,
        error: err?.message || 'Network timeout loading cloud history',
      };
    }
  }

  /**
   * Execute an atomic staff classification + immutable audit entry via the server-side
   * transactional RPC `staff_record_topic_classification`.
   * Never trusts client-supplied reviewed_by or timestamps.
   */
  static async syncStaffClassificationRemote(
    params: StaffClassificationRpcParams
  ): Promise<StaffSyncResponse> {
    if (!isRemoteUser(params.expectedStaffUserId)) {
      return {
        ok: false,
        error: 'Authenticated staff account required to persist classification decisions.',
        errorCode: 'AUTH_REQUIRED',
        permanentFailure: true,
      };
    }

    const client = supabaseService.getClient();
    if (!client) {
      return {
        ok: false,
        error: 'Supabase client is unavailable.',
        errorCode: 'CLIENT_UNAVAILABLE',
      };
    }

    const isAuthed = await this.verifyActiveAuthUser(client, params.expectedStaffUserId);
    if (!isAuthed) {
      return {
        ok: false,
        error: 'Active Supabase session does not match the staff reviewer account. Please sign in again.',
        errorCode: 'SESSION_MISMATCH',
        permanentFailure: true,
      };
    }

    const requestId =
      params.clientRequestId ||
      `req_${params.questionId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const rpcArgs = {
      p_question_id: params.questionId,
      p_exam_id: params.examId,
      p_source_paper_id: params.paperId,
      p_subject_id: params.subjectId,
      p_subject_name: params.subjectName || params.subjectId,
      p_status: params.status,
      p_topic_id: params.status === 'REJECTED' ? null : params.topicId,
      p_topic_name: params.status === 'REJECTED' ? null : params.topicName,
      p_subtopic_id: params.status === 'REJECTED' ? null : params.subtopicId || null,
      p_subtopic_name: params.status === 'REJECTED' ? null : params.subtopicName || null,
      p_review_notes: (params.reviewNotes || '').trim() || null,
      p_expected_updated_at: params.expectedUpdatedAt
        ? new Date(params.expectedUpdatedAt).toISOString()
        : null,
      p_client_request_id: requestId,
    };

    try {
      const res: any = await withTimeout(
        client.rpc('staff_record_topic_classification', rpcArgs)
      );

      if (res?.error) {
        const permanent = isPermanentRejectionError(res.error);
        const msg = res.error.message || 'Server rejected classification update.';
        this.emitStatus({ state: 'error', lastError: msg }, params.expectedStaffUserId);
        return {
          ok: false,
          error: msg,
          errorCode: res.error.code || undefined,
          permanentFailure: permanent,
        };
      }

      const data = res?.data as StaffClassificationRpcResult | null;
      if (!data || !data.audit_id || !data.reviewed_by) {
        return {
          ok: false,
          error: 'Invalid confirmation returned from classification RPC.',
          errorCode: 'INVALID_RPC_RESPONSE',
        };
      }

      this.emitStatus(
        { state: 'synced', lastSyncedAt: Date.now(), lastError: null },
        params.expectedStaffUserId
      );
      return {
        ok: true,
        serverResult: data,
      };
    } catch (err: any) {
      const msg = err?.message || 'Network error while saving classification.';
      this.emitStatus({ state: 'offline', lastError: msg }, params.expectedStaffUserId);
      return {
        ok: false,
        error: msg,
        errorCode: 'NETWORK_ERROR',
      };
    }
  }

  /**
   * Hydrate authoritative non-PII classification decisions (VERIFIED, REJECTED,
   * PENDING_REVIEW, REVIEW_REQUIRED) from Supabase via `get_public_topic_classifications` RPC
   * with full pagination beyond PostgREST's 1,000-row limit.
   */
  static async hydrateVerifiedClassificationsRemote(examId?: string): Promise<HydrationResult> {
    const client = supabaseService.getClient();
    if (!client) {
      return { loaded: 0, applied: 0, pagesFetched: 0, error: 'Supabase client unavailable' };
    }

    const hydrated: Record<string, StoredStaffClassification> = {};
    let offset = 0;
    let pagesFetched = 0;

    try {
      while (pagesFetched < MAX_HYDRATION_PAGES) {
        const res: any = await withTimeout(
          client.rpc('get_public_topic_classifications', {
            p_exam_id: examId ?? null,
            p_limit: HYDRATION_PAGE_SIZE,
            p_offset: offset,
          })
        );

        if (res?.error) {
          return {
            loaded: Object.keys(hydrated).length,
            applied: 0,
            pagesFetched,
            error: res.error.message || 'Classification hydration failed',
          };
        }

        const page = Array.isArray(res?.data) ? res.data : [];
        pagesFetched++;

        for (const row of page) {
          if (!row || typeof row.question_id !== 'string' || !row.classification_status) continue;
          const serverTs = row.updated_at
            ? new Date(row.updated_at).getTime()
            : row.verified_at
            ? new Date(row.verified_at).getTime()
            : Date.now();
          const isVerified = row.classification_status === 'VERIFIED';

          hydrated[row.question_id] = {
            examId: row.exam_id,
            subjectId: row.subject_id,
            paperId: row.source_paper_id,
            primaryTopicId: isVerified ? row.topic_id || null : null,
            primaryTopicName: isVerified ? row.topic_name || null : null,
            secondaryTopicIds: [],
            secondaryTopicNames: [],
            subtopicId: isVerified ? row.subtopic_id || null : null,
            subtopicName: isVerified ? row.subtopic_name || null : null,
            classificationStatus: row.classification_status as TopicClassificationStatus,
            classificationSource: (row.classification_source || 'STAFF') as TopicClassificationSource,
            confidence: Number(row.confidence ?? (isVerified ? 1.0 : 0)),
            reviewedAt: row.verified_at ? new Date(row.verified_at).getTime() : serverTs,
            serverUpdatedAt: serverTs,
            reviewedBy: null,
            reviewNotes: null,
          };
        }

        if (page.length < HYDRATION_PAGE_SIZE) {
          break;
        }
        offset += page.length;
      }

      const applied = TopicClassificationStore.mergeRemoteOverrides(hydrated);
      return {
        loaded: Object.keys(hydrated).length,
        applied,
        pagesFetched,
        error: null,
      };
    } catch (err: any) {
      return {
        loaded: Object.keys(hydrated).length,
        applied: 0,
        pagesFetched,
        error: err?.message || 'Classification hydration network error',
      };
    }
  }

  /**
   * Flush queued offline sync items strictly for the currently authenticated user.
   * Enforces per-item auth verification, retry limits, exponential backoff,
   * dead-letter quarantine for permanent rejections, and safe abort on account switch.
   */
  static async flushPendingCloudSync(
    userId: string,
    options: { forceRetry?: boolean } = {}
  ): Promise<{ flushed: number; remaining: number; deadLettered: number; aborted: boolean }> {
    const queue = this.getPendingQueue(userId);
    if (queue.length === 0 || !isRemoteUser(userId)) {
      return { flushed: 0, remaining: queue.length, deadLettered: 0, aborted: false };
    }
    const client = supabaseService.getClient();
    if (!client) {
      return { flushed: 0, remaining: queue.length, deadLettered: 0, aborted: false };
    }
    if (this.isFlushing) {
      return { flushed: 0, remaining: queue.length, deadLettered: 0, aborted: true };
    }

    const epoch = ++this.activeFlushEpoch;
    this.isFlushing = true;
    this.emitStatus({ state: 'syncing', lastError: null }, userId);

    const remaining: PendingSyncItem[] = [];
    let flushed = 0;
    let deadLettered = 0;
    let aborted = false;
    const now = Date.now();

    try {
      for (let idx = 0; idx < queue.length; idx++) {
        const item = queue[idx];

        // Abort immediately if logout / account switch occurred mid-flush
        if (epoch !== this.activeFlushEpoch) {
          remaining.push(...queue.slice(idx));
          aborted = true;
          break;
        }

        // Cross-user guard: never flush an item whose payload user_id doesn't match userId
        if (item.userId !== userId) {
          deadLettered++;
          this.pushDeadLetter(userId, item, 'Cross-user queue boundary violation');
          continue;
        }

        // Verify live Supabase session identity before EVERY item write
        const isAuthed = await this.verifyActiveAuthUser(client, userId);
        if (!isAuthed || epoch !== this.activeFlushEpoch) {
          remaining.push(...queue.slice(idx));
          aborted = true;
          break;
        }

        // Respect exponential backoff unless explicitly forced (e.g. online reconnect event)
        if (!options.forceRetry && item.nextRetryAt && item.nextRetryAt > now) {
          remaining.push(item);
          continue;
        }

        const attemptNum = (item.attempts || 0) + 1;

        try {
          let err: any = null;

          if (item.kind === 'PRACTICE_PAPER') {
            if (item.payload?.user_id !== userId) {
              this.pushDeadLetter(userId, item, 'Mismatched user_id in practice paper payload');
              deadLettered++;
              continue;
            }
            const res: any = await withTimeout(
              client
                .from('topic_practice_papers')
                .upsert(item.payload, { onConflict: 'user_id,paper_id', ignoreDuplicates: true })
            );
            err = res?.error || null;
          } else if (item.kind === 'PRACTICE_HISTORY') {
            if (item.payload?.user_id !== userId) {
              this.pushDeadLetter(userId, item, 'Mismatched user_id in practice history payload');
              deadLettered++;
              continue;
            }
            const res: any = await withTimeout(
              client
                .from('student_topic_practice_history')
                .upsert(item.payload, { onConflict: 'user_id,session_id', ignoreDuplicates: true })
            );
            err = res?.error || null;
          } else if (item.kind === 'STAFF_CLASSIFICATION') {
            const res: any = await withTimeout(
              client.rpc('staff_record_topic_classification', item.payload)
            );
            err = res?.error || null;
          } else {
            this.pushDeadLetter(userId, item, `Unknown sync kind: ${String((item as any).kind)}`);
            deadLettered++;
            continue;
          }

          if (!err) {
            flushed++;
          } else if (isPermanentRejectionError(err) || attemptNum >= MAX_SYNC_RETRIES) {
            this.pushDeadLetter(userId, { ...item, attempts: attemptNum }, err.message || 'Permanent sync failure');
            deadLettered++;
          } else {
            const backoffMs = Math.min(60_000, 1000 * Math.pow(2, attemptNum - 1));
            remaining.push({
              ...item,
              attempts: attemptNum,
              nextRetryAt: Date.now() + backoffMs,
              lastError: err.message || 'Transient sync failure',
            });
          }
        } catch (ex: any) {
          const msg = ex?.message || 'Network exception';
          if (attemptNum >= MAX_SYNC_RETRIES) {
            this.pushDeadLetter(userId, { ...item, attempts: attemptNum }, msg);
            deadLettered++;
          } else {
            const backoffMs = Math.min(60_000, 1000 * Math.pow(2, attemptNum - 1));
            remaining.push({
              ...item,
              attempts: attemptNum,
              nextRetryAt: Date.now() + backoffMs,
              lastError: msg,
            });
          }
        }
      }

      this.setPendingQueue(userId, remaining);
      if (aborted) {
        this.emitStatus({ state: 'idle' }, userId);
      } else if (remaining.length === 0 && deadLettered === 0) {
        this.emitStatus({ state: 'synced', lastSyncedAt: Date.now(), lastError: null }, userId);
      } else if (deadLettered > 0) {
        this.emitStatus(
          { state: 'error', lastError: `${deadLettered} item(s) permanently rejected by server.` },
          userId
        );
      } else {
        this.emitStatus(
          { state: 'offline', lastError: remaining[0]?.lastError || 'Pending cloud sync' },
          userId
        );
      }

      return { flushed, remaining: remaining.length, deadLettered, aborted };
    } finally {
      this.isFlushing = false;
    }
  }
}
