import React from 'react';
import {
  User,
  Mail,
  GraduationCap,
  Award,
  Flame,
  Settings as SettingsIcon,
  Shield,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { UserProfile, UserRole, TestHistory } from '../types';

interface ProfileScreenProps {
  profile: UserProfile;
  tests: TestHistory[];
  streakCount: number;
  onRoleChange: (role: UserRole) => void;
  onNavigateSettings: () => void;
  onSignOut: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  profile,
  tests,
  streakCount,
  onRoleChange,
  onNavigateSettings,
  onSignOut,
}) => {
  const completedTests = tests.filter((t) => t.lastTakenAt !== null);
  const avgScore =
    completedTests.length > 0
      ? Math.round(
          completedTests.reduce((acc, t) => acc + (t.bestScorePercent || 0), 0) /
            completedTests.length
        )
      : 0;

  const roles: { role: UserRole; title: string; emoji: string; desc: string }[] = [
    {
      role: 'LEARNER',
      title: 'Independent Learner',
      emoji: '📖',
      desc: 'Create mock tests, explore public exams, study at your own pace.',
    },
    {
      role: 'STUDENT',
      title: 'School / University Student',
      emoji: '🎓',
      desc: 'Join classes with code, submit homework, view teacher test assignments.',
    },
    {
      role: 'TEACHER',
      title: 'Educator / Teacher',
      emoji: '👨‍🏫',
      desc: 'Create classes, assign exams to students, track class score analytics.',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-8 animate-in fade-in duration-300">
      {/* ── User Header Card ─────────────────────────────────────────── */}
      <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-brand-primary to-brand-variant flex items-center justify-center text-white text-3xl font-black shadow-glow shrink-0">
          {profile.fullName
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase() || 'SP'}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <h1 className="text-2xl font-bold font-display text-surface-text dark:text-darkSurface-text">
              {profile.fullName || 'Scholar'}
            </h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
              {profile.role}
            </span>
          </div>

          <p className="text-sm text-surface-muted dark:text-darkSurface-muted flex items-center justify-center sm:justify-start gap-1.5">
            <Mail className="w-4 h-4" />
            <span>{profile.email}</span>
          </p>

          <p className="text-xs text-surface-muted dark:text-darkSurface-muted pt-2">
            Member since {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
        </div>

        <button
          onClick={onNavigateSettings}
          className="p-2 rounded-2xl border border-surface-border dark:border-darkSurface-border text-surface-muted hover:text-surface-text hover:bg-surface-elev2 transition-colors self-end sm:self-auto"
        >
          <SettingsIcon className="w-5 h-5" />
        </button>
      </div>

      {/* ── Quick Stats Grid ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border text-center">
          <span className="text-xs text-surface-muted block">Tests Taken</span>
          <span className="text-xl sm:text-2xl font-black text-surface-text dark:text-darkSurface-text mt-1 block">
            {completedTests.length}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border text-center">
          <span className="text-xs text-surface-muted block">Average Score</span>
          <span className="text-xl sm:text-2xl font-black text-brand-primary mt-1 block">
            {avgScore}%
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border text-center">
          <span className="text-xs text-surface-muted block">Active Streak</span>
          <div className="flex items-center justify-center gap-1 text-xl sm:text-2xl font-black text-amber-500 mt-1">
            <Flame className="w-5 h-5 fill-amber-500" />
            <span>{streakCount}d</span>
          </div>
        </div>
      </div>

      {/* ── Role Selector Options ─────────────────────────────────────── */}
      <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-lg font-bold text-surface-text dark:text-darkSurface-text">
            Active Role & Experience
          </h3>
          <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
            Switch your profile mode to experience tailored classroom, teacher, or self-study workflows
          </p>
        </div>

        <div className="space-y-3">
          {roles.map((r) => {
            const isSelected = profile.role === r.role;

            return (
              <div
                key={r.role}
                onClick={() => onRoleChange(r.role)}
                className={`cursor-pointer p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                  isSelected
                    ? 'bg-brand-primary/10 border-brand-primary shadow-sm'
                    : 'bg-surface-elev2 dark:bg-darkSurface-elev2 border-surface-border dark:border-darkSurface-border hover:border-brand-primary/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{r.emoji}</span>
                  <div>
                    <h4 className="font-bold text-sm text-surface-text dark:text-darkSurface-text">
                      {r.title}
                    </h4>
                    <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-0.5">
                      {r.desc}
                    </p>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    isSelected
                      ? 'border-brand-primary bg-brand-primary text-white'
                      : 'border-surface-muted'
                  }`}
                >
                  {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Sign Out Button ───────────────────────────────────────────── */}
      <div className="pt-2 flex justify-center">
        <button
          onClick={onSignOut}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl border border-red-500/30 text-brand-red hover:bg-red-500/10 text-xs font-bold transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out from Account</span>
        </button>
      </div>
    </div>
  );
};
