# MOCK.AI — SOURCE INGESTION PERFORMANCE ANALYSIS
**Architectural Scalability & Resource Footprint Audit**  
**Date**: 2026-09-28  
**Scope**: Ingestion concurrency, execution topology, memory bottlenecks, and multi-tier scalability across all 10 sources.  
**Integrity Mode**: Read-Only Audit (Zero Production Code Changes).

---

## 1. Execution Topology & Resource Footprint

The current Mock.AI source ingestion pipeline operates on an **100% Client-Heavy, Zero-Queue Execution Model**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      CURRENT INGESTION TOPOLOGY                        │
├────────────────────────────────────────────────────────────────────────┤
│ • Background Queues:           NONE (No BullMQ, Celery, SQS, or Redis) │
│ • Asynchronous Workers:        NONE (All work is in-band in browser)   │
│ • Server-Side Extraction:      NONE (Client browser reads raw files)   │
│ • Intermediate Result Caching: NONE (Duplicate uploads re-run AI calls)│
│ • Concurrency Control:         NONE (Unbounded simultaneous clicks)    │
│ • Checkpoint Persistence:      NONE (Ingestion lost on tab refresh)    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. In-Depth Operational Bottlenecks

### 2.1 The Base64 Heap Expansion Problem
- When a candidate selects a PDF or image, `SourceSelectorModal.tsx` reads the entire binary into memory using:
  ```typescript
  reader.readAsDataURL(file);
  ```
- **Memory Multiplier**: Base64 encoding inflates binary payload size by **33%**. In JavaScript (V8), storing a 20MB file as a Base64 string requires ~27MB for the string itself, plus intermediate `ArrayBuffer` allocations, plus the JSON serialization buffer for the `fetch()` payload.
- On low-end mobile devices (Android devices with 2GB–3GB RAM), uploading a 15MB textbook chapter triggers aggressive garbage collection, leading to severe frame drops, UI freezes, or mobile browser tab eviction (OOM crash).

### 2.2 Synchronous Main-Thread Blocking
- `ProcessingScreen.tsx` mounts while awaiting `aiService.extractFromBase64File()` or `aiService.generateFromTopic()`.
- While the HTTP `fetch()` itself is asynchronous, response parsing (`JSON.parse()` of an 8,192-token string) and subsequent DOM mapping in `EditorScreen.tsx` executes synchronously on the single JavaScript main thread.
- If an LLM returns a large batch of questions, rendering all question cards and initializing dozens of KaTeX spans concurrently causes visible UI stutter.

### 2.3 Zero Ingestion Caching (Duplicate Extraction Cost)
- If two students in the same study group upload the exact same textbook PDF or request questions for the exact same topic (`"Thermodynamics & Heat Engines"`), Mock.AI has **zero caching mechanisms**:
  - No hash check of file contents (`SHA-256`)
  - No cache lookup in Supabase or Redis
  - No prompt deduplication
- Every single ingestion generates a brand new, full-cost API call to Google Gemini or Groq, resulting in redundant network latency, wasted compute, and amplified API billing.

### 2.4 Retry Amplification Risk
- In `aiService.ts:343-383`:
  ```typescript
  // 1. Try Gemini
  if (geminiKey) { try { ... } catch { ... } }
  // 2. Try Groq
  if (groqKey) { try { ... } catch { ... } }
  // 3. Fallback to smart local generator
  ```
- If Gemini suffers a transient timeout (e.g. 30 seconds), the client waits the full duration, then immediately initiates a second heavy request to Groq, doubling the student's waiting time (up to 60+ seconds) before showing any feedback.

---

## 3. Concurrency & Scalability Projections Across User Tiers

Because Mock.AI currently delegates ingestion processing to the **candidate's own browser and third-party LLM providers**, the platform exhibits a unique scalability profile:

### Tier 1: 100 Concurrent Ingestions
- **Server Impact**: Negligible on Mock.AI's web host (Vite static files are cached by CDN).
- **Client Impact**: Smooth on desktop; occasional OOM crashes on low-end mobile devices uploading PDFs >15MB.
- **Provider Impact**: Google Gemini free-tier rate limits (15 RPM) will immediately trigger HTTP 429 (`ResourceExhausted`) if multiple students generate tests concurrently using a shared project key.

### Tier 2: 1,000 Concurrent Ingestions
- **Provider Quota Saturation**: Shared API keys hit strict rate limits immediately. Without client queuing, 80%+ of students receive failed ingestion screens or fall back to the 8 hardcoded physics questions.
- **Client Bandwidth**: 1,000 mobile devices uploading 10MB Base64 payloads simultaneously generate ~10GB of outbound upstream traffic directly to Gemini endpoints.

### Tier 3: 10,000 Concurrent Ingestions
- **Total Local Storage Saturation**: Each saved test in `localStorage` consumes ~20KB–50KB. Once a user saves 50–100 tests, `localStorage` hits its hard browser limit (typically 5MB per origin), throwing `QuotaExceededError`.
- **Inability to Resume / Network Vulnerability**: At 10,000 concurrent students on mobile networks, network handoffs (Wi-Fi to LTE) during a 20-second Gemini generation call cause connection reset (`ECONNRESET`), requiring full restart of the ingestion process from scratch.

### Tier 4: 100,000 Concurrent Ingestions
- **Architectural Breakdown**: A client-side, key-per-browser architecture cannot operate at enterprise scale:
  1. No global visibility into ingestion quality, failure rates, or content moderation.
  2. No server-side queue to throttle or prioritize VIP/institution workloads.
  3. No distributed storage for visual assets (PDF figures and diagrams cannot be hosted on user `localStorage`).
  4. Enterprise institution firewalls frequently block direct browser calls to `generativelanguage.googleapis.com` or `api.groq.com`, completely disabling test creation.
