/**
 * UADUE Phase 2D-7 — Universal Content-Addressed Asset Registry
 * Document Version: 7.3.1-CONSISTENCY-ALIGNED
 *
 * Inviolable Asset Principles:
 * 1. ZERO exam-specific directory hierarchies (no 'upsc/2023/gs1/' paths).
 * 2. Content-addressing: URI derived strictly from SHA-256 digest: assets/{hash[0..2]}/{hash}.{ext}.
 * 3. Global deduplication: identical asset buffers share the exact same canonical storage record.
 * 4. Exam and provenance metadata stored exclusively as JSONB tags in canonical_assets.
 * 5. Tamper detection: mismatch between buffer hash and asserted hash fails closed immediately.
 */

import { createHash } from 'crypto';
import { CanonicalAssetRecord } from './canonicalPersistenceTypes';

export class AssetIntegrityError extends Error {
  constructor(public readonly expectedHash: string, public readonly actualHash: string) {
    super(`Asset Integrity Failure: Expected content hash ${expectedHash}, computed ${actualHash}.`);
    this.name = 'AssetIntegrityError';
  }
}

export class CanonicalAssetRegistry {
  private assets = new Map<string, CanonicalAssetRecord>();

  /**
   * Registers an asset buffer into the content-addressed registry.
   * If assertedHash is provided, verifies cryptographic equality.
   */
  public registerAsset(
    buffer: Buffer | Uint8Array,
    mimeType: string,
    examMetadata: Record<string, unknown> = {},
    assertedHash?: string
  ): CanonicalAssetRecord {
    const computedHash = createHash('sha256').update(buffer).digest('hex');

    if (assertedHash && assertedHash !== computedHash) {
      throw new AssetIntegrityError(assertedHash, computedHash);
    }

    // Check for global deduplication
    const existing = this.assets.get(computedHash);
    if (existing) {
      return existing;
    }

    const ext = this.getExtensionForMime(mimeType);
    const storageUri = `assets/${computedHash.slice(0, 2)}/${computedHash}.${ext}`;

    const record: CanonicalAssetRecord = {
      contentHash: computedHash,
      storageUri,
      byteSize: buffer.byteLength,
      mimeType,
      examMetadata,
      createdAt: Date.now(),
    };

    this.assets.set(computedHash, record);
    return record;
  }

  public getAsset(contentHash: string): CanonicalAssetRecord | undefined {
    return this.assets.get(contentHash);
  }

  public hasAsset(contentHash: string): boolean {
    return this.assets.has(contentHash);
  }

  public getTotalAssetCount(): number {
    return this.assets.size;
  }

  private getExtensionForMime(mimeType: string): string {
    switch (mimeType.toLowerCase()) {
      case 'image/png':
        return 'png';
      case 'image/jpeg':
      case 'image/jpg':
        return 'jpg';
      case 'image/webp':
        return 'webp';
      case 'image/svg+xml':
        return 'svg';
      case 'application/pdf':
        return 'pdf';
      default:
        return 'bin';
    }
  }
}
