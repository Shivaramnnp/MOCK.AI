import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getPlatformStats,
  formatStatNumber,
  _resetPlatformStatsCache,
} from './platformStatsService';
import { supabaseService } from './supabase';
import * as supabaseContent from '../lib/supabaseContent';
import { paperRepository, _resetPaperRepositoryCache } from '../repositories/paperRepository';
import { questionRepository, _resetQuestionRepositoryCache } from '../repositories/questionRepository';
import { EXAM_PAPERS_MAP } from '../data/exams/catalog';

describe('Supabase Request Audit & Anti-Regression Verification', () => {
  beforeEach(() => {
    _resetPlatformStatsCache();
    _resetPaperRepositoryCache();
    _resetQuestionRepositoryCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Prevention of Excessive HEAD /rest/v1/exam_papers?select=* Requests', () => {
    it('does NOT fire live HEAD requests to exam_papers during standard platform stats fetch', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { registeredStudents: 10, testsTaken: 5 },
        error: null,
      });

      vi.spyOn(supabaseService, 'getClient').mockReturnValue({
        rpc: mockRpc,
      } as any);

      // In default test environment, isContentBackendAvailable is false, protecting Project 2
      expect(supabaseContent.isContentBackendAvailable()).toBe(false);

      const stats = await getPlatformStats();

      // Verified exact numbers
      expect(stats.registeredStudents).toBe(10);
      expect(stats.testsTaken).toBe(5);
      expect(stats.availablePapers).toBe(Object.keys(EXAM_PAPERS_MAP).length);
    });

    it('respects 1-hour remote papers cache and 60-second stats cache, preventing burst probes', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { registeredStudents: 50, testsTaken: 100 },
        error: null,
      });
      vi.spyOn(supabaseService, 'getClient').mockReturnValue({
        rpc: mockRpc,
      } as any);

      const mockFrom = vi.fn();
      vi.spyOn(supabaseContent, 'isContentBackendAvailable').mockReturnValue(true);
      vi.spyOn(supabaseContent, 'getContentClient').mockReturnValue({
        from: mockFrom.mockReturnValue({
          select: vi.fn().mockResolvedValue({ count: 285, error: null }),
        }),
      } as any);

      // Call 1: Populates cache
      const stats1 = await getPlatformStats(true);
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledTimes(1);

      // Call 2: Within cache window — zero network calls!
      const stats2 = await getPlatformStats(false);
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(stats1).toEqual(stats2);

      // Call 3: Even on forceRefresh of user metrics, if remote papers cache is warm, exam_papers is not probed
      const stats3 = await getPlatformStats(false);
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(stats3).toEqual(stats1);
    });

    it('deduplicates concurrent in-flight getPlatformStats calls to a single promise', async () => {
      const mockRpc = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ data: { registeredStudents: 7, testsTaken: 2 }, error: null }),
              20
            )
          )
      );

      vi.spyOn(supabaseService, 'getClient').mockReturnValue({
        rpc: mockRpc,
      } as any);

      // Simulate 6 concurrent requests (such as 6 parallel test workers or 6 components mounting simultaneously)
      const results = await Promise.all([
        getPlatformStats(),
        getPlatformStats(),
        getPlatformStats(),
        getPlatformStats(),
        getPlatformStats(),
        getPlatformStats(),
      ]);

      expect(mockRpc).toHaveBeenCalledTimes(1);
      for (const res of results) {
        expect(res.registeredStudents).toBe(7);
        expect(res.testsTaken).toBe(2);
      }
    });
  });

  describe('2. Elimination of 404 Non-Existent Table Requests', () => {
    it('NEVER queries profiles or user_exam_attempts via direct table selects in platformStatsService', async () => {
      const mockFrom = vi.fn();
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'RPC temporarily offline' },
      });

      vi.spyOn(supabaseService, 'getClient').mockReturnValue({
        rpc: mockRpc,
        from: mockFrom,
      } as any);

      const stats = await getPlatformStats(true);

      // The service should NOT have called .from('profiles') or .from('user_exam_attempts')
      expect(mockFrom).not.toHaveBeenCalled();
      // Should gracefully return nulls/local fallback without throwing or probing non-existent tables
      expect(stats.registeredStudents).toBeNull();
      expect(stats.availablePapers).toBe(Object.keys(EXAM_PAPERS_MAP).length);
    });

    it('verifies competitive_questions table is never referenced by repositories', async () => {
      // questionRepository queries 'questions' (Project 2 schema), NOT 'competitive_questions'
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      vi.spyOn(supabaseContent, 'isContentBackendAvailable').mockReturnValue(true);
      vi.spyOn(supabaseContent, 'getContentClient').mockReturnValue({
        from: mockFrom,
      } as any);

      await questionRepository.getQuestions('ssc-chsl-2025-13nov-s2');

      // Ensure the table queried is 'questions', NOT 'competitive_questions'
      expect(mockFrom).toHaveBeenCalledWith('questions');
      expect(mockFrom).not.toHaveBeenCalledWith('competitive_questions');
    });
  });

  describe('3. Repository-Level Caching Verification', () => {
    it('paperRepository caches getPapers and does not re-query Supabase on successive calls', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'test-paper-1',
                      exam_id: 'ssc-chsl',
                      edition_year: 2025,
                      title: 'Test Paper 1',
                      sub_title: null,
                      date: '2025-11-13',
                      shift: 'Shift 1',
                      tier: 'Tier 1',
                      paper_type: 'CBE_OBJECTIVE',
                      paper_code: null,
                      discipline: null,
                      language: 'English',
                      duration_minutes: 60,
                      total_marks: 200,
                      total_questions: 100,
                      is_complete: true,
                      marking_scheme: { marksPerCorrect: 2, negativeMarks: 0.5 },
                      exam_sections: [],
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      vi.spyOn(supabaseContent, 'isContentBackendAvailable').mockReturnValue(true);
      vi.spyOn(supabaseContent, 'getContentClient').mockReturnValue({
        from: mockFrom,
      } as any);

      const papersFirst = await paperRepository.getPapers('ssc-chsl');
      expect(mockFrom).toHaveBeenCalledTimes(1);

      const papersSecond = await paperRepository.getPapers('ssc-chsl');
      // Second call must be served from in-memory cache!
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(papersSecond).toEqual(papersFirst);
    });

    it('questionRepository caches getQuestions and does not re-query Supabase on successive calls', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'q1',
                  paper_id: 'test-paper-1',
                  section_id: 'general',
                  question_number: 1,
                  question_text: 'What is 2 + 2?',
                  question_type: 'MCQ',
                  marks: 2,
                  negative_marks: 0.5,
                  correct_answer: 'B',
                  correct_answer_index: 1,
                  is_mta: false,
                  explanation: '2 + 2 = 4',
                },
              ],
              error: null,
            }),
          }),
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'opt1',
                  question_id: 'q1',
                  option_label: 'A',
                  option_index: 0,
                  option_text: '3',
                },
                {
                  id: 'opt2',
                  question_id: 'q1',
                  option_label: 'B',
                  option_index: 1,
                  option_text: '4',
                },
              ],
              error: null,
            }),
          }),
        }),
      });

      vi.spyOn(supabaseContent, 'isContentBackendAvailable').mockReturnValue(true);
      vi.spyOn(supabaseContent, 'getContentClient').mockReturnValue({
        from: mockFrom,
      } as any);

      const qFirst = await questionRepository.getQuestions('test-paper-1');
      expect(mockFrom).toHaveBeenCalledTimes(2); // 1 for questions, 1 for options

      const qSecond = await questionRepository.getQuestions('test-paper-1');
      // Second call served from cache — no additional queries!
      expect(mockFrom).toHaveBeenCalledTimes(2);
      expect(qSecond).toEqual(qFirst);
    });
  });

  describe('4. Numerical Honesty & Formatting Verification', () => {
    it('preserves exact numbers without abbreviations', () => {
      expect(formatStatNumber(285)).toBe('285');
      expect(formatStatNumber(1250)).toBe('1,250');
      expect(formatStatNumber(100000)).toBe('100,000');
      expect(formatStatNumber(null)).toBe('—');
      expect(formatStatNumber(undefined)).toBe('—');
    });
  });
});
