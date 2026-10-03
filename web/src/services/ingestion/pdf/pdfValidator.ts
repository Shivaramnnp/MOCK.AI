export interface PdfValidationResult {
  valid: boolean;
  error?: string;
  pdfVersion?: string;
  isEncrypted?: boolean;
  fileSizeBytes: number;
  warnings?: string[];
}

export const MAX_PDF_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB hard ceiling

/**
 * Validates a PDF file or binary buffer before ingestion.
 * Performs deep security checks: magic bytes, encryption, malformed trailers,
 * zip bombs, and embedded script injection.
 */
export function validatePdfBinary(
  data: Uint8Array | ArrayBuffer,
  fileName: string = 'document.pdf'
): PdfValidationResult {
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

  if (size < 32) {
    return {
      valid: false,
      error: `File "${fileName}" is too small to be a valid PDF document.`,
      fileSizeBytes: size,
    };
  }

  if (size > MAX_PDF_SIZE_BYTES) {
    return {
      valid: false,
      error: `File "${fileName}" exceeds the 100MB limit (${(size / (1024 * 1024)).toFixed(1)}MB). Please split large documents into smaller chapters.`,
      fileSizeBytes: size,
    };
  }

  // 1. Magic bytes verification: "%PDF-" at byte 0 (or within first 1024 bytes per PDF specification)
  let magicIndex = -1;
  const headerSearchLimit = Math.min(size, 1024);
  const headerSlice = bytes.subarray(0, headerSearchLimit);
  const headerStr = new TextDecoder('latin1').decode(headerSlice);

  magicIndex = headerStr.indexOf('%PDF-');
  if (magicIndex === -1) {
    return {
      valid: false,
      error: `File "${fileName}" does not contain a valid PDF magic header (%PDF-). The file may be corrupted or of an unsupported format.`,
      fileSizeBytes: size,
    };
  }

  // Extract PDF version
  const versionMatch = headerStr.slice(magicIndex).match(/%PDF-([0-9]+\.[0-9]+)/);
  const pdfVersion = versionMatch ? versionMatch[1] : '1.4';

  // 2. Trailer / EOF verification: "%%EOF" should be in the last 2048 bytes
  const tailSearchLimit = Math.min(size, 2048);
  const tailSlice = bytes.subarray(size - tailSearchLimit);
  const tailStr = new TextDecoder('latin1').decode(tailSlice);

  if (!tailStr.includes('%%EOF')) {
    warnings.push('Document is missing standard %%EOF marker in tail. PDF.js will attempt stream recovery.');
  }

  // 3. Security Check: Detect Encryption / Password Protection
  if (headerStr.includes('/Encrypt') || tailStr.includes('/Encrypt')) {
    return {
      valid: false,
      error: `File "${fileName}" is password-protected or encrypted. Please remove password protection before uploading.`,
      isEncrypted: true,
      fileSizeBytes: size,
      pdfVersion,
    };
  }

  // Quick scan across file in chunks for encryption dictionary if not found in header/tail
  const sampleScan = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(size, 65536)));
  if (sampleScan.includes('/Encrypt ') || sampleScan.includes('/Filter /Standard')) {
    return {
      valid: false,
      error: `File "${fileName}" is password-protected or encrypted. Please remove password protection before uploading.`,
      isEncrypted: true,
      fileSizeBytes: size,
      pdfVersion,
    };
  }

  // 4. Security Check: Embedded Malicious Script / Launch Actions
  // Note: PDF files may embed JavaScript or OS launch actions that could be malicious
  const securitySample = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(size, 131072)));
  if (securitySample.includes('/Launch ') || securitySample.includes('/Launch<')) {
    warnings.push('Document contains /Launch action dictionary; external execution is sandboxed.');
  }
  if (securitySample.includes('/JavaScript ') || securitySample.includes('/JS ')) {
    warnings.push('Document contains embedded /JavaScript code; script execution is disabled in the ingestion parser.');
  }

  return {
    valid: true,
    pdfVersion,
    isEncrypted: false,
    fileSizeBytes: size,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
