/**
 * Repository Layer — Barrel Export
 *
 * The UI accesses all content through these repositories.
 * The repositories handle the local ↔ remote transition transparently.
 *
 * Usage:
 *   import { examRepository, paperRepository, questionRepository, assetRepository } from '../repositories';
 */

export { examRepository } from './examRepository';
export { paperRepository } from './paperRepository';
export { questionRepository } from './questionRepository';
export { assetRepository } from './assetRepository';
