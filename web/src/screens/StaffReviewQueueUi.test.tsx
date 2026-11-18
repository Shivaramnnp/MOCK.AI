// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { StaffDashboardScreen } from './StaffDashboardScreen';
import { staffService } from '../services/staffService';
import { supabaseService } from '../services/supabase';
import { UserProfile } from '../types';

describe('UADUE — Staff 1% Review Queue UI', () => {
  const verifiedStaffUser: UserProfile = {
    uid: 'staff_uadue_verifier_001',
    fullName: 'Forensic Quality Lead',
    email: 'lead@mock.ai',
    role: 'TEACHER',
    createdAt: Date.now(),
  };

  const mockReviewItems = [
    {
      id: 'rev_item_001',
      questionId: 'gate_cs_2024_q33',
      paperId: 'gate_cs_2024',
      anomalyCategory: 'MATH_SYNTAX',
      severity: 'REVIEW_REQUIRED',
      details: {
        violations: ['Unclosed inline LaTeX math ($) detected in option C.'],
        questionNumber: 33,
        stemSnippet: 'Calculate the asymptotic time complexity of algorithm A.',
      },
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'rev_item_002',
      questionId: 'ssc_chsl_2023_q12',
      paperId: 'ssc_chsl_2023_02aug_s2',
      anomalyCategory: 'OPTION_STRUCTURE',
      severity: 'FATAL',
      details: {
        violations: ['Duplicate option keys detected: (A), (A), (C), (D).'],
        questionNumber: 12,
        stemSnippet: 'Select the option that is related to the fifth term in the same way...',
      },
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(supabaseService, 'getClient').mockReturnValue(null);
    vi.spyOn(staffService, 'getStaffAuthStatus').mockResolvedValue({
      isStaff: true,
      role: 'ADMIN',
      permissions: ['can_manage_content', 'can_review_reports'],
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('1. Renders "UADUE 1% Review Queue" tab in Staff Dashboard navigation', async () => {
    vi.spyOn(staffService, 'getReviewQueueItems').mockResolvedValue([]);

    render(
      <StaffDashboardScreen
        user={verifiedStaffUser}
        onNavigate={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/uadue 1% review queue/i)).toBeDefined();
    });
  });

  it('2. Loads and renders flagged anomaly items with severity, category, and violations', async () => {
    vi.spyOn(staffService, 'getReviewQueueItems').mockResolvedValue(mockReviewItems);

    render(
      <StaffDashboardScreen
        user={verifiedStaffUser}
        onNavigate={vi.fn()}
      />
    );

    // Switch to UADUE Review tab
    const tabBtn = await screen.findByRole('button', { name: /uadue 1% review queue/i });
    fireEvent.click(tabBtn);

    expect(await screen.findByText('MATH_SYNTAX')).toBeDefined();
    expect(await screen.findByText('OPTION_STRUCTURE')).toBeDefined();
    expect(await screen.findByText(/gate_cs_2024_q33/)).toBeDefined();
    expect(await screen.findByText(/unclosed inline latex math/i)).toBeDefined();
  });

  it('3. Allows staff to approve or mark resolved with 1-click execution', async () => {
    const resolveSpy = vi.spyOn(staffService, 'resolveReviewQueueItem').mockResolvedValue(true);
    const getItemsSpy = vi
      .spyOn(staffService, 'getReviewQueueItems')
      .mockResolvedValueOnce(mockReviewItems)
      .mockResolvedValueOnce([
        { ...mockReviewItems[0], status: 'RESOLVED' },
        mockReviewItems[1],
      ]);

    render(
      <StaffDashboardScreen
        user={verifiedStaffUser}
        onNavigate={vi.fn()}
      />
    );

    const tabBtn = await screen.findByRole('button', { name: /uadue 1% review queue/i });
    fireEvent.click(tabBtn);

    const resolveButtons = await screen.findAllByRole('button', { name: /mark resolved/i });
    expect(resolveButtons.length).toBeGreaterThan(0);

    fireEvent.click(resolveButtons[0]);

    await waitFor(() => {
      expect(resolveSpy).toHaveBeenCalledWith(
        'rev_item_001',
        'RESOLVED',
        verifiedStaffUser.uid,
        undefined
      );
    });
  });

  it('4. Shows zero-item empty state when all ingested documents pass invariant certification', async () => {
    vi.spyOn(staffService, 'getReviewQueueItems').mockResolvedValue([]);

    render(
      <StaffDashboardScreen
        user={verifiedStaffUser}
        onNavigate={vi.fn()}
      />
    );

    const tabBtn = await screen.findByRole('button', { name: /uadue 1% review queue/i });
    fireEvent.click(tabBtn);

    await waitFor(() => {
      expect(screen.getByText(/zero pending review queue items/i)).toBeDefined();
      expect(screen.getByText(/all ingested assessment documents meet 100% invariant certification criteria/i)).toBeDefined();
    });
  });
});
