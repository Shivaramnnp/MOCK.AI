import React, { useState, useRef, useEffect } from 'react';
import {
  MoreVertical,
  Pencil,
  Trash2,
  Flag,
  Link as LinkIcon,
  Pin,
  PinOff,
  EyeOff,
  Eye,
  Shield,
  Check,
} from 'lucide-react';
import { CommunityPost, UserProfile, StaffAuthStatus } from '../../types';

export interface PostActionMenuProps {
  post: CommunityPost;
  user: UserProfile | null;
  authStatus?: StaffAuthStatus | null;
  onEdit?: (post: CommunityPost) => void;
  onDelete?: (post: CommunityPost) => void;
  onReport?: (post: CommunityPost) => void;
  onCopyLink?: (post: CommunityPost) => void;
  onStaffPinToggle?: (post: CommunityPost) => void;
  onStaffHideToggle?: (post: CommunityPost) => void;
}

export const PostActionMenu: React.FC<PostActionMenuProps> = ({
  post,
  user,
  authStatus,
  onEdit,
  onDelete,
  onReport,
  onCopyLink,
  onStaffPinToggle,
  onStaffHideToggle,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isOwner = Boolean(user?.uid && post.authorId && user.uid === post.authorId);
  const isStaff = Boolean(authStatus?.isStaff);

  // Close on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  const handleAction = (e: React.MouseEvent, callback?: (post: CommunityPost) => void) => {
    e.stopPropagation();
    setIsOpen(false);
    if (callback) {
      callback(post);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {/* 3-Dot Action Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-label="Post actions"
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="p-1.5 sm:p-2 rounded-lg text-surface-muted hover:text-surface-text dark:text-darkSurface-muted dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 top-full mt-1.5 w-48 sm:w-52 rounded-xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-xl z-50 py-1.5 animate-in fade-in zoom-in-95 duration-150 focus:outline-none"
        >
          {/* Owner Actions */}
          {isOwner ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={(e) => handleAction(e, onEdit)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-surface-text dark:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors text-left"
              >
                <Pencil className="w-3.5 h-3.5 text-brand-primary" />
                <span>Edit Post</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={(e) => handleAction(e, onDelete)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors text-left"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Post</span>
              </button>
            </>
          ) : (
            /* Non-Owner Actions */
            <button
              type="button"
              role="menuitem"
              onClick={(e) => handleAction(e, onReport)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors text-left"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Report Post</span>
            </button>
          )}

          {/* Common Divider */}
          <div className="my-1 border-t border-surface-border dark:border-darkSurface-border" />

          {/* Copy Link */}
          <button
            type="button"
            role="menuitem"
            onClick={(e) => handleAction(e, onCopyLink)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-surface-text dark:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors text-left"
          >
            <LinkIcon className="w-3.5 h-3.5 text-surface-muted dark:text-darkSurface-muted" />
            <span>Copy Link</span>
          </button>

          {/* Staff Moderation Section (Strictly displayed only to authenticated staff) */}
          {isStaff && (
            <>
              <div className="my-1 border-t border-surface-border dark:border-darkSurface-border" />
              <div className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                <span>Staff Moderation</span>
              </div>

              {onStaffPinToggle && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => handleAction(e, onStaffPinToggle)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-surface-text dark:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors text-left"
                >
                  {post.isPinned ? (
                    <>
                      <PinOff className="w-3.5 h-3.5 text-brand-primary" />
                      <span>Unpin Post</span>
                    </>
                  ) : (
                    <>
                      <Pin className="w-3.5 h-3.5 text-brand-primary" />
                      <span>Pin Post</span>
                    </>
                  )}
                </button>
              )}

              {onStaffHideToggle && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => handleAction(e, onStaffHideToggle)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-surface-text dark:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors text-left"
                >
                  {post.isHidden ? (
                    <>
                      <Eye className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Restore Post</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-red-500" />
                      <span>Hide Post</span>
                    </>
                  )}
                </button>
              )}

              {/* If staff is NOT owner, allow staff delete */}
              {!isOwner && onDelete && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => handleAction(e, onDelete)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors text-left"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Post (Staff)</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
