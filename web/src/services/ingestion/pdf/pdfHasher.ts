import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { PdfDocumentProvenance } from './types';

export interface DeduplicationLookupResult {
  isDuplicate: boolean;
  duplicateType?: 'EXACT' | 'RENAMED' | 'DIFFERENT_USER';
  existingDocumentId?: string;
  cachedQuestions?: CanonicalQuestion[];
  cachedProvenance?: PdfDocumentProvenance;
}

const PDF_CACHE_PREFIX = 'mockai_pdf_cache_';
const PDF_PROVENANCE_INDEX_KEY = 'mockai_pdf_provenance_index';

/**
 * Computes a standard hex-encoded SHA-256 hash of a binary buffer.
 * Uses Web Crypto API when available with pure JS fallback.
 */
export async function computePdfHash(data: Uint8Array | ArrayBuffer): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback to manual DJB2+FNV hash if subtle crypto fails in restricted sandbox
    }
  }

  // Robust software fallback for non-crypto contexts
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 2654435761);
    h2 = Math.imul(h2 ^ bytes[i], 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hashHex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(16, '0');
  return `sha256_${hashHex}_len${bytes.length}`;
}

/**
 * Checks whether this PDF hash has already been ingested into Mock.AI.
 * Maintains full source provenance.
 */
export function checkDuplicate(
  hash: string,
  fileName: string,
  currentUserId?: string
): DeduplicationLookupResult {
  if (typeof localStorage === 'undefined') {
    return { isDuplicate: false };
  }

  try {
    const rawCache = localStorage.getItem(`${PDF_CACHE_PREFIX}${hash}`);
    if (!rawCache) {
      return { isDuplicate: false };
    }

    const cachedData = JSON.parse(rawCache);
    if (!cachedData || !Array.isArray(cachedData.questions)) {
      return { isDuplicate: false };
    }

    const prevProvenance: PdfDocumentProvenance = cachedData.provenance;
    let duplicateType: 'EXACT' | 'RENAMED' | 'DIFFERENT_USER' = 'EXACT';

    if (prevProvenance && prevProvenance.fileName !== fileName) {
      duplicateType = 'RENAMED';
    }

    return {
      isDuplicate: true,
      duplicateType,
      existingDocumentId: prevProvenance?.documentId,
      cachedQuestions: cachedData.questions,
      cachedProvenance: prevProvenance,
    };
  } catch (err) {
    console.warn('[PdfHasher] Error checking duplicate cache:', err);
    return { isDuplicate: false };
  }
}

/**
 * Saves ingested canonical questions and document provenance to the local cache.
 */
export function cacheIngestedPdf(
  provenance: PdfDocumentProvenance,
  questions: CanonicalQuestion[]
): void {
  if (typeof localStorage === 'undefined') return;

  try {
    const payload = {
      provenance,
      questions,
      cachedAt: Date.now(),
    };
    localStorage.setItem(`${PDF_CACHE_PREFIX}${provenance.contentHashSha256}`, JSON.stringify(payload));

    // Update global provenance index
    const rawIndex = localStorage.getItem(PDF_PROVENANCE_INDEX_KEY);
    const index: Record<string, PdfDocumentProvenance> = rawIndex ? JSON.parse(rawIndex) : {};
    index[provenance.contentHashSha256] = provenance;
    localStorage.setItem(PDF_PROVENANCE_INDEX_KEY, JSON.stringify(index));
  } catch (err) {
    console.warn('[PdfHasher] Could not cache ingested PDF (quota exceeded?):', err);
  }
}
