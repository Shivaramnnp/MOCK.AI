/**
 * Streaming & Chunked Versioned JSON Question Importer
 * Mock.AI Production Ingestion Engine - Prompt 10/10
 *
 * Implements high-throughput, chunked validation (100–500 records per batch)
 * with non-blocking event-loop yielding, duplicate resolution, asset checking,
 * and comprehensive progress tracking.
 */

import {
  JsonImportOptions,
  JsonImportReport,
  JsonValidationError,
  JsonQuestionSetDocument,
  VersionedQuestionV1,
  ImportChunkProgress,
} from './types';
import { jsonSchemaValidator } from './jsonSchemaValidator';
import { jsonMigrationService } from './jsonMigrationService';
import { JsonDeduplicator } from './jsonDeduplicator';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';

export class JsonStreamingImporter {
  /**
   * Fast, single-pass SHA-256 or Fowler–Noll–Vo hash for payload identification.
   */
  async hashSource(text: string): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
      try {
        const msgUint8 = new TextEncoder().encode(text.slice(0, 500000)); // Sample up to 500KB for speed
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch {
        // Fallback below
      }
    }
    // Fast non-cryptographic FNV-1a hash fallback
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length && i < 100000; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return 'fnv_' + (h >>> 0).toString(16);
  }

  /**
   * Imports a JSON string payload with chunked streaming and strict validation.
   */
  async importJsonString(
    jsonText: string,
    options: JsonImportOptions = {}
  ): Promise<JsonImportReport> {
    const startTime = Date.now();
    const batchSize = Math.max(10, Math.min(options.batchSize || 250, 1000));
    const duplicateMode = options.duplicateMode || 'REJECT_DUPLICATES';
    const sourceHash = await this.hashSource(jsonText);

    // 1. Safe JSON Parse
    let rawParsed: any;
    try {
      rawParsed = JSON.parse(jsonText);
    } catch (err: any) {
      return {
        totalRecords: 0,
        valid: 0,
        invalid: 1,
        duplicates: 0,
        assetsMissing: 0,
        warnings: 0,
        imported: 0,
        skipped: 0,
        failed: 1,
        durationMs: Date.now() - startTime,
        sourceHash,
        detectedSchema: 'unknown',
        errors: [
          {
            recordIndex: -1,
            field: 'jsonText',
            code: 'JSON_SYNTAX_ERROR',
            message: `Malformed JSON: ${err.message}`,
            severity: 'FATAL',
          },
        ],
        questions: [],
      };
    }

    // 2. Untrusted Payload Sanitization (Prototype pollution defense)
    const sanitizedDoc = jsonSchemaValidator.sanitizePayload(rawParsed);

    // 3. Schema Detection & Migration
    const migrationResult = jsonMigrationService.migrateToCurrent(sanitizedDoc);
    const doc: JsonQuestionSetDocument = migrationResult.document;

    // 4. Document Envelope Validation
    const envelopeCheck = jsonSchemaValidator.validateDocumentEnvelope(doc);
    if (!envelopeCheck.valid) {
      return {
        totalRecords: doc.questions?.length || 0,
        valid: 0,
        invalid: envelopeCheck.errors.length,
        duplicates: 0,
        assetsMissing: 0,
        warnings: 0,
        imported: 0,
        skipped: 0,
        failed: envelopeCheck.errors.length,
        durationMs: Date.now() - startTime,
        sourceHash,
        detectedSchema: migrationResult.originalVersion,
        errors: envelopeCheck.errors,
        questions: [],
      };
    }

    const allQuestions = doc.questions;
    const totalRecords = allQuestions.length;
    const deduplicator = new JsonDeduplicator(options.knownQuestionIds);

    const importedQuestions: CanonicalQuestion[] = [];
    const allErrors: JsonValidationError[] = [];
    let validCount = 0;
    let invalidCount = 0;
    let duplicateCount = 0;
    let assetMissingCount = 0;
    let warningCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const totalBatches = Math.ceil(totalRecords / batchSize);

    // 5. Chunked Batch Processing Loop
    for (let b = 0; b < totalBatches; b++) {
      const startIdx = b * batchSize;
      const endIdx = Math.min(startIdx + batchSize, totalRecords);
      const batch = allQuestions.slice(startIdx, endIdx);

      for (let i = 0; i < batch.length; i++) {
        const recordIndex = startIdx + i;
        const rawQ: VersionedQuestionV1 = batch[i];

        // A. Strict Record Validation (No Silent Defaults)
        const valRes = jsonSchemaValidator.validateQuestionRecord(rawQ, recordIndex, options);
        if (valRes.assetMissing) {
          assetMissingCount++;
        }
        if (valRes.warnings.length > 0) {
          warningCount += valRes.warnings.length;
          allErrors.push(...valRes.warnings);
        }

        if (valRes.errors.length > 0) {
          invalidCount++;
          failedCount++;
          allErrors.push(...valRes.errors);
          continue; // Skip invalid question
        }

        validCount++;

        // B. Duplicate Detection
        const dupDecision = deduplicator.evaluateDuplicate(rawQ, duplicateMode);
        if (dupDecision.isDuplicate) {
          duplicateCount++;
          if (dupDecision.action === 'SKIP') {
            skippedCount++;
            continue;
          } else if (dupDecision.action === 'REJECT') {
            failedCount++;
            allErrors.push({
              recordIndex,
              questionId: rawQ.questionId,
              field: 'questionId',
              code: 'DUPLICATE_REJECTED',
              message: dupDecision.reason || 'Duplicate question rejected.',
              severity: 'FATAL',
            });
            continue;
          }
          // If action is UPDATE (UPSERT), fall through and replace/add
        }

        // C. Transform to CanonicalQuestion (Preserving all fields)
        const canonical: CanonicalQuestion = {
          questionId: rawQ.questionId,
          sourceId: doc.metadata.source || 'json_import',
          sourceType: 'Json',
          questionNumber: rawQ.questionNumber,
          sectionId: rawQ.sectionId,
          sectionName: rawQ.sectionName || doc.metadata.section,
          questionText: rawQ.questionText,
          contentBlocks: rawQ.contentBlocks || [
            {
              type: 'text',
              content: rawQ.questionText,
            },
          ],
          questionType: rawQ.questionType,
          options: rawQ.options || [],
          answer: rawQ.answer,
          scoring: rawQ.scoring,
          provenance: rawQ.provenance || {
            sourceType: 'Json',
            sourceFile: doc.metadata.sourceFile || doc.metadata.title,
            jsonPointer: `/questions/${rawQ.questionNumber}`,
          },
          assets: rawQ.assets || [],
          diagramUrl: rawQ.diagramUrl || rawQ.assets?.[0]?.assetUrl || null,
          explanation: rawQ.explanation || '',
          topic: rawQ.topic || doc.metadata.subject,
          subtopic: rawQ.subtopic,
          difficulty: rawQ.difficulty || 'MEDIUM',
          verificationStatus: 'UNVERIFIED', // NEVER mark imported questions VERIFIED!
          verificationReasons: rawQ.verificationReasons || ['Imported via JSON engine'],
          confidence: {
            extraction: 1.0,
            structure: 1.0,
            answer: 1.0,
            asset: valRes.assetMissing ? 0.5 : 1.0,
          },
          createdAt: rawQ.createdAt || Date.now(),
          updatedAt: Date.now(),
        };

        importedQuestions.push(canonical);
      }

      // Progress reporting
      if (options.onProgress) {
        const progress: ImportChunkProgress = {
          totalRecords,
          processedRecords: endIdx,
          currentBatch: b + 1,
          totalBatches,
          percent: Math.round((endIdx / totalRecords) * 100),
        };
        options.onProgress(progress);
      }

      // Non-blocking yield for large datasets (> 1000 items)
      if (totalRecords > 1000 && b < totalBatches - 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    return {
      totalRecords,
      valid: validCount,
      invalid: invalidCount,
      duplicates: duplicateCount,
      assetsMissing: assetMissingCount,
      warnings: warningCount,
      imported: importedQuestions.length,
      skipped: skippedCount,
      failed: failedCount,
      durationMs: Date.now() - startTime,
      sourceHash,
      detectedSchema: migrationResult.originalVersion,
      errors: allErrors,
      questions: importedQuestions,
    };
  }
}

export const jsonStreamingImporter = new JsonStreamingImporter();
