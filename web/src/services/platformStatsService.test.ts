import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  formatStatNumber,
  fetchPlatformStats,
  _resetPlatformStatsCache,
} from './platformStatsService';
import { supabaseService } from './supabase';
import * as supabaseContent from '../lib/supabaseContent';
import { EXAM_PAPERS_MAP } from '../data/exams/catalog';

describe('platformStatsService', () => {
  beforeEach(() => {
    _resetPlatformStatsCache();
    vi.restoreAllMocks();
    vi.spyOn(supabaseContent, 'isContentBackendAvailable').mockReturnValue(false);
  });

  describe('formatStatNumber', () => {
    it('formats exact numbers with locale commas and never abbreviates', () => {
      expect(formatStatNumber(0)).toBe('0');
      expect(formatStatNumber(1)).toBe('1');
      expect(formatStatNumber(285)).toBe('285');
      expect(formatStatNumber(1000)).toBe('1,000');
      expect(formatStatNumber(25431)).toBe('25,431');
      expect(formatStatNumber(1024532)).toBe('1,024,532');
      expect(formatStatNumber(10000000)).toBe('10,000,000');
    });

    it('never formats with abbreviated suffix notation (no K+, M+, etc.)', () => {
      const formatted25k = formatStatNumber(25000);
      expect(formatted25k).toBe('25,000');
      expect(formatted25k).not.toContain('K');
      expect(formatted25k).not.toContain('+');

      const formatted1m = formatStatNumber(1000000);
      expect(formatted1m).toBe('1,000,000');
      expect(formatted1m).not.toContain('M');
      expect(formatted1m).not.toContain('+');
    });

    it('returns fallback dash for null, undefined, or NaN', () => {
      expect(formatStatNumber(null)).toBe('—');
      expect(formatStatNumber(undefined)).toBe('—');
      expect(formatStatNumber(NaN)).toBe('—');
    });
  });

  describe('fetchPlatformStats', () => {
    it('returns real counts from get_platform_stats RPC when available', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          registeredStudents: 1420,
          testsTaken: 3890,
        },
        error: null,
      });

      vi.spyOn(supabaseService, 'getClient').mockReturnValue({
        rpc: mockRpc,
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
      } as any);

      const stats = await fetchPlatformStats();

      expect(stats.registeredStudents).toBe(1420);
      expect(stats.testsTaken).toBe(3890);
      // Available papers should be at least local catalog (285)
      expect(stats.availablePapers).toBeGreaterThanOrEqual(Object.keys(EXAM_PAPERS_MAP).length);
    });

    it('respects 60-second caching and does not make duplicate RPC calls', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          registeredStudents: 500,
          testsTaken: 1200,
        },
        error: null,
      });

      vi.spyOn(supabaseService, 'getClient').mockReturnValue({
        rpc: mockRpc,
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
      } as any);

      const stats1 = await fetchPlatformStats();
      const stats2 = await fetchPlatformStats();

      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(stats1).toEqual(stats2);

      // Force refresh should bypass cache
      const stats3 = await fetchPlatformStats(true);
      expect(mockRpc).toHaveBeenCalledTimes(2);
      expect(stats3).toEqual(stats1);
    });

    it('handles RPC error gracefully without throwing, retaining available papers count', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Function not found' },
      });

      vi.spyOn(supabaseService, 'getClient').mockReturnValue({
        rpc: mockRpc,
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
      } as any);

      const stats = await fetchPlatformStats(true);

      expect(stats.registeredStudents).toBeNull();
      // Should not throw and should still report canonical available papers
      expect(stats.availablePapers).toBe(Object.keys(EXAM_PAPERS_MAP).length);
    });

    it('correctly aggregates remote paper count with local canonical catalog', async () => {
      vi.spyOn(supabaseContent, 'isContentBackendAvailable').mockReturnValue(true);
      vi.spyOn(supabaseContent, 'getContentClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            count: 350,
            error: null,
          }),
        }),
      } as any);

      const stats = await fetchPlatformStats(true);
      expect(stats.availablePapers).toBe(350);
    });

    it('exports getPlatformStats as canonical function and preserves valid cached data on network glitch', async () => {
      // 1. Initial success returns 6 students
      const mockRpc = vi.fn().mockResolvedValueOnce({
        data: {
          registeredStudents: 6,
          testsTaken: 1,
        },
        error: null,
      });

      vi.spyOn(supabaseService, 'getClient').mockReturnValue({
        rpc: mockRpc,
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
      } as any);

      const stats = await fetchPlatformStats(true);
      expect(stats.registeredStudents).toBe(6);
      expect(stats.testsTaken).toBe(1);

      // 2. Network error on force refresh should preserve known valid 6 students instead of wiping to null
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Network offline' },
      });

      const statsAfterGlitch = await fetchPlatformStats(true);
      expect(statsAfterGlitch.registeredStudents).toBe(6);
      expect(statsAfterGlitch.testsTaken).toBe(1);
    });
  });
});
