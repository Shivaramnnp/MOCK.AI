// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { DeletePostModal } from './DeletePostModal';
import { CommunityPost } from '../../types';

describe('DeletePostModal Component', () => {
  const mockPost: CommunityPost = {
    id: 'post-101',
    authorId: 'usr-1',
    authorName: 'John Doe',
    title: 'GATE 2025 CE Missing Questions',
    description: 'The morning session seems incomplete.',
    type: 'PAPER_REQUEST',
    status: 'OPEN',
    authorRole: 'STUDENT',
    priority: 'NORMAL',
    metadata: {},
    isPinned: false,
    isHidden: false,
    supportCount: 1,
    commentCount: 0,
    createdAt: '2026-09-20T10:00:00Z',
    updatedAt: '2026-09-20T10:00:00Z',
  };

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.style.overflow = '';
  });

  it('renders nothing when isOpen is false', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();
    const { container } = render(
      <DeletePostModal
        post={mockPost}
        isOpen={false}
        onClose={handleClose}
        onConfirmDelete={handleConfirm}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when post is null', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();
    const { container } = render(
      <DeletePostModal
        post={null}
        isOpen={true}
        onClose={handleClose}
        onConfirmDelete={handleConfirm}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders portaled dialog with post title and warning', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();
    render(
      <DeletePostModal
        post={mockPost}
        isOpen={true}
        onClose={handleClose}
        onConfirmDelete={handleConfirm}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByText('Delete this post?')).toBeDefined();
    expect(screen.getByText(mockPost.title)).toBeDefined();
  });

  it('closes on Escape key press', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();
    render(
      <DeletePostModal
        post={mockPost}
        isOpen={true}
        onClose={handleClose}
        onConfirmDelete={handleConfirm}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();
    render(
      <DeletePostModal
        post={mockPost}
        isOpen={true}
        onClose={handleClose}
        onConfirmDelete={handleConfirm}
      />
    );

    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirmDelete and closes on success', async () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <DeletePostModal
        post={mockPost}
        isOpen={true}
        onClose={handleClose}
        onConfirmDelete={handleConfirm}
      />
    );

    const deleteBtn = screen.getByRole('button', { name: /Delete Post/i });
    fireEvent.click(deleteBtn);

    expect(handleConfirm).toHaveBeenCalledWith(mockPost);
    await waitFor(() => {
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  it('displays error message if onConfirmDelete fails', async () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn().mockRejectedValue(new Error('Permission denied'));
    render(
      <DeletePostModal
        post={mockPost}
        isOpen={true}
        onClose={handleClose}
        onConfirmDelete={handleConfirm}
      />
    );

    const deleteBtn = screen.getByRole('button', { name: /Delete Post/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeDefined();
    });
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('locks body overflow while open and restores when closed', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();
    const { rerender } = render(
      <DeletePostModal
        post={mockPost}
        isOpen={true}
        onClose={handleClose}
        onConfirmDelete={handleConfirm}
      />
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <DeletePostModal
        post={mockPost}
        isOpen={false}
        onClose={handleClose}
        onConfirmDelete={handleConfirm}
      />
    );
    expect(document.body.style.overflow).toBe('');
  });
});
