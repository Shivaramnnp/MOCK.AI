import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Sun,
  Moon,
  Clock,
  Key,
  Database,
  Download,
  RotateCcw,
  Check,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { AppSettings, storage } from '../services/storage';
import { TestHistory } from '../types';

interface SettingsScreenProps {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  tests: TestHistory[];
  onBack: () => void;
  onResetData: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  onUpdateSettings,
  tests,
  onBack,
  onResetData,
}) => {
  const [geminiKey, setGeminiKey] = useState(settings.geminiApiKey);
  const [groqKey, setGroqKey] = useState(settings.groqApiKey);
  const [timerSeconds, setTimerSeconds] = useState(settings.timerSeconds);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveApiKeys = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      ...settings,
      geminiApiKey: geminiKey.trim(),
      groqApiKey: groqKey.trim(),
      timerSeconds,
    };
    onUpdateSettings(updated);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleExportData = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(tests, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `mock_ai_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-surface-border dark:border-darkSurface-border">
        <button
          onClick={onBack}
          className="p-2 rounded-xl text-surface-muted hover:text-surface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold font-display text-surface-text dark:text-darkSurface-text">
            Settings & Preferences
          </h1>
          <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
            Configure theme, AI providers, timer durations, and backups
          </p>
        </div>
      </div>

      {/* Appearance */}
      <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-base text-surface-text dark:text-darkSurface-text">
          Theme & Display
        </h3>

        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <button
            onClick={() => onUpdateSettings({ ...settings, theme: 'light' })}
            className={`flex items-center justify-center gap-2 p-3.5 rounded-2xl border transition-all ${
              settings.theme === 'light'
                ? 'bg-brand-primary/10 border-brand-primary text-brand-primary font-bold shadow-sm'
                : 'bg-surface-elev2 dark:bg-darkSurface-elev2 border-surface-border dark:border-darkSurface-border text-surface-muted'
            }`}
          >
            <Sun className="w-4 h-4 text-amber-500" />
            <span className="text-xs sm:text-sm">Light Theme</span>
          </button>

          <button
            onClick={() => onUpdateSettings({ ...settings, theme: 'dark' })}
            className={`flex items-center justify-center gap-2 p-3.5 rounded-2xl border transition-all ${
              settings.theme === 'dark'
                ? 'bg-brand-primary/10 border-brand-primary text-brand-primary font-bold shadow-sm'
                : 'bg-surface-elev2 dark:bg-darkSurface-elev2 border-surface-border dark:border-darkSurface-border text-surface-muted'
            }`}
          >
            <Moon className="w-4 h-4 text-brand-variant" />
            <span className="text-xs sm:text-sm">Dark Theme (Focused)</span>
          </button>
        </div>
      </div>

      {/* AI Provider Configuration */}
      <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 shadow-sm space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-primary" />
            <h3 className="font-bold text-base text-surface-text dark:text-darkSurface-text">
              AI Models & API Keys
            </h3>
          </div>
          <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-0.5">
            Configure your Gemini or Groq model keys for AI mock generation.
          </p>
          {(typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold mt-2">
              <span>●</span>
              <span>Project Environment Key Connected (VITE_GEMINI_API_KEY)</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSaveApiKeys} className="space-y-4 pt-1">
          <div>
            <label className="block text-xs font-bold text-surface-muted uppercase tracking-wider mb-1">
              Google Gemini API Key:
            </label>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs font-mono text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-surface-muted uppercase tracking-wider mb-1">
              Groq API Key (Backup):
            </label>
            <input
              type="password"
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
              placeholder="gsk_..."
              className="w-full px-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs font-mono text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            {savedSuccess ? (
              <span className="text-xs font-bold text-brand-green flex items-center gap-1">
                <Check className="w-4 h-4" />
                <span>API Keys Saved & Activated!</span>
              </span>
            ) : (
              <span className="text-xs text-surface-muted">
                Stored securely in your local browser storage.
              </span>
            )}

            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-brand-primary text-white font-bold text-xs shadow-md hover:brightness-110 active:scale-95 transition-all"
            >
              Save Keys
            </button>
          </div>
        </form>
      </div>

      {/* Exam Preferences */}
      <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-base text-surface-text dark:text-darkSurface-text">
          Exam Preferences
        </h3>

        <div>
          <label className="block text-xs font-bold text-surface-muted uppercase tracking-wider mb-1.5">
            Default Question Timer:
          </label>
          <select
            value={timerSeconds}
            onChange={(e) => {
              const val = Number(e.target.value);
              setTimerSeconds(val);
              onUpdateSettings({ ...settings, timerSeconds: val });
            }}
            className="w-full sm:w-64 px-3 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
          >
            <option value={30}>30 Seconds (Speed Sprint)</option>
            <option value={60}>60 Seconds (Standard MCQ)</option>
            <option value={120}>2 Minutes (Calculations)</option>
            <option value={300}>5 Minutes</option>
            <option value={0}>Untimed (Relaxed practice)</option>
          </select>
        </div>
      </div>

      {/* Data Backup & Reset */}
      <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-base text-surface-text dark:text-darkSurface-text">
          Data Management
        </h3>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportData}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-xs font-bold hover:bg-surface-elev3 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export Tests (JSON Backup)</span>
          </button>

          <button
            onClick={() => {
              if (confirm('Reset your exam library, streak, and classroom rosters? Your login session will remain preserved.')) {
                onResetData();
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 text-brand-red text-xs font-bold hover:bg-red-500/10 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset Tests & Progress</span>
          </button>
        </div>
      </div>
    </div>
  );
};
