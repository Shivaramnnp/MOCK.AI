/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIProviderService, maskApiKey } from './aiProviderService';
import { storage } from '../storage';

describe('AIProviderService & Adapters', () => {
  let service: AIProviderService;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    service = new AIProviderService();
  });

  describe('Key Masking', () => {
    it('masks long API keys showing only last 4 characters', () => {
      expect(maskApiKey('AIzaSyD1234567890abcdef')).toBe('••••••••••••cdef');
      expect(maskApiKey('sk-proj-9876543210wxyz')).toBe('••••••••••••wxyz');
    });

    it('returns empty string for empty keys and bullet placeholders for very short keys', () => {
      expect(maskApiKey('')).toBe('');
      expect(maskApiKey('abc')).toBe('••••••••');
    });
  });

  describe('Legacy Settings Migration', () => {
    it('automatically migrates existing Gemini and Groq keys on first initialization', () => {
      localStorage.clear();
      vi.spyOn(storage, 'getSettings').mockReturnValue({
        theme: 'dark',
        timerSeconds: 60,
        shuffleQuestions: false,
        questionsPerTest: 0,
        geminiApiKey: 'AIzaSy_LEGACY_GEMINI_KEY_1234',
        groqApiKey: 'gsk_LEGACY_GROQ_KEY_5678',
      });

      const migratedService = new AIProviderService();
      const connections = migratedService.getConnections();

      expect(connections.length).toBe(2);
      const gemini = connections.find((c) => c.providerId === 'google-gemini');
      const groq = connections.find((c) => c.providerId === 'groq');

      expect(gemini).toBeDefined();
      expect(gemini?.apiKey).toBe('AIzaSy_LEGACY_GEMINI_KEY_1234');
      expect(gemini?.apiKeyMasked).toBe('••••••••••••1234');
      expect(gemini?.isDefault).toBe(true);

      expect(groq).toBeDefined();
      expect(groq?.apiKey).toBe('gsk_LEGACY_GROQ_KEY_5678');
      expect(groq?.apiKeyMasked).toBe('••••••••••••5678');
    });
  });

  describe('Connection Lifecycle', () => {
    it('saves, retrieves, updates, and deletes connections', () => {
      const connId = 'conn_test_openai';
      service.saveConnection({
        id: connId,
        providerId: 'openai',
        name: 'OpenAI',
        apiKey: 'sk-proj-123456789abcdefgh',
        selectedModel: 'gpt-4o-mini',
        isEnabled: true,
        isDefault: true,
        status: 'NOT_CONFIGURED',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      let stored = service.getConnection(connId);
      expect(stored).toBeDefined();
      expect(stored?.name).toBe('OpenAI');
      expect(stored?.apiKeyMasked).toBe('••••••••••••efgh');
      expect(stored?.isDefault).toBe(true);

      // Add a second connection and set it default
      const customId = 'conn_custom_ollama';
      service.saveConnection({
        id: customId,
        providerId: 'custom',
        name: 'My Local Ollama',
        baseUrl: 'http://localhost:11434/v1',
        selectedModel: 'llama3:8b',
        isEnabled: true,
        isDefault: true,
        status: 'NOT_CONFIGURED',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // The second one should now be default, first one should be unset
      expect(service.getConnection(customId)?.isDefault).toBe(true);
      expect(service.getConnection(connId)?.isDefault).toBe(false);

      // Delete the second connection
      service.deleteConnection(customId);
      expect(service.getConnection(customId)).toBeUndefined();
      // First one should automatically become default again
      expect(service.getConnection(connId)?.isDefault).toBe(true);
    });

    it('persists AI generation preferences', () => {
      service.savePreferences({
        defaultDifficulty: 'COMPETITIVE',
        temperature: 0.3,
        questionsPerTest: 15,
        preferLatexMath: true,
      });

      const prefs = service.getPreferences();
      expect(prefs.defaultDifficulty).toBe('COMPETITIVE');
      expect(prefs.temperature).toBe(0.3);
      expect(prefs.questionsPerTest).toBe(15);
      expect(prefs.preferLatexMath).toBe(true);
    });
  });

  describe('Connection Testing & Secret Redaction', () => {
    it('tests Gemini connection and updates status on success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
        }),
      } as any);

      const conn = {
        id: 'conn_gemini_test',
        providerId: 'google-gemini' as const,
        name: 'Google Gemini',
        apiKey: 'AIzaSy_VALID_KEY_9999',
        selectedModel: 'gemini-2.5-flash',
        isEnabled: true,
        isDefault: true,
        status: 'NOT_CONFIGURED' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      service.saveConnection(conn);

      const result = await service.testConnection(conn);
      expect(result.success).toBe(true);
      expect(result.modelVerified).toBe('gemini-2.5-flash');

      const updated = service.getConnection(conn.id);
      expect(updated?.status).toBe('CONNECTED');
      expect(updated?.lastTestedAt).toBeDefined();
    });

    it('redacts sensitive API keys and tokens in error messages upon connection failure', async () => {
      const secretKey = 'sk-proj-VERY_SECRET_KEY_NEVER_LEAK_ME';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => `Error 401: Invalid key ${secretKey} provided to endpoint.`,
      } as any);

      const conn = {
        id: 'conn_openai_test',
        providerId: 'openai' as const,
        name: 'OpenAI',
        apiKey: secretKey,
        selectedModel: 'gpt-4o-mini',
        isEnabled: true,
        isDefault: true,
        status: 'NOT_CONFIGURED' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await service.testConnection(conn);
      expect(result.success).toBe(false);
      expect(result.error).not.toContain(secretKey);
      expect(result.error).toContain('Authentication failed');
    });
  });
});
