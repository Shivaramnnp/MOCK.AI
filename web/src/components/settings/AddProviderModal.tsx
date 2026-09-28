import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ExternalLink,
  RefreshCw,
  Cpu,
} from 'lucide-react';
import { AI_PROVIDER_REGISTRY } from '../../services/ai/aiProviderRegistry';
import { aiProviderService } from '../../services/ai/aiProviderService';
import { AIProviderConnection, AIProviderId } from '../../types/aiProvider';

interface AddProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProviderSaved: (conn: AIProviderConnection) => void;
  initialProviderId?: AIProviderId;
}

export const AddProviderModal: React.FC<AddProviderModalProps> = ({
  isOpen,
  onClose,
  onProviderSaved,
  initialProviderId = 'google-gemini',
}) => {
  const supportedProviders = AI_PROVIDER_REGISTRY.filter((p) => p.status === 'supported' && p.id !== 'custom');

  const [selectedProviderId, setSelectedProviderId] = useState<AIProviderId>(initialProviderId);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  // Testing connection state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    success: boolean;
    message?: string;
    latencyMs?: number;
  }>({ tested: false, success: false });

  const currentProviderDef = AI_PROVIDER_REGISTRY.find((p) => p.id === selectedProviderId) || supportedProviders[0];
  const activeModel = selectedModel || currentProviderDef.supportedModels.find((m) => m.isDefault)?.id || currentProviderDef.supportedModels[0]?.id || '';

  const handleProviderChange = (newId: AIProviderId) => {
    setSelectedProviderId(newId);
    const def = AI_PROVIDER_REGISTRY.find((p) => p.id === newId);
    const defaultM = def?.supportedModels.find((m) => m.isDefault)?.id || def?.supportedModels[0]?.id || '';
    setSelectedModel(defaultM);
    setTestResult({ tested: false, success: false });
  };

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setTestResult({
        tested: true,
        success: false,
        message: 'Please enter an API key before testing connection.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult({ tested: false, success: false });

    try {
      const tempConn: AIProviderConnection = {
        id: `temp_test_${Date.now()}`,
        providerId: selectedProviderId,
        name: currentProviderDef.name,
        apiKey: apiKey.trim(),
        selectedModel: activeModel,
        isEnabled: true,
        isDefault: false,
        status: 'NOT_CONFIGURED',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const res = await aiProviderService.testConnection(tempConn);
      setTestResult({
        tested: true,
        success: res.success,
        message: res.success ? `Connected successfully (${res.latencyMs || 0}ms)` : res.error,
        latencyMs: res.latencyMs,
      });
    } catch {
      setTestResult({
        tested: true,
        success: false,
        message: 'Unable to connect. Check API key, model, and network.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;

    const newConnection: AIProviderConnection = {
      id: `conn_${selectedProviderId}_${Date.now()}`,
      providerId: selectedProviderId,
      name: currentProviderDef.name,
      apiKey: apiKey.trim(),
      selectedModel: activeModel,
      isEnabled: true,
      isDefault,
      status: testResult.success ? 'CONNECTED' : 'NOT_CONFIGURED',
      lastTestedAt: testResult.tested ? Date.now() : undefined,
      lastLatencyMs: testResult.latencyMs,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    aiProviderService.saveConnection(newConnection);
    onProviderSaved(newConnection);
    onClose();
  };

  // Keyboard navigation: Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isTesting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isTesting, onClose]);

  // Lock background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isTesting) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-white dark:bg-darkSurface-elev1 rounded-3xl border border-surface-border dark:border-darkSurface-border shadow-2xl p-6 overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-surface-border dark:border-darkSurface-border">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-brand-primary/10 text-brand-primary">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-lg font-display text-surface-text dark:text-darkSurface-text">
                Connect AI Provider
              </h3>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                Bring your own API key to power mock-test generation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-surface-muted hover:text-surface-text dark:hover:text-darkSurface-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          {/* Step 1: Select Provider */}
          <div>
            <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1.5">
              1. Select Provider
            </label>
            <div className="grid grid-cols-3 gap-2">
              {supportedProviders.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleProviderChange(p.id)}
                  className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                    selectedProviderId === p.id
                      ? 'border-brand-primary bg-brand-primary/10 text-brand-primary font-bold shadow-sm'
                      : 'border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text hover:bg-surface-elev3 dark:hover:bg-darkSurface-elev3'
                  }`}
                >
                  <Cpu className="w-4 h-4 mb-0.5" />
                  <span className="text-xs font-semibold">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: API Key */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider">
                2. API Key *
              </label>
              {currentProviderDef.apiKeyHelpUrl && (
                <a
                  href={currentProviderDef.apiKeyHelpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-brand-primary hover:underline flex items-center gap-1"
                >
                  <span>Get API Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                required
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult({ tested: false, success: false });
                }}
                placeholder={currentProviderDef.apiKeyPlaceholder}
                className="w-full pl-4 pr-11 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs font-mono text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 placeholder:text-surface-muted dark:placeholder:text-darkSurface-muted"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-muted hover:text-surface-text transition-colors p-1"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted mt-1">
              🔒 Stored exclusively on this device. Keys are never transmitted to Mock.AI servers.
            </p>
          </div>

          {/* Step 3: Model Selection */}
          <div>
            <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1.5">
              3. Model
            </label>
            <select
              value={activeModel}
              onChange={(e) => {
                setSelectedModel(e.target.value);
                setTestResult({ tested: false, success: false });
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            >
              {currentProviderDef.supportedModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.isDefault ? '(Recommended)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Default Switch */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="set_as_default_check"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary/30 cursor-pointer"
            />
            <label htmlFor="set_as_default_check" className="text-xs text-surface-text dark:text-darkSurface-text cursor-pointer">
              Set as Default Mock Generator
            </label>
          </div>

          {/* Step 4: Connection Test Feedback */}
          {testResult.tested && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2 text-xs font-medium ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span className="leading-tight">{testResult.message}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-surface-border dark:border-darkSurface-border">
            <button
              type="button"
              disabled={isTesting || !apiKey.trim()}
              onClick={handleTestConnection}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-elev2 hover:bg-surface-elev3 text-surface-text dark:bg-darkSurface-elev2 dark:hover:bg-darkSurface-elev3 dark:text-darkSurface-text font-bold text-xs border border-surface-border dark:border-darkSurface-border transition-all disabled:opacity-50"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <span>Test Connection</span>
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-surface-muted hover:text-surface-text transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!apiKey.trim()}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white font-bold text-xs shadow-glow hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
              >
                Save Provider
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
