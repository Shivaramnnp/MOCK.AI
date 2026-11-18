import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Target,
  CheckCircle2,
  Clock,
  Filter,
  Layers,
  AlertCircle,
  BarChart3,
  Play,
  Check,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  Award,
  Zap,
  Info,
  CheckSquare,
  RotateCcw,
  ClipboardCheck,
  ChevronRight,
} from 'lucide-react';
import { ExamPaper } from '../types';
import { COMPETITIVE_EXAMS_CATALOG } from '../data/exams/catalog';
import {
  TopicPracticeService,
  PracticeTestConfig,
  TopicPerformanceStat,
  PracticeRecommendation,
  SubjectCatalogItem,
  MAX_PRACTICE_QUESTIONS,
  validatePracticeQuestionCount,
} from '../services/practice/topicPracticeService';
import { TopicPracticeCloudSync } from '../services/practice/topicPracticeCloudSync';
import { isRemoteUser } from '../services/examSessionService';

export interface TopicPracticeScreenProps {
  initialExamId?: string;
  initialSubjectId?: string;
  initialTopicId?: string;
  userId?: string;
  onBack: () => void;
  onStartTest: (paper: ExamPaper) => void;
  onNavigateToFullLength?: (examId: string) => void;
}

/**
 * Mock.AI supports exactly TWO testing modes:
 * 1. FULL_LENGTH — Whole Mock Test (complete examination simulation)
 * 2. TOPIC_PRACTICE — Topic-wise Test (focused practice by subject and topics)
 */
export type TestingMode = 'FULL_LENGTH' | 'TOPIC_PRACTICE';

const DIFFICULTY_OPTIONS: Array<{ id: 'mixed' | 'easy' | 'hard'; label: string; shortLabel: string }> = [
  { id: 'mixed', label: 'Mixed / Balanced', shortLabel: 'Mixed / Balanced' },
  { id: 'easy', label: 'Easy (1 Mark)', shortLabel: 'Easy (1 Mark)' },
  { id: 'hard', label: 'Hard (2 Marks)', shortLabel: 'Hard (2 Marks)' },
];

const SOURCE_OPTIONS: Array<{ id: 'both' | 'pyq' | 'practice'; label: string; shortLabel: string }> = [
  { id: 'both', label: 'All Verified (PYQ + Approved)', shortLabel: 'All Verified (PYQ + Approved)' },
  { id: 'pyq', label: 'Previous-Year Only (PYQ)', shortLabel: 'Previous-Year Only (PYQ)' },
  { id: 'practice', label: 'Approved Practice Only', shortLabel: 'Approved Practice Only' },
];

const PRESET_COUNTS = [5, 10, 20, 30] as const;
const DURATION_PRESETS = [15, 30, 45, 60] as const;

export const TopicPracticeScreen: React.FC<TopicPracticeScreenProps> = ({
  initialExamId = 'gate',
  initialSubjectId,
  initialTopicId,
  userId = 'guest',
  onBack,
  onStartTest,
  onNavigateToFullLength,
}) => {
  // Step & Selection State
  const [selectedExamId, setSelectedExamId] = useState<string>(initialExamId);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(initialSubjectId || '');
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(
    initialTopicId ? [initialTopicId] : []
  );

  // Configuration State
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [customQuestionCount, setCustomQuestionCount] = useState<string>('');
  const [isUntimed, setIsUntimed] = useState<boolean>(false);
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('mixed');
  const [source, setSource] = useState<'pyq' | 'practice' | 'both'>('both');
  // Trust pool mode: strictly defaults to VERIFIED ONLY (false); provisional requires explicit opt-in
  const [includeProvisional, setIncludeProvisional] = useState<boolean>(false);
  const [catalogRevision, setCatalogRevision] = useState<number>(0);

  // Cloud-merged performance history & recommendations state
  const [performanceHistory, setPerformanceHistory] = useState<TopicPerformanceStat[]>(() =>
    TopicPracticeService.getTopicPerformanceHistory(userId, initialExamId)
  );
  const [recommendations, setRecommendations] = useState<PracticeRecommendation[]>(() =>
    TopicPracticeService.getRecommendations(userId, initialExamId)
  );
  const [historyCloudSynced, setHistoryCloudSynced] = useState<boolean>(false);
  const [historyCloudNote, setHistoryCloudNote] = useState<string | null>(null);

  // UI / Feedback State
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Hydrate authoritative staff classifications (VERIFIED, REJECTED, PENDING_REVIEW) from Supabase
  useEffect(() => {
    let active = true;
    TopicPracticeCloudSync.hydrateVerifiedClassificationsRemote(selectedExamId)
      .then((res) => {
        if (active && res.applied > 0) {
          TopicPracticeService.clearIndexCache();
          setCatalogRevision((r) => r + 1);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedExamId]);

  // Fetch & merge cloud practice history + weak-topic recommendations (with honest offline status)
  useEffect(() => {
    let active = true;
    // Immediately render local baseline, then merge authoritative cloud rows
    const localStats = TopicPracticeService.getTopicPerformanceHistory(userId, selectedExamId);
    setPerformanceHistory(localStats);
    setRecommendations(TopicPracticeService.buildRecommendationsFromStats(localStats, selectedExamId));

    if (!isRemoteUser(userId)) {
      setHistoryCloudSynced(false);
      setHistoryCloudNote('Local session history only (sign in for cross-device cloud history).');
      return;
    }

    TopicPracticeService.getRecommendationsMerged(userId, selectedExamId)
      .then((merged) => {
        if (!active) return;
        setPerformanceHistory(merged.stats);
        setRecommendations(merged.recommendations);
        setHistoryCloudSynced(merged.cloudSynced);
        setHistoryCloudNote(
          merged.cloudSynced
            ? null
            : `Offline or cloud unavailable (${merged.cloudError || 'cached only'}) — showing local device history only.`
        );
      })
      .catch(() => {
        if (!active) return;
        setHistoryCloudSynced(false);
        setHistoryCloudNote('Offline — showing local device history only (cloud history not synced).');
      });

    return () => {
      active = false;
    };
  }, [userId, selectedExamId]);

  // Load Exam Catalog and taxonomy (recomputes after cloud classification hydration)
  const examCatalog = useMemo(() => {
    return TopicPracticeService.getPracticeCatalog(selectedExamId);
  }, [selectedExamId, catalogRevision]);

  // Available subjects: show subjects with verified questions OR (in provisional mode / transparently) provisional questions
  const availableSubjects = useMemo(() => {
    return examCatalog.subjects.filter(
      (s) => s.totalQuestions > 0 || s.provisionalQuestions > 0
    );
  }, [examCatalog]);

  // Set default subject if none selected or invalid for current exam
  // When navigating from a weak topic (initialTopicId), prioritize the subject owning that topic!
  useEffect(() => {
    if (availableSubjects.length > 0) {
      if (!selectedSubjectId || !availableSubjects.some((s) => s.id === selectedSubjectId)) {
        const subjectForInitialTopic = initialTopicId
          ? availableSubjects.find((s) =>
              s.topics.some(
                (t) => t.id === initialTopicId || t.subtopics?.some((sub) => sub.id === initialTopicId)
              )
            )
          : undefined;
        const defaultSubj =
          subjectForInitialTopic ||
          availableSubjects.find((s) => s.id === 'data_science_ai') ||
          availableSubjects.find((s) => s.id === 'machine_learning') ||
          availableSubjects[0];
        setSelectedSubjectId(defaultSubj.id);
      }
    }
  }, [availableSubjects, selectedSubjectId, initialTopicId]);

  // Active Subject
  const currentSubject: SubjectCatalogItem | undefined = useMemo(() => {
    return availableSubjects.find((s) => s.id === selectedSubjectId);
  }, [availableSubjects, selectedSubjectId]);

  // Apply initialTopicId ONCE so students can freely uncheck or clear topics afterward
  const appliedInitialTopicRef = useRef<string | null>(null);
  useEffect(() => {
    if (initialTopicId && currentSubject && appliedInitialTopicRef.current !== initialTopicId) {
      const existsInCurrent = currentSubject.topics.some(
        (t) => t.id === initialTopicId || t.subtopics?.some((sub) => sub.id === initialTopicId)
      );
      if (existsInCurrent) {
        appliedInitialTopicRef.current = initialTopicId;
        setSelectedTopicIds([initialTopicId]);
      }
    }
  }, [initialTopicId, currentSubject]);

  // B. Eligible question count: uncapped count matching selected topics, trust mode, & filters
  const eligibleQuestionCount = useMemo(() => {
    if (!selectedTopicIds.length) return 0;
    try {
      const matchingPool = TopicPracticeService.getMatchingQuestionPool(
        selectedExamId,
        selectedTopicIds,
        {
          difficulty,
          source,
          includeProvisional,
        }
      );
      return matchingPool.length;
    } catch {
      return 0;
    }
  }, [selectedExamId, selectedTopicIds, difficulty, source, includeProvisional, catalogRevision]);

  const poolTrustLabel = includeProvisional ? 'eligible (provisional)' : 'verified';

  // A, B, C synchronized validation: requestedCount vs eligibleCount vs plannedGeneratedCount
  const countValidation = useMemo(() => {
    return validatePracticeQuestionCount({
      presetCount: questionCount,
      customInput: customQuestionCount,
      eligibleCount: eligibleQuestionCount,
      selectedTopicCount: selectedTopicIds.length,
      poolLabel: poolTrustLabel,
    });
  }, [questionCount, customQuestionCount, eligibleQuestionCount, selectedTopicIds.length, poolTrustLabel]);

  const hasCountValidationError =
    countValidation.errorCode === 'INVALID_FORMAT' ||
    countValidation.errorCode === 'NON_POSITIVE' ||
    countValidation.errorCode === 'EXCEEDS_ELIGIBLE' ||
    countValidation.errorCode === 'EXCEEDS_MAX_LIMIT';

  const canExplicitlyAdjustCount =
    (countValidation.errorCode === 'EXCEEDS_ELIGIBLE' ||
      countValidation.errorCode === 'EXCEEDS_MAX_LIMIT') &&
    countValidation.maxAllowed > 0;

  // Human-readable names of selected topics/subtopics for the Live Test Summary
  const selectedTopicLabels = useMemo(() => {
    if (!currentSubject || selectedTopicIds.length === 0) return [];
    const labelMap = new Map<string, string>();
    for (const top of currentSubject.topics) {
      labelMap.set(top.id, top.name);
      if (top.subtopics) {
        for (const sub of top.subtopics) {
          labelMap.set(sub.id, sub.name);
        }
      }
    }
    return selectedTopicIds.map((id) => ({
      id,
      name: labelMap.get(id) || id,
    }));
  }, [currentSubject, selectedTopicIds]);

  const getTopicPoolCount = (topic: { verifiedQuestionCount: number; provisionalQuestionCount: number }) =>
    includeProvisional
      ? topic.verifiedQuestionCount + topic.provisionalQuestionCount
      : topic.verifiedQuestionCount;

  const selectableTopicCount = useMemo(() => {
    if (!currentSubject) return 0;
    return currentSubject.topics.filter((t) => getTopicPoolCount(t) > 0).length;
  }, [currentSubject, includeProvisional]);

  // Step completion calculation for 5-step progress indicator
  const stepStates = useMemo(() => {
    const step1Done = Boolean(selectedExamId);
    const step2Done = Boolean(selectedSubjectId && currentSubject);
    const step3Done = selectedTopicIds.length > 0;
    const step4Done = step3Done && countValidation.isValid;
    const activeStep = !step1Done ? 1 : !step2Done ? 2 : !step3Done ? 3 : !step4Done ? 4 : 5;

    return {
      activeStep,
      steps: [
        { id: 1, label: 'Examination', anchor: 'step-1-exam', done: step1Done },
        { id: 2, label: 'Subject', anchor: 'step-2-subject', done: step2Done },
        { id: 3, label: 'Topics', anchor: 'step-3-topics', done: step3Done },
        { id: 4, label: 'Configure', anchor: 'step-4-configure', done: step4Done },
        { id: 5, label: 'Review & Start', anchor: 'step-5-summary', done: false },
      ],
    };
  }, [selectedExamId, selectedSubjectId, currentSubject, selectedTopicIds.length, countValidation.isValid]);

  const scrollToSection = (anchorId: string) => {
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Explicit one-click adjustment when requested count exceeds eligible pool or session limit
  const handleAdjustToMaxAllowed = () => {
    if (countValidation.maxAllowed <= 0) return;
    if ((PRESET_COUNTS as readonly number[]).includes(countValidation.maxAllowed)) {
      setQuestionCount(countValidation.maxAllowed);
      setCustomQuestionCount('');
    } else {
      setCustomQuestionCount(String(countValidation.maxAllowed));
    }
    setErrorMessage(null);
  };

  // Toggle single topic or subtopic selection
  const handleToggleTopic = (topicId: string) => {
    setErrorMessage(null);
    setSelectedTopicIds((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId]
    );
  };

  // Select all available topics in current subject
  const handleSelectAllTopics = () => {
    if (!currentSubject) return;
    const all = currentSubject.topics
      .filter((t) => getTopicPoolCount(t) > 0)
      .map((t) => t.id);
    setSelectedTopicIds(all);
    setErrorMessage(null);
  };

  // Clear topic selection
  const handleClearTopics = () => {
    setSelectedTopicIds([]);
    setErrorMessage(null);
  };

  // 1-Click Practice from Recommendation
  const handleStartRecommendation = (rec: PracticeRecommendation) => {
    setSelectedExamId(selectedExamId);
    setSelectedSubjectId(rec.subjectId);
    setSelectedTopicIds([rec.topicId]);
    setQuestionCount(rec.recommendedQuestionCount);
    setCustomQuestionCount('');
    setDifficulty('mixed');
    setSource('both');
    setErrorMessage(null);
    scrollToSection('step-4-configure');
  };

  // Start Practice Test
  const handleStartTest = () => {
    setErrorMessage(null);

    if (!selectedSubjectId) {
      setErrorMessage('Please select a subject to practise.');
      return;
    }

    if (selectedTopicIds.length === 0) {
      setErrorMessage('Please select at least one topic to continue.');
      return;
    }

    if (eligibleQuestionCount === 0) {
      setErrorMessage(
        'No verified questions match your current topic and filter selection. Try adjusting the difficulty or source filter.'
      );
      return;
    }

    if (!countValidation.isValid || countValidation.plannedGeneratedCount <= 0) {
      setErrorMessage(
        countValidation.message || 'Please enter a valid question count before starting the test.'
      );
      return;
    }

    setIsGenerating(true);

    try {
      const config: PracticeTestConfig = {
        examId: selectedExamId,
        subjectId: selectedSubjectId,
        topicIds: selectedTopicIds,
        questionCount: countValidation.plannedGeneratedCount,
        durationMinutes: isUntimed ? 0 : durationMinutes,
        isUntimed,
        difficulty,
        source,
        userId,
        includeProvisional,
      };

      const paper = TopicPracticeService.generatePracticeTest(config);
      onStartTest(paper);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate practice test. Please try again.');
      setIsGenerating(false);
    }
  };

  const selectedExam = COMPETITIVE_EXAMS_CATALOG.find((e) => e.id === selectedExamId);

  const markingSchemeLabel =
    selectedExamId === 'gate'
      ? '1 mark MCQ: -0.33 | 2 mark MCQ: -0.66 | MSQ & NAT: 0 negative mark'
      : '+2.0 correct | -0.50 negative';

  const activeDifficultyLabel =
    DIFFICULTY_OPTIONS.find((d) => d.id === difficulty)?.shortLabel || 'Mixed / Balanced';

  const activeSourceLabel =
    SOURCE_OPTIONS.find((s) => s.id === source)?.shortLabel || 'All Verified (PYQ + Approved)';

  return (
    <div className="min-h-screen bg-surface dark:bg-darkSurface text-surface-text dark:text-darkSurface-text py-6 sm:py-8 px-4 sm:px-6 lg:px-8 overflow-x-clip">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ── Page Header & Two-Mode Switcher ─────────────────────────────────── */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-surface-border dark:border-darkSurface-border">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="p-2.5 rounded-xl bg-white dark:bg-darkSurface-elev1 hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border transition-colors text-surface-muted hover:text-surface-text dark:hover:text-darkSurface-text shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              aria-label="Back to previous screen"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-surface-text dark:text-darkSurface-text">
                  Topic-wise Practice
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verified Pools
                </span>
              </div>
              <p className="text-xs sm:text-sm text-surface-muted dark:text-darkSurface-muted mt-1">
                Build a focused practice test from verified previous-year and approved exam questions.
              </p>
            </div>
          </div>

          {/* Two-Mode Switcher: Whole Mock Test | Topic-wise Test */}
          <div
            role="tablist"
            aria-label="Testing Mode"
            className="inline-flex p-1 rounded-xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm self-start lg:self-auto shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={false}
              onClick={() => {
                if (onNavigateToFullLength) {
                  onNavigateToFullLength(selectedExamId);
                }
              }}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold transition-all text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            >
              Whole Mock Test
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={true}
              className="px-3.5 py-2 rounded-lg text-xs font-bold transition-all bg-brand-primary text-white shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            >
              Topic-wise Test
            </button>
          </div>
        </header>

        {/* ── 5-Step Journey Progress Bar ──────────────────────────────────────── */}
        <nav
          aria-label="Topic-wise practice steps"
          className="rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border px-4 py-3 shadow-sm"
        >
          <ol className="flex flex-wrap items-center gap-y-2 gap-x-1 sm:gap-x-2">
            {stepStates.steps.map((step, idx) => {
              const isActive = stepStates.activeStep === step.id;
              const isDone = step.done && !isActive;

              return (
                <li key={step.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => scrollToSection(step.anchor)}
                    className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
                      isActive
                        ? 'bg-brand-primary/10 dark:bg-brand-primary/20 text-brand-primary font-bold ring-1 ring-brand-primary/30'
                        : isDone
                        ? 'text-surface-text dark:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
                        : 'text-surface-muted dark:text-darkSurface-muted hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-brand-primary text-white'
                          : isDone
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted dark:text-darkSurface-muted border border-surface-border dark:border-darkSurface-border'
                      }`}
                    >
                      {isDone ? <Check className="w-3 h-3 stroke-[3]" /> : step.id}
                    </span>
                    <span className="whitespace-nowrap">{step.label}</span>
                  </button>
                  {idx < stepStates.steps.length - 1 && (
                    <ChevronRight className="w-3.5 h-3.5 text-surface-muted/60 dark:text-darkSurface-muted/60 mx-0.5 hidden sm:block shrink-0" />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {/* ── Adaptive Recommendations Banner (when real weak topics exist) ─────── */}
        {recommendations.length > 0 && (
          <section className="rounded-2xl p-5 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent border border-amber-500/20 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                <h2 className="text-sm sm:text-base font-bold text-surface-text dark:text-darkSurface-text">
                  Recommended Weak Topics
                </h2>
              </div>
              <span className="text-xs text-amber-700 dark:text-amber-400 font-semibold">
                Based on your submitted test accuracy
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {recommendations.map((rec) => (
                <div
                  key={rec.topicId}
                  className="rounded-xl bg-white dark:bg-darkSurface-elev1 border border-amber-500/20 p-4 shadow-sm flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400 truncate">
                        {rec.subjectName}
                      </span>
                      <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 shrink-0">
                        {rec.accuracy}% Accuracy
                      </span>
                    </div>
                    <h3 className="text-sm font-bold mt-1.5 text-surface-text dark:text-darkSurface-text">
                      {rec.topicName}
                    </h3>
                    <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-1 leading-relaxed">
                      {rec.reason}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleStartRecommendation(rec)}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    <Target className="w-3.5 h-3.5" />
                    Practise Topic ({rec.recommendedQuestionCount} Qs)
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Main Two-Column Workspace (Steps 1-4 Left | Step 5 Live Summary Right) ── */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left Column: Steps 1 – 4 */}
          <div className="xl:col-span-8 space-y-6 min-w-0">
            {/* ── Step 1: Select Examination ────────────────────────────────── */}
            <section
              id="step-1-exam"
              className="scroll-mt-20 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-5 sm:p-6 shadow-sm space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-surface-border/70 dark:border-darkSurface-border/70">
                <h2 className="text-base font-bold flex items-center gap-2.5 text-surface-text dark:text-darkSurface-text">
                  <span className="w-6 h-6 rounded-full bg-brand-primary text-white text-xs flex items-center justify-center font-bold shrink-0">
                    1
                  </span>
                  Select Examination
                </h2>
                <span className="text-xs font-medium text-surface-muted dark:text-darkSurface-muted">
                  {examCatalog.totalVerifiedQuestions.toLocaleString()} staff-verified questions available
                </span>
              </div>

              {/* Truthful 4-Bucket Classification Integrity Summary & Explicit Pool Trust Toggle */}
              <div
                aria-label="Question classification breakdown"
                className="rounded-xl bg-surface-elev2/50 dark:bg-darkSurface-elev2/40 border border-surface-border dark:border-darkSurface-border p-3.5 space-y-3"
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Verified Eligible
                    </div>
                    <div
                      data-testid="catalog-verified-count"
                      className="text-sm font-black text-emerald-700 dark:text-emerald-300"
                    >
                      {examCatalog.totalVerifiedQuestions.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                      Provisional
                    </div>
                    <div
                      data-testid="catalog-provisional-count"
                      className="text-sm font-black text-amber-700 dark:text-amber-300"
                    >
                      {examCatalog.totalProvisionalQuestions.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg bg-sky-500/10 border border-sky-500/20 px-2.5 py-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                      Pending Review
                    </div>
                    <div
                      data-testid="catalog-pending-count"
                      className="text-sm font-black text-sky-700 dark:text-sky-300"
                    >
                      {examCatalog.totalPendingReviewQuestions.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg bg-surface-elev1 dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border px-2.5 py-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted">
                      Unclassified
                    </div>
                    <div
                      data-testid="catalog-unclassified-count"
                      className="text-sm font-black text-surface-text dark:text-darkSurface-text"
                    >
                      {examCatalog.totalUnclassifiedQuestions.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-surface-border/60 dark:border-darkSurface-border/60">
                  <div className="text-[11px] text-surface-muted dark:text-darkSurface-muted leading-snug">
                    {includeProvisional ? (
                      <span className="font-semibold text-amber-700 dark:text-amber-300">
                        Provisional Practice Mode active: includes automated rule-classified questions awaiting staff verification.
                      </span>
                    ) : (
                      <span>
                        Strict Verified Mode: only staff/official verified questions are eligible. Provisional questions are excluded.
                      </span>
                    )}
                  </div>
                  <div className="inline-flex items-center gap-1.5 shrink-0" role="group" aria-label="Question trust mode">
                    <button
                      type="button"
                      aria-pressed={!includeProvisional}
                      onClick={() => {
                        setIncludeProvisional(false);
                        setErrorMessage(null);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                        !includeProvisional
                          ? 'bg-brand-primary text-white border-brand-primary shadow-sm'
                          : 'bg-white dark:bg-darkSurface-elev1 text-surface-text dark:text-darkSurface-text border-surface-border dark:border-darkSurface-border hover:border-brand-primary/50'
                      }`}
                    >
                      Verified Only
                    </button>
                    <button
                      type="button"
                      aria-pressed={includeProvisional}
                      onClick={() => {
                        setIncludeProvisional(true);
                        setErrorMessage(null);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                        includeProvisional
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-white dark:bg-darkSurface-elev1 text-surface-text dark:text-darkSurface-text border-surface-border dark:border-darkSurface-border hover:border-amber-500/60'
                      }`}
                    >
                      Include Provisional
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {COMPETITIVE_EXAMS_CATALOG.map((exam) => {
                  const isSelected = selectedExamId === exam.id;
                  return (
                    <button
                      key={exam.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSelectedExamId(exam.id);
                        setSelectedSubjectId('');
                        setSelectedTopicIds([]);
                        setErrorMessage(null);
                      }}
                      className={`flex items-center gap-3 p-3.5 rounded-xl text-left border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-darkSurface-elev1 ${
                        isSelected
                          ? 'bg-brand-primary/10 dark:bg-brand-primary/15 border-brand-primary ring-1 ring-brand-primary/30 shadow-sm'
                          : 'bg-surface-elev2/40 dark:bg-darkSurface-elev2/40 border-surface-border dark:border-darkSurface-border hover:border-brand-primary/50 hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-extrabold text-[11px] tracking-tight transition-colors ${
                          isSelected
                            ? 'bg-brand-primary text-white shadow-sm'
                            : 'bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted dark:text-darkSurface-muted border border-surface-border/80 dark:border-darkSurface-border'
                        }`}
                      >
                        {(exam.name.split(' ')[0] || exam.id).slice(0, 4).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <h3 className="text-sm font-bold text-surface-text dark:text-darkSurface-text leading-snug truncate">
                            {exam.name}
                          </h3>
                          {isSelected && (
                            <Check className="w-4 h-4 text-brand-primary stroke-[3] shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted truncate mt-0.5">
                          {exam.category}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── Step 2: Select Subject ────────────────────────────────────── */}
            <section
              id="step-2-subject"
              className="scroll-mt-20 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-5 sm:p-6 shadow-sm space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-surface-border/70 dark:border-darkSurface-border/70">
                <h2 className="text-base font-bold flex items-center gap-2.5 text-surface-text dark:text-darkSurface-text">
                  <span className="w-6 h-6 rounded-full bg-brand-primary text-white text-xs flex items-center justify-center font-bold shrink-0">
                    2
                  </span>
                  Select Subject
                </h2>
                <span className="text-xs font-medium text-surface-muted dark:text-darkSurface-muted">
                  {availableSubjects.length}{' '}
                  {availableSubjects.length === 1 ? 'subject' : 'subjects'} in{' '}
                  {selectedExam?.name || selectedExamId.toUpperCase()} syllabus
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {availableSubjects.map((subj) => {
                  const isSelected = selectedSubjectId === subj.id;
                  return (
                    <button
                      key={subj.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSelectedSubjectId(subj.id);
                        setSelectedTopicIds([]);
                        setErrorMessage(null);
                      }}
                      className={`p-4 rounded-xl text-left border transition-all flex flex-col justify-between gap-3 min-h-[96px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-darkSurface-elev1 ${
                        isSelected
                          ? 'bg-brand-primary/10 dark:bg-brand-primary/15 border-brand-primary ring-1 ring-brand-primary/30 shadow-sm'
                          : 'bg-surface-elev2/40 dark:bg-darkSurface-elev2/40 border-surface-border dark:border-darkSurface-border hover:border-brand-primary/50 hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 w-full">
                        <div className="flex items-start gap-2 min-w-0">
                          <BookOpen
                            className={`w-4 h-4 mt-0.5 shrink-0 ${
                              isSelected
                                ? 'text-brand-primary'
                                : 'text-surface-muted dark:text-darkSurface-muted'
                            }`}
                          />
                          <h3 className="text-sm font-bold text-surface-text dark:text-darkSurface-text leading-snug">
                            {subj.name}
                          </h3>
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-brand-primary stroke-[3] shrink-0 mt-0.5" />
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 text-xs pt-2 border-t border-surface-border/60 dark:border-darkSurface-border/60 w-full">
                        <span className="text-surface-muted dark:text-darkSurface-muted font-medium">
                          {subj.topics.length} {subj.topics.length === 1 ? 'topic' : 'topics'}
                        </span>
                        <span
                          className={`font-bold px-2 py-0.5 rounded-md text-[11px] ${
                            isSelected
                              ? includeProvisional
                                ? 'bg-amber-600 text-white'
                                : 'bg-brand-primary text-white'
                              : includeProvisional
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                              : 'bg-brand-primary/10 text-brand-primary'
                          }`}
                        >
                          {includeProvisional
                            ? `${subj.totalQuestions + subj.provisionalQuestions} provisional Qs`
                            : `${subj.totalQuestions} verified Qs`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── Step 3: Select Topics ─────────────────────────────────────── */}
            {currentSubject && (
              <section
                id="step-3-topics"
                className="scroll-mt-20 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-5 sm:p-6 shadow-sm space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-surface-border/70 dark:border-darkSurface-border/70">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold flex items-center gap-2.5 text-surface-text dark:text-darkSurface-text">
                      <span className="w-6 h-6 rounded-full bg-brand-primary text-white text-xs flex items-center justify-center font-bold shrink-0">
                        3
                      </span>
                      <span className="leading-snug">
                        Select Topics in {currentSubject.name}
                      </span>
                    </h2>
                    <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-1 sm:pl-8">
                      {selectableTopicCount} of {currentSubject.topics.length}{' '}
                      {currentSubject.topics.length === 1 ? 'topic has' : 'topics have'}{' '}
                      {includeProvisional ? 'eligible (provisional)' : 'verified'} questions available
                    </p>
                  </div>

                  {/* Prominent Select All / Clear Selection Controls */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleSelectAllTopics}
                      disabled={selectableTopicCount === 0}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-primary/10 dark:bg-brand-primary/20 text-brand-primary hover:bg-brand-primary hover:text-white border border-brand-primary/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={handleClearTopics}
                      disabled={selectedTopicIds.length === 0}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text hover:bg-surface-elev3 dark:hover:bg-darkSurface-elev3 border border-surface-border dark:border-darkSurface-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Clear Selection
                    </button>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text border border-surface-border dark:border-darkSurface-border">
                      {selectedTopicIds.length} Selected
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {currentSubject.topics.map((topic) => {
                    const isSelected = selectedTopicIds.includes(topic.id);
                    const topicPoolCount = getTopicPoolCount(topic);
                    const hasQuestions = topicPoolCount > 0;

                    return (
                      <div
                        key={topic.id}
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-disabled={!hasQuestions}
                        tabIndex={hasQuestions ? 0 : -1}
                        onClick={() => hasQuestions && handleToggleTopic(topic.id)}
                        onKeyDown={(e) => {
                          if (hasQuestions && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            handleToggleTopic(topic.id);
                          }
                        }}
                        className={`rounded-xl border p-4 transition-all flex flex-col justify-between gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-darkSurface-elev1 ${
                          !hasQuestions
                            ? 'cursor-not-allowed bg-surface-elev2/30 dark:bg-darkSurface-elev2/20 border-dashed border-surface-border dark:border-darkSurface-border'
                            : isSelected
                            ? 'cursor-pointer bg-brand-primary/10 dark:bg-brand-primary/15 border-brand-primary ring-1 ring-brand-primary/30 shadow-sm'
                            : 'cursor-pointer bg-surface-elev2/40 dark:bg-darkSurface-elev2/40 border-surface-border dark:border-darkSurface-border hover:border-brand-primary/50 hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <div
                                className={`w-4 h-4 mt-0.5 rounded-[5px] border flex items-center justify-center shrink-0 transition-colors ${
                                  !hasQuestions
                                    ? 'border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2'
                                    : isSelected
                                    ? 'bg-brand-primary border-brand-primary text-white'
                                    : 'border-surface-muted/50 dark:border-darkSurface-muted/50 bg-white dark:bg-darkSurface-elev1'
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                              <h4
                                className={`text-sm font-bold leading-snug ${
                                  hasQuestions
                                    ? 'text-surface-text dark:text-darkSurface-text'
                                    : 'text-surface-muted dark:text-darkSurface-muted'
                                }`}
                              >
                                {topic.name}
                              </h4>
                            </div>

                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                                hasQuestions
                                  ? isSelected
                                    ? 'bg-brand-primary text-white'
                                    : 'bg-brand-primary/10 text-brand-primary'
                                  : 'bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted dark:text-darkSurface-muted'
                              }`}
                            >
                              {topicPoolCount} {topicPoolCount === 1 ? 'Q' : 'Qs'}
                              {!includeProvisional &&
                                topic.verifiedQuestionCount === 0 &&
                                topic.provisionalQuestionCount > 0 && (
                                  <span className="ml-1 opacity-75">
                                    ({topic.provisionalQuestionCount} prov.)
                                  </span>
                                )}
                            </span>
                          </div>

                          {topic.description && (
                            <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-2 pl-6 leading-relaxed line-clamp-2">
                              {topic.description}
                            </p>
                          )}
                        </div>

                        {/* Subtopics pill cloud */}
                        {topic.subtopics && topic.subtopics.length > 0 && (
                          <div className="pt-2 pl-6 border-t border-surface-border/50 dark:border-darkSurface-border/50">
                            <div className="flex flex-wrap gap-1.5">
                              {topic.subtopics.map((sub) => {
                                const isSubSelected = selectedTopicIds.includes(sub.id);
                                return (
                                  <button
                                    key={sub.id}
                                    type="button"
                                    aria-pressed={isSubSelected}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleTopic(sub.id);
                                    }}
                                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
                                      isSubSelected
                                        ? 'bg-brand-primary text-white border-brand-primary shadow-sm'
                                        : 'bg-white dark:bg-darkSurface-elev1 text-surface-text dark:text-darkSurface-text border-surface-border dark:border-darkSurface-border hover:border-brand-primary/50'
                                    }`}
                                  >
                                    {sub.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Step 4: Configure Practice Test ───────────────────────────── */}
            <section
              id="step-4-configure"
              className="scroll-mt-20 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-5 sm:p-6 shadow-sm space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-surface-border/70 dark:border-darkSurface-border/70">
                <h2 className="text-base font-bold flex items-center gap-2.5 text-surface-text dark:text-darkSurface-text">
                  <span className="w-6 h-6 rounded-full bg-brand-primary text-white text-xs flex items-center justify-center font-bold shrink-0">
                    4
                  </span>
                  Configure Practice Test
                </h2>

                {selectedTopicIds.length === 0 ? (
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25 px-3 py-1 rounded-full self-start sm:self-auto">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Select at least one topic above to calculate eligible questions</span>
                  </div>
                ) : eligibleQuestionCount === 0 ? (
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25 px-3 py-1 rounded-full self-start sm:self-auto">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>0 {poolTrustLabel} questions eligible</span>
                  </div>
                ) : (
                  <div
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full self-start sm:self-auto border ${
                      includeProvisional
                        ? 'text-amber-800 dark:text-amber-300 bg-amber-500/10 border-amber-500/25'
                        : 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {eligibleQuestionCount} {poolTrustLabel}{' '}
                      {eligibleQuestionCount === 1 ? 'question' : 'questions'} eligible
                    </span>
                  </div>
                )}
              </div>

              {/* Balanced 2×2 Configuration Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* A. Question Count */}
                <div className="rounded-xl bg-surface-elev2/50 dark:bg-darkSurface-elev2/40 border border-surface-border dark:border-darkSurface-border p-4 space-y-3">
                  <label
                    htmlFor="custom-question-count-input"
                    className="text-xs font-bold uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted flex items-center gap-1.5"
                  >
                    <Layers className="w-3.5 h-3.5 text-brand-primary" />
                    A. Question Count
                  </label>

                  <div className="grid grid-cols-4 gap-2">
                    {PRESET_COUNTS.map((cnt) => {
                      const isSelected = questionCount === cnt && customQuestionCount.trim() === '';
                      return (
                        <button
                          key={cnt}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => {
                            setQuestionCount(cnt);
                            setCustomQuestionCount('');
                            setErrorMessage(null);
                          }}
                          className={`py-2 text-xs rounded-xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-darkSurface-elev1 ${
                            isSelected
                              ? 'bg-brand-primary text-white border-brand-primary shadow-sm font-bold ring-1 ring-brand-primary/30'
                              : 'bg-white dark:bg-darkSurface-elev1 border-surface-border dark:border-darkSurface-border text-surface-text dark:text-darkSurface-text font-semibold hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev3 hover:border-brand-primary/40'
                          }`}
                        >
                          {cnt}
                        </button>
                      );
                    })}
                  </div>

                  <input
                    id="custom-question-count-input"
                    type="text"
                    inputMode="numeric"
                    aria-label="Custom question count"
                    aria-invalid={hasCountValidationError && countValidation.isCustomInput}
                    aria-describedby={hasCountValidationError ? 'question-count-validation-msg' : undefined}
                    placeholder={
                      eligibleQuestionCount > 0
                        ? `Custom count (1–${Math.min(eligibleQuestionCount, MAX_PRACTICE_QUESTIONS)})...`
                        : 'Custom count...'
                    }
                    value={customQuestionCount}
                    onChange={(e) => {
                      setCustomQuestionCount(e.target.value);
                      setErrorMessage(null);
                    }}
                    className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl bg-white dark:bg-darkSurface-elev1 border text-surface-text dark:text-darkSurface-text placeholder-surface-muted dark:placeholder-darkSurface-muted focus:outline-none focus:ring-2 ${
                      hasCountValidationError && countValidation.isCustomInput
                        ? 'border-red-500 dark:border-red-400 focus:ring-red-500/30 focus:border-red-500'
                        : 'border-surface-border dark:border-darkSurface-border focus:ring-brand-primary/30 focus:border-brand-primary'
                    }`}
                  />

                  {hasCountValidationError && countValidation.message && (
                    <div
                      id="question-count-validation-msg"
                      role="alert"
                      className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-2.5 flex flex-col gap-2"
                    >
                      <span className="flex items-start gap-1.5 leading-snug">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{countValidation.message}</span>
                      </span>
                      {canExplicitlyAdjustCount && (
                        <button
                          type="button"
                          onClick={handleAdjustToMaxAllowed}
                          className="self-start inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-brand-primary text-white hover:bg-brand-primary/90 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                        >
                          Set to {countValidation.maxAllowed}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* B. Duration */}
                <div className="rounded-xl bg-surface-elev2/50 dark:bg-darkSurface-elev2/40 border border-surface-border dark:border-darkSurface-border p-4 space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-brand-primary" />
                    B. Duration
                  </span>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-pressed={!isUntimed}
                      onClick={() => setIsUntimed(false)}
                      className={`py-2 px-3 text-xs rounded-xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-darkSurface-elev1 ${
                        !isUntimed
                          ? 'bg-brand-primary text-white border-brand-primary shadow-sm font-bold ring-1 ring-brand-primary/30'
                          : 'bg-white dark:bg-darkSurface-elev1 border-surface-border dark:border-darkSurface-border text-surface-text dark:text-darkSurface-text font-semibold hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev3 hover:border-brand-primary/40'
                      }`}
                    >
                      Timed ({durationMinutes}m)
                    </button>
                    <button
                      type="button"
                      aria-pressed={isUntimed}
                      onClick={() => setIsUntimed(true)}
                      className={`py-2 px-3 text-xs rounded-xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-darkSurface-elev1 ${
                        isUntimed
                          ? 'bg-brand-primary text-white border-brand-primary shadow-sm font-bold ring-1 ring-brand-primary/30'
                          : 'bg-white dark:bg-darkSurface-elev1 border-surface-border dark:border-darkSurface-border text-surface-text dark:text-darkSurface-text font-semibold hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev3 hover:border-brand-primary/40'
                      }`}
                    >
                      Untimed
                    </button>
                  </div>

                  {!isUntimed ? (
                    <div className="grid grid-cols-4 gap-2">
                      {DURATION_PRESETS.map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          aria-pressed={durationMinutes === mins}
                          onClick={() => setDurationMinutes(mins)}
                          className={`py-2 text-xs rounded-xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-darkSurface-elev1 ${
                            durationMinutes === mins
                              ? 'bg-brand-primary text-white border-brand-primary shadow-sm font-bold'
                              : 'bg-white dark:bg-darkSurface-elev1 border-surface-border dark:border-darkSurface-border text-surface-text dark:text-darkSurface-text font-semibold hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev3 hover:border-brand-primary/40'
                          }`}
                        >
                          {mins}m
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-surface-muted dark:text-darkSurface-muted leading-relaxed py-1">
                      Untimed mode allows stopwatch reflection without countdown exam pressure.
                    </p>
                  )}
                </div>

                {/* C. Difficulty */}
                <div className="rounded-xl bg-surface-elev2/50 dark:bg-darkSurface-elev2/40 border border-surface-border dark:border-darkSurface-border p-4 space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-brand-primary" />
                    C. Difficulty
                  </span>

                  <div className="grid grid-cols-2 gap-2">
                    {DIFFICULTY_OPTIONS.map((diff) => (
                      <button
                        key={diff.id}
                        type="button"
                        aria-pressed={difficulty === diff.id}
                        onClick={() => {
                          setDifficulty(diff.id);
                          setErrorMessage(null);
                        }}
                        className={`py-2.5 px-3 text-xs rounded-xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-darkSurface-elev1 ${
                          diff.id === 'mixed' ? 'col-span-2' : ''
                        } ${
                          difficulty === diff.id
                            ? 'bg-brand-primary text-white border-brand-primary shadow-sm font-bold ring-1 ring-brand-primary/30'
                            : 'bg-white dark:bg-darkSurface-elev1 border-surface-border dark:border-darkSurface-border text-surface-text dark:text-darkSurface-text font-semibold hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev3 hover:border-brand-primary/40'
                        }`}
                      >
                        {diff.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* D. Question Source */}
                <div className="rounded-xl bg-surface-elev2/50 dark:bg-darkSurface-elev2/40 border border-surface-border dark:border-darkSurface-border p-4 space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-brand-primary" />
                    D. Question Source
                  </span>

                  <div className="space-y-2">
                    {SOURCE_OPTIONS.map((src) => (
                      <button
                        key={src.id}
                        type="button"
                        aria-pressed={source === src.id}
                        onClick={() => {
                          setSource(src.id);
                          setErrorMessage(null);
                        }}
                        className={`w-full py-2 px-3 text-xs rounded-xl border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-darkSurface-elev1 ${
                          source === src.id
                            ? 'bg-brand-primary text-white border-brand-primary shadow-sm font-bold ring-1 ring-brand-primary/30'
                            : 'bg-white dark:bg-darkSurface-elev1 border-surface-border dark:border-darkSurface-border text-surface-text dark:text-darkSurface-text font-semibold hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev3 hover:border-brand-primary/40'
                        }`}
                      >
                        {src.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* ── Right Column: Step 5 — Review and Start (Live Test Summary) ─── */}
          <aside
            id="step-5-summary"
            aria-label="Live Test Summary"
            className="xl:col-span-4 xl:sticky xl:top-20 scroll-mt-20 min-w-0"
          >
            <div className="rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-5 sm:p-6 shadow-card space-y-5">
              {/* Summary Header */}
              <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-surface-border dark:border-darkSurface-border">
                <h2 className="text-base font-bold flex items-center gap-2.5 text-surface-text dark:text-darkSurface-text">
                  <span className="w-6 h-6 rounded-full bg-brand-primary text-white text-xs flex items-center justify-center font-bold shrink-0">
                    5
                  </span>
                  Review &amp; Start
                </h2>

                {countValidation.isValid ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25">
                    <ClipboardCheck className="w-3 h-3" />
                    Ready
                  </span>
                ) : selectedTopicIds.length === 0 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25">
                    Select Topics
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/25">
                    Action Needed
                  </span>
                )}
              </div>

              {/* Three Distinct Question Count Metrics */}
              <div
                aria-label="Question count breakdown"
                className="grid grid-cols-3 gap-2"
              >
                <div className="rounded-xl bg-surface-elev2/70 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border p-2.5 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted">
                    Requested
                  </div>
                  <div
                    data-testid="summary-requested-count"
                    className={`text-base font-extrabold mt-0.5 ${
                      hasCountValidationError
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-surface-text dark:text-darkSurface-text'
                    }`}
                  >
                    {countValidation.requestedCount !== null ? countValidation.requestedCount : '—'}
                  </div>
                </div>

                <div className="rounded-xl bg-surface-elev2/70 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border p-2.5 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted">
                    Eligible
                  </div>
                  <div
                    data-testid="summary-eligible-count"
                    className="text-base font-extrabold mt-0.5 text-surface-text dark:text-darkSurface-text"
                  >
                    {eligibleQuestionCount}
                  </div>
                </div>

                <div
                  className={`rounded-xl border p-2.5 text-center ${
                    countValidation.isValid
                      ? 'bg-emerald-500/10 border-emerald-500/25'
                      : 'bg-surface-elev2/70 dark:bg-darkSurface-elev2 border-surface-border dark:border-darkSurface-border'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted">
                    Planned
                  </div>
                  <div
                    data-testid="summary-planned-count"
                    className={`text-base font-extrabold mt-0.5 ${
                      countValidation.isValid
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-surface-muted dark:text-darkSurface-muted'
                    }`}
                  >
                    {countValidation.isValid ? countValidation.plannedGeneratedCount : '—'}
                  </div>
                </div>
              </div>

              {/* Structured Summary Details */}
              <dl className="space-y-3 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-surface-muted dark:text-darkSurface-muted font-semibold shrink-0">
                    Examination
                  </dt>
                  <dd className="font-bold text-surface-text dark:text-darkSurface-text text-right">
                    {selectedExam?.name || selectedExamId.toUpperCase()}
                  </dd>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <dt className="text-surface-muted dark:text-darkSurface-muted font-semibold shrink-0">
                    Subject
                  </dt>
                  <dd className="font-bold text-surface-text dark:text-darkSurface-text text-right">
                    {currentSubject?.name || 'None selected'}
                  </dd>
                </div>

                <div className="space-y-1.5 pt-1 border-t border-surface-border/60 dark:border-darkSurface-border/60">
                  <dt className="text-surface-muted dark:text-darkSurface-muted font-semibold flex items-center justify-between">
                    <span>Selected Topics</span>
                    <span className="font-bold text-surface-text dark:text-darkSurface-text">
                      {selectedTopicIds.length}
                    </span>
                  </dt>
                  <dd>
                    {selectedTopicLabels.length === 0 ? (
                      <span className="text-surface-muted dark:text-darkSurface-muted italic">
                        None selected yet
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {selectedTopicLabels.slice(0, 6).map((t) => (
                          <span
                            key={t.id}
                            className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md bg-brand-primary/10 dark:bg-brand-primary/20 text-brand-primary border border-brand-primary/20"
                          >
                            {t.name}
                          </span>
                        ))}
                        {selectedTopicLabels.length > 6 && (
                          <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted dark:text-darkSurface-muted">
                            +{selectedTopicLabels.length - 6} more
                          </span>
                        )}
                      </div>
                    )}
                  </dd>
                </div>

                <div className="pt-2 border-t border-surface-border/60 dark:border-darkSurface-border/60 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-surface-muted dark:text-darkSurface-muted font-semibold shrink-0">
                      Duration
                    </dt>
                    <dd className="font-bold text-surface-text dark:text-darkSurface-text text-right">
                      {isUntimed ? 'Untimed (Stopwatch)' : `Timed (${durationMinutes} min)`}
                    </dd>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-surface-muted dark:text-darkSurface-muted font-semibold shrink-0">
                      Difficulty
                    </dt>
                    <dd className="font-bold text-surface-text dark:text-darkSurface-text text-right">
                      {activeDifficultyLabel}
                    </dd>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-surface-muted dark:text-darkSurface-muted font-semibold shrink-0">
                      Question Source
                    </dt>
                    <dd className="font-bold text-surface-text dark:text-darkSurface-text text-right">
                      {activeSourceLabel}
                    </dd>
                  </div>
                </div>

                {/* Verified Marking Scheme */}
                <div className="rounded-xl bg-surface-elev2/70 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-surface-text dark:text-darkSurface-text">
                    <Award className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                    <span>Verified Marking Scheme</span>
                  </div>
                  <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted leading-relaxed">
                    {markingSchemeLabel}
                  </p>
                  <div className="flex items-center gap-1 text-[11px] text-surface-muted dark:text-darkSurface-muted pt-0.5">
                    <Info className="w-3 h-3 shrink-0" />
                    <span>AI questions strictly excluded</span>
                  </div>
                </div>
              </dl>

              {/* Runtime Error Banner (if generation fails) */}
              {errorMessage && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/25 p-3 text-xs font-semibold text-red-600 dark:text-red-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Synchronized Readiness / Validation Callout */}
              {selectedTopicIds.length === 0 ? (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Please select at least one topic in Step 3 to calculate eligible verified
                    questions.
                  </span>
                </div>
              ) : eligibleQuestionCount === 0 ? (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    No verified questions match the current filter criteria ({difficulty}, {source}
                    ). Adjust the filters to generate a test.
                  </span>
                </div>
              ) : !countValidation.isValid ? (
                <div className="rounded-xl bg-red-500/10 border border-red-500/25 p-3 text-xs font-semibold text-red-600 dark:text-red-400 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{countValidation.message}</span>
                  </div>
                  {canExplicitlyAdjustCount && (
                    <button
                      type="button"
                      onClick={handleAdjustToMaxAllowed}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-brand-primary text-white hover:bg-brand-primary/90 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-darkSurface-elev1"
                    >
                      Use {countValidation.maxAllowed}{' '}
                      {countValidation.maxAllowed === 1 ? 'question' : 'questions'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    Ready to generate{' '}
                    <strong className="font-extrabold">
                      {countValidation.plannedGeneratedCount}
                    </strong>{' '}
                    {countValidation.plannedGeneratedCount === 1 ? 'question' : 'questions'} from{' '}
                    <strong className="font-extrabold">{selectedTopicIds.length}</strong> selected{' '}
                    {selectedTopicIds.length === 1 ? 'topic' : 'topics'}.
                  </span>
                </div>
              )}

              {/* Primary CTA */}
              <button
                type="button"
                disabled={isGenerating || !countValidation.isValid}
                onClick={handleStartTest}
                className={`w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-darkSurface-elev1 ${
                  isGenerating || !countValidation.isValid
                    ? 'cursor-not-allowed bg-surface-elev3 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border text-surface-muted dark:text-darkSurface-muted shadow-none'
                    : 'bg-brand-primary hover:bg-brand-primary/90 text-white shadow-md hover:shadow-glow active:scale-[0.99]'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isGenerating ? 'Generating Test...' : 'Start Practice Test'}</span>
              </button>
            </div>
          </aside>
        </div>

        {/* ── Topic Practice Performance History Section ──────────────────────── */}
        {performanceHistory.length > 0 && (
          <section className="rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-5 sm:p-6 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-brand-primary" />
                <h3 className="text-base font-bold">Your Topic Practice History</h3>
                {historyCloudSynced ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                    Cloud Synced
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                    Local Only
                  </span>
                )}
              </div>
              <span className="text-xs text-surface-muted dark:text-darkSurface-muted">
                {performanceHistory.length}{' '}
                {performanceHistory.length === 1 ? 'topic' : 'topics'} attempted
              </span>
            </div>
            {historyCloudNote && (
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
                {historyCloudNote}
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-surface-border dark:border-darkSurface-border text-surface-muted dark:text-darkSurface-muted font-bold">
                    <th className="py-2.5 px-3">Topic</th>
                    <th className="py-2.5 px-3 text-center">Attempts</th>
                    <th className="py-2.5 px-3 text-center">Questions</th>
                    <th className="py-2.5 px-3 text-center">Correct / Wrong</th>
                    <th className="py-2.5 px-3 text-center">Accuracy</th>
                    <th className="py-2.5 px-3 text-center">Trend</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border/50 dark:divide-darkSurface-border/50">
                  {performanceHistory.map((stat) => (
                    <tr
                      key={stat.topicId}
                      className="hover:bg-surface-elev2/40 dark:hover:bg-darkSurface-elev2/40 transition-colors"
                    >
                      <td className="py-3 px-3 font-semibold text-surface-text dark:text-darkSurface-text">
                        <div className="flex items-center gap-2">
                          <span>{stat.topicName}</span>
                          {stat.isWeak && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400">
                              Weak
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center text-surface-muted dark:text-darkSurface-muted">
                        {stat.totalAttempts}
                      </td>
                      <td className="py-3 px-3 text-center font-semibold">
                        {stat.totalQuestionsAttempted}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                          {stat.correct}
                        </span>
                        <span className="text-surface-muted dark:text-darkSurface-muted"> / </span>
                        <span className="text-red-500 font-bold">{stat.wrong}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`font-bold px-2 py-0.5 rounded-md ${
                            stat.accuracy >= 75
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : stat.accuracy >= 50
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'bg-red-500/10 text-red-600 dark:text-red-400'
                          }`}
                        >
                          {stat.accuracy}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {stat.trend === 'improving' ? (
                          <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                            <TrendingUp className="w-3.5 h-3.5" /> Improving
                          </span>
                        ) : stat.trend === 'declining' ? (
                          <span className="inline-flex items-center gap-0.5 text-red-500 font-bold text-[11px]">
                            <TrendingDown className="w-3.5 h-3.5" /> Declining
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-surface-muted dark:text-darkSurface-muted font-bold text-[11px]">
                            <Minus className="w-3.5 h-3.5" /> Stable
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTopicIds([stat.topicId]);
                            scrollToSection('step-4-configure');
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold text-brand-primary hover:bg-brand-primary/10 transition-colors"
                        >
                          Practise
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
