import React, { useState, useMemo, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  CheckCircle2,
  Filter,
  Search,
  BookOpen,
  ArrowRight,
  Eye,
  Check,
  Save,
  RefreshCw,
} from 'lucide-react';
import { getPapersForExam, COMPETITIVE_EXAMS_CATALOG } from '../../data/exams/catalog';
import { getExamTaxonomy } from '../../services/taxonomy/topicTaxonomy';
import {
  getQuestionTopicMetadata,
  UNCATEGORIZED_TOPIC_ID,
} from '../../services/taxonomy/topicClassifier';
import { TopicClassificationStore } from '../../services/taxonomy/topicClassificationStore';
import {
  CompetitiveQuestion,
  QuestionTopicMetadata,
  TopicClassificationStatus,
} from '../../types';
import {
  TopicPracticeService,
  getClassificationTrustLevel,
} from '../../services/practice/topicPracticeService';
import { TopicPracticeCloudSync } from '../../services/practice/topicPracticeCloudSync';
import { isRemoteUser } from '../../services/examSessionService';

function isHighRiskOcrStem(stem: string): boolean {
  const trimmed = (stem || '').trim();
  if (!trimmed) return false;
  if (/^Comprehension:/i.test(trimmed)) return false;
  // Mid-stem Q. N duplication (not a harmless leading Q.13 prefix)
  const hasMidStemQNum = /\bQ\.\s*\d+\b/.test(trimmed) && !(/^Q\.\s*\d+\b/.test(trimmed) && !/\bQ\.\s*\d+\b/.test(trimmed.slice(6)));
  return hasMidStemQNum;
}

interface ReviewItem {
  paperId: string;
  paperTitle: string;
  examId: string;
  question: CompetitiveQuestion;
  metadata: QuestionTopicMetadata;
}

export interface TopicReviewQueueProps {
  reviewerId?: string | null;
  isVerifiedStaff?: boolean;
}

function isPendingStatus(status: TopicClassificationStatus): boolean {
  return status === 'REVIEW_REQUIRED' || status === 'PENDING_REVIEW';
}

function isUnclassifiedStatus(status: TopicClassificationStatus): boolean {
  return status === 'UNCLASSIFIED' || status === 'UNCATEGORIZED';
}

export const TopicReviewQueue: React.FC<TopicReviewQueueProps> = ({
  reviewerId,
  isVerifiedStaff = false,
}) => {
  const [selectedExamId, setSelectedExamId] = useState<string>('gate');
  const [selectedPaperFilter, setSelectedPaperFilter] = useState<string>('ALL');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('ALL');
  const [ocrHighRiskOnly, setOcrHighRiskOnly] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<
    'ALL' | 'REVIEW_REQUIRED' | 'UNCLASSIFIED' | 'VERIFIED' | 'PROVISIONAL_RULE' | 'REJECTED'
  >('REVIEW_REQUIRED');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [revision, setRevision] = useState<number>(0);

  // Form state for selected question
  const [assignedSubjectId, setAssignedSubjectId] = useState<string>('');
  const [assignedTopicId, setAssignedTopicId] = useState<string>('');
  const [assignedSubtopicId, setAssignedSubtopicId] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [hydrationNote, setHydrationNote] = useState<string | null>(null);

  const hasVerifiedStaffAuth = Boolean(
    isVerifiedStaff && reviewerId && isRemoteUser(reviewerId)
  );

  // Bind staff-scoped local cache strictly to authenticated staff reviewerId
  useEffect(() => {
    TopicClassificationStore.setActiveStaffUser(hasVerifiedStaffAuth ? reviewerId || null : null);
    setRevision((r) => r + 1);
  }, [reviewerId, hasVerifiedStaffAuth]);

  // Hydrate authoritative classification overrides from Supabase on exam change
  useEffect(() => {
    let active = true;
    TopicPracticeCloudSync.hydrateVerifiedClassificationsRemote(selectedExamId)
      .then((res) => {
        if (!active) return;
        if (res.error) {
          setHydrationNote(`Cloud sync unavailable (${res.error}). Showing cached classifications.`);
        } else {
          setHydrationNote(null);
          if (res.applied > 0) {
            TopicPracticeService.clearIndexCache();
            setRevision((r) => r + 1);
          }
        }
      })
      .catch(() => {
        if (active) setHydrationNote('Cloud sync unavailable. Showing cached classifications.');
      });
    return () => {
      active = false;
    };
  }, [selectedExamId]);

  const taxonomy = useMemo(() => getExamTaxonomy(selectedExamId), [selectedExamId]);

  const examPapersList = useMemo(() => {
    return getPapersForExam(selectedExamId).map((p) => ({ id: p.id, title: p.title }));
  }, [selectedExamId]);

  // Load all questions across papers for the selected exam (recomputes immediately after staff decisions)
  const allQuestions: ReviewItem[] = useMemo(() => {
    const papers = getPapersForExam(selectedExamId);
    const items: ReviewItem[] = [];

    for (const paper of papers) {
      if (!paper.questions) continue;
      for (const q of paper.questions) {
        const meta = getQuestionTopicMetadata(q, selectedExamId, q.sectionName || q.sectionId);
        items.push({
          paperId: paper.id,
          paperTitle: paper.title,
          examId: selectedExamId,
          question: q,
          metadata: meta,
        });
      }
    }
    return items;
  }, [selectedExamId, revision]);

  // Filter questions according to paper, subject, OCR risk, status, and search query
  const filteredQuestions = useMemo(() => {
    return allQuestions.filter((item) => {
      if (selectedPaperFilter !== 'ALL' && item.paperId !== selectedPaperFilter) return false;
      if (selectedSubjectFilter !== 'ALL' && taxonomy) {
        const subj = taxonomy.subjects.find((s) => s.id === selectedSubjectFilter);
        const matchesSubj = subj?.topics.some(
          (t) =>
            t.id === item.metadata.primaryTopicId ||
            t.subtopics?.some((st) => st.id === item.metadata.subtopicId)
        );
        if (!matchesSubj) return false;
      }
      if (ocrHighRiskOnly && !isHighRiskOcrStem(item.question.questionText)) return false;

      const status = item.metadata.classificationStatus;
      const trust = getClassificationTrustLevel(item.metadata);
      if (filterStatus === 'REVIEW_REQUIRED' && !isPendingStatus(status)) return false;
      if (filterStatus === 'UNCLASSIFIED' && !isUnclassifiedStatus(status)) return false;
      if (filterStatus === 'VERIFIED' && status !== 'VERIFIED') return false;
      if (filterStatus === 'PROVISIONAL_RULE' && trust !== 'RULE_BASED_PROVISIONAL') return false;
      if (filterStatus === 'REJECTED' && status !== 'REJECTED') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesText = item.question.questionText.toLowerCase().includes(q);
        const matchesId = item.question.id.toLowerCase().includes(q);
        const matchesTopic = (item.metadata.primaryTopicName || '').toLowerCase().includes(q);
        if (!matchesText && !matchesId && !matchesTopic) return false;
      }

      return true;
    });
  }, [
    allQuestions,
    selectedPaperFilter,
    selectedSubjectFilter,
    ocrHighRiskOnly,
    taxonomy,
    filterStatus,
    searchQuery,
  ]);

  // Summary counts (explicitly separating Staff/Official verified from Provisional Rule-Based)
  const counts = useMemo(() => {
    let reviewRequired = 0;
    let unclassified = 0;
    let verified = 0;
    let staffVerified = 0;
    let provisionalRule = 0;
    let rejected = 0;

    for (const item of allQuestions) {
      const st = item.metadata.classificationStatus;
      const trust = getClassificationTrustLevel(item.metadata);
      if (isPendingStatus(st)) reviewRequired++;
      else if (isUnclassifiedStatus(st)) unclassified++;
      else if (st === 'VERIFIED') {
        verified++;
        if (trust === 'STAFF_VERIFIED') staffVerified++;
        else provisionalRule++;
      } else if (st === 'REJECTED') rejected++;
    }

    return {
      reviewRequired,
      unclassified,
      verified,
      staffVerified,
      provisionalRule,
      rejected,
      total: allQuestions.length,
    };
  }, [allQuestions]);

  // Audit trail for selected question (strictly scoped to authenticated staff reviewer)
  const selectedAuditLog = useMemo(() => {
    if (!selectedItem || !hasVerifiedStaffAuth || !reviewerId) return [];
    return TopicClassificationStore.getAuditLog(selectedItem.question.id, reviewerId);
  }, [selectedItem, revision, hasVerifiedStaffAuth, reviewerId]);

  // Handle selecting a question to review
  const handleSelectItem = (item: ReviewItem) => {
    setSelectedItem(item);
    setSaveSuccess(null);
    setSaveError(null);
    setReviewNotes(item.metadata.reviewNotes || '');

    // Attempt to match current metadata to taxonomy
    if (taxonomy) {
      let matchedSubject = '';
      for (const subj of taxonomy.subjects) {
        if (
          subj.topics.some(
            (t) =>
              t.id === item.metadata.primaryTopicId ||
              t.subtopics?.some((s) => s.id === item.metadata.primaryTopicId)
          )
        ) {
          matchedSubject = subj.id;
          break;
        }
      }
      setAssignedSubjectId(matchedSubject || taxonomy.subjects[0]?.id || '');
      setAssignedTopicId(
        item.metadata.primaryTopicId && item.metadata.primaryTopicId !== UNCATEGORIZED_TOPIC_ID
          ? item.metadata.primaryTopicId
          : ''
      );
      setAssignedSubtopicId(item.metadata.subtopicId || '');
    }
  };

  // Available topics for currently assigned subject
  const availableTopics = useMemo(() => {
    if (!taxonomy || !assignedSubjectId) return [];
    const subj = taxonomy.subjects.find((s) => s.id === assignedSubjectId);
    return subj ? subj.topics : [];
  }, [taxonomy, assignedSubjectId]);

  // Available subtopics for currently assigned topic
  const availableSubtopics = useMemo(() => {
    const topic = availableTopics.find((t) => t.id === assignedTopicId);
    return topic?.subtopics || [];
  }, [availableTopics, assignedTopicId]);

  // Commit review change via atomic transactional RPC (never fakes cloud persistence on failure)
  const handleSaveReview = async (status: TopicClassificationStatus) => {
    if (!selectedItem || !taxonomy || isSaving) return;
    setSaveError(null);
    setSaveSuccess(null);

    if (!hasVerifiedStaffAuth || !reviewerId) {
      setSaveError(
        'Verified staff authentication is required before approving, flagging, or rejecting classifications.'
      );
      return;
    }

    const top = availableTopics.find((t) => t.id === assignedTopicId);
    const sub = availableSubtopics.find((s) => s.id === assignedSubtopicId);

    if (status === 'VERIFIED' && !top) {
      setSaveError('Please assign a canonical syllabus topic before approving.');
      return;
    }

    setIsSaving(true);
    try {
      const subj = taxonomy.subjects.find((s) => s.id === assignedSubjectId);
      const effectiveTopicId = status === 'REJECTED' ? null : top?.id || UNCATEGORIZED_TOPIC_ID;
      const effectiveTopicName = status === 'REJECTED' ? null : top?.name || null;

      // 1. Execute atomic transactional PostgreSQL RPC first — never report success without server confirmation
      const rpcRes = await TopicPracticeCloudSync.syncStaffClassificationRemote({
        questionId: selectedItem.question.id,
        examId: selectedItem.examId,
        paperId: selectedItem.paperId,
        subjectId: assignedSubjectId,
        subjectName: subj?.name || assignedSubjectId,
        topicId: effectiveTopicId,
        topicName: effectiveTopicName,
        subtopicId: status === 'REJECTED' ? null : sub?.id || null,
        subtopicName: status === 'REJECTED' ? null : sub?.name || null,
        status,
        reviewNotes,
        expectedStaffUserId: reviewerId,
        expectedUpdatedAt:
          (selectedItem.metadata as any)?.serverUpdatedAt ||
          selectedItem.metadata.reviewedAt ||
          null,
      });

      if (!rpcRes.ok || !rpcRes.serverResult) {
        // Preserve pending form edits so staff can retry or resolve conflicts safely
        setSaveError(
          rpcRes.error ||
            'Cloud persistence failed. Your pending edits were preserved locally — please retry when connected.'
        );
        return;
      }

      const confirmed = rpcRes.serverResult;
      const confirmedTs = confirmed.updated_at
        ? new Date(confirmed.updated_at).getTime()
        : Date.now();

      // 2. Persist confirmed server decision into staff-scoped store & public override cache
      const { metadata } = TopicClassificationStore.saveStaffDecision({
        questionId: selectedItem.question.id,
        examId: selectedItem.examId,
        paperId: selectedItem.paperId,
        subjectId: assignedSubjectId,
        topicId: effectiveTopicId,
        topicName: effectiveTopicName,
        subtopicId: status === 'REJECTED' ? null : sub?.id || null,
        subtopicName: status === 'REJECTED' ? null : sub?.name || null,
        status: confirmed.classification_status,
        previousStatus: selectedItem.metadata.classificationStatus,
        reviewNotes,
        reviewedBy: confirmed.reviewed_by,
        reviewedAt: confirmedTs,
        auditId: confirmed.audit_id,
      });

      setSelectedItem({ ...selectedItem, metadata });
      TopicPracticeService.clearIndexCache();
      setRevision((r) => r + 1);

      setSaveSuccess(
        `Cloud-confirmed as ${confirmed.classification_status} (Audit ID: ${confirmed.audit_id.slice(0, 8)}…). Student pool updated.`
      );
      setTimeout(() => setSaveSuccess(null), 5000);
    } catch (err: any) {
      setSaveError(
        err?.message || 'Failed to persist classification decision. Pending edits have been preserved.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar with Exam & Status Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-surface-text dark:text-darkSurface-text">
              Topic Classification & Syllabus Audit Queue
            </h2>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
              Verify uncertain question mappings before they enter student-facing practice pools.
            </p>
          </div>
        </div>

        {/* Exam, Paper, Subject & OCR Triage Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-bold text-surface-muted">Exam:</label>
          <select
            aria-label="Exam filter"
            value={selectedExamId}
            onChange={(e) => {
              setSelectedExamId(e.target.value);
              setSelectedPaperFilter('ALL');
              setSelectedSubjectFilter('ALL');
              setSelectedItem(null);
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border focus:outline-none"
          >
            {COMPETITIVE_EXAMS_CATALOG.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Paper filter"
            value={selectedPaperFilter}
            onChange={(e) => {
              setSelectedPaperFilter(e.target.value);
              setSelectedItem(null);
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border focus:outline-none max-w-[180px]"
          >
            <option value="ALL">All Papers ({examPapersList.length})</option>
            {examPapersList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id}
              </option>
            ))}
          </select>

          <select
            aria-label="Subject filter"
            value={selectedSubjectFilter}
            onChange={(e) => {
              setSelectedSubjectFilter(e.target.value);
              setSelectedItem(null);
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border focus:outline-none max-w-[180px]"
          >
            <option value="ALL">All Subjects</option>
            {taxonomy?.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            aria-pressed={ocrHighRiskOnly}
            onClick={() => setOcrHighRiskOnly((prev) => !prev)}
            className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors ${
              ocrHighRiskOnly
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-surface-elev1 dark:bg-darkSurface-elev2 border-surface-border dark:border-darkSurface-border text-surface-muted hover:text-surface-text'
            }`}
          >
            High-Risk OCR Only
          </button>
        </div>
      </div>

      {/* Audit Stats Banner (distinguishing Staff Verified vs Provisional Rule-Based) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => setFilterStatus('ALL')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filterStatus === 'ALL'
              ? 'bg-brand-primary/10 border-brand-primary text-brand-primary'
              : 'bg-white dark:bg-darkSurface-elev1 border-surface-border text-surface-text dark:text-darkSurface-text'
          }`}
        >
          <div className="text-xs font-bold text-surface-muted">Total Questions</div>
          <div className="text-xl font-extrabold mt-1">{counts.total}</div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus('VERIFIED')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filterStatus === 'VERIFIED'
              ? 'bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300'
              : 'bg-white dark:bg-darkSurface-elev1 border-surface-border text-surface-text dark:text-darkSurface-text'
          }`}
        >
          <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Verified
          </div>
          <div className="text-xl font-extrabold mt-1 text-emerald-600 dark:text-emerald-400">
            {counts.verified}
          </div>
          <div className="text-[10px] text-surface-muted mt-0.5">
            {counts.staffVerified} staff/official
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus('PROVISIONAL_RULE')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filterStatus === 'PROVISIONAL_RULE'
              ? 'bg-indigo-500/10 border-indigo-500 text-indigo-700 dark:text-indigo-300'
              : 'bg-white dark:bg-darkSurface-elev1 border-surface-border text-surface-text dark:text-darkSurface-text'
          }`}
        >
          <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Rule-Based
          </div>
          <div className="text-xl font-extrabold mt-1 text-indigo-600 dark:text-indigo-400">
            {counts.provisionalRule}
          </div>
          <div className="text-[10px] text-surface-muted mt-0.5">Awaiting staff sign-off</div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus('REVIEW_REQUIRED')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filterStatus === 'REVIEW_REQUIRED'
              ? 'bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-300'
              : 'bg-white dark:bg-darkSurface-elev1 border-surface-border text-surface-text dark:text-darkSurface-text'
          }`}
        >
          <div className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Pending Review
          </div>
          <div className="text-xl font-extrabold mt-1 text-amber-600 dark:text-amber-400">
            {counts.reviewRequired}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus('UNCLASSIFIED')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filterStatus === 'UNCLASSIFIED'
              ? 'bg-red-500/10 border-red-500 text-red-700 dark:text-red-300'
              : 'bg-white dark:bg-darkSurface-elev1 border-surface-border text-surface-text dark:text-darkSurface-text'
          }`}
        >
          <div className="text-xs font-bold text-red-500 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" /> Unclassified
          </div>
          <div className="text-xl font-extrabold mt-1 text-red-500">
            {counts.unclassified}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus('REJECTED')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filterStatus === 'REJECTED'
              ? 'bg-rose-500/10 border-rose-500 text-rose-700 dark:text-rose-300'
              : 'bg-white dark:bg-darkSurface-elev1 border-surface-border text-surface-text dark:text-darkSurface-text'
          }`}
        >
          <div className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Rejected
          </div>
          <div className="text-xl font-extrabold mt-1 text-rose-600 dark:text-rose-400">
            {counts.rejected}
          </div>
        </button>
      </div>

      {/* Main Review Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Questions List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-surface-muted" />
            <input
              type="text"
              placeholder="Search by text, ID, or topic..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs font-semibold pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border focus:outline-none"
            />
          </div>

          <div className="max-h-[600px] overflow-y-auto space-y-2 pr-1">
            {filteredQuestions.length === 0 ? (
              <div className="p-8 text-center text-xs text-surface-muted bg-white dark:bg-darkSurface-elev1 rounded-2xl border border-surface-border dark:border-darkSurface-border">
                No questions match the current filter.
              </div>
            ) : (
              filteredQuestions.map((item) => {
                const isSelected = selectedItem?.question.id === item.question.id;
                const status = item.metadata.classificationStatus;

                return (
                  <div
                    key={item.question.id}
                    onClick={() => handleSelectItem(item)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-brand-primary/10 border-brand-primary shadow-sm'
                        : 'bg-white dark:bg-darkSurface-elev1 border-surface-border hover:border-surface-borderHover'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[11px]">
                      <span className="font-extrabold text-surface-text dark:text-darkSurface-text">
                        {item.question.id}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          status === 'VERIFIED'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : status === 'REVIEW_REQUIRED'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-red-500/10 text-red-500'
                        }`}
                      >
                        {status}
                      </span>
                    </div>

                    <p className="text-xs text-surface-muted dark:text-darkSurface-muted line-clamp-2 mt-1">
                      {item.question.questionText}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-surface-muted mt-2 pt-2 border-t border-surface-border/50">
                      <span>{item.paperTitle.slice(0, 24)}...</span>
                      <span className="font-semibold text-brand-primary">
                        {item.metadata.primaryTopicName || 'Unmapped'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Review & Classification Form (7 cols) */}
        <div className="lg:col-span-7">
          {selectedItem ? (
            <div className="rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-5 sm:p-6 space-y-5 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-surface-border dark:border-darkSurface-border">
                <div>
                  <div className="text-xs font-bold text-surface-muted">{selectedItem.paperTitle}</div>
                  <h3 className="text-base font-extrabold text-surface-text dark:text-darkSurface-text mt-0.5">
                    Question Review: {selectedItem.question.id}
                  </h3>
                </div>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    selectedItem.metadata.classificationStatus === 'VERIFIED'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : selectedItem.metadata.classificationStatus === 'REVIEW_REQUIRED'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-red-500/10 text-red-500'
                  }`}
                >
                  {selectedItem.metadata.classificationStatus}
                </span>
              </div>

              {/* Question Stem Content */}
              <div className="p-4 rounded-xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-surface-muted">
                  Question Stem
                </div>
                <div className="text-xs leading-relaxed text-surface-text dark:text-darkSurface-text whitespace-pre-wrap font-mono">
                  {selectedItem.question.questionText}
                </div>

                {selectedItem.question.options && selectedItem.question.options.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-surface-border dark:border-darkSurface-border">
                    <span className="text-[10px] font-bold uppercase text-surface-muted">Options:</span>
                    {selectedItem.question.options.map((opt, oIdx) => (
                      <div key={oIdx} className="text-xs font-mono text-surface-muted">
                        ({String.fromCharCode(65 + oIdx)}) {opt}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Existing vs Proposed Classification Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-surface-elev2/60 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border text-xs">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-surface-muted">
                    Existing Classification ({selectedItem.metadata.classificationSource})
                  </div>
                  <div className="font-bold text-surface-text dark:text-darkSurface-text mt-1">
                    {selectedItem.metadata.primaryTopicName || 'Unclassified'}
                    {selectedItem.metadata.subtopicName ? ` → ${selectedItem.metadata.subtopicName}` : ''}
                  </div>
                  <div className="text-[11px] text-surface-muted mt-0.5">
                    Source Paper: <span className="font-mono">{selectedItem.paperId}</span> • Trust:{' '}
                    <span className="font-bold">
                      {getClassificationTrustLevel(selectedItem.metadata)}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-surface-muted">
                    Proposed Assignment
                  </div>
                  <div className="font-bold text-brand-primary mt-1">
                    {availableTopics.find((t) => t.id === assignedTopicId)?.name || 'Unassigned'}
                    {assignedSubtopicId
                      ? ` → ${availableSubtopics.find((s) => s.id === assignedSubtopicId)?.name || assignedSubtopicId}`
                      : ''}
                  </div>
                  <div className="text-[11px] text-surface-muted mt-0.5">
                    Subject: {taxonomy?.subjects.find((s) => s.id === assignedSubjectId)?.name || 'None'}
                  </div>
                </div>
              </div>

              {/* Classification Form */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-surface-muted">
                  Assign Syllabus Classification
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Subject Dropdown */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-surface-muted">Subject:</label>
                    <select
                      value={assignedSubjectId}
                      onChange={(e) => {
                        setAssignedSubjectId(e.target.value);
                        setAssignedTopicId('');
                        setAssignedSubtopicId('');
                      }}
                      className="w-full text-xs font-semibold px-3 py-2 rounded-xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border focus:outline-none"
                    >
                      <option value="">-- Select Subject --</option>
                      {taxonomy?.subjects.map((subj) => (
                        <option key={subj.id} value={subj.id}>
                          {subj.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Topic Dropdown */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-surface-muted">Topic:</label>
                    <select
                      value={assignedTopicId}
                      onChange={(e) => {
                        setAssignedTopicId(e.target.value);
                        setAssignedSubtopicId('');
                      }}
                      disabled={!assignedSubjectId}
                      className="w-full text-xs font-semibold px-3 py-2 rounded-xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border focus:outline-none disabled:opacity-50"
                    >
                      <option value="">-- Select Topic --</option>
                      {availableTopics.map((top) => (
                        <option key={top.id} value={top.id}>
                          {top.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Subtopic Dropdown (if available) */}
                {availableSubtopics.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-surface-muted">
                      Subtopic (Granular):
                    </label>
                    <select
                      value={assignedSubtopicId}
                      onChange={(e) => setAssignedSubtopicId(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 rounded-xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border focus:outline-none"
                    >
                      <option value="">-- Optional Subtopic --</option>
                      {availableSubtopics.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Staff Review Notes */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-surface-muted">
                    Review Notes / Syllabus Evidence:
                  </label>
                  <textarea
                    rows={2}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="e.g. Question directly covers Decision Trees entropy formula from GATE Section 5."
                    className="w-full text-xs font-semibold p-3 rounded-xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border focus:outline-none"
                  />
                </div>
              </div>

              {hydrationNote && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  {hydrationNote}
                </div>
              )}

              {!hasVerifiedStaffAuth && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Read-only view: sign in with a verified staff account to approve, flag, or reject classifications.
                  </span>
                </div>
              )}

              {saveError && (
                <div role="alert" className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              {saveSuccess && (
                <div role="status" className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{saveSuccess}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-surface-border dark:border-darkSurface-border">
                <button
                  type="button"
                  disabled={!hasVerifiedStaffAuth || isSaving}
                  onClick={() => handleSaveReview('REJECTED')}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Reject Question
                </button>
                <button
                  type="button"
                  disabled={!hasVerifiedStaffAuth || isSaving}
                  onClick={() => handleSaveReview('PENDING_REVIEW')}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Keep in Review (Ambiguous)
                </button>
                <button
                  type="button"
                  disabled={!hasVerifiedStaffAuth || !assignedTopicId || isSaving}
                  onClick={() => handleSaveReview('VERIFIED')}
                  className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-all ${
                    !hasVerifiedStaffAuth || !assignedTopicId || isSaving
                      ? 'opacity-50 cursor-not-allowed bg-surface-elev2 text-surface-muted'
                      : 'bg-brand-primary hover:bg-brand-primary/90 active:scale-95'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>{isSaving ? 'Saving to Cloud…' : 'Verify & Approve for Practice'}</span>
                </button>
              </div>

              {/* Staff Audit Trail */}
              {selectedAuditLog.length > 0 && (
                <div className="pt-3 border-t border-surface-border dark:border-darkSurface-border space-y-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-surface-muted">
                    Audit Trail ({selectedAuditLog.length})
                  </h4>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {selectedAuditLog.map((entry) => (
                      <div
                        key={entry.id}
                        className="text-[11px] p-2.5 rounded-lg bg-surface-elev2/60 dark:bg-darkSurface-elev2 border border-surface-border/60 dark:border-darkSurface-border flex flex-col gap-0.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-surface-text dark:text-darkSurface-text">
                            {entry.previousStatus || 'NONE'} → {entry.status}
                            {entry.topicName ? ` (${entry.topicName})` : ''}
                          </span>
                          <span className="text-surface-muted">
                            by {entry.reviewedBy} • {new Date(entry.reviewedAt).toLocaleString()}
                          </span>
                        </div>
                        {entry.reviewNotes && (
                          <span className="text-surface-muted italic">{entry.reviewNotes}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center text-xs text-surface-muted bg-white dark:bg-darkSurface-elev1 rounded-2xl border border-dashed border-surface-border dark:border-darkSurface-border flex flex-col items-center justify-center space-y-2">
              <Eye className="w-8 h-8 text-surface-muted opacity-40" />
              <p>Select a question from the queue on the left to inspect and classify.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
