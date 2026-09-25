import {
  ExamPaper,
  ExamTestSession,
  ExamSessionStatus,
  QuestionAttemptStatus,
  ExamResultSummary,
} from '../types';
import { supabaseService } from './supabase';

const ACTIVE_LEGACY_KEY = 'mockai_active_exam_session';
const USER_SESSIONS_PREFIX = 'mockai_user_sessions_';

type AutosaveListener = (status: 'saving' | 'saved' | 'error' | 'idle') => void;

export class ExamSessionService {
  private static autosaveTimers: Map<string, NodeJS.Timeout> = new Map();
  private static pendingSessions: Map<string, ExamTestSession> = new Map();
  private static listeners: Set<AutosaveListener> = new Set();
  private static currentStatus: 'saving' | 'saved' | 'error' | 'idle' = 'idle';

  /**
   * Register a listener for autosave status changes (for UI badge updates)
   */
  static subscribeToAutosaveStatus(listener: AutosaveListener): () => void {
    this.listeners.add(listener);
    listener(this.currentStatus);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private static setStatus(status: 'saving' | 'saved' | 'error' | 'idle') {
    this.currentStatus = status;
    this.listeners.forEach((fn) => fn(status));
  }

  /**
   * Helper to retrieve storage key for a user
   */
  private static getStorageKey(userId: string = 'guest'): string {
    return `${USER_SESSIONS_PREFIX}${userId}`;
  }

  /**
   * Helper to read cached sessions from localStorage for a specific user
   */
  static getLocalSessions(userId: string = 'guest'): ExamTestSession[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.getStorageKey(userId));
      if (!raw) return [];
      return JSON.parse(raw) as ExamTestSession[];
    } catch (e) {
      console.warn('Failed to parse local sessions for user:', userId, e);
      return [];
    }
  }

  /**
   * Helper to write cached sessions to localStorage for a specific user
   */
  static setLocalSessions(userId: string = 'guest', sessions: ExamTestSession[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.getStorageKey(userId), JSON.stringify(sessions));
    } catch (e) {
      console.warn('Failed to store local sessions for user:', userId, e);
    }
  }

  /**
   * Initialize a fresh exam test session with authoritative timestamps and metadata.
   */
  static createSession(paper: ExamPaper, userId: string = 'guest'): ExamTestSession {
    const durationMinutes = Number.isFinite(paper.durationMinutes) && paper.durationMinutes > 0 ? paper.durationMinutes : 60;
    const durationSeconds = durationMinutes * 60;
    const now = Date.now();
    const expiresAt = now + durationSeconds * 1000;
    const initialStatuses: Record<number, QuestionAttemptStatus> = {};

    for (let i = 0; i < paper.questions.length; i++) {
      initialStatuses[i] = i === 0 ? 'NOT_ANSWERED' : 'NOT_VISITED';
    }

    const session: ExamTestSession = {
      sessionId: `session_${paper.id}_${now}_${Math.random().toString(36).substring(2, 7)}`,
      paperId: paper.id,
      examId: paper.examId,
      paperTitle: paper.title,
      editionYear: paper.editionYear,
      tier: paper.tier,
      shift: paper.shift,
      examDate: paper.date,
      userId,
      startedAt: now,
      lastSavedAt: now,
      expiresAt,
      completedAt: null,
      status: 'IN_PROGRESS',
      durationSeconds,
      timeRemainingSeconds: durationSeconds,
      elapsedSeconds: 0,
      userAnswers: {},
      userMsqAnswers: {},
      userNatAnswers: {},
      userDescriptiveAnswers: {},
      questionStatuses: initialStatuses,
      currentQuestionIndex: 0,
      currentSectionId: paper.sections[0]?.id || 'english',
      version: 1,
    };

    // Save locally immediately
    this.saveSessionLocal(session);

    // Save to Supabase asynchronously
    this.saveSessionRemote(session).catch((err) => {
      console.warn('Non-fatal: initial remote session save skipped:', err?.message || err);
    });

    return session;
  }

  /**
   * Authoritative calculation of remaining seconds based on expiresAt.
   * Prevents users from getting free time by leaving the page or closing browser.
   */
  static calculateRemainingSeconds(session: ExamTestSession): number {
    if (session.status === 'SUBMITTED' || session.status === 'COMPLETED') {
      return Number.isFinite(session.timeRemainingSeconds) ? Math.max(0, session.timeRemainingSeconds) : 0;
    }

    const now = Date.now();
    let expiresAt = Number(session.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
      // Automatically heal legacy or malformed sessions missing expiresAt
      const durationSecs = Number.isFinite(session.durationSeconds) && session.durationSeconds > 0
        ? session.durationSeconds
        : (Number.isFinite(session.timeRemainingSeconds) && session.timeRemainingSeconds > 0
            ? session.timeRemainingSeconds
            : 3600);
      const started = Number.isFinite(session.startedAt) && session.startedAt > 0
        ? session.startedAt
        : now;
      expiresAt = started + durationSecs * 1000;
      session.expiresAt = expiresAt;
      session.durationSeconds = durationSecs;
    }

    const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
    return Number.isFinite(remaining) ? remaining : 0;
  }

  /**
   * Retrieve active session for a specific paper and user if one exists.
   */
  static getActiveSession(paperId?: string, userId: string = 'guest'): ExamTestSession | null {
    const sessions = this.getLocalSessions(userId);
    const candidate = sessions.find(
      (s) =>
        (s.status === 'IN_PROGRESS' || s.status === 'PAUSED') &&
        (!paperId || s.paperId === paperId)
    );
    if (candidate) {
      const remaining = this.calculateRemainingSeconds(candidate);
      if (remaining <= 0) {
        candidate.status = 'EXPIRED';
        this.saveSessionLocal(candidate);
        return null;
      }
      candidate.timeRemainingSeconds = remaining;
      return candidate;
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(ACTIVE_LEGACY_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw) as ExamTestSession;
        if (session.status !== 'IN_PROGRESS' && session.status !== 'PAUSED') return null;
        if (paperId && session.paperId !== paperId) return null;
        const remaining = this.calculateRemainingSeconds(session);
        if (remaining <= 0) {
          session.status = 'EXPIRED';
          this.saveSessionLocal(session);
          return null;
        }
        session.timeRemainingSeconds = remaining;
        return session;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Save session to local cache (synchronous, reliable, fast).
   */
  static saveSessionLocal(session: ExamTestSession): void {
    const userId = session.userId || 'guest';
    const sessions = this.getLocalSessions(userId);
    const existingIndex = sessions.findIndex((s) => s.sessionId === session.sessionId);

    // Prevent stale autosave from ever overwriting a finalized/submitted session
    if (existingIndex >= 0) {
      const existing = sessions[existingIndex];
      if (
        (existing.status === 'SUBMITTED' || existing.status === 'COMPLETED') &&
        (session.status === 'IN_PROGRESS' || session.status === 'PAUSED')
      ) {
        return;
      }
    }

    let updatedSessions: ExamTestSession[];
    if (existingIndex >= 0) {
      updatedSessions = [...sessions];
      updatedSessions[existingIndex] = session;
    } else {
      updatedSessions = [session, ...sessions];
    }

    this.setLocalSessions(userId, updatedSessions);

    // Also update legacy single-session storage for backwards compatibility
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(ACTIVE_LEGACY_KEY, JSON.stringify(session));
      } catch {}
    }
  }

  /**
   * Save session to Supabase Project 1 (authoritative remote backend with RLS).
   */
  static async saveSessionRemote(session: ExamTestSession): Promise<boolean> {
    const client = supabaseService.getClient();
    if (!client) return false;

    // Skip remote database writes for anonymous demo/guest accounts unless valid UUID
    const isRealUser =
      session.userId &&
      session.userId !== 'guest' &&
      !session.userId.startsWith('demo-') &&
      !session.userId.startsWith('usr-');

    if (!isRealUser) return false;

    try {
      const payload = {
        id: session.sessionId,
        user_id: session.userId,
        paper_id: session.paperId,
        exam_id: session.examId,
        paper_title: session.paperTitle,
        edition_year: session.editionYear || 2025,
        tier: session.tier || '',
        shift: session.shift || '',
        exam_date: session.examDate || '',
        status: session.status,
        current_question_index: session.currentQuestionIndex,
        current_section_id: session.currentSectionId,
        started_at: new Date(session.startedAt).toISOString(),
        last_saved_at: new Date(session.lastSavedAt).toISOString(),
        expires_at: new Date(session.expiresAt).toISOString(),
        duration_seconds: session.durationSeconds,
        time_remaining_seconds: session.timeRemainingSeconds,
        elapsed_seconds: session.elapsedSeconds,
        user_answers: session.userAnswers || {},
        user_msq_answers: session.userMsqAnswers || {},
        user_nat_answers: session.userNatAnswers || {},
        user_descriptive_answers: session.userDescriptiveAnswers || {},
        question_statuses: session.questionStatuses || {},
        result_summary: session.result || null,
        version: session.version,
        updated_at: new Date().toISOString(),
      };

      const { error } = await client.from('user_exam_attempts').upsert(payload);
      if (error) {
        console.warn('Supabase session upsert warning:', error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.warn('Network or Supabase error during remote session save:', err?.message || err);
      return false;
    }
  }

  /**
   * Immediate synchronous + asynchronous save of session state.
   */
  static async saveSession(session: ExamTestSession): Promise<ExamTestSession> {
    const updated: ExamTestSession = {
      ...session,
      lastSavedAt: Date.now(),
      version: (session.version || 1) + 1,
    };

    // 1. Local save immediately
    this.saveSessionLocal(updated);

    // 2. Remote save
    this.setStatus('saving');
    const remoteSuccess = await this.saveSessionRemote(updated);
    if (remoteSuccess) {
      this.setStatus('saved');
    } else {
      // Still saved locally!
      this.setStatus('saved');
    }

    return updated;
  }

  /**
   * Queue debounced autosave (e.g. 600ms debounce on keystrokes/clicks).
   */
  static queueAutosave(session: ExamTestSession): void {
    const sessionId = session.sessionId;
    this.pendingSessions.set(sessionId, session);
    this.setStatus('saving');

    // Clear existing debounce timer for this session
    const existing = this.autosaveTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
    }

    // Always perform local save synchronously right now so refresh never loses state!
    this.saveSessionLocal(session);

    const timer = setTimeout(async () => {
      this.autosaveTimers.delete(sessionId);
      const toSave = this.pendingSessions.get(sessionId);
      if (toSave) {
        this.pendingSessions.delete(sessionId);
        await this.saveSession(toSave);
      }
    }, 600);

    this.autosaveTimers.set(sessionId, timer);
  }

  /**
   * Flush any pending debounced autosave immediately.
   * Call this on question transition, window unload, or Save & Exit!
   */
  static async flushAutosave(): Promise<void> {
    const promises: Promise<any>[] = [];

    this.autosaveTimers.forEach((timer) => clearTimeout(timer));
    this.autosaveTimers.clear();

    for (const [sessionId, session] of this.pendingSessions.entries()) {
      promises.push(this.saveSession(session));
    }
    this.pendingSessions.clear();

    await Promise.all(promises);
  }

  /**
   * Perform "Save & Exit":
   * Sets status to 'PAUSED', saves state authoritatively, flushes pending queues, and returns saved session.
   */
  static async saveAndExit(session: ExamTestSession): Promise<ExamTestSession> {
    // Flush any pending debounced updates first
    await this.flushAutosave();

    const remainingSecs = this.calculateRemainingSeconds(session);
    const pausedSession: ExamTestSession = {
      ...session,
      status: 'PAUSED',
      lastSavedAt: Date.now(),
      timeRemainingSeconds: remainingSecs,
      version: (session.version || 1) + 1,
    };

    this.saveSessionLocal(pausedSession);
    await this.saveSessionRemote(pausedSession);
    this.setStatus('saved');

    return pausedSession;
  }

  /**
   * Resume an existing paused or in-progress session.
   * Recalculates timer, updates status to 'IN_PROGRESS', and persists.
   */
  static async resumeSession(sessionId: string, userId: string = 'guest'): Promise<ExamTestSession | null> {
    const session = await this.getSessionById(sessionId, userId);
    if (!session) return null;

    // Check if session has expired while away
    const remaining = this.calculateRemainingSeconds(session);
    if (remaining <= 0) {
      const expiredSession: ExamTestSession = {
        ...session,
        status: 'EXPIRED',
        timeRemainingSeconds: 0,
      };
      this.saveSessionLocal(expiredSession);
      await this.saveSessionRemote(expiredSession);
      return expiredSession;
    }

    const resumed: ExamTestSession = {
      ...session,
      status: 'IN_PROGRESS',
      timeRemainingSeconds: remaining,
      lastSavedAt: Date.now(),
      version: (session.version || 1) + 1,
    };

    this.saveSessionLocal(resumed);
    await this.saveSessionRemote(resumed);

    return resumed;
  }

  /**
   * Retrieve a specific session by ID (trying remote Supabase first, then local cache).
   */
  static async getSessionById(sessionId: string, userId: string = 'guest'): Promise<ExamTestSession | null> {
    const client = supabaseService.getClient();
    const isRealUser =
      userId &&
      userId !== 'guest' &&
      !userId.startsWith('demo-') &&
      !userId.startsWith('usr-');

    if (client && isRealUser) {
      try {
        const { data, error } = await client
          .from('user_exam_attempts')
          .select('*')
          .eq('id', sessionId)
          .eq('user_id', userId)
          .maybeSingle();

        if (data && !error) {
          const remoteSession: ExamTestSession = {
            sessionId: data.id,
            paperId: data.paper_id,
            examId: data.exam_id,
            paperTitle: data.paper_title || '',
            editionYear: data.edition_year,
            tier: data.tier,
            shift: data.shift,
            examDate: data.exam_date,
            userId: data.user_id,
            startedAt: new Date(data.started_at).getTime(),
            lastSavedAt: new Date(data.last_saved_at).getTime(),
            expiresAt: new Date(data.expires_at).getTime(),
            completedAt: data.completed_at ? new Date(data.completed_at).getTime() : null,
            status: data.status,
            durationSeconds: data.duration_seconds,
            timeRemainingSeconds: data.time_remaining_seconds,
            elapsedSeconds: data.elapsed_seconds,
            userAnswers: data.user_answers || {},
            userMsqAnswers: data.user_msq_answers || {},
            userNatAnswers: data.user_nat_answers || {},
            userDescriptiveAnswers: data.user_descriptive_answers || {},
            questionStatuses: data.question_statuses || {},
            currentQuestionIndex: data.current_question_index || 0,
            currentSectionId: data.current_section_id || '',
            result: data.result_summary || undefined,
            version: data.version || 1,
          };
          this.saveSessionLocal(remoteSession);
          return remoteSession;
        }
      } catch (e) {
        console.warn('Remote getSessionById error:', e);
      }
    }

    // Fallback to local
    const sessions = this.getLocalSessions(userId);
    return sessions.find((s) => s.sessionId === sessionId) || null;
  }

  /**
   * Retrieve all active and paused test sessions for a user (for the Dashboard Continue Test section).
   */
  static async getActiveSessionsForUser(userId: string = 'guest'): Promise<ExamTestSession[]> {
    const activeList: ExamTestSession[] = [];
    const client = supabaseService.getClient();
    const isRealUser =
      userId &&
      userId !== 'guest' &&
      !userId.startsWith('demo-') &&
      !userId.startsWith('usr-');

    // 1. Query remote if authenticated
    if (client && isRealUser) {
      try {
        const { data, error } = await client
          .from('user_exam_attempts')
          .select('*')
          .eq('user_id', userId)
          .in('status', ['IN_PROGRESS', 'PAUSED'])
          .order('last_saved_at', { ascending: false });

        if (data && !error) {
          for (const row of data) {
            const mapped: ExamTestSession = {
              sessionId: row.id,
              paperId: row.paper_id,
              examId: row.exam_id,
              paperTitle: row.paper_title || '',
              editionYear: row.edition_year,
              tier: row.tier,
              shift: row.shift,
              examDate: row.exam_date,
              userId: row.user_id,
              startedAt: new Date(row.started_at).getTime(),
              lastSavedAt: new Date(row.last_saved_at).getTime(),
              expiresAt: new Date(row.expires_at).getTime(),
              completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
              status: row.status,
              durationSeconds: row.duration_seconds,
              timeRemainingSeconds: row.time_remaining_seconds,
              elapsedSeconds: row.elapsed_seconds,
              userAnswers: row.user_answers || {},
              userMsqAnswers: row.user_msq_answers || {},
              userNatAnswers: row.user_nat_answers || {},
              userDescriptiveAnswers: row.user_descriptive_answers || {},
              questionStatuses: row.question_statuses || {},
              currentQuestionIndex: row.current_question_index || 0,
              currentSectionId: row.current_section_id || '',
              result: row.result_summary || undefined,
              version: row.version || 1,
            };
            activeList.push(mapped);
            // Cache locally
            this.saveSessionLocal(mapped);
          }
          return activeList;
        }
      } catch (err) {
        console.warn('Remote getActiveSessionsForUser error, using local fallback:', err);
      }
    }

    // 2. Local fallback
    const local = this.getLocalSessions(userId);
    const valid = local.filter((s) => s.status === 'IN_PROGRESS' || s.status === 'PAUSED');

    // Check expiration for each
    const nonExpired: ExamTestSession[] = [];
    for (const sess of valid) {
      const remaining = this.calculateRemainingSeconds(sess);
      if (remaining <= 0) {
        sess.status = 'EXPIRED';
        this.saveSessionLocal(sess);
      } else {
        sess.timeRemainingSeconds = remaining;
        nonExpired.push(sess);
      }
    }

    return nonExpired.sort((a, b) => b.lastSavedAt - a.lastSavedAt);
  }

  /**
   * Synchronously finalize local session state upon exam submission.
   */
  static submitSessionSync(
    session: ExamTestSession,
    resultSummary: ExamResultSummary
  ): ExamTestSession {
    // Purge any pending autosaves for this session
    const timer = this.autosaveTimers.get(session.sessionId);
    if (timer) {
      clearTimeout(timer);
      this.autosaveTimers.delete(session.sessionId);
    }
    this.pendingSessions.delete(session.sessionId);

    const finalizedSession: ExamTestSession = {
      ...session,
      status: 'COMPLETED',
      completedAt: Date.now(),
      timeRemainingSeconds: 0,
      result: resultSummary,
      version: (session.version || 1) + 1,
    };

    this.saveSessionLocal(finalizedSession);

    if (typeof localStorage !== 'undefined') {
      try {
        const legacy = localStorage.getItem(ACTIVE_LEGACY_KEY);
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (parsed.sessionId === session.sessionId) {
            localStorage.removeItem(ACTIVE_LEGACY_KEY);
          }
        }
      } catch {}
    }

    return finalizedSession;
  }

  /**
   * Finalize and submit an exam test session.
   * Sets status to 'SUBMITTED', marks completedAt, stores results, and cleans up active session.
   */
  static async submitSession(
    session: ExamTestSession,
    resultSummary: ExamResultSummary
  ): Promise<ExamTestSession> {
    // Purge any pending autosaves for this session
    const timer = this.autosaveTimers.get(session.sessionId);
    if (timer) {
      clearTimeout(timer);
      this.autosaveTimers.delete(session.sessionId);
    }
    this.pendingSessions.delete(session.sessionId);

    const finalizedSession: ExamTestSession = {
      ...session,
      status: 'SUBMITTED',
      completedAt: Date.now(),
      timeRemainingSeconds: 0,
      result: resultSummary,
      version: (session.version || 1) + 1,
    };

    // Update local cache
    this.saveSessionLocal(finalizedSession);

    // Update remote Supabase
    await this.saveSessionRemote(finalizedSession);

    // Clear legacy active key
    if (typeof localStorage !== 'undefined') {
      try {
        const legacy = localStorage.getItem(ACTIVE_LEGACY_KEY);
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (parsed.sessionId === session.sessionId) {
            localStorage.removeItem(ACTIVE_LEGACY_KEY);
          }
        }
      } catch {}
    }

    return finalizedSession;
  }

  /**
   * Discard/abandon an in-progress session.
   */
  static async discardSession(sessionId: string, userId: string = 'guest'): Promise<void> {
    const sessions = this.getLocalSessions(userId);
    const updated = sessions.filter((s) => s.sessionId !== sessionId);
    this.setLocalSessions(userId, updated);

    const client = supabaseService.getClient();
    if (client && userId && !userId.startsWith('demo-') && userId !== 'guest') {
      try {
        await client
          .from('user_exam_attempts')
          .update({ status: 'ABANDONED', updated_at: new Date().toISOString() })
          .eq('id', sessionId)
          .eq('user_id', userId);
      } catch (e) {
        console.warn('Failed to mark session abandoned on remote:', e);
      }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const legacy = localStorage.getItem(ACTIVE_LEGACY_KEY);
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (parsed.sessionId === sessionId) {
            localStorage.removeItem(ACTIVE_LEGACY_KEY);
          }
        }
      } catch {}
    }
  }
}
