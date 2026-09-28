import { AIProviderAdapter, AIProviderConnection, ConnectionTestResult } from '../../../types/aiProvider';
import { Question } from '../../../types';
import { EXTRACTION_SYSTEM_PROMPT, parseQuestionsJson, sanitizeErrorMessage } from './adapterHelpers';

export class GeminiAdapter implements AIProviderAdapter {
  readonly providerId = 'google-gemini';

  private getEndpoint(model: string): string {
    const cleanModel = model.trim() || 'gemini-2.5-flash';
    return `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent`;
  }

  async testConnection(connection: AIProviderConnection): Promise<ConnectionTestResult> {
    const apiKey = connection.apiKey?.trim();
    if (!apiKey) {
      return { success: false, error: 'API key is required.' };
    }

    const startTime = performance.now();
    try {
      const endpoint = this.getEndpoint(connection.selectedModel || 'gemini-2.5-flash');
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hello' }] }],
          generationConfig: { maxOutputTokens: 5, temperature: 0 },
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
      if (data?.candidates?.[0]) {
        return {
          success: true,
          latencyMs,
          modelVerified: connection.selectedModel || 'gemini-2.5-flash',
        };
      }

      return {
        success: false,
        error: 'Received empty response structure from Gemini API.',
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
    if (!apiKey) throw new Error('Google Gemini API Key is missing.');

    const endpoint = this.getEndpoint(connection.selectedModel || 'gemini-2.5-flash');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(sanitizeErrorMessage(errBody || `HTTP ${response.status}`, apiKey));
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No candidate content returned from Gemini.');
    return parseQuestionsJson(text);
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

  async extractFromBase64File(
    base64Data: string,
    mimeType: string,
    _fileName: string,
    connection: AIProviderConnection
  ): Promise<Question[]> {
    const apiKey = connection.apiKey?.trim();
    if (!apiKey) throw new Error('Google Gemini API Key is missing.');

    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const endpoint = this.getEndpoint(connection.selectedModel || 'gemini-2.5-flash');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: cleanBase64,
                },
              },
              {
                text: `Analyze this image or document and extract all exam questions or generate conceptual MCQs from it.\n${EXTRACTION_SYSTEM_PROMPT}`,
              },
            ],
          },
        ],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(sanitizeErrorMessage(errBody || `HTTP ${response.status}`, apiKey));
    }

    const json = await response.json();
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('Empty response from Gemini vision model.');
    return parseQuestionsJson(rawText);
  }
}
