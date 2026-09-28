import { AIProviderAdapter, AIProviderConnection, ConnectionTestResult } from '../../../types/aiProvider';
import { Question } from '../../../types';
import { EXTRACTION_SYSTEM_PROMPT, parseQuestionsJson, sanitizeErrorMessage } from './adapterHelpers';

export class CustomOpenAIAdapter implements AIProviderAdapter {
  readonly providerId = 'custom';

  private resolveEndpoint(baseUrl?: string): string {
    if (!baseUrl || !baseUrl.trim()) {
      return 'http://localhost:11434/v1/chat/completions';
    }
    const clean = baseUrl.trim().replace(/\/+$/, '');
    if (clean.endsWith('/chat/completions')) {
      return clean;
    }
    return `${clean}/chat/completions`;
  }

  private buildHeaders(connection: AIProviderConnection): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const apiKey = connection.apiKey?.trim();
    if (apiKey) {
      if (connection.authHeaderType === 'api-key') {
        headers['api-key'] = apiKey;
      } else {
        // Default to Bearer
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
    }

    return headers;
  }

  async testConnection(connection: AIProviderConnection): Promise<ConnectionTestResult> {
    const endpoint = this.resolveEndpoint(connection.baseUrl);
    const headers = this.buildHeaders(connection);
    const model = connection.selectedModel?.trim() || 'default';

    const startTime = performance.now();
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5,
        }),
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          success: false,
          error: sanitizeErrorMessage(errorText || `HTTP ${res.status}`, connection.apiKey),
          latencyMs,
        };
      }

      const data = await res.json();
      if (data?.choices?.[0]) {
        return {
          success: true,
          latencyMs,
          modelVerified: model,
        };
      }

      return {
        success: false,
        error: 'Target endpoint responded but did not return standard OpenAI-compatible choices.',
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        success: false,
        error: sanitizeErrorMessage(err, connection.apiKey),
        latencyMs,
      };
    }
  }

  async generateQuestions(
    prompt: string,
    connection: AIProviderConnection
  ): Promise<Question[]> {
    const endpoint = this.resolveEndpoint(connection.baseUrl);
    const headers = this.buildHeaders(connection);
    const model = connection.selectedModel?.trim() || 'default';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an MCQ exam generator. Output JSON only matching the schema exactly.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(sanitizeErrorMessage(errBody || `HTTP ${response.status}`, connection.apiKey));
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response returned from custom provider endpoint.');
    return parseQuestionsJson(content);
  }

  async extractFromText(
    text: string,
    title: string,
    connection: AIProviderConnection
  ): Promise<Question[]> {
    const prompt = `
Source Material Title: "${title}"
Content:
"""
${text.slice(0, 15000)}
"""

Extract and construct comprehensive multiple choice questions testing the key facts, principles, and definitions from this content.
${EXTRACTION_SYSTEM_PROMPT}
`;
    return this.generateQuestions(prompt, connection);
  }

  async fixQuestions(
    questions: Question[],
    connection: AIProviderConnection
  ): Promise<Question[]> {
    const prompt = `
You are an expert exam auditor. Review the following questions:
1. Ensure every question has exactly 4 non-empty, plausible options.
2. Determine or verify the exact correctAnswerIndex (0 to 3).
3. If formula or equations are present, convert to LaTeX $...$.
4. Provide a clear, step-by-step explanation for each question.

Input Questions:
${JSON.stringify(questions, null, 2)}

${EXTRACTION_SYSTEM_PROMPT}
`;
    return this.generateQuestions(prompt, connection);
  }
}
