/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contract: Security Boundary & Untrusted Input Sandbox Policy
 *
 * All assessment sources (PDF, DOCX, ZIP, SVG, Images) are treated as UNTRUSTED INPUT.
 * Prevents decompression bombs, XXE injection, path traversal, malicious SVG scripts,
 * and memory/CPU exhaustion.
 */

export interface DecompressionLimits {
  maxUncompressedSizeRatio: number; // e.g. 100:1 maximum compression ratio
  maxUncompressedBytes: number;      // e.g. 100 MB max expanded size
  maxEntriesCount: number;           // e.g. 10,000 max zip entries
}

export interface SecurityBoundaryPolicy {
  maxFileSizeBytes: number;          // Default: 100 MB
  maxPageCount: number;              // Default: 500 pages
  maxProcessingTimeMsPerPage: number;// Default: 10,000 ms
  maxMemoryAllocationMb: number;     // Default: 512 MB
  decompressionLimits: DecompressionLimits;

  pdfPolicy: {
    disallowJavaScript: boolean;     // pdfjs isEvalSupported: false
    disallowExternalLaunch: boolean; // Ban /Launch /URI autoplay actions
    disallowEmbeddedFiles: boolean;  // Reject non-image attachments
  };

  xmlPolicy: {
    disallowDtd: boolean;            // Ban DOCTYPE entity expansion (XXE)
    disallowExternalEntities: boolean;
    disallowSchemaProcessing: boolean;
  };

  svgPolicy: {
    disallowScripts: boolean;        // Strip <script> and on* attributes
    disallowForeignObjects: boolean; // Strip <foreignObject>
    disallowRemoteUrls: boolean;     // Disallow external xlink:href / href
  };

  pathPolicy: {
    disallowAbsolutePaths: boolean;
    disallowParentTraversal: boolean;// Ban '..' in zip file paths
  };
}

export type ThreatCategory =
  | 'DECOMPRESSION_BOMB'
  | 'MALICIOUS_PDF_SCRIPT'
  | 'XXE_ATTEMPT'
  | 'PATH_TRAVERSAL'
  | 'MALICIOUS_SVG_SCRIPT'
  | 'MEMORY_LIMIT_EXCEEDED'
  | 'TIMEOUT_EXCEEDED'
  | 'MALFORMED_HEADER';

export interface SecurityViolationReport {
  violationId: string;
  threatCategory: ThreatCategory;
  severity: 'CRITICAL_BLOCK' | 'REJECT';
  message: string;
  sourceUri?: string;
  timestamp: number;
}

/**
 * Standard Production Security Policy:
 */
export const STANDARD_SECURITY_POLICY: SecurityBoundaryPolicy = {
  maxFileSizeBytes: 100 * 1024 * 1024, // 100 MB
  maxPageCount: 500,
  maxProcessingTimeMsPerPage: 10000,   // 10s
  maxMemoryAllocationMb: 512,
  decompressionLimits: {
    maxUncompressedSizeRatio: 100,
    maxUncompressedBytes: 100 * 1024 * 1024,
    maxEntriesCount: 10000,
  },
  pdfPolicy: {
    disallowJavaScript: true,
    disallowExternalLaunch: true,
    disallowEmbeddedFiles: true,
  },
  xmlPolicy: {
    disallowDtd: true,
    disallowExternalEntities: true,
    disallowSchemaProcessing: true,
  },
  svgPolicy: {
    disallowScripts: true,
    disallowForeignObjects: true,
    disallowRemoteUrls: true,
  },
  pathPolicy: {
    disallowAbsolutePaths: true,
    disallowParentTraversal: true,
  },
};
