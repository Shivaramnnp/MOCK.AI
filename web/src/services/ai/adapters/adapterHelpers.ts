import { Question } from '../../../types';
import {
  CanonicalQuestion,
  CanonicalOption,
  CanonicalContentBlock,
  CanonicalAnswer,
  QuestionType,
  CanonicalProvenance,
} from '../../../types/canonicalQuestion';
import { evaluateQualityGate } from '../../ingestion/qualityGate';
import { toLegacyQuestion, toCanonicalContentBlock } from '../../ingestion/questionMigrator';

export const EXTRACTION_SYSTEM_PROMPT = `
You are a precise exam question extractor and creator for competitive exams (GATE, SSC, Technical Exams).
Analyze the provided content and generate high-quality exam questions with faithful fidelity to the source.

Return ONLY a valid JSON object with this exact structure:
{
  "questions": [
    {
      "questionNumber": 1,
      "questionType": "MCQ",
      "questionText": "Complete question stem here (use LaTeX $...$ for inline or $$...$$ for display math)",
      "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
      "correctAnswerIndex": 0,
      "topic": "Topic Name",
      "explanation": "Detailed step-by-step reasoning",
      "contentBlocks": [
        { "type": "text", "content": "..." }
      ]
    }
  ]
}

STRICT RULES:
- Question types supported: MCQ (single choice), MSQ (multiple choice), NAT (numerical answer).
- For MCQ: correctAnswerIndex is zero-based: 0=A, 1=B, 2=C, 3=D.
- For MSQ: provide correctAnswerIndices: [0, 2] or correctAnswerSet: ["A", "C"].
- For NAT: provide answerRange: { "min": 10.5, "max": 11.5 }. Options array should be empty.
- Never truncate or omit options that exist in the source material.
- If math formulas exist, format them faithfully with LaTeX $...$ or $$...$$.
- Focus on conceptual rigor, correct figures, and complete statements.
- Do NOT include markdown code blocks like \`\`\`json outside the JSON object.
`;

/**
 * Extracts and cleans JSON from raw LLM text, handling markdown fences,
 * leading/trailing chatter, or partial formatting.
 */
export function extractJsonPayload(raw: string): any {
  if (!raw) return { questions: [] };

  let cleaned = raw.trim();

  // Strip markdown fences
  if (cleaned.includes('```')) {
    cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  }

  // Find start and end of JSON object/array
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIndex = 0;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIndex = firstBrace;
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace !== -1) {
      cleaned = cleaned.substring(startIndex, lastBrace + 1);
    }
  } else if (firstBracket !== -1) {
    startIndex = firstBracket;
    const lastBracket = cleaned.lastIndexOf(']');
    if (lastBracket !== -1) {
      cleaned = cleaned.substring(startIndex, lastBracket + 1);
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // If trailing commas exist, attempt light cleanup
    try {
      const sanitized = cleaned.replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(sanitized);
    } catch {
      throw new Error(`Failed to parse AI response as JSON: ${(err as Error).message}`);
    }
  }
}

/**
 * Parses raw LLM text into canonical question models with strict quality gate evaluation.
 * Never silences corruption:
 * - Does NOT pad missing options with fake dummy text.
 * - Does NOT slice away valid options beyond 4.
 * - Does NOT coerce invalid or missing answers to Option A.
 * - Calculates honest verificationStatus and confidence.
 */
export function parseCanonicalQuestionsJson(
  raw: string,
  sourceMeta?: Partial<CanonicalProvenance>
): CanonicalQuestion[] {
  const parsed = extractJsonPayload(raw);
  const list: any[] = Array.isArray(parsed) ? parsed : parsed.questions || [];

  return list.map((q: any, idx: number) => {
    const qNum = typeof q.questionNumber === 'number' ? q.questionNumber : idx + 1;
    const rawStem = (q.questionText || q.stem || q.question || '').trim();

    // Determine QuestionType
    let qType: QuestionType = 'MCQ';
    if (q.questionType) {
      const upper = String(q.questionType).toUpperCase();
      if (upper === 'MSQ' || upper === 'NAT' || upper === 'TRUE_FALSE' || upper === 'DESCRIPTIVE') {
        qType = upper;
      }
    } else if (q.answerRange || (q.correctAnswer && typeof q.correctAnswer === 'number')) {
      qType = 'NAT';
    } else if (Array.isArray(q.correctAnswerIndices) || Array.isArray(q.correctAnswerSet)) {
      qType = 'MSQ';
    }

    // Parse options without artificial padding or deletion
    const rawOptions: any[] = Array.isArray(q.options) ? q.options : [];
    const options: CanonicalOption[] = rawOptions.map((opt: any, optIdx: number) => {
      const optId = String.fromCharCode(65 + optIdx);
      if (typeof opt === 'string') {
        return { id: optId, text: opt.trim() };
      }
      return {
        id: opt.id || optId,
        text: (opt.text || '').trim(),
        imageUrl: opt.imageUrl || null,
        contentBlocks: Array.isArray(opt.contentBlocks) ? opt.contentBlocks.map(toCanonicalContentBlock) : undefined,
      };
    });

    // Parse answer faithfully - NEVER default to 0 / Option A if missing!
    const answer: CanonicalAnswer = {
      questionType: qType,
    };

    if (qType === 'MCQ') {
      const rawAnsIdx = q.correctAnswerIndex;
      if (typeof rawAnsIdx === 'number' && !isNaN(rawAnsIdx) && rawAnsIdx >= 0 && rawAnsIdx < options.length) {
        answer.correctOptionIndex = rawAnsIdx;
        answer.correctOptionId = options[rawAnsIdx]?.id;
      } else if (typeof q.correctAnswer === 'string' && q.correctAnswer.trim()) {
        const found = options.findIndex((o) => o.id.toUpperCase() === q.correctAnswer.trim().toUpperCase());
        if (found >= 0) {
          answer.correctOptionIndex = found;
          answer.correctOptionId = options[found].id;
        }
      }
      // If neither is valid, answer.correctOptionIndex remains undefined so QualityGate flags it!
    } else if (qType === 'MSQ') {
      if (Array.isArray(q.correctAnswerIndices)) {
        const validIndices = q.correctAnswerIndices.filter((n: any) => typeof n === 'number' && n >= 0 && n < options.length);
        answer.correctOptionIndices = validIndices;
        answer.correctOptionIds = validIndices.map((i: number) => options[i]?.id).filter(Boolean);
      } else if (Array.isArray(q.correctAnswerSet)) {
        answer.correctOptionIds = q.correctAnswerSet.map(String);
      }
    } else if (qType === 'NAT') {
      if (q.answerRange && typeof q.answerRange.min === 'number' && typeof q.answerRange.max === 'number') {
        answer.natRange = { min: q.answerRange.min, max: q.answerRange.max };
      } else if (typeof q.correctAnswer === 'number') {
        answer.natValue = q.correctAnswer;
        answer.natRange = { min: q.correctAnswer, max: q.correctAnswer };
      }
    }

    // Build content blocks
    let contentBlocks: CanonicalContentBlock[] = [];
    if (Array.isArray(q.contentBlocks) && q.contentBlocks.length > 0) {
      contentBlocks = q.contentBlocks.map(toCanonicalContentBlock);
    } else {
      contentBlocks = [
        {
          type: 'text',
          content: rawStem,
        },
      ];
    }

    const provenance: CanonicalProvenance = {
      sourceType: sourceMeta?.sourceType || 'Topic',
      sourceId: sourceMeta?.sourceId || 'llm-extraction',
      sourcePage: q.citation?.pageNumber ?? sourceMeta?.sourcePage,
      sourceTimestamp: q.citation?.youtubeTimestamp ?? sourceMeta?.sourceTimestamp,
      sourceExactText: q.citation?.sourceExactText ?? sourceMeta?.sourceExactText,
      extractionTimestamp: Date.now(),
      ...sourceMeta,
    };

    const canonical: CanonicalQuestion = {
      questionId: q.id || `q-${Date.now()}-${idx}`,
      sourceId: provenance.sourceId || 'user-source',
      sourceType: provenance.sourceType,
      questionNumber: qNum,
      sectionId: q.sectionId,
      sectionName: q.sectionName,
      questionText: rawStem,
      contentBlocks,
      questionType: qType,
      options,
      answer,
      scoring: {
        marks: typeof q.marks === 'number' && q.marks > 0 ? q.marks : 1,
        negativeMarks: typeof q.negativeMarks === 'number' && q.negativeMarks >= 0 ? q.negativeMarks : 0,
        scoringRule: qType === 'MSQ' ? 'GATE_MSQ' : qType === 'NAT' ? 'GATE_NAT' : 'STANDARD',
      },
      provenance,
      assets: [],
      diagramUrl: q.diagramUrl || null,
      explanation: q.explanation || '',
      topic: q.topic || 'General',
      difficulty: q.difficulty || 'MEDIUM',
      verificationStatus: 'UNVERIFIED',
      verificationReasons: [],
      confidence: {
        extraction: 0.85,
        structure: 0.85,
        answer: 0.85,
        asset: 1.0,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Evaluate Quality Gate to produce true verification status and confidence
    const evalResult = evaluateQualityGate(canonical);
    canonical.verificationStatus = evalResult.status;
    canonical.verificationReasons = evalResult.reasons;
    canonical.confidence = evalResult.confidence;

    return canonical;
  });
}

/**
 * Parses raw JSON string into the legacy `Question[]` model, backed by CanonicalQuestion
 * validation and zero silent corruption.
 */
export function parseQuestionsJson(raw: string): Question[] {
  const canonicalList = parseCanonicalQuestionsJson(raw);
  return canonicalList.map(toLegacyQuestion);
}

/**
 * Sanitizes errors so that API keys, auth headers, or raw sensitive tokens are NEVER leaked.
 */
export function sanitizeErrorMessage(err: unknown, keyToRedact?: string): string {
  if (!err) return 'Unknown connection or inference error';
  let message = typeof err === 'object' && 'message' in (err as any) ? String((err as any).message) : String(err);

  // Redact any occurrences of the key
  if (keyToRedact && keyToRedact.length > 5) {
    message = message.split(keyToRedact).join('[REDACTED_API_KEY]');
  }

  // Redact potential API keys (patterns like AIzaSy..., sk-..., gsk_...)
  message = message.replace(/(AIzaSy[a-zA-Z0-9_-]{20,})/gi, '[REDACTED_GEMINI_KEY]');
  message = message.replace(/(sk-[a-zA-Z0-9_-]{20,})/gi, '[REDACTED_OPENAI_KEY]');
  message = message.replace(/(gsk_[a-zA-Z0-9_-]{20,})/gi, '[REDACTED_GROQ_KEY]');

  if (message.includes('401') || message.includes('Unauthorized') || message.includes('Invalid API key')) {
    return 'Authentication failed: Invalid API key or unauthorized access.';
  }
  if (message.includes('429') || message.includes('quota') || message.includes('Rate limit')) {
    return 'Rate limit or quota exceeded: Provider account has reached its rate limit.';
  }
  if (message.includes('404') || message.includes('model_not_found') || message.includes('not found')) {
    return 'Model not found: The selected model is unavailable or not supported by your API key.';
  }
  if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('ECONNREFUSED')) {
    return 'Network connection failed: Unable to reach provider endpoint. Check internet or custom URL.';
  }

  return message.slice(0, 200);
}
