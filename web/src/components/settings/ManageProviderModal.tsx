import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  Check,
} from 'lucide-react';
import { AI_PROVIDER_REGISTRY } from '../../services/ai/aiProviderRegistry';
import { aiProviderService } from '../../services/ai/aiProviderService';
import { AIProviderConnection } from '../../types/aiProvider';

interface ManageProviderModalProps {
  connection: AIProviderConnection | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export const ManageProviderModal: React.FC<ManageProviderModalProps> = ({
  connection,
  isOpen,
  onClose,
  onUpdated,
}) => {
  const providerDef = connection ? AI_PROVIDER_REGISTRY.find((p) => p.id === connection.providerId) : undefined;
  const [selectedModel, setSelectedModel] = useState(connection?.selectedModel || '');
  const [newApiKey, setNewApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isDefault, setIsDefault] = useState(connection?.isDefault || false);

  // Sync state if connection changes
  useEffect(() => {
    if (connection) {
      setSelectedModel(connection.selectedModel);
      setIsDefault(connection.isDefault);
    }
  }, [connection]);

  // Testing connection state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    success: boolean;
    message?: string;
  }>({ tested: false, success: false });

  const handleTest = async () => {
    if (!connection) return;
    setIsTesting(true);
    setTestResult({ tested: false, success: false });

    try {
      const connToTest: AIProviderConnection = {
        ...connection,
        selectedModel,
        apiKey: newApiKey.trim() || connection.apiKey,
      };

      const res = await aiProviderService.testConnection(connToTest);
      setTestResult({
        tested: true,
        success: res.success,
        message: res.success ? `Connected successfully (${res.latencyMs || 0}ms)` : res.error,
      });
    } catch {
      setTestResult({
        tested: true,
        success: false,
        message: 'Unable to connect to this provider. Check credentials and provider status.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!connection) return;
    const updated: AIProviderConnection = {
      ...connection,
      selectedModel,
      apiKey: newApiKey.trim() ? newApiKey.trim() : connection.apiKey,
      isDefault,
      status: testResult.tested ? (testResult.success ? 'CONNECTED' : 'CONNECTION_FAILED') : connection.status,
      updatedAt: Date.now(),
    };

    aiProviderService.saveConnection(updated);
    onUpdated();
    onClose();
  };

  const handleDelete = () => {
    if (!connection) return;
    if (window.confirm(`Are you sure you want to disconnect ${connection.name}?`)) {
      aiProviderService.deleteConnection(connection.id);
      onUpdated();
      onClose();
    }
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

  if (!isOpen || !connection) return null;

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
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-surface-border dark:border-darkSurface-border">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-brand-primary/10 text-brand-primary">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-lg font-display text-surface-text dark:text-darkSurface-text">
                Manage {connection.name}
              </h3>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                Configure active model, update credentials, or test connection
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
          {/* Active Model */}
          <div>
            <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1.5">
              Active Model
            </label>
            {providerDef && providerDef.supportedModels.length > 0 && connection.providerId !== 'custom' ? (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              >
                {providerDef.supportedModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                required
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                placeholder="Model identifier"
                className="w-full px-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs font-mono text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              />
            )}
          </div>

          {/* Current Key / Replace Key */}
          <div>
            <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1">
              API Key (Masked: {connection.apiKeyMasked || '••••••••'})
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder="Enter new key to replace existing"
                className="w-full pl-4 pr-11 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs font-mono text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 placeholder:text-surface-muted"
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
            <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted mt-1">
              Leave blank to keep existing key.
            </p>
          </div>

          {/* Set as Default Generator */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="manage_default_check"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary/30 cursor-pointer"
            />
            <label htmlFor="manage_default_check" className="text-xs text-surface-text dark:text-darkSurface-text cursor-pointer">
              Set as Default Mock Generator
            </label>
          </div>

          {/* Connection Test Result */}
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

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-surface-border dark:border-darkSurface-border">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isTesting}
                onClick={handleTest}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-elev2 hover:bg-surface-elev3 text-surface-text dark:bg-darkSurface-elev2 dark:hover:bg-darkSurface-elev3 dark:text-darkSurface-text font-bold text-xs border border-surface-border dark:border-darkSurface-border transition-all"
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

              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-500/10 text-xs font-bold transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>

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
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white font-bold text-xs shadow-glow hover:brightness-110 active:scale-95 transition-all"
              >
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
