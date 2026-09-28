import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Plus,
  Server,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Cpu,
  Sliders,
  BarChart3,
  ExternalLink,
  ShieldCheck,
  Check,
  Zap,
} from 'lucide-react';
import { AI_PROVIDER_REGISTRY } from '../../services/ai/aiProviderRegistry';
import { aiProviderService } from '../../services/ai/aiProviderService';
import {
  AIProviderConnection,
  AIProviderId,
  AIPreferences,
} from '../../types/aiProvider';
import { AddProviderModal } from './AddProviderModal';
import { AddCustomProviderModal } from './AddCustomProviderModal';
import { ManageProviderModal } from './ManageProviderModal';

type SubTab = 'providers' | 'default-model' | 'preferences' | 'usage';

export const AIProvidersManager: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('providers');

  // Connections and preferences
  const [connections, setConnections] = useState<AIProviderConnection[]>([]);
  const [preferences, setPreferences] = useState<AIPreferences>({});

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addInitialProviderId, setAddInitialProviderId] = useState<AIProviderId>('google-gemini');
  const [addCustomModalOpen, setAddCustomModalOpen] = useState(false);
  const [managedConn, setManagedConn] = useState<AIProviderConnection | null>(null);

  // Testing feedback map { [connectionId]: { testing: boolean, result?: { success: boolean, message?: string } } }
  const [testStatusMap, setTestStatusMap] = useState<
    Record<string, { testing: boolean; result?: { success: boolean; message?: string } }>
  >({});

  // Preferences save feedback
  const [prefsSaved, setPrefsSaved] = useState(false);

  const loadData = useCallback(() => {
    setConnections(aiProviderService.getConnections());
    setPreferences(aiProviderService.getPreferences());
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTestConnection = async (conn: AIProviderConnection) => {
    setTestStatusMap((prev) => ({
      ...prev,
      [conn.id]: { testing: true },
    }));

    try {
      const res = await aiProviderService.testConnection(conn);
      setTestStatusMap((prev) => ({
        ...prev,
        [conn.id]: {
          testing: false,
          result: {
            success: res.success,
            message: res.success
              ? `Connected (${res.latencyMs || 0}ms)`
              : res.error || 'Connection failed',
          },
        },
      }));
      loadData();
    } catch {
      setTestStatusMap((prev) => ({
        ...prev,
        [conn.id]: {
          testing: false,
          result: {
            success: false,
            message: 'Connection failed: Unable to reach provider.',
          },
        },
      }));
    }
  };

  const handleSetDefault = (id: string) => {
    aiProviderService.setDefaultConnection(id);
    loadData();
  };

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    aiProviderService.savePreferences(preferences);
    setPrefsSaved(true);
    setTimeout(() => setPrefsSaved(false), 2500);
  };

  const defaultConnection = connections.find((c) => c.isDefault && c.isEnabled) || connections[0] || null;

  // Unconnected supported providers
  const unconnectedSupported = AI_PROVIDER_REGISTRY.filter(
    (p) =>
      p.status === 'supported' &&
      p.id !== 'custom' &&
      !connections.some((c) => c.providerId === p.id)
  );

  // Coming soon providers
  const comingSoonProviders = AI_PROVIDER_REGISTRY.filter((p) => p.status === 'coming_soon');

  return (
    <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 sm:p-7 shadow-sm space-y-6">
      {/* ── Section Title & Subtitle ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-surface-border dark:border-darkSurface-border">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-bold uppercase tracking-wider mb-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI & Generation</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-display text-surface-text dark:text-darkSurface-text">
            AI Providers
          </h2>
          <p className="text-xs sm:text-sm text-surface-muted dark:text-darkSurface-muted mt-1 max-w-xl">
            Connect your own AI providers and choose which model powers your mock-test generation.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setAddInitialProviderId('google-gemini');
              setAddModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white font-bold text-xs shadow-glow hover:brightness-110 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Provider</span>
          </button>

          <button
            type="button"
            onClick={() => setAddCustomModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-elev2 hover:bg-surface-elev3 text-surface-text dark:bg-darkSurface-elev2 dark:hover:bg-darkSurface-elev3 dark:text-darkSurface-text font-bold text-xs border border-surface-border dark:border-darkSurface-border transition-all"
          >
            <Server className="w-4 h-4" />
            <span>Custom Provider</span>
          </button>
        </div>
      </div>

      {/* ── Sub Navigation Tabs ───────────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-surface-border dark:border-darkSurface-border text-xs sm:text-sm font-semibold">
        <button
          type="button"
          onClick={() => setActiveSubTab('providers')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl whitespace-nowrap transition-all ${
            activeSubTab === 'providers'
              ? 'bg-brand-primary text-white shadow-glow font-bold'
              : 'text-surface-muted hover:text-surface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>AI Providers</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('default-model')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl whitespace-nowrap transition-all ${
            activeSubTab === 'default-model'
              ? 'bg-brand-primary text-white shadow-glow font-bold'
              : 'text-surface-muted hover:text-surface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Default Model</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('preferences')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl whitespace-nowrap transition-all ${
            activeSubTab === 'preferences'
              ? 'bg-brand-primary text-white shadow-glow font-bold'
              : 'text-surface-muted hover:text-surface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Generation Preferences</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('usage')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl whitespace-nowrap transition-all ${
            activeSubTab === 'usage'
              ? 'bg-brand-primary text-white shadow-glow font-bold'
              : 'text-surface-muted hover:text-surface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Usage & Billing</span>
        </button>
      </div>

      {/* ── TAB 1: AI Providers ───────────────────────────────────────── */}
      {activeSubTab === 'providers' && (
        <div className="space-y-6">
          {/* Security Banner */}
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3 text-xs">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <strong className="text-emerald-800 dark:text-emerald-300 font-bold block">
                Browser-Only BYOK (Bring Your Own Key)
              </strong>
              <p className="text-emerald-700 dark:text-emerald-400 leading-relaxed">
                Your API key stays on this device and is used from this browser. Keys are never logged, sent to Mock.AI servers, or exposed to telemetry.
              </p>
            </div>
          </div>

          {/* Connected Providers List */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted">
              Your Connected AI Providers ({connections.length})
            </h3>

            {connections.length === 0 ? (
              <div className="p-8 rounded-3xl border border-dashed border-surface-border dark:border-darkSurface-border bg-surface-elev1 dark:bg-darkSurface-elev2 text-center space-y-3">
                <Cpu className="w-8 h-8 text-surface-muted mx-auto" />
                <h4 className="font-bold text-sm text-surface-text dark:text-darkSurface-text">
                  No AI providers connected yet
                </h4>
                <p className="text-xs text-surface-muted dark:text-darkSurface-muted max-w-sm mx-auto">
                  Connect your Google Gemini, OpenAI, or Groq API key to generate customized mock exams.
                </p>
                <button
                  type="button"
                  onClick={() => setAddModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold shadow-glow hover:brightness-110 transition-all"
                >
                  Connect First Provider
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5">
                {connections.map((conn) => {
                  const testState = testStatusMap[conn.id];
                  const isConnDefault = conn.isDefault;

                  return (
                    <div
                      key={conn.id}
                      className="p-5 rounded-2xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              conn.status === 'CONNECTED'
                                ? 'bg-emerald-500'
                                : conn.status === 'CONNECTION_FAILED'
                                ? 'bg-red-500'
                                : 'bg-gray-400'
                            }`}
                          />
                          <h4 className="font-bold text-sm text-surface-text dark:text-darkSurface-text">
                            {conn.name}
                          </h4>

                          {isConnDefault && (
                            <span className="px-2 py-0.5 rounded-md bg-brand-primary/15 text-brand-primary text-[10px] font-bold uppercase tracking-wider">
                              ⭐ Default Generator
                            </span>
                          )}

                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              conn.status === 'CONNECTED'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : conn.status === 'CONNECTION_FAILED'
                                ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                                : 'bg-surface-elev3 text-surface-muted'
                            }`}
                          >
                            {conn.status === 'CONNECTED'
                              ? 'Connected'
                              : conn.status === 'CONNECTION_FAILED'
                              ? 'Connection failed'
                              : 'Not configured'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-surface-muted dark:text-darkSurface-muted">
                          <span>
                            Model: <strong className="text-surface-text dark:text-darkSurface-text font-semibold">{conn.selectedModel}</strong>
                          </span>
                          <span>•</span>
                          <span className="font-mono">
                            API key {conn.apiKeyMasked || '••••••••'}
                          </span>
                          {conn.lastLatencyMs !== undefined && (
                            <>
                              <span>•</span>
                              <span>{conn.lastLatencyMs}ms latency</span>
                            </>
                          )}
                        </div>

                        {/* Inline test message if present */}
                        {testState?.result && (
                          <p
                            className={`text-xs font-semibold ${
                              testState.result.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {testState.result.message}
                          </p>
                        )}
                      </div>

                      {/* Card Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={testState?.testing}
                          onClick={() => handleTestConnection(conn)}
                          className="px-3 py-1.5 rounded-xl bg-surface-elev2 hover:bg-surface-elev3 text-surface-text dark:bg-darkSurface-elev3 dark:hover:bg-darkSurface-elev1 text-xs font-semibold border border-surface-border dark:border-darkSurface-border transition-all flex items-center gap-1.5"
                        >
                          {testState?.testing ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin text-brand-primary" />
                              <span>Testing...</span>
                            </>
                          ) : (
                            <span>Test</span>
                          )}
                        </button>

                        {!isConnDefault && (
                          <button
                            type="button"
                            onClick={() => handleSetDefault(conn.id)}
                            className="px-3 py-1.5 rounded-xl bg-surface-elev2 hover:bg-surface-elev3 text-surface-text dark:bg-darkSurface-elev3 dark:hover:bg-darkSurface-elev1 text-xs font-semibold border border-surface-border dark:border-darkSurface-border transition-all"
                          >
                            Set Default
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setManagedConn(conn)}
                          className="px-3.5 py-1.5 rounded-xl bg-brand-primary text-white text-xs font-bold shadow-sm hover:brightness-110 active:scale-95 transition-all"
                        >
                          Manage
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Available / Catalog Providers */}
          <div className="space-y-3 pt-2">
            <h3 className="font-bold text-sm uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted">
              Add More AI Providers
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Unconnected Supported Providers */}
              {unconnectedSupported.map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-2xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-400" />
                      <h4 className="font-bold text-sm text-surface-text dark:text-darkSurface-text">
                        {p.name}
                      </h4>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-surface-elev2 dark:bg-darkSurface-elev3 text-surface-muted">
                        Not Added
                      </span>
                    </div>
                    <p className="text-xs text-surface-muted dark:text-darkSurface-muted line-clamp-1 mt-0.5">
                      {p.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setAddInitialProviderId(p.id);
                      setAddModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-surface-elev2 hover:bg-surface-elev3 text-surface-text dark:bg-darkSurface-elev3 dark:hover:bg-darkSurface-elev1 text-xs font-bold border border-surface-border dark:border-darkSurface-border shrink-0 transition-all"
                  >
                    Add Provider
                  </button>
                </div>
              ))}

              {/* Coming Soon Providers */}
              {comingSoonProviders.map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-2xl bg-surface-elev1/50 dark:bg-darkSurface-elev2/50 border border-surface-border/50 dark:border-darkSurface-border/50 flex items-center justify-between gap-3 opacity-75"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                      <h4 className="font-bold text-sm text-surface-muted dark:text-darkSurface-muted">
                        {p.name}
                      </h4>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        Coming soon
                      </span>
                    </div>
                    <p className="text-xs text-surface-muted line-clamp-1 mt-0.5">
                      {p.description}
                    </p>
                  </div>
                  <span className="text-[11px] text-surface-muted font-medium shrink-0">
                    In development
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Default Model ──────────────────────────────────────── */}
      {activeSubTab === 'default-model' && (
        <div className="space-y-4">
          <div className="p-6 rounded-2xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border space-y-4">
            <h3 className="font-bold text-base text-surface-text dark:text-darkSurface-text">
              Default Mock Generator
            </h3>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
              Choose which connected AI provider and model powers your mock test creation and instant question explanations.
            </p>

            {connections.length === 0 ? (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                No providers connected yet. Connect Google Gemini, OpenAI, or Groq first.
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider">
                  Active Provider & Model:
                </label>
                <select
                  value={defaultConnection?.id || ''}
                  onChange={(e) => handleSetDefault(e.target.value)}
                  className="w-full sm:w-96 px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs font-bold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                >
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.selectedModel}
                    </option>
                  ))}
                </select>

                <div className="p-4 rounded-xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-surface-muted block">Selected Generator</span>
                    <strong className="text-sm font-bold text-surface-text dark:text-darkSurface-text">
                      {defaultConnection?.name} ({defaultConnection?.selectedModel})
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('providers')}
                    className="text-xs font-bold text-brand-primary hover:underline"
                  >
                    Manage Providers
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: Generation Preferences ─────────────────────────────── */}
      {activeSubTab === 'preferences' && (
        <form onSubmit={handleSavePreferences} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1.5">
                Default Questions Count per Test:
              </label>
              <select
                value={preferences.questionsPerTest || 8}
                onChange={(e) =>
                  setPreferences({ ...preferences, questionsPerTest: Number(e.target.value) })
                }
                className="w-full px-3 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              >
                <option value={5}>5 Questions (Quick Check)</option>
                <option value={8}>8 Questions (Standard)</option>
                <option value={10}>10 Questions (Short Exam)</option>
                <option value={15}>15 Questions (Intermediate)</option>
                <option value={20}>20 Questions (Intensive)</option>
                <option value={25}>25 Questions (Full Section)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1.5">
                Default Difficulty Level:
              </label>
              <select
                value={preferences.defaultDifficulty || 'MEDIUM'}
                onChange={(e) =>
                  setPreferences({ ...preferences, defaultDifficulty: e.target.value as any })
                }
                className="w-full px-3 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              >
                <option value="EASY">Easy (Foundational Concepts)</option>
                <option value="MEDIUM">Medium (Competitive Standard)</option>
                <option value="HARD">Hard (Deep Application)</option>
                <option value="COMPETITIVE">Competitive / Olympiad</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider">
                Model Temperature / Strictness:
              </label>
              <span className="text-xs font-mono font-bold text-brand-primary">
                {preferences.temperature !== undefined ? preferences.temperature : 0.2}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={preferences.temperature !== undefined ? preferences.temperature : 0.2}
              onChange={(e) =>
                setPreferences({ ...preferences, temperature: parseFloat(e.target.value) })
              }
              className="w-full accent-brand-primary cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-surface-muted">
              <span>0.0 (Precise & deterministic)</span>
              <span>0.2 (Recommended for STEM)</span>
              <span>1.0 (Creative)</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-surface-border dark:border-darkSurface-border">
            {prefsSaved ? (
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check className="w-4 h-4" />
                <span>Preferences saved successfully!</span>
              </span>
            ) : (
              <span className="text-xs text-surface-muted dark:text-darkSurface-muted">
                Applied to all upcoming generated tests.
              </span>
            )}

            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white font-bold text-xs shadow-glow hover:brightness-110 active:scale-95 transition-all"
            >
              Save Preferences
            </button>
          </div>
        </form>
      )}

      {/* ── TAB 4: Usage & Billing ────────────────────────────────────── */}
      {activeSubTab === 'usage' && (
        <div className="space-y-4">
          <div className="p-6 rounded-2xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border space-y-4 text-xs">
            <h3 className="font-bold text-base text-surface-text dark:text-darkSurface-text">
              Transparent BYOK Cost Architecture
            </h3>
            <p className="text-surface-muted dark:text-darkSurface-muted leading-relaxed">
              Mock.AI operates on a 100% transparent Bring-Your-Own-Key model. We never charge subscription fees, per-token markups, or gateway margins. Your browser connects directly to your AI provider endpoint.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-4 rounded-xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border space-y-1">
                <span className="text-surface-muted text-[11px] font-semibold">Active Provider</span>
                <p className="font-bold text-sm text-surface-text dark:text-darkSurface-text">
                  {defaultConnection?.name || 'None'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border space-y-1">
                <span className="text-surface-muted text-[11px] font-semibold">Configured Connections</span>
                <p className="font-bold text-sm text-surface-text dark:text-darkSurface-text">
                  {connections.length} Provider{connections.length === 1 ? '' : 's'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border space-y-1">
                <span className="text-surface-muted text-[11px] font-semibold">Platform Fee</span>
                <p className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                  ₹0.00 (Zero Markup)
                </p>
              </div>
            </div>

            <div className="pt-2">
              <p className="font-bold text-surface-text dark:text-darkSurface-text mb-2">
                Provider Usage Dashboards:
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href="https://aistudio.google.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elev2 hover:bg-surface-elev3 text-surface-text font-bold text-xs border border-surface-border transition-all"
                >
                  <span>Google AI Studio</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <a
                  href="https://platform.openai.com/usage"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elev2 hover:bg-surface-elev3 text-surface-text font-bold text-xs border border-surface-border transition-all"
                >
                  <span>OpenAI Platform Usage</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <a
                  href="https://console.groq.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elev2 hover:bg-surface-elev3 text-surface-text font-bold text-xs border border-surface-border transition-all"
                >
                  <span>Groq Console</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────── */}
      <AddProviderModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        initialProviderId={addInitialProviderId}
        onProviderSaved={() => {
          loadData();
        }}
      />

      <AddCustomProviderModal
        isOpen={addCustomModalOpen}
        onClose={() => setAddCustomModalOpen(false)}
        onProviderSaved={() => {
          loadData();
        }}
      />

      <ManageProviderModal
        isOpen={Boolean(managedConn)}
        connection={managedConn}
        onClose={() => setManagedConn(null)}
        onUpdated={() => {
          loadData();
        }}
      />
    </div>
  );
};
