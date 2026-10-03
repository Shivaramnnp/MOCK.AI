import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { createIngestionError } from '../../../types/ingestionErrors';
import { generateTopicExam } from '../topic/topicEngine';
import { TopicIngestionInput } from '../topic/types';

export class TopicSourceAdapter
  implements
    SourceAdapter<{
      topic: string;
      exam?: string;
      subject?: string;
      difficulty?: string;
      count?: number;
      questionTypes?: any[];
      marks?: number;
      timeLimit?: number;
    }> {
  readonly sourceType = 'Topic';

  async validateInput(input: {
    topic: string;
    exam?: string;
    subject?: string;
    difficulty?: string;
    count?: number;
  }): Promise<{ valid: boolean; error?: string }> {
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
    input: {
      topic: string;
      exam?: string;
      subject?: string;
      difficulty?: string;
      count?: number;
      questionTypes?: any[];
      marks?: number;
      timeLimit?: number;
    },
    options?: IngestionOptions
  ): Promise<IngestionResult> {
    const topic = input.topic.trim();
    const count = options?.requestedCount || input.count || 8;
    const difficulty = (options?.difficulty || input.difficulty || 'MEDIUM').toUpperCase();

    const topicInput: TopicIngestionInput = {
      topic,
      exam: input.exam || options?.targetExamType,
      subject: input.subject,
      difficulty,
      questionCount: count,
      questionTypes: input.questionTypes,
      marks: input.marks,
      timeLimit: input.timeLimit,
    };

    try {
      const topicResult = await generateTopicExam(topicInput, {
        skipCache: options?.skipDeduplication,
        onProgress: options?.onProgress
          ? (p) => {
              options.onProgress?.({
                stage: p.stage,
                percent: Math.round((p.completedQuestions / (p.totalQuestions || 1)) * 100),
                message: p.message || `Generating questions for ${topic}...`,
              });
            }
          : undefined,
      });

      return {
        success: topicResult.success,
        sourceType: 'Topic',
        sourceTitle: topicResult.sourceTitle,
        questions: topicResult.questions,
        legacyQuestions: topicResult.legacyQuestions,
        qualityReport: topicResult.qualityReport as any,
        warnings: topicResult.warnings,
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
