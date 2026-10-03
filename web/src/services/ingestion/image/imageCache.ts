/**
 * Image Ingestion Cache
 * High-performance dual-tier caching (in-memory Map + localStorage)
 * Keyed by imageHash with 2-hour TTL.
 * Avoids repeated image decoding, pre-processing, vision OCR, and AI calls.
 */

import { CanonicalAsset, CanonicalQuestion } from '../../../types/canonicalQuestion';
import { ImageQualityAssessment } from './types';

interface ImageCacheEntry {
  imageHash: string;
  quality: ImageQualityAssessment;
  questions: CanonicalQuestion[];
  assets: CanonicalAsset[];
  cachedAt: number;
  expiresAt: number;
}

const DEFAULT_TTL_SECONDS = 7200; // 2 hours

class ImageIngestionCacheManager {
  private memoryCache: Map<string, ImageCacheEntry> = new Map();
  private storagePrefix = 'mockai_img_cache:';

  private buildKey(imageHash: string): string {
    return imageHash.trim();
  }

  get(imageHash: string): { quality: ImageQualityAssessment; questions: CanonicalQuestion[]; assets: CanonicalAsset[] } | null {
    const key = this.buildKey(imageHash);
    const now = Date.now();

    // 1. Memory Cache
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      if (memEntry.expiresAt > now) {
        return {
          quality: memEntry.quality,
          questions: memEntry.questions,
          assets: memEntry.assets,
        };
      }
      this.memoryCache.delete(key);
    }

    // 2. LocalStorage Cache
    if (typeof localStorage !== 'undefined') {
      try {
        const item = localStorage.getItem(`${this.storagePrefix}${key}`);
        if (item) {
          const parsed: ImageCacheEntry = JSON.parse(item);
          if (parsed.expiresAt > now) {
            this.memoryCache.set(key, parsed);
            return {
              quality: parsed.quality,
              questions: parsed.questions,
              assets: parsed.assets,
            };
          }
          localStorage.removeItem(`${this.storagePrefix}${key}`);
        }
      } catch {}
    }

    return null;
  }

  set(
    imageHash: string,
    quality: ImageQualityAssessment,
    questions: CanonicalQuestion[],
    assets: CanonicalAsset[],
    ttlSeconds: number = DEFAULT_TTL_SECONDS
  ): void {
    const key = this.buildKey(imageHash);
    const now = Date.now();
    const entry: ImageCacheEntry = {
      imageHash,
      quality,
      questions,
      assets,
      cachedAt: now,
      expiresAt: now + ttlSeconds * 1000,
    };

    // 1. Memory
    this.memoryCache.set(key, entry);

    // 2. Storage
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`${this.storagePrefix}${key}`, JSON.stringify(entry));
      } catch {}
    }
  }

  has(imageHash: string): boolean {
    return this.get(imageHash) !== null;
  }

  clear(): void {
    this.memoryCache.clear();
    if (typeof localStorage !== 'undefined') {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(this.storagePrefix)) {
            keysToRemove.push(k);
          }
        }
        for (const k of keysToRemove) {
          localStorage.removeItem(k);
        }
      } catch {}
    }
  }

  getStats(): { memoryCount: number } {
    return { memoryCount: this.memoryCache.size };
  }
}

export const imageIngestionCache = new ImageIngestionCacheManager();
