/**
 * Web Ingestion Cache
 * High-performance dual-tier caching (in-memory Map + localStorage)
 * Keyed by normalizedUrl + contentHash with 2-hour TTL.
 * Avoids repeated network downloads and expensive DOM parsing.
 */

import { WebDocumentIR, WebSemanticChunk } from './types';

interface WebCacheEntry {
  url: string;
  contentHash: string;
  documentIR: WebDocumentIR;
  chunks: WebSemanticChunk[];
  cachedAt: number;
  expiresAt: number;
}

const DEFAULT_TTL_SECONDS = 7200; // 2 hours

class WebIngestionCacheManager {
  private memoryCache: Map<string, WebCacheEntry> = new Map();
  private storagePrefix = 'mockai_web_cache:';

  private buildKey(url: string, contentHash: string = ''): string {
    return `${url.trim().toLowerCase()}:${contentHash.trim()}`;
  }

  /**
   * Retrieves a cached document IR and chunks if unexpired.
   */
  get(url: string, contentHash?: string): { documentIR: WebDocumentIR; chunks: WebSemanticChunk[] } | null {
    const normUrl = url.trim().toLowerCase();
    const now = Date.now();

    // 1. If explicit contentHash provided
    if (contentHash) {
      const key = this.buildKey(normUrl, contentHash);
      const memEntry = this.memoryCache.get(key);
      if (memEntry) {
        if (memEntry.expiresAt > now) {
          return { documentIR: memEntry.documentIR, chunks: memEntry.chunks };
        }
        this.memoryCache.delete(key);
      }

      if (typeof localStorage !== 'undefined') {
        try {
          const item = localStorage.getItem(`${this.storagePrefix}${key}`);
          if (item) {
            const parsed: WebCacheEntry = JSON.parse(item);
            if (parsed.expiresAt > now) {
              this.memoryCache.set(key, parsed);
              return { documentIR: parsed.documentIR, chunks: parsed.chunks };
            }
            localStorage.removeItem(`${this.storagePrefix}${key}`);
          }
        } catch {}
      }
      return null;
    }

    // 2. If contentHash not provided, match any unexpired key matching `${normUrl}:`
    for (const [key, memEntry] of this.memoryCache.entries()) {
      if (key.startsWith(`${normUrl}:`)) {
        if (memEntry.expiresAt > now) {
          return { documentIR: memEntry.documentIR, chunks: memEntry.chunks };
        }
        this.memoryCache.delete(key);
      }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const prefix = `${this.storagePrefix}${normUrl}:`;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix)) {
            const item = localStorage.getItem(k);
            if (item) {
              const parsed: WebCacheEntry = JSON.parse(item);
              if (parsed.expiresAt > now) {
                const pureKey = k.slice(this.storagePrefix.length);
                this.memoryCache.set(pureKey, parsed);
                return { documentIR: parsed.documentIR, chunks: parsed.chunks };
              }
              localStorage.removeItem(k);
            }
          }
        }
      } catch {}
    }

    return null;
  }

  /**
   * Stores a parsed document and its chunks in cache.
   */
  set(
    url: string,
    contentHash: string,
    documentIR: WebDocumentIR,
    chunks: WebSemanticChunk[],
    ttlSeconds: number = DEFAULT_TTL_SECONDS
  ): void {
    const key = this.buildKey(url, contentHash);
    const now = Date.now();
    const entry: WebCacheEntry = {
      url: url.trim().toLowerCase(),
      contentHash,
      documentIR,
      chunks,
      cachedAt: now,
      expiresAt: now + ttlSeconds * 1000,
    };

    // 1. Set in memory
    this.memoryCache.set(key, entry);

    // 2. Set in localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`${this.storagePrefix}${key}`, JSON.stringify(entry));
      } catch {}
    }
  }

  /**
   * Checks whether an unexpired cache entry exists for this URL.
   */
  has(url: string, contentHash?: string): boolean {
    return this.get(url, contentHash) !== null;
  }

  /**
   * Clears memory and localStorage caches.
   */
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

export const webIngestionCache = new WebIngestionCacheManager();
