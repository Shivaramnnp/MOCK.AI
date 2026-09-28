import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { aiProviderService } from '../../ai/aiProviderService';
import { parseCanonicalQuestionsJson } from '../../ai/adapters/adapterHelpers';
import { toLegacyQuestion } from '../questionMigrator';
import { evaluateQualityGate, QualityGateEvaluation } from '../qualityGate';
import { detectDuplicates } from '../duplicateDetector';
import { createIngestionError } from '../../../types/ingestionErrors';

export class TopicSourceAdapter implements SourceAdapter<{ topic: string; difficulty?: string; count?: number }> {
  readonly sourceType = 'Topic';

  async validateInput(input: { topic: string; difficulty?: string; count?: number }): Promise<{ valid: boolean; error?: string }> {
    if (!input || !input.topic || typeof input.topic !== 'string' || !input.topic.trim()) {
      return { valid: false, error: 'A valid non-empty topic name is required.' };
    }
    const count = input.count ?? 8;
    if (count < 1 || count > 100) {
      return { valid: false, error: 'Question count must be between 1 and 100.' };
    }
    return { valid: true };
  }

  async process(
    input: { topic: string; difficulty?: string; count?: number },
    options?: IngestionOptions
  ): Promise<IngestionResult> {
    const topic = input.topic.trim();
    const difficulty = (options?.difficulty || input.difficulty || 'MEDIUM').toUpperCase() as any;
    const requestedCount = options?.requestedCount || input.count || 8;

    const buildPrompt = (targetCount: number, existingQuestions: CanonicalQuestion[] = []) => {
      const avoidNotice = existingQuestions.length > 0
        ? `\nDO NOT DUPLICATE these existing questions already generated:\n${existingQuestions.map((q) => `- ${q.questionText}`).join('\n')}`
        : '';

      return `
You are an expert exam designer and psychometrician.
Generate exactly ${targetCount} authoritative, rigorous exam questions testing the syllabus for:
Topic: "${topic}"
Target Cognitive Difficulty: ${difficulty}

Pedagogical Requirements:
- Mix of Bloom's Taxonomy cognitive levels (Application, Analysis, Evaluation, Synthesis).
- Include appropriate question types: MCQ (multiple choice), and where mathematically appropriate, MSQ (multiple select) or NAT (numerical answer).
- If mathematical expressions or scientific chemical formulas are involved, format them strictly in LaTeX $...$ or $$...$$.
- Every question must include a comprehensive step-by-step explanatory derivation.
${avoidNotice}

Return ONLY a valid JSON object matching this exact schema:
{
  "questions": [
    {
      "questionNumber": 1,
      "questionType": "MCQ",
      "questionText": "Question stem here...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "topic": "${topic}",
      "explanation": "Detailed step-by-step explanation..."
    }
  ]
}
`;
    };

    let questions: CanonicalQuestion[] = [];
    let warnings: string[] = [];

    const active = aiProviderService.getActiveAdapter();
    if (!active) {
      throw createIngestionError(
        'AI_PROVIDER_ERROR',
        'No AI provider is configured. Please configure an AI Provider (Gemini, OpenAI, Groq) in Settings.',
        'Active AIProviderAdapter is null or unconfigured in AIProviderService',
        false,
        'PROVIDER_SELECTION'
      );
    }

    try {
      // 1. Initial generation pass
      const initialPrompt = buildPrompt(requestedCount);
      const rawResponse = await active.adapter.generateQuestions(
        initialPrompt,
        active.connection,
        { count: requestedCount, difficulty }
      );

      // Convert adapter questions to canonical
      const jsonRaw = JSON.stringify({ questions: rawResponse });
      questions = parseCanonicalQuestionsJson(jsonRaw, {
        sourceType: 'Topic',
        sourceId: `topic-${encodeURIComponent(topic)}`,
      });

      // 2. Question count validation & targeted retry if model under-generated
      if (questions.length < requestedCount) {
        const missingCount = requestedCount - questions.length;
        warnings.push(`AI provider initially returned ${questions.length}/${requestedCount} questions. Initiating targeted supplement pass for ${missingCount} questions.`);

        try {
          const retryPrompt = buildPrompt(missingCount, questions);
          const retryRaw = await active.adapter.generateQuestions(
            retryPrompt,
            active.connection,
            { count: missingCount, difficulty }
          );
          const supplement = parseCanonicalQuestionsJson(JSON.stringify({ questions: retryRaw }), {
            sourceType: 'Topic',
            sourceId: `topic-${encodeURIComponent(topic)}`,
          });

          // Offset question numbers
          supplement.forEach((q, idx) => {
            q.questionNumber = questions.length + idx + 1;
            questions.push(q);
          });
        } catch (retryErr) {
          warnings.push(`Targeted supplement pass failed: ${(retryErr as Error).message}`);
        }
      }

      // 3. Duplicate check across the batch
      const dupReport = detectDuplicates(questions);
      if (dupReport.hasDuplicates) {
        warnings.push(`Detected ${dupReport.matches.length} duplicate or near-duplicate questions in the generated batch.`);
        for (const match of dupReport.matches) {
          const dupQ = questions.find((q) => q.questionId === match.questionId2);
          if (dupQ) {
            dupQ.verificationStatus = 'REVIEW_REQUIRED';
            dupQ.verificationReasons.push(match.reason);
          }
        }
      }

      // 4. Run Quality Gate evaluation on every question
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
        sourceType: 'Topic',
        sourceTitle: `${topic} Mock Exam`,
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
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (err: any) {
      if (err.name === 'IngestionError') throw err;
      throw createIngestionError(
        'AI_PROVIDER_ERROR',
        `Failed to generate questions for topic "${topic}": ${err.message || 'Unknown provider error'}`,
        err.stack || String(err),
        true,
        'TOPIC_GENERATION'
      );
    }
  }
}
