import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Award,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  BookOpen,
  HelpCircle,
  FileCheck2,
  ChevronRight,
} from 'lucide-react';
import { ExamService } from '../services/examService';
import { ExamPaper } from '../types';
import { AdSlot } from '../components/ads/AdSlot';

interface ExamDetailScreenProps {
  examId: string;
  onBack: () => void;
  onStartPaper: (paper: ExamPaper) => void;
}

export const ExamDetailScreen: React.FC<ExamDetailScreenProps> = ({
  examId,
  onBack,
  onStartPaper,
}) => {
  const exam = ExamService.getExamById(examId);
  const papers = ExamService.getPapersForExam(examId);

  const availableTiers = useMemo(() => {
    const tiers = Array.from(new Set(papers.map((p) => p.tier || 'Tier 1'))).sort();
    return tiers.length > 0 ? tiers : ['Tier 1', 'Tier 2'];
  }, [papers]);

  const [selectedTier, setSelectedTier] = useState<string>(() => availableTiers[0] || 'Tier 1');
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [selectedShift, setSelectedShift] = useState<string>('All');
  const [selectedDate, setSelectedDate] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showInstructions, setShowInstructions] = useState<boolean>(false);

  React.useEffect(() => {
    if (availableTiers.length > 0 && !availableTiers.includes(selectedTier)) {
      setSelectedTier(availableTiers[0]);
    }
  }, [availableTiers, selectedTier]);

  const tierPapers = useMemo(() => {
    return papers.filter((p) => (p.tier || 'Tier 1') === selectedTier);
  }, [papers, selectedTier]);

  const availableYearsForTier = useMemo(() => {
    const yrs = Array.from(new Set(tierPapers.map((p) => p.editionYear))).sort((a, b) => b - a);
    return yrs.length > 0 ? yrs : exam?.availableYears || [];
  }, [tierPapers, exam]);

  // Adjust selectedYear if current year is not in availableYearsForTier
  React.useEffect(() => {
    if (availableYearsForTier.length > 0 && !availableYearsForTier.includes(selectedYear)) {
      setSelectedYear(availableYearsForTier[0]);
      setSelectedDate('All');
      setSelectedShift('All');
    }
  }, [availableYearsForTier, selectedYear]);

  const availableDates = useMemo(() => {
    const dates = Array.from(
      new Set(tierPapers.filter((p) => p.editionYear === selectedYear).map((p) => p.date))
    ).sort();
    return ['All', ...dates];
  }, [tierPapers, selectedYear]);

  const availableShifts = useMemo(() => {
    const shifts = Array.from(
      new Set(tierPapers.filter((p) => p.editionYear === selectedYear).map((p) => p.shift))
    ).sort();
    return ['All', ...shifts];
  }, [tierPapers, selectedYear]);

  // Filter papers
  const filteredPapers = tierPapers.filter((paper) => {
    const matchesYear = paper.editionYear === selectedYear;
    const matchesShift =
      selectedShift === 'All' || paper.shift.toLowerCase().includes(selectedShift.toLowerCase());
    const matchesDate = selectedDate === 'All' || paper.date === selectedDate;
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      query.length === 0 ||
      paper.title.toLowerCase().includes(query) ||
      (paper.paperCode && paper.paperCode.toLowerCase().includes(query)) ||
      (paper.discipline && paper.discipline.toLowerCase().includes(query));
    return matchesYear && matchesShift && matchesDate && matchesSearch;
  });

  const activePattern = useMemo(() => {
    const samplePaper = filteredPapers[0] || tierPapers[0];
    if (samplePaper) {
      return {
        durationMinutes: samplePaper.durationMinutes,
        totalQuestions: samplePaper.totalQuestions,
        totalMarks: samplePaper.totalMarks,
        marksPerCorrect: samplePaper.markingScheme.marksPerCorrect,
        negativeMarks: samplePaper.markingScheme.negativeMarks,
        paperType: samplePaper.paperType || 'CBE_OBJECTIVE',
        sections: samplePaper.sections.map((s) => s.name),
      };
    }
    return {
      durationMinutes: exam?.defaultPattern.durationMinutes || 60,
      totalQuestions: exam?.defaultPattern.totalQuestions || 100,
      totalMarks: exam?.defaultPattern.totalMarks || 200,
      marksPerCorrect: exam?.defaultPattern.markingScheme.marksPerCorrect || 2.0,
      negativeMarks: exam?.defaultPattern.markingScheme.negativeMarks || 0.5,
      paperType: 'CBE_OBJECTIVE' as const,
      sections: exam?.defaultPattern.sections || [],
    };
  }, [filteredPapers, tierPapers, exam]);

  if (!exam) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-surface-muted">Exam details not found.</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold"
        >
          Return to Explore
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 space-y-8 animate-in fade-in duration-200">
      {/* ── Breadcrumb & Back Nav ────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-surface-muted dark:text-darkSurface-muted">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 hover:text-brand-primary transition-colors font-semibold"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Explore Exams</span>
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-surface-text dark:text-darkSurface-text font-bold">
          {exam.name}
        </span>
      </div>

      {/* ── Exam Header Card ─────────────────────────────────────────── */}
      <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                {exam.category}
              </span>
              <span className="text-xs font-semibold text-surface-muted dark:text-darkSurface-muted">
                {exam.organization}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-surface-text dark:text-darkSurface-text">
              {exam.fullName} ({exam.name})
            </h1>
            <p className="text-xs sm:text-sm text-surface-muted dark:text-darkSurface-muted max-w-3xl leading-relaxed">
              {exam.description}
            </p>
          </div>

          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev1 dark:bg-darkSurface-elev2 text-xs font-bold text-surface-text dark:text-darkSurface-text hover:bg-surface-elev2 transition-colors self-start md:self-center"
          >
            <HelpCircle className="w-4 h-4 text-brand-primary" />
            <span>Exam Pattern & Instructions</span>
          </button>
        </div>

        {/* Exam Pattern Specs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-surface-elev1/50 dark:bg-darkSurface-elev2/50 border border-surface-border/50 dark:border-darkSurface-border/50 text-xs">
          <div>
            <span className="text-surface-muted block text-[11px] font-medium">Duration</span>
            <span className="font-bold text-surface-text dark:text-darkSurface-text text-sm">
              {activePattern.durationMinutes} Minutes
            </span>
          </div>
          <div>
            <span className="text-surface-muted block text-[11px] font-medium">
              {activePattern.paperType === 'DESCRIPTIVE' ? 'Format' : 'Total Questions'}
            </span>
            <span className="font-bold text-surface-text dark:text-darkSurface-text text-sm">
              {activePattern.paperType === 'DESCRIPTIVE'
                ? `${activePattern.totalQuestions} Descriptive Qs`
                : `${activePattern.totalQuestions} MCQs`}
            </span>
          </div>
          <div>
            <span className="text-surface-muted block text-[11px] font-medium">Total Marks</span>
            <span className="font-bold text-surface-text dark:text-darkSurface-text text-sm">
              {activePattern.totalMarks} Marks
            </span>
          </div>
          <div>
            <span className="text-surface-muted block text-[11px] font-medium">
              {activePattern.paperType === 'DESCRIPTIVE' ? 'Evaluation' : 'Marking Scheme'}
            </span>
            <span className="font-bold text-surface-text dark:text-darkSurface-text text-sm">
              {activePattern.paperType === 'DESCRIPTIVE'
                ? 'Rubric-Based (50m each)'
                : `+${activePattern.marksPerCorrect} / -${activePattern.negativeMarks} Marks`}
            </span>
          </div>
        </div>

        {/* Instructions Collapsible Box */}
        {showInstructions && (
          <div className="p-5 rounded-2xl bg-brand-primary/5 border border-brand-primary/20 space-y-3 text-xs animate-in fade-in duration-200">
            <h4 className="font-bold text-brand-primary flex items-center gap-1.5 text-sm">
              <FileCheck2 className="w-4 h-4" />
              {selectedTier} Examination Rules & Instructions
            </h4>
            <ul className="space-y-1.5 text-surface-text dark:text-darkSurface-text list-disc list-inside">
              {activePattern.paperType === 'DESCRIPTIVE' ? (
                <>
                  <li>Descriptive pen & paper mode evaluation comprising Essay Writing (50 marks) and Letter/Application Writing (50 marks).</li>
                  <li>Strict adherence to word limits is evaluated: Essay (200-250 words) and Letter (150-200 words).</li>
                  <li>Marking rubrics focus on Relevance (15m), Structure & Coherence (15m), Language & Grammar (10m), and Format Adherence (10m).</li>
                  <li>Official SSC reference model solutions are provided upon submission for comparative self-evaluation.</li>
                </>
              ) : selectedTier === 'Tier 2' ? (
                <>
                  <li>Tier 2 Computer Based Examination carries <strong>3.0 marks</strong> per correct answer, with <strong>1.0 mark</strong> deducted for each wrong answer.</li>
                  <li>Session I includes 5 modules: Mathematical Abilities (30Q), Reasoning (30Q), English Language (40Q), General Awareness (20Q), and Computer Knowledge (15Q).</li>
                  <li>Computer Knowledge Module is qualifying in nature, while Merit is evaluated across Sections I & II.</li>
                  <li>Visual diagrams and math formulas are high-resolution with click-to-zoom support.</li>
                </>
              ) : (
                <>
                  <li>Each question carries <strong>2.0 marks</strong>. For each wrong answer, <strong>0.5 marks</strong> will be deducted.</li>
                  <li>There is no negative marking for unattempted questions.</li>
                  <li>Questions can be navigated freely between all 4 sections at any time during the 60 minutes.</li>
                  <li>When the timer reaches 00:00, the test will automatically be saved and submitted.</li>
                </>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* ── Sponsored Learning Space (Pattern & Preparation Resources) ─ */}
      <AdSlot placement="exam_detail_preview" format="rectangle" />

      {/* ── Previous-Year Papers Section ──────────────────────────────── */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold font-display text-surface-text dark:text-darkSurface-text">
              Previous-Year Papers ({tierPapers.length})
            </h2>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
              Select an exam tier and shift-wise question paper to start a simulation.
            </p>
          </div>

          {/* Tier Selection Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border">
            {availableTiers.map((tier) => {
              const isSelected = selectedTier === tier;
              const count = papers.filter((p) => (p.tier || 'Tier 1') === tier).length;
              return (
                <button
                  key={tier}
                  onClick={() => {
                    setSelectedTier(tier);
                    setSelectedShift('All');
                    setSelectedDate('All');
                  }}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-brand-primary text-white shadow-sm'
                      : 'text-surface-muted hover:text-surface-text dark:hover:text-darkSurface-text'
                  }`}
                >
                  <span>{tier}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filters: Year, Date & Shift & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border rounded-xl p-1 text-xs">
              <span className="text-surface-muted px-2 font-bold">Year:</span>
              {availableYearsForTier.map((yr) => (
                <button
                  key={yr}
                  onClick={() => {
                    setSelectedYear(yr);
                    setSelectedDate('All');
                    setSelectedShift('All');
                  }}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    selectedYear === yr
                      ? 'bg-brand-primary text-white shadow-sm'
                      : 'text-surface-muted hover:text-surface-text'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>

            {availableDates.length > 2 && (
              <div className="flex items-center gap-1 bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border rounded-xl p-1 text-xs">
                <span className="text-surface-muted px-2 font-bold">Date:</span>
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  aria-label="Filter papers by exam date"
                  className="bg-transparent text-surface-text dark:text-darkSurface-text font-bold px-2 py-1 rounded-lg focus:outline-none cursor-pointer"
                >
                  {availableDates.map((d) => (
                    <option key={d} value={d} className="dark:bg-darkSurface-elev1">
                      {d === 'All' ? 'All Dates' : d}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {availableShifts.length > 2 && (
              <div className="flex items-center gap-1 bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border rounded-xl p-1 text-xs">
                <span className="text-surface-muted px-2 font-bold">Shift:</span>
                {availableShifts.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedShift(s)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                      selectedShift === s
                        ? 'bg-brand-primary text-white shadow-sm'
                        : 'text-surface-muted hover:text-surface-text'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search Discipline / Paper Code */}
          <div className="w-full sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search paper or code (e.g. CS, EE, DA)..."
              className="w-full px-3.5 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs text-surface-text dark:text-darkSurface-text placeholder-surface-muted focus:outline-none focus:ring-2 focus:ring-brand-primary shadow-xs"
            />
          </div>
        </div>

        {/* Papers Grid */}
        <div className="grid grid-cols-1 gap-4">
          {filteredPapers.map((paper) => {
            const activeSession = ExamService.getActiveSession(paper.id);
            const history = ExamService.getAttemptHistory(paper.id);
            const bestAttempt = history.length > 0
              ? history.reduce((prev, curr) =>
                  (curr.result?.totalScore || 0) > (prev.result?.totalScore || 0) ? curr : prev
                )
              : null;

            return (
              <div
                key={paper.id}
                className="rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 shadow-sm hover:shadow-md transition-all space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {paper.paperCode && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-primary text-white shadow-xs">
                          {paper.paperCode}
                        </span>
                      )}
                      {paper.paperType === 'DESCRIPTIVE' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                          Descriptive (Pen & Paper Mode)
                        </span>
                      ) : paper.tier === 'Tier 2' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                          CBE Objective (135 Questions)
                        </span>
                      ) : paper.isComplete === false ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Partial Paper ({paper.totalQuestions} Questions)
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Official Complete Paper
                        </span>
                      )}
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted dark:text-darkSurface-muted border border-surface-border dark:border-darkSurface-border">
                        {paper.tier}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted dark:text-darkSurface-muted border border-surface-border dark:border-darkSurface-border">
                        {paper.language}
                      </span>
                      {activeSession && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                          Test In-Progress ({Math.floor(activeSession.timeRemainingSeconds / 60)}m left)
                        </span>
                      )}
                    </div>

                    <h3 className="text-xl font-bold font-display text-surface-text dark:text-darkSurface-text">
                      {paper.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-surface-muted dark:text-darkSurface-muted">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-brand-primary" />
                        <span>Date: {paper.date} ({paper.shift})</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-brand-primary" />
                        <span>Duration: {paper.durationMinutes} Mins</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-brand-primary" />
                        <span>Max Marks: {paper.totalMarks} ({paper.totalQuestions} Questions)</span>
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 shrink-0">
                    {bestAttempt && bestAttempt.result && (
                      <div className="text-right hidden sm:block pr-2">
                        <span className="block text-[10px] uppercase font-bold text-surface-muted">
                          Best Score
                        </span>
                        <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                          {bestAttempt.result.totalScore} / {paper.totalMarks}
                        </span>
                        <span className="text-[10px] text-surface-muted block">
                          ({bestAttempt.result.percentage}%)
                        </span>
                      </div>
                    )}

                    <button
                      onClick={() => onStartPaper(paper)}
                      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                        activeSession
                          ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20'
                          : 'bg-brand-primary hover:bg-brand-primary/90 text-white shadow-brand-primary/20'
                      }`}
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>
                        {activeSession
                          ? 'Resume Exam'
                          : paper.paperType === 'DESCRIPTIVE'
                          ? 'Start Descriptive Practice'
                          : 'Start Simulation'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Section Distribution Preview */}
                <div className="pt-3 border-t border-surface-border/50 dark:border-darkSurface-border/50">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {paper.sections.map((sec) => (
                      <div
                        key={sec.id}
                        className="px-3 py-2 rounded-xl bg-surface-elev1/40 dark:bg-darkSurface-elev2/40 border border-surface-border/40 text-xs"
                      >
                        <span className="text-[10px] text-surface-muted block font-medium">
                          {sec.name}
                        </span>
                        <span className="font-bold text-surface-text dark:text-darkSurface-text">
                          {sec.questionCount} Questions • {sec.maxMarks} Marks
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredPapers.length === 0 && (
            <div className="text-center py-12 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border space-y-2">
              <BookOpen className="w-8 h-8 mx-auto text-surface-muted/40" />
              <p className="text-sm font-semibold text-surface-text dark:text-darkSurface-text">
                No papers found for the selected shift
              </p>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                Try switching the Shift filter to "All".
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
