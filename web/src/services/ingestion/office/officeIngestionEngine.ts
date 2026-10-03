import { IngestionResult } from '../adapters/SourceAdapter';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { toLegacyQuestion } from '../questionMigrator';
import { evaluateQualityGate } from '../qualityGate';
import { createIngestionError } from '../../../types/ingestionErrors';

import {
  DocumentIR,
  OfficeIngestionOptions,
  OfficeJobProgress,
  OfficeDocumentType,
} from './types';
import { validateOfficeBinary } from './officeSecurity';
import { parseDocxDocument } from './docxParser';
import { parsePptxDocument } from './pptxParser';
import { segmentDocumentQuestions } from './documentQuestionSegmenter';

// In-memory & local-storage cache registry for office document results
const OFFICE_CACHE_PREFIX = 'mockai_office_cache_';

/**
 * Computes deterministic SHA-256 hash of an Office document buffer.
 */
export async function computeOfficeHash(data: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 5) - hash + data[i];
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * Master Production Office (DOCX / PPTX) Ingestion Engine.
 * Executes:
 * 1. Security & archive validation (zip bomb, macro, XXE checks)
 * 2. SHA-256 content deduplication
 * 3. OpenXML parsing into Document IR (paragraphs, tables, OMML equations, embedded images)
 * 4. Contextual & multi-pattern question segmentation
 * 5. Quality gate evaluation & CanonicalQuestion synthesis.
 */
export async function ingestOfficeDocument(
  data: Uint8Array | ArrayBuffer | Blob,
  fileName: string = 'Document.docx',
  userId?: string,
  options?: OfficeIngestionOptions
): Promise<IngestionResult> {
  // 1. Resolve binary data
  let binaryData: Uint8Array;
  if (data instanceof Blob) {
    const ab = await data.arrayBuffer();
    binaryData = new Uint8Array(ab);
  } else if (data instanceof ArrayBuffer) {
    binaryData = new Uint8Array(data.slice(0));
  } else {
    binaryData = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }

  // 2. Security & format validation
  options?.onProgress?.({
    stage: 'VALIDATING',
    percent: 10,
    message: `Validating ${fileName}...`,
  });

  const validation = await validateOfficeBinary(binaryData, fileName);
  if (!validation.valid) {
    throw createIngestionError(
      'INVALID_FILE',
      validation.error || `File "${fileName}" failed security validation.`,
      `Validation error: ${validation.error}`,
      false,
      'OFFICE_VALIDATION'
    );
  }

  const detectedType = validation.detectedType || (fileName.toLowerCase().endsWith('.pptx') ? 'PPTX' : 'DOCX');

  // 3. Deduplication Check
  const contentHash = await computeOfficeHash(binaryData);

  if (!options?.skipDeduplication && typeof localStorage !== 'undefined') {
    try {
      const cached = localStorage.getItem(`${OFFICE_CACHE_PREFIX}${contentHash}`);
      if (cached) {
        const cachedQuestions: CanonicalQuestion[] = JSON.parse(cached);
        if (cachedQuestions.length > 0) {
          options?.onProgress?.({
            stage: 'COMPLETED',
            percent: 100,
            message: 'Loaded instantly from deduplication cache.',
          });

          const evaluations = cachedQuestions.map((q) => evaluateQualityGate(q));
          return {
            success: true,
            sourceType: 'Docx',
            sourceTitle: fileName.replace(/\.[^/.]+$/, ''),
            questions: cachedQuestions,
            legacyQuestions: cachedQuestions.map((q) => toLegacyQuestion(q)),
            qualityReport: {
              total: cachedQuestions.length,
              verified: evaluations.filter((e) => e.status === 'VERIFIED').length,
              partial: evaluations.filter((e) => e.status === 'PARTIAL').length,
              reviewRequired: evaluations.filter((e) => e.status === 'REVIEW_REQUIRED').length,
              failed: evaluations.filter((e) => e.status === 'FAILED').length,
              evaluations,
            },
            warnings: ['Retrieved from cache - zero re-extraction overhead.'],
          };
        }
      }
    } catch {
      // Ignore cache retrieval failure
    }
  }

  // 4. Parse Document IR
  options?.onProgress?.({
    stage: 'PARSING_IR',
    percent: 30,
    message: `Extracting ${detectedType} structure, tables, equations, and visual assets...`,
  });

  let docIR: DocumentIR;
  if (detectedType === 'DOCX') {
    docIR = await parseDocxDocument(binaryData, fileName, contentHash);
  } else {
    docIR = await parsePptxDocument(binaryData, fileName, contentHash);
  }

  // 5. Question Segmentation
  options?.onProgress?.({
    stage: 'SEGMENTING_QUESTIONS',
    percent: 70,
    totalUnits: docIR.metadata.totalUnits,
    message: `Segmenting questions from ${docIR.metadata.totalUnits} ${docIR.metadata.unitType}s...`,
  });

  const canonicalQuestions = segmentDocumentQuestions(docIR, options?.targetExamType || 'GATE');

  // 6. Quality Gate Evaluation
  options?.onProgress?.({
    stage: 'VERIFYING',
    percent: 90,
    questionsFound: canonicalQuestions.length,
    message: `Evaluating quality gate across ${canonicalQuestions.length} questions...`,
  });

  const evaluations = canonicalQuestions.map((q) => evaluateQualityGate(q));
  const verified = evaluations.filter((e) => e.status === 'VERIFIED').length;
  const partial = evaluations.filter((e) => e.status === 'PARTIAL').length;
  const reviewRequired = evaluations.filter((e) => e.status === 'REVIEW_REQUIRED').length;
  const failed = evaluations.filter((e) => e.status === 'FAILED').length;

  // 7. Save to cache for future fast-path lookups
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(`${OFFICE_CACHE_PREFIX}${contentHash}`, JSON.stringify(canonicalQuestions));
    } catch {
      // Storage quota safe
    }
  }

  options?.onProgress?.({
    stage: 'COMPLETED',
    percent: 100,
    questionsFound: canonicalQuestions.length,
    message: `Ingestion complete: ${canonicalQuestions.length} questions extracted.`,
  });

  const warnings: string[] = [...(validation.warnings || [])];
  if (canonicalQuestions.length === 0) {
    warnings.push('Zero distinct question boundaries detected. Document structure preserved in Document IR.');
  }

  return {
    success: true,
    sourceType: 'Docx',
    sourceTitle: fileName.replace(/\.[^/.]+$/, ''),
    questions: canonicalQuestions,
    legacyQuestions: canonicalQuestions.map((q) => toLegacyQuestion(q)),
    qualityReport: {
      total: canonicalQuestions.length,
      verified,
      partial,
      reviewRequired,
      failed,
      evaluations,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
