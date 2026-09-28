/**
 * MOCK.AI — Platform Statistics Component
 *
 * Renders database-driven live platform statistics:
 * - EXACT counts formatted with locale commas (no abbreviations like "25K+")
 * - Graceful loading skeletons (no flashing 0, 0, 0)
 * - Fault tolerance (renders fallback '—' if unreachable, never throws)
 * - Two polished, non-intrusive responsive variants:
 *   - 'strip': Single-line trust strip for Login (6 Registered Students · 1 Test Taken · 285 Available Papers)
 *   - 'compact' / 'prominent': Refined 3-column table for Home screen
 */

import React from 'react';
import { usePlatformStats, formatStatNumber } from '../services/platformStatsService';

export interface PlatformStatsBarProps {
  variant?: 'strip' | 'compact' | 'prominent';
  className?: string;
}

export const PlatformStatsBar: React.FC<PlatformStatsBarProps> = ({
  variant = 'compact',
  className = '',
}) => {
  const { stats, isLoading } = usePlatformStats();

  // ── Strip Variant (Preferred for Login page) ─────────────────────────────
  if (variant === 'strip') {
    return (
      <section
        aria-label="Platform Statistics"
        className={`w-full text-center py-2 px-3 text-xs text-surface-muted dark:text-darkSurface-muted ${className}`}
      >
        {isLoading && stats.registeredStudents === null && stats.testsTaken === null ? (
          <div className="h-4 w-56 mx-auto bg-surface-elev2 dark:bg-darkSurface-elev2 rounded animate-pulse" />
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <span>
              <strong
                data-testid="stat-registered-students"
                className="font-mono font-bold text-surface-text dark:text-darkSurface-text"
              >
                {formatStatNumber(stats.registeredStudents)}
              </strong>{' '}
              {stats.registeredStudents === 1 ? 'Registered Student' : 'Registered Students'}
            </span>
            <span className="text-surface-border dark:text-darkSurface-border select-none">·</span>
            <span>
              <strong
                data-testid="stat-tests-taken"
                className="font-mono font-bold text-surface-text dark:text-darkSurface-text"
              >
                {formatStatNumber(stats.testsTaken)}
              </strong>{' '}
              {stats.testsTaken === 1 ? 'Test Taken' : 'Tests Taken'}
            </span>
            <span className="text-surface-border dark:text-darkSurface-border select-none">·</span>
            <span>
              <strong
                data-testid="stat-available-papers"
                className="font-mono font-bold text-surface-text dark:text-darkSurface-text"
              >
                {formatStatNumber(stats.availablePapers)}
              </strong>{' '}
              Available Papers
            </span>
          </div>
        )}
      </section>
    );
  }

  // ── Compact / Prominent 3-Column Variant (Preferred for Home page) ───────
  return (
    <section
      aria-label="Platform Statistics"
      className={`w-full rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border py-3.5 px-4 sm:px-6 shadow-sm ${className}`}
    >
      <div className="text-[11px] font-bold uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted mb-2 text-center sm:text-left">
        Platform Statistics
      </div>
      <div className="grid grid-cols-3 divide-x divide-surface-border dark:divide-darkSurface-border text-center">
        {/* Metric 1: Registered Students */}
        <div className="px-2">
          {isLoading && stats.registeredStudents === null ? (
            <div className="h-6 w-12 mx-auto bg-surface-elev2 dark:bg-darkSurface-elev2 rounded animate-pulse my-0.5" />
          ) : (
            <div
              data-testid="stat-registered-students"
              className="text-lg sm:text-xl font-bold font-mono text-surface-text dark:text-darkSurface-text"
            >
              {formatStatNumber(stats.registeredStudents)}
            </div>
          )}
          <div className="text-xs text-surface-muted dark:text-darkSurface-muted font-medium">
            Registered Students
          </div>
        </div>

        {/* Metric 2: Tests Taken */}
        <div className="px-2">
          {isLoading && stats.testsTaken === null ? (
            <div className="h-6 w-12 mx-auto bg-surface-elev2 dark:bg-darkSurface-elev2 rounded animate-pulse my-0.5" />
          ) : (
            <div
              data-testid="stat-tests-taken"
              className="text-lg sm:text-xl font-bold font-mono text-surface-text dark:text-darkSurface-text"
            >
              {formatStatNumber(stats.testsTaken)}
            </div>
          )}
          <div className="text-xs text-surface-muted dark:text-darkSurface-muted font-medium">
            Tests Taken
          </div>
        </div>

        {/* Metric 3: Available Papers */}
        <div className="px-2">
          {isLoading && stats.availablePapers === null ? (
            <div className="h-6 w-12 mx-auto bg-surface-elev2 dark:bg-darkSurface-elev2 rounded animate-pulse my-0.5" />
          ) : (
            <div
              data-testid="stat-available-papers"
              className="text-lg sm:text-xl font-bold font-mono text-surface-text dark:text-darkSurface-text"
            >
              {formatStatNumber(stats.availablePapers)}
            </div>
          )}
          <div className="text-xs text-surface-muted dark:text-darkSurface-muted font-medium">
            Available Papers
          </div>
        </div>
      </div>
    </section>
  );
};
