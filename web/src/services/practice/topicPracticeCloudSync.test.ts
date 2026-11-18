// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  TopicPracticeCloudSync,
  validateCloudExamPaper,
  RemotePracticeHistoryRow,
} from './topicPracticeCloudSync';
import {
  TopicPracticeService,
  getClassificationTrustLevel,
} from './topicPracticeService';
import { TopicClassificationStore } from '../taxonomy/topicClassificationStore';
import { getQuestionTopicMetadata } from '../taxonomy/topicClassifier';
import { ExamService } from '../examService';
import { ExamSessionService } from '../examSessionService';
import { supabaseService } from '../supabase';

const UUID_USER_A = '11111111-1111-4111-8111-111111111111';
const UUID_USER_B = '22222222-2222-4222-8222-222222222222';
const UUID_STAFF_1 = '33333333-3333-4333-8333-333333333333';
const UUID_STAFF_2 = '44444444-4444-4444-8444-444444444444';

function mockAuthFor(uid: string | null) {
  return {
    getUser: async () => ({
      data: { user: uid ? { id: uid } : null },
      error: null,
    }),
  };
}

describe('Phase 3 Stage 4A — Mocked Unit & Client Integration Failure-Case Suite (15 Scenarios)', () => {
  beforeEach(() => {
    localStorage.clear();
    TopicClassificationStore.clearCache();
    TopicPracticeService.clearIndexCache();
    TopicPracticeCloudSync.abortActiveFlushes();
    vi.restoreAllMocks();
  });

  // Scenario 1: Audit history cannot be deleted through normal staff operations
  it('1. audit history cannot be deleted through normal staff operations (store + SQL contract)', () => {
    // Store exposes no deleteAuditLog / deleteClassification method
    expect((TopicClassificationStore as any).deleteAuditLog).toBeUndefined();
    expect((TopicClassificationStore as any).deleteOverride).toBeUndefined();

    const migrationPath = path.resolve(
      __dirname,
      '../../../../supabase/migrations/20261117_topic_practice_tests.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const executableSql = sql.replace(/--.*$/gm, '');

    expect(executableSql).toContain(
      'REFERENCES public.question_topic_classifications(question_id) ON DELETE RESTRICT'
    );
    expect(executableSql).not.toMatch(/question_topic_classifications\(question_id\)\s+ON\s+DELETE\s+CASCADE/i);
    expect(executableSql).not.toMatch(/CREATE\s+POLICY\s+"Staff delete question classifications"/i);
    expect(executableSql).toContain('trg_classification_audit_immutable');
    expect(executableSql).toContain('BEFORE UPDATE OR DELETE ON public.question_classification_audit_log');
  });

  // Scenario 2: Unauthorized users cannot approve classifications
  it('2. unauthorized users and placeholder IDs cannot approve classifications', async () => {
    // Placeholder identities like 'staff' and 'guest' are rejected by store
    expect(() =>
      TopicClassificationStore.saveStaffDecision({
        questionId: 'gate-2025-da-q16',
        examId: 'gate',
        paperId: 'gate-2025-da',
        subjectId: 'data_science_ai',
        topicId: 'database_management',
        topicName: 'Database Management',
        status: 'VERIFIED',
        reviewedBy: 'staff',
      })
    ).toThrow(/STAFF_AUTH_REQUIRED/i);

    // Non-staff student attempting RPC receives 42501 FORBIDDEN and zero local state change
    const forbiddenClient: any = {
      auth: mockAuthFor(UUID_USER_A),
      rpc: async () => ({
        data: null,
        error: { code: '42501', message: 'FORBIDDEN: Verified staff authorization required' },
      }),
    };
    vi.spyOn(supabaseService, 'getClient').mockReturnValue(forbiddenClient);

    const res = await TopicPracticeCloudSync.syncStaffClassificationRemote({
      questionId: 'gate-2025-da-q16',
      examId: 'gate',
      paperId: 'gate-2025-da',
      subjectId: 'data_science_ai',
      subjectName: 'Data Science & AI',
      topicId: 'database_management',
      topicName: 'Database Management',
      status: 'VERIFIED',
      expectedStaffUserId: UUID_USER_A,
    });

    expect(res.ok).toBe(false);
    expect(res.permanentFailure).toBe(true);
    expect(res.errorCode).toBe('42501');
    expect(TopicClassificationStore.getOverride('gate-2025-da-q16')).toBeNull();
  });

  // Scenario 3: Reviewer identity cannot be forged
  it('3. reviewer identity cannot be forged via client RPC parameters or mismatched session', async () => {
    const capturedRpcCalls: Array<{ fn: string; args: Record<string, any> }> = [];
    const okClient: any = {
      auth: mockAuthFor(UUID_STAFF_1),
      rpc: async (fn: string, args: Record<string, any>) => {
        capturedRpcCalls.push({ fn, args });
        return {
          data: {
            question_id: args.p_question_id,
            classification_status: args.p_status,
            classification_source: 'STAFF',
            reviewed_by: UUID_STAFF_1,
            verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            audit_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            deduplicated: false,
          },
          error: null,
        };
      },
    };
    vi.spyOn(supabaseService, 'getClient').mockReturnValue(okClient);

    // Attempting to submit as STAFF_2 while authenticated as STAFF_1 is blocked before RPC
    const spoofed = await TopicPracticeCloudSync.syncStaffClassificationRemote({
      questionId: 'gate-2025-da-q16',
      examId: 'gate',
      paperId: 'gate-2025-da',
      subjectId: 'data_science_ai',
      subjectName: 'Data Science & AI',
      topicId: 'database_management',
      topicName: 'Database Management',
      status: 'VERIFIED',
      expectedStaffUserId: UUID_STAFF_2,
    });
    expect(spoofed.ok).toBe(false);
    expect(spoofed.errorCode).toBe('SESSION_MISMATCH');
    expect(capturedRpcCalls.length).toBe(0);

    // Valid call as STAFF_1 NEVER transmits reviewed_by or p_reviewed_by (server derives auth.uid())
    const valid = await TopicPracticeCloudSync.syncStaffClassificationRemote({
      questionId: 'gate-2025-da-q16',
      examId: 'gate',
      paperId: 'gate-2025-da',
      subjectId: 'data_science_ai',
      subjectName: 'Data Science & AI',
      topicId: 'database_management',
      topicName: 'Database Management',
      status: 'VERIFIED',
      expectedStaffUserId: UUID_STAFF_1,
    });
    expect(valid.ok).toBe(true);
    expect(capturedRpcCalls).toHaveLength(1);
    expect(capturedRpcCalls[0].args).not.toHaveProperty('reviewed_by');
    expect(capturedRpcCalls[0].args).not.toHaveProperty('p_reviewed_by');
    expect(capturedRpcCalls[0].args).not.toHaveProperty('verified_at');
  });

  // Scenario 4: Classification and audit writes are atomic (single transactional RPC)
  it('4. classification and audit writes use one atomic RPC call with zero dual-table writes', async () => {
    const fromSpy = vi.fn();
    const rpcSpy = vi.fn().mockResolvedValue({
      data: {
        question_id: 'gate-2025-da-q16',
        classification_status: 'VERIFIED',
        classification_source: 'STAFF',
        reviewed_by: UUID_STAFF_1,
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        audit_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        deduplicated: false,
      },
      error: null,
    });

    vi.spyOn(supabaseService, 'getClient').mockReturnValue({
      auth: mockAuthFor(UUID_STAFF_1),
      from: fromSpy,
      rpc: rpcSpy,
    } as any);

    const res = await TopicPracticeCloudSync.syncStaffClassificationRemote({
      questionId: 'gate-2025-da-q16',
      examId: 'gate',
      paperId: 'gate-2025-da',
      subjectId: 'data_science_ai',
      subjectName: 'Data Science & AI',
      topicId: 'database_management',
      topicName: 'Database Management',
      status: 'VERIFIED',
      expectedStaffUserId: UUID_STAFF_1,
    });

    expect(res.ok).toBe(true);
    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith('staff_record_topic_classification', expect.any(Object));
    expect(fromSpy).not.toHaveBeenCalled();
  });

  // Scenario 5: Student A cannot retrieve Student B's papers
  it('5. Student A cannot retrieve Student B practice papers locally or remotely (and missing userId fails closed)', async () => {
    const paperB = TopicPracticeService.generatePracticeTest({
      examId: 'gate',
      subjectId: 'data_science_ai',
      topicIds: ['machine_learning'],
      questionCount: 3,
      durationMinutes: 15,
      isUntimed: false,
      difficulty: 'mixed',
      source: 'both',
      userId: UUID_USER_B,
      includeProvisional: true,
    });

    // Owner B can retrieve locally
    expect(ExamService.getPaperById(paperB.id, UUID_USER_B)?.id).toBe(paperB.id);
    // Student A cannot retrieve Student B's local paper
    expect(ExamService.getPaperById(paperB.id, UUID_USER_A)).toBeUndefined();
    expect(TopicPracticeService.getPersistedPracticePaper(paperB.id, UUID_USER_A)).toBeUndefined();
    // Missing userId fails closed (no cross-user localStorage scan!)
    expect(ExamService.getPaperById(paperB.id)).toBeUndefined();
    expect(TopicPracticeService.getPersistedPracticePaper(paperB.id)).toBeUndefined();

    // Remote fetch fails closed when signed-in session is Student A trying to request User B
    const remoteClient: any = {
      auth: mockAuthFor(UUID_USER_A),
      from: vi.fn(),
    };
    vi.spyOn(supabaseService, 'getClient').mockReturnValue(remoteClient);
    const remoteAttempt = await TopicPracticeCloudSync.fetchPracticePaperRemote(paperB.id, UUID_USER_B);
    expect(remoteAttempt).toBeUndefined();
    expect(remoteClient.from).not.toHaveBeenCalled();
  });

  // Scenario 6: Student A cannot retrieve Student B's history
  it('6. Student A cannot retrieve Student B practice history locally or via cloud merge', async () => {
    const userBRemoteRows: RemotePracticeHistoryRow[] = [
      {
        user_id: UUID_USER_B,
        session_id: 'sess_user_b_1',
        paper_id: 'practice_gate_b_1',
        exam_id: 'gate',
        subject_id: 'data_science_ai',
        selected_topic_ids: ['machine_learning'],
        question_count: 5,
        score: 4,
        max_score: 5,
        accuracy: 80,
        time_spent_seconds: 120,
        topic_results: {
          machine_learning: {
            topicId: 'machine_learning',
            topicName: 'Machine Learning',
            totalQuestions: 5,
            attempted: 5,
            correct: 4,
            wrong: 1,
            skipped: 0,
            accuracy: 80,
            score: 4,
            maxMarks: 5,
          },
        },
        difficulty_results: {},
        attempted_at: new Date().toISOString(),
      },
    ];

    // Merging User B's rows under User A produces zero leakage
    expect(TopicPracticeService.getTopicPerformanceHistory(UUID_USER_A, 'gate', userBRemoteRows)).toEqual([]);
    // Under User B it merges accurately
    expect(TopicPracticeService.getTopicPerformanceHistory(UUID_USER_B, 'gate', userBRemoteRows)).toHaveLength(1);

    // Remote fetch aborts if active auth session is Student A requesting Student B
    vi.spyOn(supabaseService, 'getClient').mockReturnValue({
      auth: mockAuthFor(UUID_USER_A),
      from: vi.fn(),
    } as any);
    const remoteRes = await TopicPracticeCloudSync.fetchPracticeHistoryRemote(UUID_USER_B, 'gate');
    expect(remoteRes.synced).toBe(false);
    expect(remoteRes.rows).toEqual([]);
  });

  // Scenario 7: Staff cache does not leak across account switching
  it('7. staff review notes, reviewer IDs, and audit logs do not leak across account switching', () => {
    TopicClassificationStore.saveStaffDecision({
      questionId: 'gate-2025-da-q16',
      examId: 'gate',
      paperId: 'gate-2025-da',
      subjectId: 'data_science_ai',
      topicId: 'database_management',
      topicName: 'Database Management',
      status: 'VERIFIED',
      previousStatus: 'PENDING_REVIEW',
      reviewNotes: 'CONFIDENTIAL_STAFF_1_NOTE',
      reviewedBy: UUID_STAFF_1,
    });

    expect(TopicClassificationStore.getAuditLog('gate-2025-da-q16', UUID_STAFF_1)).toHaveLength(1);
    expect(TopicClassificationStore.getOverride('gate-2025-da-q16', UUID_STAFF_1)?.reviewNotes).toBe(
      'CONFIDENTIAL_STAFF_1_NOTE'
    );

    // Switch to Staff 2 -> cannot see Staff 1's audit log or confidential notes
    TopicClassificationStore.setActiveStaffUser(UUID_STAFF_2);
    expect(TopicClassificationStore.getAuditLog('gate-2025-da-q16', UUID_STAFF_2)).toEqual([]);
    expect(TopicClassificationStore.getOverride('gate-2025-da-q16', UUID_STAFF_2)?.reviewNotes).toBeNull();
    expect(TopicClassificationStore.getOverride('gate-2025-da-q16', UUID_STAFF_2)?.reviewedBy).toBeNull();

    // Sign out -> sensitive staff storage wiped; student still sees PII-free VERIFIED override only
    TopicClassificationStore.clearSensitiveSessionState(UUID_STAFF_1);
    expect(TopicClassificationStore.getAuditLog('gate-2025-da-q16', UUID_STAFF_1)).toEqual([]);
    const studentView = TopicClassificationStore.getOverride('gate-2025-da-q16');
    expect(studentView?.classificationStatus).toBe('VERIFIED');
    expect(studentView?.reviewNotes).toBeNull();
    expect(studentView?.reviewedBy).toBeNull();
  });

  // Scenario 8: Rejected classifications propagate across devices
  it('8. staff REJECTED classifications propagate via hydration and override stale local rule-based tags', async () => {
    const provBefore = TopicPracticeService.getProvisionalQuestions('gate');
    expect(provBefore.length).toBeGreaterThan(0);
    const targetQ = provBefore[0];

    // Device B hydrates a staff REJECTED decision for targetQ from get_public_topic_classifications RPC
    const rpcClient: any = {
      rpc: async () => ({
        data: [
          {
            question_id: targetQ.id,
            exam_id: 'gate',
            source_paper_id: 'gate-2025-da',
            subject_id: 'data_science_ai',
            subject_name: 'Data Science & AI',
            topic_id: null,
            topic_name: null,
            subtopic_id: null,
            subtopic_name: null,
            classification_status: 'REJECTED',
            classification_source: 'STAFF',
            confidence: 0,
            verified_at: null,
            updated_at: new Date().toISOString(),
          },
        ],
        error: null,
      }),
    };
    vi.spyOn(supabaseService, 'getClient').mockReturnValue(rpcClient);

    const hyd = await TopicPracticeCloudSync.hydrateVerifiedClassificationsRemote('gate');
    expect(hyd.error).toBeNull();
    expect(hyd.applied).toBe(1);
    TopicPracticeService.clearIndexCache();

    // Rejected question is now excluded from BOTH verified AND provisional pools on Device B!
    expect(TopicPracticeService.getEligibleVerifiedQuestions('gate').some((q) => q.id === targetQ.id)).toBe(false);
    expect(TopicPracticeService.getProvisionalQuestions('gate').some((q) => q.id === targetQ.id)).toBe(false);
  });

  // Scenario 9: Offline queue flushes after reconnect & dead-letters permanent rejections
  it('9. offline queue deduplicates, flushes on reconnect with ignoreDuplicates, and dead-letters permanent 4xx errors', async () => {
    const paper = TopicPracticeService.generatePracticeTest({
      examId: 'gate',
      subjectId: 'data_science_ai',
      topicIds: ['machine_learning'],
      questionCount: 3,
      durationMinutes: 15,
      isUntimed: false,
      difficulty: 'mixed',
      source: 'both',
      userId: UUID_USER_A,
      includeProvisional: true,
    });
    const session = ExamSessionService.createSession(paper, UUID_USER_A);
    session.result = ExamService.calculateExamResult(session, paper);
    session.status = 'COMPLETED';
    session.completedAt = Date.now();

    // Simulate transient offline outage
    vi.spyOn(supabaseService, 'getClient').mockReturnValue({
      auth: mockAuthFor(UUID_USER_A),
      from: () => ({
        upsert: async () => ({ error: { message: 'Failed to fetch (offline)' } }),
      }),
    } as any);

    expect(await TopicPracticeCloudSync.savePracticePaperRemote(paper, UUID_USER_A)).toBe(false);
    expect(await TopicPracticeCloudSync.savePracticeHistoryRemote(session, paper)).toBe(false);
    await TopicPracticeCloudSync.savePracticeHistoryRemote(session, paper); // deduplicated
    expect(TopicPracticeCloudSync.getPendingQueue(UUID_USER_A)).toHaveLength(2);

    // Reconnect -> flush succeeds with composite onConflict + ignoreDuplicates: true
    const calls: Array<{ table: string; opts: any }> = [];
    vi.spyOn(supabaseService, 'getClient').mockReturnValue({
      auth: mockAuthFor(UUID_USER_A),
      from: (table: string) => ({
        upsert: async (_payload: any, opts: any) => {
          calls.push({ table, opts });
          return { error: null };
        },
      }),
    } as any);

    const flushRes = await TopicPracticeCloudSync.flushPendingCloudSync(UUID_USER_A, { forceRetry: true });
    expect(flushRes).toEqual({ flushed: 2, remaining: 0, deadLettered: 0, aborted: false });
    expect(calls).toEqual([
      { table: 'topic_practice_papers', opts: { onConflict: 'user_id,paper_id', ignoreDuplicates: true } },
      { table: 'student_topic_practice_history', opts: { onConflict: 'user_id,session_id', ignoreDuplicates: true } },
    ]);

    // Permanent 42501 RLS error moves item to dead-letter queue instead of retrying forever
    TopicPracticeCloudSync.enqueuePending({
      id: 'perm_fail_item',
      kind: 'PRACTICE_HISTORY',
      userId: UUID_USER_A,
      payload: { user_id: UUID_USER_A, session_id: 's1' },
      createdAt: Date.now(),
    });
    vi.spyOn(supabaseService, 'getClient').mockReturnValue({
      auth: mockAuthFor(UUID_USER_A),
      from: () => ({
        upsert: async () => ({ error: { code: '42501', message: 'FORBIDDEN' } }),
      }),
    } as any);
    const dlRes = await TopicPracticeCloudSync.flushPendingCloudSync(UUID_USER_A, { forceRetry: true });
    expect(dlRes.deadLettered).toBe(1);
    expect(dlRes.remaining).toBe(0);
    expect(TopicPracticeCloudSync.getDeadLetterQueue(UUID_USER_A)).toHaveLength(1);
  });

  // Scenario 10: Offline queue cannot cross user boundaries
  it('10. offline queue flush aborts safely and never flushes User A items under User B session', async () => {
    TopicPracticeCloudSync.enqueuePending({
      id: 'paper_user_a_only',
      kind: 'PRACTICE_PAPER',
      userId: UUID_USER_A,
      payload: { user_id: UUID_USER_A, paper_id: 'practice_gate_a_1' },
      createdAt: Date.now(),
    });

    const upsertSpy = vi.fn();
    vi.spyOn(supabaseService, 'getClient').mockReturnValue({
      auth: mockAuthFor(UUID_USER_B), // Signed in as User B!
      from: () => ({ upsert: upsertSpy }),
    } as any);

    const res = await TopicPracticeCloudSync.flushPendingCloudSync(UUID_USER_A, { forceRetry: true });
    expect(res.aborted).toBe(true);
    expect(res.flushed).toBe(0);
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(TopicPracticeCloudSync.getPendingQueue(UUID_USER_A)).toHaveLength(1);
  });

  // Scenario 11: Stale sync cannot overwrite newer records
  it('11. stale sync cannot overwrite newer classifications locally or on server conflict (40001)', async () => {
    const newerTs = Date.now();
    TopicClassificationStore.mergeRemoteOverrides({
      'gate-2025-da-q16': {
        examId: 'gate',
        subjectId: 'data_science_ai',
        paperId: 'gate-2025-da',
        primaryTopicId: 'database_management',
        primaryTopicName: 'Database Management',
        secondaryTopicIds: [],
        secondaryTopicNames: [],
        classificationStatus: 'VERIFIED',
        classificationSource: 'STAFF',
        confidence: 1,
        reviewedAt: newerTs,
        serverUpdatedAt: newerTs,
      },
    });

    // Older remote record (10s earlier) must NOT overwrite newer record
    TopicClassificationStore.mergeRemoteOverrides({
      'gate-2025-da-q16': {
        examId: 'gate',
        subjectId: 'data_science_ai',
        paperId: 'gate-2025-da',
        primaryTopicId: null,
        primaryTopicName: null,
        secondaryTopicIds: [],
        secondaryTopicNames: [],
        classificationStatus: 'REJECTED',
        classificationSource: 'STAFF',
        confidence: 0,
        reviewedAt: newerTs - 10_000,
        serverUpdatedAt: newerTs - 10_000,
      },
    });
    expect(TopicClassificationStore.getOverride('gate-2025-da-q16')?.classificationStatus).toBe('VERIFIED');

    // Server P0001 STALE_WRITE_CONFLICT is cleanly surfaced as permanent conflict
    vi.spyOn(supabaseService, 'getClient').mockReturnValue({
      auth: mockAuthFor(UUID_STAFF_1),
      rpc: async () => ({
        data: null,
        error: { code: 'P0001', message: 'STALE_WRITE_CONFLICT: Classification was updated more recently' },
      }),
    } as any);

    const conflictRes = await TopicPracticeCloudSync.syncStaffClassificationRemote({
      questionId: 'gate-2025-da-q16',
      examId: 'gate',
      paperId: 'gate-2025-da',
      subjectId: 'data_science_ai',
      subjectName: 'Data Science & AI',
      topicId: null,
      topicName: null,
      status: 'REJECTED',
      expectedStaffUserId: UUID_STAFF_1,
      expectedUpdatedAt: newerTs - 10_000,
    });
    expect(conflictRes.ok).toBe(false);
    expect(conflictRes.errorCode).toBe('P0001');
    expect(conflictRes.permanentFailure).toBe(true);
  });

  // Scenario 12: Malformed cloud paper payloads are rejected
  it('12. malformed cloud paper payloads are safely rejected and never cast to ExamPaper', async () => {
    expect(validateCloudExamPaper(null)).toBeUndefined();
    expect(validateCloudExamPaper('not-an-object')).toBeUndefined();
    expect(validateCloudExamPaper({ id: 'wrong_prefix', examId: 'gate', title: 'X', questions: [{}], sections: [] })).toBeUndefined();
    expect(validateCloudExamPaper({ id: 'practice_1', examId: 'gate', title: 'X', questions: [], sections: [] })).toBeUndefined();
    expect(
      validateCloudExamPaper(
        {
          id: 'practice_different',
          examId: 'gate',
          title: 'X',
          questions: [{ id: 'q1', questionText: 'Hello' }],
          sections: [],
          markingScheme: { marksPerCorrect: 1, negativeMarks: 0.33 },
        },
        'practice_expected'
      )
    ).toBeUndefined();

    // Remote fetch returning malformed payload returns undefined
    vi.spyOn(supabaseService, 'getClient').mockReturnValue({
      auth: mockAuthFor(UUID_USER_A),
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { paper_payload: { id: 'practice_bad_1', questions: 'corrupted' } },
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any);

    const fetched = await TopicPracticeCloudSync.fetchPracticePaperRemote('practice_bad_1', UUID_USER_A);
    expect(fetched).toBeUndefined();
  });

  // Scenario 13: More than 1,000 classification records can be hydrated
  it('13. hydrates more than 1,000 classification records via deterministic RPC pagination', async () => {
    const rpcOffsets: number[] = [];
    const makeRow = (i: number) => ({
      question_id: `bulk-q-${String(i).padStart(4, '0')}`,
      exam_id: 'ssc-chsl',
      source_paper_id: 'ssc-paper-1',
      subject_id: 'quantitative_aptitude',
      subject_name: 'Quantitative Aptitude',
      topic_id: 'algebra',
      topic_name: 'Algebra',
      subtopic_id: null,
      subtopic_name: null,
      classification_status: 'VERIFIED',
      classification_source: 'STAFF',
      confidence: 1.0,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    vi.spyOn(supabaseService, 'getClient').mockReturnValue({
      rpc: async (_fn: string, args: { p_limit: number; p_offset: number }) => {
        rpcOffsets.push(args.p_offset);
        if (args.p_offset === 0) {
          return { data: Array.from({ length: 1000 }, (_, i) => makeRow(i)), error: null };
        }
        if (args.p_offset === 1000) {
          return { data: Array.from({ length: 250 }, (_, i) => makeRow(1000 + i)), error: null };
        }
        return { data: [], error: null };
      },
    } as any);

    const hyd = await TopicPracticeCloudSync.hydrateVerifiedClassificationsRemote('ssc-chsl');
    expect(hyd.error).toBeNull();
    expect(hyd.pagesFetched).toBe(2);
    expect(hyd.loaded).toBe(1250);
    expect(hyd.applied).toBe(1250);
    expect(rpcOffsets).toEqual([0, 1000]);
    expect(TopicClassificationStore.getOverride('bulk-q-1249')?.classificationStatus).toBe('VERIFIED');
  });

  // Scenario 14: Provisional questions never appear in verified pools
  it('14. provisional questions and canonical string topics NEVER enter verified pools', () => {
    // All GATE verified pool items must strictly be STAFF_VERIFIED
    const gateVerified = TopicPracticeService.getEligibleVerifiedQuestions('gate');
    expect(gateVerified.length).toBeGreaterThan(0);
    for (const q of gateVerified) {
      expect(getClassificationTrustLevel(q.topicMetadata)).toBe('STAFF_VERIFIED');
    }

    // SSC CHSL has 14,126 RULE_BASED_PROVISIONAL questions and 0 STAFF_VERIFIED -> verified pool MUST be 0
    expect(TopicPracticeService.getEligibleVerifiedQuestions('ssc-chsl')).toHaveLength(0);
    expect(TopicPracticeService.getProvisionalQuestions('ssc-chsl').length).toBeGreaterThan(10000);

    // Canonical question.topic string alone must NEVER be treated as VERIFIED
    const bareTopicMeta = getQuestionTopicMetadata(
      {
        id: 'synthetic-bare-topic',
        examId: 'gate',
        questionText: 'Compute the gradient descent step for linear regression.',
        topic: 'Machine Learning',
      },
      'gate'
    );
    expect(bareTopicMeta.classificationStatus).toBe('REVIEW_REQUIRED');
    expect(getClassificationTrustLevel(bareTopicMeta)).toBe('PENDING_REVIEW');

    // Generating a verified test for a provisional-only topic fails closed
    expect(() =>
      TopicPracticeService.generatePracticeTest({
        examId: 'gate',
        subjectId: 'data_science_ai',
        topicIds: ['machine_learning'],
        questionCount: 3,
        durationMinutes: 15,
        isUntimed: false,
        difficulty: 'mixed',
        source: 'both',
      })
    ).toThrow(/No verified questions available/i);
  });

  // Scenario 15: Whole Mock Test continues to work independently
  it('15. Whole Mock Test papers load and score independently of Topic Practice isolation', () => {
    const chslPaper = ExamService.getPaperById('ssc-chsl-2025-13nov-s2');
    const gatePaper = ExamService.getPaperById('gate-2025-cs-1');
    expect(chslPaper).toBeDefined();
    expect(gatePaper).toBeDefined();
    expect(chslPaper?.isTopicPractice).toBeFalsy();
    expect(gatePaper?.isTopicPractice).toBeFalsy();

    const session = ExamSessionService.createSession(chslPaper!, UUID_USER_A);
    session.userAnswers[0] = chslPaper!.questions[0].correctAnswerIndex ?? 0;
    session.questionStatuses[0] = 'ANSWERED';
    const result = ExamService.calculateExamResult(session, chslPaper!);
    expect(result.totalQuestions).toBe(chslPaper!.questions.length);
    expect(result.correctCount).toBe(1);
  });
});

describe('Phase 3 Stage 4A — Static SQL Migration Security Contract Check (NOT Live PostgreSQL Verification)', () => {
  it('verifies 20261117_topic_practice_tests.sql contains all required security, immutability, RPC, and least-privilege clauses', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../../../../supabase/migrations/20261117_topic_practice_tests.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const executableSql = sql.replace(/--.*$/gm, '');

    // Zero destructive DROP TABLE statements & strictly two testing modes
    expect(executableSql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(executableSql).not.toContain("'SUBJECT_WISE'");
    expect(executableSql).toContain("'FULL_LENGTH'");
    expect(executableSql).toContain("'TOPIC_PRACTICE'");
    expect(executableSql).toContain('JOIN pg_namespace n ON n.oid = t.typnamespace');

    // Composite PK & structural JSONB validation on topic_practice_papers
    expect(executableSql).toContain('PRIMARY KEY (user_id, paper_id)');
    expect(executableSql).toContain('chk_paper_payload_valid_structure');
    expect(executableSql).toContain('octet_length(paper_payload::text) <= 2097152');

    // Tamper-resistant student_topic_practice_history
    expect(executableSql).toContain('trg_student_practice_history_immutable');
    expect(executableSql).toContain('GRANT SELECT, INSERT ON TABLE public.student_topic_practice_history TO authenticated');
    expect(executableSql).not.toMatch(/CREATE\s+POLICY\s+"Students update own topic practice history"/i);
    expect(executableSql).not.toMatch(/CREATE\s+POLICY\s+"Students delete own topic practice history"/i);

    // Atomic transactional staff classification RPC & public projection RPC
    expect(executableSql).toContain('CREATE OR REPLACE FUNCTION public.staff_record_topic_classification');
    expect(executableSql).toContain('v_staff_id := auth.uid()');
    expect(executableSql).toContain('SET search_path = public, auth, pg_temp');
    expect(executableSql).toContain('CREATE OR REPLACE FUNCTION public.get_public_topic_classifications');
    expect(executableSql).toContain('WITH (security_invoker = true)');

    // Explicit REVOKE ALL on all base tables
    expect(executableSql).toContain('REVOKE ALL ON TABLE public.student_topic_practice_history FROM PUBLIC, anon, authenticated');
    expect(executableSql).toContain('REVOKE ALL ON TABLE public.topic_practice_papers FROM PUBLIC, anon, authenticated');
    expect(executableSql).toContain('REVOKE ALL ON TABLE public.question_topic_classifications FROM PUBLIC, anon, authenticated');
    expect(executableSql).toContain('REVOKE ALL ON TABLE public.question_classification_audit_log FROM PUBLIC, anon, authenticated');
  });
});
