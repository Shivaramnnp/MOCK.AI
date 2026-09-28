/**
 * MOCK.AI — Platform Statistics Service
 *
 * Provides authoritative, database-driven platform metrics for:
 * 1. Registered Students (unique user accounts)
 * 2. Tests Taken (strictly completed/submitted exam sessions)
 * 3. Available Papers (distinct source papers across all competitive exams)
 *
 * Design Guarantees:
 * - SINGLE SOURCE OF TRUTH: Shared canonical getPlatformStats() used by Login, Home, and all consumers.
 * - EXACT numerical honesty: No abbreviations (e.g., no "10K+", no "1M+").
 * - Bandwidth safe: Never downloads rows to count them (uses RPC or head:true count).
 * - Caching: 60-second TTL in memory and sessionStorage to prevent database strain and eliminate render flicker.
 * - Resilient: Does not drop valid counts on transient network errors; gracefully defaults without blocking login.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabaseService } from './supabase';
import { getContentClient, isContentBackendAvailable } from '../lib/supabaseContent';
import { EXAM_PAPERS_MAP } from '../data/exams/catalog';
import { storage } from './storage';

export interface PlatformStats {
  registeredStudents: number | null;
  testsTaken: number | null;
  availablePapers: number | null;
}

export interface CachedStatsData {
  stats: PlatformStats;
  timestamp: number;
}

const STATS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const REMOTE_PAPERS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (prevent repeated HEAD requests)
const SESSION_CACHE_KEY = 'mockai_platform_stats_cache';
const LOCAL_PAPERS_COUNT_CACHE_KEY = 'mockai_remote_papers_count_cache';

let memoryCache: CachedStatsData | null = null;
let remotePapersCountCache: { count: number; timestamp: number } | null = null;
let ongoingFetchPromise: Promise<PlatformStats> | null = null;

/**
 * Format a platform metric count with locale commas.
 * EXACT counts only — never abbreviates (no '25K+', no '1M+').
 * If value is null/undefined/NaN, returns '—' for graceful degradation.
 */
export function formatStatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat('en-US').format(value);
}

/**
 * Reads cached remote papers count from in-memory cache or localStorage.
 */
function getValidRemotePapersCount(): number | null {
  const now = Date.now();
  if (remotePapersCountCache && now - remotePapersCountCache.timestamp < REMOTE_PAPERS_CACHE_TTL_MS) {
    return remotePapersCountCache.count;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(LOCAL_PAPERS_COUNT_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.count === 'number' && now - parsed.timestamp < REMOTE_PAPERS_CACHE_TTL_MS) {
          remotePapersCountCache = parsed;
          return parsed.count;
        }
      }
    } catch {
      // Ignore localStorage read errors
    }
  }
  return null;
}

/**
 * Persists remote papers count to both in-memory cache and localStorage.
 */
function setValidRemotePapersCount(count: number): void {
  const entry = { count, timestamp: Date.now() };
  remotePapersCountCache = entry;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(LOCAL_PAPERS_COUNT_CACHE_KEY, JSON.stringify(entry));
    } catch {
      // Ignore localStorage quota errors
    }
  }
}

/**
 * Reads cached stats if still within TTL.
 */
function getValidCachedStats(): PlatformStats | null {
  const now = Date.now();

  // 1. Check in-memory cache first
  if (memoryCache && now - memoryCache.timestamp < STATS_CACHE_TTL_MS) {
    return memoryCache.stats;
  }

  // 2. Check sessionStorage fallback
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const raw = window.sessionStorage.getItem(SESSION_CACHE_KEY);
      if (raw) {
        const parsed: CachedStatsData = JSON.parse(raw);
        if (parsed && parsed.stats && now - parsed.timestamp < STATS_CACHE_TTL_MS) {
          memoryCache = parsed;
          return parsed.stats;
        }
      }
    } catch {
      // Ignore sessionStorage parsing errors
    }
  }

  return null;
}

/**
 * Saves stats to both in-memory cache and sessionStorage.
 */
function setCachedStats(stats: PlatformStats): void {
  const cacheEntry: CachedStatsData = {
    stats,
    timestamp: Date.now(),
  };
  memoryCache = cacheEntry;

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cacheEntry));
    } catch {
      // Ignore sessionStorage quota / privacy errors
    }
  }
}

/**
 * Canonical platform statistics fetcher.
 * Queries Supabase database RPC get_platform_stats() as single source of truth.
 */
export async function getPlatformStats(forceRefresh = false): Promise<PlatformStats> {
  if (!forceRefresh) {
    const cached = getValidCachedStats();
    if (cached) {
      return cached;
    }
  }

  // Deduplicate concurrent in-flight fetch requests
  if (ongoingFetchPromise) {
    return ongoingFetchPromise;
  }

  ongoingFetchPromise = (async () => {
    let registeredStudents: number | null = null;
    let testsTaken: number | null = null;
    let availablePapers: number | null = null;

    // ── 1. Available Papers Count ─────────────────────────────────────────
    // Mock.AI local catalog (EXAM_PAPERS_MAP) contains 285 statically bundled papers.
    // We only probe remote exam_papers count if persistent cache is expired or missing.
    try {
      const localCatalogCount = Object.keys(EXAM_PAPERS_MAP).length;
      let remoteCatalogCount = getValidRemotePapersCount();

      // Only probe remote if not yet cached in persistent storage
      if (remoteCatalogCount === null && isContentBackendAvailable()) {
        const contentClient = getContentClient();
        if (contentClient) {
          const { count, error } = await contentClient
            .from('exam_papers')
            .select('*', { count: 'exact', head: true });

          if (!error && typeof count === 'number') {
            remoteCatalogCount = count;
            setValidRemotePapersCount(count);
          }
        }
      }

      // Truthful union: at least as many papers as locally packaged or remotely published
      availablePapers = Math.max(remoteCatalogCount ?? 0, localCatalogCount);
    } catch (err) {
      console.warn('[PlatformStats] Error counting available papers:', err);
      availablePapers = Object.keys(EXAM_PAPERS_MAP).length || null;
    }

    // ── 2. Registered Students & Tests Taken ───────────────────────────────
    // Primary & authoritative approach: Call get_platform_stats() RPC in Project 1 (SECURITY DEFINER).
    // Note: Never execute direct table count scans against Project 2 or unauthenticated tables,
    // which would cause 404s (tables do not exist on Project 2) or RLS permission denials.
    try {
      const authClient = supabaseService.getClient();
      if (authClient) {
        const { data, error } = await authClient.rpc('get_platform_stats');

        if (!error && data && typeof data === 'object') {
          const res = data as Record<string, unknown>;
          if (typeof res.registeredStudents === 'number') {
            registeredStudents = res.registeredStudents;
          }
          if (typeof res.testsTaken === 'number') {
            testsTaken = res.testsTaken;
          }
        }
      }
    } catch (err) {
      console.warn('[PlatformStats] Error fetching platform stats from Project 1:', err);
    }

    // ── 3. Resilient Fallback to Existing Cache ─────────────────────────────
    // If a transient network glitch occurred, don't wipe out previously known valid data
    const existingCached = memoryCache?.stats;
    if (registeredStudents === null && existingCached?.registeredStudents !== null && existingCached?.registeredStudents !== undefined) {
      registeredStudents = existingCached.registeredStudents;
    }
    if (testsTaken === null && existingCached?.testsTaken !== null && existingCached?.testsTaken !== undefined) {
      testsTaken = existingCached.testsTaken;
    }
    if (availablePapers === null && existingCached?.availablePapers !== null && existingCached?.availablePapers !== undefined) {
      availablePapers = existingCached.availablePapers;
    }

    // ── 4. Tests Taken Aggregation (Remote + Local Completed Tests) ────────
    try {
      const localCompleted = storage
        .getTests()
        .filter((t) => t.lastTakenAt !== null && t.lastTakenAt !== undefined).length;
      if (typeof testsTaken === 'number') {
        testsTaken = Math.max(testsTaken, localCompleted);
      } else if (localCompleted > 0) {
        testsTaken = localCompleted;
      }
    } catch {
      // Ignore local storage error
    }

    const finalStats: PlatformStats = {
      registeredStudents,
      testsTaken,
      availablePapers,
    };

    // Cache valid results
    setCachedStats(finalStats);
    return finalStats;
  })().finally(() => {
    ongoingFetchPromise = null;
  });

  return ongoingFetchPromise;
}

// Backward-compatible alias
export const fetchPlatformStats = getPlatformStats;

/**
 * React hook to retrieve live platform statistics with loading state and caching.
 */
export function usePlatformStats() {
  const [stats, setStats] = useState<PlatformStats>(() => {
    return (
      getValidCachedStats() || {
        registeredStudents: null,
        testsTaken: null,
        availablePapers: Object.keys(EXAM_PAPERS_MAP).length || null,
      }
    );
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => !getValidCachedStats());
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const loadStats = useCallback(async (forceRefresh = false) => {
    const cached = getValidCachedStats();
    if (!forceRefresh && cached) {
      if (isMountedRef.current) {
        setStats(cached);
        setIsLoading(false);
      }
      return;
    }

    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const data = await getPlatformStats(forceRefresh);
      if (isMountedRef.current) {
        setStats(data);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load platform statistics');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadStats();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadStats]);

  return {
    stats,
    isLoading,
    error,
    refresh: () => loadStats(true),
  };
}

/**
 * Testing utility: reset in-memory and session cache.
 */
export function _resetPlatformStatsCache(): void {
  memoryCache = null;
  remotePapersCountCache = null;
  ongoingFetchPromise = null;
  if (typeof window !== 'undefined') {
    if (window.sessionStorage) {
      try {
        window.sessionStorage.removeItem(SESSION_CACHE_KEY);
      } catch {
        // ignore
      }
    }
    if (window.localStorage) {
      try {
        window.localStorage.removeItem(LOCAL_PAPERS_COUNT_CACHE_KEY);
      } catch {
        // ignore
      }
    }
  }
}
