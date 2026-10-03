/**
 * YouTube URL Validator & Security Filter
 * Validates YouTube URLs, extracts 11-char Video IDs, and strictly prevents SSRF attacks.
 */

export interface UrlValidationResult {
  valid: boolean;
  videoId?: string;
  canonicalUrl?: string;
  error?: string;
  isSsrfAttempt?: boolean;
}

// Allowed YouTube domain names
const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'music.youtube.com',
]);

// Private and link-local IP patterns (IPv4 and IPv6)
const DISALLOWED_IP_PATTERNS = [
  /^localhost$/i,
  /^127(?:\.[0-9]+){3}$/, // 127.0.0.0/8 Loopback
  /^0\.0\.0\.0$/,
  /^::1$/, // IPv6 loopback
  /^10(?:\.[0-9]+){3}$/, // 10.0.0.0/8 Private
  /^192\.168(?:\.[0-9]+){2}$/, // 192.168.0.0/16 Private
  /^172\.(?:1[6-9]|2[0-9]|3[0-1])(?:\.[0-9]+){2}$/, // 172.16.0.0/12 Private
  /^169\.254(?:\.[0-9]+){2}$/, // 169.254.0.0/16 Link-local / Cloud metadata (AWS, GCP, Azure)
  /^fc00:/i, // IPv6 Unique Local
  /^fe80:/i, // IPv6 Link-Local
];

/**
 * Strict 11-character video ID validation
 */
export function isValidVideoId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9A-Za-z_-]{11}$/.test(id);
}

/**
 * Extracts YouTube Video ID from any valid YouTube URL format.
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // If already an isolated valid 11-character video ID
  if (isValidVideoId(trimmed)) {
    return trimmed;
  }

  try {
    // Add protocol if omitted
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase();

    // Check host validity
    const isAllowedHost =
      ALLOWED_HOSTS.has(host) ||
      host.endsWith('.youtube.com') ||
      host.endsWith('.youtu.be');

    if (!isAllowedHost) return null;

    // Pattern 1: youtu.be/VIDEO_ID
    if (host === 'youtu.be' || host === 'www.youtu.be') {
      const pathPart = parsed.pathname.slice(1).split(/[?#&/]/)[0];
      if (isValidVideoId(pathPart)) return pathPart;
    }

    // Pattern 2: /watch?v=VIDEO_ID
    const vParam = parsed.searchParams.get('v');
    if (vParam && isValidVideoId(vParam)) {
      return vParam;
    }

    // Pattern 3: /shorts/VIDEO_ID
    const shortsMatch = parsed.pathname.match(/\/shorts\/([0-9A-Za-z_-]{11})/);
    if (shortsMatch && isValidVideoId(shortsMatch[1])) {
      return shortsMatch[1];
    }

    // Pattern 4: /embed/VIDEO_ID
    const embedMatch = parsed.pathname.match(/\/embed\/([0-9A-Za-z_-]{11})/);
    if (embedMatch && isValidVideoId(embedMatch[1])) {
      return embedMatch[1];
    }

    // Pattern 5: /v/VIDEO_ID
    const vPathMatch = parsed.pathname.match(/\/v\/([0-9A-Za-z_-]{11})/);
    if (vPathMatch && isValidVideoId(vPathMatch[1])) {
      return vPathMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Validates YouTube URL with strict SSRF protection and canonicalization.
 */
export function validateYouTubeUrl(url: string): UrlValidationResult {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return { valid: false, error: 'YouTube URL cannot be empty.' };
  }

  const trimmed = url.trim();

  // If already an isolated valid 11-character video ID
  if (isValidVideoId(trimmed)) {
    return {
      valid: true,
      videoId: trimmed,
      canonicalUrl: `https://www.youtube.com/watch?v=${trimmed}`,
    };
  }

  // Reject dangerous schemes
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('ftp:') ||
    lower.startsWith('blob:')
  ) {
    return {
      valid: false,
      error: 'Invalid URL scheme. Only HTTP and HTTPS protocols are permitted.',
      isSsrfAttempt: true,
    };
  }

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase();

    // Check disallowed IP addresses (SSRF guard)
    for (const pattern of DISALLOWED_IP_PATTERNS) {
      if (pattern.test(host)) {
        return {
          valid: false,
          error: 'Access to internal network or cloud metadata IP addresses is strictly prohibited.',
          isSsrfAttempt: true,
        };
      }
    }

    // Verify allowed YouTube domains
    const isAllowedHost =
      ALLOWED_HOSTS.has(host) ||
      (host.endsWith('.youtube.com') && !host.includes('..')) ||
      (host.endsWith('.youtu.be') && !host.includes('..'));

    if (!isAllowedHost) {
      return {
        valid: false,
        error: `Invalid YouTube URL: Invalid domain "${host}". Please provide a valid YouTube URL (e.g. youtube.com or youtu.be).`,
      };
    }

    // Verify non-standard ports are rejected
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
      return {
        valid: false,
        error: `Invalid YouTube URL: Non-standard port "${parsed.port}" is not permitted for YouTube video URLs.`,
        isSsrfAttempt: true,
      };
    }

    // Extract video ID
    const videoId = extractYouTubeVideoId(trimmed);
    if (!videoId) {
      return {
        valid: false,
        error: 'Invalid YouTube URL: Could not extract a valid 11-character YouTube video ID. Please check the URL format.',
      };
    }

    return {
      valid: true,
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  } catch (err: any) {
    return {
      valid: false,
      error: `Malformed URL: ${err?.message || 'Invalid URL syntax'}`,
    };
  }
}
