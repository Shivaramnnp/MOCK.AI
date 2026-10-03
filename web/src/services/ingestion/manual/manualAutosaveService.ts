/**
 * Intelligent Debounced Autosave Service for Manual Question Authoring
 * Mock.AI Production Ingestion Engine - Prompt 9/10
 *
 * Avoids saving the entire document on every keystroke.
 * Debounces keystrokes (600ms) and persists to local client storage.
 */

import { AutosavePayload } from './types';

class ManualAutosaveService {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private lastSavedHashes: Map<string, string> = new Map();

  private getStorageKey(testId: string): string {
    return `mockai_manual_draft_${testId}`;
  }

  /**
   * Schedules a debounced autosave.
   */
  scheduleAutosave(
    payload: AutosavePayload,
    onSaved?: (savedAt: number) => void,
    delayMs = 600
  ): void {
    const key = this.getStorageKey(payload.testId);

    // Cancel pending timer for this test
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
      this.timers.delete(key);
    }

    const timer = setTimeout(() => {
      this.persistNow(payload);
      if (onSaved) {
        onSaved(Date.now());
      }
      this.timers.delete(key);
    }, delayMs);

    this.timers.set(key, timer);
  }

  /**
   * Persists immediately without debouncing.
   */
  persistNow(payload: AutosavePayload): boolean {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }

    const key = this.getStorageKey(payload.testId);
    const serialized = JSON.stringify({
      ...payload,
      updatedAt: Date.now(),
    });

    // Check if content hash actually changed
    const currentHash = String(serialized.length) + serialized.slice(0, 100);
    if (this.lastSavedHashes.get(key) === currentHash) {
      return false; // Skip redundant write
    }

    try {
      window.localStorage.setItem(key, serialized);
      this.lastSavedHashes.set(key, currentHash);
      return true;
    } catch (e) {
      console.warn('Failed to persist manual editor draft:', e);
      return false;
    }
  }

  /**
   * Loads an existing draft from storage.
   */
  loadDraft(testId: string): AutosavePayload | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    const key = this.getStorageKey(testId);
    try {
      const item = window.localStorage.getItem(key);
      if (!item) return null;
      return JSON.parse(item) as AutosavePayload;
    } catch {
      return null;
    }
  }

  /**
   * Removes saved draft upon final publication or discard.
   */
  clearDraft(testId: string): void {
    const key = this.getStorageKey(testId);
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
      this.timers.delete(key);
    }
    this.lastSavedHashes.delete(key);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }
}

export const manualAutosaveService = new ManualAutosaveService();
