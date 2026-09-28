import {
  AIProviderAdapter,
  AIProviderConnection,
  AIPreferences,
  ConnectionTestResult,
  AIProviderId,
} from '../../types/aiProvider';
import { GeminiAdapter } from './adapters/geminiAdapter';
import { OpenAIAdapter } from './adapters/openAiAdapter';
import { GroqAdapter } from './adapters/groqAdapter';
import { CustomOpenAIAdapter } from './adapters/customOpenAiAdapter';
import { storage } from '../storage';

const STORAGE_KEYS = {
  CONNECTIONS: 'mockai_ai_connections',
  PREFERENCES: 'mockai_ai_preferences',
};

export function maskApiKey(key?: string): string {
  if (!key || !key.trim()) return '';
  const clean = key.trim();
  if (clean.length <= 4) return '••••••••';
  const last4 = clean.slice(-4);
  return `••••••••••••${last4}`;
}

export class AIProviderService {
  private adapters: Map<AIProviderId, AIProviderAdapter> = new Map();

  constructor() {
    this.registerAdapter(new GeminiAdapter());
    this.registerAdapter(new OpenAIAdapter());
    this.registerAdapter(new GroqAdapter());
    this.registerAdapter(new CustomOpenAIAdapter());
    this.migrateLegacySettings();
  }

  registerAdapter(adapter: AIProviderAdapter): void {
    this.adapters.set(adapter.providerId, adapter);
  }

  getAdapter(providerId: AIProviderId): AIProviderAdapter | undefined {
    return this.adapters.get(providerId);
  }

  /**
   * Migrate legacy settings (geminiApiKey, groqApiKey) into the generic provider architecture.
   */
  private migrateLegacySettings(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const existingRaw = localStorage.getItem(STORAGE_KEYS.CONNECTIONS);
      if (existingRaw) {
        // Already initialized
        return;
      }

      const settings = storage.getSettings();
      const connections: AIProviderConnection[] = [];

      // Check legacy Gemini Key
      const geminiKey =
        settings.geminiApiKey ||
        (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) ||
        '';

      if (geminiKey.trim()) {
        connections.push({
          id: `conn_gemini_${Date.now()}`,
          providerId: 'google-gemini',
          name: 'Google Gemini',
          apiKey: geminiKey.trim(),
          apiKeyMasked: maskApiKey(geminiKey.trim()),
          selectedModel: 'gemini-2.5-flash',
          isEnabled: true,
          isDefault: true,
          status: 'CONNECTED',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      // Check legacy Groq Key
      const groqKey =
        settings.groqApiKey ||
        (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GROQ_API_KEY) ||
        '';

      if (groqKey.trim()) {
        connections.push({
          id: `conn_groq_${Date.now() + 1}`,
          providerId: 'groq',
          name: 'Groq',
          apiKey: groqKey.trim(),
          apiKeyMasked: maskApiKey(groqKey.trim()),
          selectedModel: 'llama-3.3-70b-versatile',
          isEnabled: true,
          isDefault: connections.length === 0,
          status: 'CONNECTED',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      if (connections.length > 0) {
        localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify(connections));
      }
    } catch {
      // Ignore migration errors in non-browser environments
    }
  }

  getConnections(): AIProviderConnection[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CONNECTIONS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  getConnection(id: string): AIProviderConnection | undefined {
    return this.getConnections().find((c) => c.id === id);
  }

  saveConnection(connection: AIProviderConnection): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const connections = this.getConnections();
      const existingIdx = connections.findIndex((c) => c.id === connection.id);

      // Auto-compute masked key
      const updated: AIProviderConnection = {
        ...connection,
        apiKeyMasked: maskApiKey(connection.apiKey),
        updatedAt: Date.now(),
      };

      // If set as default, clear default on other connections
      if (updated.isDefault) {
        connections.forEach((c) => {
          if (c.id !== updated.id) c.isDefault = false;
        });
      } else if (connections.length === 0 || (existingIdx === -1 && !connections.some((c) => c.isDefault))) {
        // If it's the only connection, make it default
        updated.isDefault = true;
      }

      if (existingIdx >= 0) {
        connections[existingIdx] = updated;
      } else {
        connections.push(updated);
      }

      localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify(connections));

      // Sync with storage.ts legacy fields for backwards compatibility
      this.syncLegacySettings(connections);
    } catch (err) {
      console.warn('[AIProviderService] Failed to save connection:', err);
    }
  }

  deleteConnection(id: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const connections = this.getConnections().filter((c) => c.id !== id);
      // If deleted connection was default and others remain, set first as default
      if (connections.length > 0 && !connections.some((c) => c.isDefault)) {
        connections[0].isDefault = true;
      }
      localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify(connections));
      this.syncLegacySettings(connections);
    } catch (err) {
      console.warn('[AIProviderService] Failed to delete connection:', err);
    }
  }

  setDefaultConnection(id: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const connections = this.getConnections();
      connections.forEach((c) => {
        c.isDefault = c.id === id;
      });
      localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify(connections));
      this.syncLegacySettings(connections);
    } catch (err) {
      console.warn('[AIProviderService] Failed to set default connection:', err);
    }
  }

  async testConnection(connection: AIProviderConnection): Promise<ConnectionTestResult> {
    const adapter = this.adapters.get(connection.providerId);
    if (!adapter) {
      return {
        success: false,
        error: `No adapter implemented for provider: ${connection.providerId}`,
      };
    }

    const result = await adapter.testConnection(connection);

    // Update connection status in storage if it exists
    if (connection.id) {
      const stored = this.getConnection(connection.id);
      if (stored) {
        stored.status = result.success ? 'CONNECTED' : 'CONNECTION_FAILED';
        stored.lastTestedAt = Date.now();
        stored.lastLatencyMs = result.latencyMs;
        stored.lastError = result.error;
        this.saveConnection(stored);
      }
    }

    return result;
  }

  getDefaultConnection(): AIProviderConnection | null {
    const connections = this.getConnections();
    const def = connections.find((c) => c.isDefault && c.isEnabled);
    if (def) return def;
    return connections.find((c) => c.isEnabled) || null;
  }

  getActiveAdapter(): { adapter: AIProviderAdapter; connection: AIProviderConnection } | null {
    const conn = this.getDefaultConnection();
    if (!conn) return null;
    const adapter = this.adapters.get(conn.providerId);
    if (!adapter) return null;
    return { adapter, connection: conn };
  }

  getPreferences(): AIPreferences {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  savePreferences(prefs: Partial<AIPreferences>): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const current = this.getPreferences();
      const updated = { ...current, ...prefs };
      localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(updated));
    } catch (err) {
      console.warn('[AIProviderService] Failed to save preferences:', err);
    }
  }

  private syncLegacySettings(connections: AIProviderConnection[]): void {
    try {
      const geminiConn = connections.find((c) => c.providerId === 'google-gemini');
      const groqConn = connections.find((c) => c.providerId === 'groq');
      const current = storage.getSettings();

      storage.saveSettings({
        ...current,
        geminiApiKey: geminiConn?.apiKey || '',
        groqApiKey: groqConn?.apiKey || '',
      });
    } catch {
      // Ignore
    }
  }
}

export const aiProviderService = new AIProviderService();
