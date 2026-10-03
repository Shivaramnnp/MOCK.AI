import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  FileText,
  Key,
  Layers,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Tag,
  Info,
  ExternalLink,
  Play,
} from 'lucide-react';
import { PairingIngestionReport, QuestionAnswerMatch } from '../services/ingestion/pairing/types';
import { LatexRenderer } from '../components/LatexRenderer';

interface SourceReviewScreenProps {
  report: PairingIngestionReport;
  onBack: () => void;
  onConfirmImport: () => void;
  onTakeMockTest?: () => void;
}

export const SourceReviewScreen: React.FC<SourceReviewScreenProps> = ({
  report,
  onBack,
  onConfirmImport,
  onTakeMockTest,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'REVIEW_REQUIRED' | 'MATCHED' | 'CONFLICT'>('ALL');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const filteredMatches = report.matches.filter((m) => {
    if (filter === 'REVIEW_REQUIRED') return m.matchStatus === 'REVIEW_REQUIRED' || m.matchStatus === 'MISSING_KEY';
    if (filter === 'MATCHED') return m.matchStatus === 'MATCHED';
    if (filter === 'CONFLICT') return m.matchStatus === 'MISMATCH' || m.matchStatus === 'INVALID_KEY' || m.matchStatus === 'DUPLICATE_KEY';
    return true;
  });

  const activeMatch: QuestionAnswerMatch | undefined = filteredMatches[selectedIdx] || filteredMatches[0];
  const q = activeMatch?.canonicalQuestion;
  const ak = activeMatch?.answerKeyEntry;

  return (
    <div className="min-h-screen bg-surface-elev0 dark:bg-darkSurface-elev0 text-surface-text dark:text-darkSurface-text flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-darkSurface-elev1/95 backdrop-blur-md border-b border-surface-border dark:border-darkSurface-border px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl text-surface-muted hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-lg text-surface-text dark:text-darkSurface-text">
                  Forensic Source Pairing Review
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-primary/10 text-brand-primary">
                  {report.mode}
                </span>
              </div>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                {report.questionPaperSummary?.fileName} {report.answerKeySummary ? `↔ ${report.answerKeySummary.fileName}` : '(No Answer Key)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onTakeMockTest && (
              <button
                onClick={onTakeMockTest}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-md active:scale-95 flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Take Mock Test</span>
              </button>
            )}
            <button
              onClick={onConfirmImport}
              className="px-4 py-2 rounded-xl bg-brand-primary text-white font-semibold text-xs hover:bg-brand-primary/90 transition-all shadow-md active:scale-95"
            >
              Confirm & Continue to Editor
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="max-w-7xl mx-auto w-full flex-1 p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Question Navigation List */}
        <aside className="lg:col-span-4 flex flex-col space-y-3">
          {/* Filter Pills */}
          <div className="flex gap-1.5 p-1 rounded-xl bg-surface-elev1 dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border text-xs">
            <button
              onClick={() => {
                setFilter('ALL');
                setSelectedIdx(0);
              }}
              className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
                filter === 'ALL'
                  ? 'bg-white dark:bg-darkSurface-elev2 text-brand-primary shadow-sm'
                  : 'text-surface-muted'
              }`}
            >
              All ({report.matches.length})
            </button>
            <button
              onClick={() => {
                setFilter('REVIEW_REQUIRED');
                setSelectedIdx(0);
              }}
              className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
                filter === 'REVIEW_REQUIRED'
                  ? 'bg-white dark:bg-darkSurface-elev2 text-amber-500 shadow-sm'
                  : 'text-surface-muted'
              }`}
            >
              Review ({report.reviewRequiredCount})
            </button>
            <button
              onClick={() => {
                setFilter('MATCHED');
                setSelectedIdx(0);
              }}
              className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
                filter === 'MATCHED'
                  ? 'bg-white dark:bg-darkSurface-elev2 text-emerald-500 shadow-sm'
                  : 'text-surface-muted'
              }`}
            >
              Matched ({report.matchedCount})
            </button>
          </div>

          {/* Question List */}
          <div className="flex-1 overflow-y-auto max-h-[calc(100vh-210px)] space-y-2 pr-1">
            {filteredMatches.map((m, idx) => {
              const isSelected = idx === selectedIdx;
              const isReview = m.matchStatus === 'REVIEW_REQUIRED' || m.matchStatus === 'MISSING_KEY';
              const isMatched = m.matchStatus === 'MATCHED';

              return (
                <button
                  key={m.questionNumber}
                  onClick={() => setSelectedIdx(idx)}
                  className={`w-full p-3 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                    isSelected
                      ? 'border-brand-primary bg-brand-primary/5 dark:bg-brand-primary/10 shadow-sm'
                      : 'border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 hover:border-surface-border/80'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                      isMatched
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : isReview
                        ? 'bg-amber-500/10 text-amber-600'
                        : 'bg-surface-elev2 text-surface-muted'
                    }`}
                  >
                    Q{m.questionNumber}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-surface-text dark:text-darkSurface-text">
                        {m.questionType} • {m.sectionName || 'General'}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          isMatched
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : isReview
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                        }`}
                      >
                        {m.matchStatus}
                      </span>
                    </div>
                    <p className="text-xs text-surface-muted dark:text-darkSurface-muted truncate mt-1">
                      {m.questionStemPreview || 'No stem preview'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Column: Side-by-Side Comparison */}
        <main className="lg:col-span-8 flex flex-col space-y-4">
          {activeMatch ? (
            <>
              {/* Status Header Banner */}
              <div
                className={`p-4 rounded-2xl border flex items-center justify-between ${
                  activeMatch.matchStatus === 'MATCHED'
                    ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                    : activeMatch.matchStatus === 'REVIEW_REQUIRED'
                    ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20'
                    : 'border-surface-border bg-white dark:bg-darkSurface-elev1'
                }`}
              >
                <div className="flex items-center gap-3">
                  {activeMatch.matchStatus === 'MATCHED' ? (
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  )}
                  <div>
                    <h3 className="font-bold text-sm text-surface-text dark:text-darkSurface-text">
                      Question {activeMatch.questionNumber} — Status: {activeMatch.matchStatus}
                    </h3>
                    <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                      {activeMatch.matchReason} (Confidence: {Math.round(activeMatch.matchConfidence * 100)}%)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    disabled={selectedIdx <= 0}
                    onClick={() => setSelectedIdx((prev) => Math.max(0, prev - 1))}
                    className="p-1.5 rounded-lg border border-surface-border dark:border-darkSurface-border hover:bg-surface-elev2 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-surface-muted">
                    {selectedIdx + 1} / {filteredMatches.length}
                  </span>
                  <button
                    disabled={selectedIdx >= filteredMatches.length - 1}
                    onClick={() => setSelectedIdx((prev) => Math.min(filteredMatches.length - 1, prev + 1))}
                    className="p-1.5 rounded-lg border border-surface-border dark:border-darkSurface-border hover:bg-surface-elev2 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Side-by-Side Comparison Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* LEFT: Extracted Mock.AI Question */}
                <div className="p-5 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm flex flex-col space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-surface-border dark:border-darkSurface-border">
                    <span className="font-bold text-xs uppercase tracking-wider text-surface-muted flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-blue-500" />
                      Extracted Question
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-surface-elev2">
                      {q?.questionType || activeMatch.questionType}
                    </span>
                  </div>

                  {/* Question Stem with LaTeX */}
                  <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed">
                    <LatexRenderer content={q?.questionText || activeMatch.questionStemPreview || ''} />
                  </div>

                  {/* Assets if present */}
                  {q?.assets && q.assets.length > 0 && (
                    <div className="space-y-2">
                      {q.assets.map((asset) => (
                        <div key={asset.assetId} className="p-2 rounded-xl border border-surface-border bg-surface-elev1 text-center">
                          {asset.assetUrl ? (
                            <img src={asset.assetUrl} alt={asset.caption || 'Question Asset'} className="max-h-48 mx-auto rounded-lg object-contain" />
                          ) : (
                            <span className="text-xs text-surface-muted">Diagram Asset ({asset.assetType})</span>
                          )}
                          <span className="text-[10px] text-surface-muted block mt-1">Ownership: {asset.ownership}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Options */}
                  {q?.options && q.options.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <span className="text-xs font-semibold text-surface-muted">Options ({q.options.length}):</span>
                      {q.options.map((opt) => (
                        <div
                          key={opt.id}
                          className={`p-2.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                            opt.isCorrect
                              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200'
                              : 'border-surface-border bg-surface-elev1/40'
                          }`}
                        >
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center font-bold shrink-0 ${
                            opt.isCorrect ? 'bg-emerald-500 text-white' : 'bg-surface-elev2 text-surface-muted'
                          }`}>
                            {opt.id}
                          </span>
                          <div className="flex-1">
                            <LatexRenderer content={opt.text} />
                          </div>
                          {opt.isCorrect && <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Scoring Info */}
                  <div className="pt-2 text-xs flex items-center justify-between text-surface-muted border-t border-surface-border dark:border-darkSurface-border">
                    <span>Marks: +{q?.scoring?.marks || 1}</span>
                    <span>Negative: -{q?.scoring?.negativeMarks || 0}</span>
                    <span>Rule: {q?.scoring?.scoringRule || 'STANDARD'}</span>
                  </div>
                </div>

                {/* RIGHT: Official Answer Key Evidence */}
                <div className="p-5 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm flex flex-col space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-surface-border dark:border-darkSurface-border">
                    <span className="font-bold text-xs uppercase tracking-wider text-surface-muted flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-emerald-500" />
                      Answer Key Evidence
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600">
                      Authoritative
                    </span>
                  </div>

                  {ak ? (
                    <div className="space-y-3 flex-1">
                      <div className="p-3 rounded-xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border">
                        <span className="text-[11px] uppercase tracking-wider font-semibold text-surface-muted block mb-1">
                          Raw Key Value:
                        </span>
                        <code className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          {ak.rawAnswerText}
                        </code>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 rounded-xl border border-surface-border">
                          <span className="text-surface-muted block text-[10px]">Detected Type</span>
                          <span className="font-semibold text-surface-text">{ak.detectedType || 'Unknown'}</span>
                        </div>
                        <div className="p-2.5 rounded-xl border border-surface-border">
                          <span className="text-surface-muted block text-[10px]">Marks</span>
                          <span className="font-semibold text-surface-text">+{ak.marks || 1} (-{ak.negativeMarks || 0})</span>
                        </div>
                      </div>

                      {ak.natRange && (
                        <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-950/20 text-xs">
                          <span className="font-semibold text-blue-900 dark:text-blue-300 block mb-1">
                            Accepted Numerical Range:
                          </span>
                          <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-200">
                            [{ak.natRange.min} , {ak.natRange.max}]
                          </span>
                        </div>
                      )}

                      {ak.msqOptions && (
                        <div className="p-3 rounded-xl border border-purple-200 bg-purple-50/50 dark:border-purple-900/40 dark:bg-purple-950/20 text-xs">
                          <span className="font-semibold text-purple-900 dark:text-purple-300 block mb-1">
                            Official Correct Option Set:
                          </span>
                          <span className="font-mono text-sm font-bold text-purple-700 dark:text-purple-200">
                            {ak.msqOptions.join(', ')}
                          </span>
                        </div>
                      )}

                      {ak.isMta && (
                        <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200">
                          <span className="font-bold block">Marks to All (MTA)</span>
                          This question has been marked MTA officially. All candidates receive full credit.
                        </div>
                      )}

                      <div className="p-3 rounded-xl bg-surface-elev1 text-[11px] text-surface-muted space-y-1">
                        <span className="font-semibold block text-surface-text">Raw Source Line:</span>
                        <code className="text-[10px] break-all block">{ak.rawLine || 'N/A'}</code>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 rounded-xl border border-dashed border-surface-border text-center flex-1 flex flex-col items-center justify-center text-surface-muted text-xs">
                      <Info className="w-8 h-8 text-amber-500 mb-2 opacity-60" />
                      <p className="font-semibold">No Answer Key Provided</p>
                      <p className="text-[11px] mt-1">This question was ingested without an answer key. Answer fields remain unverified.</p>
                    </div>
                  )}

                  {/* Provenance Box */}
                  <div className="pt-2 border-t border-surface-border text-[11px] text-surface-muted space-y-1">
                    <span className="font-semibold text-surface-text">Provenance:</span>
                    <div>Page: {q?.provenance?.sourcePage ?? 'N/A'}</div>
                    <div className="truncate">File: {q?.provenance?.sourceFile ?? 'N/A'}</div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-surface-muted">
              Select a question from the left panel to inspect forensic pairing.
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
