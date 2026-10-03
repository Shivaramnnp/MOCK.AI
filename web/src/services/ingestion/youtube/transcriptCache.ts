/**
 * YouTube Transcript Cache
 * High-performance dual-tier caching (in-memory + local storage) keyed by videoId + transcriptVersion.
 * Prevents redundant network downloads and expensive transcript processing.
 */

import { YouTubeTranscriptResult } from './types';

interface CacheEntry {
  result: YouTubeTranscriptResult;
  cachedAt: number;
  expiresAt: number;
}

const DEFAULT_TTL_SECONDS = 7200; // 2 hours

class YouTubeTranscriptCacheManager {
  private memoryCache: Map<string, CacheEntry> = new Map();
  private storagePrefix = 'mockai_yt_transcript:';

  private buildKey(videoId: string, version: string = 'v1'): string {
    return `${videoId.trim()}:${version.trim()}`;
  }

  /**
   * Retrieves a cached transcript result if present and unexpired.
   */
  get(videoId: string, version?: string): YouTubeTranscriptResult | null {
    const trimmedId = videoId.trim();
    const now = Date.now();

    // 1. If explicit version is specified
    if (version) {
      const key = this.buildKey(trimmedId, version);
      const memEntry = this.memoryCache.get(key);
      if (memEntry) {
        if (memEntry.expiresAt > now) {
          return memEntry.result;
        }
        this.memoryCache.delete(key);
      }

      if (typeof localStorage !== 'undefined') {
        try {
          const item = localStorage.getItem(`${this.storagePrefix}${key}`);
          if (item) {
            const parsed: CacheEntry = JSON.parse(item);
            if (parsed.expiresAt > now) {
              this.memoryCache.set(key, parsed);
              return parsed.result;
            }
            localStorage.removeItem(`${this.storagePrefix}${key}`);
          }
        } catch {}
      }
      return null;
    }

    // 2. If version not provided, search for any unexpired key matching `${trimmedId}:`
    for (const [key, memEntry] of this.memoryCache.entries()) {
      if (key.startsWith(`${trimmedId}:`)) {
        if (memEntry.expiresAt > now) {
          return memEntry.result;
        }
        this.memoryCache.delete(key);
      }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const prefix = `${this.storagePrefix}${trimmedId}:`;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix)) {
            const item = localStorage.getItem(k);
            if (item) {
              const parsed: CacheEntry = JSON.parse(item);
              if (parsed.expiresAt > now) {
                const pureKey = k.slice(this.storagePrefix.length);
                this.memoryCache.set(pureKey, parsed);
                return parsed.result;
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
   * Stores a transcript result in cache.
   */
  set(
    videoId: string,
    versionOrResult: string | YouTubeTranscriptResult,
    resultOrTtl?: YouTubeTranscriptResult | number,
    ttlSeconds: number = DEFAULT_TTL_SECONDS
  ): void {
    let version = 'v1';
    let result: YouTubeTranscriptResult;
    let ttl = ttlSeconds;

    if (typeof versionOrResult === 'string') {
      version = versionOrResult;
      result = resultOrTtl as YouTubeTranscriptResult;
    } else {
      result = versionOrResult;
      version = result.version || 'v1';
      if (typeof resultOrTtl === 'number') {
        ttl = resultOrTtl;
      }
    }

    if (!result) return;

    const key = this.buildKey(videoId, version);
    const now = Date.now();
    const entry: CacheEntry = {
      result,
      cachedAt: now,
      expiresAt: now + ttl * 1000,
    };

    // 1. Set in-memory Map
    this.memoryCache.set(key, entry);

    // 2. Set in localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`${this.storagePrefix}${key}`, JSON.stringify(entry));
      } catch {
        // QuotaExceeded or disabled localStorage
      }
    }
  }

  /**
   * Checks if an active cache entry exists.
   */
  has(videoId: string, version?: string): boolean {
    return this.get(videoId, version) !== null;
  }

  /**
   * Clears in-memory and local storage cache.
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
      } catch {
        // Ignore storage access errors
      }
    }
  }

  getStats(): { memoryCount: number } {
    return { memoryCount: this.memoryCache.size };
  }
}

export const youtubeTranscriptCache = new YouTubeTranscriptCacheManager();
