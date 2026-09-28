import { AIProviderAdapter, AIProviderConnection, ConnectionTestResult } from '../../../types/aiProvider';
import { Question } from '../../../types';
import { EXTRACTION_SYSTEM_PROMPT, parseQuestionsJson, sanitizeErrorMessage } from './adapterHelpers';

export class GroqAdapter implements AIProviderAdapter {
  readonly providerId = 'groq';
  private readonly defaultEndpoint = 'https://api.groq.com/openai/v1/chat/completions';

  async testConnection(connection: AIProviderConnection): Promise<ConnectionTestResult> {
    const apiKey = connection.apiKey?.trim();
    if (!apiKey) {
      return { success: false, error: 'API key is required.' };
    }

    const startTime = performance.now();
    try {
      const res = await fetch(this.defaultEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: connection.selectedModel || 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5,
        }),
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          success: false,
          error: sanitizeErrorMessage(errorText || `HTTP ${res.status}`, apiKey),
          latencyMs,
        };
      }

      const data = await res.json();
      if (data?.choices?.[0]) {
        return {
          success: true,
          latencyMs,
          modelVerified: connection.selectedModel || 'llama-3.3-70b-versatile',
        };
      }

      return {
        success: false,
        error: 'Received empty response from Groq endpoint.',
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        success: false,
        error: sanitizeErrorMessage(err, apiKey),
        latencyMs,
      };
    }
  }

  async generateQuestions(
    prompt: string,
    connection: AIProviderConnection
  ): Promise<Question[]> {
    const apiKey = connection.apiKey?.trim();
    if (!apiKey) throw new Error('Groq API Key is missing.');

    const model = connection.selectedModel || 'llama-3.3-70b-versatile';
    const response = await fetch(this.defaultEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
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
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(sanitizeErrorMessage(errBody || `HTTP ${response.status}`, apiKey));
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response returned from Groq.');
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
