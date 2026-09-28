# SOURCE 05 — WEB URL: FORENSIC DISCOVERY REPORT
**MOCK.AI Source Ingestion Algorithm Discovery**  
**Date**: 2026-09-28  
**Scope**: In-depth trace of webpage scraping, HTML DOM parsing, SSRF posture, and URL ingestion.  
**Integrity Mode**: Read-Only Audit (Zero Production Code Changes).

---

## 1. Executive Summary: The Phantom Web Scraper

In the Create Mock Test UI (`SourceSelectorModal.tsx:78-84` and `InputModals.tsx:192-265`), Option 5 is presented as:
> **Web URL** — *"Scrape online article or Wikipedia"*

Our forensic code inspection reveals a **startling implementation truth**:
- **The application does not scrape the webpage at all**.
- There is **no HTTP fetch**, no headless browser (Puppeteer / Playwright), no Cheerio / JSDOM, no Readability.js, and no CORS proxy.
- `web/src/App.tsx` takes the candidate's raw URL string and interpolates it into a prompt:
  ```typescript
  `Webpage Source URL: ${url}\nPlease construct a competitive exam based on the primary subject of this URL.`
  ```
- This string is passed directly to Google Gemini 2.5 Flash.
- **The Result**: The LLM generates questions based entirely on what it guesses the URL is about from the URL text, or from Wikipedia topics in its pre-training dataset. It never reads the actual live webpage HTML, never extracts tables, and never extracts article images.

---

## 2. Technical Pipeline Trace

```
USER INPUT (URL string, e.g. "https://en.wikipedia.org/wiki/Special_relativity")
    ↓
UI COMPONENT (`InputModals.tsx:UrlModal`)
    ↓
VALIDATION (`<input type="url" required />`, `!url.trim()`)
    ↓
DISPATCH (`App.tsx:handleUrlSubmit(url)`)
    ↓
    │  [CRITICAL DISCOVERY: ZERO NETWORK FETCH TO THE TARGET URL!]
    ▼
SYNTHETIC PROMPT CREATION (`App.tsx:515-518`)
    ↓
PASS TO SERVICE: `aiService.ts:extractFromText("Webpage Source URL: https://...", url)`
    ↓
TRUNCATION: `text.slice(0, 15000)` (slices the prompt containing the URL string)
    ↓
REMOTE INFERENCE (`POST /generateContent` to Gemini 2.5 Flash)
    ↓
LLM REASONING: Gemini infers the subject ("Special Relativity") from the URL path
    ↓
NORMALIZATION (`adapterHelpers.ts:parseQuestionsJson()`)
    ↓
CURATION (`EditorScreen.tsx`)
    ↓
PERSISTENCE (`storage.ts:saveTest()` -> `localStorage['mockai_tests']`)
```

---

## 3. Forensic Code Inspection

### 3.1 The Frontend Handler (`web/src/App.tsx:509-530`)

```typescript
  const handleUrlSubmit = async (url: string) => {
    setProcessingStatus(`Fetching content from ${url}...`);
    setProcessingError(null);
    navigateTo('processing');

    try {
      const questions = await aiService.extractFromText(
        `Webpage Source URL: ${url}\nPlease construct a competitive exam based on the primary subject of this URL.`,
        url
      );
      setEditorInitialData({
        title: `Webpage Exam: ${url.replace('https://', '').slice(0, 30)}`,
        category: 'Web Research',
        questions,
        existingTest: null,
      });
      navigateTo('editor');
    } catch (err: any) {
      setProcessingError(err.message || 'Failed to process webpage URL.');
    }
  };
```

### 3.2 Absence of Scraping Infrastructure

We conducted an exhaustive search of `web/package.json` and the entire codebase for web scraping libraries:
- `cheerio`: **NOT INSTALLED**
- `@mozilla/readability`: **NOT INSTALLED**
- `puppeteer` / `playwright`: **NOT INSTALLED**
- `jsdom`: Only in `devDependencies` for Vitest unit test environment (`jsdom: ^30.1.0`), never imported in runtime application code.
- `fetch(url)`: No network call to the target URL exists anywhere in `App.tsx` or `aiService.ts`.

---

## 4. Technical Analysis: The Consequences of URL-Only Ingestion

| Webpage Feature | Expected Behavior | Current Mock.AI Behavior |
|---|---|---|
| **Article Main Body** | Extract core prose, strip ads/navbars. | **Not extracted**. AI guesses from URL keywords. |
| **Data Tables** | Parse `<table>`, extract rows/columns. | **100% ignored**. |
| **Article Images** | Extract relevant infographics, diagrams. | **100% ignored**. |
| **Dynamic JS Content** | Render single-page application (SPA). | **Cannot access**. |
| **Paywalled / Private Pages**| Respect paywalls or fail cleanly. | Generates generic questions based on URL slug. |
| **Robots.txt & Rate Limits** | Check robots.txt, apply polite delays. | N/A (no scraper exists). |
| **SSRF Surface** | Strict IP/domain filtering required. | Currently passive (no requests issued). |

### Real-World Failure Scenario
1. A professor creates a course page: `https://university.edu/courses/phy301/lecture-notes-2026.html`.
2. A student pastes this URL into Mock.AI.
3. Because this URL is private/new, Gemini has never seen it in training data.
4. Gemini sees the prompt:
   `"Webpage Source URL: https://university.edu/courses/phy301/lecture-notes-2026.html\nPlease construct a competitive exam based on the primary subject of this URL."`
5. Gemini guesses that `"phy301"` might be physics, and produces generic introductory physics questions that have **zero correlation** with the professor's actual lecture notes!

---

## 5. Current Algorithm (Step-by-Step Sequence)

1. User clicks "Web URL" in `SourceSelectorModal.tsx`.
2. `UrlModal.tsx` opens with an input: `<input type="url" placeholder="https://en.wikipedia.org/wiki/..." />`.
3. User enters a URL and clicks "Process Webpage".
4. `UrlModal` checks `if (!url.trim()) return;`, calls `onSubmit(url.trim())`, and closes.
5. `App.tsx:handleUrlSubmit(url)` sets status `"Fetching content from [url]..."` and navigates to `'processing'`.
6. `App.tsx` string-interpolates `url` into a prompt template.
7. `aiService.extractFromText()` slices the prompt to 15,000 characters and appends `EXTRACTION_SYSTEM_PROMPT`.
8. Browser issues a `POST` request to Google Gemini 2.5 Flash.
9. Gemini guesses the topic and returns JSON questions.
10. `parseQuestionsJson()` normalizes the questions into `Question[]`.
11. `App.tsx` truncates the URL to 30 characters for the title (`title: "Webpage Exam: ..."`).
12. User reviews questions in `EditorScreen.tsx` and saves to `localStorage`.

---

## 6. Forensic Evaluation & Improvement Recommendations

| Dimension | Assessment |
|---|---|
| **Strengths** | Works quickly for famous Wikipedia URLs where the topic name is explicit in the URL path. |
| **Weaknesses** | It is not a web scraper; it does not read the webpage content; complete hallucination on private, new, or unindexed URLs; zero table/image extraction; zero article citations. |
| **Root Causes** | Complete lack of an HTML fetching and content extraction pipeline (e.g. Mozilla Readability, headless browser, or proxy scraper). |
| **Missing Components** | Backend scraping service with headless Chrome / Readability.js; SSRF firewall (blocking `localhost`, `169.254.169.254`, private subnets); article text chunker; table and image extractor. |
| **Security Risks** | High prompt injection vulnerability if query parameters in the URL contain prompt override attacks; massive SSRF vulnerability if a naive `fetch(url)` is implemented without strict IP validation. |
| **Data-Fidelity Risks** | Near-total disconnect between the actual text on the webpage and the questions generated by the AI. |
