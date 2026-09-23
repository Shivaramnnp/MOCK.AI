import React, { useState } from 'react';
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
} from 'lucide-react';
import { Question, TestHistory } from '../types';
import { LatexRenderer } from '../components/LatexRenderer';

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
  const [title, setTitle] = useState(initialTitle);
  const [category, setCategory] = useState(initialCategory);
  const [questions, setQuestions] = useState<Question[]>(
    initialQuestions.length > 0
      ? initialQuestions
      : [
          {
            id: 'q-1',
            questionText: 'What is the SI unit of electric force?',
            options: ['Newton', 'Joule', 'Volt', 'Tesla'],
            correctAnswerIndex: 0,
            topic: 'Physics',
            explanation: 'Electric force is measured in Newtons according to Coulomb’s law.',
          },
        ]
  );
  const [isFixing, setIsFixing] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [timerDurationSeconds, setTimerDurationSeconds] = useState(60);
  const [previewMath, setPreviewMath] = useState<Record<number, boolean>>({});

  // Question validation stats
  const validCount = questions.filter(
    (q) => q.questionText.trim() && q.options.every((opt) => opt.trim()) && q.correctAnswerIndex >= 0
  ).length;
  const flaggedCount = questions.length - validCount;

  const handleUpdateQuestion = (index: number, updated: Partial<Question>) => {
    setQuestions((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updated };
      return copy;
    });
  };

  const handleUpdateOption = (qIndex: number, optIndex: number, value: string) => {
    setQuestions((prev) => {
      const copy = [...prev];
      const opts = [...copy[qIndex].options];
      opts[optIndex] = value;
      copy[qIndex] = { ...copy[qIndex], options: opts };
      return copy;
    });
  };

  const handleAddQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: `q-${Date.now()}`,
        questionText: '',
        options: ['', '', '', ''],
        correctAnswerIndex: 0,
        topic: category,
        explanation: '',
      },
    ]);
  };

  const handleDeleteQuestion = (index: number) => {
    if (questions.length <= 1) {
      alert('A test must have at least one question.');
      return;
    }
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDuplicateQuestion = (index: number) => {
    const target = questions[index];
    setQuestions((prev) => {
      const copy = [...prev];
      copy.splice(index + 1, 0, { ...target, id: `q-${Date.now()}` });
      return copy;
    });
  };

  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === questions.length - 1)) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    setQuestions((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleAiFixAll = async () => {
    setIsFixing(true);
    try {
      const improved = await onAiFixAll(questions);
      setQuestions(improved);
    } catch (err) {
      alert('AI fix failed. Please check your network or API keys.');
    } finally {
      setIsFixing(false);
    }
  };

  const handleConfirmSave = (andStart = false) => {
    if (!title.trim()) {
      alert('Please enter a test title.');
      return;
    }
    const test: TestHistory = {
      id: initialTestId || existingTest?.id || `test-${Date.now()}`,
      title: title.trim(),
      category: category.trim() || 'General',
      questions,
      createdAt: existingTest?.createdAt || Date.now(),
      lastTakenAt: existingTest?.lastTakenAt ?? null,
      bestScore: existingTest?.bestScore ?? null,
      bestScorePercent: existingTest?.bestScorePercent ?? null,
      bestTotal: existingTest?.bestTotal ?? questions.length,
      lastTimeSpentSeconds: existingTest?.lastTimeSpentSeconds,
      wrongCount: existingTest?.wrongCount,
    };
    onSave(test, andStart);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6 animate-in fade-in duration-200">
      {/* ── Editor Header Bar ─────────────────────────────────────────── */}
      <div className="sticky top-16 z-30 -mx-4 px-4 py-3 sm:px-6 bg-white/90 dark:bg-darkSurface/90 backdrop-blur-md border-b border-surface-border dark:border-darkSurface-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-surface-muted hover:text-surface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-bold text-base sm:text-lg text-surface-text dark:text-darkSurface-text leading-tight truncate max-w-xs sm:max-w-md">
              {title}
            </h1>
            <div className="flex items-center gap-2 text-xs text-surface-muted dark:text-darkSurface-muted">
              <span>{questions.length} questions</span>
              <span>•</span>
              <span className="text-brand-green font-semibold">{validCount} valid</span>
              {flaggedCount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-brand-amber font-semibold">{flaggedCount} need review</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* AI Fix All Button */}
          <button
            onClick={handleAiFixAll}
            disabled={isFixing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-500/10 border border-purple-500/25 text-brand-variant text-xs font-bold hover:bg-purple-500/20 active:scale-95 transition-all disabled:opacity-50"
          >
            <Wand2 className={`w-3.5 h-3.5 ${isFixing ? 'animate-spin' : ''}`} />
            <span>{isFixing ? 'Fixing...' : 'AI Fix All'}</span>
          </button>

          {/* Save Button */}
          <button
            onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Test</span>
          </button>
        </div>
      </div>

      {/* ── Questions List ────────────────────────────────────────────── */}
      <div className="space-y-6">
        {questions.map((q, qIndex) => {
          const isMathPreview = previewMath[qIndex];
          const hasEmptyOption = q.options.some((opt) => !opt.trim());
          const isInvalid = !q.questionText.trim() || hasEmptyOption || q.correctAnswerIndex < 0;

          return (
            <div
              key={q.id || qIndex}
              className={`rounded-3xl bg-white dark:bg-darkSurface-elev1 border p-5 sm:p-6 shadow-sm transition-all ${
                isInvalid
                  ? 'border-amber-500/40 dark:border-amber-500/30'
                  : 'border-surface-border dark:border-darkSurface-border'
              }`}
            >
              {/* Question Header & Controls */}
              <div className="flex items-center justify-between pb-3 border-b border-surface-border dark:border-darkSurface-border mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-xl bg-brand-primary/10 text-brand-primary text-xs font-black flex items-center justify-center">
                    {qIndex + 1}
                  </span>
                  <span className="text-xs font-semibold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider">
                    Question {qIndex + 1} of {questions.length}
                  </span>
                  {isInvalid && (
                    <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      <span>Review needed</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      setPreviewMath((prev) => ({ ...prev, [qIndex]: !prev[qIndex] }))
                    }
                    title="Toggle LaTeX math preview"
                    className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                      isMathPreview
                        ? 'bg-brand-primary text-white'
                        : 'text-surface-muted hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span className="text-[11px] hidden sm:inline">LaTeX</span>
                  </button>
                  <button
                    onClick={() => handleMoveQuestion(qIndex, 'up')}
                    disabled={qIndex === 0}
                    className="p-1.5 rounded-lg text-surface-muted hover:bg-surface-elev2 disabled:opacity-30"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleMoveQuestion(qIndex, 'down')}
                    disabled={qIndex === questions.length - 1}
                    className="p-1.5 rounded-lg text-surface-muted hover:bg-surface-elev2 disabled:opacity-30"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDuplicateQuestion(qIndex)}
                    title="Duplicate"
                    className="p-1.5 rounded-lg text-surface-muted hover:bg-surface-elev2"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteQuestion(qIndex)}
                    title="Delete question"
                    className="p-1.5 rounded-lg text-surface-muted hover:text-brand-red hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Question Text Input */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider">
                  Question Statement:
                </label>
                <textarea
                  rows={3}
                  value={q.questionText}
                  onChange={(e) => handleUpdateQuestion(qIndex, { questionText: e.target.value })}
                  placeholder="Enter question text here... (Math formulas like $E = mc^2$ or $\frac{a}{b}$ are supported)"
                  className="w-full p-3.5 rounded-2xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-sm focus:outline-none focus:border-brand-primary resize-none font-medium"
                />

                {/* Math Live Preview */}
                {isMathPreview && q.questionText && (
                  <div className="p-3 rounded-xl bg-brand-primary/5 border border-brand-primary/20 text-sm">
                    <span className="text-[10px] font-bold text-brand-primary block uppercase tracking-wider mb-1">
                      LaTeX Formula Preview:
                    </span>
                    <LatexRenderer content={q.questionText} />
                  </div>
                )}
              </div>

              {/* 4 Options Grid */}
              <div className="space-y-2.5 mt-4">
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider">
                  Options (Select correct answer with radio):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {q.options.map((opt, optIndex) => {
                    const isCorrect = q.correctAnswerIndex === optIndex;
                    const letter = String.fromCharCode(65 + optIndex);

                    return (
                      <div
                        key={optIndex}
                        className={`flex items-center gap-2 p-2 rounded-2xl border transition-all ${
                          isCorrect
                            ? 'bg-emerald-500/10 border-emerald-500/40'
                            : 'bg-surface-elev2 dark:bg-darkSurface-elev2 border-surface-border dark:border-darkSurface-border'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleUpdateQuestion(qIndex, { correctAnswerIndex: optIndex })}
                          className={`w-7 h-7 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 transition-all ${
                            isCorrect
                              ? 'bg-brand-green text-white shadow-sm'
                              : 'bg-white dark:bg-darkSurface-elev1 text-surface-muted border border-surface-border dark:border-darkSurface-border hover:border-brand-primary'
                          }`}
                        >
                          {isCorrect ? '✓' : letter}
                        </button>

                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => handleUpdateOption(qIndex, optIndex, e.target.value)}
                          placeholder={`Option ${letter}`}
                          className="w-full bg-transparent border-none text-xs sm:text-sm text-surface-text dark:text-darkSurface-text focus:outline-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Topic & Explanation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-3 border-t border-surface-border dark:border-darkSurface-border">
                <div>
                  <label className="block text-[11px] font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1">
                    Topic / Subtopic:
                  </label>
                  <input
                    type="text"
                    value={q.topic || ''}
                    onChange={(e) => handleUpdateQuestion(qIndex, { topic: e.target.value })}
                    placeholder="e.g. Kinematics, Algebra..."
                    className="w-full px-3 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1">
                    Explanation / Solution:
                  </label>
                  <input
                    type="text"
                    value={q.explanation || ''}
                    onChange={(e) => handleUpdateQuestion(qIndex, { explanation: e.target.value })}
                    placeholder="Explain why the selected option is correct..."
                    className="w-full px-3 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>
            </div>
          );
        })}

        {/* Add Question Button */}
        <button
          onClick={handleAddQuestion}
          className="w-full py-4 rounded-3xl border-2 border-dashed border-surface-border dark:border-darkSurface-border hover:border-brand-primary bg-white dark:bg-darkSurface-elev1 text-surface-muted hover:text-brand-primary font-bold text-sm flex items-center justify-center gap-2 transition-all"
        >
          <Plus className="w-5 h-5" />
          <span>Add New Question</span>
        </button>
      </div>

      {/* ── Save Settings Modal ───────────────────────────────────────── */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white dark:bg-darkSurface-elev1 rounded-3xl border border-surface-border dark:border-darkSurface-border shadow-2xl p-6">
            <h3 className="font-bold text-xl text-surface-text dark:text-darkSurface-text mb-4">
              Save Mock Test
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1.5">
                  Test Title:
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1.5">
                  Category / Subject:
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Physics, Coding, Medicine..."
                  className="w-full px-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1.5">
                  Exam Timer Duration:
                </label>
                <select
                  value={timerDurationSeconds}
                  onChange={(e) => setTimerDurationSeconds(Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary font-medium"
                >
                  <option value={30}>30 Seconds (Speed Sprint)</option>
                  <option value={60}>60 Seconds (Standard MCQ)</option>
                  <option value={120}>2 Minutes (Calculations)</option>
                  <option value={300}>5 Minutes</option>
                  <option value={0}>Untimed (Relaxed practice)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-surface-border dark:border-darkSurface-border">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-xs font-semibold text-surface-muted hover:text-surface-text"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmSave(false)}
                className="px-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border text-xs font-bold text-surface-text dark:text-darkSurface-text hover:bg-surface-elev2"
              >
                Save to History
              </button>
              <button
                onClick={() => handleConfirmSave(true)}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-xs font-bold shadow-md hover:brightness-110"
              >
                Save & Start Exam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
