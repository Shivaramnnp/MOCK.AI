import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Server,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';
import { aiProviderService } from '../../services/ai/aiProviderService';
import { AIProviderConnection } from '../../types/aiProvider';

interface AddCustomProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProviderSaved: (conn: AIProviderConnection) => void;
}

export const AddCustomProviderModal: React.FC<AddCustomProviderModalProps> = ({
  isOpen,
  onClose,
  onProviderSaved,
}) => {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('');
  const [authHeaderType, setAuthHeaderType] = useState<'bearer' | 'api-key' | 'none'>('bearer');
  const [isDefault, setIsDefault] = useState(false);

  // Testing connection state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    success: boolean;
    message?: string;
    latencyMs?: number;
  }>({ tested: false, success: false });

  const handleTestConnection = async () => {
    if (!baseUrl.trim()) {
      setTestResult({
        tested: true,
        success: false,
        message: 'Base URL is required to test custom provider connection.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult({ tested: false, success: false });

    try {
      const tempConn: AIProviderConnection = {
        id: `temp_custom_${Date.now()}`,
        providerId: 'custom',
        name: name.trim() || 'Custom Provider',
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        selectedModel: model.trim() || 'default',
        authHeaderType,
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
        message: 'Unable to connect to custom provider. Verify endpoint, model, and network.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !baseUrl.trim() || !model.trim()) return;

    const newConnection: AIProviderConnection = {
      id: `conn_custom_${Date.now()}`,
      providerId: 'custom',
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      selectedModel: model.trim(),
      authHeaderType,
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
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Server className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-lg font-display text-surface-text dark:text-darkSurface-text">
                Add Custom AI Provider
              </h3>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                Connect an OpenAI-compatible API (Ollama, vLLM, DeepSeek, Together, etc.)
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

        {/* Notice */}
        <div className="p-3 my-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
          ⚠️ <strong>API Requirement</strong>: Custom providers must implement the OpenAI-compatible chat format (<code>/v1/chat/completions</code>).
        </div>

        <form onSubmit={handleSave} className="space-y-3.5">
          {/* Provider Name */}
          <div>
            <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1">
              Provider Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Local Ollama, DeepSeek API, Together AI"
              className="w-full px-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            />
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1">
              Base URL *
            </label>
            <input
              type="url"
              required
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="e.g. http://localhost:11434/v1 or https://api.deepseek.com/v1"
              className="w-full px-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs font-mono text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1">
              API Key (Optional for local endpoints)
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full pl-4 pr-11 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs font-mono text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? 'Hide key' : 'Show key'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-muted hover:text-surface-text transition-colors p-1"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Model Name & Auth Header Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1">
                Model Name *
              </label>
              <input
                type="text"
                required
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. llama3:8b, mistral"
                className="w-full px-3 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs font-mono text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1">
                Authentication
              </label>
              <select
                value={authHeaderType}
                onChange={(e) => setAuthHeaderType(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              >
                <option value="bearer">Bearer Token</option>
                <option value="api-key">api-key Header</option>
                <option value="none">No Auth Header</option>
              </select>
            </div>
          </div>

          {/* Set as Default */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="set_as_default_custom"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary/30 cursor-pointer"
            />
            <label htmlFor="set_as_default_custom" className="text-xs text-surface-text dark:text-darkSurface-text cursor-pointer">
              Set as Default Mock Generator
            </label>
          </div>

          {/* Connection Test Feedback */}
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
              disabled={isTesting || !baseUrl.trim()}
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
                disabled={!name.trim() || !baseUrl.trim() || !model.trim()}
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
