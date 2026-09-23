/**
 * MOCK.AI — Supabase Content Client (Project 2)
 *
 * This is a SEPARATE Supabase client from the auth client in services/supabase.ts.
 *
 * Project 1 (auth): VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
 * Project 2 (content): VITE_SUPABASE_CONTENT_URL + VITE_SUPABASE_CONTENT_KEY
 *
 * DO NOT import this file from supabase.ts or mix with auth operations.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const CONTENT_URL: string =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_SUPABASE_CONTENT_URL) ||
  '';

const CONTENT_KEY: string =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_SUPABASE_CONTENT_KEY) ||
  '';

/**
 * Returns true if Project 2 environment variables are configured.
 * When false, repositories fall back to local JSON data.
 */
export function isContentBackendAvailable(): boolean {
  return Boolean(CONTENT_URL && CONTENT_KEY);
}

/**
 * Supabase client connected to Project 2 (exam content).
 * Returns null when env vars are not configured (local fallback mode).
 */
let _contentClient: SupabaseClient | null = null;

export function getContentClient(): SupabaseClient | null {
  if (!isContentBackendAvailable()) return null;
  if (!_contentClient) {
    _contentClient = createClient(CONTENT_URL, CONTENT_KEY, {
      auth: {
        // No auth operations in Project 2 — disable session persistence
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return _contentClient;
}

/**
 * Returns the base public URL for Supabase Storage in Project 2.
 * Used to construct CDN URLs for exam images.
 */
export function getStorageBaseUrl(): string {
  if (!CONTENT_URL) return '';
  return `${CONTENT_URL}/storage/v1/object/public/exam-assets`;
}

/**
 * Converts a local public asset path to the Supabase Storage CDN URL.
 *
 * Example:
 *   '/exam-assets/gate/2025/cs-1/q5_diag.png'
 *   → 'https://nvvscqxsrechenyqcwli.supabase.co/storage/v1/object/public/exam-assets/gate/2025/cs-1/q5_diag.png'
 *
 * Falls back to the original local path when Project 2 is not configured.
 */
export function resolveAssetUrl(localPath: string | null | undefined): string | null {
  if (!localPath) return null;
  if (!isContentBackendAvailable()) return localPath;

  // Strip leading '/exam-assets/' prefix since the bucket is 'exam-assets'
  const stripped = localPath.replace(/^\/exam-assets\//, '');
  return `${getStorageBaseUrl()}/${stripped}`;
}
