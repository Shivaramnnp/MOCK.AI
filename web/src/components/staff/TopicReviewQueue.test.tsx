// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TopicReviewQueue } from './TopicReviewQueue';
import { TopicClassificationStore } from '../../services/taxonomy/topicClassificationStore';
import { TopicPracticeCloudSync } from '../../services/practice/topicPracticeCloudSync';

const STAFF_UUID = '33333333-3333-4333-8333-333333333333';

describe('TopicReviewQueue — Staff Classification Audit Workflow (Transactional RPC & Auth Gate)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    TopicClassificationStore.clearCache();
    vi.spyOn(TopicPracticeCloudSync, 'hydrateVerifiedClassificationsRemote').mockResolvedValue({
      loaded: 0,
      applied: 0,
      pagesFetched: 1,
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders Topic Review Queue with exam selector and audit count badges', () => {
    render(<TopicReviewQueue reviewerId={STAFF_UUID} isVerifiedStaff={true} />);

    expect(
      screen.getByText(/Topic Classification & Syllabus Audit Queue/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Total Questions')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('Pending Review')).toBeInTheDocument();
    expect(screen.getByText('Unclassified')).toBeInTheDocument();
  });

  it('blocks unauthorized users and placeholder reviewer IDs in read-only mode', () => {
    render(<TopicReviewQueue reviewerId="staff" isVerifiedStaff={false} />);

    fireEvent.click(screen.getByText('Total Questions'));
    const questionCards = screen.getAllByText(/gate-.*-q\d+/i);
    fireEvent.click(questionCards[0]);

    expect(screen.getByText(/Read-only view: sign in with a verified staff account/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Verify & Approve for Practice/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Reject Question/i })).toBeDisabled();
  });

  it('confirms cloud persistence via transactional RPC and surfaces actionable errors while preserving edits on failure', async () => {
    const syncSpy = vi
      .spyOn(TopicPracticeCloudSync, 'syncStaffClassificationRemote')
      .mockResolvedValueOnce({
        ok: false,
        error: 'FORBIDDEN: Verified staff authorization required',
        errorCode: '42501',
        permanentFailure: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        serverResult: {
          question_id: 'gate-2025-da-q16',
          classification_status: 'REJECTED',
          classification_source: 'STAFF',
          reviewed_by: STAFF_UUID,
          verified_at: null,
          updated_at: new Date().toISOString(),
          audit_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          deduplicated: false,
        },
      });

    render(<TopicReviewQueue reviewerId={STAFF_UUID} isVerifiedStaff={true} />);

    fireEvent.click(screen.getByText('Total Questions'));
    const questionCards = screen.getAllByText(/gate-.*-q\d+/i);
    fireEvent.click(questionCards[0]);

    const notesBox = screen.getByPlaceholderText(/Decision Trees entropy/i);
    fireEvent.change(notesBox, { target: { value: 'Audit evidence note preserved on retry' } });

    // 1. Server error -> shows actionable error, preserves note, does NOT claim cloud success
    fireEvent.click(screen.getByRole('button', { name: /Reject Question/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/FORBIDDEN: Verified staff authorization required/i);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect((notesBox as HTMLTextAreaElement).value).toBe('Audit evidence note preserved on retry');

    // 2. Retry succeeds via transactional RPC -> displays cloud confirmation with audit ID
    fireEvent.click(screen.getByRole('button', { name: /Reject Question/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Cloud-confirmed as REJECTED/i);
    });
    expect(syncSpy).toHaveBeenCalledTimes(2);
  });
});
