/**
 * JSON Schema Version Migration Service
 * Mock.AI Production Ingestion Engine - Prompt 10/10
 *
 * Safely migrates legacy and previous-generation JSON question formats
 * into the canonical `mockai.question-set/v1` schema without losing metadata
 * or corrupting question structures.
 */

import {
  CURRENT_SCHEMA_VERSION,
  JsonQuestionSetDocument,
  VersionedQuestionV1,
  SupportedSchemaVersion,
} from './types';
import { QuestionType } from '../../../types/canonicalQuestion';

export interface MigrationResult {
  document: JsonQuestionSetDocument;
  originalVersion: string;
  targetVersion: string;
  migrated: boolean;
  warnings: string[];
}

export class JsonMigrationService {
  /**
   * Detects the schema version of an unvalidated JSON object.
   */
  detectSchemaVersion(raw: any): SupportedSchemaVersion {
    if (!raw || typeof raw !== 'object') {
      return 'legacy.mockai/v0';
    }

    if (typeof raw.$schema === 'string') {
      if (raw.$schema.includes('mockai.question-set/v1')) {
        return 'mockai.question-set/v1';
      }
      if (raw.$schema.includes('mockai.question-set/v2')) {
        return 'mockai.question-set/v2-preview';
      }
    }

    // Check version field
    if (raw.version === '1.0.0' && Array.isArray(raw.questions)) {
      return 'mockai.question-set/v1';
    }

    // Otherwise treat as legacy format
    return 'legacy.mockai/v0';
  }

  /**
   * Migrates any supported JSON question-set structure to CURRENT_SCHEMA_VERSION.
   */
  migrateToCurrent(raw: any): MigrationResult {
    const originalVersion = this.detectSchemaVersion(raw);
    const warnings: string[] = [];

    if (originalVersion === CURRENT_SCHEMA_VERSION) {
      // Already canonical v1
      return {
        document: raw as JsonQuestionSetDocument,
        originalVersion,
        targetVersion: CURRENT_SCHEMA_VERSION,
        migrated: false,
        warnings,
      };
    }

    // Handle Legacy (v0 / flat array / legacy Mock.AI export)
    warnings.push(`Migrated incoming dataset from '${originalVersion}' to '${CURRENT_SCHEMA_VERSION}'.`);

    const rawList: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw.questions)
      ? raw.questions
      : [];

    const title =
      raw?.metadata?.title ||
      raw?.title ||
      raw?.examName ||
      'Imported Question Set';

    const migratedQuestions: VersionedQuestionV1[] = rawList.map((q, idx) => {
      const qNum = typeof q.questionNumber === 'number' ? q.questionNumber : idx + 1;
      const qId = q.questionId || q.id || `migrated-q-${qNum}-${Date.now().toString(36)}`;
      const qText = q.questionText || q.question || q.text || q.prompt || '';
      const qType: QuestionType = this.normalizeQuestionType(q.questionType || q.type);

      // Options migration
      let options: any[] = [];
      if (Array.isArray(q.options)) {
        options = q.options.map((opt: any, optIdx: number) => {
          const id = opt?.id || String.fromCharCode(65 + optIdx);
          const text = typeof opt === 'string' ? opt : opt?.text || opt?.label || '';
          const isCorrect = typeof opt === 'object' ? !!opt.isCorrect : false;
          return { id, text, isCorrect };
        });
      }

      // Answer migration
      let answer: any = q.answer;
      if (!answer) {
        answer = { questionType: qType };
        if (qType === 'MCQ') {
          const rawIdx =
            typeof q.correctAnswerIndex === 'number'
              ? q.correctAnswerIndex
              : typeof q.correctAnswer === 'number'
              ? q.correctAnswer
              : undefined;

          if (typeof rawIdx === 'number') {
            answer.correctOptionIndex = rawIdx;
            if (options[rawIdx]) {
              answer.correctOptionId = options[rawIdx].id;
              options[rawIdx].isCorrect = true;
            }
          } else if (typeof q.correctAnswer === 'string') {
            answer.correctOptionId = q.correctAnswer;
            const foundIdx = options.findIndex((o) => o.id === q.correctAnswer);
            if (foundIdx >= 0) {
              answer.correctOptionIndex = foundIdx;
              options[foundIdx].isCorrect = true;
            }
          }
        } else if (qType === 'MSQ') {
          if (Array.isArray(q.correctAnswerSet)) {
            answer.correctOptionIds = q.correctAnswerSet;
          } else if (Array.isArray(q.correctAnswers)) {
            answer.correctOptionIds = q.correctAnswers;
          }
        } else if (qType === 'NAT') {
          if (typeof q.numericAnswer === 'number') {
            answer.natValue = q.numericAnswer;
          } else if (typeof q.natValue === 'number') {
            answer.natValue = q.natValue;
          }
        }
      }

      // Scoring migration
      const scoring = q.scoring || {
        marks: typeof q.marks === 'number' ? q.marks : 1,
        negativeMarks: typeof q.negativeMarks === 'number' ? q.negativeMarks : 0,
        partialMarking: !!q.partialMarking,
        scoringRule: q.scoringRule || 'STANDARD',
      };

      // Content blocks migration
      const contentBlocks = Array.isArray(q.contentBlocks)
        ? q.contentBlocks
        : [
            {
              type: 'text' as const,
              content: qText,
            },
          ];

      return {
        questionId: qId,
        questionNumber: qNum,
        questionText: qText,
        questionType: qType,
        contentBlocks,
        options,
        answer,
        scoring,
        sectionName: q.sectionName || q.section,
        subject: q.subject,
        topic: q.topic,
        subtopic: q.subtopic,
        explanation: q.explanation || q.solution,
        assets: q.assets || [],
        diagramUrl: q.diagramUrl || null,
        provenance: q.provenance || {
          sourceType: 'Json',
          sourceFile: title,
        },
        verificationStatus: 'UNVERIFIED', // NEVER mark migrated legacy questions VERIFIED without verification!
        verificationReasons: ['Imported via legacy JSON migration; requires quality review.'],
        createdAt: q.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
    });

    const canonicalDoc: JsonQuestionSetDocument = {
      $schema: CURRENT_SCHEMA_VERSION,
      version: '1.0.0',
      metadata: {
        title,
        totalQuestions: migratedQuestions.length,
        exportedAt: Date.now(),
        source: 'JSON_MIGRATION',
        originalSchema: originalVersion,
      },
      questions: migratedQuestions,
    };

    return {
      document: canonicalDoc,
      originalVersion,
      targetVersion: CURRENT_SCHEMA_VERSION,
      migrated: true,
      warnings,
    };
  }

  private normalizeQuestionType(rawType: any): QuestionType {
    if (!rawType) return 'MCQ';
    const s = String(rawType).trim().toUpperCase();
    if (s === 'MCQ' || s === 'MULTIPLE_CHOICE') return 'MCQ';
    if (s === 'MSQ' || s === 'MULTIPLE_SELECT') return 'MSQ';
    if (s === 'NAT' || s === 'NUMERICAL') return 'NAT';
    if (s === 'TRUE_FALSE' || s === 'TF' || s === 'BOOLEAN') return 'TRUE_FALSE';
    if (s === 'DESCRIPTIVE' || s === 'SUBJECTIVE') return 'DESCRIPTIVE';
    return 'MCQ';
  }
}

export const jsonMigrationService = new JsonMigrationService();
