/**
 * HTML Parser & Structured Content Extractor
 * Deterministically parses HTML into structured sections, headings, tables, lists, and clean text.
 * Strips ads, cookies, navigations, sidebars, and tracking noise while preserving pedagogical content.
 */

import {
  WebContentBlock,
  WebDocumentIR,
  WebHeadingBlock,
  WebImageBlock,
  WebListBlock,
  WebPageMetadata,
  WebParagraphBlock,
  WebQuoteBlock,
  WebSection,
  WebTableBlock,
} from './types';

/**
 * Validates that the Content-Type header indicates extractable HTML content.
 */
export function validateContentType(contentType?: string): { valid: boolean; reason?: string } {
  if (!contentType) return { valid: true }; // Permissive if missing

  const lower = contentType.toLowerCase().split(';')[0].trim();
  const validTypes = new Set(['text/html', 'application/xhtml+xml', 'text/plain']);

  if (validTypes.has(lower)) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: `Unsupported Content-Type "${lower}". Web URL ingestion requires HTML documents. Binary or media files are not supported.`,
  };
}

/**
 * Computes a fast deterministic 64-bit FNV-1a content hash.
 */
export function computeContentHash(content: string): string {
  let hash1 = 0x811c9dc5;
  let hash2 = 0x84222325;
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    hash1 = (hash1 ^ code) * 0x01000193;
    hash2 = (hash2 ^ (code >> 4)) * 0x01000193;
  }
  return `${(hash1 >>> 0).toString(16).padStart(8, '0')}${(hash2 >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Decodes standard HTML entities.
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Deterministically strips HTML tags, comments, script, style, navigation, and noise.
 * Backward-compatible helper.
 */
export function extractCleanArticleText(html: string): { title: string; text: string } {
  if (!html) return { title: 'Webpage', text: '' };

  const parsed = parseWebHtml(html, 'https://example.com');
  return {
    title: parsed.metadata.title,
    text: parsed.fullCleanText,
  };
}

/**
 * Parses raw HTML into a structured WebDocumentIR preserving sections, headings, tables, and lists.
 */
export function parseWebHtml(rawHtml: string, url: string): WebDocumentIR {
  const contentHash = computeContentHash(rawHtml);

  // In browser or Vitest jsdom environment, utilize DOMParser
  if (typeof DOMParser !== 'undefined') {
    return parseViaDOM(rawHtml, url, contentHash);
  }

  // Fallback for non-DOM environments
  return parseViaRegex(rawHtml, url, contentHash);
}

// Noise selectors to strip out of the DOM
const NOISE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'canvas',
  'header',
  'footer',
  'nav',
  'aside',
  'form',
  'button',
  '.navbox',
  '.mw-editsection',
  '.reflist',
  '.reference',
  '.catlinks',
  '.printfooter',
  '.toc',
  '.infobox',
  '.advertisement',
  '.ad-banner',
  '.ads',
  '.cookie-banner',
  '.cookie-consent',
  '.gdpr',
  '.popup',
  '.modal',
  '.share-buttons',
  '.social-share',
  '.newsletter-signup',
  '.comments',
  '.sidebar',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="alert"]',
  '[aria-hidden="true"]',
];

function parseViaDOM(rawHtml: string, url: string, contentHash: string): WebDocumentIR {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');

  // 1. Extract metadata
  const title =
    doc.querySelector('title')?.textContent?.trim() ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    'Webpage';

  const description =
    doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim();

  const author =
    doc.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[name="twitter:creator"]')?.getAttribute('content')?.trim();

  const siteName =
    doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.trim() ||
    new URL(url).hostname;

  // 2. Remove noise nodes
  for (const selector of NOISE_SELECTORS) {
    const nodes = doc.querySelectorAll(selector);
    nodes.forEach((n) => n.remove());
  }

  // 3. Find main content container
  const mainContainer: Element =
    doc.querySelector('.mw-parser-output') || // Wikipedia content container
    doc.querySelector('main') ||
    doc.querySelector('article') ||
    doc.querySelector('[role="main"]') ||
    doc.querySelector('#content') ||
    doc.querySelector('.post-content') ||
    doc.querySelector('.entry-content') ||
    doc.querySelector('.article-body') ||
    doc.body;

  // 4. Extract structured blocks and sections
  const sections: WebSection[] = [];
  let currentHeading = title;
  let currentLevel = 1;
  const currentHeadingPath = [title];
  let currentBlocks: WebContentBlock[] = [];
  let sectionIndex = 1;
  let tableCount = 0;
  let listCount = 0;
  let imageCount = 0;

  function flushSection() {
    if (currentBlocks.length === 0) return;
    const cleanSectionText = currentBlocks
      .map((b) => {
        if (b.type === 'heading') return `\n## ${b.text}\n`;
        if (b.type === 'paragraph') return b.text;
        if (b.type === 'list') return b.items.map((it) => `- ${it}`).join('\n');
        if (b.type === 'table') {
          return `${b.headers.join(' | ')}\n${b.rows.map((r) => r.join(' | ')).join('\n')}`;
        }
        if (b.type === 'code') return b.code;
        if (b.type === 'quote') return `> ${b.text}`;
        return '';
      })
      .filter(Boolean)
      .join('\n\n')
      .trim();

    const wordCount = cleanSectionText.split(/\s+/).filter(Boolean).length;
    sections.push({
      sectionId: `sec-${sectionIndex++}`,
      heading: currentHeading,
      level: currentLevel,
      headingPath: [...currentHeadingPath],
      blocks: [...currentBlocks],
      cleanText: cleanSectionText,
      wordCount,
    });
    currentBlocks = [];
  }

  // Traverse direct content elements
  const elements = mainContainer.querySelectorAll('h1, h2, h3, h4, h5, h6, p, ul, ol, table, blockquote, pre');

  elements.forEach((el) => {
    const tagName = el.tagName.toLowerCase();

    // Headings
    if (/^h[1-6]$/.test(tagName)) {
      const level = parseInt(tagName[1], 10);
      const text = el.textContent?.trim() || '';
      if (!text || text.length < 2) return;

      flushSection();

      currentHeading = text;
      currentLevel = level;

      // Adjust heading path
      while (currentHeadingPath.length >= level) {
        currentHeadingPath.pop();
      }
      currentHeadingPath.push(text);

      const headingBlock: WebHeadingBlock = {
        type: 'heading',
        level,
        text,
        id: el.id || undefined,
      };
      currentBlocks.push(headingBlock);
      return;
    }

    // Paragraphs
    if (tagName === 'p') {
      const text = el.textContent?.trim() || '';
      if (text.length >= 15) {
        currentBlocks.push({ type: 'paragraph', text });
      }
      return;
    }

    // Lists
    if (tagName === 'ul' || tagName === 'ol') {
      const items: string[] = [];
      el.querySelectorAll('li').forEach((li) => {
        const itemText = li.textContent?.trim();
        if (itemText && itemText.length > 2) {
          items.push(itemText);
        }
      });
      if (items.length > 0) {
        listCount++;
        currentBlocks.push({
          type: 'list',
          ordered: tagName === 'ol',
          items,
        });
      }
      return;
    }

    // Tables
    if (tagName === 'table') {
      const headers: string[] = [];
      const rows: string[][] = [];

      // Check for th headers
      el.querySelectorAll('tr').forEach((tr, rIdx) => {
        const rowCells: string[] = [];
        const ths = tr.querySelectorAll('th');
        const tds = tr.querySelectorAll('td');

        if (ths.length > 0 && headers.length === 0) {
          ths.forEach((th) => headers.push(th.textContent?.trim() || ''));
        } else {
          const cells = ths.length > 0 ? ths : tds;
          cells.forEach((td) => rowCells.push(td.textContent?.trim() || ''));
          if (rowCells.some((c) => c.length > 0)) {
            rows.push(rowCells);
          }
        }
      });

      if (rows.length > 0 || headers.length > 0) {
        tableCount++;
        const caption = el.querySelector('caption')?.textContent?.trim();
        currentBlocks.push({
          type: 'table',
          headers,
          rows,
          caption,
        });
      }
      return;
    }

    // Code Blocks
    if (tagName === 'pre') {
      const code = el.textContent?.trim() || '';
      if (code.length >= 10) {
        currentBlocks.push({ type: 'code', code });
      }
      return;
    }

    // Quotes
    if (tagName === 'blockquote') {
      const text = el.textContent?.trim() || '';
      if (text.length >= 10) {
        currentBlocks.push({ type: 'quote', text });
      }
      return;
    }
  });

  // Flush remaining blocks
  flushSection();

  // If no sections were produced (e.g. flat paragraph document without h1-h6 tags)
  if (sections.length === 0) {
    const rawText = mainContainer.textContent?.trim() || '';
    const paragraphs = rawText
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20);

    const blocks: WebContentBlock[] = paragraphs.map((p) => ({
      type: 'paragraph',
      text: p,
    }));

    sections.push({
      sectionId: 'sec-1',
      heading: title,
      level: 1,
      headingPath: [title],
      blocks,
      cleanText: paragraphs.join('\n\n'),
      wordCount: rawText.split(/\s+/).filter(Boolean).length,
    });
  }

  const fullCleanText = sections.map((s) => s.cleanText).join('\n\n');
  const wordCount = fullCleanText.split(/\s+/).filter(Boolean).length;

  const metadata: WebPageMetadata = {
    url,
    canonicalUrl: url,
    title,
    description,
    author,
    siteName,
    retrievedAt: Date.now(),
    contentHash,
    contentLength: rawHtml.length,
    httpStatus: 200,
  };

  return {
    metadata,
    sections,
    fullCleanText,
    wordCount,
    tableCount,
    listCount,
    imageCount,
  };
}

/**
 * Fallback regex-based parser when DOMParser is unavailable in pure Node.
 */
function parseViaRegex(html: string, url: string, contentHash: string): WebDocumentIR {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : 'Webpage';

  let clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');

  clean = decodeHtmlEntities(clean).replace(/\s+/g, ' ').trim();
  const wordCount = clean.split(/\s+/).filter(Boolean).length;

  const metadata: WebPageMetadata = {
    url,
    canonicalUrl: url,
    title,
    retrievedAt: Date.now(),
    contentHash,
    contentLength: html.length,
    httpStatus: 200,
  };

  const section: WebSection = {
    sectionId: 'sec-1',
    heading: title,
    level: 1,
    headingPath: [title],
    blocks: [{ type: 'paragraph', text: clean }],
    cleanText: clean,
    wordCount,
  };

  return {
    metadata,
    sections: [section],
    fullCleanText: clean,
    wordCount,
    tableCount: 0,
    listCount: 0,
    imageCount: 0,
  };
}
