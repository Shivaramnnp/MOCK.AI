import React, { useState } from 'react';
import {
  Sparkles,
  Flame,
  Sun,
  Moon,
  Plus,
  User,
  Settings,
  LogOut,
  ChevronDown,
  BookOpen,
  School,
  LineChart,
  Compass,
} from 'lucide-react';
import { AppRoute, UserRole } from '../types';

interface NavbarProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  streakCount: number;
  userRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenCreateModal: () => void;
  userName?: string;
  onSignOut?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRoute,
  onNavigate,
  streakCount,
  userRole,
  onRoleChange,
  isDark,
  onToggleTheme,
  onOpenCreateModal,
  userName = 'Scholar',
  onSignOut,
}) => {
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const getInitials = (name?: string) => {
    if (!name) return 'SC';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const initials = getInitials(userName);

  const getRoleBadge = () => {
    switch (userRole) {
      case 'TEACHER':
        return { label: 'Teacher', emoji: '👨‍🏫', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' };
      case 'STUDENT':
        return { label: 'Student', emoji: '🎓', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
      default:
        return { label: 'Learner', emoji: '📖', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
    }
  };

  const badge = getRoleBadge();

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/85 dark:bg-darkSurface-elev1/90 border-b border-surface-border dark:border-darkSurface-border transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => onNavigate('home')}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-primary to-brand-variant flex items-center justify-center shadow-glow text-white font-bold text-xl">
            M
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-display font-extrabold text-xl tracking-tight bg-gradient-to-r from-brand-primary to-brand-variant bg-clip-text text-transparent">
                MOCK.AI
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                PRO
              </span>
            </div>
            <p className="text-[10px] text-surface-muted dark:text-darkSurface-muted hidden sm:block">
              AI Exam Engine
            </p>
          </div>
        </div>

        {/* Desktop Primary Navigation Links */}
        <nav className="hidden md:flex items-center gap-1">
          <button
            onClick={() => onNavigate('home')}
            className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all ${
              currentRoute === 'home'
                ? 'bg-brand-primary/10 text-brand-primary shadow-sm'
                : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text hover:bg-surface-elev2/60 dark:hover:bg-darkSurface-elev2/60'
            }`}
          >
            Home
          </button>

          <button
            onClick={() => onNavigate('explore')}
            className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all ${
              currentRoute === 'explore' || currentRoute === 'explore_exam' || currentRoute === 'exam_results'
                ? 'bg-brand-primary/10 text-brand-primary shadow-sm'
                : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text hover:bg-surface-elev2/60 dark:hover:bg-darkSurface-elev2/60'
            }`}
          >
            Explore
          </button>

          <button
            onClick={() => onNavigate('classroom')}
            className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all ${
              currentRoute === 'classroom'
                ? 'bg-brand-primary/10 text-brand-primary shadow-sm'
                : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text hover:bg-surface-elev2/60 dark:hover:bg-darkSurface-elev2/60'
            }`}
          >
            Classroom
          </button>

          <button
            onClick={() => onNavigate('analytics')}
            className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all ${
              currentRoute === 'analytics'
                ? 'bg-brand-primary/10 text-brand-primary shadow-sm'
                : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text hover:bg-surface-elev2/60 dark:hover:bg-darkSurface-elev2/60'
            }`}
          >
            Analytics
          </button>
        </nav>

        {/* Right Side Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Create Test CTA Button */}
          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-xs sm:text-sm font-bold shadow-md hover:brightness-110 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Create Test</span>
          </button>

          {/* Study Streak Badge */}
          <div
            title="Active Study Streak"
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 font-bold text-xs select-none"
          >
            <Flame className="w-4 h-4 fill-amber-500 text-amber-500" />
            <span>{streakCount}d</span>
          </div>

          {/* Role Switcher */}
          <div className="relative">
            <button
              onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-semibold select-none transition-all ${badge.color}`}
            >
              <span>{badge.emoji}</span>
              <span className="hidden sm:inline">{badge.label}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {roleDropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-48 rounded-2xl bg-white dark:bg-darkSurface-elev2 shadow-xl border border-surface-border dark:border-darkSurface-border py-2 z-50 animate-in fade-in zoom-in-95 duration-150"
                onClick={() => setRoleDropdownOpen(false)}
              >
                <div className="px-3.5 py-1 text-[10px] font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider">
                  Active Mode
                </div>
                <button
                  onClick={() => onRoleChange('LEARNER')}
                  className={`w-full px-3.5 py-2 text-left text-xs flex items-center gap-2.5 hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev3 transition-colors ${
                    userRole === 'LEARNER' ? 'font-bold text-brand-primary' : ''
                  }`}
                >
                  <span>📖</span>
                  <div>
                    <p className="font-semibold text-xs leading-none">Learner</p>
                    <span className="text-[10px] text-surface-muted">Self-paced practice</span>
                  </div>
                </button>
                <button
                  onClick={() => onRoleChange('STUDENT')}
                  className={`w-full px-3.5 py-2 text-left text-xs flex items-center gap-2.5 hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev3 transition-colors ${
                    userRole === 'STUDENT' ? 'font-bold text-brand-primary' : ''
                  }`}
                >
                  <span>🎓</span>
                  <div>
                    <p className="font-semibold text-xs leading-none">Student</p>
                    <span className="text-[10px] text-surface-muted">Class assignments</span>
                  </div>
                </button>
                <button
                  onClick={() => onRoleChange('TEACHER')}
                  className={`w-full px-3.5 py-2 text-left text-xs flex items-center gap-2.5 hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev3 transition-colors ${
                    userRole === 'TEACHER' ? 'font-bold text-brand-primary' : ''
                  }`}
                >
                  <span>👨‍🏫</span>
                  <div>
                    <p className="font-semibold text-xs leading-none">Teacher</p>
                    <span className="text-[10px] text-surface-muted">Create & grade exams</span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Theme Toggle */}
          <button
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-xl text-surface-muted dark:text-darkSurface-muted hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>

          {/* User Profile Avatar Dropdown */}
          <div className="relative">
            <button
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="p-1 rounded-full border border-surface-border dark:border-darkSurface-border hover:border-brand-primary transition-all active:scale-95"
              aria-label="User menu"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-brand-primary to-brand-variant flex items-center justify-center text-white text-xs font-bold shadow-sm">
                {initials}
              </div>
            </button>

            {profileDropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-52 rounded-2xl bg-white dark:bg-darkSurface-elev2 shadow-xl border border-surface-border dark:border-darkSurface-border py-2 z-50 animate-in fade-in zoom-in-95 duration-150"
                onClick={() => setProfileDropdownOpen(false)}
              >
                <div className="px-4 py-2 border-b border-surface-border dark:border-darkSurface-border">
                  <p className="font-bold text-xs text-surface-text dark:text-darkSurface-text truncate">
                    {userName}
                  </p>
                  <p className="text-[11px] text-surface-muted truncate">{userRole} Account</p>
                </div>

                <button
                  onClick={() => onNavigate('profile')}
                  className="w-full px-4 py-2 text-left text-xs font-medium flex items-center gap-2.5 hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev3 transition-colors"
                >
                  <User className="w-4 h-4 text-brand-primary" />
                  <span>Profile Overview</span>
                </button>

                <button
                  onClick={() => onNavigate('settings')}
                  className="w-full px-4 py-2 text-left text-xs font-medium flex items-center gap-2.5 hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev3 transition-colors"
                >
                  <Settings className="w-4 h-4 text-brand-variant" />
                  <span>Settings & Preferences</span>
                </button>

                {onSignOut && (
                  <div className="pt-1 mt-1 border-t border-surface-border dark:border-darkSurface-border">
                    <button
                      onClick={onSignOut}
                      className="w-full px-4 py-2 text-left text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-2.5 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
