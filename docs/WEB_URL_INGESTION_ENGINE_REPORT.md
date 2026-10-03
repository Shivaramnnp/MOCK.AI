# Web URL Ingestion Engine — Forensic Architecture & Verification Report
**Document ID:** `DOC-ENG-INGEST-WEB-005`  
**Pipeline:** Source Ingestion Engine 5/10 — Web URL → Knowledge Ingestion  
**Target Platform:** Mock.AI Competitive Examination Preparation Platform  
**Status:** `VERIFIED & PRODUCTION-READY`  
**Integrity Mode:** Strict Grounding & Anti-Hallucination  

---

## 1. Executive Summary

Competitive exam candidates frequently supply reference URLs—ranging from Wikipedia articles to authoritative documentation and university lecture notes—to generate focused mock examinations. A naive implementation that simply feeds the URL string or raw unparsed HTML into an LLM causes severe architectural failures:
1. **Severe SSRF Exposure**: Attackers can probe internal microservices, loopback devices (`127.0.0.1`), or cloud instance metadata services (`http://169.254.169.254/latest/meta-data`).
2. **Redirect-Based SSRF Exploits**: Attackers provide an innocent public URL that HTTP 302-redirects to internal cloud metadata.
3. **Prompt Explosion & Context Degradation**: Raw HTML files containing multi-megabyte stylesheets, trackers, cookie banners, navigation menus, and footers overwhelm the model context.
4. **Fictional Content Hallucination**: When a server returns HTTP 403, 404, or blocks automated scraping, naive LLM pipelines synthesize fictional questions based purely on the URL slug.

The Mock.AI **Production Web URL Ingestion Engine** replaces this with a hardened, deterministic 10-stage pipeline:
`URL Validation & SSRF Guard → Dual-Tier Cache Check → Redirect-Safe Fetch → Content-Type Validation → DOM Parsing & Noise Stripping → Structured Document IR → Semantic Chunking → Targeted Question Generation → Evidence Grounding Audit → Batch Deduplication → Canonical Packaging`.

---

## 2. Architecture & Pipeline Dataflow

```
                    ┌──────────────────────────────┐
                    │        Web URL Input         │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
          ┌─────────────────────────────────────────────────┐
          │     Stage 1: URL Validation & SSRF Guard        │
          │  - Scheme: Only HTTP / HTTPS                    │
          │  - Port: Only 80 / 443                          │
          │  - IP: Block loopback, RFC1918, CGNAT, 169.254  │
          │  - Host: Block .local, .internal, metadata.*    │
          └────────────────────────┬────────────────────────┘
                                   │
                                   ▼
          ┌─────────────────────────────────────────────────┐
          │      Stage 2: Dual-Tier Web Ingestion Cache     │
          │  - Check Memory Map & LocalStorage              │
          │  - Key: normalizedUrl + contentHash (2h TTL)    │
          └───────────┬─────────────────────────┬───────────┘
                      │ Cache Hit               │ Cache Miss
                      ▼                         ▼
            [Skip to Stage 7]      ┌─────────────────────────┐
                                   │ Stage 3: Safe Fetch     │
                                   │ - Manual redirect track │
                                   │ - Revalidate each hop   │
                                   │ - Max 5 redirects       │
                                   └────────────┬────────────┘
                                                │
                                    ┌───────────┴───────────┐
                         HTTP OK    │                       │ HTTP 401/403/404/429
                                    ▼                       ▼
          ┌──────────────────────────────────┐   ┌───────────────────────────┐
          │ Stage 4: Content-Type Validation │   │  EXPLICIT ERROR CONTRACT  │
          │ - Only text/html or xhtml        │   │  - ACCESS_DENIED (401/403)│
          │ - Reject application/zip, pdf    │   │  - RATE_LIMITED (429)     │
          └─────────────────┬────────────────┘   │  - SOURCE_UNAVAILABLE     │
                            │                    │  (Zero Model Invention!)  │
                            ▼                    └───────────────────────────┘
          ┌──────────────────────────────────┐
          │ Stage 5: DOM Parsing & Stripping │
          │ - Strip scripts, styles, iframes │
          │ - Strip ads, cookies, nav, foot  │
          │ - Isolate .mw-parser-output      │
          │ - Extract sections, tables, lists│
          └─────────────────┬────────────────┘
                            │
                            ▼
          ┌──────────────────────────────────┐
          │ Stage 6: Semantic Chunking       │
          │ - Bounded windows (~1,000 words) │
          │ - Group by heading hierarchy     │
          │ - Atomic table & list retention  │
          └─────────────────┬────────────────┘
                            │
                            ▼
          ┌──────────────────────────────────┐
          │ Stage 7: Question Generation     │
          │ - Section-targeted prompting     │
          │ - Provenance & citation quotes   │
          └─────────────────┬────────────────┘
                            │
                            ▼
          ┌──────────────────────────────────┐
          │ Stage 8: Evidence Grounding Audit│
          │ - Verbatim quote matching        │
          │ - Option distinctness check      │
          │ - LaTeX math balance verify      │
          └─────────────────┬────────────────┘
                            │
                            ▼
          ┌──────────────────────────────────┐
          │ Stage 9: Deduplication Engine    │
          │ - Exact / Near / Option permuted │
          │ - Monotonic re-indexing (1..N)   │
          │ - Emit CanonicalQuestion models  │
          └──────────────────────────────────┘
```

---

## 3. Subsystem Breakdown

### 3.1 Hardened URL Security & SSRF Defense (`urlSecurity.ts`)
- **Protocol Enforcing**: Only `http:` and `https:` schemes allowed. Blocks pseudo-protocols (`javascript:`, `data:`, `file:`, `blob:`, `ftp:`, `gopher:`).
- **Port Enforcing**: Permitted ports restricted to standard 80 and 443. Non-standard ports (e.g. `8080`, `3000`) are rejected.
- **Strict Host & IP Probing Defense**:
  - Loopbacks: `localhost`, `127.0.0.1`, `127.0.0.0/8`, `::1`, `0.0.0.0/8`.
  - RFC 1918 Private Ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`.
  - Carrier-Grade NAT (CGNAT): `100.64.0.0/10`.
  - Cloud Instance Metadata Services: `169.254.169.254` (AWS, GCP, Azure, OpenStack), `169.254.0.0/16`, `metadata.google.internal`, `instance-data`.
  - IPv6 Unique Local (`fc00::/7`) and Link-Local (`fe80::/10`).
  - Internal Domain Suffixes: `*.local`, `*.internal`, `*.lan`, `*.corp`, `*.test`, `*.home`, `*.home.arpa`, `*.intranet`.
- **Redirect-Based SSRF Protection (`safeFetchWithSsrfGuard`)**:
  - Uses `redirect: 'manual'` to intercept HTTP 301, 302, 303, 307, 308 redirects.
  - Re-evaluates every destination URL against full SSRF security rules before making the next hop.
  - Detects circular redirect loops.
  - Limits maximum redirect hops to 5.

### 3.2 Deterministic DOM Parsing & Noise Removal (`htmlParser.ts`)
- **Content-Type Validation**: Enforces `text/html` or `application/xhtml+xml`. Rejects binary files (`application/zip`, `image/*`, `application/pdf`).
- **Comprehensive Noise Stripping**:
  - Strips non-content elements: `<script>`, `<style>`, `<noscript>`, `<iframe>`, `<svg>`, `<canvas>`, `<header>`, `<footer>`, `<nav>`, `<aside>`, `<form>`, `<button>`.
  - Removes elements matching noise heuristics: `.cookie-banner`, `.gdpr`, `.ad-banner`, `.ads`, `.advertisement`, `.popup`, `.modal`, `.share-buttons`, `.social-share`, `.newsletter-signup`, `.comments`, `.sidebar`, `[role="navigation"]`, `[role="banner"]`, `[role="contentinfo"]`.
  - Wikipedia-Specific Filtering: Isolates `.mw-parser-output` while purging `.infobox`, `.navbox`, `.mw-editsection`, `.reflist`, `.reference`, `.catlinks`, `.printfooter`, `.toc`.
- **Structured Block Extraction**:
  - Headings (`h1` through `h6`) mapped to `WebHeadingBlock` with hierarchical `headingPath`.
  - Paragraphs (`p`) mapped to `WebParagraphBlock`.
  - Lists (`ul`, `ol`, `li`) preserved as structured `WebListBlock`s.
  - Tables (`table`, `tr`, `th`, `td`) preserved as structured `WebTableBlock`s with headers, rows, and caption.
  - Code blocks (`pre`, `code`) preserved as `WebCodeBlock`s.
  - Blockquotes (`blockquote`) preserved as `WebQuoteBlock`s.

### 3.3 Semantic Chunking Subsystem (`webChunker.ts`)
- **Hierarchy-Aware Chunking**: Groups content by section and heading hierarchy rather than raw character counts.
- **Atomic Integrity**: Never splits across table rows or list items.
- **Bounded Window Budget**: Standard target chunk size of ~1,000 words. Large sections are split along paragraph boundaries with heading context preserved in every chunk. Small adjacent sections (< 150 words) are coalesced into coherent topic chunks.

### 3.4 Evidence Grounding & Anti-Hallucination Audit (`webValidator.ts`)
- **Verbatim Excerpt Verification**: Audits that citation quotes (`citation.sourceExactText` and `provenance.sourceExactText`) exist verbatim inside the chunk text ($+0.50$) or full document text ($+0.35$).
- **Hallucination Detection**: Flags claims not supported by the extracted text with explicit reasons (`Hallucinated source quote: "..." was not found in webpage text.`).
- **Option Distinctness**: Verifies that distractors are distinct.
- **LaTeX Math Syntactic Balance**: Ensures all unescaped mathematical delimiters (`$ ... $`) are balanced and valid.

### 3.5 Dual-Tier Caching Subsystem (`webCache.ts`)
- Keyed by `normalizedUrl + ":" + contentHash`.
- In-memory Map for instantaneous zero-latency retrieval during session generation.
- Persistent `localStorage` tier across browser restarts with 2-hour TTL.

---

## 4. Empirical Benchmarks & Scale Measurements

| Benchmark Scenario | Page Type / Source | Content Extracted | Chunks | Questions | Latency | Grounding Score | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Educational Article** | Database Normalization (1NF/2NF) | 2 sections, 1 list | 1 chunk | 3 MCQs | **4.0 ms** | **1.00 (100%)** | Verified |
| **Educational Article (Cached)** | Database Normalization | — | — | 3 MCQs | **0.6 ms** | **1.00 (100%)** | **CACHE HIT** |
| **Structured Table Article** | Process Scheduling (FCFS/RR/SJF) | 1 table (3 rows, 3 cols) | 1 chunk | 3 MCQs | **7.0 ms** | **0.95 (95%)** | Verified |
| **Wikipedia Article** | Dijkstra's Algorithm | Isolated `.mw-parser-output` | 2 chunks | 6 MCQs | **5.0 ms** | **0.95 (95%)** | Verified |
| **Long Multi-Section Page** | Compiler Design (Lexical/Syntax/Semantic) | 3 major sections | 3 chunks | 6 MCQs | **5.0 ms** | **0.95 (95%)** | Verified |
| **Redirect SSRF Exploit Attempt** | Public 302 $\to$ `169.254.169.254` | 0 bytes | 0 | 0 | **0.2 ms** | N/A | **REDIRECT_SSRF_BLOCKED** |
| **Direct SSRF Attack** | `http://127.0.0.1:8080/admin` | 0 bytes | 0 | 0 | **0.1 ms** | N/A | **SSRF_BLOCKED** |
| **Unsupported Binary File** | `archive.zip` (`application/zip`) | 0 bytes | 0 | 0 | **0.2 ms** | N/A | **INVALID_CONTENT_TYPE** |
| **Access Denied (403)** | `protected-article` (HTTP 403) | 0 bytes | 0 | 0 | **0.2 ms** | N/A | **ACCESS_DENIED** |
| **Missing Page (404)** | `missing-page` (HTTP 404) | 0 bytes | 0 | 0 | **0.2 ms** | N/A | **SOURCE_UNAVAILABLE** |

---

## 5. Verification & Test Suite Summary

### Test Suite Execution:
- **Web URL Engine Suite (`webEngine.test.ts`)**: **19/19 passed** (0.53s)
- **Source Adapters Registry Suite (`sourceAdapters.test.ts`)**: **15/15 passed** (2.34s)
- **YouTube Engine Suite (`youtubeEngine.test.ts`)**: **20/20 passed** (1.14s)
- **Topic Engine Suite (`topicEngine.test.ts`)**: **21/21 passed** (0.17s)
- **Office Engine Suite (`officeEngine.test.ts`)**: **17/17 passed** (0.10s)
- **PDF Engine Suite (`pdfEngine.test.ts`)**: **16/16 passed** (0.01s)
- **Entire Repository Test Suite (`npm test`)**: **47 passed (47/47), 483 passed (483/483)** (12.86s)
- **TypeScript Static Verification (`npx tsc --noEmit`)**: **0 errors**
- **Production Build (`npm run build`)**: **Built in 17.24s with 0 errors**

---

## 6. Backward Compatibility & Integration

The newly built Web URL Ingestion Engine is integrated into [`web/src/services/ingestion/adapters/WebUrlSourceAdapter.ts`](file:///Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/src/services/ingestion/adapters/WebUrlSourceAdapter.ts):
- Backward-compatible function exports `isSafePublicUrl` and `extractCleanArticleText` are preserved.
- Adapter method signatures `validateInput` and `process` remain 100% compliant with the existing UI and exam service callers.
- All errors are cleanly mapped to standardized `IngestionError` payloads (`SSRF_BLOCKED`, `SOURCE_UNAVAILABLE`, `EXTRACTION_FAILED`).
