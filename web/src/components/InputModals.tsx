import React, { useState } from 'react';
import {
  GraduationCap,
  Globe,
  Youtube,
  Code2,
  X,
  Sparkles,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';

// --- TOPIC MODAL ---
interface TopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (topic: string, difficulty: string, count: number) => void;
}

export const TopicModal: React.FC<TopicModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('MEDIUM');
  const [count, setCount] = useState(8);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    onSubmit(topic.trim(), difficulty, count);
    onClose();
  };

  const presetTopics = [
    'Thermodynamics & Heat Engines',
    'Organic Chemistry: Aldehydes',
    'Calculus: Integration by Parts',
    'Operating Systems: Deadlocks',
    'Indian Constitution & Fundamental Rights',
    'Cellular Respiration & Genetics',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-darkSurface-elev1 rounded-3xl border border-surface-border dark:border-darkSurface-border shadow-2xl p-6">
        <div className="flex items-center justify-between pb-3 border-b border-surface-border dark:border-darkSurface-border">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <GraduationCap className="w-5 h-5" />
            </span>
            <h3 className="font-bold text-lg text-surface-text dark:text-darkSurface-text">
              Generate from Topic
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-surface-muted hover:text-surface-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1.5">
              Topic or Subject:
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. Quantum Mechanics, World War 2, NEET Biology..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-sm focus:outline-none focus:border-brand-primary"
            />
          </div>

          {/* Quick Presets */}
          <div>
            <span className="text-[11px] font-semibold text-surface-muted dark:text-darkSurface-muted">
              Popular suggestions:
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {presetTopics.map((pt) => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => setTopic(pt)}
                  className="text-xs px-2.5 py-1 rounded-full border border-surface-border dark:border-darkSurface-border bg-surface-elev1 dark:bg-darkSurface-elev2 hover:border-brand-primary text-surface-muted dark:text-darkSurface-muted hover:text-brand-primary transition-all"
                >
                  {pt}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty & Count */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1.5">
                Difficulty Level:
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary font-medium"
              >
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium (Standard)</option>
                <option value="HARD">Hard</option>
                <option value="COMPETITIVE">Competitive / Olympiad</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1.5">
                Questions Count:
              </label>
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary font-medium"
              >
                <option value={5}>5 Questions</option>
                <option value={8}>8 Questions</option>
                <option value={10}>10 Questions</option>
                <option value={15}>15 Questions</option>
                <option value={20}>20 Questions</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-surface-muted hover:text-surface-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!topic.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-sm font-bold shadow-md hover:brightness-110 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>Generate Mock Test</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- WEB URL MODAL ---
interface UrlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (url: string) => void;
}

export const UrlModal: React.FC<UrlModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [url, setUrl] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onSubmit(url.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-darkSurface-elev1 rounded-3xl border border-surface-border dark:border-darkSurface-border shadow-2xl p-6">
        <div className="flex items-center justify-between pb-3 border-b border-surface-border dark:border-darkSurface-border">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
              <Globe className="w-5 h-5" />
            </span>
            <h3 className="font-bold text-lg text-surface-text dark:text-darkSurface-text">
              Scrape Webpage URL
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-surface-muted hover:text-surface-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1.5">
              Enter Article or Webpage URL:
            </label>
            <input
              type="url"
              required
              autoFocus
              placeholder="https://en.wikipedia.org/wiki/Special_relativity"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-sm focus:outline-none focus:border-brand-primary"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-surface-muted hover:text-surface-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!url.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-sm font-bold shadow-md hover:brightness-110 disabled:opacity-50"
            >
              <ArrowRight className="w-4 h-4" />
              <span>Process Webpage</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- YOUTUBE MODAL ---
interface YouTubeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (url: string) => void;
}

export const YouTubeModal: React.FC<YouTubeModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [url, setUrl] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onSubmit(url.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-darkSurface-elev1 rounded-3xl border border-surface-border dark:border-darkSurface-border shadow-2xl p-6">
        <div className="flex items-center justify-between pb-3 border-b border-surface-border dark:border-darkSurface-border">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-red-600/10 text-red-600">
              <Youtube className="w-5 h-5" />
            </span>
            <h3 className="font-bold text-lg text-surface-text dark:text-darkSurface-text">
              YouTube Video Transcript
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-surface-muted hover:text-surface-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1.5">
              YouTube Video URL:
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-sm focus:outline-none focus:border-brand-primary"
            />
            <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted mt-1.5">
              Supports standard YouTube videos and shorts. AI will extract core concepts and ignore speaker filler phrases.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-surface-muted hover:text-surface-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!url.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-brand-variant text-white text-sm font-bold shadow-md hover:brightness-110 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>Extract Transcript</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- JSON MODAL ---
interface JsonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (jsonText: string) => void;
}

export const JsonModal: React.FC<JsonModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const sampleJson = JSON.stringify(
    {
      title: 'Sample Test',
      questions: [
        {
          questionText: 'What is the SI unit of electric resistance?',
          options: ['Ohm (Ω)', 'Volt', 'Ampere', 'Coulomb'],
          correctAnswerIndex: 0,
          topic: 'Current Electricity',
          explanation: 'Ohm is defined as 1 volt per ampere.',
        },
      ],
    },
    null,
    2
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jsonText.trim()) return;
    try {
      JSON.parse(jsonText);
      setError(null);
      onSubmit(jsonText);
      onClose();
    } catch {
      setError('Invalid JSON syntax. Please check for missing brackets or quotes.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white dark:bg-darkSurface-elev1 rounded-3xl border border-surface-border dark:border-darkSurface-border shadow-2xl p-6">
        <div className="flex items-center justify-between pb-3 border-b border-surface-border dark:border-darkSurface-border">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-teal-500/10 text-teal-500">
              <Code2 className="w-5 h-5" />
            </span>
            <h3 className="font-bold text-lg text-surface-text dark:text-darkSurface-text">
              Paste Test JSON
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-surface-muted hover:text-surface-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider">
              JSON Data Structure:
            </label>
            <button
              type="button"
              onClick={() => setJsonText(sampleJson)}
              className="text-xs text-brand-primary hover:underline font-medium"
            >
              Insert Sample Template
            </button>
          </div>

          <textarea
            required
            rows={8}
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setError(null);
            }}
            placeholder='{ "questions": [ { "questionText": "...", "options": [...], "correctAnswerIndex": 0 } ] }'
            className="w-full p-3 font-mono text-xs rounded-2xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary resize-none"
          />

          {error && <p className="text-xs text-brand-red font-medium">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-surface-muted hover:text-surface-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!jsonText.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-sm font-bold shadow-md hover:brightness-110 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>Import Questions</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
