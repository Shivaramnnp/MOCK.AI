import React, { useState } from 'react';
import {
  Compass,
  Search,
  Star,
  Play,
  Filter,
  BookOpen,
  User,
  Sparkles,
  Plus,
  Share2,
} from 'lucide-react';
import { PublishedExam, TestHistory, UserProfile } from '../types';

interface MarketplaceScreenProps {
  exams: PublishedExam[];
  onTakeExam: (exam: PublishedExam) => void;
  myTests?: TestHistory[];
  profile?: UserProfile;
  onPublishExam?: (exam: PublishedExam) => void;
}

export const MarketplaceScreen: React.FC<MarketplaceScreenProps> = ({
  exams,
  onTakeExam,
  myTests = [],
  profile,
  onPublishExam,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [showPublishModal, setShowPublishModal] = useState(false);

  // Publish form state
  const [selectedTestId, setSelectedTestId] = useState('');
  const [publishSubject, setPublishSubject] = useState('Physics');
  const [publishDescription, setPublishDescription] = useState('');

  const subjects = ['All', 'Physics', 'Computer Science', 'History', 'Mathematics', 'Biology'];

  const filteredExams = exams.filter((e) => {
    const matchesSubject =
      selectedSubject === 'All' || e.subject.toLowerCase() === selectedSubject.toLowerCase();
    const matchesSearch =
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.creatorName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSubject && matchesSearch;
  });

  const handlePublishSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const test = myTests.find((t) => t.id === selectedTestId);
    if (!test || !onPublishExam) return;

    const newExam: PublishedExam = {
      id: `pub-${Date.now()}`,
      title: test.title,
      subject: publishSubject,
      description:
        publishDescription.trim() || `Comprehensive mock exam for ${publishSubject} with full step-by-step solutions.`,
      creatorId: profile?.uid || 'community-scholar',
      creatorName: profile?.fullName || 'Community Scholar',
      price: 0,
      rating: 5.0,
      totalSales: 1,
      questions: test.questions,
      publishedAt: Date.now(),
    };

    onPublishExam(newExam);
    setShowPublishModal(false);
    setSelectedTestId('');
    setPublishDescription('');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-8 animate-in fade-in duration-300">
      {/* ── Marketplace Hero Banner ───────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-primary via-indigo-600 to-brand-variant p-8 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="max-w-xl">
            <span className="inline-block text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-white/20 backdrop-blur-md mb-3">
              Community Exam Library
            </span>
            <h1 className="text-2xl sm:text-4xl font-display font-black leading-tight">
              Explore & Practice Public Exams
            </h1>
            <p className="text-sm text-white/80 mt-2">
              Practice expertly verified mock tests created by top educators, subject matter mentors, and fellow scholars.
            </p>
          </div>

          {onPublishExam && myTests.length > 0 && (
            <button
              onClick={() => setShowPublishModal(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-brand-primary hover:bg-white/95 font-bold text-xs sm:text-sm shadow-lg active:scale-95 transition-all self-start sm:self-auto shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Publish My Test</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Search & Filter Controls ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-surface-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search exams, subjects, creators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-2xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary shadow-sm"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {subjects.map((sub) => (
            <button
              key={sub}
              onClick={() => setSelectedSubject(sub)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all ${
                selectedSubject === sub
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border text-surface-muted hover:text-surface-text'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      </div>

      {/* ── Exam Cards Grid ─────────────────────────────────────────── */}
      {filteredExams.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-3xl border border-dashed border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1">
          <Compass className="w-12 h-12 text-surface-muted mx-auto mb-3 opacity-50" />
          <h3 className="font-bold text-base text-surface-text dark:text-darkSurface-text">
            No public exams match your search
          </h3>
          <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-1">
            Try choosing another subject category or publish your own exam for other students.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredExams.map((exam) => (
            <div
              key={exam.id}
              className="group rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border hover:border-brand-primary/50 shadow-sm hover:shadow-card p-6 flex flex-col justify-between transition-all"
            >
              <div>
                {/* Top Row */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-brand-primary/10 text-brand-primary">
                    {exam.subject}
                  </span>
                  <div className="flex items-center gap-1 text-xs font-bold text-amber-500">
                    <Star className="w-3.5 h-3.5 fill-amber-500" />
                    <span>{exam.rating.toFixed(1)}</span>
                    <span className="text-surface-muted font-normal">({exam.totalSales})</span>
                  </div>
                </div>

                {/* Title & Description */}
                <h3 className="font-bold text-lg text-surface-text dark:text-darkSurface-text group-hover:text-brand-primary transition-colors line-clamp-2">
                  {exam.title}
                </h3>
                <p className="text-xs text-surface-muted dark:text-darkSurface-muted line-clamp-3 mt-2 leading-relaxed">
                  {exam.description}
                </p>

                {/* Author & Question Count */}
                <div className="flex items-center justify-between text-xs text-surface-muted dark:text-darkSurface-muted mt-4 pt-3 border-t border-surface-border dark:border-darkSurface-border">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-brand-primary" />
                    <span className="font-medium">{exam.creatorName}</span>
                  </div>
                  <div className="flex items-center gap-1 font-medium">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>{exam.questions.length} Questions</span>
                  </div>
                </div>
              </div>

              {/* Bottom CTA */}
              <div className="mt-5 pt-3 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-green bg-emerald-500/10 px-2.5 py-1 rounded-md">
                  FREE ACCESS
                </span>

                <button
                  onClick={() => onTakeExam(exam)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Start Mock Exam</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Publish Exam Modal ────────────────────────────────────────── */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-darkSurface-elev1 rounded-3xl border border-surface-border dark:border-darkSurface-border p-6 shadow-2xl">
            <h3 className="font-bold text-xl text-surface-text dark:text-darkSurface-text mb-1">
              Publish Exam to Community
            </h3>
            <p className="text-xs text-surface-muted mb-4">
              Share your custom mock test with students and learners worldwide.
            </p>

            <form onSubmit={handlePublishSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-surface-muted uppercase tracking-wider mb-1">
                  Choose Test from Your Library:
                </label>
                <select
                  required
                  value={selectedTestId}
                  onChange={(e) => {
                    setSelectedTestId(e.target.value);
                    const found = myTests.find((t) => t.id === e.target.value);
                    if (found && found.category) setPublishSubject(found.category);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
                >
                  <option value="">-- Select an exam --</option>
                  {myTests.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.questions.length} Questions)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-surface-muted uppercase tracking-wider mb-1">
                  Subject Category:
                </label>
                <select
                  value={publishSubject}
                  onChange={(e) => setPublishSubject(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
                >
                  <option value="Physics">Physics</option>
                  <option value="Computer Science">Computer Science</option>
                  <option value="History">History</option>
                  <option value="Mathematics">Mathematics</option>
                  <option value="Biology">Biology</option>
                  <option value="General">General</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-surface-muted uppercase tracking-wider mb-1">
                  Exam Summary / Syllabus Description:
                </label>
                <textarea
                  rows={3}
                  value={publishDescription}
                  onChange={(e) => setPublishDescription(e.target.value)}
                  placeholder="Key concepts covered, difficulty level, or recommended preparation..."
                  className="w-full px-3.5 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPublishModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-surface-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedTestId}
                  className="px-5 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold shadow-md hover:brightness-110 disabled:opacity-50"
                >
                  Publish Publicly
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
