import React, { useState } from 'react';
import {
  Search,
  BookOpen,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
  Award,
  Filter,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { CompetitiveExam } from '../types';
import { ExamService } from '../services/examService';
import { AdSlot } from '../components/ads/AdSlot';

interface ExploreScreenProps {
  onSelectExam: (examId: string) => void;
}

export const ExploreScreen: React.FC<ExploreScreenProps> = ({ onSelectExam }) => {
  const exams = ExamService.getAvailableExams();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = [
    'All',
    'SSC / Government',
    'Engineering',
    'Civil Services',
    'Banking',
    'Railways',
    'State Entrance',
  ];

  const filteredExams = exams.filter((exam) => {
    const matchesSearch =
      exam.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exam.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exam.organization.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === 'All' || exam.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 space-y-8 animate-in fade-in duration-200">
      {/* ── Top Header Banner ────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-primary/10 via-brand-purple/5 to-transparent dark:from-brand-primary/20 dark:via-brand-purple/10 border border-brand-primary/20 p-6 sm:p-10">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-xs font-bold tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            Official Previous Year Papers (PYP) & Simulation
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold font-display text-surface-text dark:text-darkSurface-text tracking-tight">
            Competitive Examinations Hub
          </h1>
          <p className="text-sm sm:text-base text-surface-muted dark:text-darkSurface-muted leading-relaxed">
            Practice authentic previous-year question papers under real exam timing and negative marking constraints. Detailed mathematical derivations and verified answer keys included.
          </p>
        </div>
      </div>

      {/* ── Search & Filter Controls ──────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-muted dark:text-darkSurface-muted" />
            <input
              type="text"
              placeholder="Search by exam name (e.g. SSC CHSL, GATE, UPSC)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-surface-text dark:text-darkSurface-text text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary transition-all shadow-sm"
            />
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <Filter className="w-4 h-4 text-surface-muted shrink-0 mr-1 hidden sm:block" />
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all ${
                selectedCategory === cat
                  ? 'bg-brand-primary text-white shadow-sm shadow-brand-primary/30'
                  : 'bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sponsored Learning Space (Catalog Header Banner) ──────────── */}
      <AdSlot placement="explore_banner" format="leaderboard" />

      {/* ── Exam Cards Grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredExams.map((exam) => {
          const isAvailable = exam.status === 'AVAILABLE';

          return (
            <div
              key={exam.id}
              onClick={() => onSelectExam(exam.id)}
              className={`group flex flex-col justify-between rounded-2xl p-6 transition-all duration-200 border cursor-pointer ${
                isAvailable
                  ? 'bg-white dark:bg-darkSurface-elev1 border-brand-primary/30 hover:border-brand-primary shadow-sm hover:shadow-md hover:-translate-y-0.5'
                  : 'bg-surface-elev1/50 dark:bg-darkSurface-elev1/40 border-surface-border dark:border-darkSurface-border hover:border-surface-muted/30'
              }`}
            >
              <div className="space-y-4">
                {/* Header Badge */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted">
                    {exam.category}
                  </span>

                  {isAvailable ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-500/20">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Available ({exam.paperCount} {exam.paperCount === 1 ? 'Paper' : 'Papers'})
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted dark:text-darkSurface-muted text-xs font-medium border border-surface-border dark:border-darkSurface-border">
                      Coming Soon
                    </span>
                  )}
                </div>

                {/* Exam Title & Organization */}
                <div>
                  <h3 className="text-xl font-bold font-display text-surface-text dark:text-darkSurface-text group-hover:text-brand-primary transition-colors">
                    {exam.name}
                  </h3>
                  <p className="text-xs font-medium text-surface-muted dark:text-darkSurface-muted mt-0.5">
                    {exam.organization}
                  </p>
                </div>

                <p className="text-xs text-surface-muted dark:text-darkSurface-muted line-clamp-2 leading-relaxed">
                  {exam.description}
                </p>

                {/* Pattern Specs */}
                <div className="grid grid-cols-3 gap-2 py-2 border-y border-surface-border/60 dark:border-darkSurface-border/60 text-center text-xs">
                  <div>
                    <span className="text-surface-muted block text-[10px] uppercase font-bold">Questions</span>
                    <span className="font-bold text-surface-text dark:text-darkSurface-text">
                      {exam.defaultPattern.totalQuestions}
                    </span>
                  </div>
                  <div>
                    <span className="text-surface-muted block text-[10px] uppercase font-bold">Duration</span>
                    <span className="font-bold text-surface-text dark:text-darkSurface-text">
                      {exam.defaultPattern.durationMinutes}m
                    </span>
                  </div>
                  <div>
                    <span className="text-surface-muted block text-[10px] uppercase font-bold">Max Marks</span>
                    <span className="font-bold text-surface-text dark:text-darkSurface-text">
                      {exam.defaultPattern.totalMarks}
                    </span>
                  </div>
                </div>

                {/* Highlights for available exam */}
                {exam.highlights && exam.highlights.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {exam.highlights.slice(0, 2).map((hl, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{hl}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Button Footer */}
              <div className="pt-5 mt-4 border-t border-surface-border/50 dark:border-darkSurface-border/50">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectExam(exam.id);
                  }}
                  className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all ${
                    isAvailable
                      ? 'bg-brand-primary text-white shadow-sm hover:bg-brand-primary/90'
                      : 'bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted hover:text-surface-text'
                  }`}
                >
                  <span>{isAvailable ? 'View Previous-Year Papers' : 'View Pattern & Details'}</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredExams.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <BookOpen className="w-12 h-12 mx-auto text-surface-muted/40" />
          <p className="text-base font-semibold text-surface-text dark:text-darkSurface-text">
            No examinations found
          </p>
          <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
            Try adjusting your search term or category filter.
          </p>
        </div>
      )}
    </div>
  );
};
