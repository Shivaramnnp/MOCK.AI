/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Module: PDF Source Validator (Phase 2A)
 *
 * Performs rigorous forensic pre-flight validation on raw PDF byte streams before parsing.
 * Treats every PDF as UNTRUSTED INPUT.
 * Never silently repairs malformed bytes; records all structural observations as findings.
 */

import { SecurityBoundaryPolicy, STANDARD_SECURITY_POLICY } from '../../contracts/security';

export interface PdfValidationFinding {
  code: string;
  category: 'STRUCTURE' | 'SECURITY' | 'GEOMETRY' | 'ENCRYPTION' | 'METADATA';
  severity: 'FATAL' | 'WARNING' | 'INFO';
  message: string;
  byteOffset?: number;
}

export interface PdfSourceValidationReport {
  valid: boolean;
  fileSizeBytes: number;
  pdfVersion?: string;
  isLinearized: boolean;
  isEncrypted: boolean;
  hasXrefTable: boolean;
  hasXrefStream: boolean;
  declaredPageCount?: number;
  findings: PdfValidationFinding[];
  securityViolations: string[];
}

export class PdfSourceValidator {
  /**
   * Validates raw PDF buffer against structural and security invariants.
   */
  static validate(
    bytes: Uint8Array | ArrayBuffer | Blob,
    policy: SecurityBoundaryPolicy = STANDARD_SECURITY_POLICY
  ): PdfSourceValidationReport {
    let data: Uint8Array;
    if (bytes instanceof Uint8Array) {
      data = bytes;
    } else if (ArrayBuffer.isView(bytes)) {
      data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    } else if (bytes instanceof ArrayBuffer || (bytes && (bytes as any).byteLength !== undefined && (bytes as any).slice)) {
      data = new Uint8Array(bytes as ArrayBuffer);
    } else {
      data = new Uint8Array(0);
    }

    const size = data.length;
    const findings: PdfValidationFinding[] = [];
    const securityViolations: string[] = [];

    // 1. File existence & Minimum Size
    if (size === 0) {
      findings.push({
        code: 'EMPTY_FILE',
        category: 'STRUCTURE',
        severity: 'FATAL',
        message: 'The provided PDF byte buffer is empty (0 bytes).',
      });
      return {
        valid: false,
        fileSizeBytes: 0,
        isLinearized: false,
        isEncrypted: false,
        hasXrefTable: false,
        hasXrefStream: false,
        findings,
        securityViolations,
      };
    }

    if (size < 32) {
      findings.push({
        code: 'FILE_TOO_SMALL',
        category: 'STRUCTURE',
        severity: 'FATAL',
        message: `File size (${size} bytes) is below minimum threshold for a valid PDF.`,
      });
      return {
        valid: false,
        fileSizeBytes: size,
        isLinearized: false,
        isEncrypted: false,
        hasXrefTable: false,
        hasXrefStream: false,
        findings,
        securityViolations,
      };
    }

    // 2. Maximum Size Limit (Decompression / Memory Protection)
    if (size > policy.maxFileSizeBytes) {
      securityViolations.push(`File size (${(size / (1024 * 1024)).toFixed(1)} MB) exceeds security threshold of ${policy.maxFileSizeBytes / (1024 * 1024)} MB.`);
      findings.push({
        code: 'FILE_SIZE_LIMIT_EXCEEDED',
        category: 'SECURITY',
        severity: 'FATAL',
        message: `File size exceeds security boundary (${policy.maxFileSizeBytes} bytes).`,
      });
    }

    // 3. Header & Magic Bytes (%PDF-)
    const headerSlice = String.fromCharCode(...data.slice(0, Math.min(1024, size)));
    const headerMatch = headerSlice.match(/%PDF-(\d+\.\d+)/);

    if (!headerMatch) {
      findings.push({
        code: 'INVALID_MAGIC_BYTES',
        category: 'STRUCTURE',
        severity: 'FATAL',
        message: 'Invalid PDF magic bytes: file lacks valid %PDF- header in the first 1024 bytes.',
        byteOffset: 0,
      });
      return {
        valid: false,
        fileSizeBytes: size,
        isLinearized: false,
        isEncrypted: false,
        hasXrefTable: false,
        hasXrefStream: false,
        findings,
        securityViolations,
      };
    }

    const pdfVersion = headerMatch[1];
    const headerOffset = headerSlice.indexOf(headerMatch[0]);
    if (headerOffset > 0) {
      findings.push({
        code: 'LEADING_GARBAGE_BEFORE_HEADER',
        category: 'STRUCTURE',
        severity: 'WARNING',
        message: `Found ${headerOffset} bytes of non-PDF data before %PDF- header.`,
        byteOffset: 0,
      });
    }

    // 4. Trailer, startxref, and EOF check (inspect last 4096 bytes)
    const searchTailSize = Math.min(size, 4096);
    const tailSlice = String.fromCharCode(...data.slice(size - searchTailSize));

    const hasEof = /%%EOF\s*$/.test(tailSlice.trim());
    if (!hasEof && !tailSlice.includes('%%EOF')) {
      findings.push({
        code: 'MISSING_EOF_MARKER',
        category: 'STRUCTURE',
        severity: 'WARNING',
        message: 'PDF file lacks %%EOF termination marker at end of file. Potential stream truncation.',
      });
    }

    const startXrefMatch = tailSlice.match(/startxref\s+(\d+)/);
    const hasStartXref = !!startXrefMatch;
    if (!hasStartXref) {
      findings.push({
        code: 'MISSING_STARTXREF',
        category: 'STRUCTURE',
        severity: 'WARNING',
        message: 'Could not locate startxref pointer in trailing bytes. Xref repair may be required by parser.',
      });
    }

    // 5. Cross-reference type
    // Convert full or sampled text to check for xref tables vs xref streams
    // Sample head (first 64KB) and tail (last 64KB) for scan efficiency
    const sampleHead = String.fromCharCode(...data.slice(0, Math.min(65536, size)));
    const sampleTail = String.fromCharCode(...data.slice(Math.max(0, size - 65536)));
    const combinedSample = sampleHead + '\n' + sampleTail;

    const hasXrefTable = /\bxref\b\s*\r?\n\s*\d+\s+\d+/.test(combinedSample);
    const hasXrefStream = /\/Type\s*\/XRef\b/.test(combinedSample);

    // 6. Linearization check
    const isLinearized = /\/Linearized\s+\d+/.test(sampleHead);

    // 7. Security Checks: Encryption (/Encrypt)
    const isEncrypted = /\/Encrypt\s+\d+\s+\d+\s+R/.test(combinedSample) || /\/Encrypt\s*<</.test(combinedSample);
    if (isEncrypted) {
      findings.push({
        code: 'ENCRYPTED_PDF',
        category: 'ENCRYPTION',
        severity: 'FATAL',
        message: 'PDF contains /Encrypt dictionary (password-protected or DRM-locked). Cleartext extraction blocked.',
      });
      securityViolations.push('Encrypted PDF detected. Plaintext forensic extraction cannot proceed without credentials.');
    }

    // 8. Security Checks: Malicious Scripts (/JavaScript, /JS, /Launch)
    if (policy.pdfPolicy.disallowJavaScript) {
      const hasJs = /\/JavaScript\b|\/JS\b/.test(combinedSample);
      if (hasJs) {
        findings.push({
          code: 'EMBEDDED_JAVASCRIPT_DETECTED',
          category: 'SECURITY',
          severity: 'WARNING',
          message: 'PDF contains /JavaScript or /JS dictionary. Script execution will be suppressed.',
        });
      }
    }

    if (policy.pdfPolicy.disallowExternalLaunch) {
      const hasLaunch = /\/Launch\b/.test(combinedSample);
      if (hasLaunch) {
        findings.push({
          code: 'LAUNCH_ACTION_DETECTED',
          category: 'SECURITY',
          severity: 'WARNING',
          message: 'PDF contains /Launch action. External execution blocked by policy.',
        });
      }
    }

    // 9. Declared Page Count Check (/Pages /Count N)
    const countMatch = combinedSample.match(/\/Type\s*\/Pages\b[^\/]*\/Count\s+(\d+)/);
    let declaredPageCount: number | undefined = undefined;
    if (countMatch) {
      declaredPageCount = parseInt(countMatch[1], 10);
      if (declaredPageCount > policy.maxPageCount) {
        securityViolations.push(`Declared page count (${declaredPageCount}) exceeds security limit of ${policy.maxPageCount} pages.`);
        findings.push({
          code: 'PAGE_COUNT_EXCEEDED',
          category: 'SECURITY',
          severity: 'FATAL',
          message: `PDF page count (${declaredPageCount}) exceeds policy limit (${policy.maxPageCount}).`,
        });
      }
    }

    const hasFatal = findings.some((f) => f.severity === 'FATAL');

    return {
      valid: !hasFatal,
      fileSizeBytes: size,
      pdfVersion,
      isLinearized,
      isEncrypted,
      hasXrefTable,
      hasXrefStream,
      declaredPageCount,
      findings,
      securityViolations,
    };
  }
}
