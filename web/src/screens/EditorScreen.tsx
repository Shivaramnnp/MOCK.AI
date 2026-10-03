import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Save,
  Wand2,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  Eye,
  X,
  Layers,
  Tag,
  Check,
  Split,
  FileEdit,
  Radio,
  Sliders,
  Send,
} from 'lucide-react';
import { Question, TestHistory } from '../types';
import {
  CanonicalOption,
  CanonicalQuestion,
  QuestionType,
} from '../types/canonicalQuestion';
import { toCanonicalQuestion, toLegacyQuestion } from '../services/ingestion/questionMigrator';
import { ContentBlockEditor } from '../components/editor/ContentBlockEditor';
import { QuestionLearnerPreview } from '../components/editor/QuestionLearnerPreview';
import { validateManualQuestion } from '../services/ingestion/manual/manualQuestionValidator';
import { manualAutosaveService } from '../services/ingestion/manual/manualAutosaveService';
import { ManualFieldErrors } from '../services/ingestion/manual/types';

interface EditorScreenProps {
  initialTestId?: string;
  initialTitle?: string;
  initialCategory?: string;
  initialQuestions: Question[];
  existingTest?: TestHistory | null;
  onBack: () => void;
  onSave: (test: TestHistory, andStart?: boolean) => void;
  onAiFixAll: (questions: Question[]) => Promise<Question[]>;
}

export const EditorScreen: React.FC<EditorScreenProps> = ({
  initialTestId,
  initialTitle = 'New Practice Mock Test',
  initialCategory = 'General',
  initialQuestions,
  existingTest,
  onBack,
  onSave,
  onAiFixAll,
}) => {
  const testId = initialTestId || existingTest?.id || `test-${Date.now()}`;
  const [title, setTitle] = useState(initialTitle);
  const [category, setCategory] = useState(initialCategory);
  const [isDraft, setIsDraft] = useState(true);

  // Convert initial questions to CanonicalQuestions
  const [canonicalQuestions, setCanonicalQuestions] = useState<CanonicalQuestion[]>(() => {
    if (initialQuestions.length > 0) {
      return initialQuestions.map((q, idx) => {
        const cq = toCanonicalQuestion(q);
        cq.questionNumber = idx + 1;
        cq.sourceType = 'Manual';
        cq.provenance = {
          ...cq.provenance,
          sourceType: 'Manual',
        };
        return cq;
      });
    }
    return [createNewBlankQuestion(1, initialCategory)];
  });

  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [viewMode, setViewMode] = useState<'editor' | 'split' | 'preview'>('split');
  const [isFixing, setIsFixing] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // Field errors for active question
  const [fieldErrors, setFieldErrors] = useState<ManualFieldErrors>({});

  const activeQuestion = canonicalQuestions[activeQuestionIdx] || canonicalQuestions[0];

  // Validate active question
  const runValidation = useCallback(() => {
    if (!activeQuestion) return;
    const res = validateManualQuestion(activeQuestion, isDraft);
    setFieldErrors(res.fieldErrors);
  }, [activeQuestion, isDraft]);

  useEffect(() => {
    runValidation();
  }, [runValidation]);

  // Debounced Autosave Effect
  useEffect(() => {
    setAutosaveStatus('saving');
    manualAutosaveService.scheduleAutosave(
      {
        testId,
        title,
        category,
        isDraft,
        questions: canonicalQuestions,
        updatedAt: Date.now(),
      },
      (savedAt) => {
        setAutosaveStatus('saved');
        setLastSavedTime(new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      },
      700
    );
  }, [testId, title, category, isDraft, canonicalQuestions]);

  // Load cached draft on mount if available
  useEffect(() => {
    const cached = manualAutosaveService.loadDraft(testId);
    if (cached && cached.questions && cached.questions.length > 0 && initialQuestions.length === 0) {
      setTitle(cached.title);
      setCategory(cached.category);
      setIsDraft(cached.isDraft);
      setCanonicalQuestions(cached.questions);
    }
  }, [testId, initialQuestions.length]);

  // Update active question
  const updateActiveQuestion = (partial: Partial<CanonicalQuestion>) => {
    setCanonicalQuestions((prev) => {
      const copy = [...prev];
      copy[activeQuestionIdx] = {
        ...copy[activeQuestionIdx],
        ...partial,
        updatedAt: Date.now(),
      };
      return copy;
    });
  };

  // Switch Question Type
  const handleTypeChange = (newType: QuestionType) => {
    const current = activeQuestion;
    let newOptions = [...(current.options || [])];
    let newAnswer = { ...current.answer, questionType: newType };

    if (newType === 'TRUE_FALSE') {
      newOptions = [
        { id: 'opt-true', text: 'True', isCorrect: true },
        { id: 'opt-false', text: 'False', isCorrect: false },
      ];
      newAnswer = { questionType: 'TRUE_FALSE', correctOptionId: 'opt-true', correctOptionIndex: 0 };
    } else if (newType === 'NAT') {
      newOptions = [];
      newAnswer = { questionType: 'NAT', natValue: 0 };
    } else if (newType === 'DESCRIPTIVE') {
      newOptions = [];
      newAnswer = { questionType: 'DESCRIPTIVE' };
    } else if (newOptions.length < 2) {
      newOptions = [
        { id: 'opt-A', text: 'Option A', isCorrect: true },
        { id: 'opt-B', text: 'Option B', isCorrect: false },
        { id: 'opt-C', text: 'Option C', isCorrect: false },
        { id: 'opt-D', text: 'Option D', isCorrect: false },
      ];
      newAnswer = { questionType: newType, correctOptionId: 'opt-A', correctOptionIndex: 0 };
    }

    updateActiveQuestion({
      questionType: newType,
      options: newOptions,
      answer: newAnswer,
    });
  };

  // Option Operations
  const handleAddOption = () => {
    const opts = activeQuestion.options || [];
    const nextLetter = String.fromCharCode(65 + opts.length);
    const newOpt: CanonicalOption = {
      id: `opt-${nextLetter}`,
      text: '',
      isCorrect: false,
    };
    updateActiveQuestion({ options: [...opts, newOpt] });
  };

  const handleRemoveOption = (optIndex: number) => {
    const opts = activeQuestion.options || [];
    if (opts.length <= 2) return;
    const filtered = opts.filter((_, i) => i !== optIndex);
    updateActiveQuestion({ options: filtered });
  };

  const handleUpdateOption = (optIndex: number, text: string) => {
    const opts = [...(activeQuestion.options || [])];
    opts[optIndex] = { ...opts[optIndex], text };
    updateActiveQuestion({ options: opts });
  };

  const handleToggleCorrectOption = (optIndex: number) => {
    const qType = activeQuestion.questionType;
    const opts = [...(activeQuestion.options || [])];

    if (qType === 'MCQ' || qType === 'TRUE_FALSE') {
      // Single correct option
      opts.forEach((o, i) => {
        o.isCorrect = i === optIndex;
      });
      updateActiveQuestion({
        options: opts,
        answer: {
          ...activeQuestion.answer,
          correctOptionIndex: optIndex,
          correctOptionId: opts[optIndex]?.id,
        },
      });
    } else if (qType === 'MSQ') {
      // Multiple correct options
      opts[optIndex].isCorrect = !opts[optIndex].isCorrect;
      const correctIndices = opts.map((o, i) => (o.isCorrect ? i : -1)).filter((i) => i >= 0);
      const correctIds = opts.filter((o) => o.isCorrect).map((o) => o.id);

      updateActiveQuestion({
        options: opts,
        answer: {
          ...activeQuestion.answer,
          correctOptionIndices: correctIndices,
          correctOptionIds: correctIds,
        },
      });
    }
  };

  // Question Management Operations
  const handleAddQuestion = () => {
    const nextNum = canonicalQuestions.length + 1;
    const newQ = createNewBlankQuestion(nextNum, category);
    setCanonicalQuestions((prev) => [...prev, newQ]);
    setActiveQuestionIdx(canonicalQuestions.length);
  };

  const handleDeleteQuestion = (idx: number) => {
    if (canonicalQuestions.length <= 1) {
      alert('A test must contain at least one question.');
      return;
    }
    const filtered = canonicalQuestions.filter((_, i) => i !== idx);
    // Renumber monotonically
    filtered.forEach((q, i) => {
      q.questionNumber = i + 1;
    });
    setCanonicalQuestions(filtered);
    if (activeQuestionIdx >= filtered.length) {
      setActiveQuestionIdx(filtered.length - 1);
    }
  };

  const handleDuplicateQuestion = (idx: number) => {
    const target = canonicalQuestions[idx];
    const duplicated: CanonicalQuestion = {
      ...target,
      questionId: `manual-q-${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = [...canonicalQuestions];
    next.splice(idx + 1, 0, duplicated);
    next.forEach((q, i) => {
      q.questionNumber = i + 1;
    });
    setCanonicalQuestions(next);
    setActiveQuestionIdx(idx + 1);
  };

  const handleMoveQuestion = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= canonicalQuestions.length) return;
    const next = [...canonicalQuestions];
    const temp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = temp;
    next.forEach((q, i) => {
      q.questionNumber = i + 1;
    });
    setCanonicalQuestions(next);
    setActiveQuestionIdx(targetIdx);
  };

  // AI Fix All handler
  const handleAiFixAll = async () => {
    setIsFixing(true);
    try {
      const legacyQs = canonicalQuestions.map(toLegacyQuestion);
      const improved = await onAiFixAll(legacyQs);
      const reConverted = improved.map((q, idx) => {
        const cq = toCanonicalQuestion(q);
        cq.questionNumber = idx + 1;
        cq.sourceType = 'Manual';
        return cq;
      });
      setCanonicalQuestions(reConverted);
    } catch {
      alert('AI fix failed. Please check network connection or provider settings.');
    } finally {
      setIsFixing(false);
    }
  };

  // Save / Publish Actions
  const handleSaveDraft = () => {
    setIsDraft(true);
    const updated = canonicalQuestions.map((q) => ({
      ...q,
      verificationStatus: 'UNVERIFIED' as const,
      provenance: {
        ...q.provenance,
        sourceType: 'Manual' as const,
        sourceFile: 'Manual Draft',
      },
    }));

    const test: TestHistory = {
      id: testId,
      title: title.trim() || 'Untitled Manual Draft',
      category: category.trim() || 'General',
      questions: updated.map(toLegacyQuestion),
      createdAt: existingTest?.createdAt || Date.now(),
      lastTakenAt: existingTest?.lastTakenAt ?? null,
      bestScore: existingTest?.bestScore ?? null,
      bestScorePercent: existingTest?.bestScorePercent ?? null,
      bestTotal: existingTest?.bestTotal ?? updated.length,
    };

    manualAutosaveService.persistNow({
      testId,
      title,
      category,
      isDraft: true,
      questions: updated,
      updatedAt: Date.now(),
    });

    onSave(test, false);
  };

  const handlePublishTest = () => {
    // Audit every question before publishing
    for (let i = 0; i < canonicalQuestions.length; i++) {
      const res = validateManualQuestion(canonicalQuestions[i], false);
      if (!res.isValid) {
        setActiveQuestionIdx(i);
        setFieldErrors(res.fieldErrors);
        alert(`Cannot publish test: Question ${i + 1} has validation errors: ${Object.values(res.fieldErrors)[0]}`);
        return;
      }
    }

    setIsDraft(false);
    const verifiedQuestions = canonicalQuestions.map((q) => ({
      ...q,
      verificationStatus: 'VERIFIED' as const,
      verificationReasons: ['Manually authored and verified by instructor'],
      provenance: {
        ...q.provenance,
        sourceType: 'Manual' as const,
        sourceFile: title,
      },
    }));

    const test: TestHistory = {
      id: testId,
      title: title.trim(),
      category: category.trim() || 'General',
      questions: verifiedQuestions.map(toLegacyQuestion),
      createdAt: existingTest?.createdAt || Date.now(),
      lastTakenAt: existingTest?.lastTakenAt ?? null,
      bestScore: existingTest?.bestScore ?? null,
      bestScorePercent: existingTest?.bestScorePercent ?? null,
      bestTotal: existingTest?.bestTotal ?? verifiedQuestions.length,
    };

    manualAutosaveService.clearDraft(testId);
    onSave(test, false);
  };

  return (
    <div className="min-h-screen bg-surface-base dark:bg-darkSurface pb-24">
      {/* ── Top Header & Actions Bar ──────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-white/95 dark:bg-darkSurface-elev1/95 backdrop-blur-md border-b border-surface-border dark:border-darkSurface-border px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Back & Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl text-surface-muted hover:text-surface-text hover:bg-surface-elev2 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter Test Title..."
                className="font-bold text-base sm:text-lg bg-transparent border-b border-transparent hover:border-surface-border focus:border-brand-primary text-surface-text dark:text-darkSurface-text focus:outline-none px-1"
              />
              <div className="flex items-center gap-2 text-xs text-surface-muted px-1 mt-0.5">
                <span className="flex items-center gap-1 font-medium">
                  {autosaveStatus === 'saving' ? (
                    <span className="text-amber-500 flex items-center gap-1">
                      <Clock className="w-3 h-3 animate-spin" /> Saving...
                    </span>
                  ) : (
                    <span className="text-emerald-500 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Autosaved {lastSavedTime ? `at ${lastSavedTime}` : ''}
                    </span>
                  )}
                </span>
                <span>•</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                  isDraft ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'
                }`}>
                  {isDraft ? 'Draft (Unverified)' : 'Published'}
                </span>
              </div>
            </div>
          </div>

          {/* Controls: View Mode, AI Fix, Save Draft, Publish */}
          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="hidden md:flex rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 p-1 border border-surface-border text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('editor')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'editor'
                    ? 'bg-white dark:bg-darkSurface-elev3 text-brand-primary shadow-sm'
                    : 'text-surface-muted hover:text-surface-text'
                }`}
              >
                <FileEdit className="w-3.5 h-3.5" />
                <span>Editor</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'split'
                    ? 'bg-white dark:bg-darkSurface-elev3 text-brand-primary shadow-sm'
                    : 'text-surface-muted hover:text-surface-text'
                }`}
              >
                <Split className="w-3.5 h-3.5" />
                <span>Split View</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'preview'
                    ? 'bg-white dark:bg-darkSurface-elev3 text-brand-primary shadow-sm'
                    : 'text-surface-muted hover:text-surface-text'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Learner Preview</span>
              </button>
            </div>

            {/* AI Fix All */}
            <button
              onClick={handleAiFixAll}
              disabled={isFixing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-bold hover:bg-purple-500/20 transition-all disabled:opacity-50"
              title="Enhance explanations and verify LaTeX syntax"
            >
              <Wand2 className={`w-3.5 h-3.5 ${isFixing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">AI Fix All</span>
            </button>

            {/* Save Draft Button */}
            <button
              onClick={handleSaveDraft}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-surface-border text-surface-text dark:text-darkSurface-text text-xs font-bold hover:bg-surface-elev2 transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Draft</span>
            </button>

            {/* Publish Button */}
            <button
              onClick={handlePublishTest}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Publish Test</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Workspace ────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Question Palette Sidebar (Left) */}
          <div className="lg:col-span-3 space-y-4">
            <div className="p-4 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-surface-muted uppercase tracking-wider">
                  Questions ({canonicalQuestions.length})
                </span>
                <button
                  onClick={handleAddQuestion}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-primary/10 text-brand-primary text-xs font-bold hover:bg-brand-primary/20 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>

              {/* Question items list */}
              <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
                {canonicalQuestions.map((q, idx) => {
                  const isActive = idx === activeQuestionIdx;
                  const res = validateManualQuestion(q, isDraft);

                  return (
                    <div
                      key={q.questionId || idx}
                      onClick={() => setActiveQuestionIdx(idx)}
                      className={`group p-2.5 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                        isActive
                          ? 'border-brand-primary bg-brand-primary/10 font-bold text-brand-primary'
                          : 'border-surface-border hover:bg-surface-elev2 text-surface-text dark:text-darkSurface-text'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-6 h-6 rounded-lg bg-surface-elev2 flex items-center justify-center text-[11px] font-bold">
                          {q.questionNumber || idx + 1}
                        </span>
                        <span className="truncate max-w-[120px]">
                          {q.questionText || 'Empty Question'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        {!res.isValid && (
                          <span title="Has validation warnings">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                          </span>
                        )}
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-elev2 text-surface-muted uppercase">
                          {q.questionType}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Subject & Category Card */}
            <div className="p-4 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm space-y-3">
              <label className="text-xs font-bold text-surface-muted uppercase tracking-wider block">
                Exam Subject & Topic:
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Operating Systems / GATE CS"
                className="w-full p-2.5 rounded-xl border border-surface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs font-medium text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
              />
            </div>
          </div>

          {/* Active Question Editor & Preview Panel (Center / Right) */}
          <div className="lg:col-span-9">
            <div className={`grid gap-6 ${viewMode === 'split' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
              {/* ── EDITOR FORM ── */}
              {(viewMode === 'editor' || viewMode === 'split') && (
                <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 shadow-sm space-y-6">
                  {/* Top Question Controls Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-surface-border">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-xl bg-brand-primary/10 text-brand-primary font-bold text-sm border border-brand-primary/20">
                        Question #{activeQuestion.questionNumber || activeQuestionIdx + 1}
                      </span>

                      {/* Question Type Selector */}
                      <select
                        value={activeQuestion.questionType || 'MCQ'}
                        onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold border border-surface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
                      >
                        <option value="MCQ">MCQ (Single Choice)</option>
                        <option value="MSQ">MSQ (Multiple Select)</option>
                        <option value="NAT">NAT (Numerical Answer)</option>
                        <option value="TRUE_FALSE">True / False</option>
                        <option value="DESCRIPTIVE">Descriptive / Subjective</option>
                      </select>
                    </div>

                    {/* Question Actions (Duplicate, Reorder, Delete) */}
                    <div className="flex items-center gap-1">
                      {activeQuestionIdx > 0 && (
                        <button
                          type="button"
                          onClick={() => handleMoveQuestion(activeQuestionIdx, 'up')}
                          className="p-1.5 rounded-lg text-surface-muted hover:text-surface-text hover:bg-surface-elev2"
                          title="Move question up"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                      )}
                      {activeQuestionIdx < canonicalQuestions.length - 1 && (
                        <button
                          type="button"
                          onClick={() => handleMoveQuestion(activeQuestionIdx, 'down')}
                          className="p-1.5 rounded-lg text-surface-muted hover:text-surface-text hover:bg-surface-elev2"
                          title="Move question down"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDuplicateQuestion(activeQuestionIdx)}
                        className="p-1.5 rounded-lg text-surface-muted hover:text-surface-text hover:bg-surface-elev2"
                        title="Duplicate question"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteQuestion(activeQuestionIdx)}
                        className="p-1.5 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-500/10"
                        title="Delete question"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Taxonomy & Marking Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-surface-elev2/50 dark:bg-darkSurface-elev2/50 border border-surface-border">
                    <div>
                      <label className="text-[10px] font-bold text-surface-muted uppercase">Section:</label>
                      <input
                        type="text"
                        value={activeQuestion.sectionName || ''}
                        onChange={(e) => updateActiveQuestion({ sectionName: e.target.value })}
                        placeholder="e.g. General Aptitude"
                        className="w-full p-1.5 rounded-lg border border-surface-border bg-white dark:bg-darkSurface-elev1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-surface-muted uppercase">Topic:</label>
                      <input
                        type="text"
                        value={typeof activeQuestion.topic === 'string' ? activeQuestion.topic : (activeQuestion.topic?.primaryTopicName || '')}
                        onChange={(e) => updateActiveQuestion({ topic: e.target.value })}
                        placeholder="e.g. Paging"
                        className="w-full p-1.5 rounded-lg border border-surface-border bg-white dark:bg-darkSurface-elev1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-surface-muted uppercase">Marks (+):</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={activeQuestion.scoring?.marks ?? 1}
                        onChange={(e) =>
                          updateActiveQuestion({
                            scoring: {
                              ...activeQuestion.scoring,
                              marks: parseFloat(e.target.value) || 1,
                              negativeMarks: activeQuestion.scoring?.negativeMarks || 0,
                              scoringRule: 'STANDARD',
                            },
                          })
                        }
                        className="w-full p-1.5 rounded-lg border border-surface-border bg-white dark:bg-darkSurface-elev1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-surface-muted uppercase">Negative (-):</label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        value={activeQuestion.scoring?.negativeMarks ?? 0.33}
                        onChange={(e) =>
                          updateActiveQuestion({
                            scoring: {
                              ...activeQuestion.scoring,
                              marks: activeQuestion.scoring?.marks || 1,
                              negativeMarks: parseFloat(e.target.value) || 0,
                              scoringRule: 'STANDARD',
                            },
                          })
                        }
                        className="w-full p-1.5 rounded-lg border border-surface-border bg-white dark:bg-darkSurface-elev1 text-xs"
                      />
                    </div>
                  </div>

                  {/* Question Stem Text Area */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-surface-muted uppercase tracking-wider flex items-center justify-between">
                      <span>Question Text (Markdown & Math supported):</span>
                      <span className="text-[11px] font-normal text-surface-muted">LaTeX: $x^2$, \int</span>
                    </label>
                    <textarea
                      rows={3}
                      value={activeQuestion.questionText || ''}
                      onChange={(e) => updateActiveQuestion({ questionText: e.target.value })}
                      placeholder="Write your question stem here..."
                      className={`w-full p-3 rounded-2xl border text-xs focus:outline-none focus:border-brand-primary resize-none font-mono ${
                        fieldErrors.questionText ? 'border-red-500 bg-red-500/5' : 'border-surface-border bg-white dark:bg-darkSurface-elev1'
                      }`}
                    />
                    {fieldErrors.questionText && (
                      <p className="text-[11px] font-medium text-red-500">{fieldErrors.questionText}</p>
                    )}
                  </div>

                  {/* Content Blocks Editor (Diagrams, Math Equations, Tables, Code, Lists) */}
                  <ContentBlockEditor
                    blocks={activeQuestion.contentBlocks || []}
                    onChange={(blocks) => updateActiveQuestion({ contentBlocks: blocks })}
                  />

                  {/* ── OPTIONS & ANSWER SECTION ── */}
                  <div className="space-y-3 pt-3 border-t border-surface-border">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-surface-muted uppercase tracking-wider">
                        {activeQuestion.questionType === 'NAT'
                          ? 'Numerical Answer Key'
                          : activeQuestion.questionType === 'MSQ'
                          ? 'Options (Select all correct keys)'
                          : activeQuestion.questionType === 'TRUE_FALSE'
                          ? 'True/False Key'
                          : activeQuestion.questionType === 'DESCRIPTIVE'
                          ? 'Evaluation Rubric'
                          : 'Options (Select one correct key)'}
                      </label>

                      {(activeQuestion.questionType === 'MCQ' || activeQuestion.questionType === 'MSQ') && (
                        <button
                          type="button"
                          onClick={handleAddOption}
                          className="flex items-center gap-1 text-xs text-brand-primary font-bold hover:underline"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Option</span>
                        </button>
                      )}
                    </div>

                    {/* Field-level error for options/answer */}
                    {(fieldErrors.options || fieldErrors.answer) && (
                      <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
                        {fieldErrors.options || fieldErrors.answer}
                      </div>
                    )}

                    {/* Options list for MCQ / MSQ / TRUE_FALSE */}
                    {(activeQuestion.questionType === 'MCQ' ||
                      activeQuestion.questionType === 'MSQ' ||
                      activeQuestion.questionType === 'TRUE_FALSE') && (
                      <div className="space-y-2">
                        {activeQuestion.options?.map((opt, oIdx) => {
                          const isCorrect =
                            opt.isCorrect ||
                            activeQuestion.answer?.correctOptionIndex === oIdx ||
                            activeQuestion.answer?.correctOptionId === opt.id ||
                            activeQuestion.answer?.correctOptionIndices?.includes(oIdx) ||
                            activeQuestion.answer?.correctOptionIds?.includes(opt.id);

                          return (
                            <div
                              key={opt.id || oIdx}
                              className={`p-2.5 rounded-2xl border flex items-center gap-2.5 transition-all ${
                                isCorrect
                                  ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                                  : 'border-surface-border bg-white dark:bg-darkSurface-elev1'
                              }`}
                            >
                              {/* Toggle correct answer */}
                              <button
                                type="button"
                                onClick={() => handleToggleCorrectOption(oIdx)}
                                className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                                  isCorrect
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'border border-surface-border text-surface-muted hover:border-brand-primary'
                                }`}
                                title="Click to mark as correct answer"
                              >
                                {isCorrect ? <Check className="w-3.5 h-3.5" /> : opt.id || String.fromCharCode(65 + oIdx)}
                              </button>

                              {/* Option Text Input */}
                              <input
                                type="text"
                                value={opt.text}
                                onChange={(e) => handleUpdateOption(oIdx, e.target.value)}
                                placeholder={`Option ${opt.id || oIdx + 1} text...`}
                                className="flex-1 p-1 bg-transparent text-xs text-surface-text dark:text-darkSurface-text focus:outline-none"
                              />

                              {/* Remove Option Button (MCQ/MSQ min 2) */}
                              {activeQuestion.questionType !== 'TRUE_FALSE' &&
                                (activeQuestion.options?.length || 0) > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveOption(oIdx)}
                                    className="p-1 text-surface-muted hover:text-red-500"
                                    title="Delete option"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* NAT numerical answer input */}
                    {activeQuestion.questionType === 'NAT' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-surface-elev2/50 border border-surface-border">
                        <div>
                          <label className="text-[10px] font-bold text-surface-muted uppercase">
                            Exact Value:
                          </label>
                          <input
                            type="number"
                            step="any"
                            value={activeQuestion.answer?.natValue ?? ''}
                            onChange={(e) =>
                              updateActiveQuestion({
                                answer: {
                                  ...activeQuestion.answer,
                                  questionType: 'NAT',
                                  natValue: parseFloat(e.target.value) || 0,
                                },
                              })
                            }
                            placeholder="e.g. 42 or 3.14"
                            className="w-full p-2 rounded-xl border border-surface-border bg-white dark:bg-darkSurface-elev1 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-surface-muted uppercase">
                            Acceptable Range (Min - Max):
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="any"
                              value={activeQuestion.answer?.natRange?.min ?? ''}
                              onChange={(e) =>
                                updateActiveQuestion({
                                  answer: {
                                    ...activeQuestion.answer,
                                    questionType: 'NAT',
                                    natRange: {
                                      min: parseFloat(e.target.value) || 0,
                                      max: activeQuestion.answer?.natRange?.max ?? 0,
                                    },
                                  },
                                })
                              }
                              placeholder="Min"
                              className="w-full p-2 rounded-xl border border-surface-border bg-white dark:bg-darkSurface-elev1 text-xs"
                            />
                            <span className="text-surface-muted text-xs">to</span>
                            <input
                              type="number"
                              step="any"
                              value={activeQuestion.answer?.natRange?.max ?? ''}
                              onChange={(e) =>
                                updateActiveQuestion({
                                  answer: {
                                    ...activeQuestion.answer,
                                    questionType: 'NAT',
                                    natRange: {
                                      min: activeQuestion.answer?.natRange?.min ?? 0,
                                      max: parseFloat(e.target.value) || 0,
                                    },
                                  },
                                })
                              }
                              placeholder="Max"
                              className="w-full p-2 rounded-xl border border-surface-border bg-white dark:bg-darkSurface-elev1 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Explanation & Solution */}
                  <div className="space-y-1.5 pt-3 border-t border-surface-border">
                    <label className="text-xs font-bold text-surface-muted uppercase tracking-wider">
                      Authoritative Explanation & Solution:
                    </label>
                    <textarea
                      rows={3}
                      value={activeQuestion.explanation || ''}
                      onChange={(e) => updateActiveQuestion({ explanation: e.target.value })}
                      placeholder="Step-by-step mathematical reasoning or textbook derivation..."
                      className="w-full p-3 rounded-2xl border border-surface-border bg-white dark:bg-darkSurface-elev1 text-xs focus:outline-none focus:border-brand-primary resize-none font-mono"
                    />
                  </div>
                </div>
              )}

              {/* ── LIVE LEARNER PREVIEW ── */}
              {(viewMode === 'preview' || viewMode === 'split') && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-surface-muted uppercase tracking-wider flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-brand-primary" />
                      <span>Live Candidate Preview</span>
                    </span>
                    <span className="text-[11px] text-surface-muted">
                      Renders with exact player renderer
                    </span>
                  </div>

                  <QuestionLearnerPreview question={activeQuestion} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function createNewBlankQuestion(questionNumber: number, topic: string): CanonicalQuestion {
  return {
    questionId: `manual-q-${Date.now()}-${questionNumber}`,
    sourceId: 'manual-authoring',
    sourceType: 'Manual',
    questionNumber,
    questionText: '',
    contentBlocks: [
      {
        type: 'text',
        content: '',
      },
    ],
    questionType: 'MCQ',
    options: [
      { id: 'opt-A', text: '', isCorrect: true },
      { id: 'opt-B', text: '', isCorrect: false },
      { id: 'opt-C', text: '', isCorrect: false },
      { id: 'opt-D', text: '', isCorrect: false },
    ],
    answer: {
      questionType: 'MCQ',
      correctOptionIndex: 0,
      correctOptionId: 'opt-A',
    },
    scoring: {
      marks: 1,
      negativeMarks: 0.33,
      scoringRule: 'STANDARD',
    },
    provenance: {
      sourceType: 'Manual',
      sourceFile: 'Manual Authoring',
      extractionTimestamp: Date.now(),
    },
    assets: [],
    explanation: '',
    topic: topic || 'General',
    verificationStatus: 'UNVERIFIED',
    verificationReasons: [],
    confidence: {
      extraction: 1.0,
      structure: 1.0,
      answer: 1.0,
      asset: 1.0,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
