import React, { useState, useRef } from 'react';
import {
  FileText,
  Key,
  CheckCircle2,
  AlertTriangle,
  X,
  Upload,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  Play,
} from 'lucide-react';
import { PairingIngestionReport } from '../services/ingestion/pairing/types';

interface SourcePairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    questionPaperFile?: File;
    answerKeyFile?: File;
    continueWithoutAnswerKey: boolean;
    exam: string;
    year: number;
    paperCode: string;
  }) => void;
  isProcessing?: boolean;
  report?: PairingIngestionReport | null;
  onOpenReview?: (report: PairingIngestionReport) => void;
  onTakeMockTest?: (report: PairingIngestionReport) => void;
}

export const SourcePairingModal: React.FC<SourcePairingModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isProcessing = false,
  report,
  onOpenReview,
  onTakeMockTest,
}) => {
  const [exam, setExam] = useState('GATE');
  const [year, setYear] = useState(2025);
  const [paperCode, setPaperCode] = useState('DA');

  const [questionPaperFile, setQuestionPaperFile] = useState<File | null>(null);
  const [answerKeyFile, setAnswerKeyFile] = useState<File | null>(null);

  const qpInputRef = useRef<HTMLInputElement>(null);
  const akInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleStartPairing = (continueWithoutKey: boolean = false) => {
    if (!questionPaperFile && !continueWithoutKey && !answerKeyFile) return;
    onSubmit({
      questionPaperFile: questionPaperFile || undefined,
      answerKeyFile: continueWithoutKey ? undefined : answerKeyFile || undefined,
      continueWithoutAnswerKey: continueWithoutKey,
      exam,
      year,
      paperCode,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-darkSurface-elev1 rounded-3xl border border-surface-border dark:border-darkSurface-border shadow-2xl p-6 sm:p-8 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-surface-border dark:border-darkSurface-border">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-brand-primary/10 text-brand-primary">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <h2 className="font-display font-bold text-xl sm:text-2xl text-surface-text dark:text-darkSurface-text">
                Import Question Paper & Answer Key
              </h2>
            </div>
            <p className="text-sm text-surface-muted dark:text-darkSurface-muted mt-1">
              Upload Question Paper and official Answer Key independently. Both sources are deterministically paired and verified.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 rounded-xl text-surface-muted hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Exam Metadata Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted mb-1.5">
              Exam
            </label>
            <select
              value={exam}
              onChange={(e) => setExam(e.target.value)}
              disabled={isProcessing}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev1 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              <option value="GATE">GATE</option>
              <option value="SSC CHSL">SSC CHSL</option>
              <option value="SSC CGL">SSC CGL</option>
              <option value="UPSC">UPSC</option>
              <option value="GENERAL">General Practice</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted mb-1.5">
              Year
            </label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              disabled={isProcessing}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev1 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              <option value={2025}>2025</option>
              <option value={2024}>2024</option>
              <option value={2023}>2023</option>
              <option value={2022}>2022</option>
              <option value={2021}>2021</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted mb-1.5">
              Discipline / Code
            </label>
            <select
              value={paperCode}
              onChange={(e) => setPaperCode(e.target.value)}
              disabled={isProcessing}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev1 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              <option value="DA">DA (Data Science & AI)</option>
              <option value="CS">CS (Computer Science)</option>
              <option value="EC">EC (Electronics & Comm)</option>
              <option value="EE">EE (Electrical Engg)</option>
              <option value="ME">ME (Mechanical Engg)</option>
              <option value="CE">CE (Civil Engg)</option>
              <option value="IN">IN (Instrumentation)</option>
            </select>
          </div>
        </div>

        {/* Independent Upload Zones */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          {/* Question Paper Zone */}
          <div className="flex flex-col p-4 rounded-2xl border-2 border-dashed border-surface-border dark:border-darkSurface-border hover:border-brand-primary transition-all bg-surface-elev1/40 dark:bg-darkSurface-elev2/40">
            <div className="flex items-center gap-2 mb-2">
              <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                <FileText className="w-4 h-4" />
              </span>
              <span className="font-bold text-sm text-surface-text dark:text-darkSurface-text">
                1. Question Paper
              </span>
            </div>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted mb-3 flex-1">
              Upload Master Question Paper PDF. Questions, options, diagrams, and math will be extracted faithfully.
            </p>

            <input
              type="file"
              ref={qpInputRef}
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) setQuestionPaperFile(e.target.files[0]);
              }}
            />

            {questionPaperFile ? (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50">
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 truncate">
                    {questionPaperFile.name}
                  </p>
                  <p className="text-[10px] text-blue-700 dark:text-blue-400">
                    {(questionPaperFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setQuestionPaperFile(null)}
                  className="p-1 text-blue-600 hover:text-blue-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => qpInputRef.current?.click()}
                disabled={isProcessing}
                className="w-full py-2.5 px-3 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 hover:bg-surface-elev2 text-xs font-semibold text-surface-text dark:text-darkSurface-text flex items-center justify-center gap-2 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                Choose Question Paper PDF
              </button>
            )}
          </div>

          {/* Answer Key Zone */}
          <div className="flex flex-col p-4 rounded-2xl border-2 border-dashed border-surface-border dark:border-darkSurface-border hover:border-emerald-500 transition-all bg-surface-elev1/40 dark:bg-darkSurface-elev2/40">
            <div className="flex items-center gap-2 mb-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Key className="w-4 h-4" />
              </span>
              <span className="font-bold text-sm text-surface-text dark:text-darkSurface-text">
                2. Answer Key (Optional)
              </span>
            </div>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted mb-3 flex-1">
              Upload official Answer Key PDF. Supports single MCQ letters, MSQ letter sets, NAT ranges, and MTA.
            </p>

            <input
              type="file"
              ref={akInputRef}
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) setAnswerKeyFile(e.target.files[0]);
              }}
            />

            {answerKeyFile ? (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-300 truncate">
                    {answerKeyFile.name}
                  </p>
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                    {(answerKeyFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAnswerKeyFile(null)}
                  className="p-1 text-emerald-600 hover:text-emerald-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => akInputRef.current?.click()}
                disabled={isProcessing}
                className="w-full py-2.5 px-3 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 hover:bg-surface-elev2 text-xs font-semibold text-surface-text dark:text-darkSurface-text flex items-center justify-center gap-2 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                Choose Answer Key PDF
              </button>
            )}
          </div>
        </div>

        {/* Live Report / Validation Result Preview */}
        {report && (
          <div className="mt-6 p-4 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border animate-in fade-in">
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-sm text-surface-text dark:text-darkSurface-text flex items-center gap-2">
                {report.identityMatched ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                )}
                Pairing Summary
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-brand-primary/10 text-brand-primary">
                {report.mode}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2 rounded-xl bg-surface-elev1 dark:bg-darkSurface-elev1">
                <span className="block font-bold text-base text-surface-text dark:text-darkSurface-text">
                  {report.questionPaperSummary?.questionsDetected ?? 0}
                </span>
                <span className="text-surface-muted text-[11px]">Questions</span>
              </div>
              <div className="p-2 rounded-xl bg-surface-elev1 dark:bg-darkSurface-elev1">
                <span className="block font-bold text-base text-emerald-600">
                  {report.matchedCount}
                </span>
                <span className="text-surface-muted text-[11px]">Matched Keys</span>
              </div>
              <div className="p-2 rounded-xl bg-surface-elev1 dark:bg-darkSurface-elev1">
                <span className="block font-bold text-base text-amber-600">
                  {report.reviewRequiredCount}
                </span>
                <span className="text-surface-muted text-[11px]">Review Required</span>
              </div>
              <div className="p-2 rounded-xl bg-surface-elev1 dark:bg-darkSurface-elev1">
                <span className="block font-bold text-base text-emerald-500">
                  {report.verifiedCount}
                </span>
                <span className="text-surface-muted text-[11px]">Verified</span>
              </div>
            </div>

            {report.warnings.length > 0 && (
              <div className="mt-3 flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 text-amber-600 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  {report.warnings.map((w, idx) => (
                    <p key={idx}>{w}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 pt-4 border-t border-surface-border dark:border-darkSurface-border">
          {/* Continue without Answer Key button */}
          <button
            type="button"
            onClick={() => handleStartPairing(true)}
            disabled={!questionPaperFile || isProcessing}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border text-xs font-semibold text-surface-muted hover:text-surface-text dark:text-darkSurface-muted dark:hover:text-darkSurface-text transition-colors disabled:opacity-40"
          >
            Continue without Answer Key
          </button>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {report && onTakeMockTest && (
              <button
                type="button"
                onClick={() => onTakeMockTest(report)}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Take Mock Test</span>
              </button>
            )}

            {report && onOpenReview && (
              <button
                type="button"
                onClick={() => onOpenReview(report)}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border border-brand-primary text-brand-primary font-semibold text-xs hover:bg-brand-primary/10 transition-colors"
              >
                Inspect Matching
              </button>
            )}

            <button
              type="button"
              onClick={() => handleStartPairing(false)}
              disabled={(!questionPaperFile && !answerKeyFile) || isProcessing}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-brand-primary text-white font-semibold text-xs flex items-center justify-center gap-2 hover:bg-brand-primary/90 transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {isProcessing ? (
                <>Processing...</>
              ) : answerKeyFile ? (
                <>
                  Ingest & Pair Sources
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  Ingest Question Paper
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
