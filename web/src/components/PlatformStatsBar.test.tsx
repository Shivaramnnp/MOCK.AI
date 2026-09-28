import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PlatformStatsBar } from './PlatformStatsBar';
import * as statsService from '../services/platformStatsService';

describe('PlatformStatsBar Component', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders strip variant with exact counts and dot-separated text for Login page', () => {
    vi.spyOn(statsService, 'usePlatformStats').mockReturnValue({
      stats: {
        registeredStudents: 6,
        testsTaken: 1,
        availablePapers: 285,
      },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<PlatformStatsBar variant="strip" />);

    // Verify aria-label
    expect(screen.getByRole('region', { name: /Platform Statistics/i })).toBeDefined();

    // Verify exact formatted strings and singular/plural grammar
    const studentsEl = screen.getByTestId('stat-registered-students');
    expect(studentsEl.textContent).toBe('6');
    expect(screen.getByText(/Registered Students/i)).toBeDefined();

    const testsEl = screen.getByTestId('stat-tests-taken');
    expect(testsEl.textContent).toBe('1');
    expect(screen.getByText(/Test Taken/i)).toBeDefined();

    const papersEl = screen.getByTestId('stat-available-papers');
    expect(papersEl.textContent).toBe('285');
    expect(screen.getByText(/Available Papers/i)).toBeDefined();

    // Verify dot separator
    expect(screen.getAllByText('·').length).toBe(2);
  });

  it('renders compact 3-column variant with Platform Statistics header for Home page', () => {
    vi.spyOn(statsService, 'usePlatformStats').mockReturnValue({
      stats: {
        registeredStudents: 6,
        testsTaken: 1,
        availablePapers: 285,
      },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<PlatformStatsBar variant="compact" />);

    expect(screen.getByText('Platform Statistics')).toBeDefined();

    const studentsEl = screen.getByTestId('stat-registered-students');
    expect(studentsEl.textContent).toBe('6');

    const testsEl = screen.getByTestId('stat-tests-taken');
    expect(testsEl.textContent).toBe('1');

    const papersEl = screen.getByTestId('stat-available-papers');
    expect(papersEl.textContent).toBe('285');

    // Verify no misleading copy or hardcoded exam names
    expect(screen.queryByText(/PLATFORM-WIDE ACTIVITY/i)).toBeNull();
    expect(screen.queryByText(/Live Verified Counts/i)).toBeNull();
    expect(screen.queryByText(/Active candidate accounts/i)).toBeNull();
    expect(screen.queryByText(/GATE & SSC CHSL papers/i)).toBeNull();
  });

  it('renders graceful fallback dash when values are null without throwing', () => {
    vi.spyOn(statsService, 'usePlatformStats').mockReturnValue({
      stats: {
        registeredStudents: null,
        testsTaken: null,
        availablePapers: 285,
      },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<PlatformStatsBar variant="compact" />);

    const studentsEl = screen.getByTestId('stat-registered-students');
    expect(studentsEl.textContent).toBe('—');

    const testsEl = screen.getByTestId('stat-tests-taken');
    expect(testsEl.textContent).toBe('—');

    const papersEl = screen.getByTestId('stat-available-papers');
    expect(papersEl.textContent).toBe('285');
  });

  it('renders loading skeleton instead of 0, 0, 0 when loading and data is not yet ready', () => {
    vi.spyOn(statsService, 'usePlatformStats').mockReturnValue({
      stats: {
        registeredStudents: null,
        testsTaken: null,
        availablePapers: null,
      },
      isLoading: true,
      error: null,
      refresh: vi.fn(),
    });

    const { container } = render(<PlatformStatsBar variant="compact" />);

    // Should have pulse skeleton elements
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);

    // Should NOT show '0'
    expect(screen.queryByText(/^0$/)).toBeNull();
  });
});
