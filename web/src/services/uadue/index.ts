/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Core Public API & Contracts Entrypoint
 */

export * from './contracts/evidence';
export * from './contracts/sourceReference';
export * from './contracts/forensicSnapshot';
export * from './contracts/documentIR';
export * from './contracts/documentGraph';
export * from './contracts/questionGraph';
export * from './contracts/canonicalQuestionIR';
export * from './contracts/provenance';
export * from './contracts/certification';
export * from './contracts/assetGraph';
export * from './contracts/identity';
export * from './contracts/profile';
export * from './contracts/verification';
export * from './contracts/security';
export * from './adapters/SourceAdapterInterface';
export * from './adapters/PdfNativeSourceAdapter';
export * from './adapters/DocxSourceAdapter';
export * from './layout/spatialGraphBuilder';
export * from './segmentation/universalQuestionSegmenter';
export * from './invariants/invariants';
export * from './graph/spatialIndex';
export * from './graph/geometricRelations';
export * from './graph/columnDetector';
export * from './graph/readingOrderEngine';
export * from './graph/crossPageContinuation';
export * from './graph/graphSerializer';
export * from './graph/graphValidator';
export * from './graph/documentGraphBuilder';
