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
  Check,
} from 'lucide-react';
import { UserProfile, UserRole, TestHistory } from '../types';

interface ProfileScreenProps {
  profile: UserProfile;
  tests: TestHistory[];
  streakCount: number;
  onRoleChange?: (role: UserRole) => void;
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

      {/* ── Permanent Account Role Card ───────────────────────────────── */}
      <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 sm:p-8 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-surface-text dark:text-darkSurface-text flex items-center gap-2">
              <span>Account Role</span>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Verified
              </span>
            </h3>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
              Your role was selected during account registration and is permanently configured.
            </p>
          </div>
        </div>

        {(() => {
          const currentRoleObj = roles.find((r) => r.role === profile.role) || roles[0];
          return (
            <div className="p-4 sm:p-5 rounded-2xl bg-brand-primary/10 border border-brand-primary/30 shadow-sm flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <span className="text-3xl sm:text-4xl shrink-0">{currentRoleObj.emoji}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm sm:text-base text-surface-text dark:text-darkSurface-text">
                      {currentRoleObj.title}
                    </h4>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-brand-primary text-white">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-1 leading-relaxed">
                    {currentRoleObj.desc}
                  </p>
                </div>
              </div>

              <div className="w-6 h-6 rounded-full bg-brand-primary text-white flex items-center justify-center shrink-0 shadow-sm">
                <Check className="w-3.5 h-3.5" />
              </div>
            </div>
          );
        })()}

        <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted/70 italic">
          Need to transition to an institutional or teacher account? Contact support at <span className="font-semibold text-brand-primary not-italic">themockai.official@gmail.com</span>.
        </p>
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
