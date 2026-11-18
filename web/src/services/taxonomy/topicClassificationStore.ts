import { QuestionTopicMetadata, TopicClassificationStatus } from '../../types';

const LEGACY_OVERRIDES_KEY = 'mockai_staff_topic_classifications_v1';
const LEGACY_AUDIT_LOG_KEY = 'mockai_staff_topic_audit_log_v1';
const PUBLIC_OVERRIDES_KEY = 'mockai_public_topic_overrides_v2';
const STAFF_OVERRIDES_PREFIX = 'mockai_staff_topic_classifications_v2_';
const STAFF_AUDIT_LOG_PREFIX = 'mockai_staff_topic_audit_log_v2_';

const FORBIDDEN_REVIEWER_IDS = new Set(['', 'staff', 'guest', 'anonymous', 'unknown', 'admin']);

export interface StaffClassificationAuditEntry {
  id: string;
  questionId: string;
  examId: string;
  paperId: string;
  subjectId: string;
  topicId: string | null;
  topicName: string | null;
  subtopicId: string | null;
  subtopicName: string | null;
  status: TopicClassificationStatus;
  previousStatus: TopicClassificationStatus | null;
  reviewNotes: string;
  reviewedBy: string;
  reviewedAt: number;
}

export interface StoredStaffClassification extends QuestionTopicMetadata {
  examId: string;
  subjectId: string;
  paperId: string;
  /** Authoritative server timestamp (epoch ms) when confirmed by Supabase */
  serverUpdatedAt?: number | null;
}

function isValidStaffReviewerId(reviewerId?: string | null): reviewerId is string {
  if (!reviewerId || typeof reviewerId !== 'string') return false;
  const trimmed = reviewerId.trim();
  if (!trimmed || FORBIDDEN_REVIEWER_IDS.has(trimmed.toLowerCase())) return false;
  return trimmed.length >= 6;
}

function stripSensitiveStaffFields(item: StoredStaffClassification): StoredStaffClassification {
  return {
    examId: item.examId,
    subjectId: item.subjectId,
    paperId: item.paperId,
    primaryTopicId: item.primaryTopicId,
    primaryTopicName: item.primaryTopicName,
    secondaryTopicIds: item.secondaryTopicIds || [],
    secondaryTopicNames: item.secondaryTopicNames || [],
    subtopicId: item.subtopicId ?? null,
    subtopicName: item.subtopicName ?? null,
    classificationStatus: item.classificationStatus,
    classificationSource: item.classificationSource,
    confidence: item.confidence,
    reviewedAt: item.reviewedAt ?? null,
    serverUpdatedAt: item.serverUpdatedAt ?? item.reviewedAt ?? null,
    // Strictly omit reviewedBy and reviewNotes from non-staff/public storage
    reviewedBy: null,
    reviewNotes: null,
  };
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('Failed to persist classification store data:', err);
  }
}

function getStaffOverridesKey(staffUserId: string): string {
  return `${STAFF_OVERRIDES_PREFIX}${staffUserId}`;
}

function getStaffAuditLogKey(staffUserId: string): string {
  return `${STAFF_AUDIT_LOG_PREFIX}${staffUserId}`;
}

export class TopicClassificationStore {
  private static publicCache: Record<string, StoredStaffClassification> | null = null;
  private static activeStaffUserId: string | null = null;
  private static staffCache: Record<string, StoredStaffClassification> | null = null;

  /**
   * Bind the active authenticated staff user namespace.
   * Switching users clears any prior in-memory staff cache immediately.
   */
  static setActiveStaffUser(staffUserId: string | null): void {
    const normalized = isValidStaffReviewerId(staffUserId) ? staffUserId.trim() : null;
    if (this.activeStaffUserId !== normalized) {
      this.activeStaffUserId = normalized;
      this.staffCache = null;
    }
  }

  static getActiveStaffUser(): string | null {
    return this.activeStaffUserId;
  }

  /**
   * Clear sensitive staff notes, reviewer IDs, and audit logs from memory and localStorage
   * on logout or account switch so no private staff data leaks to another account.
   */
  static clearSensitiveSessionState(staffUserId?: string | null): void {
    const targetIds = new Set<string>();
    if (this.activeStaffUserId) targetIds.add(this.activeStaffUserId);
    if (staffUserId && staffUserId.trim()) targetIds.add(staffUserId.trim());

    this.activeStaffUserId = null;
    this.staffCache = null;

    if (typeof localStorage === 'undefined') return;
    try {
      // Remove legacy unscoped keys if present
      localStorage.removeItem(LEGACY_OVERRIDES_KEY);
      localStorage.removeItem(LEGACY_AUDIT_LOG_KEY);

      // Remove specific staff keys and any residual staff-scoped keys on sign-out
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (
          k.startsWith(STAFF_OVERRIDES_PREFIX) ||
          k.startsWith(STAFF_AUDIT_LOG_PREFIX)
        ) {
          if (
            targetIds.size === 0 ||
            Array.from(targetIds).some((id) => k.endsWith(`_${id}`))
          ) {
            keysToRemove.push(k);
          }
        }
      }
      for (const k of keysToRemove) {
        localStorage.removeItem(k);
      }
    } catch {
      // Non-fatal storage cleanup
    }
  }

  private static loadPublicOverrides(): Record<string, StoredStaffClassification> {
    if (this.publicCache) return this.publicCache;
    this.publicCache = readJson<Record<string, StoredStaffClassification>>(PUBLIC_OVERRIDES_KEY, {});
    return this.publicCache;
  }

  private static loadStaffOverrides(staffUserId?: string | null): Record<string, StoredStaffClassification> {
    const effectiveStaff = isValidStaffReviewerId(staffUserId)
      ? staffUserId.trim()
      : this.activeStaffUserId;
    if (!effectiveStaff) return {};

    if (effectiveStaff === this.activeStaffUserId && this.staffCache) {
      return this.staffCache;
    }

    const loaded = readJson<Record<string, StoredStaffClassification>>(
      getStaffOverridesKey(effectiveStaff),
      {}
    );
    if (effectiveStaff === this.activeStaffUserId) {
      this.staffCache = loaded;
    }
    return loaded;
  }

  /**
   * Resolve authoritative override for a question.
   * - Students / anon receive ONLY PII-stripped public authoritative overrides.
   * - Active staff additionally see their own scoped review notes when matching or newer.
   */
  static getOverride(questionId?: string, staffUserId?: string | null): StoredStaffClassification | null {
    if (!questionId) return null;
    const publicOverride = this.loadPublicOverrides()[questionId] || null;
    const staffOverride = this.loadStaffOverrides(staffUserId)[questionId] || null;

    if (!publicOverride && !staffOverride) return null;
    if (!staffOverride) return publicOverride;
    if (!publicOverride) return staffOverride;

    const pubTs = publicOverride.serverUpdatedAt || publicOverride.reviewedAt || 0;
    const staffTs = staffOverride.serverUpdatedAt || staffOverride.reviewedAt || 0;

    // Authoritative remote/public update wins whenever it is strictly newer than staff cache
    if (pubTs > staffTs) {
      return publicOverride;
    }
    return staffOverride;
  }

  /**
   * Persist a staff classification decision in the staff-scoped store AND update
   * the PII-free public override cache so student pools reflect approvals/rejections immediately.
   * Rejects placeholder identities such as 'staff' or 'guest'.
   */
  static saveStaffDecision(params: {
    questionId: string;
    examId: string;
    paperId: string;
    subjectId: string;
    topicId: string | null;
    topicName: string | null;
    subtopicId?: string | null;
    subtopicName?: string | null;
    status: TopicClassificationStatus;
    previousStatus?: TopicClassificationStatus | null;
    reviewNotes?: string;
    reviewedBy: string;
    reviewedAt?: number;
    auditId?: string;
    mirrorToPublic?: boolean;
  }): { metadata: StoredStaffClassification; auditEntry: StaffClassificationAuditEntry } {
    if (!isValidStaffReviewerId(params.reviewedBy)) {
      throw new Error(
        'STAFF_AUTH_REQUIRED: An authenticated staff user ID is required to record classification decisions.'
      );
    }

    const staffId = params.reviewedBy.trim();
    const now = params.reviewedAt ?? Date.now();
    const trimmedNotes = (params.reviewNotes || '').trim();

    if (params.status === 'VERIFIED' && (!params.topicId || params.topicId === 'uncategorized')) {
      throw new Error('Cannot verify a question without assigning a canonical syllabus topic.');
    }

    const metadata: StoredStaffClassification = {
      examId: params.examId,
      subjectId: params.subjectId,
      paperId: params.paperId,
      primaryTopicId: params.status === 'REJECTED' ? null : params.topicId,
      primaryTopicName: params.status === 'REJECTED' ? null : params.topicName,
      secondaryTopicIds: [],
      secondaryTopicNames: [],
      subtopicId: params.status === 'REJECTED' ? null : params.subtopicId || null,
      subtopicName: params.status === 'REJECTED' ? null : params.subtopicName || null,
      classificationStatus: params.status,
      classificationSource: 'STAFF',
      confidence: params.status === 'VERIFIED' ? 1.0 : 0,
      reviewedBy: staffId,
      reviewedAt: now,
      serverUpdatedAt: now,
      reviewNotes: trimmedNotes || null,
    };

    // 1. Store full staff decision (with notes & reviewerId) strictly under staff-scoped key
    this.setActiveStaffUser(staffId);
    const staffAll = { ...this.loadStaffOverrides(staffId), [params.questionId]: metadata };
    this.staffCache = staffAll;
    writeJson(getStaffOverridesKey(staffId), staffAll);

    // 2. Mirror PII-stripped decision into public override cache when approved/confirmed
    if (params.mirrorToPublic !== false) {
      const publicAll = {
        ...this.loadPublicOverrides(),
        [params.questionId]: stripSensitiveStaffFields(metadata),
      };
      this.publicCache = publicAll;
      writeJson(PUBLIC_OVERRIDES_KEY, publicAll);
    }

    const auditEntry: StaffClassificationAuditEntry = {
      id: params.auditId || `audit_${params.questionId}_${now}_${Math.random().toString(36).slice(2, 6)}`,
      questionId: params.questionId,
      examId: params.examId,
      paperId: params.paperId,
      subjectId: params.subjectId,
      topicId: metadata.primaryTopicId,
      topicName: metadata.primaryTopicName,
      subtopicId: metadata.subtopicId || null,
      subtopicName: metadata.subtopicName || null,
      status: params.status,
      previousStatus: params.previousStatus || null,
      reviewNotes: trimmedNotes,
      reviewedBy: staffId,
      reviewedAt: now,
    };

    const existingLog = readJson<StaffClassificationAuditEntry[]>(getStaffAuditLogKey(staffId), []);
    const updatedLog = [auditEntry, ...existingLog].slice(0, 500);
    writeJson(getStaffAuditLogKey(staffId), updatedLog);

    return { metadata, auditEntry };
  }

  /**
   * Read staff-scoped audit log entries. Never returns another staff member's or unscoped entries.
   */
  static getAuditLog(questionId?: string, staffUserId?: string | null): StaffClassificationAuditEntry[] {
    const effectiveStaff = isValidStaffReviewerId(staffUserId)
      ? staffUserId.trim()
      : this.activeStaffUserId;
    if (!effectiveStaff) return [];
    const log = readJson<StaffClassificationAuditEntry[]>(getStaffAuditLogKey(effectiveStaff), []);
    if (!questionId) return log;
    return log.filter((entry) => entry.questionId === questionId);
  }

  /**
   * Merge authoritative remote public classification overrides (VERIFIED, REJECTED,
   * PENDING_REVIEW, REVIEW_REQUIRED) from Supabase into the PII-free public override store.
   * Authoritative newer server timestamps always supersede stale local entries.
   */
  static mergeRemoteOverrides(remote: Record<string, StoredStaffClassification>): number {
    const current = { ...this.loadPublicOverrides() };
    let applied = 0;

    for (const [qId, remoteItem] of Object.entries(remote)) {
      if (!qId || !remoteItem || !remoteItem.classificationStatus) continue;
      const sanitized = stripSensitiveStaffFields(remoteItem);
      const existing = current[qId];
      const remoteTs = sanitized.serverUpdatedAt || sanitized.reviewedAt || 0;
      const existingTs = existing ? existing.serverUpdatedAt || existing.reviewedAt || 0 : -1;

      if (!existing || remoteTs >= existingTs) {
        current[qId] = sanitized;
        applied++;
      }
    }

    this.publicCache = current;
    writeJson(PUBLIC_OVERRIDES_KEY, current);
    return applied;
  }

  static clearCache(): void {
    this.publicCache = null;
    this.staffCache = null;
    this.activeStaffUserId = null;
  }
}
