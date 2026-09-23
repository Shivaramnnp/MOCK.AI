/**
 * Asset Repository — Project 2
 *
 * Utility functions for resolving exam content image URLs.
 * Handles the transition from local static files → Supabase Storage CDN.
 */

import { resolveAssetUrl, getStorageBaseUrl, isContentBackendAvailable } from '../lib/supabaseContent';

export const assetRepository = {
  /**
   * Resolve a local public path or storage path to the correct URL.
   *
   * Examples:
   *   '/exam-assets/gate/2025/cs-1/q5_diag.png'
   *     → 'https://nvvscqxsrechenyqcwli.supabase.co/storage/v1/object/public/exam-assets/gate/2025/cs-1/q5_diag.png'
   *     (when Project 2 is configured)
   *
   *   '/exam-assets/gate/2025/cs-1/q5_diag.png'
   *     → '/exam-assets/gate/2025/cs-1/q5_diag.png'
   *     (when Project 2 is not configured — local fallback)
   */
  resolveUrl(path: string | null | undefined): string | null {
    return resolveAssetUrl(path);
  },

  /**
   * Get the Supabase Storage base URL for the exam-assets bucket.
   */
  getStorageBase(): string {
    return getStorageBaseUrl();
  },

  /**
   * Returns true when exam images are served from Supabase Storage CDN.
   */
  isRemote(): boolean {
    return isContentBackendAvailable();
  },
};
