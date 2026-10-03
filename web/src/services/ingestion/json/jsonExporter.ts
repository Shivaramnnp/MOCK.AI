/**
 * Versioned JSON Question Exporter
 * Mock.AI Production Ingestion Engine - Prompt 10/10
 *
 * Serializes CanonicalQuestions into standard `mockai.question-set/v1` JSON
 * with complete preservation of LaTeX formulas, tables, assets, and scoring rules.
 */

import {
  CURRENT_SCHEMA_VERSION,
  JsonQuestionSetDocument,
  QuestionSetMetadata,
  VersionedQuestionV1,
} from './types';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';

export class JsonExporter {
  /**
   * Exports an array of CanonicalQuestions into a canonical `mockai.question-set/v1` document.
   */
  exportToDocument(
    questions: CanonicalQuestion[],
    metadata?: Partial<QuestionSetMetadata>
  ): JsonQuestionSetDocument {
    const versionedQuestions: VersionedQuestionV1[] = questions.map((q, idx) => ({
      questionId: q.questionId || `q-${idx + 1}`,
      questionNumber: q.questionNumber || idx + 1,
      questionText: q.questionText,
      questionType: q.questionType,
      contentBlocks: q.contentBlocks,
      options: q.options,
      answer: q.answer,
      scoring: q.scoring,
      sectionId: q.sectionId,
      sectionName: q.sectionName,
      subject: (q as any).subject || q.sectionName,
      topic: typeof q.topic === 'string' ? q.topic : (q.topic?.primaryTopicName || undefined),
      topicMetadata: q.topicMetadata || (typeof q.topic === 'object' ? q.topic : undefined),
      subtopic: q.subtopic,
      assets: q.assets,
      provenance: q.provenance,
      explanation: q.explanation,
      difficulty: q.difficulty,
      verificationStatus: q.verificationStatus,
      verificationReasons: q.verificationReasons,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    }));

    const docMetadata: QuestionSetMetadata = {
      title: metadata?.title || 'Mock.AI Exported Question Set',
      totalQuestions: questions.length,
      exportedAt: Date.now(),
      exportedBy: metadata?.exportedBy || 'Mock.AI Engine',
      source: metadata?.source || 'MOCK_AI_CANONICAL_DB',
      ...metadata,
    };

    return {
      $schema: CURRENT_SCHEMA_VERSION,
      version: '1.0.0',
      metadata: docMetadata,
      questions: versionedQuestions,
    };
  }

  /**
   * Serializes the document to formatted JSON string.
   */
  exportToJsonString(
    questions: CanonicalQuestion[],
    metadata?: Partial<QuestionSetMetadata>,
    pretty = true
  ): string {
    const doc = this.exportToDocument(questions, metadata);
    return JSON.stringify(doc, null, pretty ? 2 : undefined);
  }
}

export const jsonExporter = new JsonExporter();
