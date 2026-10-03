import React, { useState } from 'react';
import {
  CanonicalContentBlock,
  CanonicalOption,
  CanonicalQuestion,
} from '../../types/canonicalQuestion';
import { StructuredContentRenderer } from '../StructuredContentRenderer';
import { Check, CheckCircle2, HelpCircle, Sparkles, Tag, Layers } from 'lucide-react';
import { LatexRenderer } from '../LatexRenderer';

interface QuestionLearnerPreviewProps {
  question: CanonicalQuestion;
}

export const QuestionLearnerPreview: React.FC<QuestionLearnerPreviewProps> = ({ question }) => {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [natInputValue, setNatInputValue] = useState<string>('');
  const [showSolution, setShowSolution] = useState(false);

  const qType = question.questionType || 'MCQ';
  const options = question.options || [];

  const handleSelectMsq = (optId: string) => {
    setSelectedOptionIds((prev) =>
      prev.includes(optId) ? prev.filter((id) => id !== optId) : [...prev, optId]
    );
  };

  return (
    <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 shadow-sm space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-surface-border dark:border-darkSurface-border">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-xl bg-brand-primary/10 text-brand-primary font-bold text-xs border border-brand-primary/20">
            Q.{question.questionNumber || 1}
          </span>
          <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text border border-surface-border">
            {qType === 'MCQ'
              ? 'Multiple Choice (MCQ)'
              : qType === 'MSQ'
              ? 'Multiple Select (MSQ)'
              : qType === 'NAT'
              ? 'Numerical Answer (NAT)'
              : qType === 'TRUE_FALSE'
              ? 'True / False'
              : 'Descriptive'}
          </span>

          {question.sectionName && (
            <span className="flex items-center gap-1 text-[11px] text-surface-muted bg-surface-elev2 px-2 py-0.5 rounded-md">
              <Layers className="w-3 h-3" />
              <span>{question.sectionName}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
            <span>+{question.scoring?.marks ?? 1}</span>
            {question.scoring?.negativeMarks ? (
              <span className="text-red-500"> / -{question.scoring.negativeMarks}</span>
            ) : (
              <span className="text-gray-400"> / -0</span>
            )}
          </div>
        </div>
      </div>

      {/* Question Stem rendered via real StructuredContentRenderer */}
      <div className="text-sm text-surface-text dark:text-darkSurface-text leading-relaxed space-y-3">
        <StructuredContentRenderer
          blocks={question.contentBlocks as any}
          fallbackText={question.questionText}
          questionNumber={question.questionNumber}
        />
      </div>

      {/* Diagram URL fallback if present */}
      {question.diagramUrl && (
        <div className="py-2 flex flex-col items-center">
          <img
            src={question.diagramUrl}
            alt="Question Diagram"
            className="max-h-60 rounded-xl border border-surface-border object-contain shadow-sm"
          />
        </div>
      )}

      {/* Candidate Response Area */}
      <div className="pt-2 space-y-3">
        {/* ── MCQ: Single Choice Radios ── */}
        {qType === 'MCQ' && (
          <div className="space-y-2">
            {options.map((opt, idx) => {
              const optId = opt.id || String.fromCharCode(65 + idx);
              const isSelected = selectedOptionId === optId;
              const isCorrectAnswer =
                showSolution &&
                ((question.answer?.correctOptionIndex === idx) ||
                  (question.answer?.correctOptionId === optId) ||
                  opt.isCorrect);

              return (
                <div
                  key={optId}
                  onClick={() => setSelectedOptionId(optId)}
                  className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer ${
                    isCorrectAnswer
                      ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/20'
                      : isSelected
                      ? 'border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary/40'
                      : 'border-surface-border dark:border-darkSurface-border bg-surface-elev2/40 dark:bg-darkSurface-elev2/40 hover:border-surface-borderHover'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold transition-colors ${
                      isSelected
                        ? 'bg-brand-primary text-white shadow-sm'
                        : 'border border-surface-border text-surface-muted bg-white dark:bg-darkSurface-elev1'
                    }`}
                  >
                    {optId}
                  </div>
                  <div className="flex-1 text-xs text-surface-text dark:text-darkSurface-text pt-0.5">
                    {opt.contentBlocks && opt.contentBlocks.length > 0 ? (
                      <StructuredContentRenderer blocks={opt.contentBlocks as any} isOption={true} />
                    ) : (
                      <LatexRenderer content={opt.text} />
                    )}
                  </div>
                  {isCorrectAnswer && (
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                      Correct Key
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── MSQ: Multiple Choice Checkboxes ── */}
        {qType === 'MSQ' && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
              Select one or more options:
            </p>
            {options.map((opt, idx) => {
              const optId = opt.id || String.fromCharCode(65 + idx);
              const isSelected = selectedOptionIds.includes(optId);
              const isCorrectAnswer =
                showSolution &&
                ((question.answer?.correctOptionIndices?.includes(idx)) ||
                  (question.answer?.correctOptionIds?.includes(optId)) ||
                  opt.isCorrect);

              return (
                <div
                  key={optId}
                  onClick={() => handleSelectMsq(optId)}
                  className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer ${
                    isCorrectAnswer
                      ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/20'
                      : isSelected
                      ? 'border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/40'
                      : 'border-surface-border dark:border-darkSurface-border bg-surface-elev2/40 dark:bg-darkSurface-elev2/40 hover:border-surface-borderHover'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold transition-colors ${
                      isSelected
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'border border-surface-border text-surface-muted bg-white dark:bg-darkSurface-elev1'
                    }`}
                  >
                    {isSelected ? <Check className="w-4 h-4" /> : optId}
                  </div>
                  <div className="flex-1 text-xs text-surface-text dark:text-darkSurface-text pt-0.5">
                    {opt.contentBlocks && opt.contentBlocks.length > 0 ? (
                      <StructuredContentRenderer blocks={opt.contentBlocks as any} isOption={true} />
                    ) : (
                      <LatexRenderer content={opt.text} />
                    )}
                  </div>
                  {isCorrectAnswer && (
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                      Correct Key
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── NAT: Numerical Value / Range ── */}
        {qType === 'NAT' && (
          <div className="p-4 rounded-2xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2/30 dark:bg-darkSurface-elev2/30 space-y-3">
            <label className="text-xs font-bold text-surface-muted uppercase tracking-wider">
              Enter Numeric Value:
            </label>
            <input
              type="text"
              value={natInputValue}
              onChange={(e) => setNatInputValue(e.target.value)}
              placeholder="e.g. 3.1415"
              className="w-48 px-4 py-2.5 rounded-xl border border-surface-border bg-white dark:bg-darkSurface-elev1 text-sm font-mono text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
            />
            {showSolution && (
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs">
                {question.answer?.natRange ? (
                  <p>
                    <strong>Accepted Range:</strong> [{question.answer.natRange.min} to{' '}
                    {question.answer.natRange.max}]
                  </p>
                ) : (
                  <p>
                    <strong>Authoritative Value:</strong> {question.answer?.natValue}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TRUE_FALSE ── */}
        {qType === 'TRUE_FALSE' && (
          <div className="flex items-center gap-3">
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedOptionId(opt.id)}
                className={`flex-1 py-3 rounded-xl border font-bold text-xs transition-all ${
                  selectedOptionId === opt.id
                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                    : 'border-surface-border hover:bg-surface-elev2 text-surface-text'
                }`}
              >
                {opt.text}
              </button>
            ))}
          </div>
        )}

        {/* ── DESCRIPTIVE ── */}
        {qType === 'DESCRIPTIVE' && (
          <textarea
            rows={4}
            placeholder="Candidate enters written explanation or proof here..."
            className="w-full p-3 rounded-xl border border-surface-border bg-surface-elev2 text-xs"
          />
        )}
      </div>

      {/* Solution & Explanation Toggle */}
      <div className="pt-2 border-t border-surface-border dark:border-darkSurface-border">
        <button
          type="button"
          onClick={() => setShowSolution(!showSolution)}
          className="flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:underline"
        >
          <HelpCircle className="w-4 h-4" />
          <span>{showSolution ? 'Hide Authoritative Solution' : 'Preview Authoritative Solution'}</span>
        </button>

        {showSolution && question.explanation && (
          <div className="mt-3 p-4 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border text-xs text-surface-text dark:text-darkSurface-text space-y-1 animate-in fade-in duration-150">
            <p className="font-bold text-surface-muted uppercase text-[11px]">Explanation:</p>
            <LatexRenderer content={question.explanation} />
          </div>
        )}
      </div>
    </div>
  );
};
