import { AIProviderDefinition } from '../../types/aiProvider';

export const AI_PROVIDER_REGISTRY: AIProviderDefinition[] = [
  {
    id: 'google-gemini',
    name: 'Google Gemini',
    badgeText: 'Official',
    description: "Google's state-of-the-art multimodal AI for fast reasoning, math extraction, and STEM questions.",
    status: 'supported',
    requiresApiKey: true,
    supportsCustomEndpoint: false,
    apiKeyPlaceholder: 'AIzaSy...',
    apiKeyHelpUrl: 'https://aistudio.google.com/app/apikey',
    supportedModels: [
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Recommended: Ultra-fast generation with next-gen multimodal reasoning.',
        contextWindow: '1M tokens',
        isDefault: true,
        supportsVision: true,
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        description: 'Lightweight and dependable for rapid MCQ generation.',
        contextWindow: '1M tokens',
        supportsVision: true,
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        description: 'Deep mathematical and algorithmic reasoning for advanced competitive papers.',
        contextWindow: '2M tokens',
        supportsVision: true,
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    badgeText: 'Popular',
    description: 'Industry-standard GPT models with high academic precision and reliable structured outputs.',
    status: 'supported',
    requiresApiKey: true,
    supportsCustomEndpoint: false,
    defaultEndpoint: 'https://api.openai.com/v1',
    apiKeyPlaceholder: 'sk-proj-...',
    apiKeyHelpUrl: 'https://platform.openai.com/api-keys',
    supportedModels: [
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Fast, cost-effective model with high accuracy across academic disciplines.',
        contextWindow: '128k tokens',
        isDefault: true,
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        description: 'Flagship model with complex reasoning for rigorous Olympiad & GATE problems.',
        contextWindow: '128k tokens',
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'Standard legacy model for basic practice tests.',
        contextWindow: '16k tokens',
      },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    badgeText: 'Ultra-Fast',
    description: 'Ultra-low latency LPU inference engine powering open-source models at 500+ tokens/sec.',
    status: 'supported',
    requiresApiKey: true,
    supportsCustomEndpoint: false,
    defaultEndpoint: 'https://api.groq.com/openai/v1',
    apiKeyPlaceholder: 'gsk_...',
    apiKeyHelpUrl: 'https://console.groq.com/keys',
    supportedModels: [
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B Versatile',
        description: 'Top-tier open weights model matching proprietary quality with lightning speed.',
        contextWindow: '128k tokens',
        isDefault: true,
      },
      {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B Instant',
        description: 'Instantaneous response times for real-time practice sessions.',
        contextWindow: '128k tokens',
      },
      {
        id: 'mixtral-8x7b-32768',
        name: 'Mixtral 8x7B',
        description: 'Sparse mixture of experts model with balanced conceptual breadth.',
        contextWindow: '32k tokens',
      },
    ],
  },
  {
    id: 'custom',
    name: 'OpenAI-Compatible (Custom)',
    badgeText: 'Custom Endpoint',
    description: 'Connect any OpenAI-compatible API endpoint (Ollama, vLLM, DeepSeek, Together, LM Studio, etc.).',
    status: 'supported',
    requiresApiKey: false,
    supportsCustomEndpoint: true,
    apiKeyPlaceholder: 'API key (optional if local endpoint)',
    supportedModels: [
      {
        id: 'custom-model',
        name: 'Custom Model',
        description: 'User-specified model identifier compatible with target server.',
        isDefault: true,
      },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    badgeText: 'Coming Soon',
    description: 'Claude 3.5 Sonnet & Haiku models known for nuanced comprehension and detailed explanations.',
    status: 'coming_soon',
    requiresApiKey: true,
    supportsCustomEndpoint: false,
    apiKeyPlaceholder: 'sk-ant-...',
    apiKeyHelpUrl: 'https://console.anthropic.com/settings/keys',
    supportedModels: [
      {
        id: 'claude-3-5-sonnet-latest',
        name: 'Claude 3.5 Sonnet',
        description: 'Frontier reasoning and analysis.',
      },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    badgeText: 'Coming Soon',
    description: 'Unified multi-provider API router giving access to hundreds of AI models with single billing.',
    status: 'coming_soon',
    requiresApiKey: true,
    supportsCustomEndpoint: false,
    apiKeyPlaceholder: 'sk-or-...',
    apiKeyHelpUrl: 'https://openrouter.ai/keys',
    supportedModels: [],
  },
  {
    id: 'ollama',
    name: 'Ollama Native',
    badgeText: 'Coming Soon',
    description: 'Direct integration with your local Ollama daemon without manual endpoint configuration.',
    status: 'coming_soon',
    requiresApiKey: false,
    supportsCustomEndpoint: true,
    apiKeyPlaceholder: 'Not required',
    supportedModels: [],
  },
];

export function getProviderDefinition(id: string): AIProviderDefinition | undefined {
  return AI_PROVIDER_REGISTRY.find((p) => p.id === id);
}

export function getSupportedProviders(): AIProviderDefinition[] {
  return AI_PROVIDER_REGISTRY.filter((p) => p.status === 'supported');
}
