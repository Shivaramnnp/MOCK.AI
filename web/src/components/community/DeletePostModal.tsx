import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, X, RefreshCw } from 'lucide-react';
import { CommunityPost } from '../../types';

export interface DeletePostModalProps {
  post: CommunityPost | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmDelete: (post: CommunityPost) => Promise<void>;
}

export const DeletePostModal: React.FC<DeletePostModalProps> = ({
  post,
  isOpen,
  onClose,
  onConfirmDelete,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGone, setIsGone] = useState(false);

  // Initialize or reset modal state when opened or when post changes
  useEffect(() => {
    if (isOpen) {
      setIsGone(Boolean(post?.isDeleted));
      setError(null);
      setIsDeleting(false);
    }
  }, [isOpen, post?.id, post?.isDeleted]);

  // Real-time synchronization: if this post is deleted anywhere while modal is open, transition state
  useEffect(() => {
    if (!isOpen || !post) return;
    const handlePostDeleted = (e: any) => {
      if (e.detail?.postId === post.id) {
        setIsGone(true);
        setError(null);
      }
    };
    window.addEventListener('mockai_community_post_deleted', handlePostDeleted);
    return () => window.removeEventListener('mockai_community_post_deleted', handlePostDeleted);
  }, [isOpen, post?.id]);

  // Keyboard navigation: Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  // Lock background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen || !post) return null;

  const handleDelete = async () => {
    if (isDeleting) return;
    setError(null);
    setIsDeleting(true);
    try {
      await onConfirmDelete(post);
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Unable to delete the post. Please try again.';
      const postUnavailable =
        msg.includes('no longer exists') ||
        msg.includes('not found') ||
        msg.includes('no longer available') ||
        msg.includes('already deleted') ||
        msg.includes('404');

      if (postUnavailable) {
        setIsGone(true);
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {isGone ? (
          <>
            {/* Header when post is no longer available */}
            <div className="flex items-center justify-between p-5 border-b border-surface-border dark:border-darkSurface-border">
              <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400">
                <div className="p-2 rounded-xl bg-amber-500/10">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h2 id="delete-modal-title" className="text-base font-bold font-display text-surface-text dark:text-darkSurface-text">
                  Post no longer available
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-surface-muted hover:text-surface-text dark:text-darkSurface-muted dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-sm text-surface-muted dark:text-darkSurface-muted leading-relaxed">
                This post has already been deleted or is no longer available.
              </p>
            </div>

            {/* Footer Actions: Single Close button, NO destructive button */}
            <div className="flex items-center justify-end gap-3 p-5 bg-surface-elev1/50 dark:bg-darkSurface-elev2/30 border-t border-surface-border dark:border-darkSurface-border">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 text-xs font-bold text-surface-text dark:text-darkSurface-text transition-all"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Standard Confirmation Header */}
            <div className="flex items-center justify-between p-5 border-b border-surface-border dark:border-darkSurface-border">
              <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400">
                <div className="p-2 rounded-xl bg-red-500/10">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h2 id="delete-modal-title" className="text-base font-bold font-display text-surface-text dark:text-darkSurface-text">
                  Delete this post?
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={isDeleting}
                className="p-1.5 rounded-lg text-surface-muted hover:text-surface-text dark:text-darkSurface-muted dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors disabled:opacity-50"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-sm text-surface-muted dark:text-darkSurface-muted leading-relaxed">
                This will remove your post from the Community. This action cannot be undone.
              </p>

              {/* Post preview chip */}
              <div className="p-3.5 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted">
                  Post to delete
                </span>
                <p className="text-xs font-semibold text-surface-text dark:text-darkSurface-text line-clamp-2">
                  {post.title}
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 p-5 bg-surface-elev1/50 dark:bg-darkSurface-elev2/30 border-t border-surface-border dark:border-darkSurface-border">
              <button
                type="button"
                onClick={onClose}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 text-xs font-bold text-surface-text dark:text-darkSurface-text transition-all disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Post</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
