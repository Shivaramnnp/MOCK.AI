import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { aiProviderService } from '../../ai/aiProviderService';
import { parseCanonicalQuestionsJson } from '../../ai/adapters/adapterHelpers';
import { toLegacyQuestion } from '../questionMigrator';
import { evaluateQualityGate, QualityGateEvaluation } from '../qualityGate';
import { createIngestionError } from '../../../types/ingestionErrors';

export interface WebUrlInput {
  url: string;
}

/**
 * Validates against Server-Side Request Forgery (SSRF) and malicious private network probing.
 */
export function isSafePublicUrl(urlString: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(urlString);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, reason: `Protocol ${parsed.protocol} is forbidden. Only HTTP/HTTPS is allowed.` };
    }

    const host = parsed.hostname.toLowerCase();

    // Block localhost, loopbacks, internal hostnames
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === 'metadata.google.internal' ||
      host === 'instance-data'
    ) {
      return { safe: false, reason: 'Access to loopback or cloud instance metadata hosts is prohibited.' };
    }

    // Check IP addresses against private networks (RFC 1918 & RFC 3927)
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = host.match(ipv4Regex);
    if (ipMatch) {
      const octet1 = parseInt(ipMatch[1], 10);
      const octet2 = parseInt(ipMatch[2], 10);

      // 10.0.0.0/8
      if (octet1 === 10) return { safe: false, reason: 'Access to private 10.0.0.0/8 network is prohibited.' };
      // 127.0.0.0/8
      if (octet1 === 127) return { safe: false, reason: 'Access to loopback 127.0.0.0/8 is prohibited.' };
      // 169.254.0.0/16 (Link-local / AWS/GCP/Azure Metadata 169.254.169.254)
      if (octet1 === 169 && octet2 === 254) return { safe: false, reason: 'Access to link-local metadata is prohibited.' };
      // 172.16.0.0/12
      if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return { safe: false, reason: 'Access to private 172.16.0.0/12 network is prohibited.' };
      // 192.168.0.0/16
      if (octet1 === 192 && octet2 === 168) return { safe: false, reason: 'Access to private 192.168.0.0/16 network is prohibited.' };
      // 0.0.0.0/8
      if (octet1 === 0) return { safe: false, reason: 'Access to 0.0.0.0/8 is prohibited.' };
    }

    return { safe: true };
  } catch (err) {
    return { safe: false, reason: `Malformed URL: ${(err as Error).message}` };
  }
}

/**
 * Strips HTML tags, script, style, comments, and navigation to extract core textual content.
 */
export function extractCleanArticleText(html: string): { title: string; text: string } {
  if (!html) return { title: 'Webpage', text: '' };

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Webpage';

  let clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  return { title, text: clean };
}

export class WebUrlSourceAdapter implements SourceAdapter<WebUrlInput> {
  readonly sourceType = 'WebUrl';

  async validateInput(input: WebUrlInput): Promise<{ valid: boolean; error?: string }> {
    if (!input || !input.url) {
      return { valid: false, error: 'Web URL is required.' };
    }
    const check = isSafePublicUrl(input.url);
    if (!check.safe) {
      return { valid: false, error: check.reason || 'Prohibited URL address.' };
    }
    return { valid: true };
  }

  async process(input: WebUrlInput, options?: IngestionOptions): Promise<IngestionResult> {
    const check = isSafePublicUrl(input.url);
    if (!check.safe) {
      throw createIngestionError(
        'SSRF_BLOCKED',
        `Security restriction: ${check.reason}`,
        `SSRF security violation attempting to fetch ${input.url}`,
        false,
        'SSRF_VALIDATION'
      );
    }

    let rawHtml = '';
    try {
      const response = await fetch(input.url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      rawHtml = await response.text();
    } catch (fetchErr: any) {
      // If browser CORS prevents direct fetch, explain clearly rather than silently hallucinating!
      throw createIngestionError(
        'SOURCE_UNAVAILABLE',
        `Could not fetch content from ${input.url}. The server may have restricted cross-origin access (CORS) or be unreachable.`,
        `Fetch failed: ${fetchErr.message}`,
        false,
        'FETCH_URL'
      );
    }

    const { title, text } = extractCleanArticleText(rawHtml);
    if (!text || text.length < 100) {
      throw createIngestionError(
        'EXTRACTION_FAILED',
        'Insufficient readable content could be extracted from this webpage. It may require JavaScript rendering, login, or contain mostly images.',
        `Cleaned text length was ${text.length} chars`,
        false,
        'CONTENT_EXTRACTION'
      );
    }

    const count = options?.requestedCount || 6;
    const prompt = `
Source Material: Webpage Content
Page Title: "${title}"
Source URL: "${input.url}"

Extracted Content:
"""
${text.slice(0, 20000)}
"""

Task:
Construct exactly ${count} rigorous competitive examination questions based strictly on the factual principles, definitions, and technical claims present in this content.
Preserve any mathematical notations in LaTeX $...$.

Return ONLY a valid JSON object:
{
  "questions": [
    {
      "questionNumber": 1,
      "questionType": "MCQ",
      "questionText": "Question stem here...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "topic": "${title}",
      "explanation": "Detailed explanation...",
      "citation": {
        "sourceExactText": "Exact quote or phrase from the article"
      }
    }
  ]
}
`;

    const active = aiProviderService.getActiveAdapter();
    if (!active) {
      throw createIngestionError(
        'AI_PROVIDER_ERROR',
        'No AI provider is configured. Please configure an AI Provider in Settings.',
        'Active adapter missing',
        false,
        'PROVIDER_SELECTION'
      );
    }

    const rawResponse = await active.adapter.generateQuestions(prompt, active.connection, { count });
    const questions = parseCanonicalQuestionsJson(JSON.stringify({ questions: rawResponse }), {
      sourceType: 'WebUrl',
      sourceUrl: input.url,
      sourceFile: title,
    });

    const evaluations: QualityGateEvaluation[] = [];
    let verifiedCount = 0;
    let partialCount = 0;
    let reviewCount = 0;
    let failedCount = 0;

    questions.forEach((q, index) => {
      q.questionNumber = index + 1;
      const evalRes = evaluateQualityGate(q);
      evaluations.push(evalRes);

      q.verificationStatus = evalRes.status;
      q.verificationReasons = evalRes.reasons;
      q.confidence = evalRes.confidence;

      if (evalRes.status === 'VERIFIED') verifiedCount++;
      else if (evalRes.status === 'PARTIAL') partialCount++;
      else if (evalRes.status === 'REVIEW_REQUIRED') reviewCount++;
      else if (evalRes.status === 'FAILED') failedCount++;
    });

    return {
      success: questions.length > 0,
      sourceType: 'WebUrl',
      sourceTitle: `${title} - Mock Exam`,
      questions,
      legacyQuestions: questions.map(toLegacyQuestion),
      qualityReport: {
        total: questions.length,
        verified: verifiedCount,
        partial: partialCount,
        reviewRequired: reviewCount,
        failed: failedCount,
        evaluations,
      },
    };
  }
}
