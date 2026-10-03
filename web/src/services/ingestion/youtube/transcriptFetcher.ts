/**
 * YouTube Transcript & Metadata Fetcher
 * Multi-tiered official & authorized transcript acquisition pipeline.
 * Supports manual captions, automatic captions, Innertube API, and microservice fallbacks.
 * Employs explicit failure states: SOURCE_UNAVAILABLE, PRIVATE_OR_DELETED, TRANSCRIPT_DISABLED, etc.
 */

import {
  YouTubeCaptionTrack,
  YouTubeFailureReason,
  YouTubeTranscriptResult,
  YouTubeTranscriptSegment,
  YouTubeVideoMetadata,
} from './types';
import { validateYouTubeUrl } from './urlValidator';

export class YouTubeFetchError extends Error {
  readonly code: YouTubeFailureReason;
  readonly videoId: string;
  readonly details?: string;

  constructor(code: YouTubeFailureReason, videoId: string, message: string, details?: string) {
    super(message);
    this.name = 'YouTubeFetchError';
    this.code = code;
    this.videoId = videoId;
    this.details = details;
  }
}

/**
 * Formats a duration in seconds into human-readable "MM:SS" or "HH:MM:SS".
 */
export function formatTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const totalSec = Math.floor(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');

  if (hrs > 0) {
    const hh = String(hrs).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Fetches basic video metadata using YouTube's official public oEmbed API.
 */
export async function fetchYouTubeOEmbed(videoId: string): Promise<Partial<YouTubeVideoMetadata>> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (res.status === 404 || res.status === 401 || res.status === 403) {
      throw new YouTubeFetchError(
        'PRIVATE_OR_DELETED',
        videoId,
        `YouTube video (${videoId}) is private, deleted, or unavailable.`,
        `oEmbed HTTP ${res.status}`
      );
    }

    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title || `YouTube Video (${videoId})`,
        author: data.author_name || 'YouTube Creator',
        authorUrl: data.author_url,
        thumbnailUrl: data.thumbnail_url,
      };
    }
  } catch (err) {
    if (err instanceof YouTubeFetchError) throw err;
    // Non-fatal: continue with fallback metadata
  }

  return {
    title: `YouTube Video (${videoId})`,
    author: 'YouTube Creator',
  };
}

/**
 * Parses YouTube JSON3 timedtext structure.
 */
export function parseJson3TimedText(json: any): YouTubeTranscriptSegment[] {
  if (!json || !Array.isArray(json.events)) return [];

  const segments: YouTubeTranscriptSegment[] = [];

  for (const ev of json.events) {
    if (ev.tStartMs === undefined) continue;
    const startSec = parseFloat((ev.tStartMs / 1000).toFixed(2));
    const durationSec = parseFloat(((ev.dDurationMs || 0) / 1000).toFixed(2));
    const endSec = parseFloat((startSec + durationSec).toFixed(2));

    let text = '';
    if (Array.isArray(ev.segs)) {
      text = ev.segs.map((s: any) => s.utf8 || '').join('');
    } else if (typeof ev.text === 'string') {
      text = ev.text;
    }

    text = text.replace(/[\n\r]+/g, ' ').trim();
    if (text) {
      segments.push({
        start: startSec,
        duration: durationSec,
        end: endSec,
        text,
        formattedStart: formatTimestamp(startSec),
        formattedEnd: formatTimestamp(endSec),
      });
    }
  }

  return segments;
}

/**
 * Parses YouTube XML timedtext format: <text start="1.5" dur="3.2">Hello world</text>
 */
export function parseXmlTimedText(xml: string): YouTubeTranscriptSegment[] {
  if (!xml || typeof xml !== 'string') return [];

  const segments: YouTubeTranscriptSegment[] = [];
  const textTagRegex = /<text\s+start="([0-9.]+)"\s+dur="([0-9.]+)"[^>]*>([\s\S]*?)<\/text>/gi;

  let match: RegExpExecArray | null;
  while ((match = textTagRegex.exec(xml)) !== null) {
    const startSec = parseFloat(parseFloat(match[1]).toFixed(2));
    const durationSec = parseFloat(parseFloat(match[2]).toFixed(2));
    const endSec = parseFloat((startSec + durationSec).toFixed(2));

    // Decode minimal entities from XML
    const rawText = match[3]
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/[\n\r]+/g, ' ')
      .trim();

    if (rawText) {
      segments.push({
        start: startSec,
        duration: durationSec,
        end: endSec,
        text: rawText,
        formattedStart: formatTimestamp(startSec),
        formattedEnd: formatTimestamp(endSec),
      });
    }
  }

  return segments;
}

/**
 * Fetches transcript and metadata across tiered providers.
 */
export async function fetchYouTubeTranscript(
  urlOrId: string,
  preferredLanguage: string = 'en'
): Promise<YouTubeTranscriptResult> {
  const urlCheck = validateYouTubeUrl(urlOrId);
  if (!urlCheck.valid || !urlCheck.videoId) {
    throw new YouTubeFetchError(
      urlCheck.isSsrfAttempt ? 'SSRF_BLOCKED' : 'INVALID_URL',
      urlOrId,
      urlCheck.error || 'Invalid YouTube URL provided.'
    );
  }

  const videoId = urlCheck.videoId;

  // 1. Fetch official oEmbed metadata
  const oEmbedData = await fetchYouTubeOEmbed(videoId);

  // 2. Tier 1: YouTube Innertube / Player Web API
  try {
    const playerResponse = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00',
            hl: preferredLanguage,
          },
        },
      }),
    });

    if (playerResponse.status === 429) {
      throw new YouTubeFetchError(
        'RATE_LIMITED',
        videoId,
        'YouTube rate limit encountered. Please retry in a few moments.'
      );
    }

    if (playerResponse.ok) {
      const pData = await playerResponse.json();
      const status = pData.playabilityStatus?.status;

      if (status === 'UNPLAYABLE' || status === 'ERROR' || status === 'LOGIN_REQUIRED') {
        const reason = pData.playabilityStatus?.reason || 'Video is private, restricted, or deleted.';
        throw new YouTubeFetchError('PRIVATE_OR_DELETED', videoId, reason);
      }

      const captionRenderer = pData.captions?.playerCaptionsTracklistRenderer;
      const tracks: YouTubeCaptionTrack[] = [];

      if (captionRenderer && Array.isArray(captionRenderer.captionTracks)) {
        for (const t of captionRenderer.captionTracks) {
          tracks.push({
            languageCode: t.languageCode,
            name: t.name?.simpleText || t.languageCode,
            isAutoGenerated: t.vssId?.startsWith('a.') || t.kind === 'asr',
            baseUrl: t.baseUrl,
          });
        }
      }

      if (tracks.length > 0) {
        // Select preferred language or closest track
        const selectedTrack =
          tracks.find((t) => t.languageCode.startsWith(preferredLanguage) && !t.isAutoGenerated) ||
          tracks.find((t) => t.languageCode.startsWith(preferredLanguage)) ||
          tracks.find((t) => !t.isAutoGenerated) ||
          tracks[0];

        if (selectedTrack.baseUrl) {
          // Fetch timedtext JSON3
          const timedTextRes = await fetch(`${selectedTrack.baseUrl}&fmt=json3`);
          if (timedTextRes.ok) {
            const timedTextJson = await timedTextRes.json();
            const segments = parseJson3TimedText(timedTextJson);

            if (segments.length > 0) {
              const fullText = segments.map((s) => s.text).join(' ');
              const metadata: YouTubeVideoMetadata = {
                videoId,
                title: pData.videoDetails?.title || oEmbedData.title || `YouTube Video (${videoId})`,
                author: pData.videoDetails?.author || oEmbedData.author || 'YouTube Creator',
                authorUrl: oEmbedData.authorUrl,
                durationSeconds: parseInt(pData.videoDetails?.lengthSeconds || '0', 10) || undefined,
                thumbnailUrl: oEmbedData.thumbnailUrl,
                availableLanguages: tracks.map((t) => t.languageCode),
                captionsAvailable: true,
              };

              return {
                videoId,
                title: metadata.title,
                metadata,
                captionType: selectedTrack.isAutoGenerated ? 'AUTOMATIC' : 'MANUAL',
                language: selectedTrack.languageCode,
                segments,
                rawText: fullText,
                normalizedText: fullText,
                version: `${videoId}-${selectedTrack.languageCode}-${selectedTrack.isAutoGenerated ? 'auto' : 'man'}-v1`,
                fetchedAt: Date.now(),
              };
            }
          }
        }
      } else {
        // Playable but no captions configured
        throw new YouTubeFetchError(
          'TRANSCRIPT_DISABLED',
          videoId,
          'This YouTube video does not have closed captions or subtitles enabled.'
        );
      }
    }
  } catch (err) {
    if (err instanceof YouTubeFetchError) throw err;
    // Continue to Tier 2 (microservice / local backend)
  }

  // 3. Tier 2: Check Local or Configured Microservice Endpoints
  const microserviceEndpoints = [
    `/api/youtube/transcript?url=https://www.youtube.com/watch?v=${videoId}`,
    `http://localhost:5001/transcript?url=https://www.youtube.com/watch?v=${videoId}`,
    `http://127.0.0.1:5001/transcript?url=https://www.youtube.com/watch?v=${videoId}`,
    `http://localhost:5002/transcript?url=https://www.youtube.com/watch?v=${videoId}`,
  ];

  for (const ep of microserviceEndpoints) {
    try {
      const res = await fetch(ep, { method: 'GET', headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        if (data && data.transcript && typeof data.transcript === 'string' && data.transcript.trim()) {
          const rawText = data.transcript.trim();

          // If microservice also provided structured entries
          let segments: YouTubeTranscriptSegment[] = [];
          if (Array.isArray(data.entries)) {
            segments = data.entries.map((entry: any) => {
              const start = parseFloat(parseFloat(entry.start || '0').toFixed(2));
              const dur = parseFloat(parseFloat(entry.duration || '0').toFixed(2));
              const end = parseFloat((start + dur).toFixed(2));
              return {
                start,
                duration: dur,
                end,
                text: (entry.text || '').trim(),
                formattedStart: formatTimestamp(start),
                formattedEnd: formatTimestamp(end),
              };
            });
          } else {
            // Synthesize pseudo-segments across sentence chunks
            const sentences = rawText.split(/(?<=[.?!])\s+/).filter(Boolean);
            let currentOffset = 0;
            segments = sentences.map((sent: string) => {
              const estDur = parseFloat((Math.max(2, sent.split(' ').length * 0.4)).toFixed(2));
              const start = parseFloat(currentOffset.toFixed(2));
              const end = parseFloat((start + estDur).toFixed(2));
              currentOffset = end;
              return {
                start,
                duration: estDur,
                end,
                text: sent,
                formattedStart: formatTimestamp(start),
                formattedEnd: formatTimestamp(end),
              };
            });
          }

          const metadata: YouTubeVideoMetadata = {
            videoId,
            title: data.title || oEmbedData.title || `YouTube Video (${videoId})`,
            author: oEmbedData.author || 'YouTube Creator',
            authorUrl: oEmbedData.authorUrl,
            thumbnailUrl: oEmbedData.thumbnailUrl,
            availableLanguages: [data.language || 'en'],
            captionsAvailable: true,
          };

          return {
            videoId,
            title: metadata.title,
            metadata,
            captionType: 'PROVIDER',
            language: data.language || 'en',
            segments,
            rawText,
            normalizedText: rawText,
            version: `${videoId}-${data.language || 'en'}-provider-v1`,
            fetchedAt: Date.now(),
          };
        } else if (data.error === 'no_captions') {
          throw new YouTubeFetchError(
            'TRANSCRIPT_DISABLED',
            videoId,
            'This YouTube video does not have closed captions or subtitles enabled.'
          );
        }
      }
    } catch (err) {
      if (err instanceof YouTubeFetchError) throw err;
      // Continue trying next endpoint
    }
  }

  // 4. All providers failed -> return explicit SOURCE_UNAVAILABLE. NEVER hallucinate!
  throw new YouTubeFetchError(
    'SOURCE_UNAVAILABLE',
    videoId,
    `Unable to acquire official transcript for YouTube video (${videoId}). Closed captions may be disabled or blocked.`
  );
}
