import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { HomeScreen } from './HomeScreen';
import { UserProfile, DailyInsight } from '../types';
import * as statsService from '../services/platformStatsService';

const mockProfile: UserProfile = {
  uid: 'user-123',
  fullName: 'Arjun Sharma',
  email: 'arjun@example.com',
  phoneNumber: '9876543210',
  role: 'STUDENT',
  createdAt: 1700000000000,
};

const mockDailyInsight: DailyInsight = {
  title: 'Optimize Time Management',
  summary: 'Practice Section B to improve speed on mathematical questions.',
  dateStr: 'Sep 26, 2026',
  focusArea: 'Engineering Mathematics',
};

describe('HomeScreen Component', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders prominent live platform statistics banner between Header and Daily Insight', () => {
    vi.spyOn(statsService, 'usePlatformStats').mockReturnValue({
      stats: {
        registeredStudents: 12500,
        testsTaken: 89400,
        availablePapers: 285,
      },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <HomeScreen
        tests={[]}
        profile={mockProfile}
        streakCount={5}
        dailyTasks={[]}
        dailyInsight={mockDailyInsight}
        onToggleTask={vi.fn()}
        onOpenCreateModal={vi.fn()}
        onStartTest={vi.fn()}
        onEditTest={vi.fn()}
        onDeleteTest={vi.fn()}
      />
    );

    // Verify Welcome header
    expect(screen.getByText(/Welcome back, Arjun Sharma/i)).toBeDefined();

    // Verify Platform Statistics Strip is present
    expect(screen.getByText('Platform Statistics')).toBeDefined();

    // Check exact numbers formatted
    expect(screen.getByTestId('stat-registered-students').textContent).toBe('12,500');
    expect(screen.getByTestId('stat-tests-taken').textContent).toBe('89,400');
    expect(screen.getByTestId('stat-available-papers').textContent).toBe('285');

    // Verify Daily Insight card is rendered
    expect(screen.getByText('Optimize Time Management')).toBeDefined();
  });
});
