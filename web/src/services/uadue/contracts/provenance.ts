/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contract: Cryptographic Provenance & Audit Trail
 */

import { BoundingBox2D } from './evidence';

export interface AuditActionEntry {
  action: string;
  fieldModified?: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason: string;
  operator: 'DETERMINISTIC_ENGINE' | 'STAFF_MODERATOR' | 'COMMUNITY_REVIEW';
  operatorId?: string;
  timestamp: number;
}

export interface UadueProvenanceRecord {
  sourceHash: string; // SHA-256 of physical source file
  sourceFileName: string;
  adapterId: string;
  adapterVersion: string;
  parserVersion: string;
  schemaVersion: string;
  timestamp: number;
  pageNumber: number;
  bbox: BoundingBox2D;
  visualCropHash?: string;
  auditTrail: AuditActionEntry[];
}
