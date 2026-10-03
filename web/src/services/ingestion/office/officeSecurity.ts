import JSZip from 'jszip';
import { OfficeValidationResult, OfficeDocumentType } from './types';

// Security limits
export const MAX_OFFICE_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB hard ceiling for compressed file
export const MAX_UNCOMPRESSED_SIZE_BYTES = 250 * 1024 * 1024; // 250 MB max uncompressed
export const MAX_ARCHIVE_FILE_COUNT = 5000;
export const MAX_COMPRESSION_RATIO = 100;

const PK_MAGIC = [0x50, 0x4b]; // 'PK'

/**
 * Validates an Office document binary buffer before extraction.
 * Performs deep security checks: PK magic bytes, zip bomb heuristics,
 * macro detection, and internal structure validation.
 */
export async function validateOfficeBinary(
  data: Uint8Array | ArrayBuffer,
  fileName: string = 'document.docx'
): Promise<OfficeValidationResult> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const size = bytes.length;
  const warnings: string[] = [];

  if (size === 0) {
    return {
      valid: false,
      error: `File "${fileName}" is empty (0 bytes).`,
      fileSizeBytes: 0,
    };
  }

  if (size < 4) {
    return {
      valid: false,
      error: `File "${fileName}" is too small to be a valid Office document.`,
      fileSizeBytes: size,
    };
  }

  // 1. Verify PK magic bytes (OpenXML is a ZIP container)
  if (bytes[0] !== PK_MAGIC[0] || bytes[1] !== PK_MAGIC[1]) {
    return {
      valid: false,
      error: `File "${fileName}" is not a valid OpenXML document (missing ZIP PK magic header).`,
      fileSizeBytes: size,
    };
  }

  if (size < 30) {
    return {
      valid: false,
      error: `File "${fileName}" is too small to be a valid Office document.`,
      fileSizeBytes: size,
    };
  }

  if (size > MAX_OFFICE_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File "${fileName}" exceeds the 100MB limit (${(size / (1024 * 1024)).toFixed(1)}MB).`,
      fileSizeBytes: size,
    };
  }

  // 2. Load zip and inspect internal entries with zip-bomb safeguards
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (err: any) {
    return {
      valid: false,
      error: `File "${fileName}" appears to be corrupt or password-protected: ${err.message}`,
      fileSizeBytes: size,
    };
  }

  let totalUncompressedSize = 0;
  let fileCount = 0;
  let hasWordDoc = false;
  let hasPptPresentation = false;
  let hasMacros = false;

  const entries = Object.keys(zip.files);
  if (entries.length > MAX_ARCHIVE_FILE_COUNT) {
    return {
      valid: false,
      error: `Security violation: Archive contains ${entries.length} files (exceeds limit of ${MAX_ARCHIVE_FILE_COUNT}).`,
      fileSizeBytes: size,
    };
  }

  for (const path of entries) {
    fileCount++;
    const file = zip.files[path];

    if (file.dir) continue;

    // Macro detection
    if (/vbaProject\.bin$/i.test(path) || /\.bin$/i.test(path) && path.includes('vba')) {
      hasMacros = true;
      warnings.push('Embedded VBA macros detected. Macro execution is strictly blocked for security.');
    }

    if (/^word\/document\.xml$/i.test(path)) {
      hasWordDoc = true;
    }
    if (/^ppt\/presentation\.xml$/i.test(path)) {
      hasPptPresentation = true;
    }

    // Uncompressed size estimate from zip entry metadata if available
    const uncompressedSize = (file as any)._data?.uncompressedSize ?? 0;
    totalUncompressedSize += uncompressedSize;
  }

  // Zip bomb compression ratio check
  if (totalUncompressedSize > 0 && size > 0) {
    const ratio = totalUncompressedSize / size;
    if (ratio > MAX_COMPRESSION_RATIO || totalUncompressedSize > MAX_UNCOMPRESSED_SIZE_BYTES) {
      return {
        valid: false,
        error: `Security violation: Archive appears to be a zip bomb (ratio ${ratio.toFixed(0)}:1, uncompressed size ${(totalUncompressedSize / (1024 * 1024)).toFixed(1)}MB).`,
        fileSizeBytes: size,
      };
    }
  }

  // Determine document type
  let detectedType: OfficeDocumentType | undefined;
  if (hasWordDoc) {
    detectedType = 'DOCX';
  } else if (hasPptPresentation) {
    detectedType = 'PPTX';
  } else {
    return {
      valid: false,
      error: `File "${fileName}" is an unrecognized archive format (neither word/document.xml nor ppt/presentation.xml found).`,
      fileSizeBytes: size,
    };
  }

  return {
    valid: true,
    fileSizeBytes: size,
    detectedType,
    hasMacros,
    warnings,
  };
}

/**
 * Sanitizes XML text against XXE (XML External Entity) attacks
 * by stripping <!DOCTYPE> declarations and entity expansions.
 */
export function sanitizeXml(xml: string): string {
  // Strip DOCTYPE declarations containing SYSTEM or ENTITY definitions
  return xml.replace(/<!DOCTYPE[\s\S]*?>/gi, '');
}

/**
 * Sanitizes a hyperlink URL to block malicious protocols like javascript:
 */
export function sanitizeHyperlink(url: string): string {
  const trimmed = url.trim();
  if (/^(?:javascript|data|vbscript|file):/i.test(trimmed)) {
    return '#blocked-untrusted-link';
  }
  return trimmed;
}
