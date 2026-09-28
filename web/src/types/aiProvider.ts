import { Question } from './index';

export type AIProviderId =
  | 'google-gemini'
  | 'openai'
  | 'groq'
  | 'custom'
  | 'anthropic'
  | 'openrouter'
  | 'ollama';

export type AIProviderStatus = 'supported' | 'coming_soon';

export type AIConnectionStatus = 'CONNECTED' | 'CONNECTION_FAILED' | 'NOT_CONFIGURED';

export interface AIModelDefinition {
  id: string;
  name: string;
  description: string;
  contextWindow?: string;
  isDefault?: boolean;
  supportsVision?: boolean;
}

export interface AIProviderDefinition {
  id: AIProviderId;
  name: string;
  badgeText?: string;
  description: string;
  status: AIProviderStatus;
  requiresApiKey: boolean;
  supportsCustomEndpoint: boolean;
  defaultEndpoint?: string;
  apiKeyPlaceholder: string;
  apiKeyHelpUrl?: string;
  supportedModels: AIModelDefinition[];
}

export interface AIProviderConnection {
  id: string;
  providerId: AIProviderId;
  name: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyMasked?: string;
  selectedModel: string;
  authHeaderType?: 'bearer' | 'api-key' | 'none';
  isEnabled: boolean;
  isDefault: boolean;
  status: AIConnectionStatus;
  lastTestedAt?: number;
  lastLatencyMs?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AIPreferences {
  defaultProviderId?: string;
  defaultModel?: string;
  temperature?: number;
  questionsPerTest?: number;
  defaultDifficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'COMPETITIVE';
  preferLatexMath?: boolean;
}

export interface ConnectionTestResult {
  success: boolean;
  latencyMs?: number;
  error?: string;
  modelVerified?: string;
}

export interface AIProviderAdapter {
  readonly providerId: AIProviderId;
  testConnection(connection: AIProviderConnection): Promise<ConnectionTestResult>;
  generateQuestions(
    prompt: string,
    connection: AIProviderConnection,
    options?: { count?: number; difficulty?: string }
  ): Promise<Question[]>;
  extractFromText(
    text: string,
    title: string,
    connection: AIProviderConnection
  ): Promise<Question[]>;
  fixQuestions(
    questions: Question[],
    connection: AIProviderConnection
  ): Promise<Question[]>;
  extractFromBase64File?(
    base64Data: string,
    mimeType: string,
    fileName: string,
    connection: AIProviderConnection
  ): Promise<Question[]>;
}
