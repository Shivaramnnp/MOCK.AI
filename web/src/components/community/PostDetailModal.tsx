/**
 * MOCK.AI — Post Detail & Threaded Discussion Modal
 *
 * Displays full context, metadata links, status resolution notes,
 * and multi-level threaded replies with official Mock.AI team badges.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  FileQuestion,
  AlertTriangle,
  Bug,
  Lightbulb,
  MessageSquare,
  Users,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Send,
  Flag,
  ArrowRight,
  ExternalLink,
  Laptop,
} from 'lucide-react';
import {
  CommunityPost,
  CommunityComment,
  CommunityPostStatus,
  UserProfile,
} from '../../types';
import { communityService } from '../../services/communityService';

export interface PostDetailModalProps {
  postId: string | null;
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  onSupportToggled?: (postId: string, supported: boolean, count: number) => void;
  onOpenReportContent?: (targetType: 'POST' | 'COMMENT', targetId: string) => void;
  onNavigateToQuestion?: (examId: string, paperId: string, questionNumber?: number) => void;
  onNavigateToPaper?: (paperId: string) => void;
}

export const PostDetailModal: React.FC<PostDetailModalProps> = ({
  postId,
  isOpen,
  onClose,
  user,
  onSupportToggled,
  onOpenReportContent,
  onNavigateToQuestion,
  onNavigateToPaper,
}) => {
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New Comment state
  const [newCommentText, setNewCommentText] = useState('');
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const loadPost = async () => {
    if (!postId) return;
    setIsLoading(true);
    try {
      const res = await communityService.getPostById(postId, user?.uid);
      if (res) {
        setPost(res.post);
        setComments(res.comments);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && postId) {
      loadPost();
    } else {
      setPost(null);
      setComments([]);
      setNewCommentText('');
      setReplyingToCommentId(null);
    }
  }, [isOpen, postId, user?.uid]);

  if (!isOpen || !postId) return null;

  const handleToggleSupport = async () => {
    if (!user) {
      alert('Please sign in to support this request.');
      return;
    }
    if (!post) return;

    try {
      const res = await communityService.toggleSupport(post.id, user);
      setPost((prev) => (prev ? { ...prev, hasUserSupported: res.supported, supportCount: res.supportCount } : null));
      if (onSupportToggled) {
        onSupportToggled(post.id, res.supported, res.supportCount);
      }
    } catch {
      alert('Failed to update support.');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || !post) return;

    setIsSubmittingComment(true);
    try {
      await communityService.createComment({
        postId: post.id,
        parentCommentId: replyingToCommentId,
        content: newCommentText,
        user,
        isOfficial: false,
      });

      setNewCommentText('');
      setReplyingToCommentId(null);
      await loadPost();
    } catch (err: any) {
      alert(err?.message || 'Failed to post comment.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const getStatusBadge = (status: CommunityPostStatus) => {
    switch (status) {
      case 'OPEN':
        return <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold">🟡 Open</span>;
      case 'INVESTIGATING':
        return <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold">🔵 Investigating</span>;
      case 'IN_PROGRESS':
        return <span className="px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-bold">🟣 In Progress</span>;
      case 'RESOLVED':
        return <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold">🟢 Resolved</span>;
      case 'DUPLICATE':
        return <span className="px-2.5 py-1 rounded-full bg-gray-500/10 text-gray-500 text-xs font-bold">⚪ Duplicate</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 text-xs font-bold">🔴 Rejected</span>;
      case 'NEEDS_INFORMATION':
        return <span className="px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-600 text-xs font-bold">🟠 Needs Info</span>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'PAPER_REQUEST':
        return <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-bold">📄 Paper Request</span>;
      case 'QUESTION_REPORT':
        return <span className="px-2 py-0.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-[11px] font-bold">⚠️ Question Report</span>;
      case 'BUG_REPORT':
        return <span className="px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[11px] font-bold">🐛 Bug Report</span>;
      case 'FEATURE_REQUEST':
        return <span className="px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] font-bold">💡 Feature Request</span>;
      default:
        return <span className="px-2 py-0.5 rounded-lg bg-brand-primary/10 text-brand-primary text-[11px] font-bold">💬 Discussion</span>;
    }
  };

  // Keyboard navigation: Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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

  if (!isOpen) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-surface-border dark:border-darkSurface-border flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {post && getTypeBadge(post.type)}
              {post && getStatusBadge(post.status)}
              {post?.isPinned && (
                <span className="px-2 py-0.5 rounded-lg bg-brand-primary/15 text-brand-primary text-[10px] font-bold uppercase tracking-wider">
                  📌 Pinned
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-bold font-display text-surface-text dark:text-darkSurface-text">
              {post?.title || 'Loading post...'}
            </h2>
            <div className="flex items-center gap-2 text-xs text-surface-muted dark:text-darkSurface-muted">
              <span>By {post?.authorName || 'Mock.AI User'}</span>
              <span>•</span>
              <span>{post ? new Date(post.createdAt).toLocaleDateString() : ''}</span>
              {post?.isEdited && (
                <span className="text-[10px] text-surface-muted/70 dark:text-darkSurface-muted/70 font-sans font-medium">
                  · Edited
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-surface-muted hover:text-surface-text dark:text-darkSurface-muted dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {isLoading && !post ? (
            <div className="py-12 text-center text-surface-muted animate-pulse">Loading discussion details...</div>
          ) : post ? (
            <>
              {/* Context Specific Box */}
              {post.type === 'QUESTION_REPORT' && post.metadata?.questionId && (
                <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 block mb-0.5">
                      Reported Question Target
                    </span>
                    <p className="font-bold text-surface-text dark:text-darkSurface-text">
                      {post.metadata.examId?.toUpperCase()} Paper: {post.metadata.paperId || 'Canonical'} · Question #{post.metadata.questionNumber || 'Target'}
                    </p>
                    {post.metadata.questionCategory && (
                      <span className="text-[11px] text-surface-muted">
                        Issue Type: {post.metadata.questionCategory.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  {onNavigateToQuestion && post.metadata.examId && (
                    <button
                      onClick={() => {
                        onClose();
                        onNavigateToQuestion(
                          post.metadata.examId!,
                          post.metadata.paperId || '',
                          post.metadata.questionNumber
                        );
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm self-start sm:self-auto shrink-0 transition-all"
                    >
                      <span>View Question in Exam</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {post.type === 'PAPER_REQUEST' && (
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-0.5">
                      Requested Paper Target
                    </span>
                    <p className="font-bold text-surface-text dark:text-darkSurface-text">
                      {(post.customExamName || post.metadata?.customExamName) ? (
                        <>
                          <span className="text-amber-600 dark:text-amber-400 font-extrabold">
                            ✨ {post.customExamName || post.metadata?.customExamName}
                          </span>
                          {(post.customYear || post.metadata?.customYear) ? ` · ${post.customYear || post.metadata?.customYear}` : ''}
                          {(post.customStage || post.metadata?.customStage || post.metadata?.tier) ? ` · ${post.customStage || post.metadata?.customStage || post.metadata?.tier}` : ''}
                          {(post.customSession || post.metadata?.customSession || post.metadata?.shift) ? ` · ${post.customSession || post.metadata?.customSession || post.metadata?.shift}` : ''}
                        </>
                      ) : (
                        <>
                          {post.metadata?.examId?.toUpperCase()} · {post.metadata?.editionYear} {post.metadata?.tier} {post.metadata?.shift}
                        </>
                      )}
                    </p>
                    {(post.customExamAuthority || post.metadata?.customExamAuthority) && (
                      <p className="text-[11px] text-surface-muted mt-1">
                        🏛️ Authority / State: <strong className="text-surface-text dark:text-darkSurface-text font-semibold">{post.customExamAuthority || post.metadata?.customExamAuthority}</strong>
                      </p>
                    )}
                    {post.metadata?.sourceUrl && (
                      <a
                        href={post.metadata.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-brand-primary hover:underline inline-flex items-center gap-1 mt-1 block"
                      >
                        <span>Official Source Link</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  {post.status === 'RESOLVED' && onNavigateToPaper && (
                    <button
                      onClick={() => {
                        onClose();
                        onNavigateToPaper(post.metadata?.examId || 'ssc-chsl');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-sm self-start sm:self-auto shrink-0"
                    >
                      <span>Open Ingested Paper</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {post.type === 'BUG_REPORT' && post.metadata?.diagnostics && (
                <div className="p-3.5 rounded-2xl bg-purple-500/5 border border-purple-500/20 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-purple-700 dark:text-purple-300">
                    <Laptop className="w-3.5 h-3.5" />
                    <span>Captured Diagnostics</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-surface-muted font-mono">
                    <div>OS: {post.metadata.diagnostics.os}</div>
                    <div>Browser: {post.metadata.diagnostics.browser}</div>
                    <div>Viewport: {post.metadata.diagnostics.viewport}</div>
                    <div>Route: {post.metadata.diagnostics.route}</div>
                  </div>
                </div>
              )}

              {/* Official Resolution Banner */}
              {post.status === 'RESOLVED' && post.resolutionNotes && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Verified Resolution by {post.resolvedByName || 'Mock.AI Team'}</span>
                    {post.resolvedAt && (
                      <span className="text-[10px] text-emerald-600/70 font-normal">
                        ({new Date(post.resolvedAt).toLocaleDateString()})
                      </span>
                    )}
                  </div>
                  <p className="text-emerald-800 dark:text-emerald-200 leading-relaxed font-medium">
                    {post.resolutionNotes}
                  </p>
                </div>
              )}

              {/* Main Description */}
              <div className="text-sm text-surface-text dark:text-darkSurface-text leading-relaxed whitespace-pre-wrap">
                {post.description}
              </div>

              {/* Support & Actions Bar */}
              <div className="flex items-center justify-between pt-3.5 pb-3.5 border-y border-surface-border dark:border-darkSurface-border">
                <button
                  type="button"
                  onClick={handleToggleSupport}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    post.hasUserSupported
                      ? 'bg-brand-primary text-white shadow-glow'
                      : 'bg-surface-elev2 hover:bg-surface-elev3 text-surface-text dark:bg-darkSurface-elev2 dark:hover:bg-darkSurface-elev3 dark:text-darkSurface-text border border-surface-border dark:border-darkSurface-border'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>
                    {post.hasUserSupported ? 'Supported' : 'Support this request'} ({post.supportCount})
                  </span>
                </button>

                {onOpenReportContent && (
                  <button
                    type="button"
                    onClick={() => onOpenReportContent('POST', post.id)}
                    className="text-xs text-surface-muted dark:text-darkSurface-muted hover:text-red-500 flex items-center gap-1 transition-colors"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>Report post</span>
                  </button>
                )}
              </div>

              {/* Threaded Comments & Replies */}
              <div className="space-y-4 pt-2">
                <h3 className="font-bold text-sm font-display text-surface-text dark:text-darkSurface-text">
                  Discussion & Replies ({comments.length})
                </h3>

                {/* Comment Input Box */}
                <form onSubmit={handleAddComment} className="space-y-2">
                  {replyingToCommentId && (
                    <div className="flex items-center justify-between text-xs text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-3.5 py-1.5 rounded-xl">
                      <span>Replying to comment...</span>
                      <button
                        type="button"
                        onClick={() => setReplyingToCommentId(null)}
                        className="text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text font-bold"
                      >
                        Cancel reply
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Add to discussion or share context..."
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev2 text-xs text-surface-text dark:text-darkSurface-text placeholder:text-surface-muted dark:placeholder:text-darkSurface-muted focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingComment || !newCommentText.trim()}
                      className="p-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant hover:brightness-110 text-white font-bold shadow-glow disabled:opacity-50 transition-all shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </form>

                {/* Comment List */}
                <div className="space-y-3 pt-2">
                  {comments.length === 0 ? (
                    <p className="text-xs text-surface-muted dark:text-darkSurface-muted text-center py-4">
                      No replies yet. Be the first to share insights!
                    </p>
                  ) : (
                    comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="p-4 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-surface-text dark:text-darkSurface-text">
                              {comment.authorName}
                            </span>
                            {comment.isOfficialResponse && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                                <ShieldCheck className="w-3 h-3 text-emerald-500" />
                                <span>Mock.AI Team ✓</span>
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-surface-muted dark:text-darkSurface-muted font-mono">
                            {new Date(comment.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-surface-text dark:text-darkSurface-text leading-relaxed">
                          {comment.content}
                        </p>

                        <div className="flex items-center gap-3 pt-1 text-[11px] text-surface-muted dark:text-darkSurface-muted">
                          <button
                            type="button"
                            onClick={() => setReplyingToCommentId(comment.id)}
                            className="hover:text-brand-primary font-semibold transition-colors"
                          >
                            Reply
                          </button>
                          {onOpenReportContent && (
                            <button
                              type="button"
                              onClick={() => onOpenReportContent('COMMENT', comment.id)}
                              className="hover:text-red-500 transition-colors"
                            >
                              Report
                            </button>
                          )}
                        </div>

                        {/* Nested Replies */}
                        {comment.replies && comment.replies.length > 0 && (
                          <div className="pl-4 border-l-2 border-brand-primary/20 space-y-2 mt-2.5">
                            {comment.replies.map((reply) => (
                              <div key={reply.id} className="pt-1.5 text-xs space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-surface-text dark:text-darkSurface-text">
                                    {reply.authorName}
                                  </span>
                                  {reply.isOfficialResponse && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                                      <ShieldCheck className="w-3 h-3 text-emerald-500" />
                                      <span>Mock.AI Team ✓</span>
                                    </span>
                                  )}
                                  <span className="text-[10px] text-surface-muted dark:text-darkSurface-muted ml-auto font-mono">
                                    {new Date(reply.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <p className="text-surface-muted dark:text-darkSurface-muted">{reply.content}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
