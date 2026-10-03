/**
 * Web URL Security & SSRF Protection Subsystem
 * Hardened validation against private network probing, cloud metadata access,
 * protocol abuse, and redirect-based SSRF vectors.
 */

export interface UrlSecurityCheckResult {
  safe: boolean;
  normalizedUrl?: string;
  isSsrfAttempt?: boolean;
  reason?: string;
}

// Disallowed internal hostname suffixes
const INTERNAL_HOST_SUFFIXES = [
  '.local',
  '.internal',
  '.lan',
  '.corp',
  '.test',
  '.home',
  '.home.arpa',
  '.intranet',
  '.onion',
];

// Disallowed cloud metadata and loopback hostnames
const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  'instance-data',
  'metadata',
  '169.254.169.254',
]);

/**
 * Validates whether an IP address belongs to private, loopback, link-local, or cloud metadata ranges.
 */
export function isPrivateOrReservedIp(ip: string): { isPrivate: boolean; reason?: string } {
  // IPv4 validation
  const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const o1 = parseInt(ipv4Match[1], 10);
    const o2 = parseInt(ipv4Match[2], 10);
    const o3 = parseInt(ipv4Match[3], 10);
    const o4 = parseInt(ipv4Match[4], 10);

    if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) {
      return { isPrivate: true, reason: 'Invalid IPv4 octet range.' };
    }

    // 0.0.0.0/8 Current network
    if (o1 === 0) return { isPrivate: true, reason: 'Access to 0.0.0.0/8 source network is prohibited.' };

    // 10.0.0.0/8 Private network (RFC 1918)
    if (o1 === 10) return { isPrivate: true, reason: 'Access to private 10.0.0.0/8 network is prohibited.' };

    // 100.64.0.0/10 Carrier-grade NAT (RFC 6598)
    if (o1 === 100 && o2 >= 64 && o2 <= 127) {
      return { isPrivate: true, reason: 'Access to carrier-grade NAT 100.64.0.0/10 is prohibited.' };
    }

    // 127.0.0.0/8 Loopback (RFC 1122)
    if (o1 === 127) return { isPrivate: true, reason: 'Access to loopback 127.0.0.0/8 is prohibited.' };

    // 169.254.0.0/16 Link-local / Cloud metadata (AWS, GCP, Azure, OpenStack)
    if (o1 === 169 && o2 === 254) {
      return { isPrivate: true, reason: 'Access to link-local cloud metadata (169.254.0.0/16) is prohibited.' };
    }

    // 172.16.0.0/12 Private network (RFC 1918)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) {
      return { isPrivate: true, reason: 'Access to private 172.16.0.0/12 network is prohibited.' };
    }

    // 192.168.0.0/16 Private network (RFC 1918)
    if (o1 === 192 && o2 === 168) {
      return { isPrivate: true, reason: 'Access to private 192.168.0.0/16 network is prohibited.' };
    }

    // 224.0.0.0/4 Multicast
    if (o1 >= 224 && o1 <= 239) {
      return { isPrivate: true, reason: 'Access to multicast IP range is prohibited.' };
    }

    // 240.0.0.0/4 Reserved
    if (o1 >= 240) {
      return { isPrivate: true, reason: 'Access to reserved IP range is prohibited.' };
    }
  }

  // IPv6 validation
  const lowerIp = ip.toLowerCase();
  if (lowerIp === '::1' || lowerIp === '0:0:0:0:0:0:0:1') {
    return { isPrivate: true, reason: 'Access to IPv6 loopback (::1) is prohibited.' };
  }
  if (lowerIp.startsWith('fc00:') || lowerIp.startsWith('fd00:')) {
    return { isPrivate: true, reason: 'Access to IPv6 Unique Local Address range (fc00::/7) is prohibited.' };
  }
  if (lowerIp.startsWith('fe80:')) {
    return { isPrivate: true, reason: 'Access to IPv6 Link-Local range (fe80::/10) is prohibited.' };
  }

  return { isPrivate: false };
}

/**
 * Validates a Web URL string for security, schema compliance, and SSRF vulnerabilities.
 */
export function validateWebUrl(urlString: string): UrlSecurityCheckResult {
  if (!urlString || typeof urlString !== 'string' || !urlString.trim()) {
    return { safe: false, reason: 'URL cannot be empty.' };
  }

  const trimmed = urlString.trim();

  // Reject dangerous pseudo-protocols before URL parsing
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('ftp:') ||
    lower.startsWith('gopher:')
  ) {
    return {
      safe: false,
      isSsrfAttempt: true,
      reason: `Protocol scheme is prohibited. Only HTTP and HTTPS protocols are permitted.`,
    };
  }

  try {
    const parsed = new URL(trimmed);

    // 1. Enforce HTTP/HTTPS protocol
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        safe: false,
        isSsrfAttempt: true,
        reason: `Protocol "${parsed.protocol}" is prohibited. Only HTTP and HTTPS are allowed.`,
      };
    }

    // 2. Reject non-standard ports (allowed: default 80, 443, or empty)
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
      return {
        safe: false,
        isSsrfAttempt: true,
        reason: `Non-standard port "${parsed.port}" is not permitted for web ingestion.`,
      };
    }

    const host = parsed.hostname.toLowerCase();

    // 3. Block loopback, cloud metadata, and internal hostnames
    if (BLOCKED_HOSTS.has(host)) {
      return {
        safe: false,
        isSsrfAttempt: true,
        reason: `Access to loopback or cloud instance metadata host "${host}" is strictly prohibited.`,
      };
    }

    for (const suffix of INTERNAL_HOST_SUFFIXES) {
      if (host.endsWith(suffix)) {
        return {
          safe: false,
          isSsrfAttempt: true,
          reason: `Access to internal domain suffix "${suffix}" is prohibited.`,
        };
      }
    }

    // 4. Check for private/reserved IP patterns
    const ipCheck = isPrivateOrReservedIp(host);
    if (ipCheck.isPrivate) {
      return {
        safe: false,
        isSsrfAttempt: true,
        reason: ipCheck.reason || 'Access to private or reserved IP network is prohibited.',
      };
    }

    // 5. Build normalized URL (strips fragment #, canonicalizes scheme & host)
    const normalizedUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;

    return {
      safe: true,
      normalizedUrl,
    };
  } catch (err: any) {
    return {
      safe: false,
      reason: `Malformed URL: ${err?.message || 'Invalid URL syntax'}`,
    };
  }
}

/**
 * Backwards-compatible alias for existing callers and test suites.
 */
export function isSafePublicUrl(urlString: string): { safe: boolean; reason?: string } {
  const result = validateWebUrl(urlString);
  return {
    safe: result.safe,
    reason: result.reason,
  };
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  finalUrl: string;
  contentType: string;
  contentLength: number;
  body: string;
  redirectCount: number;
}

export interface SafeFetchOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  mockResponse?: {
    status: number;
    contentType?: string;
    html: string;
    headers?: Record<string, string>;
  };
}

/**
 * Executes a network fetch while strictly verifying each redirect hop against SSRF rules.
 * Prevents redirect-based attacks where a public URL 302-redirects to internal metadata (e.g. 169.254.169.254).
 */
export async function safeFetchWithSsrfGuard(
  initialUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? 5;
  const timeoutMs = options.timeoutMs ?? 15000;
  let currentUrl = initialUrl;
  let redirectCount = 0;
  const visitedUrls = new Set<string>();

  // If mock response provided (for unit tests / staging mocks)
  if (options.mockResponse) {
    const check = validateWebUrl(initialUrl);
    if (!check.safe) {
      throw new Error(`SSRF security violation: ${check.reason}`);
    }
    return {
      ok: options.mockResponse.status >= 200 && options.mockResponse.status < 300,
      status: options.mockResponse.status,
      statusText: options.mockResponse.status === 200 ? 'OK' : 'Error',
      finalUrl: initialUrl,
      contentType: options.mockResponse.contentType || 'text/html; charset=utf-8',
      contentLength: options.mockResponse.html.length,
      body: options.mockResponse.html,
      redirectCount: 0,
    };
  }

  while (redirectCount <= maxRedirects) {
    // 1. Re-validate every URL (including every redirect destination)
    const check = validateWebUrl(currentUrl);
    if (!check.safe) {
      const err = new Error(
        redirectCount > 0
          ? `Redirect SSRF violation: Redirect target "${currentUrl}" is blocked. ${check.reason}`
          : `SSRF security violation: ${check.reason}`
      );
      (err as any).isSsrf = true;
      (err as any).code = redirectCount > 0 ? 'REDIRECT_SSRF_BLOCKED' : 'SSRF_BLOCKED';
      throw err;
    }

    if (visitedUrls.has(currentUrl)) {
      const err = new Error(`Circular redirect loop detected at ${currentUrl}`);
      (err as any).code = 'TOO_MANY_REDIRECTS';
      throw err;
    }
    visitedUrls.add(currentUrl);

    // 2. Perform manual redirect fetch
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
          'User-Agent': 'MockAI-Ingestion-Bot/1.0 (+https://mockai.org/bot; educational exam preparation)',
          ...(options.headers || {}),
        },
        redirect: 'manual', // Intercept all redirects to revalidate target
        signal: controller?.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      // 3. Handle redirects (301, 302, 303, 307, 308)
      if (
        response.status === 301 ||
        response.status === 302 ||
        response.status === 303 ||
        response.status === 307 ||
        response.status === 308
      ) {
        const locationHeader = response.headers.get('location');
        if (!locationHeader) {
          throw new Error(`HTTP ${response.status} redirect missing Location header.`);
        }

        // Resolve relative redirect against current URL
        const nextUrl = new URL(locationHeader, currentUrl).toString();
        currentUrl = nextUrl;
        redirectCount++;
        continue;
      }

      // 4. Final destination reached
      const contentType = response.headers.get('content-type') || 'text/html';
      const body = await response.text();

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        finalUrl: currentUrl,
        contentType,
        contentLength: body.length,
        body,
        redirectCount,
      };
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      if (err?.isSsrf) throw err;
      if (err?.name === 'AbortError') {
        const timeoutErr = new Error(`Network timeout fetching ${currentUrl} after ${timeoutMs}ms.`);
        (timeoutErr as any).code = 'SOURCE_UNAVAILABLE';
        throw timeoutErr;
      }
      throw err;
    }
  }

  const limitErr = new Error(`Exceeded maximum redirect limit (${maxRedirects} hops) for ${initialUrl}`);
  (limitErr as any).code = 'TOO_MANY_REDIRECTS';
  throw limitErr;
}
