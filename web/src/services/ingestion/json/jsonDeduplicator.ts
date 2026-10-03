/**
 * JSON Ingestion Deduplication Engine
 * Mock.AI Production Ingestion Engine - Prompt 10/10
 *
 * Provides high-speed (O(1)) detection of question ID collisions,
 * source duplicates, and exact/normalized content duplicates.
 * Enforces CREATE_ONLY, UPSERT, and REJECT_DUPLICATES policies.
 */

import { VersionedQuestionV1, DuplicateHandlingMode } from './types';

export interface DeduplicationDecision {
  isDuplicate: boolean;
  duplicateType?: 'ID' | 'SOURCE' | 'CONTENT';
  action: 'IMPORT' | 'SKIP' | 'UPDATE' | 'REJECT';
  reason?: string;
}

export class JsonDeduplicator {
  private seenIds = new Set<string>();
  private seenSourceKeys = new Set<string>();
  private seenContentHashes = new Set<string>();

  constructor(existingIds?: Iterable<string>) {
    if (existingIds) {
      for (const id of existingIds) {
        this.seenIds.add(id);
      }
    }
  }

  /**
   * Resets local tracking sets for a new ingestion run.
   */
  reset(existingIds?: Iterable<string>): void {
    this.seenIds.clear();
    this.seenSourceKeys.clear();
    this.seenContentHashes.clear();
    if (existingIds) {
      for (const id of existingIds) {
        this.seenIds.add(id);
      }
    }
  }

  /**
   * Evaluates a question against known ID, source, and content indices.
   */
  evaluateDuplicate(
    q: VersionedQuestionV1,
    mode: DuplicateHandlingMode = 'REJECT_DUPLICATES'
  ): DeduplicationDecision {
    const qId = q.questionId;
    const sourceKey = this.buildSourceKey(q);
    const contentHash = this.computeContentHash(q);

    // 1. ID Collision
    if (this.seenIds.has(qId)) {
      if (mode === 'CREATE_ONLY') {
        return {
          isDuplicate: true,
          duplicateType: 'ID',
          action: 'REJECT',
          reason: `Question ID "${qId}" already exists. CREATE_ONLY rejects duplicate IDs.`,
        };
      } else if (mode === 'UPSERT') {
        return {
          isDuplicate: true,
          duplicateType: 'ID',
          action: 'UPDATE',
          reason: `Question ID "${qId}" matches existing ID. UPSERT will update record.`,
        };
      } else {
        // REJECT_DUPLICATES: skip
        return {
          isDuplicate: true,
          duplicateType: 'ID',
          action: 'SKIP',
          reason: `Question ID "${qId}" is a duplicate and will be skipped.`,
        };
      }
    }

    // 2. Source Key Collision (same file + question number)
    if (sourceKey && this.seenSourceKeys.has(sourceKey)) {
      if (mode === 'CREATE_ONLY') {
        return {
          isDuplicate: true,
          duplicateType: 'SOURCE',
          action: 'REJECT',
          reason: `Duplicate source reference detected: ${sourceKey}.`,
        };
      } else {
        return {
          isDuplicate: true,
          duplicateType: 'SOURCE',
          action: 'SKIP',
          reason: `Duplicate source reference (${sourceKey}) skipped.`,
        };
      }
    }

    // 3. Content Collision (Exact normalized question text)
    if (this.seenContentHashes.has(contentHash)) {
      if (mode === 'CREATE_ONLY') {
        return {
          isDuplicate: true,
          duplicateType: 'CONTENT',
          action: 'REJECT',
          reason: `Identical question content already processed in this batch.`,
        };
      } else {
        return {
          isDuplicate: true,
          duplicateType: 'CONTENT',
          action: 'SKIP',
          reason: `Identical question content skipped.`,
        };
      }
    }

    // Not a duplicate: register and import
    this.seenIds.add(qId);
    if (sourceKey) this.seenSourceKeys.add(sourceKey);
    this.seenContentHashes.add(contentHash);

    return {
      isDuplicate: false,
      action: 'IMPORT',
    };
  }

  private buildSourceKey(q: VersionedQuestionV1): string | null {
    const prov = q.provenance;
    if (!prov?.sourceFile || typeof q.questionNumber !== 'number') {
      return null;
    }
    return `${prov.sourceFile}::q${q.questionNumber}`;
  }

  private computeContentHash(q: VersionedQuestionV1): string {
    const normText = (q.questionText || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    const optSig = (q.options || [])
      .map((o) => (o.text || '').trim().toLowerCase())
      .sort()
      .join('|');

    return `${q.questionType}:${normText}::opts[${optSig}]`;
  }
}
