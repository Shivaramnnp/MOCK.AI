/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Test Suite: PDF Source Validator Rigor & Security (Phase 2A)
 */

import { describe, it, expect } from 'vitest';
import { PdfSourceValidator } from './pdfSourceValidator';
import { STANDARD_SECURITY_POLICY, SecurityBoundaryPolicy } from '../../contracts/security';

describe('PdfSourceValidator (Phase 2A Forensic Pre-Flight)', () => {
  it('rejects empty byte buffers (0 bytes)', () => {
    const report = PdfSourceValidator.validate(new Uint8Array(0));
    expect(report.valid).toBe(false);
    expect(report.fileSizeBytes).toBe(0);
    expect(report.findings.some((f) => f.code === 'EMPTY_FILE' && f.severity === 'FATAL')).toBe(true);
  });

  it('rejects truncated buffers below minimum threshold (< 32 bytes)', () => {
    const report = PdfSourceValidator.validate(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    expect(report.valid).toBe(false);
    expect(report.findings.some((f) => f.code === 'FILE_TOO_SMALL' && f.severity === 'FATAL')).toBe(true);
  });

  it('rejects buffers lacking %PDF- magic bytes', () => {
    const invalidHeader = new TextEncoder().encode('%XYZ-1.7\nSome dummy content that is long enough to pass size check.');
    const report = PdfSourceValidator.validate(invalidHeader);
    expect(report.valid).toBe(false);
    expect(report.findings.some((f) => f.code === 'INVALID_MAGIC_BYTES' && f.severity === 'FATAL')).toBe(true);
  });

  it('accepts authentic %PDF- header and extracts PDF version', () => {
    const validPdf = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R >>\nstartxref\n50\n%%EOF');
    const report = PdfSourceValidator.validate(validPdf);
    expect(report.valid).toBe(true);
    expect(report.pdfVersion).toBe('1.4');
    expect(report.isEncrypted).toBe(false);
  });

  it('detects leading garbage before %PDF- header as warning', () => {
    const garbagePrefix = new TextEncoder().encode('GARBAGE_BYTES%PDF-1.7\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R >>\nstartxref\n60\n%%EOF');
    const report = PdfSourceValidator.validate(garbagePrefix);
    expect(report.valid).toBe(true); // Warning does not fail validation
    expect(report.findings.some((f) => f.code === 'LEADING_GARBAGE_BEFORE_HEADER' && f.severity === 'WARNING')).toBe(true);
  });

  it('flags missing %%EOF and missing startxref as warnings without crashing', () => {
    const truncatedPdf = new TextEncoder().encode('%PDF-1.5\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% Missing xref and EOF');
    const report = PdfSourceValidator.validate(truncatedPdf);
    expect(report.valid).toBe(true);
    expect(report.findings.some((f) => f.code === 'MISSING_EOF_MARKER')).toBe(true);
    expect(report.findings.some((f) => f.code === 'MISSING_STARTXREF')).toBe(true);
  });

  it('blocks encrypted PDFs with /Encrypt dictionary as FATAL', () => {
    const encryptedPdf = new TextEncoder().encode('%PDF-1.6\n1 0 obj\n<< /Type /Catalog >>\nendobj\n2 0 obj\n<< /Encrypt << /V 2 /R 3 >> >>\nendobj\nxref\n0 2\ntrailer\n<< /Root 1 0 R /Encrypt 2 0 R >>\nstartxref\n100\n%%EOF');
    const report = PdfSourceValidator.validate(encryptedPdf);
    expect(report.valid).toBe(false);
    expect(report.isEncrypted).toBe(true);
    expect(report.findings.some((f) => f.code === 'ENCRYPTED_PDF' && f.severity === 'FATAL')).toBe(true);
    expect(report.securityViolations.length).toBeGreaterThan(0);
  });

  it('enforces maximum file size policy limit', () => {
    const strictPolicy: SecurityBoundaryPolicy = {
      ...STANDARD_SECURITY_POLICY,
      maxFileSizeBytes: 100, // 100 bytes max
    };
    const oversizedPdf = new Uint8Array(200);
    oversizedPdf.set(new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'));

    const report = PdfSourceValidator.validate(oversizedPdf, strictPolicy);
    expect(report.valid).toBe(false);
    expect(report.findings.some((f) => f.code === 'FILE_SIZE_LIMIT_EXCEEDED' && f.severity === 'FATAL')).toBe(true);
  });

  it('detects embedded JavaScript and Launch actions according to security policy', () => {
    const jsPdf = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Names << /JavaScript 2 0 R >> >>\nendobj\n2 0 obj\n<< /JS (app.alert(1)) >>\nendobj\n3 0 obj\n<< /Launch << /F (malicious.exe) >> >>\nendobj\nxref\n0 3\ntrailer\n<< /Root 1 0 R >>\nstartxref\n150\n%%EOF');
    const report = PdfSourceValidator.validate(jsPdf);
    expect(report.findings.some((f) => f.code === 'EMBEDDED_JAVASCRIPT_DETECTED')).toBe(true);
    expect(report.findings.some((f) => f.code === 'LAUNCH_ACTION_DETECTED')).toBe(true);
  });

  it('enforces declared page count limits from /Pages /Count dictionary', () => {
    const strictPolicy: SecurityBoundaryPolicy = {
      ...STANDARD_SECURITY_POLICY,
      maxPageCount: 10,
    };
    const hugePdf = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Pages /Count 500 /Kids [] >>\nendobj\nxref\n0 1\ntrailer\n<< /Root 1 0 R >>\nstartxref\n80\n%%EOF');
    const report = PdfSourceValidator.validate(hugePdf, strictPolicy);
    expect(report.valid).toBe(false);
    expect(report.declaredPageCount).toBe(500);
    expect(report.findings.some((f) => f.code === 'PAGE_COUNT_EXCEEDED' && f.severity === 'FATAL')).toBe(true);
  });
});
