/**
 * Web URL Ingestion Engine Master Orchestrator
 * Pipeline:
 * URL -> Validation & SSRF Check -> Cache Check -> Safe Fetch (Redirect SSRF Guard)
 * -> Content-Type Check -> HTML Parsing & Noise Removal -> Structured Document IR
 * -> Semantic Chunking -> Chunk-Level Question Generation -> Grounding Audit
 * -> Deduplication Engine -> Canonical Questions Package
 */

import {
  WebDocumentIR,
  WebFailureReason,
  WebIngestionOptions,
  WebIngestionResult,
  WebPageMetadata,
  WebSemanticChunk,
} from './types';
import { safeFetchWithSsrfGuard, validateWebUrl } from './urlSecurity';
import { parseWebHtml, validateContentType } from './htmlParser';
import { chunkWebDocument } from './webChunker';
import { webIngestionCache } from './webCache';
import { generateQuestionsForWebChunk } from './webQuestionGenerator';
import { verifyQuestionAgainstWebSource } from './webValidator';
import { auditBatchDuplicates } from '../topic/topicDeduplicator';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';

export interface ProcessWebUrlInput {
  url: string;
  titleHint?: string;
}

/**
 * Executes the complete Web URL Ingestion Pipeline.
 */
export async function processWebUrl(
  input: ProcessWebUrlInput | string,
  options: WebIngestionOptions = {}
): Promise<WebIngestionResult> {
  const startTime = performance.now();
  const rawUrl = typeof input === 'string' ? input : input?.url;
  const titleHint = typeof input === 'object' ? input?.titleHint : undefined;
  const count = Math.max(1, Math.min(options.requestedCount || 6, 50));
  const onProgress = options.onProgress;

  // 1. URL Validation & SSRF Protection
  onProgress?.({
    stage: 'VALIDATING_URL',
    message: 'Validating URL syntax and enforcing SSRF network constraints...',
    percentage: 10,
  });

  const urlCheck = validateWebUrl(rawUrl);
  if (!urlCheck.safe || !urlCheck.normalizedUrl) {
    const code: WebFailureReason = urlCheck.isSsrfAttempt ? 'SSRF_BLOCKED' : 'INVALID_URL';
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      success: false,
      url: rawUrl || '',
      title: titleHint || 'Invalid Web URL',
      metadata: {
        url: rawUrl || '',
        canonicalUrl: rawUrl || '',
        title: titleHint || 'Invalid Web URL',
        retrievedAt: Date.now(),
        contentHash: '',
        contentLength: 0,
        httpStatus: 400,
      },
      chunks: [],
      questions: [],
      groundingFidelityScore: 0.0,
      latencyMs,
      cached: false,
      error: {
        code,
        message: urlCheck.reason || 'Invalid URL or SSRF security restriction.',
      },
    };
  }

  const normalizedUrl = urlCheck.normalizedUrl;

  // 2. Cache Lookup
  onProgress?.({
    stage: 'FETCHING_CONTENT',
    message: `Checking cache for ${normalizedUrl}...`,
    percentage: 20,
  });

  let documentIR: WebDocumentIR | null = null;
  let chunks: WebSemanticChunk[] = [];
  let fromCache = false;

  const cached = webIngestionCache.get(normalizedUrl);
  if (cached) {
    documentIR = cached.documentIR;
    chunks = cached.chunks;
    fromCache = true;
  }

  // 3. Network Fetch with Redirect SSRF Defense (if not cached)
  if (!documentIR) {
    onProgress?.({
      stage: 'FETCHING_CONTENT',
      message: `Fetching content with redirect security from ${normalizedUrl}...`,
      percentage: 30,
    });

    let fetchResult;
    try {
      fetchResult = await safeFetchWithSsrfGuard(normalizedUrl, {
        timeoutMs: options.timeoutMs || 15000,
        mockResponse: options.mockFetchResponse,
      });
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      let code: WebFailureReason = 'SOURCE_UNAVAILABLE';

      if (err?.code === 'SSRF_BLOCKED' || err?.code === 'REDIRECT_SSRF_BLOCKED') {
        code = 'SSRF_BLOCKED';
      } else if (err?.code === 'TOO_MANY_REDIRECTS') {
        code = 'TOO_MANY_REDIRECTS';
      }

      return {
        success: false,
        url: normalizedUrl,
        title: titleHint || 'Webpage Retrieval Failed',
        metadata: {
          url: normalizedUrl,
          canonicalUrl: normalizedUrl,
          title: titleHint || 'Webpage Retrieval Failed',
          retrievedAt: Date.now(),
          contentHash: '',
          contentLength: 0,
          httpStatus: 500,
        },
        chunks: [],
        questions: [],
        groundingFidelityScore: 0.0,
        latencyMs,
        cached: false,
        error: {
          code,
          message: err?.message || `Failed to retrieve content from ${normalizedUrl}`,
          details: err?.stack,
        },
      };
    }

    // 4. HTTP Status Validation
    if (!fetchResult.ok) {
      const latencyMs = Math.round(performance.now() - startTime);
      let code: WebFailureReason = 'SOURCE_UNAVAILABLE';
      if (fetchResult.status === 401 || fetchResult.status === 403 || fetchResult.status === 451) {
        code = 'ACCESS_DENIED';
      } else if (fetchResult.status === 429) {
        code = 'RATE_LIMITED';
      }

      return {
        success: false,
        url: normalizedUrl,
        title: titleHint || `Webpage HTTP ${fetchResult.status}`,
        metadata: {
          url: normalizedUrl,
          canonicalUrl: fetchResult.finalUrl,
          title: titleHint || `Webpage HTTP ${fetchResult.status}`,
          retrievedAt: Date.now(),
          contentHash: '',
          contentLength: fetchResult.contentLength,
          httpStatus: fetchResult.status,
          contentType: fetchResult.contentType,
        },
        chunks: [],
        questions: [],
        groundingFidelityScore: 0.0,
        latencyMs,
        cached: false,
        error: {
          code,
          message: `Remote server returned HTTP ${fetchResult.status} ${fetchResult.statusText}`,
        },
      };
    }

    // 5. Content-Type Check
    const ctCheck = validateContentType(fetchResult.contentType);
    if (!ctCheck.valid) {
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        success: false,
        url: normalizedUrl,
        title: titleHint || 'Unsupported Content-Type',
        metadata: {
          url: normalizedUrl,
          canonicalUrl: fetchResult.finalUrl,
          title: titleHint || 'Unsupported Content-Type',
          retrievedAt: Date.now(),
          contentHash: '',
          contentLength: fetchResult.contentLength,
          httpStatus: fetchResult.status,
          contentType: fetchResult.contentType,
        },
        chunks: [],
        questions: [],
        groundingFidelityScore: 0.0,
        latencyMs,
        cached: false,
        error: {
          code: 'INVALID_CONTENT_TYPE',
          message: ctCheck.reason || 'Unsupported Content-Type.',
        },
      };
    }

    // 6. HTML Parsing, Main-Content Extraction, and Noise Removal
    onProgress?.({
      stage: 'PARSING_DOM',
      message: 'Parsing HTML DOM and stripping ads, cookies, and navigation noise...',
      percentage: 45,
    });

    documentIR = parseWebHtml(fetchResult.body, fetchResult.finalUrl);

    // Verify sufficient readable text
    if (!documentIR.fullCleanText || documentIR.wordCount < 20) {
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        success: false,
        url: normalizedUrl,
        title: documentIR.metadata.title || titleHint || 'Empty Webpage',
        metadata: documentIR.metadata,
        chunks: [],
        questions: [],
        groundingFidelityScore: 0.0,
        latencyMs,
        cached: false,
        error: {
          code: 'EMPTY_CONTENT',
          message: 'Insufficient readable content could be extracted from this webpage.',
        },
      };
    }

    // 7. Semantic Chunking
    onProgress?.({
      stage: 'CHUNKING',
      message: 'Chunking document semantically across heading and section hierarchies...',
      percentage: 60,
    });

    chunks = chunkWebDocument(documentIR, options.chunkMaxWords || 1000);

    // Store in Cache
    webIngestionCache.set(
      normalizedUrl,
      documentIR.metadata.contentHash,
      documentIR,
      chunks
    );
  }

  const effectiveTitle = documentIR.metadata.title || titleHint || 'Webpage Exam';

  // 8. Chunk-Level Question Generation
  onProgress?.({
    stage: 'GENERATING_QUESTIONS',
    message: `Generating ${count} questions across ${chunks.length} semantic chunks...`,
    percentage: 70,
  });

  const allCandidateQuestions: CanonicalQuestion[] = [];
  const questionsPerChunk = Math.max(1, Math.ceil(count / Math.max(1, chunks.length)));

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkTargetCount = Math.min(questionsPerChunk, count - allCandidateQuestions.length);

    if (chunkTargetCount <= 0) break;

    const chunkQuestions = await generateQuestionsForWebChunk({
      chunk,
      count: chunkTargetCount,
      url: normalizedUrl,
      pageTitle: effectiveTitle,
      difficulty: options.difficulty,
      mockAiGenerator: options.mockAiGenerator,
    });

    allCandidateQuestions.push(...chunkQuestions);
  }

  // 9. Grounding Validation & Hallucination Check
  onProgress?.({
    stage: 'VALIDATING_QUESTIONS',
    message: 'Auditing questions against source quotes and mathematical formatting...',
    percentage: 85,
  });

  const fullText = documentIR.fullCleanText;
  const verifiedQuestions: CanonicalQuestion[] = [];
  let totalFidelityScore = 0;

  for (let i = 0; i < allCandidateQuestions.length; i++) {
    const q = allCandidateQuestions[i];
    const matchingChunk = chunks.find((c) => c.sectionTitle === q.subtopic) || chunks[0];

    const evidence = verifyQuestionAgainstWebSource(q, matchingChunk, fullText);
    totalFidelityScore += evidence.confidence;

    q.verificationStatus = evidence.verified
      ? 'VERIFIED'
      : evidence.confidence >= 0.5
      ? 'REVIEW_REQUIRED'
      : 'FAILED';

    q.verificationReasons = evidence.reasons;
    q.confidence = {
      extraction: evidence.confidence,
      structure: evidence.confidence,
      answer: evidence.confidence,
      asset: 1.0,
    };

    if (q.verificationStatus !== 'FAILED') {
      verifiedQuestions.push(q);
    }
  }

  // 10. Deduplication Engine
  onProgress?.({
    stage: 'DEDUPLICATING',
    message: 'Eliminating duplicate questions and reindexing...',
    percentage: 95,
  });

  const dupAudit = auditBatchDuplicates(verifiedQuestions);
  const duplicateIds = new Set(dupAudit.matches.map((m) => m.questionId));
  const uniqueQuestions = verifiedQuestions.filter((q) => !duplicateIds.has(q.questionId));

  // Monotonically re-index question numbers (1..N)
  uniqueQuestions.forEach((q, idx) => {
    q.questionNumber = idx + 1;
  });

  const finalQuestions = uniqueQuestions.slice(0, count);
  const averageFidelity =
    finalQuestions.length > 0 ? totalFidelityScore / finalQuestions.length : 0.0;
  const latencyMs = Math.round(performance.now() - startTime);

  onProgress?.({
    stage: 'COMPLETE',
    message: `Generated ${finalQuestions.length} verified questions successfully.`,
    percentage: 100,
  });

  return {
    success: finalQuestions.length > 0,
    url: normalizedUrl,
    title: effectiveTitle,
    metadata: documentIR.metadata,
    documentIR,
    chunks,
    questions: finalQuestions,
    groundingFidelityScore: parseFloat(averageFidelity.toFixed(2)),
    latencyMs,
    cached: fromCache,
  };
}
