import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, BookOpen, Search, CheckCircle2, ChevronDown, ChevronRight, FileText, ExternalLink } from 'lucide-react';
import { CompetitiveExam, SyllabusSection, SyllabusTopic } from '../../types';

export interface SyllabusModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: CompetitiveExam;
}

export const SyllabusModal: React.FC<SyllabusModalProps> = ({
  isOpen,
  onClose,
  exam,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  // Preserve & return focus
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElement.current = document.activeElement as HTMLElement;
      // Initialize all sections as expanded
      if (exam.syllabus?.sections) {
        const initialExpanded: Record<string, boolean> = {};
        exam.syllabus.sections.forEach((sec, idx) => {
          initialExpanded[sec.title || String(idx)] = true;
        });
        setExpandedSections(initialExpanded);
      }
    } else if (previouslyFocusedElement.current) {
      previouslyFocusedElement.current.focus();
    }
  }, [isOpen, exam]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Keyboard navigation: Escape key closes modal & Tab trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleSection = (title: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  const sections = exam.syllabus?.sections || [];
  const hasSyllabus = sections.length > 0;

  // Filter sections and topics based on search query
  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sections;

    return sections
      .map((sec) => {
        const matchesSectionTitle = sec.title.toLowerCase().includes(q);
        const matchesDescription = sec.description?.toLowerCase().includes(q);

        const filteredTopics = sec.topics.filter((topic) => {
          if (typeof topic === 'string') {
            return topic.toLowerCase().includes(q);
          }
          const matchesTopicName = topic.name.toLowerCase().includes(q);
          const matchesSubtopics = topic.subtopics?.some((sub) =>
            sub.toLowerCase().includes(q)
          );
          return matchesTopicName || matchesSubtopics;
        });

        if (matchesSectionTitle || matchesDescription || filteredTopics.length > 0) {
          return {
            ...sec,
            topics: matchesSectionTitle || matchesDescription ? sec.topics : filteredTopics,
          };
        }
        return null;
      })
      .filter((sec): sec is SyllabusSection => sec !== null);
  }, [sections, searchQuery]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="syllabus-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={modalRef}
        className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between p-5 sm:p-6 border-b border-surface-border dark:border-darkSurface-border bg-surface-elev1/40 dark:bg-darkSurface-elev2/40">
          <div className="space-y-1 pr-4">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                {exam.category}
              </span>
              <span className="text-xs font-semibold text-surface-muted dark:text-darkSurface-muted">
                {exam.organization}
              </span>
            </div>
            <h2
              id="syllabus-modal-title"
              className="text-xl sm:text-2xl font-extrabold font-display text-surface-text dark:text-darkSurface-text"
            >
              {exam.name} Official Syllabus
            </h2>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
              {exam.fullName}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close syllabus"
            className="p-2 rounded-xl text-surface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar (if syllabus exists) */}
        {hasSyllabus && (
          <div className="p-4 sm:px-6 border-b border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1">
            <div className="relative">
              <Search className="w-4 h-4 text-surface-muted dark:text-darkSurface-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics, subjects, or keywords (e.g. Algebra, Reasoning, Grammar)..."
                aria-label="Search syllabus topics"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev1 dark:bg-darkSurface-elev2 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all placeholder:text-surface-muted dark:placeholder:text-darkSurface-muted"
              />
            </div>
          </div>
        )}

        {/* Modal Body / Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {!hasSyllabus ? (
            /* Empty State */
            <div className="py-12 px-4 text-center space-y-3.5">
              <div className="w-12 h-12 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border flex items-center justify-center mx-auto text-surface-muted dark:text-darkSurface-muted">
                <BookOpen className="w-6 h-6 text-brand-primary" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-sm font-bold text-surface-text dark:text-darkSurface-text">
                  Syllabus information is not available for this exam yet.
                </h3>
                <p className="text-xs text-surface-muted dark:text-darkSurface-muted leading-relaxed">
                  The verified syllabus for {exam.name} is currently being compiled from official examination notifications. Please refer to Exam Pattern & Instructions for active evaluation schemes.
                </p>
              </div>
            </div>
          ) : filteredSections.length === 0 ? (
            /* No search results */
            <div className="py-10 text-center space-y-2">
              <p className="text-xs font-semibold text-surface-muted dark:text-darkSurface-muted">
                No syllabus topics found matching &quot;{searchQuery}&quot;.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs font-bold text-brand-primary hover:underline"
              >
                Clear search filter
              </button>
            </div>
          ) : (
            /* Syllabus Sections List */
            <div className="space-y-4">
              {exam.syllabus?.officialNoticeRef && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-brand-primary/5 border border-brand-primary/15 text-xs text-brand-primary font-semibold">
                  <FileText className="w-4 h-4 shrink-0" />
                  <span>Verified Source: {exam.syllabus.officialNoticeRef}</span>
                </div>
              )}

              {filteredSections.map((sec, sIdx) => {
                const isExpanded = expandedSections[sec.title || String(sIdx)] !== false;
                return (
                  <div
                    key={sec.title || sIdx}
                    className="rounded-2xl border border-surface-border dark:border-darkSurface-border bg-surface-elev1/30 dark:bg-darkSurface-elev2/30 overflow-hidden transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSection(sec.title || String(sIdx))}
                      aria-expanded={isExpanded}
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-surface-elev1/70 dark:hover:bg-darkSurface-elev2/70 transition-colors"
                    >
                      <div className="space-y-0.5 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-brand-primary/10 text-brand-primary text-[11px] font-bold flex items-center justify-center shrink-0">
                            {sIdx + 1}
                          </span>
                          <h3 className="font-bold text-sm text-surface-text dark:text-darkSurface-text">
                            {sec.title}
                          </h3>
                        </div>
                        {sec.description && (
                          <p className="text-xs text-surface-muted dark:text-darkSurface-muted pl-7">
                            {sec.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-surface-muted dark:text-darkSurface-muted shrink-0">
                        <span className="text-[11px] font-semibold hidden sm:inline">
                          {sec.topics.length} Topics
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-4 pt-1 border-t border-surface-border/50 dark:border-darkSurface-border/50 space-y-3 bg-white/50 dark:bg-darkSurface-elev1/50">
                        {sec.topics.map((item, tIdx) => {
                          const topic: SyllabusTopic =
                            typeof item === 'string' ? { name: item } : item;
                          return (
                            <div
                              key={tIdx}
                              className="p-3 rounded-xl bg-surface-elev1/50 dark:bg-darkSurface-elev2/50 border border-surface-border/40 dark:border-darkSurface-border/40 space-y-2"
                            >
                              <div className="flex items-center gap-2 text-xs font-bold text-surface-text dark:text-darkSurface-text">
                                <span className="w-1.5 h-1.5 rounded-full bg-brand-primary shrink-0" />
                                <span>{topic.name}</span>
                              </div>

                              {topic.subtopics && topic.subtopics.length > 0 && (
                                <div className="pl-3.5 flex flex-wrap gap-1.5 pt-1">
                                  {topic.subtopics.map((sub, subIdx) => (
                                    <span
                                      key={subIdx}
                                      className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-medium bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted dark:text-darkSurface-muted border border-surface-border/60 dark:border-darkSurface-border/60"
                                    >
                                      {sub}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:px-6 border-t border-surface-border dark:border-darkSurface-border bg-surface-elev1/40 dark:bg-darkSurface-elev2/40 flex items-center justify-between">
          <div className="text-[11px] text-surface-muted dark:text-darkSurface-muted">
            {hasSyllabus
              ? `${sections.length} syllabus sections covering official exam modules`
              : 'Official syllabus verification in progress'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 hover:bg-surface-elev3 dark:hover:bg-darkSurface-elev3 text-surface-text dark:text-darkSurface-text text-xs font-bold border border-surface-border dark:border-darkSurface-border transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
